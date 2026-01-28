// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { definePersistedProperty } from "./persistedStateObserver.js";

export const store = {
  slides: [],
  lastSlidesStr: JSON.stringify([]),

  currentSlideIndex: -1,
  lastSlideIndex: null,
  slideIdCounter: 1,
  elementIdCounter: 1,
  editorMode: null,
  globalTemplateContext: false,

  slideshowPlayerMetaData: {},
  
  selectedElement: null,
  selectedElementData: null,

  dynamicContentUpdateMode: false,
  dynamicContentUpdateElement: null,

  emulatedWidth: null,
  emulatedHeight: null,
  currentScale: 1,
  showGrid: false,
  legacyGridEnabled: false,
  activeSlideshowIsLegacy: false,
  templateLegacyFlags: new Map(),
  dragSnapSettings: {
    unit: "cells",
    amount: 1,
  },

  selectedVideoId: null,
  selectedImgId: null,

  slideshowMode: null,

  currentTemplateSlideIndex: null,
  // UI flags
  showElementIndicators: true,
  // Player-mode runtime state (set when entering fullscreen/player mode)
  playerModeState: null,
  // Resolver for slideshow exit when info box is not used
  resolveSlideshowExit: null,
};

definePersistedProperty(store, "slides");
definePersistedProperty(store, "emulatedWidth");
definePersistedProperty(store, "emulatedHeight");

let _selectedElement = null;

Object.defineProperty(store, "selectedElement", {
  get() {
    return _selectedElement;
  },
  set(value) {
    if (value === null && _selectedElement) {
      const element = _selectedElement;

      if (element._gradientWrapper) {
        element._gradientWrapper.remove();
        delete element._gradientWrapper;
      }

      if (element._gradientWrapperObserver) {
        element._gradientWrapperObserver.disconnect();
        delete element._gradientWrapperObserver;
      }

      if (element._gradientWrapperParentObserver) {
        element._gradientWrapperParentObserver.disconnect();
        delete element._gradientWrapperParentObserver;
      }

      if (element._gradientWrapperDragHandler) {
        element.removeEventListener(
          "drag",
          element._gradientWrapperDragHandler,
        );
        element.removeEventListener(
          "dragend",
          element._gradientWrapperDragHandler,
        );
        delete element._gradientWrapperDragHandler;
      }
    }

    _selectedElement = value;
  },
  enumerable: true,
  configurable: true,
});

let _selectedElementData = null;

Object.defineProperty(store, "selectedElementData", {
  get() {
    return _selectedElementData;
  },
  set(value) {
    // We import observeValue to ensure the selected element 
    // is reactive the second it is picked up by the editor.
    import("./persistedStateObserver.js").then(m => {
        _selectedElementData = m.observeValue(value);
    });
    
    // Fallback for immediate assignment if observer is already loaded 
    // (Or better, just import observeValue at the top of this file)
    _selectedElementData = value; 
  },
  enumerable: true,
  configurable: true,
});
