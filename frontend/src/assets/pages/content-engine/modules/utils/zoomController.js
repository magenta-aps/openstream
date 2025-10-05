// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Zoom controller for managing fit-to-window vs zoom modes
 */

import { store } from "../core/slideStore.js";
import { onZoomChange, setZoom, getCurrentZoom } from "./statusBar.js";
import { queryParams } from "../../../../utils/utils.js";

let isInitialized = false;

/**
 * Get the correct preview containers, handling both new layout (with preview-column) and old layout
 */
function getPreviewContainers() {
  return document.querySelectorAll(
    ".preview-column .preview-container, .slide-canvas .preview-container:not(.preview-column .preview-container)",
  );
}

/**
 * Initialize the zoom controller
 */
export function initZoomController() {
  if (queryParams.mode !== "slideshow-player") {
    if (isInitialized) return;

    // Listen for zoom changes from status bar
    onZoomChange(handleZoomChange);

    // Initialize wheel event listener for Ctrl+scroll zoom
    initWheelZoomControl();

    isInitialized = true;
  }
}

/**
 * Initialize wheel event listener for Ctrl+scroll zoom control
 */
function initWheelZoomControl() {
  // Add wheel event listener to the slide canvas area
  document.addEventListener("wheel", handleWheelZoom, { passive: false });
}

/**
 * Handle wheel events for zoom control when Ctrl is pressed
 */
function handleWheelZoom(event) {
  // Only handle Ctrl+scroll in edit and template_editor modes
  if (queryParams.mode !== "edit" && queryParams.mode !== "template_editor") {
    return;
  }

  // Only proceed if Ctrl key is pressed
  if (!event.ctrlKey) {
    return;
  }

  // Check if the wheel event is over a slide preview container
  const target = event.target;
  const previewContainer = target.closest(".preview-column .preview-container") ||
                          target.closest(".slide-canvas .preview-container:not(.preview-column .preview-container)");

  if (!previewContainer) {
    return;
  }

  // Prevent default zoom behavior and page scrolling
  event.preventDefault();

  const currentZoom = getCurrentZoom();

  // If we're in fit mode, switch to zoom mode first
  if (currentZoom.mode === "fit") {
    setZoom("zoom", 100);
    return;
  }

  // Calculate new zoom level
  const zoomStep = 10; // 10% increment/decrement
  const currentLevel = currentZoom.level;
  let newLevel;

  if (event.deltaY < 0) {
    // Scroll up = zoom in
    newLevel = Math.min(currentLevel + zoomStep, 300); // Max 300%
  } else {
    // Scroll down = zoom out
    newLevel = Math.max(currentLevel - zoomStep, 25); // Min 25%
  }

  // Update zoom level
  if (newLevel !== currentLevel) {
    setZoom("zoom", newLevel);
  }
}

/**
 * Handle zoom mode and level changes
 */
function handleZoomChange(mode, level) {
  // Only apply zoom in edit and template_editor modes
  if (
    queryParams.mode === "edit" ||
    queryParams.mode === "template_editor" ||
    queryParams.mode === "suborg_templates"
  ) {
    if (mode === "fit") {
      enableFitToWindowMode();
    } else if (mode === "zoom") {
      enableZoomMode(level);
    }
  } else {
    // For other modes (like slideshow-player), always use fit mode
    enableFitToWindowMode();
  }
}

/**
 * Enable fit-to-window mode (current default behavior)
 */
function enableFitToWindowMode() {
  const previewContainers = getPreviewContainers();

  previewContainers.forEach((container) => {
    // Skip if this is the sidebar (safety check)
    if (container.closest(".slide-right-sidebar")) {
      return;
    }

    // Reset scroll position
    container.scrollTo(0, 0);

    // Remove zoom mode class and scrolling
    container.classList.remove("zoom-mode");
    container.style.overflow = "hidden";

    const previewSlide = container.querySelector(".preview-slide");
    if (previewSlide) {
      // Re-enable scaling
      scaleSlideToFit(container);

      // Ensure the zoom wrapper and grid container have correct dimensions
      const zoomWrapper = previewSlide.querySelector(".zoom-wrapper");
      const gridContainer = zoomWrapper?.querySelector(".grid-container");

      if (zoomWrapper) {
        zoomWrapper.style.width = `${store.emulatedWidth}px`;
        zoomWrapper.style.height = `${store.emulatedHeight}px`;
      }
      if (gridContainer) {
        gridContainer.style.width = `${store.emulatedWidth}px`;
        gridContainer.style.height = `${store.emulatedHeight}px`;
      }

      // Reset preview slide dimensions for fit mode
      previewSlide.style.width = `${store.emulatedWidth}px`;
      previewSlide.style.height = `${store.emulatedHeight}px`;

      // Reset container constraints
      container.style.minWidth = "auto";
      container.style.minHeight = "auto";
    }
  });
}

/**
 * Enable zoom mode with scrolling
 */
function enableZoomMode(zoomLevel) {
  const previewContainers = getPreviewContainers();

  previewContainers.forEach((container) => {
    // Skip if this is the sidebar (safety check)
    if (container.closest(".slide-right-sidebar")) {
      return;
    }

    // Add zoom mode class and enable scrolling
    container.classList.add("zoom-mode");
    container.style.overflow = "auto";

    const previewSlide = container.querySelector(".preview-slide");
    if (previewSlide) {
      // Disable fit-to-window scaling and apply zoom level
      const zoomScale = zoomLevel / 100;

      // Position the slide at top-left instead of center for zoom mode
      previewSlide.style.position = "relative";
      previewSlide.style.top = "0";
      previewSlide.style.left = "0";
      previewSlide.style.transform = `scale(${zoomScale})`;
      previewSlide.style.transformOrigin = "top left";

      // Update current scale in store for grid calculations
      store.currentScale = zoomScale;

      // Adjust container size to accommodate the scaled content
      const zoomWrapper = previewSlide.querySelector(".zoom-wrapper");
      if (zoomWrapper) {
        // Ensure wrapper has correct dimensions
        zoomWrapper.style.width = `100%`;
        zoomWrapper.style.height = `100%`;

        const gridContainer = zoomWrapper.querySelector(".grid-container");
        if (gridContainer) {
          gridContainer.style.width = `100%`;
          gridContainer.style.height = `100%`;
        }

        // Calculate the actual rendered size after scaling
        const scaledWidth = store.emulatedWidth * zoomScale;
        const scaledHeight = store.emulatedHeight * zoomScale;

        // Set the preview slide dimensions to the scaled size to provide proper scrollable area
        previewSlide.style.width = `${scaledWidth}px`;
        previewSlide.style.height = `${scaledHeight}px`;

        // Reset any container constraints that might interfere with scrolling
        container.style.minWidth = "auto";
        container.style.minHeight = "auto";
      }
    }
  });
}

/**
 * Scale slide to fit container (original behavior)
 */
function scaleSlideToFit(previewContainer) {
  const containerRect = previewContainer.getBoundingClientRect();
  const containerWidth = containerRect.width;
  const containerHeight = containerRect.height;
  const scale = Math.min(
    containerWidth / store.emulatedWidth,
    containerHeight / store.emulatedHeight,
  );
  store.currentScale = scale;

  const previewSlide = previewContainer.querySelector(".preview-slide");
  if (previewSlide) {
    // Reset to center positioning for fit mode
    previewSlide.style.position = "absolute";
    previewSlide.style.top = "50%";
    previewSlide.style.left = "50%";
    previewSlide.style.transform = `translate(-50%, -50%) scale(${scale})`;
    previewSlide.style.transformOrigin = "center";
    previewSlide.style.width = store.emulatedWidth + "px";
    previewSlide.style.height = store.emulatedHeight + "px";
  }
}

/**
 * Update zoom for all slides (called when resolution changes, etc.)
 */
export function updateAllSlidesZoom() {
  // Get current zoom state from status bar
  const statusBar = document.querySelector(".content-engine-status-bar");
  if (!statusBar) return;

  const zoomButton = statusBar.querySelector(".zoom-mode-btn:first-child");
  const fitButton = statusBar.querySelector(".zoom-mode-btn:last-child");
  const isFitMode =
    fitButton && fitButton.style.background.includes("rgb(52, 152, 219)");

  if (isFitMode) {
    enableFitToWindowMode();
  } else {
    const slider = statusBar.querySelector('input[type="range"]');
    const zoomLevel = slider ? parseInt(slider.value) : 100;
    enableZoomMode(zoomLevel);
  }
}

/**
 * Get current zoom info
 */
export function getCurrentZoomInfo() {
  const statusBar = document.querySelector(".content-engine-status-bar");
  if (!statusBar) return { mode: "fit", level: 100 };

  const zoomButton = statusBar.querySelector(".zoom-mode-btn:first-child");
  const fitButton = statusBar.querySelector(".zoom-mode-btn:last-child");
  const isFitMode =
    fitButton && fitButton.style.background.includes("rgb(52, 152, 219)");

  if (isFitMode) {
    return { mode: "fit", level: 100 };
  } else {
    const slider = statusBar.querySelector('input[type="range"]');
    const zoomLevel = slider ? parseInt(slider.value) : 100;
    return { mode: "zoom", level: zoomLevel };
  }
}
