// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { selectElement } from "../core/elementSelector.js";
import { loadSlide } from "../core/renderSlide.js";
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { getNewZIndex } from "../utils/domUtils.js";
import { queryParams, showToast } from "../../../../utils/utils.js";
import { showColorPalette } from "../utils/colorUtils.js";
import {
  getAvailableFonts,
  getDefaultFonts,
  getDefaultFont,
} from "../utils/fontUtils.js";
import { gettext } from "../../../../utils/locales.js";

export function initTableElement() {
  initTableEventListeners();
  populateTableFontDropdowns();
}

// Debounce timer for live table structure updates
let tableStructureUpdateTimer = null;

function debounceTableStructureUpdate() {
  // Clear previous timer
  if (tableStructureUpdateTimer) {
    clearTimeout(tableStructureUpdateTimer);
  }

  // Set new timer for 150ms delay (more responsive)
  tableStructureUpdateTimer = setTimeout(() => {
    updateTableStructureLive();
  }, 150);
}

function initTableEventListeners() {
  // Add table element button
  document
    .querySelector('[data-type="table"]')
    ?.addEventListener("click", () => {
      if (store.currentSlideIndex === -1) {
        showToast(gettext("Please select a slide first!"), "Info");
        return;
      }
      addTableElementToSlide();
    });

  // Initialize popover buttons
  initTablePopoverButtons();

  // Table rows and columns controls
  const rowsInput = document.getElementById("table-rows");
  const colsInput = document.getElementById("table-cols");

  if (rowsInput) {
    rowsInput.addEventListener("change", updateTableStructure);
    rowsInput.addEventListener("input", debounceTableStructureUpdate);
  }

  if (colsInput) {
    colsInput.addEventListener("change", updateTableStructure);
    colsInput.addEventListener("input", debounceTableStructureUpdate);
  }

  // Table style controls
  const tableStyleSelect = document.getElementById("table-style");
  if (tableStyleSelect) {
    tableStyleSelect.addEventListener("change", updateTableStyleLive);
  }

  // Table sizing controls
  const tableSizingSelect = document.getElementById("table-sizing");
  if (tableSizingSelect) {
    tableSizingSelect.addEventListener("change", updateTableSizingLive);
  }

  // Table striped, bordered options
  const tableStripedCheckbox = document.getElementById("table-striped");
  const tableBorderedCheckbox = document.getElementById("table-bordered");

  if (tableStripedCheckbox) {
    tableStripedCheckbox.addEventListener("change", updateTableColorsLive);
  }

  if (tableBorderedCheckbox) {
    tableBorderedCheckbox.addEventListener("change", updateTableColorsLive);
  }

  // Font size controls
  const headerFontSizeSelect = document.getElementById(
    "table-header-font-size",
  );
  const rowFontSizeSelect = document.getElementById("table-row-font-size");

  if (headerFontSizeSelect) {
    headerFontSizeSelect.addEventListener("change", updateTableFontSizeLive);
  }

  if (rowFontSizeSelect) {
    rowFontSizeSelect.addEventListener("change", updateTableFontSizeLive);
  }

  // Font family controls
  const headerFontFamilySelect = document.getElementById(
    "table-header-font-family",
  );
  const rowFontFamilySelect = document.getElementById("table-row-font-family");

  if (headerFontFamilySelect) {
    headerFontFamilySelect.addEventListener(
      "change",
      updateTableFontFamilyLive,
    );
  }

  if (rowFontFamilySelect) {
    rowFontFamilySelect.addEventListener("change", updateTableFontFamilyLive);
  }

  // Color controls
  const bgColorInput = document.getElementById("table-bg-color");
  const fontColorInput = document.getElementById("table-font-color");
  const useBgColorCheckbox = document.getElementById("table-use-bg-color");
  const headerBgColorInput = document.getElementById("table-header-bg-color");
  const headerFontColorInput = document.getElementById(
    "table-header-font-color",
  );
  const useHeaderBgColorCheckbox = document.getElementById(
    "table-use-header-bg-color",
  );
  const stripedBgColorInput = document.getElementById("table-striped-bg-color");
  const stripedFontColorInput = document.getElementById(
    "table-striped-font-color",
  );
  const borderColorInput = document.getElementById("table-border-color");
  const borderThicknessInput = document.getElementById(
    "table-border-thickness",
  );
  const useCustomStripedFontCheckbox = document.getElementById(
    "table-use-custom-striped-font",
  );

  if (bgColorInput) {
    bgColorInput.addEventListener("input", updateTableColorsLive);
  }

  if (fontColorInput) {
    fontColorInput.addEventListener("input", updateTableColorsLive);
  }

  if (useBgColorCheckbox) {
    useBgColorCheckbox.addEventListener("change", updateTableColorsLive);
  }

  if (headerBgColorInput) {
    headerBgColorInput.addEventListener("input", updateTableColorsLive);
  }

  if (headerFontColorInput) {
    headerFontColorInput.addEventListener("input", updateTableColorsLive);
  }

  if (useHeaderBgColorCheckbox) {
    useHeaderBgColorCheckbox.addEventListener("change", updateTableColorsLive);
  }

  if (stripedBgColorInput) {
    stripedBgColorInput.addEventListener("input", updateTableColorsLive);
  }

  if (stripedFontColorInput) {
    stripedFontColorInput.addEventListener("input", updateTableColorsLive);
  }

  if (borderColorInput) {
    borderColorInput.addEventListener("input", updateTableColorsLive);
  }

  if (borderThicknessInput) {
    borderThicknessInput.addEventListener("input", updateTableColorsLive);
  }

  // Add event listeners to save state when changes are finalized
  if (bgColorInput) {
    bgColorInput.addEventListener("change", () => pushCurrentSlideState());
  }

  if (fontColorInput) {
    fontColorInput.addEventListener("change", () => pushCurrentSlideState());
  }

  if (useBgColorCheckbox) {
    useBgColorCheckbox.addEventListener("change", () =>
      pushCurrentSlideState(),
    );
  }

  if (headerBgColorInput) {
    headerBgColorInput.addEventListener("change", () =>
      pushCurrentSlideState(),
    );
  }

  if (headerFontColorInput) {
    headerFontColorInput.addEventListener("change", () =>
      pushCurrentSlideState(),
    );
  }

  if (useHeaderBgColorCheckbox) {
    useHeaderBgColorCheckbox.addEventListener("change", () =>
      pushCurrentSlideState(),
    );
  }

  if (stripedBgColorInput) {
    stripedBgColorInput.addEventListener("change", () =>
      pushCurrentSlideState(),
    );
  }

  if (stripedFontColorInput) {
    stripedFontColorInput.addEventListener("change", () =>
      pushCurrentSlideState(),
    );
  }

  if (borderColorInput) {
    borderColorInput.addEventListener("change", () => pushCurrentSlideState());
  }

  if (borderThicknessInput) {
    borderThicknessInput.addEventListener("change", () =>
      pushCurrentSlideState(),
    );
  }

  if (tableStripedCheckbox) {
    tableStripedCheckbox.addEventListener("change", () =>
      pushCurrentSlideState(),
    );
  }

  if (tableBorderedCheckbox) {
    tableBorderedCheckbox.addEventListener("change", () =>
      pushCurrentSlideState(),
    );
  }

  if (useCustomStripedFontCheckbox) {
    useCustomStripedFontCheckbox.addEventListener(
      "change",
      updateTableColorsLive,
    );
  }
}

function addTableElementToSlide() {
  pushCurrentSlideState();

  const newTable = {
    id: store.elementIdCounter++,
    type: "table",
    rows: 5,
    cols: 5,
    data: generateTableData(5, 5),
    gridX: 0,
    gridY: 0,
    gridWidth: 125,
    gridHeight: 200,
    zIndex: getNewZIndex(),
    striped: true,
    bordered: true,
    cellSizing: "even", // auto, even, or custom
    headerFontSize: 2.3,
    rowFontSize: 1.7,
    headerFontFamily: getDefaultFont(), // Add header font family
    rowFontFamily: getDefaultFont(), // Add row font family
    useBgColor: true, // Whether to use background color
    tableBgColor: "#ffffff", // Table background color
    fontColor: "#212529", // Font color
    useHeaderBgColor: true, // Whether to use header background color
    headerBgColor: "#f8f9fa", // Header background color
    headerFontColor: "#212529", // Header font color
    stripedColor: "#f8f9fa", // Custom striped background color
    stripedFontColor: "#212529", // Custom striped font color
    borderColor: "#dee2e6", // Custom border color
    borderThickness: 1, // Border thickness in pixels
    originSlideIndex: store.currentSlideIndex, // Track which slide this element was created on
    isLocked: false, // Initialize lock state
    isHidden: false, // Initialize visibility state
  };

  store.slides[store.currentSlideIndex].elements.push(newTable);
  loadSlide(store.slides[store.currentSlideIndex]);
  selectElement(document.getElementById("el-" + newTable.id), newTable);
}

function generateTableData(rows, cols) {
  const data = [];

  // Header row
  const headerRow = [];
  for (let j = 0; j < cols; j++) {
    headerRow.push(gettext("Header") + ` ${j + 1}`);
  }
  data.push(headerRow);

  // Data rows
  for (let i = 1; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      row.push(gettext("Row") + ` ${i} ` + gettext("Col") + ` ${j + 1}`);
    }
    data.push(row);
  }

  return data;
}

function updateTableStructure() {
  if (
    !window.selectedElementForUpdate ||
    window.selectedElementForUpdate.element.type !== "table"
  ) {
    return;
  }

  const rowsInput = document.getElementById("table-rows");
  const colsInput = document.getElementById("table-cols");

  if (!rowsInput || !colsInput) return;

  const newRows = parseInt(rowsInput.value) || 3;
  const newCols = parseInt(colsInput.value) || 3;

  if (newRows < 1 || newCols < 1 || newRows > 20 || newCols > 10) {
    showToast(
      gettext("Invalid table dimensions. Rows: 1-20, Cols: 1-10"),
      "Error",
    );
    return;
  }

  pushCurrentSlideState();

  const element = window.selectedElementForUpdate.element;
  const oldData = element.data || [];

  // Update element properties
  element.rows = newRows;
  element.cols = newCols;

  // Generate new data array preserving existing data where possible
  const newData = [];
  for (let i = 0; i < newRows; i++) {
    const row = [];
    for (let j = 0; j < newCols; j++) {
      if (oldData[i] && oldData[i][j] !== undefined) {
        row.push(oldData[i][j]);
      } else if (i === 0) {
        row.push(gettext("Header") + ` ${j + 1}`);
      } else {
        row.push(gettext("Row") + ` ${i} ` + gettext("Col") + ` ${j + 1}`);
      }
    }
    newData.push(row);
  }

  element.data = newData;

  // Update the table DOM directly (faster than full slide reload)
  updateTableStructureDOM(element);
}

function updateTableStructureLive() {
  if (
    !window.selectedElementForUpdate ||
    window.selectedElementForUpdate.element.type !== "table"
  ) {
    return;
  }

  const rowsInput = document.getElementById("table-rows");
  const colsInput = document.getElementById("table-cols");

  if (!rowsInput || !colsInput) return;

  const newRows = parseInt(rowsInput.value) || 3;
  const newCols = parseInt(colsInput.value) || 3;

  if (newRows < 1 || newCols < 1 || newRows > 20 || newCols > 10) {
    return; // Invalid dimensions, don't update live
  }

  const element = window.selectedElementForUpdate.element;

  // Check if values actually changed to avoid unnecessary updates
  if (element.rows === newRows && element.cols === newCols) {
    return;
  }

  const oldData = element.data || [];

  // Update element properties (live update, no state push)
  element.rows = newRows;
  element.cols = newCols;

  // Generate new data array preserving existing data where possible
  const newData = [];
  for (let i = 0; i < newRows; i++) {
    const row = [];
    for (let j = 0; j < newCols; j++) {
      if (oldData[i] && oldData[i][j] !== undefined) {
        row.push(oldData[i][j]);
      } else if (i === 0) {
        row.push(gettext("Header") + ` ${j + 1}`);
      } else {
        row.push(gettext("Row") + ` ${i} ` + gettext("Col") + ` ${j + 1}`);
      }
    }
    newData.push(row);
  }

  element.data = newData;

  // Live update the table DOM without full slide re-render
  updateTableStructureDOM(element);
}

function updateTableStructureDOM(element) {
  const tableElement = document.querySelector(`#el-${element.id} table`);
  if (!tableElement) return;

  const thead = tableElement.querySelector("thead");
  const tbody = tableElement.querySelector("tbody");

  if (!thead || !tbody) return;

  const data = element.data;
  if (!data || data.length === 0) return;

  // Clear existing content
  thead.innerHTML = "";
  tbody.innerHTML = "";

  // Recreate header row
  if (data.length > 0) {
    const headerRow = document.createElement("tr");
    if (element.cellSizing === "even") {
      headerRow.style.height = `${100 / data.length}%`;
    }
    data[0].forEach((cellText) => {
      const th = document.createElement("th");
      th.textContent = cellText;
      th.style.padding = "8px";
      th.style.fontSize = `${element.headerFontSize || 2.3}rem`;
      th.style.fontFamily = `'${element.headerFontFamily || getDefaultFont()}'`;

      // Apply header colors with higher specificity
      if (element.useHeaderBgColor) {
        th.style.setProperty(
          "background-color",
          element.headerBgColor || "#f8f9fa",
          "important",
        );
      }
      th.style.setProperty(
        "color",
        element.headerFontColor || "#212529",
        "important",
      );

      // Setup edit mode functionality for new header cells
      setupTableCellEditMode(th, element, false); // false = not in playback mode

      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Reapply header colors to thead with higher specificity
    if (element.useHeaderBgColor) {
      thead.style.setProperty(
        "background-color",
        element.headerBgColor || "#f8f9fa",
        "important",
      );
    }
    thead.style.setProperty(
      "color",
      element.headerFontColor || "#212529",
      "important",
    );
  }

  // Recreate body rows
  for (let i = 1; i < data.length; i++) {
    const row = document.createElement("tr");
    if (element.cellSizing === "even") {
      row.style.height = `${100 / data.length}%`;
    }
    data[i].forEach((cellText) => {
      const td = document.createElement("td");
      td.textContent = cellText;
      td.style.padding = "8px";
      td.style.fontSize = `${element.rowFontSize || 1.7}rem`;
      td.style.fontFamily = `'${element.rowFontFamily || getDefaultFont()}'`;

      // Setup edit mode functionality for new body cells
      setupTableCellEditMode(td, element, false); // false = not in playback mode

      row.appendChild(td);
    });
    tbody.appendChild(row);
  }

  // Reapply table sizing if needed
  updateTableSizing(tableElement, element);
}

function updateTableStyleLive() {
  if (
    !window.selectedElementForUpdate ||
    window.selectedElementForUpdate.element.type !== "table"
  ) {
    return;
  }

  const tableStyleSelect = document.getElementById("table-style");
  if (!tableStyleSelect) return;

  // Update element without pushing state (live update)
  const element = window.selectedElementForUpdate.element;
  element.tableStyle = tableStyleSelect.value;

  // If using transparent styles, disable custom colors
  if (tableStyleSelect.value.includes("transparent")) {
    element.useCustomBg = false;
    element.useCustomFont = false;
    // Update checkboxes if they exist
    const useCustomBgCheckbox = document.getElementById("table-use-custom-bg");
    const useCustomFontCheckbox = document.getElementById(
      "table-use-custom-font",
    );
    if (useCustomBgCheckbox) useCustomBgCheckbox.checked = false;
    if (useCustomFontCheckbox) useCustomFontCheckbox.checked = false;
  }

  // Get the current table element and update its classes
  const tableElement = document.querySelector(`#el-${element.id} table`);
  if (tableElement) {
    updateTableClasses(tableElement, element);
    updateTableColors(tableElement, element);
  }
}

function updateTableSizingLive() {
  if (
    !window.selectedElementForUpdate ||
    window.selectedElementForUpdate.element.type !== "table"
  ) {
    return;
  }

  const tableSizingSelect = document.getElementById("table-sizing");
  if (!tableSizingSelect) return;

  // Update element without pushing state (live update)
  window.selectedElementForUpdate.element.cellSizing = tableSizingSelect.value;

  // Get the current table element and update its sizing
  const tableElement = document.querySelector(
    `#el-${window.selectedElementForUpdate.element.id} table`,
  );
  if (tableElement) {
    updateTableSizing(tableElement, window.selectedElementForUpdate.element);
  }
}

function updateTableFontSizeLive() {
  if (
    !window.selectedElementForUpdate ||
    window.selectedElementForUpdate.element.type !== "table"
  ) {
    return;
  }

  const headerFontSizeSelect = document.getElementById(
    "table-header-font-size",
  );
  const rowFontSizeSelect = document.getElementById("table-row-font-size");

  // Update element without pushing state (live update)
  const element = window.selectedElementForUpdate.element;
  element.headerFontSize = parseFloat(headerFontSizeSelect?.value) || 2.3;
  element.rowFontSize = parseFloat(rowFontSizeSelect?.value) || 1.7;

  // Get the current table element and update font sizes
  const tableElement = document.querySelector(`#el-${element.id} table`);
  if (tableElement) {
    updateTableFontSizes(tableElement, element);
  }
}

function updateTableFontFamilyLive() {
  if (
    !window.selectedElementForUpdate ||
    window.selectedElementForUpdate.element.type !== "table"
  ) {
    return;
  }

  const headerFontFamilySelect = document.getElementById(
    "table-header-font-family",
  );
  const rowFontFamilySelect = document.getElementById("table-row-font-family");

  // Save state for undo functionality
  pushCurrentSlideState();

  // Update element with state push
  const element = window.selectedElementForUpdate.element;
  element.headerFontFamily = headerFontFamilySelect?.value || getDefaultFont();
  element.rowFontFamily = rowFontFamilySelect?.value || getDefaultFont();

  // Get the current table element and update font families
  const tableElement = document.querySelector(`#el-${element.id} table`);
  if (tableElement) {
    updateTableFontFamilies(tableElement, element);
  }
}

function updateTableColorsLive() {
  if (
    !window.selectedElementForUpdate ||
    window.selectedElementForUpdate.element.type !== "table"
  ) {
    return;
  }

  const bgColorInput = document.getElementById("table-bg-color");
  const fontColorInput = document.getElementById("table-font-color");
  const useBgColorCheckbox = document.getElementById("table-use-bg-color");
  const headerBgColorInput = document.getElementById("table-header-bg-color");
  const headerFontColorInput = document.getElementById(
    "table-header-font-color",
  );
  const useHeaderBgColorCheckbox = document.getElementById(
    "table-use-header-bg-color",
  );
  const stripedCheckbox = document.getElementById("table-striped");
  const stripedBgColorInput = document.getElementById("table-striped-bg-color");
  const stripedFontColorInput = document.getElementById(
    "table-striped-font-color",
  );
  const borderedCheckbox = document.getElementById("table-bordered");
  const borderColorInput = document.getElementById("table-border-color");
  const borderThicknessInput = document.getElementById(
    "table-border-thickness",
  );

  // Update element without pushing state (live update)
  const element = window.selectedElementForUpdate.element;

  // Background and font colors
  element.useBgColor = useBgColorCheckbox?.checked || false;
  element.tableBgColor = bgColorInput?.value || "#ffffff";
  element.fontColor = fontColorInput?.value || "#212529";

  // Header colors
  element.useHeaderBgColor = useHeaderBgColorCheckbox?.checked || false;
  element.headerBgColor = headerBgColorInput?.value || "#f8f9fa";
  element.headerFontColor = headerFontColorInput?.value || "#212529";

  // Striped settings
  element.striped = stripedCheckbox?.checked || false;
  element.stripedColor = stripedBgColorInput?.value || "#f8f9fa";
  element.stripedFontColor = stripedFontColorInput?.value || "#212529";

  // Border settings
  element.bordered = borderedCheckbox?.checked || false;
  element.borderColor = borderColorInput?.value || "#dee2e6";
  element.borderThickness = parseInt(borderThicknessInput?.value) || 1;

  // Get the current table element and update colors
  const tableElement = document.querySelector(`#el-${element.id} table`);
  if (tableElement) {
    updateTableColors(tableElement, element);
  }
}

function updateTableFontSizes(tableElement, element) {
  // Update header font sizes
  const headerCells = tableElement.querySelectorAll("thead th");
  headerCells.forEach((th) => {
    th.style.fontSize = `${element.headerFontSize || 2.3}rem`;
  });

  // Update row font sizes
  const bodyCells = tableElement.querySelectorAll("tbody td");
  bodyCells.forEach((td) => {
    td.style.fontSize = `${element.rowFontSize || 1.7}rem`;
  });
}

function updateTableFontFamilies(tableElement, element) {
  // Update header font families
  const headerCells = tableElement.querySelectorAll("thead th");
  headerCells.forEach((th) => {
    th.style.fontFamily = `'${element.headerFontFamily || getDefaultFont()}'`;
  });

  // Update row font families
  const bodyCells = tableElement.querySelectorAll("tbody td");
  bodyCells.forEach((td) => {
    td.style.fontFamily = `'${element.rowFontFamily || getDefaultFont()}'`;
  });
}

function updateTableClasses(tableElement, element) {
  // Build Bootstrap table classes
  let tableClass = element.tableStyle || "table";
  if (element.striped) tableClass += " table-striped";
  if (element.bordered) tableClass += " table-bordered";

  // Add custom color classes if enabled
  if (element.useCustomBg) tableClass += " table-custom-bg";
  if (element.useCustomFont) tableClass += " table-custom-color";
  if (element.useCustomStripedBg) tableClass += " table-custom-striped-bg";
  if (element.useCustomStripedFont) tableClass += " table-custom-striped-color";

  tableElement.className = tableClass;
}

function updateTableColors(tableElement, element) {
  // Set background color conditionally using Bootstrap table variables
  if (element.useBgColor) {
    tableElement.style.setProperty(
      "--bs-table-bg",
      element.tableBgColor || "#ffffff",
    );
  } else {
    tableElement.style.setProperty("--bs-table-bg", "transparent");
  }

  // Set font color using Bootstrap table variables
  tableElement.style.setProperty(
    "--bs-table-color",
    element.fontColor || "#212529",
  );

  // Set header colors with higher specificity to override table defaults
  const thead = tableElement.querySelector("thead");
  if (thead) {
    if (element.useHeaderBgColor) {
      thead.style.setProperty(
        "background-color",
        element.headerBgColor || "#f8f9fa",
        "important",
      );
    } else {
      thead.style.removeProperty("background-color");
    }
    thead.style.setProperty(
      "color",
      element.headerFontColor || "#212529",
      "important",
    );

    // Also apply to all th elements within thead for maximum specificity
    const headerCells = thead.querySelectorAll("th");
    headerCells.forEach((th) => {
      if (element.useHeaderBgColor) {
        th.style.setProperty(
          "background-color",
          element.headerBgColor || "#f8f9fa",
          "important",
        );
      } else {
        th.style.removeProperty("background-color");
      }
      th.style.setProperty(
        "color",
        element.headerFontColor || "#212529",
        "important",
      );
    });
  }

  // Set striped colors if striped is enabled
  if (element.striped) {
    tableElement.style.setProperty(
      "--bs-table-striped-bg",
      element.stripedColor || "#f8f9fa",
    );
    tableElement.style.setProperty(
      "--bs-table-striped-color",
      element.stripedFontColor || "#212529",
    );
  }

  // Set border colors if bordered is enabled
  if (element.bordered) {
    tableElement.style.setProperty(
      "--bs-table-border-color",
      element.borderColor || "#dee2e6",
    );
    tableElement.style.setProperty(
      "--bs-border-width",
      `${element.borderThickness || 1}px`,
    );
  } else {
    tableElement.style.setProperty("--bs-table-border-color", "transparent");
    tableElement.style.setProperty("--bs-border-width", "1px"); // Reset to default
  }

  // Update table classes to apply/remove custom color classes
  updateTableClasses(tableElement, element);
}

function updateTableSizing(tableElement, element) {
  if (element.cellSizing === "even") {
    tableElement.style.height = "100%";
    // Apply even height to all rows
    const rows = tableElement.querySelectorAll("tr");
    const rowHeight = `${100 / rows.length}%`;
    rows.forEach((row) => {
      row.style.height = rowHeight;
    });
  } else {
    // Auto sizing - remove fixed constraints
    tableElement.style.height = "auto";
    // Remove height constraints from rows
    const rows = tableElement.querySelectorAll("tr");
    rows.forEach((row) => {
      row.style.height = "";
    });
  }
}

// Helper function to setup table cell edit mode functionality
function setupTableCellEditMode(cell, element, isInteractivePlayback) {
  // Only enable edit mode in edit mode, not during playback
  if (isInteractivePlayback || queryParams.mode === "playback") {
    cell.contentEditable = "false";
    return;
  }

  // Initially not editable (draggable mode)
  cell.contentEditable = "false";

  // Store if we're in edit mode
  let isInEditMode = false;

  // Helper function to clear all edit mode indicators in the table
  const clearAllTableCellIndicators = () => {
    const table = cell.closest("table");
    if (table) {
      const allCells = table.querySelectorAll("th, td");
      allCells.forEach((otherCell) => {
        otherCell.style.outline = "";

        otherCell.contentEditable = "false";
      });
    }
  };

  // Double-click to enter edit mode
  cell.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    if (!isInEditMode) {
      pushCurrentSlideState();

      // Clear all other cell indicators first
      clearAllTableCellIndicators();

      // Set this cell to edit mode
      cell.contentEditable = "true";
      cell.focus();
      isInEditMode = true;

      // Add visual indicator for edit mode
      cell.style.outline = "2px solid #007bff";
    }
  });

  // Mouse down during edit mode should not propagate to prevent dragging
  cell.addEventListener("mousedown", (e) => {
    if (isInEditMode && cell.contentEditable === "true") {
      e.stopPropagation();
    }
  });

  // Click handler to keep focus when clicking inside the active cell
  cell.addEventListener("click", (e) => {
    if (isInEditMode && cell.contentEditable === "true") {
      e.stopPropagation();
      // Ensure the cell stays focused when clicking inside it
      if (document.activeElement !== cell) {
        cell.focus();
      }
    }
  });

  // Blur to exit edit mode
  cell.addEventListener("blur", () => {
    setTimeout(() => {
      // Check if no other table cell is now focused
      const focusedCell = document.activeElement;
      const isFocusedCellInSameTable =
        focusedCell &&
        focusedCell.closest("table") === cell.closest("table") &&
        (focusedCell.tagName === "TH" || focusedCell.tagName === "TD");

      // Also check if the focus is still within this specific cell
      const isFocusStillInThisCell =
        focusedCell === cell || cell.contains(focusedCell);

      if (!isFocusedCellInSameTable && !isFocusStillInThisCell) {
        cell.contentEditable = "false";
        isInEditMode = false;

        // Remove visual indicators
        cell.style.outline = "";

        // Update the data
        updateCellData(element, cell);
      }
    }, 0);
  });
}

// Helper function used by the rendering engine in renderSlide.js
export function _renderTable(el, container, isInteractivePlayback) {
  const table = document.createElement("table");

  // Migration: Ensure useBgColor property exists for backward compatibility
  if (el.useBgColor === undefined) {
    // Check if old property exists and migrate it
    if (el.useCustomBg !== undefined) {
      el.useBgColor = el.useCustomBg;
    } else {
      el.useBgColor = true; // Default to enabled for existing tables
    }
  }

  // Migration: Ensure useHeaderBgColor property exists for backward compatibility
  if (el.useHeaderBgColor === undefined) {
    el.useHeaderBgColor = true; // Default to enabled for existing tables
  }
  if (el.headerBgColor === undefined) {
    el.headerBgColor = "#f8f9fa"; // Default header background color
  }
  if (el.headerFontColor === undefined) {
    el.headerFontColor = "#212529"; // Default header font color
  }

  // Migration: Convert old property names to new ones
  if (el.customBgColor !== undefined && el.tableBgColor === undefined) {
    el.tableBgColor = el.customBgColor;
  }
  if (el.backgroundColor !== undefined && el.tableBgColor === undefined) {
    el.tableBgColor = el.backgroundColor;
    delete el.backgroundColor; // Remove to prevent element container background conflicts
  }
  if (el.customFontColor !== undefined && el.fontColor === undefined) {
    el.fontColor = el.customFontColor;
  }
  if (el.customStripedBgColor !== undefined && el.stripedColor === undefined) {
    el.stripedColor = el.customStripedBgColor;
  }
  if (
    el.customStripedFontColor !== undefined &&
    el.stripedFontColor === undefined
  ) {
    el.stripedFontColor = el.customStripedFontColor;
  }
  if (el.customBorderColor !== undefined && el.borderColor === undefined) {
    el.borderColor = el.customBorderColor;
  }
  if (
    el.customBorderThickness !== undefined &&
    el.borderThickness === undefined
  ) {
    el.borderThickness = el.customBorderThickness;
  }

  // Build base table classes - remove Bootstrap style dependencies
  let tableClass = "table";
  if (el.striped) tableClass += " table-striped";
  if (el.bordered) tableClass += " table-bordered";

  // Set border styling using Bootstrap table variables
  if (el.bordered) {
    table.style.setProperty(
      "--bs-table-border-color",
      el.borderColor || "#dee2e6",
    );
    table.style.setProperty(
      "--bs-border-width",
      `${el.borderThickness || 1}px`,
    );
  } else {
    table.style.setProperty("--bs-table-border-color", "transparent");
    table.style.setProperty("--bs-border-width", "1px"); // Reset to default
  }

  // Set background color conditionally
  if (el.useBgColor) {
    table.style.setProperty("--bs-table-bg", el.tableBgColor || "#ffffff");
  } else {
    table.style.setProperty("--bs-table-bg", "transparent");
  }

  // Set font color using Bootstrap table variables
  table.style.setProperty("--bs-table-color", el.fontColor || "#212529");

  // Set striped colors if striped is enabled
  if (el.striped) {
    table.style.setProperty(
      "--bs-table-striped-bg",
      el.stripedColor || "#f8f9fa",
    );
    table.style.setProperty(
      "--bs-table-striped-color",
      el.stripedFontColor || "#212529",
    );
  }

  table.className = tableClass;
  table.style.width = "100%";

  // Apply sizing based on element settings
  if (el.cellSizing === "even") {
    table.style.height = "100%";
  } else {
    table.style.height = "auto";
  }

  // Create table structure
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  // Apply header colors with higher specificity
  if (el.useHeaderBgColor) {
    thead.style.setProperty(
      "background-color",
      el.headerBgColor || "#f8f9fa",
      "important",
    );
  }
  thead.style.setProperty(
    "color",
    el.headerFontColor || "#212529",
    "important",
  );

  const data = el.data || generateTableData(el.rows || 3, el.cols || 3);

  // Create header row
  if (data.length > 0) {
    const headerRow = document.createElement("tr");
    if (el.cellSizing === "even") {
      headerRow.style.height = `${100 / data.length}%`;
    }
    data[0].forEach((cellText) => {
      const th = document.createElement("th");
      th.textContent = cellText;
      th.style.padding = "8px";
      th.style.fontSize = `${el.headerFontSize || 2.3}rem`;
      th.style.fontFamily = `'${el.headerFontFamily || getDefaultFont()}'`;

      // Apply header colors with higher specificity
      if (el.useHeaderBgColor) {
        th.style.setProperty(
          "background-color",
          el.headerBgColor || "#f8f9fa",
          "important",
        );
      }
      th.style.setProperty(
        "color",
        el.headerFontColor || "#212529",
        "important",
      );

      // Setup edit mode functionality
      setupTableCellEditMode(th, el, isInteractivePlayback);

      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
  }

  // Create body rows
  for (let i = 1; i < data.length; i++) {
    const row = document.createElement("tr");
    if (el.cellSizing === "even") {
      row.style.height = `${100 / data.length}%`;
    }
    data[i].forEach((cellText) => {
      const td = document.createElement("td");
      td.textContent = cellText;
      td.style.padding = "8px";
      td.style.fontSize = `${el.rowFontSize || 1.7}rem`;
      td.style.fontFamily = `'${el.rowFontFamily || getDefaultFont()}'`;

      // Setup edit mode functionality
      setupTableCellEditMode(td, el, isInteractivePlayback);

      row.appendChild(td);
    });
    tbody.appendChild(row);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);
}

function updateCellData(element, cell) {
  // Find the cell's position and update the data array
  const table = cell.closest("table");
  const row = cell.closest("tr");
  const rowIndex = Array.from(table.querySelectorAll("tr")).indexOf(row);
  const cellIndex = Array.from(row.children).indexOf(cell);

  if (
    element.data &&
    element.data[rowIndex] &&
    element.data[rowIndex][cellIndex] !== undefined
  ) {
    // Save previous state for undo functionality
    pushCurrentSlideState();
    element.data[rowIndex][cellIndex] = cell.textContent;
  }
}

export function setupTableToolbar() {
  if (
    !window.selectedElementForUpdate ||
    window.selectedElementForUpdate.element.type !== "table"
  ) {
    return;
  }

  const element = window.selectedElementForUpdate.element;

  // Set rows and cols inputs
  const rowsInput = document.getElementById("table-rows");
  const colsInput = document.getElementById("table-cols");

  if (rowsInput) rowsInput.value = element.rows || 3;
  if (colsInput) colsInput.value = element.cols || 3;

  // Set table style dropdown
  const tableStyleSelect = document.getElementById("table-style");
  if (tableStyleSelect) {
    tableStyleSelect.value = element.tableStyle || "table";
  }

  // Set table sizing dropdown
  const tableSizingSelect = document.getElementById("table-sizing");
  if (tableSizingSelect) {
    tableSizingSelect.value = element.cellSizing || "auto";
  }

  // Set font size selects
  const headerFontSizeSelect = document.getElementById(
    "table-header-font-size",
  );
  const rowFontSizeSelect = document.getElementById("table-row-font-size");

  if (headerFontSizeSelect)
    headerFontSizeSelect.value = element.headerFontSize || 2.3;
  if (rowFontSizeSelect) rowFontSizeSelect.value = element.rowFontSize || 1.7;

  // Set font family selects
  const headerFontFamilySelect = document.getElementById(
    "table-header-font-family",
  );
  const rowFontFamilySelect = document.getElementById("table-row-font-family");

  if (headerFontFamilySelect)
    headerFontFamilySelect.value = element.headerFontFamily || getDefaultFont();
  if (rowFontFamilySelect)
    rowFontFamilySelect.value = element.rowFontFamily || getDefaultFont();

  // Set checkboxes
  const stripedCheckbox = document.getElementById("table-striped");
  const borderedCheckbox = document.getElementById("table-bordered");

  if (stripedCheckbox)
    stripedCheckbox.checked =
      element.striped !== undefined ? element.striped : true;
  if (borderedCheckbox)
    borderedCheckbox.checked =
      element.bordered !== undefined ? element.bordered : true;

  // Set color controls
  const bgColorInput = document.getElementById("table-bg-color");
  const fontColorInput = document.getElementById("table-font-color");
  const useBgColorCheckbox = document.getElementById("table-use-bg-color");
  const headerBgColorInput = document.getElementById("table-header-bg-color");
  const headerFontColorInput = document.getElementById(
    "table-header-font-color",
  );
  const useHeaderBgColorCheckbox = document.getElementById(
    "table-use-header-bg-color",
  );
  const stripedBgColorInput = document.getElementById("table-striped-bg-color");
  const stripedFontColorInput = document.getElementById(
    "table-striped-font-color",
  );
  const borderColorInput = document.getElementById("table-border-color");
  const borderThicknessInput = document.getElementById(
    "table-border-thickness",
  );

  if (bgColorInput) bgColorInput.value = element.tableBgColor || "#ffffff";
  if (fontColorInput) fontColorInput.value = element.fontColor || "#212529";
  if (useBgColorCheckbox)
    useBgColorCheckbox.checked =
      element.useBgColor !== undefined ? element.useBgColor : true;

  if (headerBgColorInput)
    headerBgColorInput.value = element.headerBgColor || "#f8f9fa";
  if (headerFontColorInput)
    headerFontColorInput.value = element.headerFontColor || "#212529";
  if (useHeaderBgColorCheckbox)
    useHeaderBgColorCheckbox.checked =
      element.useHeaderBgColor !== undefined ? element.useHeaderBgColor : true;
  if (headerBgColorInput)
    headerBgColorInput.value = element.headerBgColor || "#f8f9fa";
  if (headerFontColorInput)
    headerFontColorInput.value = element.headerFontColor || "#212529";
  if (useHeaderBgColorCheckbox)
    useHeaderBgColorCheckbox.checked =
      element.useHeaderBgColor !== undefined ? element.useHeaderBgColor : true;
  if (stripedBgColorInput)
    stripedBgColorInput.value = element.stripedColor || "#f8f9fa";
  if (stripedFontColorInput)
    stripedFontColorInput.value = element.stripedFontColor || "#212529";
  if (borderColorInput)
    borderColorInput.value = element.borderColor || "#dee2e6";
  if (borderThicknessInput)
    borderThicknessInput.value = element.borderThickness || 1;
}

/**
 * Populates the font family dropdowns with available fonts.
 */
function populateTableFontDropdowns() {
  const headerFontFamilySelect = document.getElementById(
    "table-header-font-family",
  );
  const rowFontFamilySelect = document.getElementById("table-row-font-family");

  // Clear existing options for both dropdowns
  if (headerFontFamilySelect) headerFontFamilySelect.innerHTML = "";
  if (rowFontFamilySelect) rowFontFamilySelect.innerHTML = "";

  // Add default system fonts
  const defaultFonts = getDefaultFonts();
  defaultFonts.forEach((fontName) => {
    // Add to header font dropdown
    if (headerFontFamilySelect) {
      const option = document.createElement("option");
      option.value = fontName;
      option.textContent = fontName;
      option.style.fontFamily = fontName;
      headerFontFamilySelect.appendChild(option);
    }

    // Add to row font dropdown
    if (rowFontFamilySelect) {
      const option = document.createElement("option");
      option.value = fontName;
      option.textContent = fontName;
      option.style.fontFamily = fontName;
      rowFontFamilySelect.appendChild(option);
    }
  });

  // Add fetched custom fonts
  const availableFonts = getAvailableFonts();
  availableFonts.forEach((font) => {
    if (font.name) {
      // Add to header font dropdown
      if (headerFontFamilySelect) {
        const option = document.createElement("option");
        option.value = font.name;
        option.textContent = font.name;
        option.style.fontFamily = `'${font.name}'`;
        headerFontFamilySelect.appendChild(option);
      }

      // Add to row font dropdown
      if (rowFontFamilySelect) {
        const option = document.createElement("option");
        option.value = font.name;
        option.textContent = font.name;
        option.style.fontFamily = `'${font.name}'`;
        rowFontFamilySelect.appendChild(option);
      }
    }
  });
}

/**
 * Initialize table popover buttons
 */
function initTablePopoverButtons() {
  // Structure & Layout popover button
  const structureBtn = document.getElementById("table-structure-btn");
  if (structureBtn) {
    structureBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showTableStructurePopover(structureBtn);
    });
  }

  // Typography popover button
  const typographyBtn = document.getElementById("table-typography-btn");
  if (typographyBtn) {
    typographyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showTableTypographyPopover(typographyBtn);
    });
  }

  // Color popover button
  const colorBtn = document.getElementById("table-color-btn");
  if (colorBtn) {
    colorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showTableColorPopover(colorBtn);
    });
  }
}

/**
 * Show table structure popover
 */
function showTableStructurePopover(button) {
  // Remove any existing popovers
  document.querySelectorAll(".table-popover").forEach((p) => p.remove());

  const popover = document.createElement("div");
  popover.className = "table-popover popover";
  popover.style.position = "absolute";
  popover.style.zIndex = "10000";
  popover.style.minWidth = "250px";
  popover.style.padding = "15px";

  // Header
  const header = document.createElement("h6");
  header.textContent = gettext("Structure & Layout");
  header.style.marginBottom = "15px";
  header.style.borderBottom = "1px solid #dee2e6";
  header.style.paddingBottom = "8px";
  popover.appendChild(header);

  // Rows control
  const rowsDiv = document.createElement("div");
  rowsDiv.className = "mb-3";
  const rowsLabel = document.createElement("label");
  rowsLabel.textContent = gettext("Number of Rows:");
  rowsLabel.className = "form-label small fw-bold";
  const rowsInput = document.createElement("input");
  rowsInput.type = "number";
  rowsInput.min = "1";
  rowsInput.max = "20";
  rowsInput.className = "form-control form-control-sm";
  rowsInput.value = document.getElementById("table-rows").value;

  // Copy event listeners
  rowsInput.addEventListener("change", () => {
    document.getElementById("table-rows").value = rowsInput.value;
    updateTableStructure();
  });
  rowsInput.addEventListener("input", () => {
    document.getElementById("table-rows").value = rowsInput.value;
    debounceTableStructureUpdate();
  });

  rowsDiv.appendChild(rowsLabel);
  rowsDiv.appendChild(rowsInput);
  popover.appendChild(rowsDiv);

  // Columns control
  const colsDiv = document.createElement("div");
  colsDiv.className = "mb-3";
  const colsLabel = document.createElement("label");
  colsLabel.textContent = gettext("Number of Columns:");
  colsLabel.className = "form-label small fw-bold";
  const colsInput = document.createElement("input");
  colsInput.type = "number";
  colsInput.min = "1";
  colsInput.max = "10";
  colsInput.className = "form-control form-control-sm";
  colsInput.value = document.getElementById("table-cols").value;

  // Copy event listeners
  colsInput.addEventListener("change", () => {
    document.getElementById("table-cols").value = colsInput.value;
    updateTableStructure();
  });
  colsInput.addEventListener("input", () => {
    document.getElementById("table-cols").value = colsInput.value;
    debounceTableStructureUpdate();
  });

  colsDiv.appendChild(colsLabel);
  colsDiv.appendChild(colsInput);
  popover.appendChild(colsDiv);

  // Cell sizing control
  const sizingDiv = document.createElement("div");
  sizingDiv.className = "mb-3";
  const sizingLabel = document.createElement("label");
  sizingLabel.textContent = gettext("Cell Sizing:");
  sizingLabel.className = "form-label small fw-bold";
  const sizingSelect = document.createElement("select");
  sizingSelect.className = "form-select form-select-sm";

  // Copy options from hidden select
  const originalSizingSelect = document.getElementById("table-sizing");
  sizingSelect.innerHTML = originalSizingSelect.innerHTML;
  sizingSelect.value = originalSizingSelect.value;

  sizingSelect.addEventListener("change", () => {
    originalSizingSelect.value = sizingSelect.value;
    updateTableSizingLive();
  });

  sizingDiv.appendChild(sizingLabel);
  sizingDiv.appendChild(sizingSelect);
  popover.appendChild(sizingDiv);

  // Position and show popover
  positionPopover(button, popover);
  document.body.appendChild(popover);
}

/**
 * Show table typography popover
 */
function showTableTypographyPopover(button) {
  // Remove any existing popovers
  document.querySelectorAll(".table-popover").forEach((p) => p.remove());

  const popover = document.createElement("div");
  popover.className = "table-popover popover";
  popover.style.position = "absolute";
  popover.style.zIndex = "10000";
  popover.style.minWidth = "280px";
  popover.style.padding = "15px";

  // Header
  const header = document.createElement("h6");
  header.textContent = gettext("Typography");
  header.style.marginBottom = "15px";
  header.style.borderBottom = "1px solid #dee2e6";
  header.style.paddingBottom = "8px";
  popover.appendChild(header);

  // Header font size
  const headerFontSizeDiv = document.createElement("div");
  headerFontSizeDiv.className = "mb-3";
  const headerFontSizeLabel = document.createElement("label");
  headerFontSizeLabel.textContent = gettext("Header Font Size:");
  headerFontSizeLabel.className = "form-label small fw-bold";
  const headerFontSizeSelect = document.createElement("select");
  headerFontSizeSelect.className = "form-select form-select-sm";

  // Copy options from hidden select
  const originalHeaderSizeSelect = document.getElementById(
    "table-header-font-size",
  );
  headerFontSizeSelect.innerHTML = originalHeaderSizeSelect.innerHTML;
  headerFontSizeSelect.value = originalHeaderSizeSelect.value;

  headerFontSizeSelect.addEventListener("change", () => {
    originalHeaderSizeSelect.value = headerFontSizeSelect.value;
    updateTableFontSizeLive();
  });

  headerFontSizeDiv.appendChild(headerFontSizeLabel);
  headerFontSizeDiv.appendChild(headerFontSizeSelect);
  popover.appendChild(headerFontSizeDiv);

  // Header font family
  const headerFontFamilyDiv = document.createElement("div");
  headerFontFamilyDiv.className = "mb-3";
  const headerFontFamilyLabel = document.createElement("label");
  headerFontFamilyLabel.textContent = gettext("Header Font Family:");
  headerFontFamilyLabel.className = "form-label small fw-bold";
  const headerFontFamilySelect = document.createElement("select");
  headerFontFamilySelect.className = "form-select form-select-sm";

  // Copy options from hidden select
  const originalHeaderFamilySelect = document.getElementById(
    "table-header-font-family",
  );
  headerFontFamilySelect.innerHTML = originalHeaderFamilySelect.innerHTML;
  headerFontFamilySelect.value = originalHeaderFamilySelect.value;

  headerFontFamilySelect.addEventListener("change", () => {
    originalHeaderFamilySelect.value = headerFontFamilySelect.value;
    updateTableFontFamilyLive();
  });

  headerFontFamilyDiv.appendChild(headerFontFamilyLabel);
  headerFontFamilyDiv.appendChild(headerFontFamilySelect);
  popover.appendChild(headerFontFamilyDiv);

  // Row font size
  const rowFontSizeDiv = document.createElement("div");
  rowFontSizeDiv.className = "mb-3";
  const rowFontSizeLabel = document.createElement("label");
  rowFontSizeLabel.textContent = gettext("Row Font Size:");
  rowFontSizeLabel.className = "form-label small fw-bold";
  const rowFontSizeSelect = document.createElement("select");
  rowFontSizeSelect.className = "form-select form-select-sm";

  // Copy options from hidden select
  const originalRowSizeSelect = document.getElementById("table-row-font-size");
  rowFontSizeSelect.innerHTML = originalRowSizeSelect.innerHTML;
  rowFontSizeSelect.value = originalRowSizeSelect.value;

  rowFontSizeSelect.addEventListener("change", () => {
    originalRowSizeSelect.value = rowFontSizeSelect.value;
    updateTableFontSizeLive();
  });

  rowFontSizeDiv.appendChild(rowFontSizeLabel);
  rowFontSizeDiv.appendChild(rowFontSizeSelect);
  popover.appendChild(rowFontSizeDiv);

  // Row font family
  const rowFontFamilyDiv = document.createElement("div");
  rowFontFamilyDiv.className = "mb-3";
  const rowFontFamilyLabel = document.createElement("label");
  rowFontFamilyLabel.textContent = gettext("Row Font Family:");
  rowFontFamilyLabel.className = "form-label small fw-bold";
  const rowFontFamilySelect = document.createElement("select");
  rowFontFamilySelect.className = "form-select form-select-sm";

  // Copy options from hidden select
  const originalRowFamilySelect = document.getElementById(
    "table-row-font-family",
  );
  rowFontFamilySelect.innerHTML = originalRowFamilySelect.innerHTML;
  rowFontFamilySelect.value = originalRowFamilySelect.value;

  rowFontFamilySelect.addEventListener("change", () => {
    originalRowFamilySelect.value = rowFontFamilySelect.value;
    updateTableFontFamilyLive();
  });

  rowFontFamilyDiv.appendChild(rowFontFamilyLabel);
  rowFontFamilyDiv.appendChild(rowFontFamilySelect);
  popover.appendChild(rowFontFamilyDiv);

  // Position and show popover
  positionPopover(button, popover);
  document.body.appendChild(popover);
}

/**
 * Show table color popover
 */
function showTableColorPopover(button) {
  // Remove any existing popovers
  document.querySelectorAll(".table-popover").forEach((p) => p.remove());

  const popover = document.createElement("div");
  popover.className = "table-popover popover";
  popover.style.position = "absolute";
  popover.style.zIndex = "10000";
  popover.style.minWidth = "550px";
  popover.style.maxWidth = "600px";
  popover.style.padding = "15px";
  popover.style.maxHeight = "650px";
  popover.style.overflowY = "auto";

  // Header
  const header = document.createElement("h6");
  header.textContent = gettext("Table Colors");
  header.style.marginBottom = "15px";
  header.style.borderBottom = "1px solid #dee2e6";
  header.style.paddingBottom = "8px";
  popover.appendChild(header);

  // Helper function to create a simple color picker
  const createSimpleColorSection = (
    titleText,
    colorInputId,
    transparentCheckboxId,
    currentColor,
  ) => {
    const colorDiv = document.createElement("div");
    colorDiv.className = "mb-3";

    const headerDiv = document.createElement("div");
    headerDiv.className =
      "d-flex align-items-center justify-content-between mb-2";

    const label = document.createElement("label");
    label.className = "form-label small fw-bold mb-0";
    label.textContent = titleText;

    // Add transparent checkbox directly next to the label if provided
    if (transparentCheckboxId) {
      const transparentDiv = document.createElement("div");
      transparentDiv.className = "form-check";

      const transparentCheckbox = document.createElement("input");
      transparentCheckbox.type = "checkbox";
      transparentCheckbox.className = "form-check-input";
      transparentCheckbox.id = "popover-" + transparentCheckboxId;
      transparentCheckbox.checked =
        document.getElementById(transparentCheckboxId)?.checked || false;

      const transparentLabel = document.createElement("label");
      transparentLabel.className = "form-check-label text-muted small";
      transparentLabel.setAttribute("for", "popover-" + transparentCheckboxId);
      transparentLabel.textContent = gettext("Transparent");

      transparentCheckbox.addEventListener("change", () => {
        if (document.getElementById(transparentCheckboxId)) {
          document.getElementById(transparentCheckboxId).checked =
            transparentCheckbox.checked;
        }
        updateTableColorsLive();
      });

      transparentDiv.appendChild(transparentCheckbox);
      transparentDiv.appendChild(transparentLabel);

      headerDiv.appendChild(label);
      headerDiv.appendChild(transparentDiv);
    } else {
      headerDiv.appendChild(label);
    }

    // Color picker section
    const colorPickerDiv = document.createElement("div");
    colorPickerDiv.className = "d-flex align-items-center gap-2";

    const colorDisplay = document.createElement("div");
    colorDisplay.style.width = "40px";
    colorDisplay.style.height = "40px";
    colorDisplay.style.backgroundColor = currentColor;
    colorDisplay.style.border = "2px solid #dee2e6";
    colorDisplay.style.borderRadius = "4px";
    colorDisplay.style.cursor = "pointer";

    const colorButton = document.createElement("button");
    colorButton.type = "button";
    colorButton.className = "btn btn-outline-secondary btn-sm";
    colorButton.textContent = gettext("Choose Color");

    // Current color text
    const colorText = document.createElement("span");
    colorText.className = "text-muted small";
    colorText.textContent = currentColor.toUpperCase();

    colorPickerDiv.appendChild(colorDisplay);
    colorPickerDiv.appendChild(colorButton);
    colorPickerDiv.appendChild(colorText);

    colorDiv.appendChild(headerDiv);
    colorDiv.appendChild(colorPickerDiv);

    const showColorPicker = () => {
      // Reset all other color buttons first
      popover.querySelectorAll("button").forEach((btn) => {
        if (
          btn.textContent.includes(gettext("Selecting")) ||
          btn.textContent.includes("Selecting")
        ) {
          btn.style.backgroundColor = "";
          btn.style.color = "";
          btn.style.boxShadow = "";
          btn.style.border = "";
          btn.textContent = gettext("Choose Color");
          const arrow = btn.querySelector(".selection-arrow");
          if (arrow) arrow.remove();
        }
      });

      // Add visual indicator to the current button
      colorButton.style.backgroundColor = "#000000";
      colorButton.style.color = "#ffffff";
      colorButton.style.border = "2px solid #007bff";
      colorButton.style.boxShadow = "0 0 0 3px rgba(0, 123, 255, 0.25)";
      colorButton.innerHTML = `${gettext("Selecting")} <span class="selection-arrow">→</span>`;

      // Position the color palette
      const paletteButton = {
        getBoundingClientRect: () => {
          const popoverRect = popover.getBoundingClientRect();
          return {
            top: popoverRect.top,
            bottom: popoverRect.bottom,
            left: popoverRect.right,
            right: popoverRect.right,
            width: 0,
            height: popoverRect.height,
          };
        },
      };

      showColorPalette(
        paletteButton,
        (selectedColor) => {
          // Reset visual indicator
          colorButton.style.backgroundColor = "";
          colorButton.style.color = "";
          colorButton.style.boxShadow = "";
          colorButton.style.border = "";
          colorButton.textContent = gettext("Choose Color");

          if (selectedColor) {
            document.getElementById(colorInputId).value = selectedColor;
            colorDisplay.style.backgroundColor = selectedColor;
            colorText.textContent = selectedColor.toUpperCase();
            updateTableColorsLive();
          }
        },
        { zIndex: 10001 },
      );
    };

    colorButton.addEventListener("click", showColorPicker);
    colorDisplay.addEventListener("click", showColorPicker);

    return colorDiv;
  };

  // Helper function to create conditional section (striped/bordered)
  const createConditionalSection = (titleText, enableCheckboxId, controls) => {
    const sectionDiv = document.createElement("div");
    sectionDiv.className = "mb-3";

    // Section header with checkbox
    const headerDiv = document.createElement("div");
    headerDiv.className = "d-flex align-items-center mb-2";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "form-check-input me-2";
    checkbox.id = "popover-" + enableCheckboxId;
    checkbox.checked = document.getElementById(enableCheckboxId).checked;

    const label = document.createElement("label");
    label.className = "form-check-label fw-bold";
    label.setAttribute("for", "popover-" + enableCheckboxId);
    label.textContent = titleText;

    headerDiv.appendChild(checkbox);
    headerDiv.appendChild(label);

    // Controls container
    const controlsDiv = document.createElement("div");
    controlsDiv.style.marginLeft = "20px";
    controlsDiv.style.opacity = checkbox.checked ? "1" : "0.4";
    controlsDiv.style.pointerEvents = checkbox.checked ? "auto" : "none";

    // Add controls
    controls.forEach((control) => controlsDiv.appendChild(control));

    // Checkbox event listener
    checkbox.addEventListener("change", () => {
      document.getElementById(enableCheckboxId).checked = checkbox.checked;
      controlsDiv.style.opacity = checkbox.checked ? "1" : "0.4";
      controlsDiv.style.pointerEvents = checkbox.checked ? "auto" : "none";
      updateTableColorsLive();
    });

    sectionDiv.appendChild(headerDiv);
    sectionDiv.appendChild(controlsDiv);
    return sectionDiv;
  };

  // Background color section (conditional like other sections)
  const bgColorControl = createSimpleColorSection(
    gettext("Background Color"),
    "table-bg-color",
    null,
    document.getElementById("table-bg-color").value,
  );

  const bgColorSection = createConditionalSection(
    gettext("Background"),
    "table-use-bg-color",
    [bgColorControl],
  );
  popover.appendChild(bgColorSection);

  // Add section separator
  const separator1 = document.createElement("hr");
  separator1.style.margin = "15px 0";

  popover.appendChild(separator1);

  // Font color section (always enabled, with indented color picker)
  const fontColorSection = createSimpleColorSection(
    gettext("Font Color"),
    "table-font-color",
    null,
    document.getElementById("table-font-color").value,
  );
  fontColorSection.className = "mb-3";

  // Only indent the color picker part, not the title
  const colorPickerDiv = fontColorSection.querySelector(
    ".d-flex.align-items-center.gap-2",
  );
  if (colorPickerDiv) {
    colorPickerDiv.style.marginLeft = "20px";
  }

  popover.appendChild(fontColorSection);

  // Add section separator
  const separator2 = document.createElement("hr");
  separator2.style.margin = "15px 0";
  popover.appendChild(separator2);

  // Header colors section
  const headerColorsContainer = document.createElement("div");
  headerColorsContainer.className = "d-flex gap-3";
  headerColorsContainer.style.flexWrap = "wrap";

  const headerBgControl = createSimpleColorSection(
    gettext("Header Background"),
    "table-header-bg-color",
    null,
    document.getElementById("table-header-bg-color").value,
  );
  headerBgControl.style.flex = "1";
  headerBgControl.style.minWidth = "220px";

  const headerFontControl = createSimpleColorSection(
    gettext("Header Font"),
    "table-header-font-color",
    null,
    document.getElementById("table-header-font-color").value,
  );
  headerFontControl.style.flex = "1";
  headerFontControl.style.minWidth = "220px";

  headerColorsContainer.appendChild(headerBgControl);
  headerColorsContainer.appendChild(headerFontControl);

  // Header color section (conditional)
  const headerColorSection = createConditionalSection(
    gettext("Header Colors"),
    "table-use-header-bg-color",
    [headerColorsContainer],
  );
  popover.appendChild(headerColorSection);

  // Add section separator
  const separator3 = document.createElement("hr");
  separator3.style.margin = "15px 0";
  popover.appendChild(separator3);

  // Create a container for the conditional sections
  const mainSectionsContainer = document.createElement("div");
  mainSectionsContainer.className = "d-flex flex-column gap-2";

  // Create striped controls in a two-column layout
  const stripedColorsContainer = document.createElement("div");
  stripedColorsContainer.className = "d-flex gap-3";
  stripedColorsContainer.style.flexWrap = "wrap";

  const stripedBgControl = createSimpleColorSection(
    gettext("Striped Background"),
    "table-striped-bg-color",
    null, // No transparent option - disabled striping is effectively transparent
    document.getElementById("table-striped-bg-color").value,
  );
  stripedBgControl.style.flex = "1";
  stripedBgControl.style.minWidth = "220px";

  const stripedFontControl = createSimpleColorSection(
    gettext("Striped Font"),
    "table-striped-font-color",
    null,
    document.getElementById("table-striped-font-color").value,
  );
  stripedFontControl.style.flex = "1";
  stripedFontControl.style.minWidth = "220px";

  stripedColorsContainer.appendChild(stripedBgControl);
  stripedColorsContainer.appendChild(stripedFontControl);

  // Striped section
  const stripedSection = createConditionalSection(
    gettext("Striped Rows"),
    "table-striped",
    [stripedColorsContainer],
  );
  mainSectionsContainer.appendChild(stripedSection);

  // Add section separator
  const separator4 = document.createElement("hr");
  separator4.style.margin = "15px 0";
  mainSectionsContainer.appendChild(separator4);

  // Create border controls in a two-column layout
  const borderControlsContainer = document.createElement("div");
  borderControlsContainer.className = "d-flex gap-3";
  borderControlsContainer.style.flexWrap = "wrap";

  const borderColorControl = createSimpleColorSection(
    gettext("Border Color"),
    "table-border-color",
    null,
    document.getElementById("table-border-color")?.value || "#dee2e6",
  );
  borderColorControl.style.flex = "1";
  borderColorControl.style.minWidth = "220px";

  // Border thickness control
  const thicknessDiv = document.createElement("div");
  thicknessDiv.className = "mb-3";
  thicknessDiv.style.flex = "1";
  thicknessDiv.style.minWidth = "220px";

  const thicknessLabel = document.createElement("label");
  thicknessLabel.className = "form-label small fw-bold mb-0";
  thicknessLabel.textContent = gettext("Border Thickness");
  thicknessLabel.style.marginBottom = "8px";
  thicknessLabel.style.display = "block";

  const thicknessControlDiv = document.createElement("div");
  thicknessControlDiv.className = "d-flex align-items-center gap-2";
  thicknessControlDiv.style.marginTop = "8px";

  const thicknessInput = document.createElement("input");
  thicknessInput.type = "number";
  thicknessInput.min = "1";
  thicknessInput.max = "5";
  thicknessInput.className = "form-control form-control-sm";
  thicknessInput.style.width = "80px";
  thicknessInput.value =
    document.getElementById("table-border-thickness")?.value || 1;

  const thicknessLabel2 = document.createElement("span");
  thicknessLabel2.className = "text-muted small";
  thicknessLabel2.textContent = "px";

  thicknessInput.addEventListener("input", () => {
    const hiddenInput = document.getElementById("table-border-thickness");
    if (hiddenInput) {
      hiddenInput.value = thicknessInput.value;
      updateTableColorsLive();
    }
  });

  thicknessControlDiv.appendChild(thicknessInput);
  thicknessControlDiv.appendChild(thicknessLabel2);
  thicknessDiv.appendChild(thicknessLabel);
  thicknessDiv.appendChild(thicknessControlDiv);

  borderControlsContainer.appendChild(borderColorControl);
  borderControlsContainer.appendChild(thicknessDiv);

  // Bordered section
  const borderedSection = createConditionalSection(
    gettext("Bordered Table"),
    "table-bordered",
    [borderControlsContainer],
  );
  mainSectionsContainer.appendChild(borderedSection);

  // Add the main sections container to the popover
  popover.appendChild(mainSectionsContainer);

  // Position and show popover
  positionPopover(button, popover);
  document.body.appendChild(popover);
}

/**
 * Position popover relative to button
 */
function positionPopover(button, popover) {
  const rect = button.getBoundingClientRect();
  const popoverWidth = 600; // approximate max width for wider popover

  // Position below button by default
  let top = rect.bottom + 5;
  let left = rect.left;

  // Adjust if popover would go off right edge
  if (left + popoverWidth > window.innerWidth) {
    left = window.innerWidth - popoverWidth - 10;
  }

  // Adjust if popover would go off bottom edge
  const popoverHeight = 500; // approximate height for more compact design
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
