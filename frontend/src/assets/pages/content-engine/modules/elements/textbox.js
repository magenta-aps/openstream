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

// ─────────────────────────────────────────────────────────────
// 3) FONT SIZE MAPPING
// ─────────────────────────────────────────────────────────────
export const fontSizeMapping = {
  1: "calc(10px + 0.5vw)",
  2: "calc(11px + 0.5vw)",
  3: "calc(12px + 0.5vw)",
  4: "calc(14px + 0.5vw)",
  5: "calc(16px + 0.5vw)",
  6: "calc(18px + 0.5vw)",
  7: "calc(20px + 0.5vw)",
  8: "calc(24px + 0.5vw)",
  9: "calc(28px + 0.5vw)",
  10: "calc(32px + 0.5vw)",
  11: "calc(36px + 0.5vw)",
  12: "calc(40px + 0.5vw)",
  13: "calc(44px + 0.5vw)",
  14: "calc(48px + 0.5vw)",
  15: "calc(52px + 0.5vw)",
  16: "calc(56px + 0.5vw)",
  17: "calc(60px + 0.5vw)",
  18: "calc(64px + 0.5vw)",
  19: "calc(68px + 0.5vw)",
  20: "calc(72px + 0.5vw)",
  21: "calc(80px + 0.5vw)",
  22: "calc(88px + 0.5vw)",
  23: "calc(96px + 0.5vw)",
  24: "calc(104px + 0.5vw)",
  25: "calc(112px + 0.5vw)",
  26: "calc(120px + 0.5vw)",
  27: "calc(128px + 0.5vw)",
};

export const lineHeightMapping = {
  1: "1",
  1.2: "1.2",
  1.5: "1.5",
  2: "2",
};

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
 * Strip all formatting from HTML and return plain text content.
 */
function stripFormattingToPlainText(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
}

/**
 * Apply uniform styling to a simple text mode textbox.
 */
function applySimpleModeStyles(textElement, elData) {
  const fontSize = fontSizeMapping[elData.fontSize] || fontSizeMapping["12"];
  const fontFamily = elData.fontFamily || getDefaultFont();
  const lineHeight = lineHeightMapping[elData.lineHeight] || "1.2";
  const textColor = elData.textColor || "#000000";
  const fontWeight = elData.fontWeight || "normal";
  const fontStyle = elData.fontStyle || "normal";
  const textDecoration = elData.textDecoration || "none";
  
  textElement.style.fontSize = fontSize;
  textElement.style.fontFamily = `"${fontFamily}"`;
  textElement.style.lineHeight = lineHeight;
  textElement.style.color = textColor;
  textElement.style.fontWeight = fontWeight;
  textElement.style.fontStyle = fontStyle;
  textElement.style.textDecoration = textDecoration;
}

/**
 * Update the mode radio buttons based on the selected element's state.
 */
export function updateModeRadioButtons() {
  if (!store.selectedElementData) return;
  
  const isSimpleMode = store.selectedElementData.isSimpleTextMode || false;
  
  if (isSimpleMode) {
    simpleTextModeRadio.checked = true;
    richTextModeRadio.checked = false;
  } else {
    richTextModeRadio.checked = true;
    simpleTextModeRadio.checked = false;
  }
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
  // fontSizeMapping should be defined elsewhere (e.g., { small: '12px', medium: '16px', large: '20px' }).
  const desiredSize = fontSizeMapping[sizeKey];
  if (!desiredSize) return;

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
    wrapperSpan.style.fontSize = desiredSize;
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

    // 4) Append the cleaned content into the wrapper.
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
        target.style.fontStyle = currentStyle === "italic" ? "normal" : "italic";
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
        target.style.textDecoration = currentDecoration === "underline" ? "none" : "underline";
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
      textEl.contentEditable = "true";
      textEl.focus();
      document.execCommand("justifyLeft", false, null);
    }
  });
}

function handleAlignCenter() {
  pushCurrentSlideState();
  withSelectedTextbox(() => {
    const textEl = store.selectedElement.querySelector(".text-content");
    if (textEl) {
      textEl.contentEditable = "true";
      textEl.focus();
      document.execCommand("justifyCenter", false, null);
    }
  });
}

function handleAlignRight() {
  pushCurrentSlideState();
  withSelectedTextbox(() => {
    const textEl = store.selectedElement.querySelector(".text-content");
    if (textEl) {
      textEl.contentEditable = "true";
      textEl.focus();
      document.execCommand("justifyRight", false, null);
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
  const defaultFontSizeValue = fontSizeMapping[defaultFontSizeKey];
  // Use the first available custom font or a system default
  const defaultFontFamily = getDefaultFont();

  const newTextbox = {
    id: store.elementIdCounter++,
    type: "textbox",
    // Wrap the default text in a <span> with data attributes:
    text: `<span><span 
             data-font-size-key="${defaultFontSizeKey}"
             data-font-family="${defaultFontFamily}"
             style="font-size: ${defaultFontSizeValue}; font-family: '${defaultFontFamily}'; line-height: 1.2;"
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
    textColor: "#000000",
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
    textAlign: "left",
    zIndex: getNewZIndex(),
    originSlideIndex: store.currentSlideIndex, // Track which slide this element was created on
    isLocked: false, // Initialize lock state
    isHidden: false, // Initialize visibility state
    isSimpleTextMode: false, // Initialize as rich text mode by default
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
        gettext("Switching to simple text mode will remove all formatting (bold, italic, colors, etc.). Do you want to continue?")
      );
      
      if (!confirmed) {
        // Revert radio button selection
        richTextModeRadio.checked = true;
        simpleTextModeRadio.checked = false;
        return;
      }
      
      pushCurrentSlideState();
      
      // Strip all formatting and convert to plain text
      const target = store.selectedElement.querySelector(".text-content");
      if (target) {
        const plainText = stripFormattingToPlainText(target.innerHTML);
        target.innerHTML = plainText;
        
        // Update data model
        store.selectedElementData.isSimpleTextMode = true;
        store.selectedElementData.text = plainText;
        
        // Apply simple mode styles
        applySimpleModeStyles(target, store.selectedElementData);
      }
    } else if (!isSimpleMode && currentIsSimple) {
      // Switching from simple to rich mode
      pushCurrentSlideState();
      
      const target = store.selectedElement.querySelector(".text-content");
      if (target) {
        // Get current plain text
        const plainText = target.textContent || target.innerText || "";
        
        // Wrap in span with current settings
        const fontSize = store.selectedElementData.fontSize || "12";
        const fontFamily = store.selectedElementData.fontFamily || getDefaultFont();
        const fontSizeValue = fontSizeMapping[fontSize];
        
        target.innerHTML = `<span data-font-size-key="${fontSize}" data-font-family="${fontFamily}" style="font-size: ${fontSizeValue}; font-family: '${fontFamily}'; line-height: 1.2;">${plainText}</span>`;
        
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
  });
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

  // Font size + font family changes
  fontSizeSelect.addEventListener("change", handleFontSizeChange);
  fontFamilySelect.addEventListener("change", handleFontFamilyChange);
  lineHeightSelect.addEventListener("change", handleLineHeightChange);

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

  // CONDITION: Act only if the div contains exactly one child, and it's a text node.
  if (
    textContentElement.childNodes.length === 1 &&
    textContentElement.firstChild.nodeType === Node.TEXT_NODE
  ) {
    const textNode = textContentElement.firstChild;

    // Don't do anything if the input was just a deletion that emptied the node
    if (textNode.textContent.length === 0) {
      return;
    }

    // 1. Get the desired style from the toolbar's current state.
    const currentSizeKey = fontSizeSelect.value;
    const currentFontSize = fontSizeMapping[currentSizeKey];
    const currentFontFamily = fontFamilySelect.value;

    if (!currentFontSize) {
      console.warn("No font size selected. Cannot apply style.");
      return; // Safety check
    }

    // 2. Create the wrapper span with all the correct styles and data attributes.
    const wrapperSpan = document.createElement("span");
    wrapperSpan.style.fontSize = currentFontSize;
    wrapperSpan.style.fontFamily = `"${currentFontFamily}"`; // Quote font name for safety
    wrapperSpan.style.lineHeight = "1.2"; // Maintain consistent line height
    wrapperSpan.setAttribute("data-font-size-key", currentSizeKey);
    wrapperSpan.setAttribute("data-font-family", currentFontFamily);

    // 3. Move the text from the raw text node into our new span.
    wrapperSpan.appendChild(textNode);

    // 4. Replace the div's content with the new, wrapped span.
    textContentElement.appendChild(wrapperSpan);

    // 5. CRUCIAL: Restore the selection/cursor to the end of the text.
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(wrapperSpan);
    range.collapse(false); // 'false' collapses the range to its end point
    sel.removeAllRanges();
    sel.addRange(range);
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
    // In simple mode, strip all formatting and apply uniform styles
    const plainText = stripFormattingToPlainText(textWrapper.innerHTML);
    textWrapper.innerHTML = plainText;
    applySimpleModeStyles(textWrapper, el);
  } else {
    // In rich text mode, fix line height issues in existing content
    fixLineHeightInTextbox(textWrapper);
    
    textWrapper.style.lineHeight = el.lineHeight || "1.2";
    // ensure all spans inside respect the wrapper's line-height
    textWrapper.querySelectorAll("span").forEach((span) => {
      span.style.lineHeight = el.lineHeight || "1.2";
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
            // In simple mode, just store plain text
            el.text = textWrapper.textContent || textWrapper.innerText || "";
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
  }

  // Listen for selection changes (mouse up, key up) to update size/family dropdowns
  textWrapper.addEventListener("mouseup", () => {
    handleFontSizeIndicator();
    handleFontFamilyIndicator();
    handleLineHeightIndicator();
  });
  textWrapper.addEventListener("keyup", () => {
    handleFontSizeIndicator();
    handleFontFamilyIndicator();
    handleLineHeightIndicator();
  });

  container.appendChild(textWrapper);
}
