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
let fontInitializationPromise = null; // Prevent duplicate initialization

/**
 * Fetches custom fonts from the API and makes them available globally
 * @returns {Promise<Array>} Array of font objects
 */
export async function fetchAndInitializeFonts() {
  // Prevent duplicate calls - return existing promise if already in progress
  if (fontInitializationPromise) {
    console.log(
      "Font initialization already in progress, waiting for completion...",
    );
    return await fontInitializationPromise;
  }

  // In slideshow-player mode we can't assume a user token is available.
  // Allow using an apiKey (X-API-KEY) passed via query params or localStorage.
  // For regular editor mode, prefer the Authorization Bearer token.
  console.log(`Fetching and initializing fonts (mode: ${queryParams.mode})...`);

  fontInitializationPromise = _doFetchAndInitializeFonts();
  const result = await fontInitializationPromise;
  fontInitializationPromise = null; // Reset for future calls
  return result;
}

async function _doFetchAndInitializeFonts() {
  try {
    const headers = {};

    // Prefer explicit token when available (editor/admin mode)
    if (token && queryParams.mode !== "slideshow-player") {
      headers["Authorization"] = `Bearer ${token}`;
      console.log("Using Authorization Bearer token for font fetching");
    }

    // If in slideshow-player mode try apiKey from query params or localStorage
    if (queryParams.mode === "slideshow-player") {
      const apiKey = queryParams.apiKey || localStorage.getItem("apiKey");
      if (apiKey) {
        headers["X-API-KEY"] = apiKey;
        console.log(
          "Using X-API-KEY for font fetching in slideshow-player mode",
        );
      } else {
        console.warn("No API key found for slideshow-player mode");
      }
    }

    // Build URL: in slideshow-player mode prefer passing a displayWebsiteId so
    // the backend can infer the organisation without the client needing to know it.
    let fontsUrl = `${BASE_URL}/api/fonts/?organisation_id=${parentOrgID}`;
    if (queryParams.mode === "slideshow-player") {
      const displayWebsiteId =
        queryParams.displayWebsiteId ||
        queryParams.display_website_id ||
        queryParams.id ||
        queryParams.dw_id;
      if (displayWebsiteId) {
        fontsUrl = `${BASE_URL}/api/fonts/?displayWebsiteId=${displayWebsiteId}`;
        console.log(`Using displayWebsiteId-based URL: ${fontsUrl}`);
      } else {
        console.warn("No displayWebsiteId found for slideshow-player mode");
      }
    }

    console.log(`Fetching fonts from: ${fontsUrl}`);
    const fonts = await genericFetch(fontsUrl, "GET", null, headers);

    if (fonts && Array.isArray(fonts)) {
      console.log(
        `Successfully fetched ${fonts.length} fonts:`,
        fonts.map((f) => f.name),
      );
      availableFonts = fonts;

      // TEMPORARY: Always use @font-face injection for consistency
      // The FontFace API is causing timing issues in slideshow-player mode
      console.log(
        "Using @font-face stylesheet injection (forced for slideshow-player compatibility)...",
      );
      injectFontFacesIntoStylesheet(availableFonts);

      /* DISABLED: FontFace API causing timing issues
      // If we supplied an X-API-KEY header (player mode), try loading font
      // bytes via the FontFace API so the font file fetch can include headers.
      if (headers && headers["X-API-KEY"]) {
        console.log("Using FontFace API for protected font loading...");
        // Don't block the UI if this fails; fall back to stylesheet injection.
        try {
          await loadProtectedFontsViaFontFace(availableFonts, headers);
        } catch (e) {
          console.warn(
            "Falling back to @font-face injection after FontFace failure",
            e,
          );
          injectFontFacesIntoStylesheet(availableFonts);
        }
      } else {
        console.log("Using @font-face stylesheet injection...");
        injectFontFacesIntoStylesheet(availableFonts);
      }
      */

      console.log(
        `Font initialization complete. Available fonts: ${availableFonts.length}`,
      );
      return fonts;
    } else {
      console.warn("No custom fonts found or invalid response:", fonts);
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
  console.log(`Injecting @font-face rules for ${fonts.length} fonts...`);

  if (!fontStyleSheet) {
    const styleEl = document.createElement("style");
    styleEl.id = "custom-fonts-stylesheet";
    document.head.appendChild(styleEl);
    fontStyleSheet = styleEl.sheet;
    console.log("Created custom fonts stylesheet");
  }

  // Clear existing rules if any
  const existingRulesCount = fontStyleSheet.cssRules.length;
  while (fontStyleSheet.cssRules.length > 0) {
    fontStyleSheet.deleteRule(0);
  }
  if (existingRulesCount > 0) {
    console.log(`Cleared ${existingRulesCount} existing @font-face rules`);
  }

  let successCount = 0;
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
        console.log(`Added @font-face rule for: ${font.name}`);
        successCount++;
      } catch (e) {
        console.error(`Failed to insert @font-face rule for ${font.name}:`, e);
      }
    } else {
      console.warn(`Skipping font with missing name or URL:`, font);
    }
  });

  console.log(
    `@font-face injection complete: ${successCount}/${fonts.length} rules added`,
  );
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
    console.log(
      "FontFace API not supported, falling back to stylesheet injection",
    );
    injectFontFacesIntoStylesheet(fonts);
    return;
  }

  console.log(`Loading ${fonts.length} protected fonts via FontFace API...`);

  // Load all fonts in parallel for better performance
  const fontLoadPromises = fonts.map(async (font) => {
    if (!font.name || !font.font_url) {
      console.warn(`Skipping font with missing name or URL:`, font);
      return { success: false, font, error: "Missing name or URL" };
    }

    try {
      console.log(`Fetching font: ${font.name} from ${font.font_url}`);
      const resp = await fetch(font.font_url, { headers });
      if (!resp.ok) {
        const error = `HTTP ${resp.status}: ${resp.statusText}`;
        console.warn(`Failed to fetch font ${font.name}: ${error}`);
        return { success: false, font, error };
      }

      const arrayBuffer = await resp.arrayBuffer();
      console.log(
        `Font ${font.name} fetched, size: ${arrayBuffer.byteLength} bytes`,
      );

      // Construct FontFace from ArrayBuffer with more specific options
      console.log(`Creating FontFace for ${font.name}...`);
      const fontFace = new FontFace(font.name, arrayBuffer, {
        display: "swap", // Ensure font swaps when loaded
        weight: "normal", // Specify weight for variable fonts
        style: "normal",
      });

      console.log(`Loading FontFace for ${font.name}...`);
      await fontFace.load();

      console.log(`Adding FontFace for ${font.name} to document.fonts...`);
      document.fonts.add(fontFace);

      // Force font to be ready by checking it
      console.log(`Forcing font readiness check for ${font.name}...`);
      await document.fonts.load(`16px "${font.name}"`);

      // Double-check it's actually in document.fonts
      const isInDocumentFonts = Array.from(document.fonts.values()).some(
        (f) => f.family === font.name,
      );
      console.log(`Font ${font.name} in document.fonts: ${isInDocumentFonts}`);

      console.log(
        `Font ${font.name} successfully loaded and added to document.fonts`,
      );
      console.log(
        `FontFace status: ${fontFace.status}, loaded: ${fontFace.loaded}`,
      );

      // Verify it was actually added
      const fontsInDocument = Array.from(document.fonts.values()).map(
        (f) => f.family,
      );
      console.log(
        `Fonts now in document.fonts: [${fontsInDocument.join(", ")}]`,
      );

      return { success: true, font };
    } catch (e) {
      console.error(`Error loading protected font ${font.name}:`, e);
      return { success: false, font, error: e.message };
    }
  });

  // Wait for all font loading attempts to complete
  const results = await Promise.allSettled(fontLoadPromises);

  // Process results and provide summary
  const successful = results.filter(
    (r) => r.status === "fulfilled" && r.value.success,
  ).length;
  const failed = results.length - successful;

  console.log(
    `Font loading complete: ${successful}/${fonts.length} fonts loaded successfully`,
  );

  // Always also inject @font-face rules as additional fallback, especially in slideshow-player mode
  console.log("Adding @font-face rules as additional fallback...");
  injectFontFacesIntoStylesheet(fonts);

  if (failed > 0) {
    console.warn(
      `${failed} fonts failed to load via FontFace API. Failed fonts:`,
    );
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && !result.value.success) {
        console.warn(`- ${fonts[index].name}: ${result.value.error}`);
      } else if (result.status === "rejected") {
        console.warn(`- ${fonts[index].name}: ${result.reason}`);
      }
    });
  }

  // Verify fonts are actually available
  await verifyFontsLoaded(fonts);
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
 * Verifies that fonts are actually loaded and available for use
 * @param {Array} fonts - Array of font objects to verify
 */
async function verifyFontsLoaded(fonts) {
  console.log("Verifying font availability...");

  // Wait a bit for fonts to be fully processed
  await new Promise((resolve) => setTimeout(resolve, 100));

  for (const font of fonts) {
    if (!font.name) continue;

    try {
      // Check if font is available using document.fonts.check()
      const isAvailable = document.fonts.check(`12px "${font.name}"`);
      console.log(
        `Font "${font.name}" availability check: ${isAvailable ? "AVAILABLE" : "NOT AVAILABLE"}`,
      );

      if (!isAvailable) {
        console.warn(
          `Font "${font.name}" is not available despite loading attempt`,
        );
      }
    } catch (e) {
      console.warn(`Error checking font "${font.name}" availability:`, e);
    }
  }

  // Also log all currently loaded fonts
  if (document.fonts && document.fonts.values) {
    const loadedFonts = Array.from(document.fonts.values()).map(
      (f) => f.family,
    );
    console.log("All fonts currently loaded in document.fonts:", loadedFonts);
  }
}

/**
 * Actually verify fonts work by measuring text rendering
 * @returns {Promise<boolean>} - True if fonts render differently than fallback
 */
async function verifyFontsActuallyWork() {
  if (availableFonts.length === 0) return true;

  try {
    // Create a hidden canvas to test font rendering
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 200;
    canvas.height = 50;

    const testText = "Ag"; // Letters that look different in different fonts
    const fontSize = 20;

    for (const font of availableFonts) {
      if (!font.name) continue;

      // Measure text with custom font
      ctx.font = `${fontSize}px "${font.name}", Arial`;
      const customMetrics = ctx.measureText(testText);

      // Measure text with fallback font
      ctx.font = `${fontSize}px Arial`;
      const fallbackMetrics = ctx.measureText(testText);

      // If custom font is loading, measurements should be different
      const widthDiff = Math.abs(customMetrics.width - fallbackMetrics.width);
      console.log(
        `Font "${font.name}" rendering test: width diff = ${widthDiff.toFixed(2)}px`,
      );

      // Lower threshold since SUSEMono shows 0.45px difference but works
      if (widthDiff > 0.4) {
        console.log(
          `✓ Font "${font.name}" appears to be rendering correctly (diff: ${widthDiff.toFixed(2)}px)`,
        );
      } else {
        console.warn(
          `⚠ Font "${font.name}" may not be rendering (width diff: ${widthDiff}px)`,
        );
        return false;
      }
    }

    return true;
  } catch (e) {
    console.warn("Font rendering verification failed:", e);
    return false;
  }
}

/**
 * Checks if fonts have been loaded
 * @returns {boolean} True if fonts are loaded
 */
export function areFontsLoaded() {
  return availableFonts.length > 0;
}

/**
 * Wait for fonts to be fully ready for use
 * @param {number} maxWaitMs - Maximum time to wait in milliseconds
 * @returns {Promise<boolean>} - True if fonts are ready, false if timeout
 */
export async function waitForFontsReady(maxWaitMs = 3000) {
  if (availableFonts.length === 0) {
    console.log("No custom fonts to wait for");
    return true;
  }

  console.log(
    `Waiting for ${availableFonts.length} fonts to be ready (max ${maxWaitMs}ms)...`,
  );

  const startTime = Date.now();
  const checkInterval = 100; // Check every 100ms
  let lastCheckResults = [];

  while (Date.now() - startTime < maxWaitMs) {
    let allReady = true;
    const currentResults = [];

    for (const font of availableFonts) {
      if (!font.name) continue;

      try {
        // Use a more specific font check that's more likely to detect loading state changes
        const testSizes = ["12px", "16px", "20px"];
        let fontReady = true;

        for (const size of testSizes) {
          const isReady = document.fonts.check(`${size} "${font.name}"`);
          if (!isReady) {
            fontReady = false;
            break;
          }
        }

        currentResults.push({ name: font.name, ready: fontReady });

        if (!fontReady) {
          allReady = false;
        }
      } catch (e) {
        console.warn(`Error checking font "${font.name}":`, e);
        currentResults.push({
          name: font.name,
          ready: false,
          error: e.message,
        });
        allReady = false;
      }
    }

    // Log detailed results on first check or when results change
    if (
      lastCheckResults.length === 0 ||
      JSON.stringify(currentResults) !== JSON.stringify(lastCheckResults)
    ) {
      console.log(
        `Font readiness check at ${Date.now() - startTime}ms:`,
        currentResults,
      );
      lastCheckResults = currentResults;
    }

    if (allReady) {
      const waitTime = Date.now() - startTime;
      console.log(`✓ All fonts ready after ${waitTime}ms`);

      // Additional verification: try to render text with custom fonts
      const verification = await verifyFontsActuallyWork();
      if (verification) {
        console.log("✓ Font rendering verification passed");
        return true;
      } else {
        console.warn(
          "⚠ Font rendering verification failed, waiting longer...",
        );
      }
    }

    // Wait before next check
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  const waitTime = Date.now() - startTime;
  console.warn(
    `⚠ Font readiness timeout after ${waitTime}ms - proceeding anyway`,
  );
  console.log("Final font check results:", lastCheckResults);
  return false;
}

/**
 * Debug function to log current font status - useful for troubleshooting
 * Can be called from browser console: window.debugFonts()
 */
export function debugFonts() {
  console.group("Font Debug Information");

  console.log("Available fonts from API:", availableFonts);
  console.log("Current mode:", queryParams.mode);

  if (document.fonts && document.fonts.values) {
    const loadedFonts = Array.from(document.fonts.values());
    console.log(
      "Fonts in document.fonts:",
      loadedFonts.map((f) => ({
        family: f.family,
        status: f.status,
        loaded: f.loaded,
      })),
    );
  }

  const customStylesheet = document.getElementById("custom-fonts-stylesheet");
  if (customStylesheet && customStylesheet.sheet) {
    console.log(
      "@font-face rules in stylesheet:",
      Array.from(customStylesheet.sheet.cssRules).map((rule) => rule.cssText),
    );
  }

  // Test font availability
  availableFonts.forEach((font) => {
    if (font.name) {
      try {
        const isAvailable = document.fonts.check(`12px "${font.name}"`);
        console.log(
          `Font "${font.name}" check:`,
          isAvailable ? "✓ Available" : "✗ Not available",
        );
      } catch (e) {
        console.log(`Font "${font.name}" check: Error -`, e.message);
      }
    }
  });

  console.groupEnd();
}

// Make debug function available globally for easy access from browser console
if (typeof window !== "undefined") {
  window.debugFonts = debugFonts;
  window.waitForFontsReady = waitForFontsReady;

  // Add a simple visual test function
  window.testFontRendering = function (fontName = null) {
    const testFonts = fontName ? [{ name: fontName }] : availableFonts;

    console.log(`Testing font rendering for ${testFonts.length} fonts...`);

    // Create test container
    const testContainer = document.createElement("div");
    testContainer.id = "font-test-container";
    testContainer.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 10px;
      border-radius: 5px;
      z-index: 10000;
      font-size: 14px;
      max-width: 400px;
      max-height: 80vh;
      overflow-y: auto;
    `;

    // Remove existing test container
    const existing = document.getElementById("font-test-container");
    if (existing) existing.remove();

    testContainer.innerHTML = `
      <div style="margin-bottom: 10px;">
        <strong>Font Rendering Test</strong>
        <button onclick="this.parentElement.parentElement.remove()" style="float: right; background: #dc3545; color: white; border: none; padding: 2px 6px; border-radius: 3px; cursor: pointer;">×</button>
      </div>
    `;

    // Add Arial reference
    const arialDiv = document.createElement("div");
    arialDiv.style.cssText = `
      font-family: Arial, sans-serif;
      margin: 5px 0;
      padding: 5px;
      background: rgba(255,255,255,0.2);
      border-radius: 3px;
      border: 1px solid rgba(255,255,255,0.3);
    `;
    arialDiv.textContent = `Arial (reference): The quick brown fox jumps over the lazy dog`;
    testContainer.appendChild(arialDiv);

    testFonts.forEach((font) => {
      if (!font.name) return;

      const testDiv = document.createElement("div");
      testDiv.style.cssText = `
        font-family: '${font.name}', Arial, sans-serif;
        margin: 5px 0;
        padding: 5px;
        background: rgba(255,255,255,0.1);
        border-radius: 3px;
      `;
      testDiv.textContent = `${font.name}: The quick brown fox jumps over the lazy dog`;
      testContainer.appendChild(testDiv);

      // Add computed style info
      const computedStyle = window.getComputedStyle(testDiv);
      const actualFont = computedStyle.fontFamily;
      const infoDiv = document.createElement("div");
      infoDiv.style.cssText = `
        font-size: 11px;
        color: #ccc;
        margin-left: 10px;
        margin-bottom: 5px;
      `;
      infoDiv.textContent = `Computed: ${actualFont}`;
      testContainer.appendChild(infoDiv);
    });

    document.body.appendChild(testContainer);
    console.log("Font test container added to page. Click × to close.");
    console.log("Check if custom fonts look different from Arial reference.");
  };

  // Add function to check what's actually being used on page
  window.checkPageFonts = function () {
    console.group("Fonts Actually Used on Page");

    const elementsWithFonts = document.querySelectorAll("*");
    const usedFonts = new Set();

    elementsWithFonts.forEach((el) => {
      const computed = window.getComputedStyle(el);
      if (computed.fontFamily && computed.fontFamily !== "inherit") {
        usedFonts.add(computed.fontFamily);
      }
    });

    console.log("Unique font-family values in use:", Array.from(usedFonts));

    // Check specific slide elements that should use custom fonts
    const slideElements = document.querySelectorAll(
      ".textbox .text-content, .table-element, .list-element",
    );
    console.log(
      `Found ${slideElements.length} slide elements with potential custom fonts:`,
    );

    slideElements.forEach((el, index) => {
      const computed = window.getComputedStyle(el);
      const innerHTML = el.innerHTML
        ? el.innerHTML.substring(0, 50) + "..."
        : "No content";
      console.log(`Slide Element ${index + 1}:`, {
        element: el.tagName + (el.className ? "." + el.className : ""),
        computedFont: computed.fontFamily,
        inlineStyle: el.style.fontFamily || "none",
        content: innerHTML,
      });
    });

    // Check spans inside textboxes specifically
    const textboxSpans = document.querySelectorAll(
      ".textbox .text-content span[data-font-family]",
    );
    if (textboxSpans.length > 0) {
      console.log(
        `Found ${textboxSpans.length} spans with data-font-family attributes:`,
      );
      textboxSpans.forEach((span, index) => {
        const computed = window.getComputedStyle(span);
        console.log(`Span ${index + 1}:`, {
          dataFontFamily: span.getAttribute("data-font-family"),
          inlineStyle: span.style.fontFamily,
          computedFont: computed.fontFamily,
          content: span.textContent.substring(0, 30) + "...",
        });
      });
    }

    console.groupEnd();
  };

  // Add function to force-apply a custom font to test if it works
  window.forceApplyFont = function (fontName = null) {
    const targetFont =
      fontName || (availableFonts.length > 0 ? availableFonts[0].name : null);
    if (!targetFont) {
      console.error("No font specified and no fonts available");
      return;
    }

    console.log(`Force-applying font "${targetFont}" to slide elements...`);

    // Apply to textbox elements
    const textboxes = document.querySelectorAll(".textbox .text-content");
    textboxes.forEach((textbox, index) => {
      const originalFont = textbox.style.fontFamily;
      textbox.style.fontFamily = `"${targetFont}", Arial, sans-serif`;
      console.log(
        `Textbox ${index + 1}: Changed from "${originalFont}" to "${textbox.style.fontFamily}"`,
      );

      // Also apply to spans inside
      const spans = textbox.querySelectorAll("span");
      spans.forEach((span) => {
        span.style.fontFamily = `"${targetFont}", Arial, sans-serif`;
      });
    });

    // Apply to table elements
    const tables = document.querySelectorAll(".table-element table");
    tables.forEach((table, index) => {
      const cells = table.querySelectorAll("th, td");
      cells.forEach((cell) => {
        cell.style.fontFamily = `"${targetFont}", Arial, sans-serif`;
      });
      console.log(`Table ${index + 1}: Applied font to ${cells.length} cells`);
    });

    console.log(
      `Force-applied "${targetFont}" to slide elements. Check visually if font changed.`,
    );
  };
}
