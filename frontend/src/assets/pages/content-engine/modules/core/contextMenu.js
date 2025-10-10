// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { pushCurrentSlideState } from "./undoRedo.js";
import { loadSlide } from "./renderSlide.js";
import { selectElement } from "./elementSelector.js";
import { showToast, queryParams } from "../../../../utils/utils.js";
import {
  replaceElementWithType,
  getAvailableElementTypes,
  isConversionSupported,
} from "../utils/elementTypeConverter.js";
import { GRID_CONFIG, GridUtils } from "../config/gridConfig.js";
import { isElementLocked } from "../element_formatting/lockElement.js";
import { gettext } from "../../../../utils/locales.js";

// Helper to close existing context menus/submenus.
// options: { except: Element } - an element to keep open (typically a parent menu)
function closeContextMenus(options = {}) {
  const { except } = options;
  document
    .querySelectorAll(".custom-context-menu, .element-type-submenu")
    .forEach((el) => {
      if (
        except &&
        (el === except || el.contains(except) || except.contains(el))
      )
        return;
      if (el && el.parentElement) el.remove();
    });
  // remove backdrop if present
  const back = document.getElementById("context-menu-backdrop");
  if (back && back.parentElement) back.parentElement.removeChild(back);
}

function addBackdrop() {
  if (document.getElementById("context-menu-backdrop")) return;
  const back = document.createElement("div");
  back.id = "context-menu-backdrop";
  back.style.position = "fixed";
  back.style.top = "0";
  back.style.left = "0";
  back.style.width = "100%";
  back.style.height = "100%";
  back.style.background = "transparent";
  back.style.zIndex = "9999";
  back.style.cursor = "default";
  back.addEventListener("click", (ev) => {
    ev.stopPropagation();
    closeContextMenus();
  });
  document.body.appendChild(back);
}

// Global capture-phase click handler ensures clicks outside menus close them
let _globalContextClickHandlerAdded = false;
function _globalContextClickHandler(ev) {
  // Ignore right-clicks (contextmenu) — only handle primary clicks
  if (ev.button === 2) return;
  const menus = document.querySelectorAll(
    ".custom-context-menu, .element-type-submenu",
  );
  if (!menus || menus.length === 0) return;
  // If click is inside any open menu, do nothing
  for (const m of menus) {
    if (m.contains(ev.target)) return;
  }
  // Fallback: check by coordinates in case propagation was stopped
  if (
    typeof document !== "undefined" &&
    ev.clientX != null &&
    ev.clientY != null
  ) {
    try {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      for (const m of menus) {
        if (m.contains(el)) return;
      }
    } catch (e) {
      // ignore
    }
  }
  // Otherwise close all menus
  closeContextMenus();
}

// Use pointerdown with composedPath to better detect clicks even when
// elements call stopPropagation — we defer the close by a microtask so
// other event handlers can run first (ensures we don't close menus that
// open in the same event cycle).
let _globalPointerDownHandlerAdded = false;
function _globalPointerDownHandler(ev) {
  // Ignore right-clicks
  if (ev.button === 2) return;
  const path = ev.composedPath ? ev.composedPath() : ev.path || [];
  const menus = document.querySelectorAll(
    ".custom-context-menu, .element-type-submenu",
  );
  if (!menus || menus.length === 0) return;
  for (const m of menus) {
    if (path.includes(m) || m.contains(ev.target)) return;
  }
  // Fallback: check by coordinates in case composedPath doesn't include target
  if (
    typeof document !== "undefined" &&
    ev.clientX != null &&
    ev.clientY != null
  ) {
    try {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      for (const m of menus) {
        if (m.contains(el)) return;
      }
    } catch (e) {
      // ignore
    }
  }
  // Defer closing to allow other click handlers to run first
  setTimeout(() => closeContextMenus(), 0);
}

// Register global handlers at module load so they run before other handlers
if (typeof document !== "undefined") {
  if (!_globalContextClickHandlerAdded) {
    document.addEventListener("click", _globalContextClickHandler, true);
    _globalContextClickHandlerAdded = true;
  }
  if (!_globalPointerDownHandlerAdded) {
    document.addEventListener("pointerdown", _globalPointerDownHandler, true);
    _globalPointerDownHandlerAdded = true;
  }
}

// Extra fallback: attach window-level capture handlers for mousedown/touchstart
// to catch interactions that may not surface as pointerdown in some environments
if (typeof window !== "undefined") {
  const _windowHandler = (ev) => {
    try {
      const menus = document.querySelectorAll(
        ".custom-context-menu, .element-type-submenu",
      );
      if (!menus || menus.length === 0) return;
      for (const m of menus) {
        if (m.contains(ev.target)) return;
      }
      closeContextMenus();
    } catch (e) {
      // ignore
    }
  };
  window.addEventListener("mousedown", _windowHandler, true);
  window.addEventListener("touchstart", _windowHandler, true);
}
function createElementTypeSubmenu(e, element, dataObj, parentMenu) {
  // Close any other open submenus/menus before opening this one
  closeContextMenus({ except: parentMenu });

  const submenu = document.createElement("div");
  submenu.className = "custom-context-menu element-type-submenu";
  submenu.style.position = "absolute";
  submenu.style.backgroundColor = "#fff";
  submenu.style.border = "1px solid #ccc";
  submenu.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
  submenu.style.zIndex = "10001";
  submenu.style.padding = "5px";
  submenu.style.minWidth = "180px";
  submenu.style.borderRadius = "4px";

  const parentRect = parentMenu.getBoundingClientRect();
  submenu.style.top = parentRect.top + "px";
  submenu.style.left = parentRect.right + 5 + "px";

  const submenuRect = { width: 180, height: 280 };
  if (parentRect.right + 5 + submenuRect.width > window.innerWidth) {
    submenu.style.left = parentRect.left - submenuRect.width - 5 + "px";
  }

  const header = document.createElement("div");
  header.style.padding = "8px 12px";
  header.style.borderBottom = "1px solid #eee";
  header.style.fontWeight = "bold";
  header.style.fontSize = "14px";
  header.style.color = "#666";
  header.textContent = gettext("Change to:");
  submenu.appendChild(header);

  const availableTypes = getAvailableElementTypes();

  // Add type options
  availableTypes.forEach((typeInfo) => {
    // Handle iframe/dynamic-element mapping - if element is iframe with isDynamic, treat as dynamic-element
    const currentElementType =
      dataObj.type === "iframe" && dataObj.isDynamic
        ? "dynamic-element"
        : dataObj.type;

    // Skip current type and placeholder type (placeholder should only be converted via its own button)
    if (typeInfo.type === currentElementType || typeInfo.type === "placeholder")
      return;

    // Check if conversion is supported (map iframe back to dynamic-element for the check)
    const sourceTypeForCheck =
      dataObj.type === "iframe" && dataObj.isDynamic
        ? "dynamic-element"
        : dataObj.type;
    if (!isConversionSupported(sourceTypeForCheck, typeInfo.type)) return;

    const item = document.createElement("div");
    item.style.padding = "8px 12px";
    item.style.cursor = "pointer";
    item.style.display = "flex";
    item.style.alignItems = "center";
    item.style.gap = "8px";

    const icon = document.createElement("i");
    icon.className = "material-symbols-outlined";
    icon.style.fontSize = "16px";
    icon.textContent = typeInfo.icon;
    item.appendChild(icon);

    const text = document.createElement("span");
    text.textContent = typeInfo.name;
    item.appendChild(text);

    item.addEventListener("mouseenter", () => {
      item.style.backgroundColor = "#f0f8ff";
    });
    item.addEventListener("mouseleave", () => {
      item.style.backgroundColor = "#fff";
    });

    item.addEventListener("click", () => {
      try {
        // Convert the element type
        const newElement = replaceElementWithType(dataObj, typeInfo.type);

        // Close menus
        closeContextMenus();

        // Additional handling for elements that need content
        if (typeInfo.type === "image" || typeInfo.type === "video") {
          setTimeout(() => {}, 800);
        }
      } catch (error) {
        console.error("Error converting element type:", error);
        showToast(gettext("Failed to convert element type"), "Error");
        closeContextMenus();
      }
    });

    submenu.appendChild(item);
  });

  // Add cancel option
  const cancelItem = document.createElement("div");
  cancelItem.style.padding = "8px 12px";
  cancelItem.style.cursor = "pointer";
  cancelItem.style.borderTop = "1px solid #eee";
  cancelItem.style.marginTop = "5px";
  cancelItem.style.color = "#666";
  cancelItem.style.fontStyle = "italic";
  cancelItem.textContent = gettext("Cancel");

  cancelItem.addEventListener("mouseenter", () => {
    cancelItem.style.backgroundColor = "#f5f5f5";
  });
  cancelItem.addEventListener("mouseleave", () => {
    cancelItem.style.backgroundColor = "#fff";
  });

  cancelItem.addEventListener("click", () => {
    // only remove the submenu and keep parent menu
    submenu.remove();
  });

  submenu.appendChild(cancelItem);
  document.body.appendChild(submenu);

  // Auto-remove submenu when clicking elsewhere
  setTimeout(() => {
    function removeSubmenu(ev) {
      if (!submenu.contains(ev.target) && !parentMenu.contains(ev.target)) {
        closeContextMenus();
        document.removeEventListener("click", removeSubmenu);
      }
    }
    document.addEventListener("click", removeSubmenu);
  }, 0);
}

function createElementContextMenu(e, element, dataObj) {
  e.preventDefault();
  // Close any other open context menus before creating a new one
  closeContextMenus();

  const menu = document.createElement("div");
  menu.className = "custom-context-menu";
  menu.style.position = "absolute";
  menu.style.top = e.clientY + "px";
  menu.style.left = e.clientX + "px";
  menu.style.backgroundColor = "#fff";
  menu.style.border = "1px solid #ccc";
  menu.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
  menu.style.zIndex = "10000";
  menu.style.padding = "5px";
  menu.style.minWidth = "120px";

  const options = [
    {
      label: gettext("Copy Element"),
      action: () => {
        window.copiedElementData = JSON.parse(JSON.stringify(dataObj));
        closeContextMenus();
      },
    },
  ];

  // Only add Delete Element option if the element is not locked
  // Exception: Always show in template editor mode
  // In suborg_templates mode: don't allow deleting elements locked from parent template
  const canDelete =
    !isElementLocked(dataObj) ||
    queryParams.mode === "template_editor" ||
    (queryParams.mode === "suborg_templates" && !dataObj.lockedFromParent);

  if (canDelete) {
    options.push({
      label: gettext("Delete Element"),
      action: () => {
        pushCurrentSlideState();
        store.slides[store.currentSlideIndex].elements = store.slides[
          store.currentSlideIndex
        ].elements.filter((el) => el.id !== dataObj.id);

        // Remove the element from the DOM
        const elementToRemove = document.getElementById("el-" + dataObj.id);
        if (elementToRemove) {
          elementToRemove.remove();
        }

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

        // No need to call loadSlide here as the element is directly removed
        // and store is updated. If loadSlide is essential for other reasons,
        // ensure it doesn't re-add the deleted element.
        // loadSlide(store.slides[store.currentSlideIndex]);
        closeContextMenus();
      },
    });
  }

  // Add Duplicate Element option (always available)
  options.push({
    label: gettext("Duplicate Element"),
    action: () => {
      pushCurrentSlideState();
      const newElement = JSON.parse(JSON.stringify(dataObj));
      newElement.id = store.elementIdCounter++;
      // Slightly offset the duplicated element
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
      store.slides[store.currentSlideIndex].elements.push(newElement);
      loadSlide(store.slides[store.currentSlideIndex]);
      const newElementDom = document.getElementById("el-" + newElement.id);
      if (newElementDom) {
        selectElement(newElementDom, newElement);
      }
      closeContextMenus();
    },
  });

  options.forEach((opt) => {
    const item = document.createElement("div");
    item.style.padding = "8px 12px";
    item.style.cursor = "pointer";
    item.style.display = "flex";
    item.style.alignItems = "center";
    item.style.gap = "8px";

    // Add icon if specified
    if (opt.icon) {
      const icon = document.createElement("i");
      icon.className = "material-symbols-outlined";
      icon.style.fontSize = "16px";
      icon.textContent = opt.icon;
      item.appendChild(icon);
    }

    const text = document.createElement("span");
    text.textContent = opt.label;
    item.appendChild(text);

    item.addEventListener("mouseenter", () => {
      item.style.backgroundColor = "#eee";
    });
    item.addEventListener("mouseleave", () => {
      item.style.backgroundColor = "#fff";
    });
    item.addEventListener("click", opt.action);
    menu.appendChild(item);
  });

  document.body.appendChild(menu);

  setTimeout(() => {
    function removeMenu(ev) {
      if (!menu.contains(ev.target)) {
        closeContextMenus();
        document.removeEventListener("click", removeMenu);
      }
    }

    document.addEventListener("click", removeMenu);
  }, 0);
}

function createPasteContextMenu(e) {
  e.preventDefault();
  // Close any other open context menus before creating a new one
  closeContextMenus();

  const menu = document.createElement("div");
  menu.className = "custom-context-menu";
  menu.style.position = "absolute";
  menu.style.top = e.clientY + "px";
  menu.style.left = e.clientX + "px";
  menu.style.backgroundColor = "#fff";
  menu.style.border = "1px solid #ccc";
  menu.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
  menu.style.zIndex = "10000";
  menu.style.padding = "5px";
  menu.style.minWidth = "120px";

  const pasteOption = document.createElement("div");
  pasteOption.textContent = gettext("Paste Element");
  pasteOption.style.padding = "5px 10px";
  pasteOption.style.cursor = "pointer";
  pasteOption.addEventListener("mouseenter", () => {
    pasteOption.style.backgroundColor = "#eee";
  });
  pasteOption.addEventListener("mouseleave", () => {
    pasteOption.style.backgroundColor = "#fff";
  });
  pasteOption.addEventListener("click", () => {
    if (!window.copiedElementData) {
      showToast(gettext("No element has been copied."), "Warning");
      closeContextMenus();
      return;
    }
    pushCurrentSlideState();
    const newElement = JSON.parse(JSON.stringify(window.copiedElementData));
    newElement.id = store.elementIdCounter++;
    newElement.gridX = Math.min(
      newElement.gridX + 1,
      GridUtils.getMaxGridX(newElement.gridWidth),
    );
    newElement.gridY = Math.min(
      newElement.gridY + 1,
      GridUtils.getMaxGridY(newElement.gridHeight),
    );
    newElement.originSlideIndex = store.currentSlideIndex;
    newElement.isPersistent = false;
    newElement.isLocked = false;
    store.slides[store.currentSlideIndex].elements.push(newElement);
    loadSlide(store.slides[store.currentSlideIndex]);
    const newElementDom = document.getElementById("el-" + newElement.id);
    if (newElementDom) {
      selectElement(newElementDom, newElement);
    }
    closeContextMenus();
  });
  menu.appendChild(pasteOption);

  document.body.appendChild(menu);

  setTimeout(() => {
    function removeMenu(ev) {
      if (!menu.contains(ev.target)) {
        closeContextMenus();
        document.removeEventListener("click", removeMenu);
      }
    }

    document.addEventListener("click", removeMenu);
  }, 0);
}

export function initContextMenu() {
  const previewContainer = document.querySelector(".preview-container");
  if (!previewContainer) return;

  // initContextMenu only wires the preview container listener; global handlers
  // are registered at module load.

  previewContainer.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    let target = e.target;
    while (target && !target.classList.contains("slide-element")) {
      target = target.parentElement;
    }
    if (target && target.classList.contains("slide-element")) {
      const elementId = target.id.replace("el-", "");
      const dataObj = store.slides[store.currentSlideIndex].elements.find(
        (el) => el.id == elementId,
      );
      if (dataObj) {
        selectElement(target, dataObj);
        createElementContextMenu(e, target, dataObj);
      }
    } else {
      if (window.copiedElementData) {
        createPasteContextMenu(e);
      }
    }
  });

  // Also add a capture-phase pointerdown on the preview container itself so
  // clicks on slide elements (which might stop propagation) still trigger
  // menu closing. Register only once.
  if (!previewContainer.__contextMenuPointerRegistered) {
    previewContainer.addEventListener(
      "pointerdown",
      (ev) => {
        // If the pointerdown target is inside a menu, ignore
        const menus = document.querySelectorAll(
          ".custom-context-menu, .element-type-submenu",
        );
        for (const m of menus) {
          if (m.contains(ev.target)) return;
        }
        // otherwise close menus
        closeContextMenus();
      },
      true,
    );
    previewContainer.__contextMenuPointerRegistered = true;
  }
}
