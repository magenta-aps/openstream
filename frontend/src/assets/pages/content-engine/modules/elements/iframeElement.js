// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * iframeElement.js
 ************************************************************/
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { loadSlide } from "../core/renderSlide.js";
import { selectElement } from "../core/elementSelector.js";
import { getNewZIndex } from "../utils/domUtils.js";
import { showSlideTypeModal } from "../modals/dynamicModal.js";
import { showFrontendSlideTypeModal } from "../slideTypes/frontendSlideTypeModal.js";
import { GridUtils } from "../config/gridConfig.js";
import * as bootstrap from "bootstrap";

// Helper function to detect if content is a URL
function isUrl(content) {
  try {
    new URL(content, window.location.origin);
    return true;
  } catch {
    return false;
  }
}

export function addIframe(html, newElementOverrides = {}) {
  if (window.selectedElementForUpdate) {
    pushCurrentSlideState();

    const element = store.selectedElementData;
    element.content = html;
    // Also update the config if it's provided
    if (newElementOverrides.config) {
      element.config = newElementOverrides.config;
      element.integrationName = newElementOverrides?.integrationName;
    }
    if (newElementOverrides.slideTypeId) {
      element.slideTypeId = newElementOverrides.slideTypeId;
    }

    const iframe = window.selectedElementForUpdate.querySelector("iframe");
    if (iframe) {
      if (isUrl(html)) {
        iframe.src = html;
        iframe.removeAttribute("srcdoc");
      } else {
        iframe.srcdoc = html;
        iframe.removeAttribute("src");
      }
    }

    store.dynamicContentUpdateMode = false;
    window.selectedElementForUpdate = null;
  } else {
    if (store.currentSlideIndex < 0) {
      console.warn(
        "No currentSlideIndex selected. Cannot create an iframe element.",
      );
      return;
    }
    pushCurrentSlideState();

    const newId = store.elementIdCounter++;
    
    // Determine integration type from integrationName for sizing
    let integrationType = null;
    if (newElementOverrides.integrationName) {
      // Map integration names to type keys
      const integrationMap = {
        'Clock': 'clock',
        'Newsfeed with Image': 'newsfeed',
        'Newsticker': 'newsticker',
        'KMD - Foreningsportalen': 'kmd',
        'SpeedAdmin': 'speedadmin',
        'Dreambroker': 'dreambroker',
        'DR Streams': 'drstreams',
        'Winkas': 'winkas',
        'DDB Events API': 'ddb-events',
        'Frontdesk/LTK Borgerservice': 'frontdesk',
      };
      integrationType = integrationMap[newElementOverrides.integrationName];
    }
    
    const defaultSize = GridUtils.getDefaultElementSize('medium', integrationType);
    const centeredPos = GridUtils.getCenteredPosition(defaultSize.width, defaultSize.height);

    const newElement = {
      id: newId,
      type: "iframe",
      content: newElementOverrides.html ?? html,
      gridX:
        newElementOverrides.gridX ?? (defaultSize.x ?? centeredPos.x),
      gridY:
        newElementOverrides.gridY ?? (defaultSize.y ?? centeredPos.y),
      gridWidth: newElementOverrides.gridWidth ?? defaultSize.width,
      gridHeight: newElementOverrides.gridHeight ?? defaultSize.height,
      backgroundColor: newElementOverrides.backgroundColor ?? "transparent",
      zIndex: getNewZIndex(),
      isDynamic: true,
      originSlideIndex: store.currentSlideIndex, // Track which slide this element was created on
      // Add these new properties
      slideTypeId: newElementOverrides.slideTypeId,
      config: newElementOverrides.config,
      integrationName: newElementOverrides.integrationName,
    };

    store.slides[store.currentSlideIndex].elements.push(newElement);
    loadSlide(store.slides[store.currentSlideIndex]);

    const newElDom = document.getElementById("el-" + newId);
    if (newElDom) {
      selectElement(newElDom, newElement);
    }
  }

  // Note: Modal closing is handled by the respective modal components
}

// Helper function used by the rendering engine in renderSlide.js
export function _renderIframe(el, container) {
  const iframe = document.createElement("iframe");

  // Detect if content is a URL or HTML content
  if (isUrl(el.content)) {
    iframe.src = el.content;
  } else {
    iframe.srcdoc = el.content;
  }

  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";
  iframe.style.pointerEvents = "none";
  container.appendChild(iframe);
}

export function initIframe() {
  document
    .querySelector('[data-type="dynamic-element"]')
    .addEventListener("click", () => {
      window.selectedElementForUpdate = null;
      // Use frontend modal instead of API-based modal
      showFrontendSlideTypeModal();
    });

  document
    .getElementById("change-dynamic-content-btn")
    .addEventListener("click", () => {
      store.dynamicContentUpdateMode = true;
      window.selectedElementForUpdate = store.selectedElement; // Set this for addIframe
      const elementToUpdate = store.selectedElementData;

      // Pass the element to the frontend modal function to load its settings
      if (elementToUpdate?.isDynamic && elementToUpdate?.slideTypeId) {
        showFrontendSlideTypeModal(elementToUpdate);
      } else {
        // Fallback for older elements or if data is missing
        showFrontendSlideTypeModal();
      }
    });
}
