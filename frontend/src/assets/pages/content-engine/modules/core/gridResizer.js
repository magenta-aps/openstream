// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { pushCurrentSlideState } from "./undoRedo.js";
import { queryParams } from "../../../../utils/utils.js";
import { isElementLocked } from "../element_formatting/lockElement.js";
import { GRID_CONFIG, GridUtils } from "../config/gridConfig.js";
import { updateGridInfo, clearGridInfo } from "../utils/statusBar.js";

export function makeDraggable(el, dataObj) {
  let initialOffsetCol, initialOffsetRow;
  let startX, startY;
  let hasDragged = false; // flag to track if movement has occurred

  function dragMouseDown(e) {
    if (e.target.classList.contains("resize-handle")) return;

    // Prevent dragging if element is locked
    if (isElementLocked(dataObj)) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    const gridRect = el.parentElement.getBoundingClientRect();

    // Calculate cell dimensions fresh each time to ensure current scale is used
    const originalCellWidth = GridUtils.getCellWidth(store.emulatedWidth);
    const originalCellHeight = GridUtils.getCellHeight(store.emulatedHeight);
    const effectiveCellWidth = originalCellWidth * store.currentScale;
    const effectiveCellHeight = originalCellHeight * store.currentScale;

    const mouseCol =
      Math.floor((e.clientX - gridRect.left) / effectiveCellWidth) + 1;
    const mouseRow =
      Math.floor((e.clientY - gridRect.top) / effectiveCellHeight) + 1;
    const currentCol = parseInt(el.style.gridColumnStart);
    const currentRow = parseInt(el.style.gridRowStart);
    initialOffsetCol = mouseCol - currentCol;
    initialOffsetRow = mouseRow - currentRow;
    hasDragged = false;
    document.addEventListener("mousemove", elementDrag);
    document.addEventListener("mouseup", stopElementDrag);
  }

  function elementDrag(e) {
    if (e.ctrlKey) return;
    if (!hasDragged) {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const threshold = 2;
      if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
        pushCurrentSlideState();
        hasDragged = true;
      }
    }
    const gridRect = el.parentElement.getBoundingClientRect();

    // Calculate cell dimensions fresh each time to ensure current scale is used
    const originalCellWidth = GridUtils.getCellWidth(store.emulatedWidth);
    const originalCellHeight = GridUtils.getCellHeight(store.emulatedHeight);
    const effectiveCellWidth = originalCellWidth * store.currentScale;
    const effectiveCellHeight = originalCellHeight * store.currentScale;

    let mouseCol =
      Math.floor((e.clientX - gridRect.left) / effectiveCellWidth) + 1;
    let mouseRow =
      Math.floor((e.clientY - gridRect.top) / effectiveCellHeight) + 1;
    let newCol = mouseCol - initialOffsetCol;
    let newRow = mouseRow - initialOffsetRow;

    const currentColSpan = parseInt(
      el.style.gridColumnEnd.replace("span", "").trim(),
    );
    const currentRowSpan = parseInt(
      el.style.gridRowEnd.replace("span", "").trim(),
    );
    newCol = Math.max(
      1,
      Math.min(newCol, GRID_CONFIG.COLUMNS - currentColSpan + 1),
    );
    newRow = Math.max(
      1,
      Math.min(newRow, GRID_CONFIG.ROWS - currentRowSpan + 1),
    );

    // Update element position
    el.style.gridColumnStart = newCol;
    el.style.gridRowStart = newRow;
    dataObj.gridX = newCol - 1;
    dataObj.gridY = newRow - 1;

    // Update resize handle position if it exists
    if (el._updateResizerPosition) {
      el._updateResizerPosition();
    }

    // Show grid info in status bar while dragging
    if (hasDragged) {
      const info = GridUtils.formatGridInfoCompact(
        newCol - 1, // Convert to 0-based
        newRow - 1, // Convert to 0-based
        currentColSpan,
        currentRowSpan,
      );
      updateGridInfo(info);
    }
  }

  function stopElementDrag() {
    document.removeEventListener("mousemove", elementDrag);
    document.removeEventListener("mouseup", stopElementDrag);
    
    // Final position update for resize handle
    if (el._updateResizerPosition) {
      el._updateResizerPosition();
    }
  }

  el.addEventListener("mousedown", dragMouseDown);
}

export function makeResizable(el, dataObj) {
  const resizer = el._resizeHandle || el.querySelector(".resize-handle");
  if (!resizer) return;
  
  let animationFrameId = null;
  let startX, startY, startWidth, startHeight;
  let hasResized = false;

  function initResize(e) {
    // Prevent resizing if element is locked
    if (isElementLocked(dataObj)) {
      e.preventDefault();
      return;
    }

    e.stopPropagation();
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    startWidth =
      parseInt(el.style.gridColumnEnd.replace("span", "").trim()) ||
      dataObj.gridWidth ||
      1;
    startHeight =
      parseInt(el.style.gridRowEnd.replace("span", "").trim()) ||
      dataObj.gridHeight ||
      1;
    hasResized = false;
    document.addEventListener("mousemove", resizeElement);
    document.addEventListener("mouseup", stopResize);
  }

  function resizeElement(e) {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(() => {
      // Calculate cell dimensions fresh each time to ensure current scale is used
      const originalCellWidth = GridUtils.getCellWidth(store.emulatedWidth);
      const originalCellHeight = GridUtils.getCellHeight(store.emulatedHeight);
      const effectiveCellWidth = originalCellWidth * store.currentScale;
      const effectiveCellHeight = originalCellHeight * store.currentScale;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      let newWidth = startWidth + Math.floor(deltaX / effectiveCellWidth);
      let newHeight = startHeight + Math.floor(deltaY / effectiveCellHeight);

      if (
        !hasResized &&
        (newWidth !== startWidth || newHeight !== startHeight)
      ) {
        pushCurrentSlideState();
        hasResized = true;
      }

      newWidth = Math.max(1, newWidth);
      newHeight = Math.max(1, newHeight);
      const currentCol = parseInt(el.style.gridColumnStart);
      const currentRow = parseInt(el.style.gridRowStart);
      newWidth = Math.min(newWidth, GRID_CONFIG.COLUMNS - currentCol + 1);
      newHeight = Math.min(newHeight, GRID_CONFIG.ROWS - currentRow + 1);

      // Update element styles
      el.style.gridColumnEnd = `span ${newWidth}`;
      el.style.gridRowEnd = `span ${newHeight}`;
      dataObj.gridWidth = newWidth;
      dataObj.gridHeight = newHeight;

      // Update resize handle position
      if (el._updateResizerPosition) {
        el._updateResizerPosition();
      }

      // Show grid info in status bar
      const info = GridUtils.formatGridInfoCompact(
        currentCol - 1, // Convert to 0-based
        currentRow - 1, // Convert to 0-based
        newWidth,
        newHeight,
      );
      updateGridInfo(info);
    });
  }

  function stopResize() {
    cancelAnimationFrame(animationFrameId);
    document.removeEventListener("mousemove", resizeElement);
    document.removeEventListener("mouseup", stopResize);

    // Final position update for resize handle
    if (el._updateResizerPosition) {
      el._updateResizerPosition();
    }

    // Clear grid info from status bar
    clearGridInfo();
  }

  resizer.addEventListener("mousedown", initResize);
}
