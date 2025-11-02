// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Helper to enter/exit player mode (fullscreen preview + hide editor chrome).
 * This centralizes the logic so slideshow and interactive modes share behavior.
 */
import { store } from "./slideStore.js";

export function enterPlayerMode(previewContainer) {
  try {
    document.body.classList.add("player-mode");

    const navbar = document.querySelector("#navigation");
    const leftSidebar = document.querySelector(".sidebar");
    const topPanel = document.querySelector(".top-panel");

    const hiddenEls = [];
    if (navbar && !navbar.classList.contains("d-none")) {
      navbar.classList.add("d-none");
      hiddenEls.push(navbar);
    }
    if (leftSidebar && !leftSidebar.classList.contains("d-none")) {
      leftSidebar.classList.add("d-none");
      hiddenEls.push(leftSidebar);
    }
    if (topPanel && !topPanel.classList.contains("d-none")) {
      topPanel.classList.add("d-none");
      hiddenEls.push(topPanel);
    }

    // Capture inline styles for preview container and inner preview elements
    const previewSlide = previewContainer
      ? previewContainer.querySelector(".preview-slide")
      : null;
    const zoomWrapper = previewContainer
      ? previewContainer.querySelector(".zoom-wrapper")
      : null;
    const gridContainer = zoomWrapper
      ? zoomWrapper.querySelector(".grid-container")
      : null;

    const originalStyles = previewContainer
      ? {
          previewContainerCss: previewContainer.style.cssText,
          previewSlideCss: previewSlide ? previewSlide.style.cssText : null,
          zoomWrapperCss: zoomWrapper ? zoomWrapper.style.cssText : null,
          gridContainerCss: gridContainer ? gridContainer.style.cssText : null,
        }
      : null;

    if (previewContainer) {
      // Use inset positioning so the container fills the viewport without
      // forcing its internal children to resize to 100vw/100vh. This lets
      // the centralized scaling logic (scaleSlide) compute a transform on
      // the `.preview-slide` element while the container itself simply
      // occupies the viewport.
      Object.assign(previewContainer.style, {
        position: "fixed",
        inset: "0",
        // keep overflow hidden so fit-scaling centers correctly
        overflow: "hidden",
        // slightly lower than info box (which uses 1001) so controls remain clickable
        zIndex: "1000",
      });
      // Ensure preview slide keeps its own positioning rules (reset if needed)
      if (previewSlide) {
        // Force explicit emulated dimensions on the inner wrappers using
        // inline !important so they override any player-mode stylesheet
        // rules that otherwise force 100% sizing. This preserves the
        // smart scaling behavior implemented by `scaleSlide`.
        previewSlide.style.position = previewSlide.style.position || "absolute";
        previewSlide.style.transformOrigin =
          previewSlide.style.transformOrigin || "center";
        if (
          typeof store !== "undefined" &&
          store.emulatedWidth &&
          store.emulatedHeight
        ) {
          previewSlide.style.setProperty(
            "width",
            store.emulatedWidth + "px",
            "important",
          );
          previewSlide.style.setProperty(
            "height",
            store.emulatedHeight + "px",
            "important",
          );
        }
      }
      if (zoomWrapper) {
        if (
          typeof store !== "undefined" &&
          store.emulatedWidth &&
          store.emulatedHeight
        ) {
          zoomWrapper.style.setProperty(
            "width",
            store.emulatedWidth + "px",
            "important",
          );
          zoomWrapper.style.setProperty(
            "height",
            store.emulatedHeight + "px",
            "important",
          );
        }
      }
      if (gridContainer) {
        if (
          typeof store !== "undefined" &&
          store.emulatedWidth &&
          store.emulatedHeight
        ) {
          gridContainer.style.setProperty(
            "width",
            store.emulatedWidth + "px",
            "important",
          );
          gridContainer.style.setProperty(
            "height",
            store.emulatedHeight + "px",
            "important",
          );
        }
      }
    }

    // Hide common overlay elements (slide counter / countdown) if present
    const slideCounter = document.getElementById("slideCounter");
    const countdownEl = document.getElementById("countdown");
    if (slideCounter) slideCounter.style.display = "none";
    if (countdownEl) countdownEl.style.display = "none";

    const state = { previewContainer, originalStyles, hiddenEls };
    // store state centrally
    if (store) store.playerModeState = state;
    return state;
  } catch (e) {
    console.warn("enterPlayerMode failed:", e);
    return null;
  }
}

export function exitPlayerMode() {
  try {
    const state = store?.playerModeState;
    document.body.classList.remove("player-mode");

    if (!state) return;

    const { previewContainer, originalStyles, hiddenEls } = state;
    if (previewContainer && originalStyles) {
      // Restore the preview container's entire inline cssText
      if (originalStyles.previewContainerCss !== undefined) {
        previewContainer.style.cssText = originalStyles.previewContainerCss;
      }
      const previewSlide = previewContainer.querySelector(".preview-slide");
      const zoomWrapper = previewContainer.querySelector(".zoom-wrapper");
      const gridContainer = zoomWrapper?.querySelector(".grid-container");

      if (previewSlide && originalStyles.previewSlideCss !== null) {
        previewSlide.style.cssText =
          originalStyles.previewSlideCss || previewSlide.style.cssText;
      }
      if (zoomWrapper && originalStyles.zoomWrapperCss !== null) {
        zoomWrapper.style.cssText =
          originalStyles.zoomWrapperCss || zoomWrapper.style.cssText;
      }
      if (gridContainer && originalStyles.gridContainerCss !== null) {
        gridContainer.style.cssText =
          originalStyles.gridContainerCss || gridContainer.style.cssText;
      }
    }

    if (Array.isArray(hiddenEls)) {
      hiddenEls.forEach((el) => {
        el.classList.remove("d-none");
      });
    }

    // Restore overlay elements display
    const slideCounter = document.getElementById("slideCounter");
    const countdownEl = document.getElementById("countdown");
    if (slideCounter) slideCounter.style.display = "";
    if (countdownEl) countdownEl.style.display = "";

    // Clear stored state
    store.playerModeState = null;
  } catch (e) {
    console.warn("exitPlayerMode failed:", e);
  }
}

export function exitSlideshow() {
  // resolve the exit promise if a resolver exists on the store
  try {
    if (store && typeof store.resolveSlideshowExit === "function") {
      store.resolveSlideshowExit();
      store.resolveSlideshowExit = null;
    }
  } catch (e) {
    console.warn("exitSlideshow failed:", e);
  }
}
