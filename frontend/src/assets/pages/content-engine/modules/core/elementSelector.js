// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
// Removed import { openElementLinkModal } from "../modals/linkModal.js";
import { updateGridInfo, clearGridInfo } from "../utils/statusBar.js";
import { GridUtils } from "../config/gridConfig.js";
import {
  setupMediaAlignmentRadioButtons,
  setupMuteButtons,
} from "../utils/mediaElementUtils.js";
import { setupImageSizeMode } from "../elements/imageElement.js";
import { setupTableToolbar } from "../elements/tableElement.js";
import {
  updateModeRadioButtons,
  updateToolbarDropdowns,
} from "../elements/textbox.js";
import { setupQRCodeToolbar } from "../elements/qrcodeElement.js";

// Helper function to safely access toolbar-general
function setToolbarGeneralVisibility(visibility) {
  const toolbarGeneral = document.querySelector(".toolbar-general");
  if (toolbarGeneral) {
    toolbarGeneral.style.visibility = visibility;
  }
}
import { setupListToolbar } from "../elements/listElement.js";
import { pushCurrentSlideState } from "./undoRedo.js";
import { queryParams } from "../../../../utils/utils.js";
import { updatePersistButtonForSelectedElement } from "../element_formatting/persistElement.js";
import {
  updateLockButtonForSelectedElement,
  isElementLocked,
} from "../element_formatting/lockElement.js";
import { gettext } from "../../../../utils/locales.js";
import { showToast } from "../../../../utils/utils.js";
// Helper function to create a temporary wrapper element with gradient border
function createGradientWrapper(element) {
  // Remove any existing wrapper first
  removeGradientWrapper(element);

  const wrapper = document.createElement("div");
  wrapper.className = "gradient-border-wrapper";
  wrapper.style.cssText = `
    position: absolute;
    pointer-events: none;
    outline: 3px dashed yellow; box-shadow: 
    border-radius: inherit;
    z-index: 1000;
  `;

  // Position the wrapper to match the element exactly
  updateWrapperPosition(element, wrapper);

  // Insert the wrapper into the same parent as the element
  element.parentNode.insertBefore(wrapper, element);

  // Store reference to wrapper on the element
  element._gradientWrapper = wrapper;

  // Add mutation observer to track position changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (
        mutation.type === "attributes" &&
        (mutation.attributeName === "style" ||
          mutation.attributeName === "class")
      ) {
        updateWrapperPosition(element, wrapper);
      }
    });
  });

  // Observe style and class attribute changes
  observer.observe(element, {
    attributes: true,
    attributeFilter: ["style", "class"],
  });

  // Store observer reference for cleanup
  element._gradientWrapperObserver = observer;

  // Also listen for drag events if the element is draggable
  const dragHandler = () => {
    requestAnimationFrame(() => updateWrapperPosition(element, wrapper));
  };

  element.addEventListener("drag", dragHandler);
  element.addEventListener("dragend", dragHandler);

  // Store drag handler for cleanup
  element._gradientWrapperDragHandler = dragHandler;

  return wrapper;
}

// Helper function to update wrapper position
function updateWrapperPosition(element, wrapper) {
  if (!element || !wrapper) return;

  wrapper.style.left = element.offsetLeft - 3 + "px";
  wrapper.style.top = element.offsetTop - 3 + "px";
  wrapper.style.width = element.offsetWidth + 6 + "px";
  wrapper.style.height = element.offsetHeight + 6 + "px";
}

// Helper function to remove the temporary wrapper element
export function removeGradientWrapper(element) {
  if (element && element._gradientWrapper) {
    element._gradientWrapper.remove();
    delete element._gradientWrapper;
  }

  // Clean up observer
  if (element && element._gradientWrapperObserver) {
    element._gradientWrapperObserver.disconnect();
    delete element._gradientWrapperObserver;
  }

  // Clean up drag event listeners
  if (element && element._gradientWrapperDragHandler) {
    element.removeEventListener("drag", element._gradientWrapperDragHandler);
    element.removeEventListener("dragend", element._gradientWrapperDragHandler);
    delete element._gradientWrapperDragHandler;
  }
}

export function hideResizeHandles() {
  document.querySelectorAll(".resize-handle").forEach((handle) => {
    handle.style.display = "none";
  });
}

export function hideElementToolbars() {
  document.querySelectorAll(".element-type-toolbar").forEach((toolbar) => {
    toolbar.classList.remove("d-flex");
    toolbar.classList.add("d-none");
  });
  setToolbarGeneralVisibility("hidden");
  document.querySelectorAll(".slide-element").forEach((element) => {
    element.style.outline = "none";
    // Remove any gradient wrappers when hiding toolbars
    removeGradientWrapper(element);
  });

  // Hide all list element controls
  document
    .querySelectorAll(".list-add-item-btn, .list-indent-controls")
    .forEach((btn) => {
      btn.style.display = "none";
    });

  // Clear table cell edit indicators from all tables
  document.querySelectorAll("table").forEach((table) => {
    const allCells = table.querySelectorAll("th, td");
    allCells.forEach((cell) => {
      cell.style.outline = "";
      cell.contentEditable = "false";
    });
  });
}

// --- Attach one listener to the dropdown so we only do it once.
const linkDropdown = document.getElementById("elementLinkDropdown");
if (linkDropdown) {
  linkDropdown.addEventListener("change", (e) => {
    // If there's a selected element, store its new link
    if (store.selectedElementData) {
      pushCurrentSlideState(); // optionally track undo
      const chosenIndex = parseInt(e.target.value, 10);
      if (!isNaN(chosenIndex)) {
        store.selectedElementData.goToSlideIndex = chosenIndex;
      } else {
        // e.g. if user chooses “Open page by clicking ..” (empty value), remove the index
        delete store.selectedElementData.goToSlideIndex;
      }
    }
  });
}

export function selectElement(el, dataObj) {
  // Respect selection-block flag to make elements unselectable even from sidebar/canvas
  if (dataObj && dataObj.isSelectionBlocked) {
    try {
      showToast(gettext("Selection is blocked for this element"), "Info");
    } catch (err) {
      // ignore
    }
    return;
  }
  const lockElementBtn = document.getElementById("lock-element-btn");
  if (lockElementBtn) {
    if (!dataObj.isLocked && queryParams.mode !== "template_editor") {
      lockElementBtn.classList.add("d-none");
    } else {
      lockElementBtn.classList.remove("d-none");
    }
  }

  // Exit edit mode for contentEditable elements only if selecting a different element
  const activeEditableElements = document.querySelectorAll(
    '[contenteditable="true"]',
  );
  activeEditableElements.forEach((editableEl) => {
    // Only exit edit mode if the new element being selected is not the same as or within the editable element
    if (!editableEl.contains(el) && editableEl !== el) {
      editableEl.blur();
      editableEl.contentEditable = false;
    }
  });

  hideResizeHandles();
  // Make these globally accessible
  window.selectedElementForUpdate = { element: dataObj, container: el };
  store.selectedElement = el;
  store.selectedElementData = dataObj;

  // Update status bar with grid info for the selected element
  if (
    dataObj.gridX !== undefined &&
    dataObj.gridY !== undefined &&
    dataObj.gridWidth &&
    dataObj.gridHeight
  ) {
    const info = GridUtils.formatGridInfoCompact(
      dataObj.gridX,
      dataObj.gridY,
      dataObj.gridWidth,
      dataObj.gridHeight,
    );
    updateGridInfo(info);
  } else {
    clearGridInfo(); // Or show some other default text
  }

  // Update persist button state for the selected element
  updatePersistButtonForSelectedElement();

  // Update lock button state for the selected element
  updateLockButtonForSelectedElement();

  // Show resizer, etc...
  const resizer = el._resizeHandle || el.querySelector(".resize-handle");
  if (resizer) {
    // Update position before showing
    if (el._updateResizerPosition) {
      el._updateResizerPosition();
    }

    // Hide resize handle for locked elements in non-template editor mode
    if (queryParams.mode !== "template_editor" && isElementLocked(dataObj)) {
      resizer.style.display = "none";
    } else {
      resizer.style.display = "block";
    }
  }

  // ### Initialize values for the general element formatting
  const elementBgColorBtn = document.getElementById(
    "selected-element-background-color",
  );
  if (elementBgColorBtn) {
    if (el.style.backgroundColor) {
      elementBgColorBtn.style.border = "5px solid " + el.style.backgroundColor;
    } else {
      elementBgColorBtn.style.removeProperty("border");
    }
  }

  const borderBtn = document.getElementById("selected-element-border");
  if (borderBtn) {
    if (dataObj.border && typeof dataObj.border === "string") {
      let parts = dataObj.border.split(" ");
      borderBtn.style.border = "5px solid " + (parts[2] || "");
    } else {
      borderBtn.style.border = "";
    }
  }

  const borderRadiusBtn = document.getElementById(
    "selected-element-border-radius",
  );
  if (borderRadiusBtn) {
    if (dataObj.borderRadius) {
      borderRadiusBtn.style.border = "3px solid #007bff";
    } else {
      borderRadiusBtn.style.border = "";
    }
  }

  const boxShadowBtn = document.getElementById("selected-element-boxshadow");
  if (boxShadowBtn) {
    if (dataObj.boxShadowData) {
      boxShadowBtn.style.border = `3px solid ${dataObj.boxShadowData.color}`;
    } else if (dataObj.boxShadow) {
      // Legacy support
      boxShadowBtn.style.border = "5px solid " + dataObj.boxShadow;
    } else {
      boxShadowBtn.style.border = "";
    }
  }

  // Deselect previous text, etc.
  if (store.selectedElement && store.selectedElement !== el) {
    const prevTextEl = store.selectedElement.querySelector(".text-content");
    if (prevTextEl && prevTextEl.isContentEditable) {
      prevTextEl.contentEditable = "false";
      prevTextEl.blur();
    }

    // Clear table cell edit indicators if previous element was a table
    if (
      store.selectedElementData &&
      store.selectedElementData.type === "table"
    ) {
      const prevTable = store.selectedElement.querySelector("table");
      if (prevTable) {
        const allCells = prevTable.querySelectorAll("th, td");
        allCells.forEach((cell) => {
          cell.style.outline = "";
          cell.contentEditable = "false";
        });
      }
    }

    // Remove gradient wrapper from previously selected element
    removeGradientWrapper(store.selectedElement);

    store.selectedElement.style.outline = "none";
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
    }
  }

  // ### Show relevant toolbars
  if (dataObj.type === "image") {
    setupMediaAlignmentRadioButtons();
    setupImageSizeMode();
    hideElementToolbars();
    document
      .querySelector(".image-toolbar")
      ?.classList.replace("d-none", "d-flex");
    setToolbarGeneralVisibility("visible");
    el.style.outline = "3px dashed blue";
    createGradientWrapper(el);
  } else if (dataObj.type === "textbox") {
    hideElementToolbars();
    const wysiwygToolbar = document.querySelector(".wysiwyg-toolbar");
    wysiwygToolbar?.classList.replace("d-none", "d-flex");
    wysiwygToolbar?.classList.remove("disabled");
    setToolbarGeneralVisibility("visible");
    el.style.outline = "3px dashed blue";
    // Create gradient wrapper instead of applying border image directly
    createGradientWrapper(el);
    // Update mode radio buttons based on element's state
    updateModeRadioButtons();
    // Update toolbar dropdowns (font size, family, line height) based on element's properties
    updateToolbarDropdowns();
  } else if (dataObj.type === "video") {
    setupMuteButtons();
    setupMediaAlignmentRadioButtons();
    hideElementToolbars();
    document
      .querySelector(".video-toolbar")
      ?.classList.replace("d-none", "d-flex");
    setToolbarGeneralVisibility("visible");
    el.style.outline = "3px dashed blue";
    createGradientWrapper(el);
  } else if (dataObj.type === "iframe") {
    hideElementToolbars();
    document
      .querySelector(".dynamic-content-toolbar")
      ?.classList.replace("d-none", "d-flex");
    setToolbarGeneralVisibility("visible");
    el.style.outline = "3px dashed blue";
    createGradientWrapper(el);
    const elementToolbarName = document.querySelector(
      ".dynamic-content-toolbar .element-toolbar-name",
    );
    if (elementToolbarName) {
      elementToolbarName.innerText = store.selectedElementData.integrationName
        ? store.selectedElementData.integrationName
        : gettext("Dynamic Content");
    }
  } else if (dataObj.type === "embed-website") {
    setupMuteButtons();
    const changeWebsiteInput = document.getElementById("change-website-input");
    if (changeWebsiteInput) {
      changeWebsiteInput.value = dataObj.url || "";
    }
    hideElementToolbars();
    document
      .querySelector(".website-toolbar")
      ?.classList.replace("d-none", "d-flex");
    setToolbarGeneralVisibility("visible");
    el.style.outline = "3px dashed blue";
    createGradientWrapper(el);
  } else if (dataObj.type === "shape") {
    // NEW: Handle shape element type
    hideElementToolbars();
    const shapeToolbar = document.querySelector(".shape-element-toolbar");
    if (shapeToolbar) {
      shapeToolbar.classList.replace("d-none", "d-flex");

      // --- Update fill button border to current fill.
      const fillBtn = shapeToolbar.querySelector(
        'button[title="Change Fill Color"]',
      );
      if (fillBtn) {
        fillBtn.style.border = `3px solid ${dataObj.fill}`;
      }

      // --- Update outline button border.
      const outlineBtn = shapeToolbar.querySelector(
        'button[title="Change Outline Color"]',
      );
      if (outlineBtn) {
        outlineBtn.style.border = `3px solid ${dataObj.stroke}`;
      }

      // --- Update shape type buttons active state.
      shapeToolbar.querySelectorAll(".shape-type-btn").forEach((btn) => {
        if (btn.title === dataObj.shape) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      });

      // --- Update fit mode radio group.
      shapeToolbar
        .querySelectorAll('input[name="fitModeRadio"]')
        .forEach((radio) => {
          if (radio.value === dataObj.fitMode) {
            radio.checked = true;
            radio.parentElement.classList.add("active");
          } else {
            radio.checked = false;
            radio.parentElement.classList.remove("active");
          }
        });

      // --- Update stroke width input.
      // (Assuming you've added an <input type="range" class="stroke-width-input" ...> control.)
      const strokeWidthInput = shapeToolbar.querySelector(
        "input.stroke-width-input",
      );
      if (strokeWidthInput) {
        strokeWidthInput.value = dataObj.strokeWidth;
      }

      // --- Update horizontal alignment controls.
      shapeToolbar
        .querySelectorAll('input[name="hAlignRadio"]')
        .forEach((radio) => {
          if (radio.value === dataObj.alignment.h) {
            radio.checked = true;
            radio.parentElement.classList.add("active");
          } else {
            radio.checked = false;
            radio.parentElement.classList.remove("active");
          }
        });

      // --- Update vertical alignment controls.
      shapeToolbar
        .querySelectorAll('input[name="vAlignRadio"]')
        .forEach((radio) => {
          if (radio.value === dataObj.alignment.v) {
            radio.checked = true;
            radio.parentElement.classList.add("active");
          } else {
            radio.checked = false;
            radio.parentElement.classList.remove("active");
          }
        });
    }
    setToolbarGeneralVisibility("visible");
    el.style.outline = "3px dashed blue";
    createGradientWrapper(el);
  } else if (dataObj.type === "box") {
    // Box: simple generic element, show box toolbar
    hideElementToolbars();
    document
      .querySelector(".box-element-toolbar")
      ?.classList.replace("d-none", "d-flex");
    setToolbarGeneralVisibility("visible");
    el.style.outline = "3px dashed blue";
    createGradientWrapper(el);
  } else if (dataObj.type === "html") {
    // HTML Element handling
    hideElementToolbars();
    document
      .querySelector(".html-element-toolbar")
      ?.classList.replace("d-none", "d-flex");
    setToolbarGeneralVisibility("visible");
    el.style.outline = "3px dashed blue";
    createGradientWrapper(el);
  } else if (dataObj.type === "table") {
    // Table Element handling
    hideElementToolbars();
    const tableToolbar = document.getElementById("table-toolbar");
    if (tableToolbar) {
      tableToolbar.style.display = "flex";
      tableToolbar.classList.remove("d-none");
      tableToolbar.classList.add("d-flex");

      // Setup the table toolbar with current values
      setupTableToolbar();
    }
    setToolbarGeneralVisibility("visible");
    el.style.outline = "3px dashed blue";
    createGradientWrapper(el);
  } else if (dataObj.type === "list") {
    // List Element handling
    hideElementToolbars();
    const listToolbar = document.getElementById("list-toolbar");
    if (listToolbar) {
      listToolbar.style.display = "flex";
      listToolbar.classList.remove("d-none");
      listToolbar.classList.add("d-flex");

      // Setup the list toolbar with current values
      setupListToolbar();
    }
    setToolbarGeneralVisibility("visible");
    el.style.outline = "3px dashed blue";
    createGradientWrapper(el);

    // Show list-specific controls
    const addButton = el.querySelector(".list-add-item-btn");
    if (addButton) {
      addButton.style.display = "flex";
    }
    el.querySelectorAll(".list-indent-controls").forEach((controls) => {
      controls.style.display = "flex";
    });
  } else if (dataObj.type === "list") {
    // List Element handling
    hideElementToolbars();
    const listToolbar = document.getElementById("list-toolbar");
    if (listToolbar) {
      listToolbar.style.display = "flex";
      listToolbar.classList.remove("d-none");
      listToolbar.classList.add("d-flex");

      // Setup the list toolbar with current values
      setupListToolbar();
    }
    setToolbarGeneralVisibility("visible");
    el.style.outline = "3px dashed blue";
    createGradientWrapper(el);
  } else if (dataObj.type === "placeholder") {
    // Placeholder Element handling
    hideElementToolbars();
    document
      .querySelector(".placeholder-toolbar")
      ?.classList.replace("d-none", "d-flex");
    setToolbarGeneralVisibility("visible");
    el.style.outline = "3px dashed blue";
    createGradientWrapper(el);
  } else if (dataObj.type === "qrcode") {
    // QR Code Element handling
    hideElementToolbars();
    document
      .querySelector(".qrcode-toolbar")
      ?.classList.replace("d-none", "d-flex");
    setToolbarGeneralVisibility("visible");

    // Update the toolbar inputs with current values
    const urlInput = document.getElementById("qrcode-url-input");
    const darkColorInput = document.getElementById("qrcode-dark-color");
    const lightColorInput = document.getElementById("qrcode-light-color");
    const sizeSelect = document.getElementById("qrcode-size-select");
    const marginSelect = document.getElementById("qrcode-margin-select");

    if (urlInput) urlInput.value = dataObj.content || "";
    if (darkColorInput)
      darkColorInput.value = dataObj.qrOptions?.color?.dark || "#000000";
    if (lightColorInput)
      lightColorInput.value = dataObj.qrOptions?.color?.light || "#ffffff";
    if (sizeSelect) sizeSelect.value = dataObj.qrOptions?.width || "300";
    if (marginSelect) marginSelect.value = dataObj.qrOptions?.margin || "2";

    // Also update the visible toolbar controls (button borders, dataset) via the element-specific setup
    try {
      setupQRCodeToolbar(dataObj);
    } catch (err) {
      // Non-fatal: if toolbar isn't present yet, ignore
      // console.debug('setupQRCodeToolbar not available or failed', err);
    }

    el.style.outline = "3px dashed blue";
    createGradientWrapper(el);
  }

  // Add more element-type conditions if needed...

  // ### Setup the Link Dropdown (instead of the "Change Link" button):
  if (linkDropdown) {
    // Clear existing options except “Open page by clicking ..”
    linkDropdown
      .querySelectorAll("option:not([value=''])")
      .forEach((opt) => opt.remove());

    // Populate with slides from store
    const noLinkOpt = document.createElement("option");
    noLinkOpt.value = "Open page by clicking .."; // numeric index
    noLinkOpt.textContent = gettext("Open page by clicking ..");
    linkDropdown.appendChild(noLinkOpt);

    store.slides.forEach((slide, index) => {
      const opt = document.createElement("option");
      opt.value = index; // numeric index
      opt.textContent = `${index + 1}: ${slide.name}`;
      linkDropdown.appendChild(opt);
    });

    // If the element has a goToSlideIndex, select it
    if (typeof dataObj.goToSlideIndex === "number") {
      linkDropdown.value = dataObj.goToSlideIndex;
    } else {
      // If Open page by clicking .., ensure “Open page by clicking ..” (empty) is selected
      linkDropdown.value = "Open page by clicking ..";
    }

    // Show/hide or enable/disable based on slideshowMode
    linkDropdown.style.display = "none";
    linkDropdown.disabled = true;
  }
}

export function deselectElement() {
  if (store.selectedElement || store.selectedElementData) {
    // Exit edit mode for any currently contentEditable elements before deselecting
    const activeEditableElements = document.querySelectorAll(
      '[contenteditable="true"]',
    );
    activeEditableElements.forEach((editableEl) => {
      editableEl.blur();
      editableEl.contentEditable = false;
    });

    // Clear selection from store
    store.selectedElement = null;
    store.selectedElementData = null;
    window.selectedElementForUpdate = null;

    // Hide resize handles and toolbars
    hideResizeHandles();
    hideElementToolbars();

    // Clear grid info from status bar
    clearGridInfo();

    // Remove any gradient wrappers
    document
      .querySelectorAll(".gradient-border-wrapper")
      .forEach((node) => node.remove());
  }
}
