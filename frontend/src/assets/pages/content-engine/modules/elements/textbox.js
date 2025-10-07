// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
// ─────────────────────────────────────────────────────────────
// 1) IMPORTS
// ─────────────────────────────────────────────────────────────
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { loadSlide } from "../core/renderSlide.js";
import { selectElement } from "../core/elementSelector.js";
import { showToast, queryParams } from "../../../../utils/utils.js";
import { showColorPalette } from "../utils/colorUtils.js";
import { getNewZIndex } from "../utils/domUtils.js";
import {
  getAvailableFonts,
  getDefaultFonts,
  getDefaultFont,
} from "../utils/fontUtils.js";
import { GridUtils } from "../config/gridConfig.js";
import { gettext } from "../../../../utils/locales.js";
// ─────────────────────────────────────────────────────────────
// 2) DOM REFERENCES & GLOBAL VARIABLES
// ─────────────────────────────────────────────────────────────
const fontSizeSelect = document.querySelector(".font-size-select");
const fontFamilySelect = document.querySelector(".font-family-select");
const lineHeightSelect = document.querySelector(".line-height-select");
const letterSpacingSelect = document.querySelector(".letter-spacing-select");
const fontWeightSelect = document.querySelector(".font-weight-select");
const textColorPicker = document.querySelector(".text-color-picker");

const boldBtn = document.querySelector("#boldBtn");
const italicBtn = document.querySelector("#italicBtn");
const underlineBtn = document.querySelector("#underlineBtn");

const alignLeftBtn = document.querySelector("#alignTextLeftBtn");
const alignCenterBtn = document.querySelector("#alignTextCenterBtn");
const alignRightBtn = document.querySelector("#alignTextRightBtn");
const alignTopBtn = document.querySelector("#alignTextTopBtn");
const alignMiddleBtn = document.querySelector("#alignTextMiddleBtn");
const alignBottomBtn = document.querySelector("#alignTextBottomBtn");

const richTextModeRadio = document.querySelector("#richTextMode");
const simpleTextModeRadio = document.querySelector("#simpleTextMode");

const horizontalTextModeRadio = document.querySelector("#horizontalTextMode");
const verticalTextModeRadio = document.querySelector("#verticalTextMode");

// ─────────────────────────────────────────────────────────────
// 3) FONT SIZE MAPPING
// ─────────────────────────────────────────────────────────────
export const fontSizeMapping = {
  1: "1.02vw",
  2: "1.07vw",
  3: "1.13vw",
  4: "1.23vw",
  5: "1.33vw",
  6: "1.44vw",
  7: "1.54vw",
  8: "1.75vw",
  9: "1.96vw",
  10: "2.17vw",
  11: "2.38vw",
  12: "2.58vw",
  13: "2.79vw",
  14: "3.00vw",
  15: "3.21vw",
  16: "3.42vw",
  17: "3.63vw",
  18: "3.83vw",
  19: "4.04vw",
  20: "4.25vw",
  21: "4.67vw",
  22: "5.08vw",
  23: "5.50vw",
  24: "5.92vw",
  25: "6.33vw",
  26: "6.75vw",
  27: "7.17vw",
  28: "8.00vw",
  29: "8.83vw",
  30: "9.67vw",
  31: "10.50vw",
  32: "11.33vw",
  33: "12.17vw",
  34: "13.00vw",
  35: "13.83vw",
  36: "14.67vw",
  37: "15.50vw",
  38: "16.33vw",
  39: "17.17vw",
  40: "18.00vw",
  41: "18.83vw",
  42: "19.67vw",
  43: "20.50vw",
  44: "21.33vw",
  45: "22.17vw",
  46: "23.00vw",
  47: "23.83vw",
  48: "24.67vw",
  49: "25.50vw",
  50: "26.33vw",
  51: "27.17vw",
};

export const lineHeightMapping = {
  0.5: "0.5",
  0.6: "0.6",
  0.7: "0.7",
  0.8: "0.8",
  0.9: "0.9",
  1: "1",
  1.1: "1.1",
  1.2: "1.2",
  1.3: "1.3",
  1.4: "1.4",
  1.5: "1.5",
  1.6: "1.6",
  1.8: "1.8",
  2: "2",
  2.2: "2.2",
  2.5: "2.5",
  3: "3",
};

export const letterSpacingMapping = {
  "-0.1": "-0.1vw",
  "-0.05": "-0.05vw",
  "-0.02": "-0.02vw",
  normal: "normal",
  0.01: "0.01vw",
  0.02: "0.02vw",
  0.03: "0.03vw",
  0.04: "0.04vw",
  0.05: "0.05vw",
  0.06: "0.06vw",
  0.07: "0.07vw",
  0.08: "0.08vw",
  0.09: "0.09vw",
  0.1: "0.1vw",
  0.12: "0.12vw",
  0.15: "0.15vw",
  0.18: "0.18vw",
  0.2: "0.2vw",
  0.25: "0.25vw",
  0.3: "0.3vw",
  0.4: "0.4vw",
  0.5: "0.5vw",
  0.6: "0.6vw",
  0.7: "0.7vw",
  0.8: "0.8vw",
  0.9: "0.9vw",
  1: "1vw",
  1.2: "1.2vw",
  1.5: "1.5vw",
  1.8: "1.8vw",
  2: "2vw",
};

export const textDirectionMapping = {
  horizontal: "horizontal-tb",
  vertical: "vertical-rl",
};

export const fontWeightMapping = {
  normal: "normal",
  100: "100",
  200: "200",
  300: "300",
  400: "400",
  500: "500",
  600: "600",
  700: "700",
  800: "800",
  900: "900",
};

// ------------------------------------------------------------------
// Container-based font-size helpers
// ------------------------------------------------------------------

/**
 * Returns the closest slide/container width in pixels to base font-size calculations on.
 * Falls back to store.emulatedWidth when DOM lookup fails.
 */
function getContainerWidthForElement(el) {
  try {
    // Prefer the zoom-wrapper width if available
    const zoom = el?.closest?.(".zoom-wrapper");
    if (zoom && zoom.clientWidth) return zoom.clientWidth;

    // Otherwise look for the grid container or slide-element parent
    const grid = el?.closest?.(".grid-container");
    if (grid && grid.clientWidth) return grid.clientWidth;

    const slideEl = el?.closest?.(".preview-slide");
    if (slideEl && slideEl.clientWidth) return slideEl.clientWidth;
  } catch (err) {
    // ignore and fallback
  }

  // Final fallback to store.emulatedWidth
  return store?.emulatedWidth || window.innerWidth || 1000;
}

/**
 * Convert a font-size string value (e.g. "1.02vw" or "16px") to a css px value
 * based on the given containerWidth. If value is already px, return as-is.
 */
function fontSizeValueToPx(value, containerWidth) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (trimmed.endsWith("px")) return trimmed;
  if (trimmed.endsWith("vw")) {
    const num = parseFloat(trimmed.replace("vw", ""));
    if (Number.isNaN(num)) return "";
    // vw is percent of viewport width; here we use containerWidth instead
    const px = (num / 100) * containerWidth;
    return Math.round(px) + "px";
  }
  // If it's a plain number, assume px
  const parsed = parseFloat(trimmed);
  if (!Number.isNaN(parsed)) return Math.round(parsed) + "px";
  return trimmed; // unknown unit, return raw
}

/**
 * Given a font size key (the mapping key like "12"), return a px value
 * computed for the container that contains `referenceEl`.
 */
function fontSizeKeyToPx(sizeKey, referenceEl) {
  const raw = fontSizeMapping[sizeKey] || fontSizeMapping["12"];
  const width = getContainerWidthForElement(referenceEl || document.body);
  return fontSizeValueToPx(raw, width);
}

// ─────────────────────────────────────────────────────────────
// 4) SMALL HELPER UTILITIES
// ─────────────────────────────────────────────────────────────

let savedRange = null; // For temporarily storing selections (e.g. color changes)

/**
 * Auto-resizes the textbox's container based on scrollHeight.
 */
export function autoResizeTextbox(textEl, containerEl, dataObj) {
  const cellHeight = GridUtils.getCellHeight(store.emulatedHeight);
  const requiredRows = Math.ceil(textEl.scrollHeight / cellHeight);
  if (requiredRows > dataObj.gridHeight) {
    dataObj.gridHeight = requiredRows;
    containerEl.style.gridRowEnd = `span ${requiredRows}`;
  }
}

/**
 * Checks if a textbox element is currently selected; if yes, runs the callback.
 */
function withSelectedTextbox(callback) {
  if (
    !store.selectedElement ||
    !store.selectedElement.classList.contains("textbox")
  ) {
    console.warn("No textbox selected.");
    return;
  }
  callback();
}

/**
 * Save the current text selection to a Range (for color changes, etc.)
 */
function saveSelection() {
  const sel = window.getSelection();
  return sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
}

/**
 * Restore a previously saved Range (for color changes, etc.)
 */
function restoreSelection(range) {
  if (range) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/**
 * Strip all formatting from HTML except <br> and <div> tags to preserve line breaks.
 * Divs are preserved but stripped of styling since contentEditable creates them for paragraphs.
 */
function stripFormattingToPlainText(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;

  // Process nodes while preserving <br> and clean <div> tags
  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();

      if (tagName === "br") {
        // Keep <br> tags as-is
        return "<br>";
      } else if (tagName === "div") {
        // Keep <div> tags but strip all attributes/styling
        let result = "<div>";
        for (const child of node.childNodes) {
          result += processNode(child);
        }
        result += "</div>";
        return result;
      } else {
        // For all other elements, just process their children (strip the tags but keep content)
        let result = "";
        for (const child of node.childNodes) {
          result += processNode(child);
        }
        return result;
      }
    }
    return "";
  }

  return processNode(temp);
}

/**
 * Apply uniform styling to a simple text mode textbox.
 */
function applySimpleModeStyles(textElement, elData) {
  const fontSize = fontSizeKeyToPx(elData.fontSize || "12", textElement);
  const fontFamily = elData.fontFamily || getDefaultFont();
  const lineHeight = lineHeightMapping[elData.lineHeight] || "1.2";
  const letterSpacing = letterSpacingMapping[elData.letterSpacing] || "normal";
  const textColor = elData.textColor || "#000000";
  const fontWeight = elData.fontWeight || "normal";
  const fontStyle = elData.fontStyle || "normal";
  const textDecoration = elData.textDecoration || "none";
  const textAlign = elData.textAlign || "left";
  const textDirection =
    textDirectionMapping[elData.textDirection] || "horizontal-tb";

  textElement.style.fontSize = fontSize;
  textElement.style.fontFamily = `"${fontFamily}"`;
  textElement.style.lineHeight = lineHeight;
  textElement.style.letterSpacing = letterSpacing;
  textElement.style.color = textColor;
  textElement.style.fontWeight = fontWeight;
  textElement.style.fontStyle = fontStyle;
  textElement.style.textDecoration = textDecoration;
  textElement.style.textAlign = textAlign;
  textElement.style.writingMode = textDirection;
}

/**
 * Map a horizontal textAlign value to a sensible textAlign when in vertical mode.
 * For example, "left" in horizontal corresponds to "start" in vertical writing mode.
 */
function mapTextAlignForDirection(textAlign, direction) {
  if (direction === "vertical") {
    // Use CSS logical values to remain consistent across directions
    if (textAlign === "left") return "start";
    if (textAlign === "right") return "end";
    return "center"; // center remains center
  }
  // Default: return as-is for horizontal
  return textAlign;
}

/**
 * Update the mode radio buttons based on the selected element's state.
 */
export function updateModeRadioButtons() {
  if (!store.selectedElementData) return;

  const isSimpleMode = store.selectedElementData.isSimpleTextMode || false;
  const textDirection = store.selectedElementData.textDirection || "horizontal";

  if (isSimpleMode) {
    simpleTextModeRadio.checked = true;
    richTextModeRadio.checked = false;
  } else {
    richTextModeRadio.checked = true;
    simpleTextModeRadio.checked = false;
  }

  if (textDirection === "vertical") {
    verticalTextModeRadio.checked = true;
    horizontalTextModeRadio.checked = false;
  } else {
    horizontalTextModeRadio.checked = true;
    verticalTextModeRadio.checked = false;
  }

  // Update font weight dropdown state based on mode
  updateFontWeightDropdownState();
}

/**
 * Update the toolbar dropdowns based on the selected textbox's properties.
 * This function reads the fontSize, fontFamily, lineHeight, letterSpacing, and textDirection from the
 * selected element's data and updates the toolbar selects accordingly.
 */
export function updateToolbarDropdowns() {
  if (!store.selectedElementData) return;

  // Update font size dropdown
  if (store.selectedElementData.fontSize) {
    fontSizeSelect.value = store.selectedElementData.fontSize;
  }

  // Update font family dropdown
  if (store.selectedElementData.fontFamily) {
    fontFamilySelect.value = store.selectedElementData.fontFamily;
  }

  // Update line height dropdown
  if (store.selectedElementData.lineHeight) {
    lineHeightSelect.value = store.selectedElementData.lineHeight;
  }

  // Update letter spacing dropdown
  if (store.selectedElementData.letterSpacing) {
    letterSpacingSelect.value = store.selectedElementData.letterSpacing;
  }

  // Update font weight dropdown
  if (store.selectedElementData.fontWeight) {
    fontWeightSelect.value = store.selectedElementData.fontWeight;
  }

  // Update text direction radio buttons
  const textDirection = store.selectedElementData.textDirection || "horizontal";
  if (textDirection === "vertical") {
    verticalTextModeRadio.checked = true;
    horizontalTextModeRadio.checked = false;
  } else {
    horizontalTextModeRadio.checked = true;
    verticalTextModeRadio.checked = false;
  }

  // Update font weight dropdown state based on mode
  updateFontWeightDropdownState();
}

// ─────────────────────────────────────────────────────────────
// 5) APPLY TEXT STYLES (FONT SIZE, FAMILY, BOLD, ETC.)
// ─────────────────────────────────────────────────────────────

// Recursively process a node to preserve only allowed formatting,
// and to recreate <span> elements that have a fontFamily style.

// Helper function to flatten an entire DocumentFragment.

/**
 * Normalizes the DOM within a contenteditable element to prevent line-height issues
 * from deeply nested <span> tags. It "unwraps" parent spans that are made redundant
 * by a single child span that also defines font-size, effectively "flattening"
 * the structure on a line-by-line basis.
 * @param {HTMLElement} textContentElement The .text-content element.
 */
function normalizeNestedSpans(textContentElement) {
  if (!textContentElement) return;

  // Process each line (which are <div> elements) separately.
  const lines = textContentElement.querySelectorAll("div");

  lines.forEach((line) => {
    let hasChanged = true;
    // Keep looping as long as we're making changes to handle multiple levels of nesting.
    while (hasChanged) {
      hasChanged = false;
      // Find all spans that have a font-size style, as they are the source of the issue.
      const spans = line.querySelectorAll('span[style*="font-size"]');

      for (const parentSpan of spans) {
        // Filter out empty/whitespace-only text nodes to get meaningful children.
        const meaningfulChildNodes = Array.from(parentSpan.childNodes).filter(
          (n) => {
            return !(n.nodeType === Node.TEXT_NODE && !n.textContent.trim());
          },
        );

        // RULE: If a span has ONLY ONE meaningful child node, and that child is
        // ALSO a span with its own font-size, the parent is redundant and is
        // likely a leftover from a previous line causing the line-height problem.
        if (
          meaningfulChildNodes.length === 1 &&
          meaningfulChildNodes[0].nodeType === Node.ELEMENT_NODE &&
          meaningfulChildNodes[0].tagName === "SPAN" &&
          meaningfulChildNodes[0].style.fontSize
        ) {
          const childSpan = meaningfulChildNodes[0];

          // Before unwrapping, merge styles. The child's styles take precedence.
          // If the parent has a style (e.g., color) that the child lacks, transfer it.
          if (parentSpan.style.color && !childSpan.style.color) {
            childSpan.style.color = parentSpan.style.color;
          }
          if (parentSpan.style.fontFamily && !childSpan.style.fontFamily) {
            childSpan.style.fontFamily = parentSpan.style.fontFamily;
          }
          if (parentSpan.style.lineHeight && !childSpan.style.lineHeight) {
            childSpan.style.lineHeight = parentSpan.style.lineHeight;
          }
          // Note: Other styles like background-color, etc., could also be merged if needed.

          // Replace the parent with the child in the DOM.
          if (parentSpan.parentNode) {
            parentSpan.parentNode.replaceChild(childSpan, parentSpan);
          }

          hasChanged = true; // Mark that we've changed the DOM.

          // Break from the for-loop to restart the while-loop with a fresh DOM query.
          // This is crucial because the structure has been modified.
          break;
        }
      }
    }
  });
}

function applyCustomFontSize(sizeKey) {
  // Ensure key exists in mapping
  if (!fontSizeMapping[sizeKey]) return;

  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);

    // 1) Extract the selection (preserves the DOM structure)
    const extractedContent = range.extractContents();

    // 2) Flatten it so that only allowed formatting remains,
    //    preserving text color, font family, and text alignment but dropping inline font-size.
    const cleanContent = flattenFragmentForSize(extractedContent);

  // 3) Create a new wrapper that applies the uniform font size.
  const wrapperSpan = document.createElement("span");
  // Compute px based on the selection container (closest text-content)
  const referenceEl = range.startContainer?.parentElement || document.body;
  wrapperSpan.style.fontSize = fontSizeKeyToPx(sizeKey, referenceEl);
    wrapperSpan.style.lineHeight = "1.2"; // Set consistent line height to prevent inheritance issues
    wrapperSpan.setAttribute("data-font-size-key", sizeKey);

    // 4) Append the cleaned content to the wrapper.
    wrapperSpan.appendChild(cleanContent);

    // 5) Insert back into the document.
    range.insertNode(wrapperSpan);

    // 6) (Optional) Reselect the newly inserted content.
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapperSpan);
    sel.addRange(newRange);

    // 7) Update data model if required.
    if (store && store.selectedElementData) {
      store.selectedElementData.fontSize = sizeKey;
    }
  }
}

/**
 * Wrap selected text in a <span> with data-font-family.
 */
// Recursively process a node for the font family case.
// It preserves allowed formatting tags (<b>, <i>, <u>, <strong>)
// and recreates <span> elements that have a fontSize (dropping any fontFamily styling),
// while other wrappers are flattened (their children are lifted).

/* --------------------------------- */
/* 1. flattenNodeForSize – keep color, font family, **and alignment**  */
/* --------------------------------- */
/* shared helpers --------------------------------------------- */
const ALIGN_WHITELIST = ["left", "center", "right"];

/** Return valid align attr ("" if none/invalid). */
function getAlignAttr(node) {
  const raw = node?.getAttribute?.("align") || "";
  const val = raw.toLowerCase();
  return ALIGN_WHITELIST.includes(val) ? val : "";
}

/** Create a block-span wrapper that *keeps* the align attribute. */
function makeAlignedWrapper(align) {
  const span = document.createElement("span");
  span.style.display = "block"; // behaves like the div we flattened
  span.setAttribute("align", align);
  return span;
}

/* ------------------------------------------------------------- */
/* 1. flattenNodeForSize – keep colour, fontFamily, **alignment** */
/*    (font **size** intentionally dropped)                      */
/* ------------------------------------------------------------- */
function flattenNodeForSize(node) {
  const allowedTags = ["B", "I", "U", "STRONG"];

  /* TEXT ------------------------------------------------------ */
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent);
  }

  /* ELEMENT --------------------------------------------------- */
  if (node.nodeType === Node.ELEMENT_NODE) {
    const align = getAlignAttr(node);

    /* allowed inline formatting tags -------------------------- */
    if (allowedTags.includes(node.tagName)) {
      const clone = document.createElement(node.tagName);
      if (align) clone.setAttribute("align", align);
      node.childNodes.forEach((c) => clone.appendChild(flattenNodeForSize(c)));
      return clone;
    }

    /* <span> – keep colour / family / align (drop size) -------- */
    if (node.tagName === "SPAN") {
      const span = document.createElement("span");
      if (node.style.color) span.style.color = node.style.color;
      if (node.style.fontFamily) {
        span.style.fontFamily = node.style.fontFamily;
        span.style.lineHeight = "1.2"; // Ensure consistent line height when preserving font family
      }
      if (align) span.setAttribute("align", align);

      span.removeAttribute("data-font-size-key");

      node.childNodes.forEach((c) => span.appendChild(flattenNodeForSize(c)));
      return span;
    }

    /* any other element with align – wrap children ------------- */
    if (align) {
      const wrapper = makeAlignedWrapper(align);
      node.childNodes.forEach((c) =>
        wrapper.appendChild(flattenNodeForSize(c)),
      );
      return wrapper;
    }

    /* plain lift ---------------------------------------------- */
    const frag = document.createDocumentFragment();
    node.childNodes.forEach((c) => frag.appendChild(flattenNodeForSize(c)));
    return frag;
  }

  /* fallback -------------------------------------------------- */
  return document.createDocumentFragment();
}

/* ------------------------------------------------------------- */
/* 2. flattenNodeForFamily – keep fontSize, colour, **alignment** */
/* ------------------------------------------------------------- */
function flattenNodeForFamily(node) {
  const allowedTags = ["B", "I", "U", "STRONG"];

  /* TEXT ------------------------------------------------------ */
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent);
  }

  /* ELEMENT --------------------------------------------------- */
  if (node.nodeType === Node.ELEMENT_NODE) {
    const align = getAlignAttr(node);

    /* allowed inline formatting tags -------------------------- */
    if (allowedTags.includes(node.tagName)) {
      const el = document.createElement(node.tagName);
      if (align) el.setAttribute("align", align);
      Array.from(node.childNodes).forEach((child) =>
        el.appendChild(flattenNodeForFamily(child)),
      );
      return el;
    }

    /* <span> carrying styles we care about --------------------- */
    if (
      node.tagName === "SPAN" &&
      (node.style.fontSize || node.style.color || align)
    ) {
      const span = document.createElement("span");
      if (node.style.fontSize) {
        span.style.fontSize = node.style.fontSize;
        span.style.lineHeight = "1.2"; // Set consistent line height with font size
      }
      if (node.style.color) span.style.color = node.style.color;
      if (align) span.setAttribute("align", align);

      Array.from(node.childNodes).forEach((child) =>
        span.appendChild(flattenNodeForFamily(child)),
      );
      return span;
    }

    /* any other element with align – wrap children ------------- */
    if (align) {
      const wrapper = makeAlignedWrapper(align);
      Array.from(node.childNodes).forEach((child) =>
        wrapper.appendChild(flattenNodeForFamily(child)),
      );
      return wrapper;
    }

    /* plain lift ---------------------------------------------- */
    const frag = document.createDocumentFragment();
    Array.from(node.childNodes).forEach((child) =>
      frag.appendChild(flattenNodeForFamily(child)),
    );
    return frag;
  }

  /* fallback -------------------------------------------------- */
  return document.createDocumentFragment();
}

function flattenFragmentForSize(fragment) {
  const newFragment = document.createDocumentFragment();
  Array.from(fragment.childNodes).forEach((child) => {
    newFragment.appendChild(flattenNodeForSize(child));
  });
  return newFragment;
}

// Helper to flatten an entire DocumentFragment.
function flattenFragmentForFamily(fragment) {
  const newFragment = document.createDocumentFragment();
  Array.from(fragment.childNodes).forEach((child) => {
    newFragment.appendChild(flattenNodeForFamily(child));
  });
  return newFragment;
}

function applyCustomFontFamily(family) {
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);

    // 1) Extract the selection's contents.
    const extractedContent = range.extractContents();

    // 2) Flatten the fragment so that allowed formatting is preserved along with
    //    font size, text color, and text alignment, while dropping inline fontFamily.
    const cleanContent = flattenFragmentForFamily(extractedContent);

    // 3) Create a new wrapper that applies the custom font family.
  const wrapperSpan = document.createElement("span");
  // Use the font name directly as the font-family value
  wrapperSpan.style.fontFamily = `"${family}"`; // Ensure font names with spaces are quoted
  wrapperSpan.style.lineHeight = "1.2"; // Set consistent line height to prevent inheritance issues
  wrapperSpan.setAttribute("data-font-family", family);
  // If the fragment contains spans with data-font-size-key, convert their fontSize values
  // to px relative to the current container so pasted/wrapped text remains sized correctly.

    // 4) Append the cleaned content into the wrapper.
    // Convert any data-font-size-key placeholders inside the cleanContent
    const referenceEl = range.startContainer?.parentElement || document.body;
    const spans = Array.from(cleanContent.querySelectorAll
      ? cleanContent.querySelectorAll("span[data-font-size-key]")
      : []);
    spans.forEach((s) => {
      const key = s.getAttribute("data-font-size-key");
      if (key) s.style.fontSize = fontSizeKeyToPx(key, referenceEl);
    });

    wrapperSpan.appendChild(cleanContent);

    // 5) Insert the new node back into the document.
    range.insertNode(wrapperSpan);

    // 6) (Optional) Reselect the content.
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapperSpan);
    sel.addRange(newRange);

    // 7) Update the data model if needed.
    if (store && store.selectedElementData) {
      store.selectedElementData.fontFamily = family;
    }
  }
}

/**
 * Generic helper to apply text formatting commands (bold, italic, underline)
 */
function applyTextCommand(command) {
  withSelectedTextbox(() => {
    const textContentElement =
      store.selectedElement.querySelector(".text-content");
    if (textContentElement) {
      textContentElement.contentEditable = "true";
      textContentElement.focus();
      document.execCommand(command, false, null);
    }
  });
}

/**
 * Utility function to fix line height issues in existing textbox content
 * by adding line-height: 1.2 to spans with font-size or font-family
 */
function fixLineHeightInTextbox(textElement) {
  if (!textElement) return;

  // Find all spans with font-size or font-family styles
  const spansWithStyles = textElement.querySelectorAll(
    'span[style*="font-size"], span[style*="font-family"]',
  );

  spansWithStyles.forEach((span) => {
    // Only add line-height if it doesn't already exist
    if (!span.style.lineHeight) {
      span.style.lineHeight = "1.2";
    }
  });
}

/**
 * Global utility function to fix line height issues in all textboxes on the current slide
 * This can be called after loading a slide to ensure all existing textboxes have proper line heights
 */
export function fixAllTextboxLineHeights() {
  const allTextboxes = document.querySelectorAll(".textbox .text-content");
  allTextboxes.forEach((textbox) => {
    fixLineHeightInTextbox(textbox);
  });
}

// ─────────────────────────────────────────────────────────────
// 6) INDICATOR FUNCTIONS (UPDATING DROPDOWNS ON CARET/SELECTION)
// ─────────────────────────────────────────────────────────────

/**
 * Climbs up from the caret/selection to find data-font-size-key and updates
 * the .font-size-select dropdown accordingly.
 */
function handleFontSizeIndicator() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  const contentEl = store.selectedElement?.querySelector?.(".text-content");
  if (!contentEl) return;

  // Only proceed if the selection is within the current textbox content
  const anchor = range.commonAncestorContainer || range.startContainer;
  if (!contentEl.contains(anchor)) return;

  let node = range.startContainer;

  // If it's a text node, climb to its parent
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode;
  }

  // Climb up until we find data-font-size-key or hit .text-content
  while (
    node &&
    node !== contentEl &&
    !node.classList?.contains("text-content")
  ) {
    // Guard against non-element nodes
    const sizeKey = node?.getAttribute?.("data-font-size-key");
    if (sizeKey) {
      fontSizeSelect.value = sizeKey;
      return;
    }
    node = node.parentNode;
  }

  // If none found, you could reset:
  // fontSizeSelect.value = "";
}

/**
 * Climbs up from the caret/selection to find data-font-family and updates
 * the .font-family-select dropdown accordingly.
 */
function handleFontFamilyIndicator() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  const contentEl = store.selectedElement?.querySelector?.(".text-content");
  if (!contentEl) return;

  // Only proceed if the selection is within the current textbox content
  const anchor = range.commonAncestorContainer || range.startContainer;
  if (!contentEl.contains(anchor)) return;

  let node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode;
  }

  while (
    node &&
    node !== contentEl &&
    !node.classList?.contains("text-content")
  ) {
    const family = node?.getAttribute?.("data-font-family");
    if (family) {
      fontFamilySelect.value = family;
      return;
    }
    node = node.parentNode;
  }

  // If none found, you could reset:
  // fontFamilySelect.value = "";
}

/**
 * Climbs up from the caret/selection to find data-line-height and updates
 * the .line-height-select dropdown accordingly.
 */
function handleLineHeightIndicator() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  const contentEl = store.selectedElement?.querySelector?.(".text-content");
  if (!contentEl) return;

  // Only proceed if the selection is within the current textbox content
  const anchor = range.commonAncestorContainer || range.startContainer;
  if (!contentEl.contains(anchor)) return;

  let node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode;
  }

  while (
    node &&
    node !== contentEl &&
    !node.classList?.contains("text-content")
  ) {
    const lineHeight = node?.getAttribute?.("data-line-height");
    if (lineHeight) {
      lineHeightSelect.value = lineHeight;
      return;
    }
    node = node.parentNode;
  }

  // If none found, you could reset:
  // lineHeightSelect.value = "";
}

/**
 * Climbs up from the caret/selection to find data-letter-spacing and updates
 * the .letter-spacing-select dropdown accordingly.
 */
function handleLetterSpacingIndicator() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  const contentEl = store.selectedElement?.querySelector?.(".text-content");
  if (!contentEl) return;

  // Only proceed if the selection is within the current textbox content
  const anchor = range.commonAncestorContainer || range.startContainer;
  if (!contentEl.contains(anchor)) return;

  let node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode;
  }

  while (
    node &&
    node !== contentEl &&
    !node.classList?.contains("text-content")
  ) {
    const letterSpacing = node?.getAttribute?.("data-letter-spacing");
    if (letterSpacing) {
      letterSpacingSelect.value = letterSpacing;
      return;
    }
    node = node.parentNode;
  }

  // If none found, you could reset:
  // letterSpacingSelect.value = "";
}

// ─────────────────────────────────────────────────────────────
// 7) INDIVIDUAL EVENT HANDLER FUNCTIONS
// ─────────────────────────────────────────────────────────────

function handleFontSizeChange(e) {
  e.preventDefault();
  withSelectedTextbox(() => {
    const target = store.selectedElement.querySelector(".text-content");
    if (target) {
      const isSimpleMode = store.selectedElementData.isSimpleTextMode || false;

      if (isSimpleMode) {
        // In simple mode, apply font size to the entire container
        store.selectedElementData.fontSize = fontSizeSelect.value;
        applySimpleModeStyles(target, store.selectedElementData);
      } else {
        // In rich text mode, apply to selection
        target.contentEditable = "true";
        target.focus();
        applyCustomFontSize(fontSizeSelect.value);
        store.selectedElementData.fontSize = fontSizeSelect.value;
        normalizeNestedSpans(target);
      }
    }
  });
}

function handleFontFamilyChange(e) {
  e.preventDefault();
  withSelectedTextbox(() => {
    const target = store.selectedElement.querySelector(".text-content");
    if (target) {
      const isSimpleMode = store.selectedElementData.isSimpleTextMode || false;

      if (isSimpleMode) {
        // In simple mode, apply font family to the entire container
        store.selectedElementData.fontFamily = fontFamilySelect.value;
        applySimpleModeStyles(target, store.selectedElementData);
      } else {
        // In rich text mode, apply to selection
        target.contentEditable = "true";
        target.focus();
        applyCustomFontFamily(fontFamilySelect.value);
        store.selectedElementData.fontFamily = fontFamilySelect.value;
        normalizeNestedSpans(target);
      }
    }
  });
}

function handleLineHeightChange(e) {
  e.preventDefault();
  pushCurrentSlideState();
  withSelectedTextbox(() => {
    const key = lineHeightSelect.value;
    const id = parseInt(store.selectedElement.id.replace("el-", ""), 10);
    const elData = store.slides[store.currentSlideIndex].elements.find(
      (el) => el.id === id,
    );
    if (elData) elData.lineHeight = key;
    const content = store.selectedElement.querySelector(".text-content");
    if (content) {
      const isSimpleMode = elData.isSimpleTextMode || false;

      if (isSimpleMode) {
        // In simple mode, apply line height to the container
        applySimpleModeStyles(content, elData);
      } else {
        // In rich text mode, apply to container and all inner spans
        content.style.lineHeight = lineHeightMapping[key];
        content.querySelectorAll("span").forEach((span) => {
          span.style.lineHeight = lineHeightMapping[key];
        });
      }
    }
  });
}

function handleLetterSpacingChange(e) {
  e.preventDefault();
  pushCurrentSlideState();
  withSelectedTextbox(() => {
    const key = letterSpacingSelect.value;
    const id = parseInt(store.selectedElement.id.replace("el-", ""), 10);
    const elData = store.slides[store.currentSlideIndex].elements.find(
      (el) => el.id === id,
    );
    if (elData) elData.letterSpacing = key;
    const content = store.selectedElement.querySelector(".text-content");
    if (content) {
      const isSimpleMode = elData.isSimpleTextMode || false;

      if (isSimpleMode) {
        // In simple mode, apply letter spacing to the container
        applySimpleModeStyles(content, elData);
      } else {
        // In rich text mode, apply to container and all inner spans
        content.style.letterSpacing = letterSpacingMapping[key];
        content.querySelectorAll("span").forEach((span) => {
          span.style.letterSpacing = letterSpacingMapping[key];
        });
      }
    }
  });
}

function handleFontWeightChange(e) {
  e.preventDefault();
  pushCurrentSlideState();
  withSelectedTextbox(() => {
    const newFontWeight = e.target.value;
    const id = parseInt(store.selectedElement.id.replace("el-", ""), 10);
    const elData = store.slides[store.currentSlideIndex].elements.find(
      (el) => el.id === id,
    );
    
    // Only apply font weight changes in Simple Text mode
    const isSimpleMode = elData?.isSimpleTextMode || false;
    if (!isSimpleMode) {
      console.warn("Font weight can only be changed in Simple Text mode.");
      return;
    }

    if (elData) elData.fontWeight = newFontWeight;
    const content = store.selectedElement.querySelector(".text-content");
    if (content) {
      // In simple mode, apply font weight to the container
      applySimpleModeStyles(content, elData);
    }
  });
}

function handleTextDirectionChange(e) {
  e.preventDefault();
  pushCurrentSlideState();
  withSelectedTextbox(() => {
    const direction = e.target.value;
    const id = parseInt(store.selectedElement.id.replace("el-", ""), 10);
    const elData = store.slides[store.currentSlideIndex].elements.find(
      (el) => el.id === id,
    );
    if (elData) elData.textDirection = direction;
    const content = store.selectedElement.querySelector(".text-content");
    if (content) {
      const writingMode = textDirectionMapping[direction];
      content.style.writingMode = writingMode;

      // Also apply to the container element for better display
      const container = store.selectedElement;
      if (container) {
        container.style.writingMode = writingMode;

        // Adjust text alignment for vertical text
        if (direction === "vertical") {
          // Map stored horizontal alignment into an appropriate vertical-mode value
          const rawAlign = elData.textAlign || "left";
          content.style.textAlign = mapTextAlignForDirection(
            rawAlign,
            "vertical",
          );
        } else {
          // Restore original text alignment from element data for horizontal mode
          const textAlign = elData.textAlign || "left";
          content.style.textAlign = textAlign;
        }
      }
    }
  });
}

function handleTextColorPickerClick() {
  withSelectedTextbox(() => {
    const isSimpleMode = store.selectedElementData.isSimpleTextMode || false;

    if (isSimpleMode) {
      // In simple mode, apply color to entire textbox
      showColorPalette(
        textColorPicker,
        (chosenColor) => {
          const target = store.selectedElement.querySelector(".text-content");
          if (target && chosenColor) {
            store.selectedElementData.textColor = chosenColor;
            applySimpleModeStyles(target, store.selectedElementData);
          }
        },
        { allowRemove: false },
      );
    } else {
      // In rich text mode, apply to selection
      savedRange = saveSelection();
      showColorPalette(
        textColorPicker,
        (chosenColor) => {
          restoreSelection(savedRange);
          const target = store.selectedElement.querySelector(".text-content");
          if (target) {
            target.contentEditable = "true";
            target.focus();
            document.execCommand("styleWithCSS", false, true);
            if (chosenColor) {
              document.execCommand("foreColor", false, chosenColor);
            }
          }
        },
        { allowRemove: false },
      );
    }
  });
}

function handleBoldClick() {
  withSelectedTextbox(() => {
    const isSimpleMode = store.selectedElementData.isSimpleTextMode || false;

    if (isSimpleMode) {
      // In simple mode, toggle bold for entire textbox
      const target = store.selectedElement.querySelector(".text-content");
      if (target) {
        const currentWeight = target.style.fontWeight;
        target.style.fontWeight = currentWeight === "bold" ? "normal" : "bold";
        store.selectedElementData.fontWeight = target.style.fontWeight;
      }
    } else {
      // In rich text mode, apply to selection
      applyTextCommand("bold");
    }
  });
}

function handleItalicClick() {
  withSelectedTextbox(() => {
    const isSimpleMode = store.selectedElementData.isSimpleTextMode || false;

    if (isSimpleMode) {
      // In simple mode, toggle italic for entire textbox
      const target = store.selectedElement.querySelector(".text-content");
      if (target) {
        const currentStyle = target.style.fontStyle;
        target.style.fontStyle =
          currentStyle === "italic" ? "normal" : "italic";
        store.selectedElementData.fontStyle = target.style.fontStyle;
      }
    } else {
      // In rich text mode, apply to selection
      applyTextCommand("italic");
    }
  });
}

function handleUnderlineClick() {
  withSelectedTextbox(() => {
    const isSimpleMode = store.selectedElementData.isSimpleTextMode || false;

    if (isSimpleMode) {
      // In simple mode, toggle underline for entire textbox
      const target = store.selectedElement.querySelector(".text-content");
      if (target) {
        const currentDecoration = target.style.textDecoration;
        target.style.textDecoration =
          currentDecoration === "underline" ? "none" : "underline";
        store.selectedElementData.textDecoration = target.style.textDecoration;
      }
    } else {
      // In rich text mode, apply to selection
      applyTextCommand("underline");
    }
  });
}

function handleAlignLeft() {
  pushCurrentSlideState();
  withSelectedTextbox(() => {
    const textEl = store.selectedElement.querySelector(".text-content");
    if (textEl) {
      const isSimpleMode = store.selectedElementData.isSimpleTextMode || false;

      if (isSimpleMode) {
        // In simple mode, update data model and apply style directly
        store.selectedElementData.textAlign = "left";
        textEl.style.textAlign = "left";
      } else {
        // In rich mode, use execCommand
        textEl.contentEditable = "true";
        textEl.focus();
        document.execCommand("justifyLeft", false, null);
        // Persist the logical text alignment so it survives reloads
        if (store && store.selectedElementData) {
          store.selectedElementData.textAlign = "left";
        }
      }
    }
  });
}

function handleAlignCenter() {
  pushCurrentSlideState();
  withSelectedTextbox(() => {
    const textEl = store.selectedElement.querySelector(".text-content");
    if (textEl) {
      const isSimpleMode = store.selectedElementData.isSimpleTextMode || false;

      if (isSimpleMode) {
        // In simple mode, update data model and apply style directly
        store.selectedElementData.textAlign = "center";
        textEl.style.textAlign = "center";
      } else {
        // In rich mode, use execCommand
        textEl.contentEditable = "true";
        textEl.focus();
        document.execCommand("justifyCenter", false, null);
        if (store && store.selectedElementData) {
          store.selectedElementData.textAlign = "center";
        }
      }
    }
  });
}

function handleAlignRight() {
  pushCurrentSlideState();
  withSelectedTextbox(() => {
    const textEl = store.selectedElement.querySelector(".text-content");
    if (textEl) {
      const isSimpleMode = store.selectedElementData.isSimpleTextMode || false;

      if (isSimpleMode) {
        // In simple mode, update data model and apply style directly
        store.selectedElementData.textAlign = "right";
        textEl.style.textAlign = "right";
      } else {
        // In rich mode, use execCommand
        textEl.contentEditable = "true";
        textEl.focus();
        document.execCommand("justifyRight", false, null);
        if (store && store.selectedElementData) {
          store.selectedElementData.textAlign = "right";
        }
      }
    }
  });
}

function handleAlignTop() {
  updateVerticalAlignment("top");
}

function handleAlignMiddle() {
  updateVerticalAlignment("middle");
}

function handleAlignBottom() {
  updateVerticalAlignment("bottom");
}

// Update vertical alignment style for the selected textbox.
function updateVerticalAlignment(alignment) {
  pushCurrentSlideState();
  withSelectedTextbox(() => {
    const textEl = store.selectedElement.querySelector(".text-content");
    if (textEl) {
      textEl.style.display = "flex";
      textEl.style.flexDirection = "column";
      if (alignment === "top") {
        textEl.style.justifyContent = "flex-start";
        store.selectedElementData.verticalAlign = "flex-start";
      } else if (alignment === "middle") {
        textEl.style.justifyContent = "center";
        store.selectedElementData.verticalAlign = "center";
      } else if (alignment === "bottom") {
        textEl.style.justifyContent = "flex-end";
        store.selectedElementData.verticalAlign = "flex-end";
      }
    }
  });
}

function handleToolbarMousedown(e) {
  // Allow interactive elements (buttons and selects) to function normally.
  if (!e.target.closest("button") && !e.target.closest("select")) {
    e.preventDefault();
  }
}

// ─────────────────────────────────────────────────────────────
// 8) ADDING A NEW TEXTBOX
// ─────────────────────────────────────────────────────────────

function addTextboxToSlide() {
  if (store.currentSlideIndex < 0) {
    showToast(gettext("Please select a slide first!"), "Info");
    return;
  }

  pushCurrentSlideState();

  // Default font-size key and family
  const defaultFontSizeKey = "12";
  // Use the first available custom font or a system default
  const defaultFontFamily = getDefaultFont();

  const newTextbox = {
    id: store.elementIdCounter++,
    type: "textbox",
    // Wrap the default text in a <span> with data attributes. We compute an initial px
    // font-size using the document body as reference; it will be recomputed when rendered
    // inside the actual slide container.
    text: `<span><span 
             data-font-size-key="${defaultFontSizeKey}"
             data-font-family="${defaultFontFamily}"
             style="font-size: ${fontSizeKeyToPx(defaultFontSizeKey, document.body)}; font-family: '${defaultFontFamily}'; line-height: 1.2;"
           >
             ${gettext("Double click to edit text")}
           </span>
           </span>`,
    gridX: 10,
    gridY: 10,
    gridWidth: 110,
    gridHeight: 35,
    border: false,
    backgroundColor: "transparent",

    // Keep track in data model
    fontFamily: defaultFontFamily,
    fontSize: defaultFontSizeKey,
    lineHeight: "1.2",
    letterSpacing: "normal",
    textColor: "#000000",
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
    textAlign: "left",
    textDirection: "horizontal", // Initialize as horizontal text by default
    zIndex: getNewZIndex(),
    originSlideIndex: store.currentSlideIndex, // Track which slide this element was created on
    isLocked: false, // Initialize lock state
    isHidden: false, // Initialize visibility state
    isSimpleTextMode: true, // Initialize as simple text mode by default
  };

  store.slides[store.currentSlideIndex].elements.push(newTextbox);
  loadSlide(store.slides[store.currentSlideIndex]);

  const newElDom = document.getElementById("el-" + newTextbox.id);
  selectElement(newElDom, newTextbox);
}

/**
 * Handle mode toggle between rich text and simple text modes.
 */
function handleModeToggle(e) {
  const newMode = e.target.value;
  const isSimpleMode = newMode === "simple";

  withSelectedTextbox(() => {
    const currentIsSimple = store.selectedElementData.isSimpleTextMode || false;

    // If switching to simple mode from rich mode, warn about formatting loss
    if (isSimpleMode && !currentIsSimple) {
      const confirmed = confirm(
        gettext(
          "Switching to simple text mode will remove all formatting (bold, italic, colors, etc.). Do you want to continue?",
        ),
      );

      if (!confirmed) {
        // Revert radio button selection
        richTextModeRadio.checked = true;
        simpleTextModeRadio.checked = false;
        return;
      }

      pushCurrentSlideState();

      // Strip all formatting except <br> tags to preserve line breaks
      const target = store.selectedElement.querySelector(".text-content");
      if (target) {
        const plainTextWithBreaks = stripFormattingToPlainText(
          target.innerHTML,
        );
        target.innerHTML = plainTextWithBreaks;

        // Update data model
        store.selectedElementData.isSimpleTextMode = true;
        store.selectedElementData.text = plainTextWithBreaks;

        // Apply simple mode styles
        applySimpleModeStyles(target, store.selectedElementData);
      }
    } else if (!isSimpleMode && currentIsSimple) {
      // Switching from simple to rich mode
      pushCurrentSlideState();

      const target = store.selectedElement.querySelector(".text-content");
      if (target) {
        // Get current content (preserve line breaks as <br> tags)
        const currentContent = target.innerHTML;

        // Wrap in span with current settings
        const fontSize = store.selectedElementData.fontSize || "12";
        const fontFamily =
          store.selectedElementData.fontFamily || getDefaultFont();

        // Compute px based on the actual target container
        const computedFontSize = fontSizeKeyToPx(fontSize, target);

        target.innerHTML = `<span data-font-size-key="${fontSize}" data-font-family="${fontFamily}" style="font-size: ${computedFontSize}; font-family: '${fontFamily}'; line-height: 1.2;">${currentContent}</span>`;

        // Update data model
        store.selectedElementData.isSimpleTextMode = false;
        store.selectedElementData.text = target.innerHTML;

        // Clear simple mode styles from container
        target.style.fontSize = "";
        target.style.fontFamily = "";
        target.style.color = "";
        target.style.fontWeight = "";
        target.style.fontStyle = "";
        target.style.textDecoration = "";
      }
    }

    // Update font weight dropdown state based on mode
    updateFontWeightDropdownState();
  });
}

/**
 * Enable/disable font weight dropdown based on text mode.
 * Font weight is only available in Simple Text mode.
 */
function updateFontWeightDropdownState() {
  if (!store.selectedElementData) {
    fontWeightSelect.disabled = true;
    return;
  }

  const isSimpleMode = store.selectedElementData.isSimpleTextMode || false;
  fontWeightSelect.disabled = !isSimpleMode;
  
  // Add visual styling for disabled state
  if (!isSimpleMode) {
    fontWeightSelect.style.opacity = "0.5";
    fontWeightSelect.style.cursor = "not-allowed";
  } else {
    fontWeightSelect.style.opacity = "1";
    fontWeightSelect.style.cursor = "pointer";
  }
}

// ─────────────────────────────────────────────────────────────
// 9) INITIALIZATION (HOOKING UP EVENT LISTENERS)
// ─────────────────────────────────────────────────────────────

/**
 * Populates the font family dropdown with available fonts.
 */
function populateFontDropdown() {
  fontFamilySelect.innerHTML = ""; // Clear existing options

  // Add default system fonts
  const defaultFonts = getDefaultFonts();
  defaultFonts.forEach((fontName) => {
    const option = document.createElement("option");
    option.value = fontName;
    option.textContent = fontName;
    option.style.fontFamily = fontName;
    fontFamilySelect.appendChild(option);
  });

  // Add fetched custom fonts
  const availableFonts = getAvailableFonts();
  availableFonts.forEach((font) => {
    if (font.name) {
      const option = document.createElement("option");
      option.value = font.name; // Use the name as the value
      option.textContent = font.name;
      option.style.fontFamily = `"${font.name}"`; // Apply the font for preview in dropdown
      fontFamilySelect.appendChild(option);
    }
  });
}

export function initTextbox() {
  // Populate font dropdown with available fonts (fonts are already loaded by main.js)
  populateFontDropdown();

  // Button to add new textbox
  document
    .querySelector('[data-type="textbox"]')
    .addEventListener("click", addTextboxToSlide);

  // Mode toggle
  richTextModeRadio.addEventListener("change", handleModeToggle);
  simpleTextModeRadio.addEventListener("change", handleModeToggle);

  // Text direction toggle
  horizontalTextModeRadio.addEventListener("change", handleTextDirectionChange);
  verticalTextModeRadio.addEventListener("change", handleTextDirectionChange);

  // Font size + font family changes
  fontSizeSelect.addEventListener("change", handleFontSizeChange);
  fontFamilySelect.addEventListener("change", handleFontFamilyChange);
  lineHeightSelect.addEventListener("change", handleLineHeightChange);
  letterSpacingSelect.addEventListener("change", handleLetterSpacingChange);
  fontWeightSelect.addEventListener("change", handleFontWeightChange);

  // Text color picker
  textColorPicker.addEventListener("click", handleTextColorPickerClick);

  // Text formatting (bold, italic, underline)
  boldBtn.addEventListener("click", handleBoldClick);
  italicBtn.addEventListener("click", handleItalicClick);
  underlineBtn.addEventListener("click", handleUnderlineClick);

  // Horizontal alignment
  alignLeftBtn.addEventListener("click", handleAlignLeft);
  alignCenterBtn.addEventListener("click", handleAlignCenter);
  alignRightBtn.addEventListener("click", handleAlignRight);

  // Vertical alignment
  alignTopBtn.addEventListener("click", handleAlignTop);
  alignMiddleBtn.addEventListener("click", handleAlignMiddle);
  alignBottomBtn.addEventListener("click", handleAlignBottom);

  // Prevent toolbar misinteraction
  document
    .querySelector(".wysiwyg-toolbar")
    .addEventListener("mousedown", handleToolbarMousedown);
}

function handleInputOnEmpty(e) {
  const textContentElement = e.target; // This is the .text-content div

  // This function used to only handle the exact case where the div had a single
  // text node. In practice users often replace/clear content (Ctrl+A, Delete)
  // or paste, leaving direct text nodes or unwrapped elements in the
  // contenteditable. When that happens the new text inherits no font-size
  // wrapper and can appear very small. To avoid that we now:
  // - Wrap any direct text nodes or unwrapped elements in a span carrying
  //   the current toolbar font/size/family data attributes.
  // - Remove empty/whitespace-only text nodes.
  // - Preserve existing spans that already have `data-font-size-key` or
  //   `data-font-family`.

  // Only operate for rich text mode; in simple mode the container holds
  // uniform styles.
  const isSimpleMode = store.selectedElementData?.isSimpleTextMode || false;
  if (isSimpleMode) return;

  // 1. Get the desired style from the toolbar's current state.
  const currentSizeKey = fontSizeSelect.value;
  const currentFontSize = fontSizeKeyToPx(currentSizeKey || "12", textContentElement);
  const currentFontFamily = fontFamilySelect.value;

  if (!currentFontSize) {
    console.warn("No font size selected. Cannot apply style.");
    return; // Safety check
  }

  let madeChange = false;

  // Make a static copy because we'll modify the DOM while iterating.
  const children = Array.from(textContentElement.childNodes);

  children.forEach((node) => {
    // Remove empty/whitespace-only text nodes
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.textContent || !node.textContent.trim()) {
        node.parentNode && node.parentNode.removeChild(node);
        madeChange = true;
        return;
      }

      // Wrap plain text nodes
  const wrapperSpan = document.createElement("span");
  wrapperSpan.style.fontSize = currentFontSize;
  wrapperSpan.style.fontFamily = `"${currentFontFamily}"`;
      wrapperSpan.style.lineHeight = "1.2";
      wrapperSpan.setAttribute("data-font-size-key", currentSizeKey);
      wrapperSpan.setAttribute("data-font-family", currentFontFamily);

      // Replace the text node with the wrapper, then move the text node into it.
      textContentElement.replaceChild(wrapperSpan, node);
      wrapperSpan.appendChild(node);
      madeChange = true;
      return;
    }

    // If it's already a span with our data attributes, leave it alone.
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.tagName === "SPAN" &&
      (node.hasAttribute("data-font-size-key") ||
        node.hasAttribute("data-font-family"))
    ) {
      return;
    }

    // For any other element (e.g., <b>, <i>, <div>, <br>, etc.) wrap it so
    // that toolbar styles apply uniformly. This preserves formatting tags
    // while ensuring the wrapper controls font size/family.
    if (node.nodeType === Node.ELEMENT_NODE) {
  const wrapperSpan = document.createElement("span");
  wrapperSpan.style.fontSize = currentFontSize;
  wrapperSpan.style.fontFamily = `"${currentFontFamily}"`;
      wrapperSpan.style.lineHeight = "1.2";
      wrapperSpan.setAttribute("data-font-size-key", currentSizeKey);
      wrapperSpan.setAttribute("data-font-family", currentFontFamily);

      textContentElement.replaceChild(wrapperSpan, node);
      wrapperSpan.appendChild(node);
      madeChange = true;
      return;
    }
  });

  if (madeChange) {
    // Move caret to the end of the last child to give a natural typing
    // experience after wrapping.
    const lastChild = textContentElement.lastChild;
    if (lastChild) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(lastChild);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 10) RENDER FUNCTION
//     (Used by renderSlide.js, e.g. to display the textbox element)
// ─────────────────────────────────────────────────────────────
export function _renderTextbox(el, container, isInteractivePlayback) {
  const textWrapper = document.createElement("div");
  textWrapper.classList.add("text-content");
  textWrapper.innerHTML = el.text || gettext("Double click to edit text");
  textWrapper.contentEditable = false;

  // Disable auto-correction, spell checking, and auto-capitalization
  textWrapper.setAttribute("autocorrect", "off");
  textWrapper.setAttribute("autocapitalize", "off");
  textWrapper.setAttribute("spellcheck", "false");

  const isSimpleMode = el.isSimpleTextMode || false;

  if (isSimpleMode) {
    // In simple mode, strip all formatting except <br> tags and apply uniform styles
    const plainTextWithBreaks = stripFormattingToPlainText(
      textWrapper.innerHTML,
    );
    textWrapper.innerHTML = plainTextWithBreaks;
    applySimpleModeStyles(textWrapper, el);
  } else {
    // In rich text mode, fix line height issues in existing content
    fixLineHeightInTextbox(textWrapper);

    textWrapper.style.lineHeight = el.lineHeight || "1.2";
    // ensure all spans inside respect the wrapper's line-height and convert vw sizes to px
    textWrapper.querySelectorAll("span").forEach((span) => {
      span.style.lineHeight = el.lineHeight || "1.2";
      if (span.hasAttribute("data-font-size-key")) {
        const key = span.getAttribute("data-font-size-key");
        span.style.fontSize = fontSizeKeyToPx(key, textWrapper);
      } else if (span.style.fontSize) {
        // Convert any vw-based inline font sizes to px relative to this container
        span.style.fontSize = fontSizeValueToPx(span.style.fontSize, getContainerWidthForElement(textWrapper));
      }
    });
  }

  // Vertical alignment
  if (el.verticalAlign) {
    textWrapper.style.display = "flex";
    textWrapper.style.flexDirection = "column";
    if (el.verticalAlign === "flex-start") {
      textWrapper.style.justifyContent = "flex-start";
    } else if (el.verticalAlign === "center") {
      textWrapper.style.justifyContent = "center";
    } else if (el.verticalAlign === "flex-end") {
      textWrapper.style.justifyContent = "flex-end";
    }
  }

  // Text direction (writing mode)
  if (el.textDirection) {
    const writingMode =
      textDirectionMapping[el.textDirection] || "horizontal-tb";
    textWrapper.style.writingMode = writingMode;

    // Also apply to the container element for better display
    container.style.writingMode = writingMode;

    // Adjust text alignment for vertical text
    if (el.textDirection === "vertical") {
      const rawAlign = el.textAlign || "left";
      textWrapper.style.textAlign = mapTextAlignForDirection(
        rawAlign,
        "vertical",
      );
    } else {
      // Restore original text alignment from element data
      const textAlign = el.textAlign || "left";
      textWrapper.style.textAlign = textAlign;
    }
  }

  if (
    (!isInteractivePlayback && queryParams.mode === "edit") ||
    (!isInteractivePlayback && queryParams.mode === "template_editor") ||
    (!isInteractivePlayback && queryParams.mode === "suborg_templates")
  ) {
    textWrapper.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      pushCurrentSlideState();
      textWrapper.contentEditable = true;
      textWrapper.focus();
    });

    textWrapper.addEventListener("mousedown", (e) => {
      if (textWrapper.isContentEditable) e.stopPropagation();
    });

    textWrapper.addEventListener("blur", () => {
      setTimeout(() => {
        // If no other text-content is active, finalize
        if (!document.activeElement?.closest(".text-content")) {
          textWrapper.contentEditable = false;

          if (isSimpleMode) {
            // In simple mode, preserve line breaks as <br> tags
            el.text = textWrapper.innerHTML;
          } else {
            // In rich mode, normalize and fix formatting
            normalizeNestedSpans(textWrapper);
            el.text = textWrapper.innerHTML;
            fixLineHeightInTextbox(textWrapper);
          }
        }
      }, 0);
    });

    textWrapper.addEventListener("input", () => {
      autoResizeTextbox(textWrapper, container, el);

      if (!isSimpleMode) {
        // Only fix line heights and handle empty spans in rich mode
        fixLineHeightInTextbox(textWrapper);
        handleInputOnEmpty({ target: textWrapper });
      }
    });

    // Force plain-text paste and ensure pasted text gets wrapped with the
    // current toolbar styles in rich text mode so it doesn't become tiny.
    textWrapper.addEventListener("paste", (pasteEvent) => {
      // Always prevent the browser from inserting rich HTML
      pasteEvent.preventDefault();

      const clipboardData = pasteEvent.clipboardData || window.clipboardData;
      const pasteText =
        clipboardData && clipboardData.getData
          ? clipboardData.getData("text/plain")
          : "";

      if (!pasteText) return;

      // Insert plain text at the current selection/caret
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) {
        // Fallback: append at end
        textWrapper.appendChild(document.createTextNode(pasteText));
      } else {
        const range = sel.getRangeAt(0);
        // Replace selection
        range.deleteContents();
        const textNode = document.createTextNode(pasteText);
        range.insertNode(textNode);

        // Move caret after inserted text
        const newRange = document.createRange();
        newRange.setStartAfter(textNode);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }

      // If in rich mode, ensure the newly-inserted plain text is wrapped
      // so toolbar font/size applies. In simple mode we want plain text only.
      if (!isSimpleMode) {
        // Run our wrapper logic which will wrap direct text nodes.
        handleInputOnEmpty({ target: textWrapper });
        // Also normalize line-height issues
        normalizeNestedSpans(textWrapper);
        fixLineHeightInTextbox(textWrapper);
      }
    });
  }

  // Listen for selection changes (mouse up, key up) to update size/family dropdowns
  textWrapper.addEventListener("mouseup", () => {
    handleFontSizeIndicator();
    handleFontFamilyIndicator();
    handleLineHeightIndicator();
    handleLetterSpacingIndicator();
  });
  textWrapper.addEventListener("keyup", () => {
    handleFontSizeIndicator();
    handleFontFamilyIndicator();
    handleLineHeightIndicator();
    handleLetterSpacingIndicator();
  });

  container.appendChild(textWrapper);
}
