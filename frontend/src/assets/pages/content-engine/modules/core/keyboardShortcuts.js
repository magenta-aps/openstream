// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { pushCurrentSlideState } from "./undoRedo.js";
import { GRID_CONFIG, GridUtils } from "../config/gridConfig.js";
import { updateGridInfo, clearGridInfo } from "../utils/statusBar.js";
import { isElementLocked } from "../element_formatting/lockElement.js";
import { showToast } from "../../../../utils/utils.js";
import { gettext } from "../../../../utils/locales.js";

// Keyboard shortcuts: arrow keys to move selected element, Shift+arrow to resize.
// Movement/resizing happens in grid cells (consistent with drag/resize behavior).

function parseSpan(value, fallback = 1) {
  if (!value) return fallback;
  try {
    return parseInt(value.replace("span", "").trim(), 10) || fallback;
  } catch (err) {
    return fallback;
  }
}

document.addEventListener("keydown", (e) => {
  // Ignore when editing text or in input controls
  if (e.target && e.target.matches && e.target.matches("input, textarea, [contenteditable]")) return;

  const selData = store.selectedElementData;
  const selEl = store.selectedElement;
  if (!selData || !selEl) return;

  // Only act on arrow keys
  if (!e.key || !e.key.startsWith("Arrow")) return;

  // Respect locking
  if (isElementLocked(selData)) {
    try {
      showToast(gettext("This element is locked"), "Info");
    } catch (err) {}
    return;
  }

  // Push undo snapshot once at start of continuous key press
  if (!e.repeat) pushCurrentSlideState();

  // Derive current grid values (gridX/gridY are 0-based)
  const currentX = typeof selData.gridX === "number" ? selData.gridX : Math.max(0, (parseInt(selEl.style.gridColumnStart, 10) || 1) - 1);
  const currentY = typeof selData.gridY === "number" ? selData.gridY : Math.max(0, (parseInt(selEl.style.gridRowStart, 10) || 1) - 1);
  const currentWidth = typeof selData.gridWidth === "number" ? selData.gridWidth : parseSpan(selEl.style.gridColumnEnd, 1);
  const currentHeight = typeof selData.gridHeight === "number" ? selData.gridHeight : parseSpan(selEl.style.gridRowEnd, 1);

  let newX = currentX;
  let newY = currentY;
  let newW = currentWidth;
  let newH = currentHeight;

  const key = e.key; // ArrowLeft, ArrowRight, ArrowUp, ArrowDown

  if (e.shiftKey) {
    // Resize
    if (key === "ArrowRight") newW = currentWidth + 1;
    if (key === "ArrowLeft") newW = Math.max(1, currentWidth - 1);
    if (key === "ArrowDown") newH = currentHeight + 1;
    if (key === "ArrowUp") newH = Math.max(1, currentHeight - 1);

    // Constrain size so element doesn't overflow grid at current position
    newW = Math.min(newW, GRID_CONFIG.COLUMNS - newX);
    newH = Math.min(newH, GRID_CONFIG.ROWS - newY);

    // Apply
    selData.gridWidth = newW;
    selData.gridHeight = newH;
    selEl.style.gridColumnEnd = `span ${newW}`;
    selEl.style.gridRowEnd = `span ${newH}`;

    // Update resize handle if present
    if (selEl._updateResizerPosition) selEl._updateResizerPosition();

    // Update status info
    const info = GridUtils.formatGridInfoCompact(newX, newY, newW, newH);
    updateGridInfo(info);

    e.preventDefault();
    return;
  }

  // Move
  if (key === "ArrowRight") newX = currentX + 1;
  if (key === "ArrowLeft") newX = currentX - 1;
  if (key === "ArrowDown") newY = currentY + 1;
  if (key === "ArrowUp") newY = currentY - 1;

  // Constrain within grid
  const constrained = GridUtils.constrainPosition(newX, newY, currentWidth, currentHeight);
  newX = constrained.x;
  newY = constrained.y;

  // Apply
  selData.gridX = newX;
  selData.gridY = newY;
  selEl.style.gridColumnStart = `${newX + 1}`;
  selEl.style.gridRowStart = `${newY + 1}`;

  // Update resizer and status
  if (selEl._updateResizerPosition) selEl._updateResizerPosition();
  const info = GridUtils.formatGridInfoCompact(newX, newY, currentWidth, currentHeight);
  updateGridInfo(info);

  e.preventDefault();
});

// Clear status info when arrow keys are released to mimic drag/resize stop behaviour
document.addEventListener("keyup", (e) => {
  if (!e.key || !e.key.startsWith("Arrow")) return;
  clearGridInfo();
});
