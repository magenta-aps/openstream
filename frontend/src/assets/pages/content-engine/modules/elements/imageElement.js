// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import {
  parentOrgID,
  queryParams,
  selectedBranchID,
  token,
  showToast,
} from "../../../../utils/utils.js";
import { selectElement } from "../core/elementSelector.js";
import { loadSlide } from "../core/renderSlide.js";
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { getNewZIndex } from "../utils/domUtils.js";
import { displayMediaModal } from "../modals/mediaModal.js";
import { GridUtils } from "../config/gridConfig.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";

// Define image extensions list locally
const imageExtensionsList = ["png", "jpeg", "jpg", "svg", "pdf", "webp"];

function addImageElementToSlide(imageId) {
  if (
    window.selectedElementForUpdate &&
    window.selectedElementForUpdate.element &&
    window.selectedElementForUpdate.element.type === "image"
  ) {
    // push state
    pushCurrentSlideState();
    window.selectedElementForUpdate.element.content = imageId;
    const img = window.selectedElementForUpdate.container.querySelector("img");
    if (img) {
      fetch(
        `${BASE_URL}/api/documents/file-token/${imageId}/?branch_id=${selectedBranchID}&organisation_id=${parentOrgID}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      )
        .then((resp) => resp.json())
        .then((data) => {
          img.src = data.file_url;
        })
        .catch((err) => console.error("Failed to load image:", err));
    }
    window.selectedElementForUpdate = null;
  } else {
    if (store.currentSlideIndex === -1) {
      showToast(gettext("Please select a slide first!"), "Info");
      return;
    }
    pushCurrentSlideState();
    const newImage = {
      id: store.elementIdCounter++,
      type: "image",
      content: imageId,
      gridX: GridUtils.getCenteredPosition(100, 100).x,
      gridY: GridUtils.getCenteredPosition(100, 100).y,
      gridWidth: 100,
      gridHeight: 100,
      backgroundColor: "transparent",
      zIndex: getNewZIndex(),
      sizingMode: "scaled",
      objectPosition: "center center", // Default object position
      originSlideIndex: store.currentSlideIndex, // Track which slide this element was created on
      isLocked: false, // Initialize lock state
      isHidden: false, // Initialize visibility state
    };
    store.slides[store.currentSlideIndex].elements.push(newImage);

    loadSlide(store.slides[store.currentSlideIndex]);

    selectElement(document.getElementById("el-" + newImage.id), newImage);
  }
}

export function initImageElement() {
  initImageEventListeners();
}

function initImageEventListeners() {
  document.getElementById("change-image")?.addEventListener("click", () => {
    // Ensure we are actually selecting an element to update
    if (
      window.selectedElementForUpdate &&
      window.selectedElementForUpdate.element.type === "image"
    ) {
      // Pass the image-specific callback and image filters
      displayMediaModal(
        1,
        addImageElementToSlide,
        {
          file_types: imageExtensionsList,
        },
        gettext("Image"),
      );
    } else {
      showToast(gettext("Please select an image element first!"), "Info");
    }
  });

  document
    .querySelector('[data-type="image"]')
    ?.addEventListener("click", () => {
      window.selectedElementForUpdate = null;
      if (store.currentSlideIndex === -1) {
        showToast(gettext("Please select a slide first!"), "Info");
        return;
      }
      // Pass the image-specific callback and image filters
      displayMediaModal(
        1,
        addImageElementToSlide,
        {
          file_types: imageExtensionsList,
        },
        gettext("Image"),
      );
    });

  const radioBtns = document.querySelectorAll('[name="imageSize"]');

  radioBtns.forEach((radioBtn) => {
    radioBtn.addEventListener("change", () => {
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element.type === "image"
      ) {
        pushCurrentSlideState(); // Push state before making changes
        window.selectedElementForUpdate.element.sizingMode = radioBtn.value;
        const img =
          window.selectedElementForUpdate.container.querySelector("img");
        if (img) {
          img.style.objectFit =
            radioBtn.value === "scaled"
              ? "contain"
              : radioBtn.value === "stretch"
                ? "fill"
                : "none";
        }
      }
    });
  });
}

// Helper function used by the rendering engine in renderSlide.js
export function _renderImage(el, container) {
  const img = document.createElement("img");
  img.style.width = "100%";
  img.style.height = "100%";

  // Use 'contain' for 'scaled', 'fill' for 'stretch', 'none' for 'original'
  img.style.objectFit =
    el.sizingMode === "scaled"
      ? "contain"
      : el.sizingMode === "stretch"
        ? "fill"
        : "none";
  if (!el.sizingMode) {
    el.sizingMode = "scaled"; // Default if missing
    img.style.objectFit = "contain";
  }

  img.style.objectPosition = el.objectPosition || "center center";
  if (!el.objectPosition) {
    el.objectPosition = "center center";
  }

  if (el.content) {
    const apiKey = queryParams.apiKey;

    const headers = { "Content-Type": "application/json" };
    if (apiKey) {
      headers["X-API-KEY"] = apiKey;
    } else if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    fetch(
      `${BASE_URL}/api/documents/file-token/${el.content}/?branch_id=${selectedBranchID}&id=${queryParams.displayWebsiteId}&organisation_id=${parentOrgID}`,
      { method: "GET", headers },
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.file_url) {
          img.src = data.file_url;
        } else {
          console.error("Thumb: Failed to get image URL:", data);
        }
      })
      .catch((err) => console.error("Thumb: Failed to load image:", err));
  } else {
    console.warn("Image element has no content ID:", el.id);
  }
  container.appendChild(img);
}

export function setupImageSizeMode() {
  const radioBtns = document.querySelectorAll('[name="imageSize"]');
  const currentMode =
    window.selectedElementForUpdate?.element?.sizingMode || "scaled";

  radioBtns.forEach((radioBtn) => {
    radioBtn.checked = radioBtn.value === currentMode;
  });
}
