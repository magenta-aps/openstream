// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { showToast } from "../../../../utils/utils.js";
import { pushCurrentSlideState } from "./undoRedo.js";
import { loadSlide } from "./renderSlide.js";
import { selectElement } from "./elementSelector.js";
import { getNewZIndex } from "../utils/domUtils.js";
import { GRID_CONFIG, GridUtils } from "../config/gridConfig.js";
import { gettext } from "../../../../utils/locales.js";
function duplicateElement() {
  if (!store.selectedElementData) {
    showToast(gettext("Please select an element to duplicate."), "Warning");
    return;
  }
  pushCurrentSlideState();

  const newElement = JSON.parse(JSON.stringify(store.selectedElementData));
  newElement.id = store.elementIdCounter++;
  newElement.gridX = Math.min(
    newElement.gridX + 1,
    GridUtils.getMaxGridX(newElement.gridWidth),
  );
  newElement.gridY = Math.min(
    newElement.gridY + 1,
    GridUtils.getMaxGridY(newElement.gridHeight),
  );

  // Set the origin slide for the duplicated element to the current slide
  newElement.originSlideIndex = store.currentSlideIndex;
  // Reset persistence for the duplicated element
  newElement.isPersistent = false;
  // Reset lock state for the duplicated element
  newElement.isLocked = false;
  // Initialize visibility state if not present
  if (newElement.isHidden === undefined) {
    newElement.isHidden = false;
  }
  // Set new zIndex considering all persistent elements
  newElement.zIndex = getNewZIndex();

  store.slides[store.currentSlideIndex].elements.push(newElement);

  loadSlide(store.slides[store.currentSlideIndex]);

  const newElementDom = document.getElementById("el-" + newElement.id);
  if (newElementDom) {
    selectElement(newElementDom, newElement);
  }
}

export function initDuplicateElement() {
  const duplicateBtn = document.querySelector(
    'button[title="Duplicate Element"]',
  );
  if (duplicateBtn) {
    duplicateBtn.addEventListener("click", duplicateElement);
  }

  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable)
    ) {
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        duplicateElement();
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        if (store.selectedElementData) {
          window.copiedElementData = JSON.parse(
            JSON.stringify(store.selectedElementData),
          );
        }
      } else if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        if (window.copiedElementData) {
          pushCurrentSlideState();
          const newElement = JSON.parse(
            JSON.stringify(window.copiedElementData),
          );
          newElement.id = store.elementIdCounter++;
          newElement.gridX = Math.min(
            newElement.gridX + 1,
            GridUtils.getMaxGridX(newElement.gridWidth),
          );
          newElement.gridY = Math.min(
            newElement.gridY + 1,
            GridUtils.getMaxGridY(newElement.gridHeight),
          );
          // Set the origin slide for the pasted element to the current slide
          newElement.originSlideIndex = store.currentSlideIndex;
          // Reset persistence for the pasted element
          newElement.isPersistent = false;
          // Reset lock state for the pasted element
          newElement.isLocked = false;
          store.slides[store.currentSlideIndex].elements.push(newElement);
          loadSlide(store.slides[store.currentSlideIndex]);
          const newElementDom = document.getElementById("el-" + newElement.id);
          if (newElementDom) {
            selectElement(newElementDom, newElement);
          }
        }
      }
    }
  });
}
