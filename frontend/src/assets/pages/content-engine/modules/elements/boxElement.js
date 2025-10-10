// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { loadSlide } from "../core/renderSlide.js";
import { selectElement } from "../core/elementSelector.js";
import { getNewZIndex } from "../utils/domUtils.js";
import { GridUtils } from "../config/gridConfig.js";
import { gettext } from "../../../../utils/locales.js";

/**
 * The Box element is a simple generic box with no content.
 * Default appearance: black background, transparent border.
 */
export function addBoxElement() {
  if (store.currentSlideIndex === -1) return;
  pushCurrentSlideState();

  const newBox = {
    id: store.elementIdCounter++,
    type: "box",
    gridX: GridUtils.getCenteredPosition(100, 100).x,
    gridY: GridUtils.getCenteredPosition(100, 100).y,
    gridWidth: 100,
    gridHeight: 100,
    backgroundColor: "#000000",
    zIndex: getNewZIndex(),
    originSlideIndex: store.currentSlideIndex,
    isLocked: false,
    isHidden: false,
  };

  store.slides[store.currentSlideIndex].elements.push(newBox);
  loadSlide(store.slides[store.currentSlideIndex]);
  selectElement(document.getElementById("el-" + newBox.id), newBox);
}

/**
 * Render helper used by renderSlide.js
 */
export function _renderBox(el, container) {
  // Ensure full-size container
  container.style.width = "100%";
  container.style.height = "100%";
  // Background color is handled by the common backgroundColor formatter
  // but ensure a default if missing
  if (!el.backgroundColor) {
    el.backgroundColor = "#000000";
    container.style.backgroundColor = "#000000";
  }
}

export function initBoxElement() {
  const btn = document.querySelector('[data-type="box"]');
  if (btn) {
    btn.addEventListener("click", () => {
      if (store.currentSlideIndex === -1) {
        // can't add without slide
        return;
      }
      // Clear any pending selection-for-update
      window.selectedElementForUpdate = null;
      addBoxElement();
    });
  }
}
