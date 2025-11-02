// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { loadSlide, scaleAllSlides } from "./renderSlide.js";
import { saveSlideshow, showSavingStatus } from "./slideshowDataManager.js";
import { queryParams } from "../../../../utils/utils.js";
import { fetchUnifiedTemplates, getCurrentAspectRatio } from "./addSlide.js";
import { updateAllSlidesZoom } from "../utils/zoomController.js";
import * as bootstrap from "bootstrap";
import {
  DISPLAYABLE_ASPECT_RATIOS,
  ORIENTATION,
  getAspectRatiosByOrientation,
} from "../../../../utils/availableAspectRatios.js";

function getAspectRatiosForOrientation(orientation) {
  if (orientation === ORIENTATION.LANDSCAPE) {
    return getAspectRatiosByOrientation(ORIENTATION.LANDSCAPE);
  }

  if (orientation === ORIENTATION.PORTRAIT) {
    return getAspectRatiosByOrientation(ORIENTATION.PORTRAIT);
  }

  if (orientation === ORIENTATION.SQUARE) {
    return getAspectRatiosByOrientation(ORIENTATION.SQUARE);
  }

  return DISPLAYABLE_ASPECT_RATIOS;
}

function renderResolutionOptions() {
  const containers = document.querySelectorAll(".js-resolution-options");

  containers.forEach((container) => {
    const orientation = container.getAttribute("data-orientation");
    const ratios = getAspectRatiosForOrientation(orientation);

    container.innerHTML = "";

    ratios.forEach((ratio) => {
      const option = document.createElement("div");
      option.className =
        "resolution-option d-flex justify-content-center align-items-center border bg-light fw-bold fs-5";
      option.setAttribute("data-width", ratio.width);
      option.setAttribute("data-height", ratio.height);
      option.setAttribute("data-ratio", ratio.value);
  option.setAttribute("data-small-preview-width", ratio.smallMenuPreviewWidth);
  option.setAttribute("data-small-preview-height", ratio.smallMenuPreviewHeight);
  option.setAttribute("data-medium-preview-width", ratio.mediumMenuPreviewWidth);
  option.setAttribute("data-medium-preview-height", ratio.mediumMenuPreviewHeight);
      option.title = ratio.label;

      if (
        ratio.mediumMenuPreviewWidth !== undefined &&
        ratio.mediumMenuPreviewHeight !== undefined
      ) {
        option.style.width = `${ratio.mediumMenuPreviewWidth}px`;
        option.style.height = `${ratio.mediumMenuPreviewHeight}px`;
      }

      option.textContent = ratio.value;
      container.appendChild(option);
    });

    const section = container.parentElement;
    if (section) {
      section.classList.toggle("d-none", ratios.length === 0);
    }
  });
}

export function initVirtualPreviewResolution() {
  renderResolutionOptions();

  let selectedResolution = {
    width: store.emulatedWidth || undefined,
    height: store.emulatedHeight || undefined,
  };

  const options = document.querySelectorAll(".resolution-option");
  const allowAspectRatioChanges = queryParams.mode !== "suborg_templates";

  options.forEach((option) => {
    const optionWidth = parseInt(option.getAttribute("data-width"), 10);
    const optionHeight = parseInt(option.getAttribute("data-height"), 10);

    if (!store.emulatedWidth && !store.emulatedHeight) {
      store.emulatedHeight = 1080;
      store.emulatedWidth = 1920;
    }

    if (
      optionWidth === Number(store.emulatedWidth) &&
      optionHeight === Number(store.emulatedHeight)
    ) {
      option.classList.add("active");
    } else {
      option.classList.remove("active");
    }

    if (!allowAspectRatioChanges) {
      option.classList.add("disabled", "pe-none");
      option.setAttribute("aria-disabled", "true");
      option.style.pointerEvents = "none";
    }
  });

  // Initialize aspect ratio value display
  const currentAspectRatio = getCurrentAspectRatio();
  const aspectRatioValueElement = document.getElementById("aspect-ratio-value");
  if (aspectRatioValueElement) {
    aspectRatioValueElement.innerText = currentAspectRatio;
  }

  if (allowAspectRatioChanges) {
    options.forEach((option) => {
      option.addEventListener("click", () => {
        options.forEach((opt) => opt.classList.remove("active"));
        option.classList.add("active");
        selectedResolution = {
          width: parseInt(option.getAttribute("data-width"), 10),
          height: parseInt(option.getAttribute("data-height"), 10),
        };
      });
    });
  }

  const saveResolutionBtn = document.getElementById("saveResolutionBtn");
  if (saveResolutionBtn) {
    if (allowAspectRatioChanges) {
      saveResolutionBtn.addEventListener("click", async () => {
        updateResolution(selectedResolution);
      });
    } else {
      saveResolutionBtn.setAttribute("disabled", "disabled");
      saveResolutionBtn.classList.add("disabled");
    }
  }

  if (!allowAspectRatioChanges) {
    const aspectRatioButton = document.querySelector(
      "#aspect-ratio-container button",
    );
    if (aspectRatioButton) {
      aspectRatioButton.setAttribute("disabled", "disabled");
      aspectRatioButton.classList.add("disabled");
      aspectRatioButton.removeAttribute("data-bs-toggle");
      aspectRatioButton.removeAttribute("data-bs-target");
    }
  }

  // Update resolution modal selection when it's shown
  const resolutionModal = document.getElementById("resolutionModal");
  if (resolutionModal && allowAspectRatioChanges) {
    resolutionModal.addEventListener("show.bs.modal", () => {
      updateResolutionModalToCurrentState();
    });
  }
}

/**
 * Update the resolution modal to reflect current emulated dimensions
 */
export function updateResolutionModalToCurrentState() {
  const options = document.querySelectorAll(".resolution-option");
  options.forEach((option) => {
    const optionWidth = parseInt(option.getAttribute("data-width"), 10);
    const optionHeight = parseInt(option.getAttribute("data-height"), 10);

    if (
      optionWidth === store.emulatedWidth &&
      optionHeight === store.emulatedHeight
    ) {
      option.classList.add("active");
    } else {
      option.classList.remove("active");
    }
  });
}

export async function updateResolution(selectedResolution) {
  {
    store.showGrid = document.getElementById("showGrid").checked;
    const nextWidth = Number(selectedResolution.width);
    const nextHeight = Number(selectedResolution.height);

    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight)) {
      console.warn("updateResolution: invalid resolution", selectedResolution);
      return;
    }

    if (nextWidth <= 0 || nextHeight <= 0) {
      console.warn("updateResolution: non-positive resolution", selectedResolution);
      return;
    }

    const widthChanged = nextWidth !== Number(store.emulatedWidth);
    const heightChanged = nextHeight !== Number(store.emulatedHeight);

    store.emulatedWidth = nextWidth;
    store.emulatedHeight = nextHeight;
    const currentAspectRatio = getCurrentAspectRatio();

    // Update aspect ratio displays
    const aspectRatioElement = document.getElementById("aspect-ratio");
    if (aspectRatioElement) {
      aspectRatioElement.innerText = currentAspectRatio;
    }
    const aspectRatioValueElement =
      document.getElementById("aspect-ratio-value");
    if (aspectRatioValueElement) {
      aspectRatioValueElement.innerText = currentAspectRatio;
    }

    // Update template's aspect ratio in template mode
    if (
      (queryParams.mode === "template_editor" ||
        queryParams.mode === "suborg_templates") &&
      store.currentSlideIndex > -1 &&
      store.slides[store.currentSlideIndex]
    ) {
      const currentTemplate = store.slides[store.currentSlideIndex];
      currentTemplate.aspect_ratio = currentAspectRatio;
      console.log(`Updated template aspect ratio to: ${currentAspectRatio}`);
    }

    const shouldReloadSlide =
      store.currentSlideIndex > -1 && (widthChanged || heightChanged);

    if (shouldReloadSlide) {
      loadSlide(
        store.slides[store.currentSlideIndex],
        ".preview-slide",
        true,
        true,
      );
    }

    if (widthChanged || heightChanged) {
      scaleAllSlides();

      // Force update zoom after resolution change to fix scaling issues
      setTimeout(() => {
        updateAllSlidesZoom();
      }, 50);
    }

    const resolutionModal = document.getElementById("resolutionModal");
    if (resolutionModal) {
      const modalInstance = bootstrap.Modal.getInstance(resolutionModal);
      if (modalInstance) {
        modalInstance.hide();
      }
    }

    if (queryParams.mode !== "template_editor") {
      await saveSlideshow(queryParams.id);
    }

    showSavingStatus();

    if (widthChanged || heightChanged) {
      await fetchUnifiedTemplates();
    }
  }
}
