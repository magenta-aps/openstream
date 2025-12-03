// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { Editor, Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontSize, LineHeight } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import Color from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { AllSelection, TextSelection } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { loadSlide } from "../core/renderSlide.js";
import { selectElement } from "../core/elementSelector.js";
import { showToast, queryParams } from "../../../../utils/utils.js";
import { showColorPalette } from "../utils/colorUtils.js";
import {
  getAvailableFonts,
  getDefaultFont,
  getDefaultFonts,
} from "../utils/fontUtils.js";
import { gettext } from "../../../../utils/locales.js";
import { getNewZIndex } from "../utils/domUtils.js";
import { GridUtils } from "../config/gridConfig.js";
import {
  getTextFormattingSettings,
  isTextFormattingFeatureEnabled,
  TEXT_FORMATTING_FEATURES,
} from "../../../../utils/textFormattingSettings.js";

export function autoResizeTextbox(textEl, containerEl, dataObj) {
  const cellHeight = GridUtils.getCellHeight(store.emulatedHeight);
  const requiredRows = Math.ceil(textEl.scrollHeight / cellHeight);
  if (requiredRows > dataObj.gridHeight) {
    dataObj.gridHeight = requiredRows;
    containerEl.style.gridRowEnd = `span ${requiredRows}`;
  }
}

// Font sizes and line heights are now directly mapped from dropdown values
// The dropdown values correspond to the actual CSS values (px for font size, unitless for line height)

const PREDEFINED_FONT_SIZES = [
  10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72,
  80, 88, 96, 104, 112, 120, 128, 144, 160, 176, 192, 208, 224, 240, 256, 272,
  288, 304, 320, 336, 352, 368, 384, 400, 416, 432, 448, 464, 480, 496, 512
];

const DEFAULT_FONT_SIZE_KEY = "40"; // Default font size in pixels (matches toolbar default)
const DEFAULT_LINE_HEIGHT_KEY = "1.2";
const DEFAULT_TEXT_COLOR = "#000000";

function getFontSizeCssValue(key) {
  // The key is the dropdown value (pixel size), just append 'px' to convert it to a CSS value
  return key ? `${key}px` : `${DEFAULT_FONT_SIZE_KEY}px`;
}

function getLineHeightCssValue(key) {
  // The key is the dropdown value, which directly corresponds to the CSS line-height value
  return key || DEFAULT_LINE_HEIGHT_KEY;
}

function buildTextStyleAttributes(elementData) {
  if (!elementData) return null;

  const attrs = {};
  const fontFamily = elementData.fontFamily || getDefaultFont();
  const fontSize = getFontSizeCssValue(elementData.fontSize);
  const lineHeight = getLineHeightCssValue(elementData.lineHeight);
  const color = elementData.textColor || DEFAULT_TEXT_COLOR;

  if (fontFamily) {
    attrs.fontFamily = fontFamily;
  }
  if (fontSize) {
    attrs.fontSize = fontSize;
  }
  if (lineHeight) {
    attrs.lineHeight = lineHeight;
  }
  if (color) {
    attrs.color = color;
  }

  return Object.keys(attrs).length ? attrs : null;
}

function textStyleAttrsEqual(existingAttrs, targetAttrs) {
  if (!existingAttrs && !targetAttrs) return true;
  if (!existingAttrs || !targetAttrs) return false;
  const keys = new Set([
    ...Object.keys(existingAttrs),
    ...Object.keys(targetAttrs),
  ]);
  for (const key of keys) {
    if ((existingAttrs[key] ?? null) !== (targetAttrs[key] ?? null)) {
      return false;
    }
  }
  return true;
}

function resetEditorSelection(editor) {
  if (!editor) return;
  const { state, view } = editor;
  if (!state || !view) return;

  const docSize = state.doc.content.size;
  const hasContent = docSize > 0;
  const rawPos = state.selection.from;
  const targetPos = hasContent
    ? Math.max(1, Math.min(rawPos, docSize))
    : 0;

  const selectionUnchanged =
    state.selection.from === targetPos && state.selection.to === targetPos;
  const hasStoredMarks = Array.isArray(state.storedMarks)
    ? state.storedMarks.length > 0
    : false;

  if (selectionUnchanged && !hasStoredMarks) {
    return;
  }

  const selection = TextSelection.create(state.doc, targetPos);
  const tr = state.tr.setSelection(selection).setStoredMarks([]);
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}



const tiptapToolbar = document.querySelector(".tiptap-toolbar");
const fontFamilySelect = document.querySelector(".tiptap-font-family-select");
const fontSizeInput = document.querySelector(".tiptap-font-size-input");
const fontSizeDecreaseBtn = document.getElementById(
  "tiptapFontSizeDecreaseBtn",
);
const fontSizeIncreaseBtn = document.getElementById(
  "tiptapFontSizeIncreaseBtn",
);
const lineHeightSelect = document.querySelector(".tiptap-line-height-select");
const textColorBtn = document.getElementById("tiptapTextColorBtn");
const boldBtn = document.getElementById("tiptapBoldBtn");
const italicBtn = document.getElementById("tiptapItalicBtn");
const underlineBtn = document.getElementById("tiptapUnderlineBtn");
const alignLeftBtn = document.getElementById("tiptapAlignTextLeftBtn");
const alignCenterBtn = document.getElementById("tiptapAlignTextCenterBtn");
const alignRightBtn = document.getElementById("tiptapAlignTextRightBtn");
const alignTopBtn = document.getElementById("tiptapAlignTopBtn");
const alignMiddleBtn = document.getElementById("tiptapAlignMiddleBtn");
const alignBottomBtn = document.getElementById("tiptapAlignBottomBtn");
const basicFormattingGroup = document.getElementById(
  "tiptapBasicFormattingGroup",
);
const basicFormattingSeparator = document.getElementById(
  "tiptapBasicFormattingSeparator",
);

const DEFAULT_TEXT_HTML = `<p>${gettext("Double click to edit text")}</p>`;
const tiptapEditors = new Map();


function getToolbarButtonWrapper(buttonEl) {
  if (!buttonEl) {
    return null;
  }
  return (
    buttonEl.closest('[data-bs-toggle="tooltip"]') ||
    buttonEl.parentElement ||
    buttonEl
  );
}

function setToolbarButtonVisibility(buttonEl, isVisible) {
  const wrapper = getToolbarButtonWrapper(buttonEl);
  if (wrapper) {
    wrapper.classList.toggle("d-none", !isVisible);
  }
  if (buttonEl) {
    buttonEl.disabled = !isVisible;
  }
}

function applyToolbarFeatureVisibility() {
  const settings = getTextFormattingSettings();
  const boldEnabled = !!settings[TEXT_FORMATTING_FEATURES.BOLD];
  const italicEnabled = !!settings[TEXT_FORMATTING_FEATURES.ITALIC];
  const underlineEnabled = !!settings[TEXT_FORMATTING_FEATURES.UNDERLINE];

  setToolbarButtonVisibility(boldBtn, boldEnabled);
  setToolbarButtonVisibility(italicBtn, italicEnabled);
  setToolbarButtonVisibility(underlineBtn, underlineEnabled);

  const hasBasicFormatting = boldEnabled || italicEnabled || underlineEnabled;
  if (basicFormattingGroup) {
    basicFormattingGroup.classList.toggle("d-none", !hasBasicFormatting);
  }
  if (basicFormattingSeparator) {
    basicFormattingSeparator.classList.toggle("d-none", !hasBasicFormatting);
  }
}

const DefaultFormattingExtension = Extension.create({
  name: 'defaultFormatting',
  
  addProseMirrorPlugins() {
    const elementData = this.options.elementData;
    
    return [
      new Plugin({
        key: new PluginKey('defaultFormatting'),
        appendTransaction(transactions, oldState, newState) {
          // Only process if there was actual content change
          const docChanged = transactions.some(tr => tr.docChanged);
          if (!docChanged) return null;
          
          let tr = newState.tr;
          let modified = false;
          
          // Build default text style attributes
          const schema = newState.schema;
          const fontFamily = elementData?.fontFamily || getDefaultFont();
          const fontSize = getFontSizeCssValue(elementData?.fontSize);
          const lineHeight = getLineHeightCssValue(elementData?.lineHeight);
          const color = elementData?.textColor || DEFAULT_TEXT_COLOR;
          
          const defaultAttrs = {};
          if (fontFamily) defaultAttrs.fontFamily = fontFamily;
          if (fontSize) defaultAttrs.fontSize = fontSize;
          if (lineHeight) defaultAttrs.lineHeight = lineHeight;
          if (color) defaultAttrs.color = color;
          
          if (Object.keys(defaultAttrs).length === 0) return null;
          
          // Traverse the document and apply default formatting to text without styling
          newState.doc.descendants((node, pos) => {
            if (node.isText) {
              const textStyleMark = node.marks.find(m => m.type.name === 'textStyle');
              const existingAttrs = textStyleMark?.attrs || {};
              
              // Check which default attributes are missing
              const missingAttrs = {};
              Object.keys(defaultAttrs).forEach(key => {
                if (existingAttrs[key] == null) {
                  missingAttrs[key] = defaultAttrs[key];
                }
              });
              
              if (Object.keys(missingAttrs).length > 0) {
                // Merge with existing attributes
                const mergedAttrs = { ...existingAttrs, ...missingAttrs };
                const newMark = schema.marks.textStyle.create(mergedAttrs);
                
                // Remove old textStyle mark if it exists and add the new one
                const from = pos;
                const to = pos + node.nodeSize;
                
                if (textStyleMark) {
                  tr = tr.removeMark(from, to, textStyleMark);
                }
                tr = tr.addMark(from, to, newMark);
                modified = true;
              }
            }
          });
          
          return modified ? tr : null;
        },
      }),
    ];
  },
});

function getTiptapExtensions(elementData) {
  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      dropcursor: false,
      gapcursor: false,
      hardBreak: true,
      heading: false,
      undoRedo: true,
      horizontalRule: false,
      listItem: false,
      listKeymap: false,
      link: false,
      orderedList: false,
      strike: false,
      trailingNode: false,
      underline: false,
      paragraph: {
        preserveWhitespace: 'full',
      },
    }),
    TextStyle.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          fontFamily: {
            default: null,
            parseHTML: element => element.style.fontFamily?.replace(/['"]/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontFamily) {
                return {};
              }
              // Always quote font family names to handle names starting with numbers
              const quotedFamily = `"${attributes.fontFamily.replace(/['"]/g, '')}"`;
              return {
                style: `font-family: ${quotedFamily}`,
              };
            },
          },
        };
      },
    }),
    FontSize,
    LineHeight,
    Color.configure({
      types: ["textStyle"],
    }),
    FontFamily.configure({
      parseHTML: element => {
        return {
          fontFamily: element.style.fontFamily?.replace(/['"]/g, ''),
        };
      },
      renderHTML: attributes => {
        if (!attributes.fontFamily) {
          return {};
        }
        // Always quote font family names to handle names starting with numbers
        // or containing special characters
        const quotedFamily = `"${attributes.fontFamily.replace(/['"]/g, '')}"`;
        return {
          style: `font-family: ${quotedFamily}`,
        };
      },
    }),
    Underline,
    TextAlign.configure({
      types: ["paragraph"],
    }),
    DefaultFormattingExtension.configure({
      elementData,
    }),
  ];
}

function getActiveEditor() {
  if (store.selectedElementData?.type !== "tiptap-textbox") return null;
  return tiptapEditors.get(store.selectedElementData.id) || null;
}

function getEditorDom(editor) {
  if (!editor) return null;
  return editor.view?.dom || editor.options.element || null;
}

function findElementDataById(elementId) {
  return store.slides
    ?.flatMap((slide) => slide.elements || [])
    .find((el) => el.id === elementId);
}

function selectionCoversWholeDoc(editor) {
  if (!editor) return false;
  const { selection, doc } = editor.state;
  if (selection instanceof AllSelection) return true;
  if (selection.empty) return false;
  const { from, to, $from, $to } = selection;
  const docSize = doc.content.size;
  const docNodeSize = doc.nodeSize;
  if (from === 0 && to === docNodeSize) return true;
  if (from === 1 && to === docSize + 1) return true;
  if ($from.pos === 0 && $to.pos === docSize) return true;
  if ($from.pos === 0 && $to.pos === docNodeSize) return true;
  return false;
}

function shouldApplyDefaultFormatting(editor) {
  if (!editor) return true;
  if (!editor.isEditable) return true;
  return selectionCoversWholeDoc(editor);
}

function runEditorCommand(editor, applyToWholeDoc, commandBuilder) {
  if (!editor) return false;
  const wasEditable = editor.isEditable;
  if (!wasEditable) {
    editor.setEditable(true, false);
  }

  let chain = editor.chain().focus();
  if (applyToWholeDoc) {
    chain = chain.selectAll();
  }

  const executed = commandBuilder(chain).run();

  if (!wasEditable) {
    resetEditorSelection(editor);
    editor.setEditable(false, false);
    const dom = getEditorDom(editor);
    if (dom && typeof dom.blur === "function") {
      dom.blur();
    }
  }

  return executed;
}

function disposeEditorForElement(elementId, preserveContent = true) {
  const existing = tiptapEditors.get(elementId);
  if (!existing) return;

  if (preserveContent) {
    const html = existing.getHTML();
    const elementData = findElementDataById(elementId);
    if (elementData) {
      elementData.tiptapContent = html;
      elementData.text = html;
    }
  }

  existing.destroy();
  tiptapEditors.delete(elementId);
}

export function disposeAllTiptapEditors(preserveContent = true) {
  Array.from(tiptapEditors.keys()).forEach((id) => {
    disposeEditorForElement(id, preserveContent);
  });
}

function isDefaultElementContent(elementData) {
  if (!elementData) return false;
  const rawContent = elementData.tiptapContent || elementData.text;
  if (!rawContent) return true;
  return rawContent.trim() === DEFAULT_TEXT_HTML.trim();
}

function applyInitialTextFormatting(editor, elementData) {
  if (!editor || !elementData) return;
  if (!isDefaultElementContent(elementData)) return;

  const applyToWholeDoc = true;

  const fontFamily = elementData.fontFamily || getDefaultFont();
  if (fontFamily) {
    runEditorCommand(editor, applyToWholeDoc, (chain) =>
      chain.setFontFamily(fontFamily),
    );
  }

  const fontSizeKey = elementData.fontSize || DEFAULT_FONT_SIZE_KEY;
  const fontSizeValue = getFontSizeCssValue(fontSizeKey);
  runEditorCommand(editor, applyToWholeDoc, (chain) =>
    chain.setFontSize(fontSizeValue),
  );

  const lineHeightKey = elementData.lineHeight || DEFAULT_LINE_HEIGHT_KEY;
  const lineHeightValue = getLineHeightCssValue(lineHeightKey);
  runEditorCommand(editor, applyToWholeDoc, (chain) =>
    chain.setLineHeight(lineHeightValue),
  );

  const textColor = elementData.textColor || DEFAULT_TEXT_COLOR;
  if (textColor) {
    runEditorCommand(editor, applyToWholeDoc, (chain) =>
      chain.setColor(textColor),
    );
  }

  updateToolbarFromEditor(editor);
}

function populateFontDropdown() {
  if (fontFamilySelect) {
    fontFamilySelect.innerHTML = "";

    const availableFonts = getAvailableFonts();
    const defaultFonts = getDefaultFonts();
    const usingFallbackFonts = defaultFonts.length > 0;

    defaultFonts.forEach((fontName) => {
      const option = document.createElement("option");
      option.value = fontName;
      option.textContent = fontName;
      option.style.fontFamily = fontName;
      option.title = fontName;
      fontFamilySelect.appendChild(option);
    });

    availableFonts.forEach((font) => {
      if (!font?.name) return;
      const option = document.createElement("option");
      option.value = font.name;
      option.textContent = font.name;
      option.style.fontFamily = `"${font.name}"`;
      option.title = font.name;
      fontFamilySelect.appendChild(option);
    });

    if (availableFonts.length > 0 && !usingFallbackFonts) {
      console.log("Fonts loaded...");
    }
  }

  // Populate font size dropdown
  const fontSizeDropdownMenu = document.querySelector(".tiptap-font-size-dropdown-menu");
  if (fontSizeDropdownMenu) {
    fontSizeDropdownMenu.innerHTML = "";
    PREDEFINED_FONT_SIZES.forEach(size => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.classList.add("dropdown-item", "text-center");
      a.href = "#";
      a.dataset.value = size;
      a.textContent = size;
      
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (fontSizeInput) {
          fontSizeInput.value = size;
          fontSizeInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      
      li.appendChild(a);
      fontSizeDropdownMenu.appendChild(li);
    });
  }
}

function applyContainerStyles(elementData, wrapper) {
  if (!wrapper || !elementData) return;

  if (elementData.textAlign) {
    wrapper.style.textAlign = elementData.textAlign;
  } else {
    wrapper.style.removeProperty("text-align");
  }

  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";

  const vAlign = elementData.verticalAlign || "top";
  if (vAlign === "middle") {
    wrapper.style.justifyContent = "center";
  } else if (vAlign === "bottom") {
    wrapper.style.justifyContent = "flex-end";
  } else {
    wrapper.style.justifyContent = "flex-start";
  }
}

function updateColorButton(color) {
  if (!textColorBtn) return;
  const icon = textColorBtn.querySelector(".material-symbols-outlined");
  textColorBtn.style.removeProperty("border-bottom");
  if (!icon) return;
  if (color) {
    icon.style.color = color;
  } else {
    icon.style.removeProperty("color");
  }
}

function updateFontSizeStepperState(activeValue) {
  if (!fontSizeDecreaseBtn || !fontSizeIncreaseBtn || !fontSizeInput) return;
  
  const currentVal = parseInt(activeValue, 10);
  if (isNaN(currentVal)) return;
  
  fontSizeDecreaseBtn.disabled = currentVal <= 1;
  fontSizeIncreaseBtn.disabled = currentVal >= 1000;
}

function updateAlignmentButtons(targetAlign) {
  if (!targetAlign) targetAlign = "left";
  alignLeftBtn?.classList.toggle("active", targetAlign === "left");
  alignCenterBtn?.classList.toggle("active", targetAlign === "center");
  alignRightBtn?.classList.toggle("active", targetAlign === "right");
}

function updateVerticalAlignmentButtons(targetAlign) {
  if (!targetAlign) targetAlign = "top";
  alignTopBtn?.classList.toggle("active", targetAlign === "top");
  alignMiddleBtn?.classList.toggle("active", targetAlign === "middle");
  alignBottomBtn?.classList.toggle("active", targetAlign === "bottom");
}

function syncToolbarFromData() {
  const data = store.selectedElementData;
  if (!data || data.type !== "tiptap-textbox") return;

  if (fontFamilySelect) {
    fontFamilySelect.value = data.fontFamily || getDefaultFont();
  }
  if (fontSizeInput) {
    fontSizeInput.value = data.fontSize || DEFAULT_FONT_SIZE_KEY;
    updateFontSizeStepperState(fontSizeInput.value);
  }
  if (lineHeightSelect) {
    lineHeightSelect.value = data.lineHeight || DEFAULT_LINE_HEIGHT_KEY;
  }
  updateAlignmentButtons(data.textAlign || "left");
  updateVerticalAlignmentButtons(data.verticalAlign || "top");
  updateColorButton(data.textColor);
}

function updateToolbarFromEditor(editor) {
  if (!editor) return;
  if (isTextFormattingFeatureEnabled(TEXT_FORMATTING_FEATURES.BOLD)) {
    boldBtn?.classList.toggle("active", editor.isActive("bold"));
  } else {
    boldBtn?.classList.remove("active");
  }
  if (isTextFormattingFeatureEnabled(TEXT_FORMATTING_FEATURES.ITALIC)) {
    italicBtn?.classList.toggle("active", editor.isActive("italic"));
  } else {
    italicBtn?.classList.remove("active");
  }
  if (isTextFormattingFeatureEnabled(TEXT_FORMATTING_FEATURES.UNDERLINE)) {
    underlineBtn?.classList.toggle("active", editor.isActive("underline"));
  } else {
    underlineBtn?.classList.remove("active");
  }

  const attrs = editor.getAttributes("textStyle") || {};

  if (fontFamilySelect) {
    const family =
      attrs.fontFamily?.replace?.(/"/g, "") ||
      store.selectedElementData?.fontFamily ||
      getDefaultFont();
    fontFamilySelect.value = family;
  }

  if (fontSizeInput) {
    const sizeValue = attrs.fontSize;
    if (sizeValue) {
      // Extract the numeric value from the CSS value (e.g., "40px" -> "40")
      const sizeKey = sizeValue.replace('px', '');
      fontSizeInput.value = sizeKey;
    } else if (store.selectedElementData?.fontSize) {
      fontSizeInput.value = store.selectedElementData.fontSize;
    } else {
      fontSizeInput.value = DEFAULT_FONT_SIZE_KEY;
    }
    updateFontSizeStepperState(fontSizeInput.value);
  }

  if (lineHeightSelect) {
    const lineHeightValue =
      attrs.lineHeight || store.selectedElementData?.lineHeight;
    if (lineHeightValue) {
      lineHeightSelect.value = String(lineHeightValue);
    } else {
      lineHeightSelect.value = DEFAULT_LINE_HEIGHT_KEY;
    }
  }

  const resolvedColor =
    attrs.color || store.selectedElementData?.textColor || DEFAULT_TEXT_COLOR;
  updateColorButton(resolvedColor);

  const textAlign = editor.isActive({ textAlign: "center" })
    ? "center"
    : editor.isActive({ textAlign: "right" })
      ? "right"
      : "left";
  updateAlignmentButtons(textAlign);
  updateVerticalAlignmentButtons(store.selectedElementData?.verticalAlign || "top");
}

export function updateTiptapToolbarState() {
  const editor = getActiveEditor();
  if (editor) {
    updateToolbarFromEditor(editor);
    return;
  }
  syncToolbarFromData();
}

function handleFontFamilyChange(e) {
  const value = e.target.value;
  const editor = getActiveEditor();
  const applyDefaults = shouldApplyDefaultFormatting(editor);

  pushCurrentSlideState();

  if (!editor) {
    if (store.selectedElementData) {
      store.selectedElementData.fontFamily = value;
    }
    return;
  }

  const executed = runEditorCommand(editor, applyDefaults, (chain) =>
    chain.setFontFamily(value),
  );

  if (!executed) return;

  if (applyDefaults && store.selectedElementData) {
    store.selectedElementData.fontFamily = value;
  }

  updateToolbarFromEditor(editor);
}

function stepFontSize(step) {
  if (!fontSizeInput) return;
  
  let currentVal = parseInt(fontSizeInput.value, 10);
  if (isNaN(currentVal)) currentVal = parseInt(DEFAULT_FONT_SIZE_KEY, 10);

  let nextVal;
  
  if (step > 0) {
      // Increasing
      const nextPredefined = PREDEFINED_FONT_SIZES.find(s => s > currentVal);
      if (nextPredefined) {
          nextVal = nextPredefined;
      } else {
          nextVal = currentVal + 1;
      }
  } else {
      // Decreasing
      // Find largest predefined strictly less than currentVal
      const prevPredefined = [...PREDEFINED_FONT_SIZES].reverse().find(s => s < currentVal);
      if (prevPredefined) {
          nextVal = prevPredefined;
      } else {
          nextVal = Math.max(1, currentVal - 1);
      }
  }
  
  if (nextVal !== currentVal) {
      fontSizeInput.value = nextVal;
      fontSizeInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function handleFontSizeDecreaseClick(e) {
  e.preventDefault();
  stepFontSize(-1);
}

function handleFontSizeIncreaseClick(e) {
  e.preventDefault();
  stepFontSize(1);
}

function handleFontSizeChange(e) {
  const key = e.target.value;
  const editor = getActiveEditor();
  const applyDefaults = shouldApplyDefaultFormatting(editor);
  const cssValue = getFontSizeCssValue(key);

  pushCurrentSlideState();

  if (!editor) {
    if (store.selectedElementData) {
      store.selectedElementData.fontSize = key;
    }
    updateFontSizeStepperState(key);
    return;
  }

  const executed = runEditorCommand(editor, applyDefaults, (chain) =>
    chain.setFontSize(cssValue),
  );

  if (!executed) return;

  if (applyDefaults && store.selectedElementData) {
    store.selectedElementData.fontSize = key;
  }

  updateToolbarFromEditor(editor);
  updateFontSizeStepperState(key);
}

function handleLineHeightChange(e) {
  const key = e.target.value;
  const editor = getActiveEditor();
  const applyDefaults = shouldApplyDefaultFormatting(editor);
  const value = getLineHeightCssValue(key);

  pushCurrentSlideState();

  if (!editor) {
    if (store.selectedElementData) {
      store.selectedElementData.lineHeight = key;
    }
    return;
  }

  const executed = runEditorCommand(editor, applyDefaults, (chain) =>
    chain.setLineHeight(value),
  );

  if (!executed) return;

  if (applyDefaults && store.selectedElementData) {
    store.selectedElementData.lineHeight = key;
  }

  updateToolbarFromEditor(editor);
}

function handleBoldClick() {
  if (!isTextFormattingFeatureEnabled(TEXT_FORMATTING_FEATURES.BOLD)) {
    return;
  }
  pushCurrentSlideState();
  const editor = getActiveEditor();

  if (!editor) return;

  const applyDefaults = shouldApplyDefaultFormatting(editor);
  const executed = runEditorCommand(editor, applyDefaults, (chain) =>
    chain.toggleBold(),
  );

  if (!executed) return;

  updateToolbarFromEditor(editor);
}

function handleItalicClick() {
  if (!isTextFormattingFeatureEnabled(TEXT_FORMATTING_FEATURES.ITALIC)) {
    return;
  }
  pushCurrentSlideState();
  const editor = getActiveEditor();

  if (!editor) return;

  const applyDefaults = shouldApplyDefaultFormatting(editor);
  const executed = runEditorCommand(editor, applyDefaults, (chain) =>
    chain.toggleItalic(),
  );

  if (!executed) return;

  updateToolbarFromEditor(editor);
}

function handleUnderlineClick() {
  if (!isTextFormattingFeatureEnabled(TEXT_FORMATTING_FEATURES.UNDERLINE)) {
    return;
  }
  pushCurrentSlideState();
  const editor = getActiveEditor();

  if (!editor) return;

  const applyDefaults = shouldApplyDefaultFormatting(editor);
  const executed = runEditorCommand(editor, applyDefaults, (chain) =>
    chain.toggleUnderline(),
  );

  if (!executed) return;

  updateToolbarFromEditor(editor);
}

function setTextAlignment(targetAlign) {
  const editor = getActiveEditor();
  const applyDefaults = shouldApplyDefaultFormatting(editor);

  pushCurrentSlideState();

  if (!editor) {
    if (store.selectedElementData) {
      store.selectedElementData.textAlign = targetAlign;
    }
    updateAlignmentButtons(targetAlign);
    return;
  }

  const executed = runEditorCommand(editor, applyDefaults, (chain) =>
    chain.setTextAlign(targetAlign),
  );

  if (!executed) return;

  if (applyDefaults && store.selectedElementData) {
    store.selectedElementData.textAlign = targetAlign;
  }

  const wrapper = editor.options.element;
  if (wrapper && applyDefaults) {
    applyContainerStyles(store.selectedElementData, wrapper);
  }

  updateToolbarFromEditor(editor);
}

function handleAlignLeft() {
  setTextAlignment("left");
}

function handleAlignCenter() {
  setTextAlignment("center");
}

function handleAlignRight() {
  setTextAlignment("right");
}

function setVerticalAlignment(targetAlign) {
  if (store.selectedElementData) {
    pushCurrentSlideState();
    store.selectedElementData.verticalAlign = targetAlign;
    
    updateVerticalAlignmentButtons(targetAlign);
    
    const editor = getActiveEditor();
    if (editor) {
      const wrapper = editor.options.element;
      if (wrapper) {
        applyContainerStyles(store.selectedElementData, wrapper);
      }
    }
  }
}

function handleAlignTop() {
  setVerticalAlignment("top");
}

function handleAlignMiddle() {
  setVerticalAlignment("middle");
}

function handleAlignBottom() {
  setVerticalAlignment("bottom");
}

function handleTextColorPickerClick() {
  if (!store.selectedElementData) return;

  showColorPalette(
    textColorBtn,
    (chosenColor) => {
      if (!chosenColor) return;
      const editor = getActiveEditor();
      const applyDefaults = shouldApplyDefaultFormatting(editor);

      pushCurrentSlideState();

      if (!editor) {
        store.selectedElementData.textColor = chosenColor;
        updateColorButton(chosenColor);
        return;
      }

      const executed = runEditorCommand(editor, applyDefaults, (chain) =>
        chain.setColor(chosenColor),
      );

      if (!executed) return;

      if (applyDefaults && store.selectedElementData) {
        store.selectedElementData.textColor = chosenColor;
      }

      updateToolbarFromEditor(editor);
      updateColorButton(chosenColor);
    },
    { allowRemove: false },
  );
}

function handleToolbarMousedown(e) {
  // Allow interaction with inputs, selects, buttons, and dropdown items
  if (!e.target.closest("button") && 
      !e.target.closest("select") && 
      !e.target.closest("input") && 
      !e.target.closest(".dropdown-item")) {
    e.preventDefault();
  }
}

function createEditorForElement(elementData, wrapper, container) {
  const editor = new Editor({
    element: wrapper,
    extensions: getTiptapExtensions(elementData),
    content: elementData.tiptapContent || elementData.text || DEFAULT_TEXT_HTML,
    editable: false,
    autofocus: false,
    parseOptions: {
      preserveWhitespace: 'full',
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        // Intercept Ctrl+A to create a proper content-only selection
        if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
          event.preventDefault();
          const { state } = view;
          const { doc } = state;
          const docSize = doc.content.size;
          
          // Select from position 1 to docSize (content only, excluding boundaries)
          if (docSize > 0) {
            const selection = TextSelection.create(doc, 1, docSize);
            const tr = state.tr.setSelection(selection);
            view.dispatch(tr);
          }
          return true; // Prevent default handler
        }
        
        // Handle Tab key to insert tab character instead of changing focus
        if (event.key === 'Tab') {
          event.preventDefault();
          const { state } = view;
          const { selection } = state;
          
          // Insert tab character
          const tr = state.tr.insertText('\t', selection.from, selection.to);
          view.dispatch(tr);
          return true;
        }
        
        return false; // Allow other keys to proceed normally
      },
    },
  });

  let applyingStoredMarks = false;
  // Ensure cleared editors keep previous formatting by restoring stored textStyle marks.



  editor.on("update", () => {
    const html = editor.getHTML();
    elementData.tiptapContent = html;
    elementData.text = html;
    if (container) {
      autoResizeTextbox(wrapper, container, elementData);
    }
    updateToolbarFromEditor(editor);
  });

  editor.on("selectionUpdate", () => {
    updateToolbarFromEditor(editor);
  });

  editor.on("focus", () => {
    updateToolbarFromEditor(editor);
  });

  editor.on("transaction", () => {
    const html = editor.getHTML();
    elementData.tiptapContent = html;
    elementData.text = html;
  });

  const handleEscape = (event) => {
    if (event.key !== "Escape") return;
    if (!editor.isEditable) return;
    event.preventDefault();
    event.stopPropagation();
    finalizeEditorForElement(elementData.id);
  };

  wrapper.addEventListener("keydown", handleEscape);
  editor.on("destroy", () => {
    wrapper.removeEventListener("keydown", handleEscape);
  });

  tiptapEditors.set(elementData.id, editor);
  applyInitialTextFormatting(editor, elementData);
  applyContainerStyles(elementData, wrapper);
  if (container) {
    autoResizeTextbox(wrapper, container, elementData);
  }
  updateToolbarFromEditor(editor);
  return editor;
}

function enterEditMode(elementData) {
  if (!elementData) return;
  const editor = tiptapEditors.get(elementData.id);
  if (!editor) return;
  if (editor.isEditable) {
    editor.chain().focus().run();
    return;
  }
  pushCurrentSlideState();
  editor.setEditable(true, false);
  editor.chain().focus("end").run();
}

export function finalizeEditorForElement(elementId) {
  const editor = tiptapEditors.get(elementId);
  if (!editor || !editor.isEditable) return;

  const html = editor.getHTML();
  const data = findElementDataById(elementId);
  if (data) {
    data.tiptapContent = html;
    data.text = html;
  }

  resetEditorSelection(editor);
  editor.setEditable(false, false);

  const dom = getEditorDom(editor);
  if (dom && typeof dom.blur === "function") {
    dom.blur();
  }

  const wrapper = editor.options.element;
  if (wrapper && data) {
    applyContainerStyles(data, wrapper);
  }
}

function addTiptapTextboxToSlide() {
  if (store.currentSlideIndex < 0) {
    showToast(gettext("Please select a slide first!"), "Info");
    return;
  }

  pushCurrentSlideState();
  const defaultFontSizeKey = DEFAULT_FONT_SIZE_KEY;
  const defaultFontFamily = getDefaultFont();

  const newTextbox = {
    id: store.elementIdCounter++,
    type: "tiptap-textbox",
    tiptapContent: DEFAULT_TEXT_HTML,
    text: DEFAULT_TEXT_HTML,
    gridX: 10,
    gridY: 10,
    gridWidth: 110,
    gridHeight: 35,
    border: false,
    backgroundColor: "transparent",
    fontFamily: defaultFontFamily,
    fontSize: defaultFontSizeKey,
    lineHeight: DEFAULT_LINE_HEIGHT_KEY,
    textColor: DEFAULT_TEXT_COLOR,
    textAlign: "left",
    verticalAlign: "top",
    zIndex: getNewZIndex(),
    originSlideIndex: store.currentSlideIndex,
    isLocked: false,
    isHidden: false,
  };

  store.slides[store.currentSlideIndex].elements.push(newTextbox);
  loadSlide(store.slides[store.currentSlideIndex]);
  const newElDom = document.getElementById(`el-${newTextbox.id}`);
  if (newElDom) {
    selectElement(newElDom, newTextbox);
  }
}

export function initTiptapTextbox() {
  applyToolbarFeatureVisibility();
  populateFontDropdown();

  const addBtn = document.querySelector('[data-type="tiptap-textbox"]');
  addBtn?.addEventListener("click", addTiptapTextboxToSlide);

  fontFamilySelect?.addEventListener("change", handleFontFamilyChange);
  fontSizeDecreaseBtn?.addEventListener("click", handleFontSizeDecreaseClick);
  fontSizeIncreaseBtn?.addEventListener("click", handleFontSizeIncreaseClick);
  fontSizeInput?.addEventListener("change", handleFontSizeChange);
  lineHeightSelect?.addEventListener("change", handleLineHeightChange);

  boldBtn?.addEventListener("click", handleBoldClick);
  italicBtn?.addEventListener("click", handleItalicClick);
  underlineBtn?.addEventListener("click", handleUnderlineClick);

  alignLeftBtn?.addEventListener("click", handleAlignLeft);
  alignCenterBtn?.addEventListener("click", handleAlignCenter);
  alignRightBtn?.addEventListener("click", handleAlignRight);

  alignTopBtn?.addEventListener("click", handleAlignTop);
  alignMiddleBtn?.addEventListener("click", handleAlignMiddle);
  alignBottomBtn?.addEventListener("click", handleAlignBottom);

  textColorBtn?.addEventListener("click", handleTextColorPickerClick);

  tiptapToolbar?.addEventListener("mousedown", handleToolbarMousedown);

  if (fontSizeInput) {
    updateFontSizeStepperState(fontSizeInput.value);
  }
}

export function _renderTiptapTextbox(el, container, isInteractivePlayback) {
  finalizeEditorForElement(el.id);
  disposeEditorForElement(el.id);

  const textWrapper = document.createElement("div");
  textWrapper.classList.add("text-content", "tiptap-text-content");
  textWrapper.setAttribute("spellcheck", "false");
  textWrapper.setAttribute("autocorrect", "off");
  textWrapper.setAttribute("autocapitalize", "off");
  textWrapper.dataset.elementId = String(el.id);

  container.appendChild(textWrapper);

  const editor = createEditorForElement(el, textWrapper, container);

  const isEditableContext =
    !isInteractivePlayback &&
    (queryParams.mode === "edit" ||
      queryParams.mode === "template_editor" ||
      queryParams.mode === "suborg_templates");

  if (isEditableContext) {
    textWrapper.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      enterEditMode(el);
    });

    textWrapper.addEventListener("mousedown", (event) => {
      if (editor.isEditable) {
        event.stopPropagation();
      }
    });
  }
}
