// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { loadSlide, scaleAllSlides } from "./renderSlide.js";
import { saveSlideshow, showSavingStatus } from "./slideshowDataManager.js";
import { queryParams } from "../../../../utils/utils.js";
import { fetchUnifiedTemplates, getCurrentAspectRatio } from "./addSlide.js";
import { updateAllSlidesZoom } from "../utils/zoomController.js";
import * as bootstrap from "bootstrap";

export function initVirtualPreviewResolution() {
  let selectedResolution = {
    width: store.emulatedWidth || undefined,
    height: store.emulatedHeight || undefined,
  };

  const options = document.querySelectorAll(".resolution-option");

  options.forEach((option) => {
    const optionWidth = parseInt(option.getAttribute("data-width"), 10);
    const optionHeight = parseInt(option.getAttribute("data-height"), 10);

    if (!store.emulatedHeight && !store.emulatedHeight) {
      store.emulatedHeight = "1080";
      store.emulatedWidth = "1920";
    }

    if (
      optionWidth === store.emulatedWidth &&
      optionHeight === store.emulatedHeight
    ) {
      option.classList.add("active");
    } else {
      option.classList.remove("active");
    }
  });

  // Initialize aspect ratio value display
  const currentAspectRatio = getCurrentAspectRatio();
  const aspectRatioValueElement = document.getElementById("aspect-ratio-value");
  if (aspectRatioValueElement) {
    aspectRatioValueElement.innerText = currentAspectRatio;
  }

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

  document
    .getElementById("saveResolutionBtn")
    .addEventListener("click", async () => {
      updateResolution(selectedResolution);
    });

  // Update resolution modal selection when it's shown
  const resolutionModal = document.getElementById("resolutionModal");
  if (resolutionModal) {
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
    if (selectedResolution.width > 0 && selectedResolution.height > 0) {
      store.emulatedWidth = selectedResolution.width;
      store.emulatedHeight = selectedResolution.height;
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

      if (store.currentSlideIndex > -1) {
        loadSlide(
          store.slides[store.currentSlideIndex],
          ".preview-slide",
          true,
        );
      }
      scaleAllSlides();

      // Force update zoom after resolution change to fix scaling issues
      setTimeout(() => {
        updateAllSlidesZoom();
      }, 50);

      bootstrap.Modal.getInstance(
        document.getElementById("resolutionModal"),
      ).hide();
    }

    if (queryParams.mode !== "template_editor") {
      await saveSlideshow(queryParams.id);
    }

    showSavingStatus();
    await fetchUnifiedTemplates();
  }
}
