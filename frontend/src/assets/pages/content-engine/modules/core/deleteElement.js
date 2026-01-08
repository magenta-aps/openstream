// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { pushCurrentSlideState } from "./undoRedo.js";
import { isElementLocked } from "../element_formatting/lockElement.js";
import { queryParams } from "../../../../utils/utils.js";
import {
  hideResizeHandles,
  removeGradientWrapper,
} from "./elementSelector.js";

let deleteLock = false;

export function initDeleteElement() {
  document.addEventListener("keydown", (e) => {
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      store.selectedElement
    ) {
      if (
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.isContentEditable)
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      if (deleteLock) {
        return;
      }
      deleteLock = true;
      setTimeout(() => {
        deleteLock = false;
      }, 300);

      if (store.currentSlideIndex > -1) {
        const elementNode = store.selectedElement;
        const elementToDelete = store.selectedElementData;

        // Check if the element is locked - if so, prevent deletion
        // Exception: Allow deletion in template editor mode
        if (
          isElementLocked(elementToDelete) &&
          queryParams.mode !== "template_editor"
        ) {
          return;
        }

        pushCurrentSlideState();

        if (elementToDelete.isPersistent) {
          // For persistent elements, find and remove it from whichever slide it belongs to.
          store.slides.forEach((slide) => {
            slide.elements = slide.elements.filter(
              (el) => el.id !== elementToDelete.id,
            );
          });
        } else {
          // For non-persistent elements, just remove from the current slide
          store.slides[store.currentSlideIndex].elements = store.slides[
            store.currentSlideIndex
          ].elements.filter((el) => el.id !== elementToDelete.id);
        }

        if (elementNode) {
          removeGradientWrapper(elementNode);

          if (typeof elementNode._cleanupResizeHandles === "function") {
            elementNode._cleanupResizeHandles();
            delete elementNode._cleanupResizeHandles;
          } else {
            if (elementNode._resizerObserver) {
              elementNode._resizerObserver.disconnect();
              delete elementNode._resizerObserver;
            }

            if (Array.isArray(elementNode._resizeHandles)) {
              elementNode._resizeHandles.forEach((handle) => {
                if (handle?.parentNode) {
                  handle.parentNode.removeChild(handle);
                }
              });
              delete elementNode._resizeHandles;
            }

            if (elementNode._resizeHandle) {
              if (
                !elementNode._resizeHandles ||
                !elementNode._resizeHandles.includes(elementNode._resizeHandle)
              ) {
                elementNode._resizeHandle.remove();
              }
              delete elementNode._resizeHandle;
            }
          }

          if (elementNode._updateResizerPosition) {
            delete elementNode._updateResizerPosition;
          }

          elementNode.remove();
        }

        hideResizeHandles();

        store.selectedElement = null;
        store.selectedElementData = null;
        document
          .querySelectorAll(".element-type-toolbar")
          .forEach((toolbar) => toolbar.classList.replace("d-flex", "d-none"));

        const elementBgColorBtn = document.querySelector(
          '#selected-element-toolbar button[title="Background Color"]',
        );
        if (elementBgColorBtn) elementBgColorBtn.style.border = "";

        const borderBtn = document.querySelector(
          '#selected-element-toolbar button[title="Border"]',
        );
        if (borderBtn) borderBtn.style.border = "";

        // Clear table cell edit indicators from all tables
        document.querySelectorAll("table").forEach((table) => {
          const allCells = table.querySelectorAll("th, td");
          allCells.forEach((cell) => {
            cell.style.outline = "";
            cell.contentEditable = "false";
          });
        });
      }
    }
  });
}
