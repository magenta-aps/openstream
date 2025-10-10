// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { getAvailableFonts, getDefaultFont } from "../utils/fontUtils.js";
import { selectElement } from "../core/elementSelector.js";
import { loadSlide } from "../core/renderSlide.js";
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { getNewZIndex } from "../utils/domUtils.js";
import { queryParams } from "../../../../utils/utils.js";
import { GridUtils } from "../config/gridConfig.js";
import { gettext } from "../../../../utils/locales.js";

export function initListElement() {
  initListEventListeners();
  populateListFontDropdowns();
}

// Debounce timer for live list updates
let listUpdateTimer = null;

function debounceListUpdate() {
  if (listUpdateTimer) {
    clearTimeout(listUpdateTimer);
  }

  listUpdateTimer = setTimeout(() => {
    updateListLive();
  }, 150);
}

function initListEventListeners() {
  // Add list element button
  document
    .querySelector('[data-type="list"]')
    ?.addEventListener("click", () => {
      addListElementToSlide();
    });

  // Initialize popover buttons
  initListPopoverButtons();

  // List type controls
  const listTypeSelect = document.getElementById("list-type");
  if (listTypeSelect) {
    listTypeSelect.addEventListener("change", debounceListUpdate);
    listTypeSelect.addEventListener("change", () => {
      pushCurrentSlideState();
    });
  }

  // List items controls
  const itemsInput = document.getElementById("list-items");
  if (itemsInput) {
    itemsInput.addEventListener("input", debounceListUpdate);
    itemsInput.addEventListener("blur", () => {
      pushCurrentSlideState();
    });
  }

  // Font size controls
  const fontSizeSelect = document.getElementById("list-font-size");
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener("change", () => {
      updateListLive();
      pushCurrentSlideState();
    });
  }

  // Font family controls
  const fontFamilySelect = document.getElementById("list-font-family");
  if (fontFamilySelect) {
    fontFamilySelect.addEventListener("change", () => {
      updateListLive();
      pushCurrentSlideState();
    });
  }

  // Color controls
  const fontColorInput = document.getElementById("list-font-color");
  if (fontColorInput) {
    fontColorInput.addEventListener("input", updateListLive);
    fontColorInput.addEventListener("change", () => {
      pushCurrentSlideState();
    });
  }

  // Spacing controls
  const lineHeightSelect = document.getElementById("list-line-height");
  if (lineHeightSelect) {
    lineHeightSelect.addEventListener("change", () => {
      updateListLive();
      pushCurrentSlideState();
    });
  }

  const itemSpacingSelect = document.getElementById("list-item-spacing");
  if (itemSpacingSelect) {
    itemSpacingSelect.addEventListener("change", () => {
      updateListLive();
      pushCurrentSlideState();
    });
  }
}

function addListElementToSlide() {
  pushCurrentSlideState();

  const newList = {
    id: store.elementIdCounter++,
    type: "list",
    listType: "disc", // disc, decimal, lower-alpha, upper-alpha, lower-roman, upper-roman, none
    items: [
      { text: "First list item", indent: 0 },
      { text: "Second list item", indent: 0 },
      { text: "Third list item", indent: 0 },
    ],
    gridX: GridUtils.getCenteredPosition(100, 100).x,
    gridY: GridUtils.getCenteredPosition(100, 100).y,
    gridWidth: 100,
    gridHeight: 100,
    zIndex: getNewZIndex(),
    fontSize: 1.5,
    fontFamily: getDefaultFont(),
    fontColor: "#212529",
    lineHeight: 1.4,
    itemSpacing: 0.5,
    originSlideIndex: store.currentSlideIndex,
    isLocked: false,
    isHidden: false, // Initialize visibility state
  };

  store.slides[store.currentSlideIndex].elements.push(newList);
  loadSlide(store.slides[store.currentSlideIndex]);
  selectElement(document.getElementById("el-" + newList.id), newList);
}

function updateListLive() {
  if (
    !window.selectedElementForUpdate ||
    window.selectedElementForUpdate.element.type !== "list"
  ) {
    return;
  }

  const element = window.selectedElementForUpdate.element;

  // Update list type
  const listTypeSelect = document.getElementById("list-type");
  if (listTypeSelect) {
    element.listType = listTypeSelect.value;
  }

  // Update items from textarea
  const itemsInput = document.getElementById("list-items");
  if (itemsInput) {
    const itemsText = itemsInput.value.trim();
    if (itemsText) {
      element.items = itemsText
        .split("\n")
        .filter((item) => item.trim() !== "")
        .map((text) => ({
          text: text.trim(),
          indent: 0,
        }));
    } else {
      element.items = [{ text: "Empty list item", indent: 0 }];
    }
  }

  // Update font size
  const fontSizeSelect = document.getElementById("list-font-size");
  if (fontSizeSelect) {
    element.fontSize = parseFloat(fontSizeSelect.value);
  }

  // Update font family
  const fontFamilySelect = document.getElementById("list-font-family");
  if (fontFamilySelect) {
    element.fontFamily = fontFamilySelect.value;
  }

  // Update font color
  const fontColorInput = document.getElementById("list-font-color");
  if (fontColorInput) {
    element.fontColor = fontColorInput.value;
  }

  // Update line height
  const lineHeightSelect = document.getElementById("list-line-height");
  if (lineHeightSelect) {
    element.lineHeight = parseFloat(lineHeightSelect.value);
  }

  // Update item spacing
  const itemSpacingSelect = document.getElementById("list-item-spacing");
  if (itemSpacingSelect) {
    element.itemSpacing = parseFloat(itemSpacingSelect.value);
  }

  // Update the list DOM directly
  updateListDOM(element);
}

function updateListDOM(element) {
  const listContainer = document.querySelector(`#el-${element.id}`);
  if (!listContainer) return;

  let listElement = listContainer.querySelector("ul, ol");
  if (!listElement) return;

  // Determine if we need to change list type (ul vs ol)
  const needsOrderedList = [
    "decimal",
    "lower-alpha",
    "upper-alpha",
    "lower-roman",
    "upper-roman",
  ].includes(element.listType);
  const isCurrentlyOrdered = listElement.tagName === "OL";

  if (needsOrderedList !== isCurrentlyOrdered) {
    // Need to replace the list element type
    const newListElement = document.createElement(
      needsOrderedList ? "ol" : "ul",
    );
    newListElement.className = listElement.className;
    newListElement.style.cssText = listElement.style.cssText;

    // Move all children
    while (listElement.firstChild) {
      newListElement.appendChild(listElement.firstChild);
    }

    listElement.parentNode.replaceChild(newListElement, listElement);
    listElement = newListElement;

    // Re-attach event listeners to children
    if (
      queryParams.mode === "edit" ||
      queryParams.mode === "template_editor" ||
      queryParams.mode === "suborg_templates"
    ) {
      Array.from(listElement.children).forEach((li) => {
        setupListItemInteractivity(li, element);
      });
    }
  }

  // Update list style type
  listElement.style.listStyleType = element.listType;

  // Update font properties
  listElement.style.fontSize = element.fontSize + "rem";
  listElement.style.fontFamily = element.fontFamily;
  listElement.style.color = element.fontColor;
  listElement.style.lineHeight = element.lineHeight;

  // Clear existing items
  listElement.innerHTML = "";

  // Add items
  element.items.forEach((item) => {
    const li = document.createElement("li");
    const itemData =
      typeof item === "string" ? { text: item, indent: 0 } : item;

    const textSpan = document.createElement("span");
    textSpan.className = "list-item-text";
    textSpan.textContent = itemData.text;
    li.appendChild(textSpan);

    li.style.marginBottom = element.itemSpacing + "rem";
    li.style.marginLeft = itemData.indent * 20 + "px";
    li.dataset.indent = itemData.indent || 0;

    // Enable editing in edit mode
    if (
      queryParams.mode === "edit" ||
      queryParams.mode === "template_editor" ||
      queryParams.mode === "suborg_templates"
    ) {
      setupListItemInteractivity(li, element);
    }

    listElement.appendChild(li);
  });
}

// Helper function used by the rendering engine in renderSlide.js
export function _renderList(el, container, isInteractivePlayback) {
  const needsOrderedList = [
    "decimal",
    "lower-alpha",
    "upper-alpha",
    "lower-roman",
    "upper-roman",
  ].includes(el.listType);
  const listElement = document.createElement(needsOrderedList ? "ol" : "ul");

  listElement.style.listStyleType = el.listType;
  listElement.style.fontSize = el.fontSize + "rem";
  listElement.style.fontFamily = el.fontFamily;
  listElement.style.color = el.fontColor;
  listElement.style.lineHeight = el.lineHeight;
  listElement.style.marginLeft = "-1.5rem";
  listElement.style.height = "100%";
  listElement.style.overflow = "hidden";

  // Add "Add Item" button in edit mode
  if (
    (!isInteractivePlayback && queryParams.mode === "edit") ||
    queryParams.mode === "template_editor"
  ) {
    const addButton = document.createElement("div");
    addButton.className = "list-add-item-btn"; // Add class for selection
    addButton.innerHTML = `<i class="material-symbols-outlined" style="font-size: 20px;">add</i>`;
    addButton.style.cssText = `
      position: absolute;
      top: 5px;
      right: 5px;
      cursor: pointer;
      z-index: 10;
      background: #007bff;
      color: white;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: none; /* Initially hidden */
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    addButton.title = gettext("Add new item");
    addButton.addEventListener("click", (e) => {
      e.stopPropagation();

      const newItemData = { text: "New item", indent: 0 };
      el.items.push(newItemData);

      const li = document.createElement("li");
      const textSpan = document.createElement("span");
      textSpan.className = "list-item-text";
      textSpan.textContent = newItemData.text;
      li.appendChild(textSpan);

      li.style.marginBottom = el.itemSpacing + "rem";
      li.style.marginLeft = newItemData.indent * 20 + "px";
      li.dataset.indent = newItemData.indent || 0;

      setupListItemInteractivity(li, el);

      listElement.appendChild(li);

      // Show controls on the newly added item since the element is selected
      const indentControls = li.querySelector(".list-indent-controls");
      if (indentControls) {
        indentControls.style.display = "flex";
      }

      // Update textarea and save state
      const itemsInput = document.getElementById("list-items");
      if (itemsInput) {
        itemsInput.value = el.items
          .map((item) => (typeof item === "string" ? item : item.text))
          .join("\n");
      }
      pushCurrentSlideState();

      // Start editing the new item
      setTimeout(() => {
        setupListItemEditMode(li, el);
      }, 50);
    });
    container.appendChild(addButton);
  }

  // Add items
  el.items.forEach((item) => {
    const li = document.createElement("li");
    const itemData =
      typeof item === "string" ? { text: item, indent: 0 } : item;

    const textSpan = document.createElement("span");
    textSpan.className = "list-item-text";
    textSpan.textContent = itemData.text;
    li.appendChild(textSpan);

    li.style.marginBottom = el.itemSpacing + "rem";
    li.style.marginLeft = itemData.indent * 20 + "px";
    li.dataset.indent = itemData.indent || 0;

    // Enable editing in edit mode
    if (
      (!isInteractivePlayback && queryParams.mode === "edit") ||
      queryParams.mode === "template_editor"
    ) {
      setupListItemInteractivity(li, el);
    }

    listElement.appendChild(li);
  });

  container.appendChild(listElement);
}

// Helper function to setup list item interactivity (editing and indentation)
function setupListItemInteractivity(li, element) {
  li.style.cursor = "text";
  li.style.position = "relative";
  li.style.paddingRight = "60px"; // Make space for controls

  // Double-click to edit
  li.addEventListener("dblclick", () => {
    setupListItemEditMode(li, element);
  });

  // Create indent controls container
  const indentControls = document.createElement("div");
  indentControls.className = "list-indent-controls";
  indentControls.style.cssText = `
    position: absolute;
    right: 40px;
    top: 50%;
    transform: translateY(-50%);
    display: none;
    gap: 4px;
    z-index: 1000;
  `;

  const indentLevel = parseInt(li.dataset.indent) || 0;

  // Indent left button
  const indentLeftBtn = document.createElement("button");
  indentLeftBtn.innerHTML = `<i class="material-symbols-outlined" style="font-size: 18px; font-family: 'Material Symbols Outlined'">keyboard_tab_rtl</i>`;
  indentLeftBtn.style.cssText = `
      background: #6c757d;
      color: white;
      border: none;
      border-radius: 3px;
      width: 22px;
      height: 22px;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
  indentLeftBtn.title = gettext("Indent left");
  indentLeftBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    indentListItem(li, element, -1);
  });
  indentControls.appendChild(indentLeftBtn);

  // Indent right button
  const indentRightBtn = document.createElement("button");
  indentRightBtn.innerHTML = `<i class="material-symbols-outlined" style="font-size: 18px; font-family: 'Material Symbols Outlined'">keyboard_tab</i>`;
  indentRightBtn.style.cssText = `
      background: #343a40;
      color: white;
      border: none;
      border-radius: 3px;
      width: 22px;
      height: 22px;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
  indentRightBtn.title = gettext("Indent right");
  indentRightBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    indentListItem(li, element, 1);
  });
  indentControls.appendChild(indentRightBtn);

  // Set visibility based on indent level
  indentLeftBtn.style.visibility = indentLevel > 0 ? "visible" : "hidden";
  indentRightBtn.style.visibility = indentLevel < 3 ? "visible" : "hidden";

  li.appendChild(indentControls);

  // Show/hide controls on hover - REMOVED
  li.addEventListener("mouseenter", () => {
    li.style.backgroundColor = "rgba(0, 123, 255, 0.05)";
    // indentControls.style.display = "flex"; // Now handled by selectElement
  });

  li.addEventListener("mouseleave", () => {
    const textSpan = li.querySelector(".list-item-text");
    if (textSpan && textSpan.contentEditable !== "true") {
      li.style.backgroundColor = "";
    }
    // indentControls.style.display = "none"; // Now handled by hideElementToolbars
  });
}

// Helper function to indent/outdent a list item
function indentListItem(li, element, direction) {
  const currentIndent = parseInt(li.dataset.indent) || 0;
  const newIndent = Math.max(0, Math.min(3, currentIndent + direction));

  if (newIndent === currentIndent) return;

  // Update visual indent
  li.style.marginLeft = newIndent * 20 + "px";
  li.dataset.indent = newIndent;

  // Update element data
  const itemIndex = Array.from(li.parentNode.children).indexOf(li);
  if (element.items[itemIndex]) {
    if (typeof element.items[itemIndex] === "string") {
      element.items[itemIndex] = {
        text: element.items[itemIndex],
        indent: newIndent,
      };
    } else {
      element.items[itemIndex].indent = newIndent;
    }
  }

  // Recreate indent controls with updated buttons
  const oldControls = li.querySelector(".list-indent-controls");
  if (oldControls) {
    oldControls.remove();
  }

  // Re-setup interactivity to get updated indent controls
  setupListItemInteractivity(li, element);

  // After re-setup, the controls are hidden by default. We need to show them again
  // because the parent list element is still selected.
  const newControls = li.querySelector(".list-indent-controls");
  if (newControls) {
    newControls.style.display = "flex";
  }

  // Save state
  pushCurrentSlideState();
}

// Helper function to setup list item edit mode functionality
function setupListItemEditMode(li, element) {
  const item = li.querySelector(".list-item-text");
  if (!item || item.contentEditable === "true") return;

  item.contentEditable = "true";
  item.focus();

  // Select all text
  const range = document.createRange();
  range.selectNodeContents(item);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  // Style for edit mode
  item.style.outline = "2px solid #007bff";
  li.style.backgroundColor = "rgba(0, 123, 255, 0.1)";

  const finishEditing = () => {
    item.contentEditable = "false";
    item.style.outline = "";
    li.style.backgroundColor = "";

    // Update the element's data
    const allItems = Array.from(li.parentNode.children).map((currentLi) => {
      return {
        text: currentLi.querySelector(".list-item-text").textContent,
        indent: parseInt(currentLi.dataset.indent) || 0,
      };
    });
    element.items = allItems;

    // Update the items textarea if it exists (for backward compatibility)
    const itemsInput = document.getElementById("list-items");
    if (itemsInput) {
      itemsInput.value = allItems.map((item) => item.text).join("\n");
    }

    // Save state
    pushCurrentSlideState();
  };

  item.addEventListener("blur", finishEditing);
  item.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      // Tab to indent right, Shift+Tab to indent left
      const direction = e.shiftKey ? -1 : 1;
      const currentIndent = parseInt(li.dataset.indent) || 0;
      const newIndent = Math.max(0, Math.min(3, currentIndent + direction));

      if (newIndent !== currentIndent) {
        li.style.marginLeft = newIndent * 20 + "px";
        li.dataset.indent = newIndent;

        // Update element data immediately
        const itemIndex = Array.from(li.parentNode.children).indexOf(li);
        if (element.items[itemIndex]) {
          if (typeof element.items[itemIndex] === "string") {
            element.items[itemIndex] = {
              text: element.items[itemIndex],
              indent: newIndent,
            };
          } else {
            element.items[itemIndex].indent = newIndent;
          }
        }
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();

      // Create a new list item after this one
      const newItemLi = document.createElement("li");
      const newItemText = document.createElement("span");
      newItemText.className = "list-item-text";
      newItemText.textContent = "New item";
      newItemLi.appendChild(newItemText);

      newItemLi.style.marginBottom = element.itemSpacing + "rem";
      const currentIndent = parseInt(li.dataset.indent) || 0;
      newItemLi.style.marginLeft = currentIndent * 20 + "px";
      newItemLi.dataset.indent = currentIndent;

      // Add interactivity to new item
      if (
        queryParams.mode === "edit" ||
        queryParams.mode === "template_editor"
      ) {
        setupListItemInteractivity(newItemLi, element);
      }

      // Insert after current item
      li.parentNode.insertBefore(newItemLi, li.nextSibling);

      // Finish editing current item and start editing new item
      finishEditing();

      // Start editing the new item
      setTimeout(() => {
        setupListItemEditMode(newItemLi, element);
      }, 50);
    }

    if (e.key === "Escape") {
      // Cancel editing and restore original text
      const itemIndex = Array.from(li.parentNode.children).indexOf(li);
      if (element.items[itemIndex]) {
        const originalText =
          typeof element.items[itemIndex] === "string"
            ? element.items[itemIndex]
            : element.items[itemIndex].text;
        item.textContent = originalText;
      }
      finishEditing();
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      // Only delete if the item is empty or if Ctrl/Cmd is held
      if (item.textContent.trim() === "" || e.ctrlKey || e.metaKey) {
        e.preventDefault();

        // Don't delete if it's the last item
        if (li.parentNode.children.length > 1) {
          const nextItemLi = li.nextElementSibling || li.previousElementSibling;
          li.remove();

          // Update element data
          const allItems = Array.from(li.parentNode.children).map(
            (currentLi) => ({
              text: currentLi.querySelector(".list-item-text").textContent,
              indent: parseInt(currentLi.dataset.indent) || 0,
            }),
          );
          element.items = allItems;

          // Update textarea if it exists
          const itemsInput = document.getElementById("list-items");
          if (itemsInput) {
            itemsInput.value = allItems.map((item) => item.text).join("\n");
          }

          // Focus next item if available
          if (nextItemLi) {
            setupListItemEditMode(nextItemLi, element);
          }

          // Save state
          pushCurrentSlideState();
          return;
        }
      }
    }
  });
}

export function setupListToolbar() {
  if (
    !window.selectedElementForUpdate ||
    window.selectedElementForUpdate.element.type !== "list"
  ) {
    return;
  }

  const element = window.selectedElementForUpdate.element;

  // Populate list type
  const listTypeSelect = document.getElementById("list-type");
  if (listTypeSelect) {
    listTypeSelect.value = element.listType || "disc";
  }

  // Populate items textarea
  const itemsInput = document.getElementById("list-items");
  if (itemsInput) {
    const itemTexts = (element.items || []).map((item) =>
      typeof item === "string" ? item : item.text,
    );
    itemsInput.value = itemTexts.join("\n");
  }

  // Populate font size
  const fontSizeSelect = document.getElementById("list-font-size");
  if (fontSizeSelect) {
    fontSizeSelect.value = element.fontSize || 1.5;
  }

  // Populate font family
  const fontFamilySelect = document.getElementById("list-font-family");
  if (fontFamilySelect) {
    fontFamilySelect.value = element.fontFamily || getDefaultFont();
  }

  // Populate font color
  const fontColorInput = document.getElementById("list-font-color");
  if (fontColorInput) {
    fontColorInput.value = element.fontColor || "#212529";
  }

  // Populate line height
  const lineHeightSelect = document.getElementById("list-line-height");
  if (lineHeightSelect) {
    lineHeightSelect.value = element.lineHeight || 1.4;
  }

  // Populate item spacing
  const itemSpacingSelect = document.getElementById("list-item-spacing");
  if (itemSpacingSelect) {
    itemSpacingSelect.value = element.itemSpacing || 0.5;
  }
}

/**
 * Populates the font family dropdown with available fonts.
 */
function populateListFontDropdowns() {
  const fontFamilySelect = document.getElementById("list-font-family");
  if (!fontFamilySelect) return;

  // Clear existing options
  fontFamilySelect.innerHTML = "";

  // Add default system fonts
  const systemFonts = [
    "Arial",
    "Helvetica",
    "Georgia",
    "Times New Roman",
    "Courier New",
  ];
  systemFonts.forEach((font) => {
    const option = document.createElement("option");
    option.value = font;
    option.textContent = font;
    fontFamilySelect.appendChild(option);
  });

  // Add custom fonts
  const customFonts = getAvailableFonts();
  if (customFonts && customFonts.length > 0) {
    const separator = document.createElement("option");
    separator.disabled = true;
    separator.textContent = "── Custom Fonts ──";
    fontFamilySelect.appendChild(separator);

    customFonts.forEach((font) => {
      const option = document.createElement("option");
      option.value = font.name;
      option.textContent = font.name;
      fontFamilySelect.appendChild(option);
    });
  }
}

/**
 * Initialize list popover buttons
 */
function initListPopoverButtons() {
  // Structure popover button
  const structureBtn = document.getElementById("list-structure-btn");
  if (structureBtn) {
    structureBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showListStructurePopover(structureBtn);
    });
  }

  // Typography popover button
  const typographyBtn = document.getElementById("list-typography-btn");
  if (typographyBtn) {
    typographyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showListTypographyPopover(typographyBtn);
    });
  }

  // Close popovers when clicking elsewhere
  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(".list-popover") &&
      !e.target.closest("[id$='-btn']")
    ) {
      document
        .querySelectorAll(".list-popover")
        .forEach((popover) => popover.remove());
    }
  });
}

/**
 * Show list structure popover
 */
function showListStructurePopover(button) {
  // Remove any existing popovers
  document.querySelectorAll(".list-popover").forEach((p) => p.remove());

  const popover = document.createElement("div");
  popover.className = "list-popover popover";
  popover.style.position = "absolute";
  popover.style.zIndex = "10000";
  popover.style.minWidth = "280px";
  popover.style.padding = "15px";

  // Header
  const header = document.createElement("h6");
  header.textContent = gettext("List Structure");
  header.style.marginBottom = "15px";
  header.style.borderBottom = "1px solid #dee2e6";
  header.style.paddingBottom = "8px";
  popover.appendChild(header);

  // List type control
  const listTypeDiv = document.createElement("div");
  listTypeDiv.className = "mb-3";
  const listTypeLabel = document.createElement("label");
  listTypeLabel.textContent = gettext("List Type:");
  listTypeLabel.className = "form-label small fw-bold";
  const listTypeSelect = document.createElement("select");
  listTypeSelect.className = "form-select form-select-sm";

  // Copy options from hidden select
  const originalListTypeSelect = document.getElementById("list-type");
  listTypeSelect.innerHTML = originalListTypeSelect.innerHTML;
  listTypeSelect.value = originalListTypeSelect.value;

  listTypeSelect.addEventListener("change", () => {
    originalListTypeSelect.value = listTypeSelect.value;
    originalListTypeSelect.dispatchEvent(new Event("change"));
  });

  listTypeDiv.appendChild(listTypeLabel);
  listTypeDiv.appendChild(listTypeSelect);
  popover.appendChild(listTypeDiv);

  // Position and show popover
  positionPopover(button, popover);
  document.body.appendChild(popover);
}

/**
 * Show list typography popover
 */
function showListTypographyPopover(button) {
  // Remove any existing popovers
  document.querySelectorAll(".list-popover").forEach((p) => p.remove());

  const popover = document.createElement("div");
  popover.className = "list-popover popover";
  popover.style.position = "absolute";
  popover.style.zIndex = "10000";
  popover.style.minWidth = "320px";
  popover.style.padding = "15px";

  // Header
  const header = document.createElement("h6");
  header.textContent = gettext("Typography");
  header.style.marginBottom = "15px";
  header.style.borderBottom = "1px solid #dee2e6";
  header.style.paddingBottom = "8px";
  popover.appendChild(header);

  // Create a row container for side-by-side controls
  const row1 = document.createElement("div");
  row1.className = "row";
  row1.style.marginBottom = "15px";

  // Font size control
  const fontSizeCol = document.createElement("div");
  fontSizeCol.className = "col-6";
  const fontSizeLabel = document.createElement("label");
  fontSizeLabel.textContent = gettext("Font Size:");
  fontSizeLabel.className = "form-label small fw-bold";
  const fontSizeSelect = document.createElement("select");
  fontSizeSelect.className = "form-select form-select-sm";

  // Copy options from hidden select
  const originalFontSizeSelect = document.getElementById("list-font-size");
  fontSizeSelect.innerHTML = originalFontSizeSelect.innerHTML;
  fontSizeSelect.value = originalFontSizeSelect.value;

  fontSizeSelect.addEventListener("change", () => {
    originalFontSizeSelect.value = fontSizeSelect.value;
    originalFontSizeSelect.dispatchEvent(new Event("change"));
  });

  fontSizeCol.appendChild(fontSizeLabel);
  fontSizeCol.appendChild(fontSizeSelect);

  // Font family control
  const fontFamilyCol = document.createElement("div");
  fontFamilyCol.className = "col-6";
  const fontFamilyLabel = document.createElement("label");
  fontFamilyLabel.textContent = gettext("Font Family:");
  fontFamilyLabel.className = "form-label small fw-bold";
  const fontFamilySelect = document.createElement("select");
  fontFamilySelect.className = "form-select form-select-sm";

  // Copy options from hidden select
  const originalFontFamilySelect = document.getElementById("list-font-family");
  fontFamilySelect.innerHTML = originalFontFamilySelect.innerHTML;
  fontFamilySelect.value = originalFontFamilySelect.value;

  fontFamilySelect.addEventListener("change", () => {
    originalFontFamilySelect.value = fontFamilySelect.value;
    originalFontFamilySelect.dispatchEvent(new Event("change"));
  });

  fontFamilyCol.appendChild(fontFamilyLabel);
  fontFamilyCol.appendChild(fontFamilySelect);

  row1.appendChild(fontSizeCol);
  row1.appendChild(fontFamilyCol);
  popover.appendChild(row1);

  // Second row for line height and item spacing
  const row2 = document.createElement("div");
  row2.className = "row";
  row2.style.marginBottom = "15px";

  // Line height control
  const lineHeightCol = document.createElement("div");
  lineHeightCol.className = "col-6";
  const lineHeightLabel = document.createElement("label");
  lineHeightLabel.textContent = gettext("Line Height:");
  lineHeightLabel.className = "form-label small fw-bold";
  const lineHeightSelect = document.createElement("select");
  lineHeightSelect.className = "form-select form-select-sm";

  // Copy options from hidden select
  const originalLineHeightSelect = document.getElementById("list-line-height");
  lineHeightSelect.innerHTML = originalLineHeightSelect.innerHTML;
  lineHeightSelect.value = originalLineHeightSelect.value;

  lineHeightSelect.addEventListener("change", () => {
    originalLineHeightSelect.value = lineHeightSelect.value;
    originalLineHeightSelect.dispatchEvent(new Event("change"));
  });

  lineHeightCol.appendChild(lineHeightLabel);
  lineHeightCol.appendChild(lineHeightSelect);

  // Item spacing control
  const itemSpacingCol = document.createElement("div");
  itemSpacingCol.className = "col-6";
  const itemSpacingLabel = document.createElement("label");
  itemSpacingLabel.textContent = gettext("Item Spacing:");
  itemSpacingLabel.className = "form-label small fw-bold";
  const itemSpacingSelect = document.createElement("select");
  itemSpacingSelect.className = "form-select form-select-sm";

  // Copy options from hidden select
  const originalItemSpacingSelect =
    document.getElementById("list-item-spacing");
  itemSpacingSelect.innerHTML = originalItemSpacingSelect.innerHTML;
  itemSpacingSelect.value = originalItemSpacingSelect.value;

  itemSpacingSelect.addEventListener("change", () => {
    originalItemSpacingSelect.value = itemSpacingSelect.value;
    originalItemSpacingSelect.dispatchEvent(new Event("change"));
  });

  itemSpacingCol.appendChild(itemSpacingLabel);
  itemSpacingCol.appendChild(itemSpacingSelect);

  row2.appendChild(lineHeightCol);
  row2.appendChild(itemSpacingCol);
  popover.appendChild(row2);

  // Font color control
  const colorDiv = document.createElement("div");
  colorDiv.className = "mb-3";
  const colorLabel = document.createElement("label");
  colorLabel.textContent = gettext("Font Color:");
  colorLabel.className = "form-label small fw-bold";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "form-control form-control-color";

  // Copy value from hidden input
  const originalColorInput = document.getElementById("list-font-color");
  colorInput.value = originalColorInput.value;

  colorInput.addEventListener("input", () => {
    originalColorInput.value = colorInput.value;
    originalColorInput.dispatchEvent(new Event("input"));
  });
  colorInput.addEventListener("change", () => {
    originalColorInput.dispatchEvent(new Event("change"));
  });

  colorDiv.appendChild(colorLabel);
  colorDiv.appendChild(colorInput);
  popover.appendChild(colorDiv);

  // Position and show popover
  positionPopover(button, popover);
  document.body.appendChild(popover);
}

/**
 * Position popover relative to button
 */
function positionPopover(button, popover) {
  const rect = button.getBoundingClientRect();
  const popoverWidth = 400; // approximate max width for list popovers

  // Position below button by default
  let top = rect.bottom + 5;
  let left = rect.left;

  // Adjust if popover would go off right edge
  if (left + popoverWidth > window.innerWidth) {
    left = window.innerWidth - popoverWidth - 10;
  }

  // Adjust if popover would go off bottom edge
  const popoverHeight = 400; // approximate height for list popovers
  if (top + popoverHeight > window.innerHeight) {
    top = rect.top - popoverHeight - 5; // Position above button instead
  }

  popover.style.top = top + "px";
  popover.style.left = left + "px";

  // Close popup when clicking outside
  setTimeout(() => {
    document.addEventListener("click", function closePopover(e) {
      if (!popover.contains(e.target)) {
        popover.remove();
        document.removeEventListener("click", closePopover);
      }
    });
  }, 10);
}
