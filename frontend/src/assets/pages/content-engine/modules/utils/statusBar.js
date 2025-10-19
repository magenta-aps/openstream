// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Status bar utility for showing information at the bottom of the content engine
 */

import { queryParams, showToast } from "../../../../utils/utils.js";
import { GridUtils, GRID_CONFIG } from "../config/gridConfig.js";
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";

let statusBar = null;
let statusBarContent = null;

// Zoom state
let currentZoomMode = "fit"; // 'fit' or 'zoom'
let currentZoomLevel = 100; // percentage
let zoomChangeCallbacks = [];

/**
 * Register a callback to be called when zoom changes
 */
export function onZoomChange(callback) {
  zoomChangeCallbacks.push(callback);
}

/**
 * Notify all callbacks about zoom change
 */
function notifyZoomChange(mode, level) {
  zoomChangeCallbacks.forEach((callback) => {
    callback(mode, level);
  });
}

/**
 * Create or get the status bar element
 */
function createStatusBar() {
  if (!statusBar) {
    statusBar = document.createElement("div");
    statusBar.className = "content-engine-status-bar";
    // Use static positioning and let layout handle sizing. We'll wrap
    // the preview area and append the status bar as a flex child so it
    // automatically fills available width and sits below the preview.
    statusBar.style.cssText = `
      height: 32px;
      background: linear-gradient(90deg, #2c3e50 0%, #34495e 100%);
      border-top: 1px solid #34495e;
      display: flex;
      align-items: center;
      padding: 0 16px;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 12px;
      color: #ecf0f1;
      box-sizing: border-box;
      z-index: 10;
      opacity: 0;
      transform: translateY(100%);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      width: 100%;
    `;

    // Create content container (left side for grid info)
    statusBarContent = document.createElement("div");
    statusBarContent.className = "status-bar-left";
    statusBarContent.style.cssText = `
      flex: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    `;

    // Create grid info section
    const gridInfoSection = document.createElement("div");
    gridInfoSection.className = "status-bar-grid-info";
    gridInfoSection.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      color: white;
      font-weight: 500;
      min-width: 0;
    `;

    const gridIcon = document.createElement("span");
    gridIcon.textContent = "⌗";
    gridIcon.style.cssText = `
      font-size: 14px;
      opacity: 0.8;
    `;

    const gridText = document.createElement("span");
    gridText.className = "grid-info-text";
    gridText.textContent = "Ready";
    gridText.style.cssText = `
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    gridInfoSection.appendChild(gridIcon);
    gridInfoSection.appendChild(gridText);
    statusBarContent.appendChild(gridInfoSection);

    // Add CSS for interactive elements
    addInteractiveStyles();

    // Add event delegation for interactive elements
    setupInteractiveHandlers(statusBar);

    // Add space for future features on the right
    const rightSection = document.createElement("div");
    rightSection.className = "status-bar-right";
    rightSection.style.cssText = `
      display: flex;
      align-items: center;
      gap: 16px;
    `;

    // Create zoom controls
    createZoomControls(rightSection);

    statusBar.appendChild(statusBarContent);
    statusBar.appendChild(rightSection);

    // Ensure preview area is wrapped so the status bar can sit below it
    const slideCanvas = document.querySelector(".slide-canvas");
    if (slideCanvas) {
      // Look for an existing preview-column wrapper
      let previewColumn = slideCanvas.querySelector(".preview-column");
      const previewContainer = slideCanvas.querySelector(".preview-container");

      if (!previewColumn) {
        // Create a column wrapper that stacks the preview and status bar
        previewColumn = document.createElement("div");
        previewColumn.className = "preview-column";
        // Move preview-container into the new column if present
        if (previewContainer) {
          slideCanvas.insertBefore(previewColumn, previewContainer);
          previewColumn.appendChild(previewContainer);
        } else {
          slideCanvas.appendChild(previewColumn);
        }
      }

      // Append status bar to the preview column so it fills the width
      previewColumn.appendChild(statusBar);
    } else {
      // Fallback: append directly to body
      document.body.appendChild(statusBar);
    }
  }
  return statusBar;
}

/**
 * Show the status bar with optional animation
 */
export function showStatusBar() {
  const bar = createStatusBar();
  bar.style.opacity = "1";
  bar.style.transform = "translateY(0)";
}

/**
 * Hide the status bar
 */
export function hideStatusBar() {
  if (statusBar) {
    statusBar.style.opacity = "0";
    statusBar.style.transform = "translateY(100%)";
  }
}

/**
 * Update grid information in the status bar
 * @param {string} info - The grid information text to display
 */
export function updateGridInfo(info) {
  const bar = createStatusBar(); // Ensure status bar exists
  showStatusBar(); // Make sure it's visible
  const gridText = bar.querySelector(".grid-info-text");
  if (gridText) {
    gridText.innerHTML = createInteractiveGridInfo(info);
  }
}

/**
 * Create interactive HTML for grid information with clickable position and size values
 * @param {string} info - The original grid information text
 * @returns {string} HTML string with interactive elements
 */
function createInteractiveGridInfo(info) {
  // Parse the info string to extract position and size values
  const positionMatch = info.match(/Position: \((\d+), (\d+)\)/);
  const sizeMatch = info.match(/Size: (\d+) × (\d+)/);

  if (!positionMatch || !sizeMatch) {
    return info; // Return original if we can't parse it
  }

  const [, posX, posY] = positionMatch;
  const [, sizeWidth, sizeHeight] = sizeMatch;

  // Replace the position and size parts with interactive elements
  let interactiveInfo = info.replace(
    /Position: \(\d+, \d+\)/,
    `Position: (<span class="editable-value" data-type="position" data-axis="x" data-value="${posX}" title="Click to edit X position (1-${GRID_CONFIG.COLUMNS})">${posX}</span>, <span class="editable-value" data-type="position" data-axis="y" data-value="${posY}" title="Click to edit Y position (1-${GRID_CONFIG.ROWS})">${posY}</span>)`,
  );

  interactiveInfo = interactiveInfo.replace(
    /Size: \d+ × \d+/,
    `Size: <span class="editable-value" data-type="size" data-axis="width" data-value="${sizeWidth}" title="Click to edit width (1-${GRID_CONFIG.COLUMNS})">${sizeWidth}</span> × <span class="editable-value" data-type="size" data-axis="height" data-value="${sizeHeight}" title="Click to edit height (1-${GRID_CONFIG.ROWS})">${sizeHeight}</span>`,
  );

  return interactiveInfo;
}

/**
 * Clear grid information (show ready state)
 */
export function clearGridInfo() {
  const bar = createStatusBar();
  const gridText = bar.querySelector(".grid-info-text");
  if (gridText) {
    gridText.textContent = "Ready";
  }
}

/**
 * Add content to the right section of the status bar
 * @param {HTMLElement} element - Element to add to the right section
 */
export function addToRightSection(element) {
  createStatusBar();
  const rightSection = statusBar.querySelector(".status-bar-right");
  if (rightSection) {
    rightSection.appendChild(element);
  }
}

/**
 * Create zoom controls for the status bar
 */
function createZoomControls(rightSection) {
  // Only show zoom controls in edit modes
  if (
    queryParams.mode !== "edit" &&
    queryParams.mode !== "template_editor" &&
    queryParams.mode !== "suborg_templates"
  ) {
    return;
  }

  // Create main container to keep layout stable
  const zoomControlsContainer = document.createElement("div");
  zoomControlsContainer.className = "zoom-controls-container";
  zoomControlsContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    color: #ecf0f1;
    font-size: 11px;
    user-select: none;
  `;

  // Zoom slider container (initially hidden, positioned first)
  const zoomSliderContainer = document.createElement("div");
  zoomSliderContainer.className = "zoom-slider-container";
  zoomSliderContainer.style.cssText = `
    display: none;
    align-items: center;
    gap: 6px;
    color: #ecf0f1;
    font-size: 11px;
    min-width: 120px;
  `;

  const zoomSlider = document.createElement("input");
  zoomSlider.type = "range";
  zoomSlider.min = "25";
  zoomSlider.max = "400";
  zoomSlider.value = "100";
  zoomSlider.style.cssText = `
    width: 70px;
    height: 4px;
    background: #34495e;
    outline: none;
    border-radius: 2px;
    cursor: pointer;
  `;

  const zoomLabel = document.createElement("span");
  zoomLabel.textContent = "100%";
  zoomLabel.style.cssText = `
    min-width: 35px;
    text-align: center;
    font-weight: 500;
    color: #ecf0f1;
    background: #34495e;
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid #2c3e50;
  `;

  // Zoom mode toggle buttons
  const zoomModeToggle = document.createElement("div");
  zoomModeToggle.className = "zoom-mode-toggle";
  zoomModeToggle.style.cssText = `
    display: flex;
    align-items: center;
    gap: 4px;
    background: #2c3e50;
    border-radius: 6px;
    padding: 1px;
    border: 1px solid #34495e;
  `;

  const zoomButton = document.createElement("button");
  zoomButton.className = "zoom-mode-btn";
  zoomButton.textContent = "Zoom";
  zoomButton.style.cssText = `
    background: transparent;
    border: none;
    color: #bdc3c7;
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  `;

  const fitButton = document.createElement("button");
  fitButton.className = "zoom-mode-btn active";
  fitButton.textContent = "Fit";
  fitButton.style.cssText = `
    background: #3498db;
    border: none;
    color: white;
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  `;

  // Event handlers
  fitButton.addEventListener("click", () => {
    if (currentZoomMode !== "fit") {
      currentZoomMode = "fit";

      document
        .getElementById("right-content-container")
        .classList.remove("resize-for-zoom");

      // Update button styles
      fitButton.style.cssText = `
        background: #3498db;
        border: none;
        color: white;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      `;

      zoomButton.style.cssText = `
        background: transparent;
        border: none;
        color: #bdc3c7;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      `;

      zoomSliderContainer.style.display = "none";
      notifyZoomChange("fit", 100);
    }
  });

  zoomButton.addEventListener("click", () => {
    if (currentZoomMode !== "zoom") {
      currentZoomMode = "zoom";

      document
        .getElementById("right-content-container")
        .classList.add("resize-for-zoom");

      // Update button styles
      zoomButton.style.cssText = `
        background: #3498db;
        border: none;
        color: white;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      `;

      fitButton.style.cssText = `
        background: transparent;
        border: none;
        color: #bdc3c7;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      `;

      zoomSliderContainer.style.display = "flex";
      notifyZoomChange("zoom", currentZoomLevel);
    }
  });

  zoomSlider.addEventListener("input", (e) => {
    currentZoomLevel = parseInt(e.target.value);
    zoomLabel.textContent = currentZoomLevel + "%";
    if (currentZoomMode === "zoom") {
      notifyZoomChange("zoom", currentZoomLevel);
    }
  });

  // Add mouse wheel support for the zoom slider
  zoomSlider.addEventListener("wheel", (e) => {
    e.preventDefault(); // Prevent page scrolling

    const step = 10; // 10% increments
    const delta = e.deltaY > 0 ? -step : step; // Invert for natural scrolling
    const newValue = Math.max(25, Math.min(400, currentZoomLevel + delta));

    currentZoomLevel = newValue;
    zoomSlider.value = newValue.toString();
    zoomLabel.textContent = newValue + "%";

    if (currentZoomMode === "zoom") {
      notifyZoomChange("zoom", currentZoomLevel);
    }
  });

  // Add elements to containers - slider first, then buttons
  zoomSliderContainer.appendChild(zoomSlider);
  zoomSliderContainer.appendChild(zoomLabel);

  zoomModeToggle.appendChild(zoomButton);
  zoomModeToggle.appendChild(fitButton);

  // Add to main container in order: slider, then toggle buttons
  zoomControlsContainer.appendChild(zoomSliderContainer);
  zoomControlsContainer.appendChild(zoomModeToggle);

  rightSection.appendChild(zoomControlsContainer);
}

/**
 * Get current zoom mode and level
 */
export function getCurrentZoom() {
  return {
    mode: currentZoomMode,
    level: currentZoomLevel,
  };
}

/**
 * Set zoom mode and level programmatically
 */
export function setZoom(mode, level = 100) {
  currentZoomMode = mode;
  currentZoomLevel = level;

  // Update UI
  const statusBarElement = document.querySelector(".content-engine-status-bar");
  if (statusBarElement) {
    const zoomBtn = statusBarElement.querySelector(
      ".zoom-mode-btn:first-child",
    );
    const fitBtn = statusBarElement.querySelector(".zoom-mode-btn:last-child");
    const slider = statusBarElement.querySelector('input[type="range"]');
    const label = statusBarElement.querySelector(".zoom-slider-container span");
    const sliderContainer = statusBarElement.querySelector(
      ".zoom-slider-container",
    );

    if (mode === "fit") {
      if (fitBtn) {
        fitBtn.style.cssText = `
          background: #3498db;
          border: none;
          color: white;
          padding: 5px 10px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        `;
      }
      if (zoomBtn) {
        zoomBtn.style.cssText = `
          background: transparent;
          border: none;
          color: #bdc3c7;
          padding: 5px 10px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        `;
      }
      if (sliderContainer) {
        sliderContainer.style.display = "none";
      }
    } else {
      if (zoomBtn) {
        zoomBtn.style.cssText = `
          background: #3498db;
          border: none;
          color: white;
          padding: 5px 10px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        `;
      }
      if (fitBtn) {
        fitBtn.style.cssText = `
          background: transparent;
          border: none;
          color: #bdc3c7;
          padding: 5px 10px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        `;
      }
      if (sliderContainer) {
        sliderContainer.style.display = "flex";
      }
      if (slider) {
        slider.value = level.toString();
      }
      if (label) {
        label.textContent = level + "%";
      }
    }
  }

  notifyZoomChange(mode, level);
}

/**
 * Initialize the status bar (call this when the content engine loads)
 */
export function initStatusBar() {
  if (queryParams.mode !== "slideshow-player") {
    createStatusBar();
  // Auto-show the status bar when initialized
  setTimeout(() => showStatusBar(), 100);
  }
}

/**
 * Add CSS styles for interactive elements
 */
function addInteractiveStyles() {
  const styleId = "status-bar-interactive-styles";
  if (document.getElementById(styleId)) return; // Already added

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .grid-info-text .editable-value {
      color: #3498db !important;
      cursor: pointer;
      padding: 1px 3px;
      border-radius: 2px;
      transition: all 0.2s ease;
      border: 1px solid transparent;
      display: inline-block;
      min-width: 16px;
      text-align: center;
    }
    
    .grid-info-text .editable-value:hover {
      background-color: rgba(52, 152, 219, 0.2);
      border-color: #3498db;
    }
    
    .grid-info-text .editable-value.editing {
      background-color: #ffffff;
      color: #2c3e50 !important;
      border-color: #3498db;
      outline: none;
    }
    
    .grid-info-text .editable-input {
      background: #ffffff;
      color: #2c3e50;
      border: 1px solid #3498db;
      border-radius: 2px;
      padding: 1px 3px;
      font-size: 12px;
      font-family: inherit;
      width: 48px;
      text-align: center;
      outline: none;
      transition: all 0.2s ease;
    }
    
    .grid-info-text .editable-input:invalid,
    .grid-info-text .editable-input[style*="border-color: rgb(231, 76, 60)"] {
      border-color: #e74c3c !important;
      background-color: #ffebee !important;
      box-shadow: 0 0 3px rgba(231, 76, 60, 0.3);
    }
    
    .grid-info-text .editable-input:valid,
    .grid-info-text .editable-input[style*="border-color: rgb(52, 152, 219)"] {
      border-color: #3498db !important;
      background-color: #ffffff !important;
      box-shadow: 0 0 3px rgba(52, 152, 219, 0.3);
    }
  `;

  document.head.appendChild(style);
}

/**
 * Setup event handlers for interactive elements
 */
function setupInteractiveHandlers(statusBar) {
  statusBar.addEventListener("click", handleEditableClick);
  statusBar.addEventListener("keydown", handleEditableKeydown);
  statusBar.addEventListener("blur", handleEditableBlur, true); // Use capture
}

/**
 * Handle clicks on editable values
 */
function handleEditableClick(e) {
  if (
    !e.target.classList.contains("editable-value") ||
    e.target.classList.contains("editing")
  ) {
    return;
  }

  e.stopPropagation();
  startEditing(e.target);
}

/**
 * Handle keydown events on editable elements
 */
function handleEditableKeydown(e) {
  if (!e.target.classList.contains("editable-input")) return;

  if (e.key === "Enter") {
    e.preventDefault();
    finishEditing(e.target, true);
  } else if (e.key === "Escape") {
    e.preventDefault();
    finishEditing(e.target, false);
  }
}

/**
 * Handle blur events on editable elements
 */
function handleEditableBlur(e) {
  if (!e.target.classList.contains("editable-input")) return;

  // Small delay to allow click events to process first
  setTimeout(() => {
    finishEditing(e.target, true);
  }, 100);
}

/**
 * Start editing a value
 */
function startEditing(element) {
  const currentValue = element.dataset.value;
  const type = element.dataset.type;
  const axis = element.dataset.axis;

  // Create input element
  const input = document.createElement("input");
  input.type = "number";
  input.className = "editable-input";
  input.value = currentValue;
  input.dataset.originalValue = currentValue;
  input.dataset.type = type;
  input.dataset.axis = axis;
  input.min = type === "position" ? "1" : "1"; // Position is 1-based, size minimum is 1

  // Set appropriate max values based on current element state
  const currentElement = store.selectedElementData;
  if (currentElement) {
    if (type === "position") {
      if (axis === "x") {
        // Max X position = COLUMNS - width + 1 (to account for 1-based indexing)
        const maxX = GRID_CONFIG.COLUMNS - currentElement.gridWidth + 1;
        input.max = maxX.toString();
      } else {
        // Max Y position = ROWS - height + 1 (to account for 1-based indexing)
        const maxY = GRID_CONFIG.ROWS - currentElement.gridHeight + 1;
        input.max = maxY.toString();
      }
    } else if (type === "size") {
      if (axis === "width") {
        // Max width = COLUMNS - currentX + 1 (to account for 1-based indexing)
        const maxWidth = GRID_CONFIG.COLUMNS - currentElement.gridX;
        input.max = maxWidth.toString();
      } else {
        // Max height = ROWS - currentY + 1 (to account for 1-based indexing)
        const maxHeight = GRID_CONFIG.ROWS - currentElement.gridY;
        input.max = maxHeight.toString();
      }
    }
  } else {
    // Fallback to basic limits if no element selected
    if (type === "position") {
      input.max = (
        axis === "x" ? GRID_CONFIG.COLUMNS : GRID_CONFIG.ROWS
      ).toString();
    } else {
      input.max = (
        axis === "width" ? GRID_CONFIG.COLUMNS : GRID_CONFIG.ROWS
      ).toString();
    }
  }

  // Add real-time validation on input
  input.addEventListener("input", () => {
    validateInputValue(input);
  });

  // Replace element with input
  element.parentNode.replaceChild(input, element);
  input.focus();
  input.select();
}

/**
 * Validate input value against grid constraints
 */
function validateInputValue(input) {
  const type = input.dataset.type;
  const axis = input.dataset.axis;
  const value = parseInt(input.value);
  const currentElement = store.selectedElementData;

  if (!currentElement || isNaN(value)) {
    return false;
  }

  let isValid = true;
  let errorMessage = "";

  if (type === "position") {
    if (axis === "x") {
      // Check if position + width fits within grid
      const maxAllowedX = GRID_CONFIG.COLUMNS - currentElement.gridWidth + 1;
      if (value < 1 || value > maxAllowedX) {
        isValid = false;
        errorMessage = `X position must be between 1 and ${maxAllowedX} (width: ${currentElement.gridWidth})`;
      }
    } else if (axis === "y") {
      // Check if position + height fits within grid
      const maxAllowedY = GRID_CONFIG.ROWS - currentElement.gridHeight + 1;
      if (value < 1 || value > maxAllowedY) {
        isValid = false;
        errorMessage = `Y position must be between 1 and ${maxAllowedY} (height: ${currentElement.gridHeight})`;
      }
    }
  } else if (type === "size") {
    if (axis === "width") {
      // Check if current position + new width fits within grid
      const maxAllowedWidth = GRID_CONFIG.COLUMNS - currentElement.gridX;
      if (value < 1 || value > maxAllowedWidth) {
        isValid = false;
        errorMessage = `Width must be between 1 and ${maxAllowedWidth} (X position: ${currentElement.gridX + 1})`;
      }
    } else if (axis === "height") {
      // Check if current position + new height fits within grid
      const maxAllowedHeight = GRID_CONFIG.ROWS - currentElement.gridY;
      if (value < 1 || value > maxAllowedHeight) {
        isValid = false;
        errorMessage = `Height must be between 1 and ${maxAllowedHeight} (Y position: ${currentElement.gridY + 1})`;
      }
    }
  }

  // Visual feedback
  if (isValid) {
    input.style.borderColor = "#3498db";
    input.style.backgroundColor = "#ffffff";
    input.title = "";
  } else {
    input.style.borderColor = "#e74c3c";
    input.style.backgroundColor = "#ffebee";
    input.title = errorMessage;
  }

  return isValid;
}

/**
 * Finish editing and apply changes
 */
function finishEditing(input, applyChanges) {
  const originalValue = input.dataset.originalValue;
  const newValue = applyChanges ? input.value : originalValue;
  const type = input.dataset.type;
  const axis = input.dataset.axis;

  // Validate the new value before applying
  let validatedValue = newValue;
  if (applyChanges && newValue !== originalValue) {
    // Set the input value for validation
    input.value = newValue;
    if (!validateInputValue(input)) {
      // If invalid, revert to original value
      validatedValue = originalValue;
      // Show a toast message about the invalid value
      showToast(
        "Invalid value. Position and size must fit within the grid.",
        "Error",
      );
    }
  }

  // Create new span element
  const span = document.createElement("span");
  span.className = "editable-value";
  span.dataset.type = type;
  span.dataset.axis = axis;
  span.dataset.value = validatedValue;
  span.textContent = validatedValue;
  span.title = `Click to edit ${axis === "x" ? "X position" : axis === "y" ? "Y position" : axis === "width" ? "width" : "height"}`;

  // Replace input with span
  input.parentNode.replaceChild(span, input);

  // Apply changes to the selected element if value changed and is valid
  if (
    applyChanges &&
    validatedValue !== originalValue &&
    validateFinalValue(type, axis, parseInt(validatedValue))
  ) {
    applyValueChange(
      type,
      axis,
      parseInt(validatedValue),
      parseInt(originalValue),
    );
  }
}

/**
 * Final validation before applying changes
 */
function validateFinalValue(type, axis, newValue) {
  const currentElement = store.selectedElementData;
  if (!currentElement) return false;

  // Create a temporary copy of the element data to test the new value
  const testElement = { ...currentElement };

  if (type === "position") {
    if (axis === "x") {
      testElement.gridX = newValue - 1; // Convert to 0-based
    } else {
      testElement.gridY = newValue - 1; // Convert to 0-based
    }
  } else if (type === "size") {
    if (axis === "width") {
      testElement.gridWidth = newValue;
    } else {
      testElement.gridHeight = newValue;
    }
  }

  // Check if the combination fits within grid boundaries
  const fitsX =
    testElement.gridX >= 0 &&
    testElement.gridX + testElement.gridWidth <= GRID_CONFIG.COLUMNS;
  const fitsY =
    testElement.gridY >= 0 &&
    testElement.gridY + testElement.gridHeight <= GRID_CONFIG.ROWS;

  return fitsX && fitsY;
}

/**
 * Apply the changed value to the selected element
 */
function applyValueChange(type, axis, newValue, originalValue) {
  if (!store.selectedElement || !store.selectedElementData) {
    console.warn("No element selected for value change");
    return;
  }

  // Double-check validation before applying
  if (!validateFinalValue(type, axis, newValue)) {
    console.warn("Invalid value combination, reverting changes");
    // Re-update the status bar to show the original values
    const info = GridUtils.formatGridInfoCompact(
      store.selectedElementData.gridX,
      store.selectedElementData.gridY,
      store.selectedElementData.gridWidth,
      store.selectedElementData.gridHeight,
    );
    updateGridInfo(info);
    return;
  }

  // Push undo state before making changes
  pushCurrentSlideState();

  const element = store.selectedElement;
  const dataObj = store.selectedElementData;

  if (type === "position") {
    if (axis === "x") {
      // Update X position (convert from 1-based to 0-based)
      const newGridX = newValue - 1;
      element.style.gridColumnStart = newValue.toString();
      dataObj.gridX = newGridX;
    } else if (axis === "y") {
      // Update Y position (convert from 1-based to 0-based)
      const newGridY = newValue - 1;
      element.style.gridRowStart = newValue.toString();
      dataObj.gridY = newGridY;
    }
  } else if (type === "size") {
    if (axis === "width") {
      // Update width
      element.style.gridColumnEnd = `span ${newValue}`;
      dataObj.gridWidth = newValue;
    } else if (axis === "height") {
      // Update height
      element.style.gridRowEnd = `span ${newValue}`;
      dataObj.gridHeight = newValue;
    }
  }

  // Update the status bar to reflect the changes
  const info = GridUtils.formatGridInfoCompact(
    dataObj.gridX,
    dataObj.gridY,
    dataObj.gridWidth,
    dataObj.gridHeight,
  );
  updateGridInfo(info);
}
