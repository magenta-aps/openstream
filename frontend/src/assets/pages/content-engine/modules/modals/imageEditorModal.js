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

    const existingImg = currentElementContext.container?.querySelector("img");
    if (!existingImg || !existingImg.complete || !existingImg.naturalWidth) {
      throw new Error("Image not ready");
    }
    const documentMetaPromise = fetchDocumentMeta(contentId);
    const base64Image = extractBase64FromImg(existingImg);
    const documentMeta = await documentMetaPromise;
    currentDocumentMeta = documentMeta;
    const imageName = documentMeta?.title || `image-${contentId}`;

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

function extractBase64FromImg(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d").drawImage(img, 0, 0);
  return canvas.toDataURL("image/png");
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
      `${BASE_URL}/api/documents/${documentId}/?branch_id=${selectedBranchID}&organisation_id=${parentOrgID}&title_only=true`,
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

async function fetchImageFileUrl(documentId) {
  const data = await genericFetch(
    `${BASE_URL}/api/documents/file-token/${documentId}/?branch_id=${selectedBranchID}&organisation_id=${parentOrgID}&id=${queryParams.displayWebsiteId || ""}`,
    "GET",
  );
  return data?.file_url;
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
      img.crossOrigin = "anonymous";
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

