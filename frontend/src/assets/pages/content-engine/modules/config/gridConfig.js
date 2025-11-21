// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { gettext } from "../../../../utils/locales.js";
/**
 * Grid configuration constants for the content engine
 * This is the single source of truth for grid dimensions
 */

export const GRID_CONFIG = {
  // Main grid dimensions
  COLUMNS: 200,
  ROWS: 200,

  // Derived values for convenience
  get TOTAL_CELLS() {
    return this.COLUMNS * this.ROWS;
  },

  // CSS grid repeat values
  get CSS_COLUMNS() {
    return `repeat(${this.COLUMNS}, 1fr)`;
  },

  get CSS_ROWS() {
    return `repeat(${this.ROWS}, 1fr)`;
  },

  // Background grid size for show-grid feature
  get BACKGROUND_SIZE() {
    return `calc(100% / ${this.COLUMNS}) calc(100% / ${this.ROWS})`;
  },
};

/**
 * Updates CSS custom properties to match JavaScript grid config
 * Call this when the page loads to ensure CSS and JS are in sync
 */
export function syncGridConfigWithCSS() {
  const root = document.documentElement;
  root.style.setProperty("--grid-columns", GRID_CONFIG.COLUMNS);
  root.style.setProperty("--grid-rows", GRID_CONFIG.ROWS);
}

/**
 * Helper functions for grid calculations
 */
export const GridUtils = {
  /**
   * Calculate cell width based on emulated width
   * @param {number} emulatedWidth - The emulated screen width
   * @returns {number} Width of a single grid cell
   */
  getCellWidth(emulatedWidth) {
    return emulatedWidth / GRID_CONFIG.COLUMNS;
  },

  /**
   * Calculate cell height based on emulated height
   * @param {number} emulatedHeight - The emulated screen height
   * @returns {number} Height of a single grid cell
   */
  getCellHeight(emulatedHeight) {
    return emulatedHeight / GRID_CONFIG.ROWS;
  },

  /**
   * Get maximum position for an element with given width
   * @param {number} elementWidth - Width of the element in grid cells
   * @returns {number} Maximum X position (0-based)
   */
  getMaxGridX(elementWidth) {
    return GRID_CONFIG.COLUMNS - elementWidth;
  },

  /**
   * Get maximum position for an element with given height
   * @param {number} elementHeight - Height of the element in grid cells
   * @returns {number} Maximum Y position (0-based)
   */
  getMaxGridY(elementHeight) {
    return GRID_CONFIG.ROWS - elementHeight;
  },

  /**
   * Constrain element position within grid boundaries
   * @param {number} x - X position (0-based)
   * @param {number} y - Y position (0-based)
   * @param {number} width - Element width in grid cells
   * @param {number} height - Element height in grid cells
   * @returns {object} Constrained position {x, y}
   */
  constrainPosition(x, y, width, height) {
    return {
      x: Math.max(0, Math.min(x, this.getMaxGridX(width))),
      y: Math.max(0, Math.min(y, this.getMaxGridY(height))),
    };
  },

  /**
   * Get centered position for an element
   * @param {number} width - Element width in grid cells
   * @param {number} height - Element height in grid cells
   * @returns {object} Centered position {x, y}
   */
  getCenteredPosition(width, height) {
    return {
      x: Math.floor((GRID_CONFIG.COLUMNS - width) / 2),
      y: Math.floor((GRID_CONFIG.ROWS - height) / 2),
    };
  },

  /**
   * Get percentage of grid occupied by element
   * @param {number} width - Element width in grid cells
   * @param {number} height - Element height in grid cells
   * @returns {object} Percentages {width, height, area}
   */
  getGridPercentages(width, height) {
    return {
      width: Math.round((width / GRID_CONFIG.COLUMNS) * 100),
      height: Math.round((height / GRID_CONFIG.ROWS) * 100),
      area: Math.round(((width * height) / GRID_CONFIG.TOTAL_CELLS) * 100),
    };
  },

  /**
   * Format grid information for display
   * @param {number} x - X position (0-based)
   * @param {number} y - Y position (0-based)
   * @param {number} width - Element width in grid cells
   * @param {number} height - Element height in grid cells
   * @returns {string} Formatted grid information
   */
  formatGridInfo(x, y, width, height) {
    const percentages = this.getGridPercentages(width, height);
    const lines = [
      `📍 Position: (${x + 1}, ${y + 1})`,
      `📐 Size: ${width} × ${height} cells`,
      `📊 Width: ${percentages.width}% | Height: ${percentages.height}%`,
      `🔲 Area: ${percentages.area}% of grid`,
    ];
    return lines.join("\n");
  },

  /**
   * Format grid information for status bar display (more compact)
   * @param {number} x - X position (0-based)
   * @param {number} y - Y position (0-based)
   * @param {number} width - Element width in grid cells
   * @param {number} height - Element height in grid cells
   * @returns {string} Formatted grid information for status bar
   */
  formatGridInfoCompact(x, y, width, height) {

    let type = store.selectedElementData.type;
    if (type === "tiptap-textbox") {
      type = "Textbox";
    }

    const percentages = this.getGridPercentages(width, height);
    return `${gettext("Type")}: ${gettext(type).toLowerCase()} • ${gettext("Move/Resize")}: ${store.selectedElementData.isLocked ? gettext("Locked") : gettext("Unlocked")} • ${store.selectedElementData.isPersistent ? gettext("Persistent") + " • " : ""}   ${gettext("Position")}: (${x + 1}, ${y + 1}) • ${gettext("Size")}: ${width} × ${height}`;
  },
};
