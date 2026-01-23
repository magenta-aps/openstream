// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { pushCurrentSlideState } from "./undoRedo.js";
import { queryParams } from "../../../../utils/utils.js";
import { isElementLocked } from "../element_formatting/lockElement.js";
import { selectElement } from "./elementSelector.js";
import { GRID_CONFIG, GridUtils, getDragSnapSteps } from "../config/gridConfig.js";
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
    const maxColStart = GRID_CONFIG.COLUMNS - currentColSpan + 1;
    const maxRowStart = GRID_CONFIG.ROWS - currentRowSpan + 1;
    newCol = Math.max(1, Math.min(newCol, maxColStart));
    newRow = Math.max(1, Math.min(newRow, maxRowStart));

    const { x: snapX, y: snapY } = getDragSnapSteps();
    if (snapX > 1) {
      const normalizedX = newCol - 1;
      const snappedX = Math.round(normalizedX / snapX) * snapX;
      newCol = Math.max(1, Math.min(snappedX + 1, maxColStart));
    }
    if (snapY > 1) {
      const normalizedY = newRow - 1;
      const snappedY = Math.round(normalizedY / snapY) * snapY;
      newRow = Math.max(1, Math.min(snappedY + 1, maxRowStart));
    }

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

    if (hasDragged) {
      requestAnimationFrame(() => {
        if (document.body.contains(el)) {
          selectElement(el, dataObj);
        }
      });
    }
  }

  el.addEventListener("mousedown", dragMouseDown);

  if (el._dragIndicator) {
    el._dragIndicator.addEventListener("mousedown", dragMouseDown);
    el._dragIndicator.addEventListener("click", (event) => {
      event.stopPropagation();
      el.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: event.clientX,
          clientY: event.clientY,
        }),
      );
    });
  }
}

export function makeResizable(el, dataObj) {
  const handles = Array.isArray(el._resizeHandles)
    ? el._resizeHandles
    : el._resizeHandle
      ? [el._resizeHandle]
      : Array.from(el.querySelectorAll(".resize-handle"));

  if (!handles.length) return;

  let animationFrameId = null;
  let startX,
    startY,
    startWidth,
    startHeight,
    startColStart,
    startRowStart,
    startRight,
    startBottom,
    activeDirection;
  let hasResized = false;

  const parseSpan = (value) => {
    if (!value) return NaN;
    const parsed = parseInt(String(value).replace("span", "").trim(), 10);
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const getCurrentColStart = () => {
    const parsed = parseInt(el.style.gridColumnStart, 10);
    if (Number.isFinite(parsed)) return parsed;
    if (typeof dataObj.gridX === "number") return dataObj.gridX + 1;
    return 1;
  };

  const getCurrentRowStart = () => {
    const parsed = parseInt(el.style.gridRowStart, 10);
    if (Number.isFinite(parsed)) return parsed;
    if (typeof dataObj.gridY === "number") return dataObj.gridY + 1;
    return 1;
  };

  const getCurrentWidth = () => {
    const parsed = parseSpan(el.style.gridColumnEnd);
    if (Number.isFinite(parsed)) return parsed;
    if (typeof dataObj.gridWidth === "number") return dataObj.gridWidth;
    return 1;
  };

  const getCurrentHeight = () => {
    const parsed = parseSpan(el.style.gridRowEnd);
    if (Number.isFinite(parsed)) return parsed;
    if (typeof dataObj.gridHeight === "number") return dataObj.gridHeight;
    return 1;
  };

  function initResize(e, direction) {
    // Prevent resizing if element is locked
    if (isElementLocked(dataObj)) {
      e.preventDefault();
      return;
    }

    e.stopPropagation();
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    startWidth = getCurrentWidth();
    startHeight = getCurrentHeight();
    startColStart = getCurrentColStart();
    startRowStart = getCurrentRowStart();
    startRight = startColStart + startWidth - 1;
    startBottom = startRowStart + startHeight - 1;
    activeDirection = direction || "se";
    hasResized = false;
    document.addEventListener("mousemove", resizeElement);
    document.addEventListener("mouseup", stopResize);
  }

  function resizeElement(e) {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(() => {
      const originalCellWidth = GridUtils.getCellWidth(store.emulatedWidth);
      const originalCellHeight = GridUtils.getCellHeight(store.emulatedHeight);
      const effectiveCellWidth = originalCellWidth * store.currentScale;
      const effectiveCellHeight = originalCellHeight * store.currentScale;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const deltaCols = Math.trunc(deltaX / effectiveCellWidth);
      const deltaRows = Math.trunc(deltaY / effectiveCellHeight);

      let newColStart = startColStart;
      let newRowStart = startRowStart;
      let newWidth = startWidth;
      let newHeight = startHeight;

      if (activeDirection.includes("e")) {
        newWidth = startWidth + deltaCols;
        if (newWidth < 1) {
          newWidth = 1;
        }
        if (newColStart + newWidth - 1 > GRID_CONFIG.COLUMNS) {
          newWidth = GRID_CONFIG.COLUMNS - newColStart + 1;
        }
      }

      if (activeDirection.includes("s")) {
        newHeight = startHeight + deltaRows;
        if (newHeight < 1) {
          newHeight = 1;
        }
        if (newRowStart + newHeight - 1 > GRID_CONFIG.ROWS) {
          newHeight = GRID_CONFIG.ROWS - newRowStart + 1;
        }
      }

      if (activeDirection.includes("w")) {
        newColStart = startColStart + deltaCols;
        if (newColStart < 1) {
          newColStart = 1;
        }
        if (newColStart >= startRight) {
          newColStart = startRight;
        }
        newWidth = startRight - newColStart + 1;
      }

      if (activeDirection.includes("n")) {
        newRowStart = startRowStart + deltaRows;
        if (newRowStart < 1) {
          newRowStart = 1;
        }
        if (newRowStart >= startBottom) {
          newRowStart = startBottom;
        }
        newHeight = startBottom - newRowStart + 1;
      }

      newWidth = Math.max(1, Math.min(newWidth, GRID_CONFIG.COLUMNS));
      newHeight = Math.max(1, Math.min(newHeight, GRID_CONFIG.ROWS));

      if (newColStart + newWidth - 1 > GRID_CONFIG.COLUMNS) {
        newColStart = GRID_CONFIG.COLUMNS - newWidth + 1;
      }
      if (newRowStart + newHeight - 1 > GRID_CONFIG.ROWS) {
        newRowStart = GRID_CONFIG.ROWS - newHeight + 1;
      }

      const { x: snapX, y: snapY } = getDragSnapSteps();
      const adjustWidth = snapX > 1 && activeDirection.match(/[ew]/);
      const adjustHeight = snapY > 1 && activeDirection.match(/[ns]/);

      if (adjustWidth) {
        const snappedWidth = Math.max(
          1,
          Math.round(newWidth / snapX) * snapX,
        );
        if (activeDirection.includes("w")) {
          const rightEdge = newColStart + newWidth - 1;
          newWidth = Math.min(snappedWidth, GRID_CONFIG.COLUMNS);
          newColStart = Math.max(1, rightEdge - newWidth + 1);
          if (newColStart + newWidth - 1 > GRID_CONFIG.COLUMNS) {
            newWidth = GRID_CONFIG.COLUMNS - newColStart + 1;
          }
        } else {
          newWidth = Math.min(
            snappedWidth,
            GRID_CONFIG.COLUMNS - newColStart + 1,
          );
          if (newWidth < snapX) {
            newWidth = snapX;
          }
        }
      }

      if (adjustHeight) {
        const snappedHeight = Math.max(
          1,
          Math.round(newHeight / snapY) * snapY,
        );
        if (activeDirection.includes("n")) {
          const bottomEdge = newRowStart + newHeight - 1;
          newHeight = Math.min(snappedHeight, GRID_CONFIG.ROWS);
          newRowStart = Math.max(1, bottomEdge - newHeight + 1);
          if (newRowStart + newHeight - 1 > GRID_CONFIG.ROWS) {
            newHeight = GRID_CONFIG.ROWS - newRowStart + 1;
          }
        } else {
          newHeight = Math.min(
            snappedHeight,
            GRID_CONFIG.ROWS - newRowStart + 1,
          );
          if (newHeight < snapY) {
            newHeight = snapY;
          }
        }
      }

      const currentCol = getCurrentColStart();
      const currentRow = getCurrentRowStart();
      const currentWidth = getCurrentWidth();
      const currentHeight = getCurrentHeight();

      const didChange =
        newColStart !== currentCol ||
        newRowStart !== currentRow ||
        newWidth !== currentWidth ||
        newHeight !== currentHeight;

      if (!hasResized && didChange) {
        pushCurrentSlideState();
        hasResized = true;
      }

      if (!didChange) {
        return;
      }

      el.style.gridColumnStart = newColStart;
      el.style.gridColumnEnd = `span ${newWidth}`;
      el.style.gridRowStart = newRowStart;
      el.style.gridRowEnd = `span ${newHeight}`;
      dataObj.gridX = newColStart - 1;
      dataObj.gridY = newRowStart - 1;
      dataObj.gridWidth = newWidth;
      dataObj.gridHeight = newHeight;

      if (el._updateResizerPosition) {
        el._updateResizerPosition();
      }

      const info = GridUtils.formatGridInfoCompact(
        newColStart - 1,
        newRowStart - 1,
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

    if (el._updateResizerPosition) {
      el._updateResizerPosition();
    }

    clearGridInfo();
  }

  handles.forEach((handle) => {
    const direction = handle.dataset?.resizeDirection || "se";
    handle.addEventListener("mousedown", (event) => {
      initResize(event, direction);
    });
  });
}
