// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
// ─────────────────────────────────────────────────────────────
// FONT UTILITIES
// Handles fetching and managing custom fonts across the application
// ─────────────────────────────────────────────────────────────

import {
  parentOrgID,
  showToast,
  token,
  genericFetch,
  queryParams,
} from "../../../../utils/utils.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";

let availableFonts = []; // Global store for fetched fonts
let fontStyleSheet = null; // Global stylesheet for @font-face rules

/**
 * Fetches custom fonts from the API and makes them available globally
 * @returns {Promise<Array>} Array of font objects
 */
export async function fetchAndInitializeFonts() {
  // In slideshow-player mode we can't assume a user token is available.
  // Allow using an apiKey (X-API-KEY) passed via query params or localStorage.
  // For regular editor mode, prefer the Authorization Bearer token.
  try {
    const headers = {};

    // Prefer explicit token when available (editor/admin mode)
    if (token && queryParams.mode !== "slideshow-player") {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // If in slideshow-player mode try apiKey from query params or localStorage
    if (queryParams.mode === "slideshow-player") {
      const apiKey = queryParams.apiKey || localStorage.getItem("apiKey");
      if (apiKey) headers["X-API-KEY"] = apiKey;
    }

    // Build URL: in slideshow-player mode prefer passing a displayWebsiteId so
    // the backend can infer the organisation without the client needing to know it.
    let fontsUrl = `${BASE_URL}/api/fonts/?organisation_id=${parentOrgID}`;
    if (queryParams.mode === "slideshow-player") {
      const displayWebsiteId =
        queryParams.displayWebsiteId || queryParams.display_website_id || queryParams.id || queryParams.dw_id;
      if (displayWebsiteId) {
        fontsUrl = `${BASE_URL}/api/fonts/?displayWebsiteId=${displayWebsiteId}`;
      }
    }

    const fonts = await genericFetch(
      fontsUrl,
      "GET",
      null,
      headers,
    );

    if (fonts && Array.isArray(fonts)) {
      availableFonts = fonts;
      // If we supplied an X-API-KEY header (player mode), try loading font
      // bytes via the FontFace API so the font file fetch can include headers.
      if (headers && headers["X-API-KEY"]) {
        // Don't block the UI if this fails; fall back to stylesheet injection.
        try {
          await loadProtectedFontsViaFontFace(availableFonts, headers);
        } catch (e) {
          console.warn("Falling back to @font-face injection after FontFace failure", e);
          injectFontFacesIntoStylesheet(availableFonts);
        }
      } else {
        injectFontFacesIntoStylesheet(availableFonts);
      }
      return fonts;
    } else {
      console.warn("No custom fonts found or invalid response.");
      return [];
    }
  } catch (error) {
    console.error("Error fetching custom fonts:", error);
    showToast(gettext("Failed to load custom fonts."), "Error");
    return [];
  }
}

/**
 * Injects @font-face rules into a global stylesheet for fetched fonts
 * @param {Array} fonts - Array of font objects with name and font_url properties
 */
function injectFontFacesIntoStylesheet(fonts) {
  if (!fontStyleSheet) {
    const styleEl = document.createElement("style");
    styleEl.id = "custom-fonts-stylesheet";
    document.head.appendChild(styleEl);
    fontStyleSheet = styleEl.sheet;
  }

  // Clear existing rules if any
  while (fontStyleSheet.cssRules.length > 0) {
    fontStyleSheet.deleteRule(0);
  }

  fonts.forEach((font) => {
    if (font.name && font.font_url) {
      const rule = `
        @font-face {
          font-family: '${font.name}'; 
          src: url('${font.font_url}');
        }
      `;
      try {
        fontStyleSheet.insertRule(rule, fontStyleSheet.cssRules.length);
      } catch (e) {
        console.error(`Failed to insert @font-face rule for ${font.name}:`, e);
      }
    }
  });
}

/**
 * Load font files via fetch with custom headers (for protected fonts) and register
 * them using the FontFace API so requests can include X-API-KEY or other headers.
 * @param {Array} fonts
 * @param {Object} headers
 */
async function loadProtectedFontsViaFontFace(fonts, headers = {}) {
  if (!window.FontFace) {
    // FontFace API not supported; fall back to stylesheet injection
    injectFontFacesIntoStylesheet(fonts);
    return;
  }

  for (const font of fonts) {
    if (!font.name || !font.font_url) continue;

    try {
      const resp = await fetch(font.font_url, { headers });
      if (!resp.ok) {
        console.warn(`Failed to fetch font ${font.name} via fetch: ${resp.status}`);
        continue;
      }
      const arrayBuffer = await resp.arrayBuffer();
      // Construct FontFace from ArrayBuffer
      const fontFace = new FontFace(font.name, arrayBuffer);
      await fontFace.load();
      document.fonts.add(fontFace);
    } catch (e) {
      console.error(`Error loading protected font ${font.name}:`, e);
    }
  }
}

/**
 * Gets all available fonts (custom + default system fonts)
 * @returns {Array} Array of all available fonts
 */
export function getAvailableFonts() {
  return availableFonts;
}

/**
 * Gets default system fonts
 * @returns {Array} Array of default system font names
 */
export function getDefaultFonts() {
  return ["Arial"];
}

/**
 * Gets a default font (first custom font or fallback to Arial)
 * @returns {string} Default font name
 */
export function getDefaultFont() {
  return availableFonts.length > 0 ? availableFonts[0].name : "Arial";
}

/**
 * Checks if fonts have been loaded
 * @returns {boolean} True if fonts are loaded
 */
export function areFontsLoaded() {
  return availableFonts.length > 0;
}
