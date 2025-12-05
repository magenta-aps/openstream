// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { gettext } from "../../../../utils/locales.js";
import { getDefaultCellSnapForResolution } from "../../../../utils/availableAspectRatios.js";

const DEFAULT_GRID_COLUMNS = 200;
const DEFAULT_GRID_ROWS = 200;

const gridState = {
  columns: DEFAULT_GRID_COLUMNS,
  rows: DEFAULT_GRID_ROWS,
};

const gridChangeListeners = new Set();

function notifyGridChange() {
  gridChangeListeners.forEach((listener) => {
    try {
      listener({
        columns: gridState.columns,
        rows: gridState.rows,
      });
    } catch (err) {
      console.warn("Grid listener failed", err);
    }
  });
}

function applyGridStateToCSS() {
  const root = document.documentElement;
  if (!root) return;
  root.style.setProperty("--grid-columns", gridState.columns);
  root.style.setProperty("--grid-rows", gridState.rows);
}

/**
 * Grid configuration constants for the content engine
 * This is the single source of truth for grid dimensions
 */
export const GRID_CONFIG = {
  // Main grid dimensions with runtime getters
  get COLUMNS() {
    return gridState.columns;
  },
  get ROWS() {
    return gridState.rows;
  },

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

  setDimensions(columns, rows) {
    const nextColumns = Math.max(1, Math.round(Number(columns)) || 1);
    const nextRows = Math.max(1, Math.round(Number(rows)) || 1);
    const hasChanged =
      nextColumns !== gridState.columns || nextRows !== gridState.rows;
    gridState.columns = nextColumns;
    gridState.rows = nextRows;
    if (hasChanged) {
      applyGridStateToCSS();
      notifyGridChange();
    }
  },

  resetToDefault() {
    this.setDimensions(DEFAULT_GRID_COLUMNS, DEFAULT_GRID_ROWS);
  },
};

/**
 * Updates CSS custom properties to match JavaScript grid config
 * Call this when the page loads to ensure CSS and JS are in sync
 */
export function syncGridConfigWithCSS() {
  applyGridStateToCSS();
}

export function applyGridMode({ isLegacy, width, height }) {
  const normalizedWidth = Number(width);
  const normalizedHeight = Number(height);
  if (
    !isLegacy &&
    Number.isFinite(normalizedWidth) &&
    Number.isFinite(normalizedHeight) &&
    normalizedWidth > 0 &&
    normalizedHeight > 0
  ) {
    GRID_CONFIG.setDimensions(normalizedWidth, normalizedHeight);
    ensureDefaultSnapSettings();
    return;
  }
  GRID_CONFIG.resetToDefault();
  ensureDefaultSnapSettings();
}

function resolveLegacyFlag(slide) {
  if (slide?.templateId && store.templateLegacyFlags?.has(slide.templateId)) {
    return Boolean(store.templateLegacyFlags.get(slide.templateId));
  }
  if (typeof slide?.isLegacy === "boolean") {
    return slide.isLegacy;
  }
  if (typeof slide?.isLegacyGrid === "boolean") {
    return slide.isLegacyGrid;
  }
  if (typeof store.activeSlideshowIsLegacy === "boolean") {
    return store.activeSlideshowIsLegacy;
  }
  return false;
}

function getGridSignature(columns = GRID_CONFIG.COLUMNS, rows = GRID_CONFIG.ROWS) {
  return `${Math.round(columns)}x${Math.round(rows)}`;
}

export function getDefaultSnapSettings(
  columns = GRID_CONFIG.COLUMNS,
  rows = GRID_CONFIG.ROWS,
  overrides = {},
) {
  const defaultSnap = getDefaultCellSnapForResolution(columns, rows) || 1;
  return {
    unit: "cells",
    amount: defaultSnap,
    isAuto: true,
    snapEnabled: true,
    appliedGridSignature: getGridSignature(columns, rows),
    ...overrides,
  };
}

function ensureDefaultSnapSettings() {
  const defaults = getDefaultSnapSettings();

  if (!store.dragSnapSettings) {
    store.dragSnapSettings = { ...defaults };
    return;
  }

  const existing = store.dragSnapSettings;
  const isAuto = existing.isAuto !== false;
  if (!isAuto) {
    return;
  }

  if (existing.unit !== "cells") {
    existing.appliedGridSignature = defaults.appliedGridSignature;
    return;
  }

  if (
    existing.amount === defaults.amount &&
    existing.appliedGridSignature === defaults.appliedGridSignature
  ) {
    return;
  }

  store.dragSnapSettings = {
    ...existing,
    amount: defaults.amount,
    appliedGridSignature: defaults.appliedGridSignature,
    isAuto: true,
  };
}

export function syncGridToCurrentSlide(slideOverride = null) {
  const slide =
    slideOverride ??
    (store.currentSlideIndex > -1 ? store.slides[store.currentSlideIndex] : null);
  const isLegacy = resolveLegacyFlag(slide);
  store.legacyGridEnabled = isLegacy;
  applyGridMode({
    isLegacy,
    width: store.emulatedWidth,
    height: store.emulatedHeight,
  });
}

export function onGridDimensionsChange(callback) {
  if (typeof callback !== "function") {
    return () => {};
  }
  gridChangeListeners.add(callback);
  // Immediately notify so UI stays in sync on subscription
  callback({ columns: gridState.columns, rows: gridState.rows });
  return () => gridChangeListeners.delete(callback);
}

export function getDragSnapSteps() {
  ensureDefaultSnapSettings();
  const settings =
    store.dragSnapSettings || { unit: "cells", amount: 1, snapEnabled: true };

  if (settings.snapEnabled === false) {
    return { x: 1, y: 1 };
  }

  const amount = Math.max(1, Math.round(Number(settings.amount)) || 1);

  if (settings.unit === "division") {
    return {
      x: Math.max(1, Math.floor(GRID_CONFIG.COLUMNS / amount) || 1),
      y: Math.max(1, Math.floor(GRID_CONFIG.ROWS / amount) || 1),
    };
  }

  return {
    x: amount,
    y: amount,
  };
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
    const statusSegments = [];
    
    if (store.selectedElementData) {
      statusSegments.push(
        store.selectedElementData.isLocked
          ? gettext("Locked")
          : gettext("Unlocked"),
      );

      if (store.selectedElementData.isPersistent) {
        statusSegments.push(gettext("Persistent"));
      }
    }

    statusSegments.push(`${gettext("Position")}: (${x + 1}, ${y + 1})`);
    statusSegments.push(`${gettext("Size")}: ${width} × ${height}`);

    return statusSegments.join(" • ");
  },

  /**
   * Get adaptive default size for elements based on current grid dimensions and aspect ratio
   * This ensures elements have appropriate sizes per aspect ratio configuration
   * @param {string} sizeType - Type of element size needed (e.g., 'medium', 'large', 'textbox', 'qrcode', 'table', 'embedWebsite')
   * @param {string} integrationType - Optional integration type for dynamic content (e.g., 'clock', 'newsfeed', 'kmd-foreningsportalen')
   * @returns {object} Object with width and height in grid cells
   */
  getDefaultElementSize(sizeType = 'medium', integrationType = null) {
    const cols = GRID_CONFIG.COLUMNS;
    const rows = GRID_CONFIG.ROWS;
    const gridSignature = `${cols}x${rows}`;
    
    // Define exact sizes for specific aspect ratios
    // Format: 'widthxheight': { elementType: { width, height, x?, y? } }
    const aspectRatioPresets = {
      // 16:9 Landscape (1920x1080)
      '1920x1080': {
        'qrcode': { width: 144, height: 144, x: 1753, y: 913 },
        'textbox': { width: 1056, height: 189, x: 10, y: 10 },
        'medium': { width: 960, height: 540, x: null, y: null },
        'table': { width: 1200, height: 1080, x: 0, y: 0 },
        'mask': { width: 1536, height: 864, x: null, y: null },
        'embedWebsite': { width: 960, height: 1080, x: 100, y: 0 },
        // Dynamic content integrations
        'integration-clock': { width: 960, height: 540, x: null, y: null },
        'integration-newsfeed': { width: 1200, height: 800, x: null, y: null },
        'integration-newsticker': { width: 1920, height: 200, x: 0, y: 880 },
        'integration-kmd': { width: 1200, height: 1080, x: null, y: null },
        'integration-speedadmin': { width: 1200, height: 1080, x: null, y: null },
        'integration-dreambroker': { width: 1920, height: 1080, x: 0, y: 0 },
        'integration-drstreams': { width: 1920, height: 1080, x: 0, y: 0 },
        'integration-winkas': { width: 960, height: 540, x: null, y: null },
        'integration-ddb-events': { width: 1200, height: 800, x: null, y: null },
        'integration-frontdesk': { width: 1200, height: 1080, x: null, y: null },
      },
      // 9:16 Portrait (1080x1920)
      '1080x1920': {
        'qrcode': { width: 240, height: 240, x: 793, y: 1633 },
        'textbox': { width: 594, height: 336, x: 10, y: 10 },
        'medium': { width: 540, height: 960, x: null, y: null },
        'table': { width: 675, height: 1920, x: 0, y: 0 },
        'mask': { width: 864, height: 864, x: null, y: null },
        'embedWebsite': { width: 540, height: 1920, x: 100, y: 0 },
        // Dynamic content integrations
        'integration-clock': { width: 540, height: 960, x: null, y: null },
        'integration-newsfeed': { width: 675, height: 1400, x: null, y: null },
        'integration-newsticker': { width: 1080, height: 60, x: 0, y: 1860 },
        'integration-kmd': { width: 675, height: 1920, x: null, y: null },
        'integration-speedadmin': { width: 675, height: 1920, x: null, y: null },
        'integration-dreambroker': { width: 1080, height: 1920, x: 0, y: 0 },
        'integration-drstreams': { width: 1080, height: 1920, x: 0, y: 0 },
        'integration-winkas': { width: 540, height: 960, x: null, y: null },
        'integration-ddb-events': { width: 675, height: 1400, x: null, y: null },
        'integration-frontdesk': { width: 675, height: 1920, x: null, y: null },
      },
      // 4:3 Landscape (1024x768)
      '1024x768': {
        'qrcode': { width: 150, height: 150, x: 850, y: 580 },
        'textbox': { width: 563, height: 134, x: 10, y: 10 },
        'medium': { width: 512, height: 384, x: null, y: null },
        'table': { width: 640, height: 768, x: 0, y: 0 },
        'mask': { width: 819, height: 614, x: null, y: null },
        'embedWebsite': { width: 512, height: 768, x: 100, y: 0 },
        // Dynamic content integrations
        'integration-clock': { width: 512, height: 384, x: null, y: null },
        'integration-newsfeed': { width: 640, height: 576, x: null, y: null },
        'integration-newsticker': { width: 1024, height: 150, x: 0, y: 618 },
        'integration-kmd': { width: 640, height: 768, x: null, y: null },
        'integration-speedadmin': { width: 640, height: 768, x: null, y: null },
        'integration-dreambroker': { width: 1024, height: 768, x: 0, y: 0 },
        'integration-drstreams': { width: 1024, height: 768, x: 0, y: 0 },
        'integration-winkas': { width: 512, height: 384, x: null, y: null },
        'integration-ddb-events': { width: 640, height: 576, x: null, y: null },
        'integration-frontdesk': { width: 640, height: 768, x: null, y: null },
      },
      // 4:3 Portrait (768x1024)
      '768x1024': {
        'qrcode': { width: 170, height: 170, x: 564, y: 820 },
        'textbox': { width: 422, height: 179, x: 10, y: 10 },
        'medium': { width: 384, height: 512, x: null, y: null },
        'table': { width: 480, height: 1024, x: 0, y: 0 },
        'mask': { width: 614, height: 614, x: null, y: null },
        'embedWebsite': { width: 384, height: 1024, x: 100, y: 0 },
        // Dynamic content integrations
        'integration-clock': { width: 384, height: 512, x: null, y: null },
        'integration-newsfeed': { width: 480, height: 768, x: null, y: null },
        'integration-newsticker': { width: 768, height: 200, x: 0, y: 824 },
        'integration-kmd': { width: 480, height: 1024, x: null, y: null },
        'integration-speedadmin': { width: 480, height: 1024, x: null, y: null },
        'integration-dreambroker': { width: 768, height: 1024, x: 0, y: 0 },
        'integration-drstreams': { width: 768, height: 1024, x: 0, y: 0 },
        'integration-winkas': { width: 384, height: 512, x: null, y: null },
        'integration-ddb-events': { width: 480, height: 768, x: null, y: null },
        'integration-frontdesk': { width: 480, height: 1024, x: null, y: null },
      },
    };
    
    // Get preset for current grid signature
    const presetForGrid = aspectRatioPresets[gridSignature];
    
    // Check for integration-specific preset first
    if (integrationType && presetForGrid) {
      const integrationKey = `integration-${integrationType}`;
      if (presetForGrid[integrationKey]) {
        return presetForGrid[integrationKey];
      }
    }
    
    // Fall back to regular size type
    if (presetForGrid && presetForGrid[sizeType]) {
      return presetForGrid[sizeType];
    }
    
    // Fallback: calculate proportionally if no exact preset exists
    // Use 1920x1080 as base and scale proportionally
    const basePresets = aspectRatioPresets['1920x1080'];
    if (basePresets && basePresets[sizeType]) {
      const base = basePresets[sizeType];
      const scaleX = cols / 1920;
      const scaleY = rows / 1080;
      
      return {
        width: Math.max(10, Math.round(base.width * scaleX)),
        height: Math.max(10, Math.round(base.height * scaleY)),
        x: base.x !== null && base.x !== undefined ? Math.round(base.x * scaleX) : null,
        y: base.y !== null && base.y !== undefined ? Math.round(base.y * scaleY) : null,
      };
    }
    
    // Ultimate fallback: use simple proportions
    return {
      width: Math.max(10, Math.round(cols * 0.50)),
      height: Math.max(10, Math.round(rows * 0.50)),
      x: null,
      y: null,
    };
  },
};
