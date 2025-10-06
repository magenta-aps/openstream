// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { loadSlide } from "../core/renderSlide.js";
import { selectElement } from "../core/elementSelector.js";
import { showToast, queryParams } from "../../../../utils/utils.js";
import { getNewZIndex } from "../utils/domUtils.js";
import {
  getAvailableElementTypes,
  replaceElementWithType,
} from "../utils/elementTypeConverter.js";
import { GridUtils } from "../config/gridConfig.js";
import { gettext } from "../../../../utils/locales.js";

function addPlaceholderToSlide() {
  if (store.currentSlideIndex < 0) {
    showToast(gettext("Please select a slide first!"), "Info");
    return;
  }

  pushCurrentSlideState();

  const newPlaceholder = {
    id: store.elementIdCounter++,
    type: "placeholder",
    gridX: GridUtils.getCenteredPosition(100, 100).x,
    gridY: GridUtils.getCenteredPosition(100, 100).y,
    gridWidth: 100,
    gridHeight: 100,
    zIndex: getNewZIndex(),
    originSlideIndex: store.currentSlideIndex,
    isLocked: false,
    isHidden: false, // Initialize visibility state
  };

  store.slides[store.currentSlideIndex].elements.push(newPlaceholder);
  loadSlide(store.slides[store.currentSlideIndex]);

  const newElDom = document.getElementById("el-" + newPlaceholder.id);
  selectElement(newElDom, newPlaceholder);
}

function createElementTypeModal(element) {
  // Remove any existing modal
  document
    .querySelectorAll(".element-type-modal")
    .forEach((modal) => modal.remove());

  const modal = document.createElement("div");
  modal.className = "element-type-modal";
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10002;
  `;

  const modalContent = document.createElement("div");
  modalContent.style.cssText = `
    background: white;
    border-radius: 8px;
    padding: 24px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;

  const header = document.createElement("h3");
  header.textContent = gettext("Select Element Type");
  header.style.cssText = `
    margin: 0 20px;
    color: #333;
    text-align: center;
  `;
  modalContent.appendChild(header);

  const grid = document.createElement("div");
  grid.style.cssText = `
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
    margin-top: 20px;
  `;

  const availableTypes = getAvailableElementTypes();

  availableTypes.forEach((typeInfo) => {
    const typeButton = document.createElement("button");
    typeButton.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 20px 12px;
      border: 2px solid #cccccc;
      border-radius: 8px;
      background: white;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
    `;

    const icon = document.createElement("i");
    icon.className = "material-symbols-outlined";
    icon.style.cssText = `
      font-size: 32px;
      color: #666;
    `;
    icon.textContent = typeInfo.icon;

    const text = document.createElement("span");
    text.textContent = typeInfo.name;
    text.style.cssText = `
      font-size: 14px;
      font-weight: 500;
      color: #333;
      text-align: center;
    `;

    typeButton.appendChild(icon);
    typeButton.appendChild(text);

    typeButton.addEventListener("mouseenter", () => {
      typeButton.style.borderColor = "#007bff";
      typeButton.style.backgroundColor = "#f8f9ff";
    });

    typeButton.addEventListener("mouseleave", () => {
      typeButton.style.borderColor = "#e0e0e0";
      typeButton.style.backgroundColor = "white";
    });

    typeButton.addEventListener("click", () => {
      try {
        // Convert the placeholder to the selected element type
        replaceElementWithType(element, typeInfo.type);
        modal.remove();
      } catch (error) {
        console.error("Error converting placeholder to element type:", error);
        showToast(
          gettext("Failed to convert placeholder to element type"),
          "Error",
        );
        modal.remove();
      }
    });

    grid.appendChild(typeButton);
  });

  const cancelButton = document.createElement("button");
  cancelButton.textContent = gettext("Cancel");
  cancelButton.style.cssText = `
    width: 100%;
    padding: 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #f5f5f5;
    cursor: pointer;
    font-size: 14px;
    color: #666;
  `;

  cancelButton.addEventListener("click", () => {
    modal.remove();
  });

  modalContent.appendChild(grid);
  modalContent.appendChild(cancelButton);
  modal.appendChild(modalContent);

  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  // Close modal with Escape key
  const handleKeydown = (e) => {
    if (e.key === "Escape") {
      modal.remove();
      document.removeEventListener("keydown", handleKeydown);
    }
  };
  document.addEventListener("keydown", handleKeydown);

  document.body.appendChild(modal);
}

export function initPlaceholderElement() {
  // Add event listener for the add placeholder button
  const addPlaceholderBtn = document.querySelector('[data-type="placeholder"]');
  if (addPlaceholderBtn) {
    addPlaceholderBtn.addEventListener("click", addPlaceholderToSlide);

    if (
      queryParams.mode === "template_editor" ||
      queryParams.mode === "suborg_templates"
    ) {
      addPlaceholderBtn.classList.remove("d-none");
    }
  }

  // Add event listener for the toolbar "Change element type" button
  const changeElementTypeBtn = document.getElementById(
    "change-element-type-btn",
  );
  if (changeElementTypeBtn) {
    changeElementTypeBtn.addEventListener("click", () => {
      // Find the currently selected element data
      if (
        store.selectedElementData &&
        store.selectedElementData.type === "placeholder"
      ) {
        createElementTypeModal(store.selectedElementData);
      }
    });
  }
}

export function _renderPlaceholder(el, container) {
  const placeholderWrapper = document.createElement("div");
  placeholderWrapper.style.cssText = `
    width: calc(100% - 12px);
    height: calc(100% - 12px);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    margin: 6px;
    box-sizing: border-box;
    background-color: ${el.backgroundColor || "#f0f0f0"};
    border: 5px solid #696969ff;
  `;

  const selectButton = document.createElement("button");
  selectButton.innerHTML = '<i class="material-symbols-outlined">add</i>';
  selectButton.style.cssText = `
    padding: 5px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    font-size: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  `;

  selectButton.addEventListener("mouseenter", () => {
    selectButton.style.backgroundColor = "#0056b3";
  });

  selectButton.addEventListener("mouseleave", () => {
    selectButton.style.backgroundColor = "#007bff";
  });

  selectButton.addEventListener("click", (e) => {
    e.stopPropagation();
    createElementTypeModal(el);
  });

  placeholderWrapper.appendChild(selectButton);
  container.appendChild(placeholderWrapper);
}
