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
import { SPECIAL_SAVE_ENABLED } from "./specialSaveUtils.js";

const PUBLIC_BASE_PATH =
  (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";

let availableFonts = []; // Primary font list from current mode
const transientFontRegistry = new Map(); // name -> { font, slides:Set }
let fontStyleSheet = null; // Global stylesheet for @font-face rules
let fontInitializationPromise = null; // Prevent duplicate initialization
let globalFontManifest = null; // Cached manifest of static global fonts
let globalFontManifestPromise = null; // In-flight manifest fetch promise
let slideKeyCounter = 0;

const FONT_PROPERTY_KEYS = [
  "fontFamily",
  "headerFontFamily",
  "rowFontFamily",
];

function normalizeFontName(name) {
  return typeof name === "string" ? name.trim().toLowerCase() : "";
}

function getSlideKey(slide, fallbackIndex = null) {
  if (!slide || typeof slide !== "object") {
    return null;
  }
  if (slide.__fontSlideKey) {
    return slide.__fontSlideKey;
  }
  const candidate =
    slide.id ??
    slide.templateId ??
    slide.slide_id ??
    slide.uuid ??
    (typeof fallbackIndex === "number" ? `slide-${fallbackIndex}` : null) ??
    `slide-${Date.now()}-${slideKeyCounter++}`;
  slide.__fontSlideKey = String(candidate);
  return slide.__fontSlideKey;
}

function isBaseFont(name) {
  const normalized = normalizeFontName(name);
  if (!normalized) {
    return false;
  }
  return availableFonts.some(
    (font) => normalizeFontName(font.name) === normalized,
  );
}

function associateSlideWithTransientFont(fontName, slideKey) {
  if (!fontName || !slideKey) {
    return false;
  }
  const entry = transientFontRegistry.get(normalizeFontName(fontName));
  if (!entry) {
    return false;
  }
  const priorSize = entry.slides.size;
  entry.slides.add(slideKey);
  return entry.slides.size !== priorSize;
}

function getTransientFontsForSlide(slideKey) {
  if (!slideKey) {
    return [];
  }
  const fonts = [];
  transientFontRegistry.forEach((entry) => {
    if (entry.slides.has(slideKey)) {
      fonts.push(entry.font);
    }
  });
  return fonts;
}

function collectFontsFromSlide(slide) {
  const fonts = new Set();
  if (!slide || !Array.isArray(slide.elements)) {
    return fonts;
  }
  slide.elements.forEach((element) => {
    FONT_PROPERTY_KEYS.forEach((key) => {
      const value = element?.[key];
      if (typeof value === "string" && value.trim()) {
        fonts.add(value.trim());
      }
    });
  });
  return fonts;
}

function getAllFonts() {
  return [
    ...availableFonts,
    ...Array.from(transientFontRegistry.values()).map((entry) => entry.font),
  ];
}

function fontExists(name) {
  const normalized = normalizeFontName(name);
  if (!normalized) {
    return false;
  }
  if (isBaseFont(name)) {
    return true;
  }
  return transientFontRegistry.has(normalized);
}

function normalizeFontRecord(font, source = "org", { transient = false } = {}) {
  if (!font || !font.name || !(font.font_url || font.url)) {
    return null;
  }
  const fontUrl = font.font_url || font.url;
  return {
    name: font.name,
    font_url: fontUrl,
    weight: font.weight || "normal",
    style: font.style || "normal",
    source,
    isTransient: Boolean(transient),
  };
}

function refreshFontFaceRules() {
  injectFontFacesIntoStylesheet(getAllFonts());
}

function notifyFontListChanged() {
  if (typeof document === "undefined") {
    return;
  }
  document.dispatchEvent(new CustomEvent("content-engine:fonts-changed"));
}

function setAvailableFonts(fonts = [], { source = "org", resetTransient = true } = {}) {
  const normalized = fonts
    .map((font) => normalizeFontRecord(font, source))
    .filter(Boolean);
  availableFonts = normalized;
  if (resetTransient) {
    transientFontRegistry.clear();
  }
  refreshFontFaceRules();
  notifyFontListChanged();
}

function addTransientFonts(fonts = [], { source = "global" } = {}) {
  const normalized = fonts
    .map((font) => normalizeFontRecord(font, source, { transient: true }))
    .filter(Boolean)
    .filter((font) => !fontExists(font.name));

  if (normalized.length === 0) {
    return [];
  }

  normalized.forEach((font) => {
    const key = normalizeFontName(font.name);
    if (!key) {
      return;
    }
    transientFontRegistry.set(key, {
      font,
      slides: new Set(),
    });
  });

  refreshFontFaceRules();
  notifyFontListChanged();
  return normalized;
}

function buildPublicGlobalFontUrl(relPath = "") {
  const sanitizedPath = relPath.replace(/^\/+/, "");
  const base = PUBLIC_BASE_PATH.endsWith("/")
    ? PUBLIC_BASE_PATH.slice(0, -1)
    : PUBLIC_BASE_PATH;
  if (/^https?:\/\//i.test(sanitizedPath)) {
    return sanitizedPath;
  }
  const hasPrefix = sanitizedPath.startsWith("global_fonts/");
  const finalPath = hasPrefix ? sanitizedPath : `global_fonts/${sanitizedPath}`;
  return `${base}/${finalPath}`.replace(/\/+/g, "/");
}

async function fetchGlobalFontsManifest() {
  if (globalFontManifest) {
    return globalFontManifest;
  }
  if (globalFontManifestPromise) {
    return globalFontManifestPromise;
  }

  const manifestUrl = buildPublicGlobalFontUrl("fonts.json");
  globalFontManifestPromise = fetch(manifestUrl, { cache: "no-store" })
    .then(async (resp) => {
      if (!resp.ok) {
        console.warn(
          `Global fonts manifest not available (${resp.status}). URL: ${manifestUrl}`,
        );
        return [];
      }
      const data = await resp.json();
      return Array.isArray(data) ? data : [];
    })
    .catch((error) => {
      console.warn("Failed to fetch global font manifest:", error);
      return [];
    })
    .finally(() => {
      // placeholder; actual assignment happens after await below
    });

  const manifest = await globalFontManifestPromise;
  globalFontManifest = manifest;
  globalFontManifestPromise = null;
  return manifest;
}

function mapManifestEntryToFont(entry) {
  if (!entry || !entry.name) {
    return null;
  }
  const fileRef = entry.url || entry.font_url || entry.path || entry.file;
  if (!fileRef) {
    console.warn("Skipping global font without file reference", entry);
    return null;
  }
  const fontUrl = /^https?:\/\//i.test(fileRef)
    ? fileRef
    : buildPublicGlobalFontUrl(fileRef);
  return {
    name: entry.name,
    font_url: fontUrl,
    weight: entry.weight || "normal",
    style: entry.style || "normal",
  };
}

async function fetchGlobalFontsFromStatic() {
  const manifest = await fetchGlobalFontsManifest();
  if (!manifest || manifest.length === 0) {
    console.warn("Global font manifest is empty. No global fonts loaded.");
    return [];
  }
  return manifest
    .map(mapManifestEntryToFont)
    .filter(Boolean);
}

async function ensureGlobalFontsAvailable(fontNames = [], { transient = false } = {}) {
  if (!fontNames || fontNames.length === 0) {
    return [];
  }

  const manifest = await fetchGlobalFontsManifest();
  if (!manifest || manifest.length === 0) {
    return [];
  }

  const normalizedNames = fontNames
    .map((name) => name?.trim())
    .filter(Boolean)
    .map((name) => name.toLowerCase());
  if (normalizedNames.length === 0) {
    return [];
  }

  const matchedFonts = manifest
    .filter((entry) =>
      normalizedNames.includes(entry.name?.trim().toLowerCase()),
    )
    .map(mapManifestEntryToFont)
    .filter(Boolean);

  if (matchedFonts.length === 0) {
    return [];
  }

  return transient
    ? addTransientFonts(matchedFonts)
    : matchedFonts;
}

/**
 * Fetches custom fonts from the API and makes them available globally
 * @returns {Promise<Array>} Array of font objects
 */
export async function fetchAndInitializeFonts() {
  // Prevent duplicate calls - return existing promise if already in progress
  if (fontInitializationPromise) {
    return await fontInitializationPromise;
  }

  // In slideshow-player mode we can't assume a user token is available.
  // Allow using an apiKey (X-API-KEY) passed via query params or localStorage.
  // For regular editor mode, prefer the Authorization Bearer token.

  fontInitializationPromise = _doFetchAndInitializeFonts();
  const result = await fontInitializationPromise;
  fontInitializationPromise = null; // Reset for future calls
  return result;
}

async function _doFetchAndInitializeFonts() {
  try {
    const fonts = SPECIAL_SAVE_ENABLED
      ? await fetchGlobalFontsFromStatic()
      : await fetchOrgFontsFromApi();

    setAvailableFonts(fonts, {
      source: SPECIAL_SAVE_ENABLED ? "global" : "org",
      resetTransient: true,
    });

    return fonts;
  } catch (error) {
    console.error("Error fetching custom fonts:", error);
    showToast(gettext("Failed to load custom fonts."), "Error");
    setAvailableFonts([], { resetTransient: true });
    return [];
  }
}

async function fetchOrgFontsFromApi() {
  const headers = {};

  if (token && queryParams.mode !== "slideshow-player") {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (queryParams.mode === "slideshow-player") {
    const apiKey = queryParams.apiKey || localStorage.getItem("apiKey");
    if (apiKey) {
      headers["X-API-KEY"] = apiKey;
    } else {
      console.warn("No API key found for slideshow-player mode");
    }
  }

  let fontsUrl = `${BASE_URL}/api/fonts/?organisation_id=${parentOrgID}`;
  if (queryParams.mode === "slideshow-player") {
    const displayWebsiteId =
      queryParams.displayWebsiteId ||
      queryParams.display_website_id ||
      queryParams.id ||
      queryParams.dw_id;
    if (displayWebsiteId) {
      fontsUrl = `${BASE_URL}/api/fonts/?displayWebsiteId=${displayWebsiteId}`;
    } else {
      console.warn("No displayWebsiteId found for slideshow-player mode");
    }
  }

  const fonts = await genericFetch(fontsUrl, "GET", null, headers);

  if (!Array.isArray(fonts)) {
    console.warn("No custom fonts found or invalid response:", fonts);
    return [];
  }



  // Keep legacy behavior of FontFace API attempts disabled (see previous note)
  return fonts;
}

/**
 * Injects @font-face rules into a global stylesheet for fetched fonts
 * @param {Array} fonts - Array of font objects with name and font_url properties
 */
function injectFontFacesIntoStylesheet(fonts = getAllFonts()) {
  const fontsToInject = Array.isArray(fonts) ? fonts : [];

  if (!fontStyleSheet) {
    const styleEl = document.createElement("style");
    styleEl.id = "custom-fonts-stylesheet";
    document.head.appendChild(styleEl);
    fontStyleSheet = styleEl.sheet;
  }

  // Clear existing rules if any
  const existingRulesCount = fontStyleSheet.cssRules.length;
  while (fontStyleSheet.cssRules.length > 0) {
    fontStyleSheet.deleteRule(0);
  }
  if (existingRulesCount > 0) {
  }

  let successCount = 0;
  fontsToInject.forEach((font) => {
    if (font.name && font.font_url) {
      const rule = `
        @font-face {
          font-family: '${font.name}';
          font-style: ${font.style || "normal"};
          font-weight: ${font.weight || "normal"};
          font-display: swap;
          src: url('${font.font_url}');
        }
      `;
      try {
        fontStyleSheet.insertRule(rule, fontStyleSheet.cssRules.length);
        successCount++;
      } catch (e) {
        console.error(`Failed to insert @font-face rule for ${font.name}:`, e);
      }
    } else {
      console.warn(`Skipping font with missing name or URL:`, font);
    }
  });

}

/**
 * Load font files via fetch with custom headers (for protected fonts) and register
 * them using the FontFace API so requests can include X-API-KEY or other headers.
 * @param {Array} fonts
 * @param {Object} headers
 */
async function loadProtectedFontsViaFontFace(fonts = getAllFonts(), headers = {}) {
  if (!window.FontFace) {
    // FontFace API not supported; fall back to stylesheet injection
    injectFontFacesIntoStylesheet(fonts);
    return;
  }


  // Load all fonts in parallel for better performance
  const fontLoadPromises = fonts.map(async (font) => {
    if (!font.name || !font.font_url) {
      console.warn(`Skipping font with missing name or URL:`, font);
      return { success: false, font, error: "Missing name or URL" };
    }

    try {
      const resp = await fetch(font.font_url, { headers });
      if (!resp.ok) {
        const error = `HTTP ${resp.status}: ${resp.statusText}`;
        console.warn(`Failed to fetch font ${font.name}: ${error}`);
        return { success: false, font, error };
      }

      const arrayBuffer = await resp.arrayBuffer();

      // Construct FontFace from ArrayBuffer with more specific options
      const fontFace = new FontFace(font.name, arrayBuffer, {
        display: "swap", // Ensure font swaps when loaded
        weight: "normal", // Specify weight for variable fonts
        style: "normal",
      });

      await fontFace.load();

      document.fonts.add(fontFace);

      // Force font to be ready by checking it
      await document.fonts.load(`16px "${font.name}"`);

      // Double-check it's actually in document.fonts
      const isInDocumentFonts = Array.from(document.fonts.values()).some(
        (f) => f.family === font.name,
      );


      // Verify it was actually added
      const fontsInDocument = Array.from(document.fonts.values()).map(
        (f) => f.family,
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


  // Always also inject @font-face rules as additional fallback, especially in slideshow-player mode
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
 * Gets all available custom fonts fetched from the backend
 * @returns {Array} Array of custom font objects
 */
export function getAvailableFonts({ slide = null, slideKey = null } = {}) {
  if (SPECIAL_SAVE_ENABLED) {
    return getAllFonts();
  }

  const fonts = [...availableFonts];
  const resolvedSlideKey = slideKey || (slide ? getSlideKey(slide) : null);

  if (!resolvedSlideKey) {
    return fonts;
  }

  return fonts.concat(getTransientFontsForSlide(resolvedSlideKey));
}

/**
 * Gets default system fonts. Arial is exposed only when no custom fonts exist.
 * @returns {Array} Array of default system font names
 */
export function getDefaultFonts() {
  return getAllFonts().length === 0 ? ["Arial"] : [];
}

/**
 * Gets a default font (first custom font or fallback to Arial)
 * @returns {string} Default font name
 */
export function getDefaultFont() {
  const fonts = getAllFonts();
  if (fonts.length > 0) {
    return fonts[0].name;
  }

  const defaults = getDefaultFonts();
  return defaults.length > 0 ? defaults[0] : "Arial";
}

export function getFontDisplayLabel(font) {
  if (!font || !font.name) {
    return "";
  }
  if (font.isTransient && !SPECIAL_SAVE_ENABLED) {
    return `${font.name} (${gettext("Global template font")})`;
  }
  return font.name;
}

/**
 * Verifies that fonts are actually loaded and available for use
 * @param {Array} fonts - Array of font objects to verify
 */
async function verifyFontsLoaded(fonts) {

  // Wait a bit for fonts to be fully processed
  await new Promise((resolve) => setTimeout(resolve, 100));

  for (const font of fonts) {
    if (!font.name) continue;

    try {
      // Check if font is available using document.fonts.check()
      const isAvailable = document.fonts.check(`12px "${font.name}"`);

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
  }
}

/**
 * Actually verify fonts work by measuring text rendering
 * @returns {Promise<boolean>} - True if fonts render differently than fallback
 */
async function verifyFontsActuallyWork() {
  const fonts = getAllFonts();
  if (fonts.length === 0) return true;

  try {
    // Create a hidden canvas to test font rendering
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 200;
    canvas.height = 50;

    const testText = "Ag"; // Letters that look different in different fonts
    const fontSize = 20;

    for (const font of fonts) {
      if (!font.name) continue;

      // Measure text with custom font
      ctx.font = `${fontSize}px "${font.name}", Arial`;
      const customMetrics = ctx.measureText(testText);

      // Measure text with fallback font
      ctx.font = `${fontSize}px Arial`;
      const fallbackMetrics = ctx.measureText(testText);

      // If custom font is loading, measurements should be different
      const widthDiff = Math.abs(customMetrics.width - fallbackMetrics.width);

      // Lower threshold since SUSEMono shows 0.45px difference but works
      if (widthDiff > 0.4) {
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
  return getAllFonts().length > 0;
}

/**
 * Wait for fonts to be fully ready for use
 * @param {number} maxWaitMs - Maximum time to wait in milliseconds
 * @returns {Promise<boolean>} - True if fonts are ready, false if timeout
 */
export async function waitForFontsReady(maxWaitMs = 3000) {
  const fonts = getAllFonts();
  if (fonts.length === 0) {
    return true;
  }


  const startTime = Date.now();
  const checkInterval = 100; // Check every 100ms
  let lastCheckResults = [];

  while (Date.now() - startTime < maxWaitMs) {
    let allReady = true;
    const currentResults = [];

    for (const font of fonts) {
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
      lastCheckResults = currentResults;
    }

    if (allReady) {
      const waitTime = Date.now() - startTime;

      // Additional verification: try to render text with custom fonts
      const verification = await verifyFontsActuallyWork();
      if (verification) {
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
  return false;
}

export async function registerFontsFromSlides(slides = []) {
  if (
    !Array.isArray(slides) ||
    slides.length === 0 ||
    SPECIAL_SAVE_ENABLED
  ) {
    return;
  }

  const slideFontEntries = slides
    .map((slide, index) => ({
      slide,
      index,
      fonts: collectFontsFromSlide(slide),
    }))
    .filter((entry) => entry.fonts.size > 0);

  if (slideFontEntries.length === 0) {
    return;
  }

  const missingFonts = [];
  slideFontEntries.forEach(({ fonts }) => {
    fonts.forEach((fontName) => {
      if (!fontExists(fontName) && !missingFonts.includes(fontName)) {
        missingFonts.push(fontName);
      }
    });
  });

  if (missingFonts.length > 0) {
    await ensureGlobalFontsAvailable(missingFonts, { transient: true });
  }

  let associationsChanged = false;
  slideFontEntries.forEach(({ slide, index, fonts }) => {
    const slideKey = getSlideKey(slide, index);
    fonts.forEach((fontName) => {
      if (associateSlideWithTransientFont(fontName, slideKey)) {
        associationsChanged = true;
      }
    });
  });

  if (associationsChanged) {
    notifyFontListChanged();
  }
}

/**
 * Debug function to log current font status - useful for troubleshooting
 * Can be called from browser console: window.debugFonts()
 */
export function debugFonts() {
  console.group("Font Debug Information");

  const fonts = getAllFonts();

  if (document.fonts && document.fonts.values) {
    const loadedFonts = Array.from(document.fonts.values());
  }

  const customStylesheet = document.getElementById("custom-fonts-stylesheet");
  if (customStylesheet && customStylesheet.sheet) {
  }

  // Test font availability
  fonts.forEach((font) => {
    if (font.name) {
      try {
        const isAvailable = document.fonts.check(`12px "${font.name}"`);
      } catch (e) {
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
    const allFonts = getAllFonts();
    const testFonts = fontName ? [{ name: fontName }] : allFonts;


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


    // Check specific slide elements that should use custom fonts
    const slideElements = document.querySelectorAll(
      ".textbox .text-content, .table-element",
    );

    slideElements.forEach((el, index) => {
      const computed = window.getComputedStyle(el);
      const innerHTML = el.innerHTML
        ? el.innerHTML.substring(0, 50) + "..."
        : "No content";
    });

    // Check spans inside textboxes specifically
    const textboxSpans = document.querySelectorAll(
      ".textbox .text-content span[data-font-family]",
    );
    if (textboxSpans.length > 0) {
      textboxSpans.forEach((span, index) => {
        const computed = window.getComputedStyle(span);
      });
    }

    console.groupEnd();
  };

  // Add function to force-apply a custom font to test if it works
  window.forceApplyFont = function (fontName = null) {
    const allFonts = getAllFonts();
    const targetFont = fontName || (allFonts.length > 0 ? allFonts[0].name : null);
    if (!targetFont) {
      console.error("No font specified and no fonts available");
      return;
    }


    // Apply to textbox elements
    const textboxes = document.querySelectorAll(".textbox .text-content");
    textboxes.forEach((textbox, index) => {
      const originalFont = textbox.style.fontFamily;
      textbox.style.fontFamily = `"${targetFont}", Arial, sans-serif`;

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
    });

  };
}
