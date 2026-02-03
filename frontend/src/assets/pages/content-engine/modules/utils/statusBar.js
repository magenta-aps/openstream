// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Status bar utility for showing information at the bottom of the content engine
 */

import { queryParams, showToast } from "../../../../utils/utils.js";
import { gettext } from "../../../../utils/locales.js";
import { getDefaultCellSnapForResolution } from "../../../../utils/availableAspectRatios.js";
import {
  GridUtils,
  GRID_CONFIG,
  onGridDimensionsChange,
} from "../config/gridConfig.js";
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { createToggleButton, createCoherentDropdown } from "./components.js";

let statusBar = null;
let statusBarContent = null;
let gridSizeBadge = null;
let unsubscribeGridChange = null;
let snapControlsContainer = null;
let snapAmountSelect = null;
let snapAmountManualInput = null;
let snapAmountPrefix = null;
let snapAmountSuffix = null;
let snapModeButtons = null;

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

    // Create content container (left side for grid info)
    statusBarContent = document.createElement("div");
    statusBarContent.className = "status-bar-left";

    // Create grid info section
    const gridInfoSection = document.createElement("div");
    gridInfoSection.className = "status-bar-grid-info";


    const gridIcon = document.createElement("span");
    gridIcon.textContent = "⌗";
    gridIcon.style.cssText = `
      font-size: 14px;
      opacity: 0.8;
    `;

    const gridText = document.createElement("span");
    gridText.className = "grid-info-text";
    gridText.textContent = "Ready";


    gridSizeBadge = document.createElement("span");
    gridSizeBadge.className = "grid-size-badge";


    updateGridSizeDisplay();
    ensureGridSizeSubscription();

    gridInfoSection.appendChild(gridIcon);
    gridInfoSection.appendChild(gridSizeBadge);
    gridInfoSection.appendChild(gridText);
    statusBarContent.appendChild(gridInfoSection);

    // Add CSS for interactive elements
    addInteractiveStyles();

    // Add event delegation for interactive elements
    setupInteractiveHandlers(statusBar);

    // Add space for future features on the right
    const rightSection = document.createElement("div");
    rightSection.className = "status-bar-right";

    // Create controls (snap first, zoom last)
    createSnapControls(rightSection);
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

function ensureGridSizeSubscription() {
  if (unsubscribeGridChange) {
    return;
  }
  unsubscribeGridChange = onGridDimensionsChange(({ columns, rows }) => {
    updateGridSizeDisplay(columns, rows);
    updateSnapAmountOptions(columns, rows);
    updateSnapControlsUI();
  });
}

function updateGridSizeDisplay(
  columns = GRID_CONFIG.COLUMNS,
  rows = GRID_CONFIG.ROWS,
) {
  if (!gridSizeBadge) {
    return;
  }
  gridSizeBadge.textContent = `${gettext("Grid")}: ${columns} × ${rows}`;
  gridSizeBadge.title = `${gettext("Grid size")}: ${columns} × ${rows}`;
}

function createSnapControls(rightSection) {
  if (
    queryParams.mode !== "edit" &&
    queryParams.mode !== "template_editor" &&
    queryParams.mode !== "suborg_templates"
  ) {
    return;
  }

  snapControlsContainer = document.createElement("div");
  snapControlsContainer.className = "snap-controls";
  snapControlsContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--bs-darkest-gray);
    background: var(--bs-gray);
    border-radius: 6px;
  `;

  // Snap toggle button (on/off)
  const snapToggle = createToggleButton(
    { label: gettext("free-movement"), fn: toggleSnapEnabled },
    { label: gettext("snapping"), fn: toggleSnapEnabled },
    true,
  );

  const snapLabel = document.createElement("span");
  snapLabel.textContent = `${gettext("Snap to")}:`;
  snapLabel.style.fontWeight = "600";

  const snapModeToggle = createCoherentDropdown(
    {
      type: "reg",
      options: [
        { name: gettext("Grid"), value: "grid" },
        { name: gettext("Pixels"), value: "pixels" },
      ],
      onUpdate: (_name, value) => {
        const setAltMode = snapModeToggle.rightDropdown.setMode;
        if (value === "grid") {
          setAltMode("set-value");
        } else {
          setAltMode("set-max");
        }
      },
      position: { row: "top", column: "center" },
    },
    {
      type: "alt",
      mode: "set-value",
      options: [
        { name: "1", value: "1" },
        { name: "2", value: "2" },
        { name: "3", value: "3" },
        { name: "4", value: "4" },
        { name: "5", value: "5" },
        { name: "6", value: "6" },
        { name: "7", value: "7" },
        { name: "8", value: "8" },
        { name: "9", value: "9" },
        { name: "10", value: "10" },
        { name: "12", value: "12" },
        { name: "15", value: "15" },
        { name: "20", value: "20" },
        { name: "20", value: "20" },
        { name: "24", value: "24", defaultMax: true },
        { name: "30", value: "30" },
        { name: "40", value: "40" },
        { name: "60", value: "60" },
        { name: "120", value: "120" },
      ],
      onUpdate: (name, value) => {},
      position: { row: "top", column: "center" },
    },
  );
  /* TODO: Remove
  const snapAmountGroup = document.createElement("div");
  snapAmountGroup.className = "snap-amount-group";
  snapAmountGroup.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--bs-darker-gray);
    border-radius: 4px;
    padding: 2px 6px;
    background: var(--bs-white);
  `;

  snapAmountPrefix = document.createElement("span");
  snapAmountPrefix.style.cssText = `
    font-weight: 600;
    color: var(--bs-darkest-gray);
    font-variant-numeric: tabular-nums;
  `;

  snapAmountSelect = document.createElement("select");
  snapAmountSelect.className = "snap-amount-select";
  snapAmountSelect.style.cssText = `
    border: none;
    outline: none;
    font-size: 11px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    background: transparent;
    appearance: none;
    padding: 2px 16px 2px 6px;
    min-width: 64px;
    cursor: pointer;
  `;

  snapAmountSuffix = document.createElement("span");
  snapAmountSuffix.style.cssText = `
    font-weight: 600;
    color: var(--bs-darkest-gray);
  `;

  snapAmountGroup.appendChild(snapAmountPrefix);
  snapAmountGroup.appendChild(snapAmountSelect);

  snapAmountManualInput = document.createElement("input");
  snapAmountManualInput.type = "number";
  snapAmountManualInput.min = "1";
  snapAmountManualInput.step = "1";
  snapAmountManualInput.style.cssText = `
    width: 48px;
    border: none;
    outline: none;
    font-size: 11px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    background: transparent;
    display: none;
  `;

  snapAmountManualInput.addEventListener("change", () => {
    const sanitized = sanitizeSnapAmount(snapAmountManualInput.value);
    snapAmountManualInput.value = sanitized.toString();
    setSnapSettings({ amount: sanitized });
  });

  snapAmountManualInput.addEventListener("blur", () => {
    const sanitized = sanitizeSnapAmount(snapAmountManualInput.value);
    snapAmountManualInput.value = sanitized.toString();
  });

  snapAmountGroup.appendChild(snapAmountManualInput);
  snapAmountGroup.appendChild(snapAmountSuffix);

  snapAmountSelect.addEventListener("change", () => {
    const sanitized = sanitizeSnapAmount(snapAmountSelect.value);
    setSnapSettings({ amount: sanitized });
  });
  */
  */

  snapControlsContainer.appendChild(snapToggle.container);
  snapControlsContainer.appendChild(snapLabel);
  snapControlsContainer.appendChild(snapModeToggle.container);
  //snapControlsContainer.appendChild(snapAmountGroup);
  //snapControlsContainer.appendChild(snapAmountGroup);

  rightSection.appendChild(snapControlsContainer);
  updateSnapAmountOptions();
  updateSnapControlsUI();
}

function updateSnapAmountOptions(
  columns = GRID_CONFIG.COLUMNS,
  rows = GRID_CONFIG.ROWS,
  settings = getCurrentSnapSettings(),
) {
  const isDivision = settings.unit === "division";

  if (snapAmountSelect) {
    snapAmountSelect.style.display = isDivision ? "none" : "";
  }
  if (snapAmountManualInput) {
    snapAmountManualInput.style.display = isDivision ? "inline-block" : "none";
  }

  if (isDivision) {
    if (snapAmountManualInput) {
      snapAmountManualInput.value = settings.amount.toString();
    }
    return;
  }

  if (!snapAmountSelect) {
    return;
  }

  let optionValues = getCommonDivisors(columns, rows);

  if (!optionValues.length) {
    optionValues = [1];
  }

  const fragment = document.createDocumentFragment();
  optionValues.forEach((value) => {
    const option = document.createElement("option");
    option.value = value.toString();
    option.textContent = value.toString();
    fragment.appendChild(option);
  });

  snapAmountSelect.innerHTML = "";
  snapAmountSelect.appendChild(fragment);

  if (!optionValues.includes(settings.amount)) {
    const fallback = optionValues[0];
    if (settings.amount !== fallback) {
      setSnapSettings({ amount: fallback });
    }
    return;
  }

  snapAmountSelect.value = settings.amount.toString();
}

function normalizeSnapAmount(
  unit,
  amount,
  columns = GRID_CONFIG.COLUMNS,
  rows = GRID_CONFIG.ROWS,
) {
  const sanitized = sanitizeSnapAmount(amount);

  if (unit === "cells") {
    const divisors = getCommonDivisors(columns, rows);
    if (!divisors.length) {
      return 1;
    }
    return divisors.includes(sanitized) ? sanitized : divisors[0];
  }

  if (unit === "division") {
    const divisors = getCommonDivisors(columns, rows);
    if (!divisors.length) {
      return sanitized;
    }
    if (divisors.includes(sanitized)) {
      return sanitized;
    }
    return divisors.reduce((closest, value) => {
      if (Math.abs(value - sanitized) < Math.abs(closest - sanitized)) {
        return value;
      }
      return closest;
    }, divisors[0]);
  }

  return sanitized;
}

function getGridSignature(
  columns = GRID_CONFIG.COLUMNS,
  rows = GRID_CONFIG.ROWS,
) {
  return `${Math.round(columns)}x${Math.round(rows)}`;
}

function getCommonDivisors(columns, rows) {
  const safeColumns = Math.max(1, Math.round(Number(columns)) || 1);
  const safeRows = Math.max(1, Math.round(Number(rows)) || 1);
  const gcd = greatestCommonDivisor(safeColumns, safeRows);
  const divisors = new Set();

  const limit = Math.floor(Math.sqrt(gcd));
  for (let i = 1; i <= limit; i += 1) {
    if (gcd % i === 0) {
      divisors.add(i);
      divisors.add(gcd / i);
    }
  }

  return Array.from(divisors).sort((a, b) => a - b);
}

function greatestCommonDivisor(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x || 1;
}

function sanitizeSnapAmount(value) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function toggleSnapEnabled() {
  if (!store.dragSnapSettings) {
    getCurrentSnapSettings();
  }

  const wasEnabled = store.dragSnapSettings.snapEnabled !== false;

  if (wasEnabled) {
    // Turning snap OFF - save current settings and set to 1 cell
    store.dragSnapSettings.savedUnit = store.dragSnapSettings.unit;
    store.dragSnapSettings.savedAmount = store.dragSnapSettings.amount;
    store.dragSnapSettings.snapEnabled = false;
    store.dragSnapSettings.unit = "cells";
    store.dragSnapSettings.amount = 1;
  } else {
    // Turning snap ON - restore previous settings
    store.dragSnapSettings.snapEnabled = true;
    if (store.dragSnapSettings.savedUnit) {
      store.dragSnapSettings.unit = store.dragSnapSettings.savedUnit;
    }
    if (store.dragSnapSettings.savedAmount) {
      store.dragSnapSettings.amount = store.dragSnapSettings.savedAmount;
    }
  }

  // Save to current slide
  if (store.currentSlideIndex > -1 && store.slides[store.currentSlideIndex]) {
    const currentSlide = store.slides[store.currentSlideIndex];
    currentSlide.savedSnapSettings = {
      unit: store.dragSnapSettings.unit,
      amount: store.dragSnapSettings.amount,
      isAuto: store.dragSnapSettings.isAuto,
      snapEnabled: store.dragSnapSettings.snapEnabled,
      savedUnit: store.dragSnapSettings.savedUnit,
      savedAmount: store.dragSnapSettings.savedAmount,
    };
  }

  updateSnapControlsUI();
}

function getCurrentSnapSettings() {
  const defaults = { unit: "cells", amount: 1, snapEnabled: true };
  const columns = GRID_CONFIG.COLUMNS;
  const rows = GRID_CONFIG.ROWS;
  const defaultSnap =
    getDefaultCellSnapForResolution(columns, rows) || defaults.amount;
  const signature = getGridSignature(columns, rows);

  if (!store.dragSnapSettings) {
    store.dragSnapSettings = {
      unit: defaults.unit,
      amount: defaultSnap,
      isAuto: true,
      snapEnabled: true,
      appliedGridSignature: signature,
    };
  } else if (
    store.dragSnapSettings.unit === "cells" &&
    store.dragSnapSettings.isAuto !== false &&
    store.dragSnapSettings.appliedGridSignature !== signature
  ) {
    store.dragSnapSettings = {
      ...store.dragSnapSettings,
      amount: defaultSnap,
      isAuto: true,
      appliedGridSignature: signature,
    };
  }

  if (store.dragSnapSettings.snapEnabled === false) {
    const fallbackUnit =
      store.dragSnapSettings.savedUnit ||
      store.dragSnapSettings.unit ||
      defaults.unit;
    const fallbackAmount =
      store.dragSnapSettings.savedAmount ||
      store.dragSnapSettings.amount ||
      defaults.amount;
    return {
      unit: fallbackUnit,
      amount: sanitizeSnapAmount(fallbackAmount),
      snapEnabled: false,
    };
  }

  return {
    unit: store.dragSnapSettings.unit || defaults.unit,
    amount: sanitizeSnapAmount(store.dragSnapSettings.amount),
    snapEnabled: true,
  };
}

function setSnapSettings(partial = {}) {
  const current = getCurrentSnapSettings();
  const next = {
    ...current,
    ...partial,
  };

  const rawAmount = Object.prototype.hasOwnProperty.call(partial, "amount")
    ? partial.amount
    : current.amount;

  next.amount = normalizeSnapAmount(next.unit, rawAmount);
  next.isAuto = false;
  next.appliedGridSignature = getGridSignature();

  // Preserve snapEnabled state and saved values
  if (store.dragSnapSettings) {
    next.snapEnabled = store.dragSnapSettings.snapEnabled;
    next.savedUnit = store.dragSnapSettings.savedUnit;
    next.savedAmount = store.dragSnapSettings.savedAmount;
  }

  store.dragSnapSettings = next;

  // Save snap settings to current slide
  if (store.currentSlideIndex > -1 && store.slides[store.currentSlideIndex]) {
    const currentSlide = store.slides[store.currentSlideIndex];
    currentSlide.savedSnapSettings = {
      unit: next.unit,
      amount: next.amount,
      isAuto: next.isAuto,
      snapEnabled: next.snapEnabled,
      savedUnit: next.savedUnit,
      savedAmount: next.savedAmount,
    };
  }

  updateSnapAmountOptions(GRID_CONFIG.COLUMNS, GRID_CONFIG.ROWS, next);
  updateSnapControlsUI();
}

export function updateSnapControlsUI() {
  if (!snapControlsContainer) {
    return;
  }

  const snapEnabled = store.dragSnapSettings?.snapEnabled !== false;
  const settings = getCurrentSnapSettings();
  const isDivision = settings.unit === "division";

  // Update toggle button appearance
  const toggleButton = snapControlsContainer.querySelector(
    ".snap-toggle-button",
  );
  const toggleIcon = toggleButton?.querySelector(".material-symbols-outlined");
  if (toggleButton) {
    toggleButton.style.background = snapEnabled
      ? "var(--bs-primary)"
      : "var(--bs-darker-gray)";
    toggleButton.title = snapEnabled
      ? gettext("Snap: On")
      : gettext("Snap: Off");
    if (toggleIcon) {
      toggleIcon.textContent = snapEnabled ? "grid_on" : "grid_off";
    }
  }

  // Disable/enable other controls based on snap state
  const modeToggle = snapControlsContainer.querySelector(".snap-mode-toggle");
  const amountGroup = snapControlsContainer.querySelector(".snap-amount-group");

  if (modeToggle) {
    modeToggle.style.opacity = snapEnabled ? "1" : "0.5";
    modeToggle.style.pointerEvents = snapEnabled ? "" : "none";
  }
  if (amountGroup) {
    amountGroup.style.opacity = snapEnabled ? "1" : "0.5";
    amountGroup.style.pointerEvents = snapEnabled ? "" : "none";
  }

  if (snapAmountSelect && !isDivision) {
    snapAmountSelect.value = settings.amount.toString();
  }
  if (snapAmountManualInput && isDivision) {
    snapAmountManualInput.value = settings.amount.toString();
  }

  if (snapModeButtons) {
    Object.entries(snapModeButtons).forEach(([unit, button]) => {
      const isActive = unit === settings.unit;
      button.style.background = isActive
        ? "var(--bs-darkest-gray)"
        : "transparent";
      button.style.color = isActive
        ? "var(--bs-white)"
        : "var(--bs-darker-gray)";
    });
  }

  if (snapAmountPrefix) {
    snapAmountPrefix.textContent = isDivision ? "1 /" : "";
  }
  if (snapAmountSuffix) {
    snapAmountSuffix.textContent = isDivision
      ? gettext("of grid")
      : gettext("cells");
  }
}

/**
 * Show the status bar with optional animation
 */
export function showStatusBar() {
  const bar = createStatusBar();
  bar.classList.add("show");
}

/**
 * Hide the status bar
 */
export function hideStatusBar() {
  if (statusBar) {
    statusBar.classList.remove("show");
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
    const interactiveInfo = createInteractiveGridInfo(info);
    if (interactiveInfo && interactiveInfo.length) {
      gridText.innerHTML = `<span class="grid-info-separator">•</span> ${interactiveInfo}`;
    } else {
      gridText.textContent = "Ready";
    }
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
    color: var(--bs-darkest-gray);
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
    color: var(--bs-darkest-gray);
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
    background: var(--bs-dark-gray);
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
    color: var(--bs-darkest-gray);
    padding: 2px 6px;
    border-radius: 3px;
  `;

  // Zoom mode toggle buttons
  /** @type {(zoomMode: "fit" | "zoom", display: string, fn: (element: HTMLElement), notify: {mode: "fit" | "zoom",level: number })} */
  const zoomSwitcher = (zoomMode, display, fn, notify) =>
    function () {
      if (currentZoomMode !== zoomMode) {
        currentZoomMode = zoomMode;

        const rightContainer = document.getElementById(
          "right-content-container",
        );
        console.log(rightContainer);
        fn(rightContainer);

        zoomSliderContainer.style.display = display;
        notifyZoomChange(notify.mode, notify.level);
      }
    };
  const zoomModeToggle = createToggleButton(
    {
      label: "Fit",
      fn: zoomSwitcher(
        "fit",
        "none",
        (element) => element.classList.remove("resize-for-zoom"),
        {
          mode: "fit",
          level: 100,
        },
      ),
    },
    {
      label: "Zoom",
      fn: zoomSwitcher(
        "zoom",
        "flex",
        (element) => element.classList.add("resize-for-zoom"),
        { mode: "zoom", level: currentZoomLevel },
      ),
    },
    true,
    true,
  );
  /* TODO: Remove
  // Event handlers
  fitButton.addEventListener("click", () => {
    if (currentZoomMode !== "fit") {
      currentZoomMode = "fit";

      document
        .getElementById("right-content-container")
        .classList.remove("resize-for-zoom");

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

      zoomSliderContainer.style.display = "flex";
      notifyZoomChange("zoom", currentZoomLevel);
    }
  });
  */

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

  // Add to main container in order: slider, then toggle buttons
  zoomControlsContainer.appendChild(zoomSliderContainer);
  zoomControlsContainer.appendChild(zoomModeToggle.container);

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
          background: var(--bs-light-gray);
          border: none;
          color: var(--bs-darkest-gray);
          padding: 5px 10px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(54,56,57,0.2);
        `;
      }
      if (zoomBtn) {
        zoomBtn.style.cssText = `
          background: transparent;
          border: none;
          color: var(--bs-darker-gray);
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
          background: var(--bs-light-gray);
          border: none;
          color: var(--bs-darkest-gray);
          padding: 5px 10px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(54,56,57,0.2);
        `;
      }
      if (fitBtn) {
        fitBtn.style.cssText = `
          background: transparent;
          border: none;
          color: var(--bs-darker-gray);
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
      color: var(--bs-darkest-gray) !important;
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
      background-color: rgba(54, 56, 57, 0.15);
      border-color: var(--bs-darker-gray);
    }

    .grid-info-text .editable-value.editing {
      background-color: var(--bs-white);
      color: var(--bs-darkest-gray) !important;
      border-color: var(--bs-darker-gray);
      outline: none;
    }

    .grid-info-text .editable-input {
      background: var(--bs-white);
      color: var(--bs-darkest-gray);
      border: 1px solid var(--bs-darker-gray);
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
    .grid-info-text .editable-input[style*="var(--bs-error-red)"] {
      border-color: var(--bs-error-red) !important;
      background-color: var(--bs-error-red-light) !important;
      box-shadow: 0 0 3px rgba(179, 0, 33, 0.3);
    }

    .grid-info-text .editable-input:valid,
    .grid-info-text .editable-input[style*="var(--bs-darker-gray)"] {
      border-color: var(--bs-darker-gray) !important;
      background-color: var(--bs-white) !important;
      box-shadow: 0 0 3px rgba(114, 120, 123, 0.3);
    }
    .grid-info-text .grid-info-separator {
      color: var(--bs-darkest-gray);
      margin: 0 6px 0 2px;
      font-weight: 600;
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
    input.style.borderColor = "var(--bs-darker-gray)";
    input.style.backgroundColor = "var(--bs-white)";
    input.title = "";
  } else {
    input.style.borderColor = "var(--bs-error-red)";
    input.style.backgroundColor = "var(--bs-error-red-light)";
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
