// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "tui-image-editor/dist/tui-image-editor.css";
import "tui-color-picker/dist/tui-color-picker.css";
import ImageEditor from "tui-image-editor";
import * as bootstrap from "bootstrap";
import { BASE_URL } from "../../../../utils/constants.js";
import {
  genericFetch,
  parentOrgID,
  queryParams,
  selectedBranchID,
  showToast,
  token,
} from "../../../../utils/utils.js";
import { gettext } from "../../../../utils/locales.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";

let modalEl = null;
let bsModal = null;
let editorRoot = null;
let loadingOverlay = null;
let loadingTextEl = null;
let editorInstance = null;
let currentElementContext = null;
let currentDocumentMeta = null;

export function initImageEditorModal() {
  modalEl = document.getElementById("imageEditorModal");
  if (!modalEl) {
    return;
  }

  bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  editorRoot = modalEl.querySelector("#tui-image-editor-root");
  loadingOverlay = modalEl.querySelector("#image-editor-loading");
  loadingTextEl = modalEl.querySelector("#image-editor-loading-text");

  const saveBtn = modalEl.querySelector("#imageEditorSaveBtn");
  saveBtn?.addEventListener("click", handleSaveEditedImage);

  modalEl.addEventListener("shown.bs.modal", () => {
    editorInstance?.ui?.resizeEditor();
  });

  modalEl.addEventListener("hidden.bs.modal", () => {
    destroyEditor();
    currentElementContext = null;
    currentDocumentMeta = null;
    setLoadingState(false);
  });
}

export async function openImageEditorForElement(elementContext) {
  if (!modalEl || !bsModal) {
    showToast(gettext("Image editor is not available."), "Error");
    return;
  }

  const contentId = elementContext?.element?.content;
  if (!contentId) {
    showToast(gettext("Please select an image with uploaded media first."), "Warning");
    return;
  }

  currentElementContext = elementContext;

  try {
    setLoadingState(true, gettext("Preparing editor..."));
    bsModal.show();

    const [imageUrl, documentMeta] = await Promise.all([
      fetchImageFileUrl(contentId),
      fetchDocumentMeta(contentId),
    ]);

    currentDocumentMeta = documentMeta;
    const imageName = documentMeta?.title || `image-${contentId}`;

    // Fetch image and convert to base64 - this fixes the menu buttons not working
    // when using loadImageFromURL with remote images (known issue #942)
    const base64Image = await fetchImageAsBase64(imageUrl);

    createEditorInstance(base64Image, imageName);

    editorInstance.clearUndoStack();
    editorInstance.ui?.resizeEditor();
    setLoadingState(false);
  } catch (error) {
    console.error("Failed to open image editor", error);
    showToast(gettext("Failed to open image editor."), "Error");
    setLoadingState(false);
    bsModal.hide();
  }
}

async function handleSaveEditedImage() {
  if (!editorInstance || !currentElementContext) {
    return;
  }

  try {
    setLoadingState(true, gettext("Saving edited image..."));
    const dataUrl = editorInstance.toDataURL({ format: "png" });
    const blob = dataURLToBlob(dataUrl);
    if (!blob) {
      throw new Error("Failed to generate image blob");
    }

    const savedDocument = await uploadEditedImage(blob);
    if (!savedDocument?.id) {
      throw new Error("Missing edited image id");
    }

    pushCurrentSlideState();
    await updateElementContent(savedDocument.id);
    showToast(gettext("Image updated"), "Success");
    bsModal.hide();
  } catch (error) {
    console.error("Failed to save edited image", error);
    showToast(gettext("Failed to save edited image."), "Error");
  } finally {
    setLoadingState(false);
  }
}

function createEditorInstance(base64Image, imageName) {
  // Destroy existing instance if any - we need to recreate with new image
  if (editorInstance) {
    editorInstance.destroy();
    editorInstance = null;
  }

  if (!editorRoot) {
    return;
  }

  // Clear the container
  editorRoot.innerHTML = "";

  // Load the image via loadImage option instead of loadImageFromURL
  // This fixes the menu buttons not working (GitHub issue #942)
  editorInstance = new ImageEditor(editorRoot, {
    includeUI: {
      loadImage: {
        path: base64Image,
        name: imageName || "image",
      },
      menu: [
        "crop",
        "flip",
        "rotate",
        "draw",
        "shape",
        "icon",
        "mask",
        "filter",
      ],
      initMenu: "filter",
      uiSize: {
        width: "100%",
        height: "100%",
      },
      menuBarPosition: "bottom",
      // Hide the Load and Download buttons in the header
      theme: {
        "loadButton.display": "none",
        "downloadButton.display": "none",
      },
    },
    cssMaxWidth: 1200,
    cssMaxHeight: 900,
    usageStatistics: false,
    selectionStyle: {
      cornerSize: 20,
      rotatingPointOffset: 70,
    },
  });
}

function destroyEditor() {
  if (editorInstance) {
    editorInstance.destroy();
    editorInstance = null;
  }
  if (editorRoot) {
    editorRoot.innerHTML = "";
  }
}

async function fetchDocumentMeta(documentId) {
  try {
    return await genericFetch(
      `${BASE_URL}/api/documents/${documentId}/?branch_id=${selectedBranchID}&organisation_id=${parentOrgID}`,
      "GET",
    );
  } catch (error) {
    if (error?.status && [404, 405].includes(error.status)) {
      return null;
    }
    console.warn("Failed to fetch document metadata", error);
    return null;
  }
}

async function fetchImageFileUrl(documentId) {
  const headers = buildAuthHeaders();
  const url = `${BASE_URL}/api/documents/file-token/${documentId}/?branch_id=${selectedBranchID}&organisation_id=${parentOrgID}&id=${queryParams.displayWebsiteId || ""}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch file token (${response.status})`);
  }
  const data = await response.json();
  if (!data?.file_url) {
    throw new Error("No file_url returned for document");
  }
  return data.file_url;
}

async function fetchImageAsBase64(imageUrl) {
  const response = await fetch(imageUrl, { mode: "cors" });
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status})`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(blob);
  });
}

async function uploadEditedImage(blob) {
  const titleBase = sanitizeTitle(currentDocumentMeta?.title);
  const timestamp = Date.now();
  const finalTitle = `${titleBase}-edited-${timestamp}`;
  const formData = new FormData();
  formData.append("branch_id", selectedBranchID);
  formData.append("title", finalTitle);

  const fileName = `${finalTitle}.png`;
  const mimeType = blob.type || "image/png";
  const file = new File([blob], fileName, { type: mimeType });
  formData.append("file", file);

  return genericFetch(
    `${BASE_URL}/api/documents/?branch_id=${selectedBranchID}&organisation_id=${parentOrgID}`,
    "POST",
    formData,
  );
}

async function updateElementContent(newDocumentId) {
  if (!currentElementContext) {
    return;
  }
  currentElementContext.element.content = newDocumentId;
  const img = currentElementContext.container?.querySelector("img");
  try {
    const newUrl = await fetchImageFileUrl(newDocumentId);
    if (img) {
      img.src = newUrl;
    }
  } catch (error) {
    console.warn("Failed to refresh edited image preview", error);
  }
}

function setLoadingState(isActive, message) {
  if (!loadingOverlay) {
    return;
  }
  if (message && loadingTextEl) {
    loadingTextEl.textContent = message;
  }
  loadingOverlay.classList.toggle("d-none", !isActive);
}

function dataURLToBlob(dataUrl) {
  if (!dataUrl) {
    return null;
  }
  const parts = dataUrl.split(",");
  if (parts.length < 2) {
    return null;
  }
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(parts[1]);
  const len = binary.length;
  const buffer = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }
  return new Blob([buffer], { type: mime });
}

function sanitizeTitle(rawTitle) {
  const fallback = gettext("edited-image");
  const trimmed = (rawTitle || fallback).trim();
  const cleaned = trimmed.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
  return cleaned || fallback;
}

function buildAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (queryParams.apiKey) {
    headers["X-API-KEY"] = queryParams.apiKey;
  } else if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}
