// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { Editor, Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontSize, LineHeight } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import Color from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { AllSelection } from "@tiptap/pm/state";
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

const fontSizeKeys = Object.keys(fontSizeMapping).sort(
  (a, b) => Number(a) - Number(b),
);

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

const tiptapToolbar = document.querySelector(".tiptap-toolbar");
const fontFamilySelect = document.querySelector(".tiptap-font-family-select");
const fontSizeSelect = document.querySelector(".tiptap-font-size-select");
const fontSizeDecreaseBtn = document.getElementById(
  "tiptapFontSizeDecreaseBtn",
);
const fontSizeIncreaseBtn = document.getElementById(
  "tiptapFontSizeIncreaseBtn",
);
const lineHeightSelect = document.querySelector(".tiptap-line-height-select");
const letterSpacingSelect = document.querySelector(
  ".tiptap-letter-spacing-select",
);
const fontWeightSelect = document.querySelector(".tiptap-font-weight-select");
const horizontalTextModeRadio = document.getElementById(
  "tiptapHorizontalTextMode",
);
const verticalTextModeRadio = document.getElementById("tiptapVerticalTextMode");
const textColorBtn = document.getElementById("tiptapTextColorBtn");
const boldBtn = document.getElementById("tiptapBoldBtn");
const italicBtn = document.getElementById("tiptapItalicBtn");
const underlineBtn = document.getElementById("tiptapUnderlineBtn");
const alignLeftBtn = document.getElementById("tiptapAlignTextLeftBtn");
const alignCenterBtn = document.getElementById("tiptapAlignTextCenterBtn");
const alignRightBtn = document.getElementById("tiptapAlignTextRightBtn");
const alignTopBtn = document.getElementById("tiptapAlignTextTopBtn");
const alignMiddleBtn = document.getElementById("tiptapAlignTextMiddleBtn");
const alignBottomBtn = document.getElementById("tiptapAlignTextBottomBtn");
const basicFormattingGroup = document.getElementById(
  "tiptapBasicFormattingGroup",
);
const basicFormattingSeparator = document.getElementById(
  "tiptapBasicFormattingSeparator",
);
const fontWeightPreSeparator = document.getElementById(
  "tiptapFontWeightPreSeparator",
);
const fontWeightGroup = document.getElementById("tiptapFontWeightGroup");
const fontWeightPostSeparator = document.getElementById(
  "tiptapFontWeightPostSeparator",
);

const DEFAULT_TEXT_HTML = `<p>${gettext("Double click to edit text")}</p>`;
const tiptapEditors = new Map();

const textDirectionMapping = {
  horizontal: "horizontal-tb",
  vertical: "vertical-rl",
};

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
  const fontWeightEnabled = !!settings[TEXT_FORMATTING_FEATURES.FONT_WEIGHT];

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

  if (fontWeightGroup) {
    fontWeightGroup.classList.toggle("d-none", !fontWeightEnabled);
  }
  if (fontWeightPreSeparator) {
    fontWeightPreSeparator.classList.toggle("d-none", !fontWeightEnabled);
  }
  if (fontWeightPostSeparator) {
    fontWeightPostSeparator.classList.toggle("d-none", !fontWeightEnabled);
  }
  if (fontWeightSelect) {
    fontWeightSelect.disabled = !fontWeightEnabled;
  }
}

function findKeyByValue(mapping, targetValue) {
  if (targetValue == null) return null;
  const entry = Object.entries(mapping).find(([, val]) => val === targetValue);
  return entry ? entry[0] : null;
}

const LetterSpacingExtension = Extension.create({
  name: "letterSpacing",
  addOptions() {
    return {
      types: ["textStyle"],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (element) => element.style.letterSpacing || null,
            renderHTML: (attributes) => {
              if (!attributes.letterSpacing) {
                return {};
              }
              return {
                style: `letter-spacing: ${attributes.letterSpacing}`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLetterSpacing:
        (letterSpacing) =>
        ({ chain }) =>
          chain().setMark("textStyle", { letterSpacing }).run(),
      unsetLetterSpacing:
        () =>
        ({ chain }) =>
          chain()
            .setMark("textStyle", { letterSpacing: null })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});

const FontWeightExtension = Extension.create({
  name: "fontWeight",
  addOptions() {
    return {
      types: ["textStyle"],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontWeight: {
            default: null,
            parseHTML: (element) => element.style.fontWeight || null,
            renderHTML: (attributes) => {
              if (!attributes.fontWeight) {
                return {};
              }
              return {
                style: `font-weight: ${attributes.fontWeight}`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontWeight:
        (fontWeight) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontWeight }).run(),
      unsetFontWeight:
        () =>
        ({ chain }) =>
          chain()
            .setMark("textStyle", { fontWeight: null })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});

function getTiptapExtensions() {
  return [
    StarterKit.configure({
      heading: false,
    }),
    TextStyle,
    FontSize,
    LineHeight,
    Color.configure({
      types: ["textStyle"],
    }),
    FontFamily,
    LetterSpacingExtension,
    FontWeightExtension,
    Underline,
    TextAlign.configure({
      types: ["paragraph"],
    }),
  ];
}

function mapTextAlignForDirection(textAlign, direction) {
  if (direction === "vertical") {
    if (textAlign === "left") return "start";
    if (textAlign === "right") return "end";
    return "center";
  }
  return textAlign || "left";
}

function getTextWrapperByElement(el) {
  return el?.querySelector?.(".tiptap-text-content");
}

function getSelectedTiptapWrapper() {
  if (store.selectedElementData?.type !== "tiptap-textbox") return null;
  return getTextWrapperByElement(store.selectedElement);
}

function getActiveEditor() {
  if (store.selectedElementData?.type !== "tiptap-textbox") return null;
  return tiptapEditors.get(store.selectedElementData.id) || null;
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
  return selectionCoversWholeDoc(editor);
}

function createHeadlessEditorFromElement(elementData) {
  return new Editor({
    extensions: getTiptapExtensions(),
    content: elementData.tiptapContent || elementData.text || DEFAULT_TEXT_HTML,
  });
}

function applyCommandToEntireElement(commandBuilder) {
  if (!store.selectedElementData) return;
  const elementData = store.selectedElementData;
  const headlessEditor = createHeadlessEditorFromElement(elementData);
  const chain = headlessEditor.chain().focus().selectAll();
  commandBuilder(chain);
  const executed = chain.run();

  if (!executed) {
    headlessEditor.destroy();
    return;
  }

  const html = headlessEditor.getHTML();
  elementData.tiptapContent = html;
  elementData.text = html;
  headlessEditor.destroy();

  const wrapper = getSelectedTiptapWrapper();
  if (wrapper) {
    wrapper.innerHTML = html;
    wrapper.setAttribute("contenteditable", "false");
  }

  return executed;
}

function destroyEditorForElement(elementId, preserveContent = true) {
  const existing = tiptapEditors.get(elementId);
  if (!existing) return;
  const wrapper = existing.options.element;
  if (preserveContent) {
    const html = existing.getHTML();
    const elementData = store.slides
      ?.flatMap((slide) => slide.elements || [])
      .find((el) => el.id === elementId);
    if (elementData) {
      elementData.tiptapContent = html;
      elementData.text = html;
    }
    if (wrapper) {
      wrapper.innerHTML = html;
    }
  }
  existing.destroy();
  tiptapEditors.delete(elementId);
  if (wrapper) {
    wrapper.setAttribute("contenteditable", "false");
  }
}

function populateFontDropdown() {
  if (!fontFamilySelect) return;
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

function applyElementStyles(elementData, wrapper, container) {
  if (!wrapper || !elementData) return;
  const textAlign = elementData.textAlign || "left";
  const direction = elementData.textDirection || "horizontal";
  const writingMode = textDirectionMapping[direction] || "horizontal-tb";
  wrapper.style.writingMode = writingMode;
  if (container) {
    container.style.writingMode = writingMode;
  }

  const resolvedAlign = mapTextAlignForDirection(textAlign, direction);
  wrapper.style.textAlign = resolvedAlign;

  if (elementData.verticalAlign) {
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.justifyContent = elementData.verticalAlign;
  } else {
    wrapper.style.removeProperty("display");
    wrapper.style.removeProperty("flex-direction");
    wrapper.style.removeProperty("justify-content");
  }

  const fontFamily = elementData.fontFamily || getDefaultFont();
  wrapper.style.fontFamily = `"${fontFamily}"`;

  const fontSize =
    fontSizeMapping[elementData.fontSize] || fontSizeMapping["12"];
  wrapper.style.fontSize = fontSize;

  const lineHeight =
    lineHeightMapping[elementData.lineHeight] ||
    elementData.lineHeight ||
    "1.2";
  wrapper.style.lineHeight = lineHeight;

  const letterSpacing =
    letterSpacingMapping[elementData.letterSpacing] ||
    elementData.letterSpacing ||
    "normal";
  wrapper.style.letterSpacing = letterSpacing;

  const fontWeight =
    fontWeightMapping[elementData.fontWeight] ||
    elementData.fontWeight ||
    "normal";
  wrapper.style.fontWeight = fontWeight;

  wrapper.style.color = elementData.textColor || "#000000";
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

function updateFontSizeStepperState(activeKey) {
  if (!fontSizeDecreaseBtn || !fontSizeIncreaseBtn) return;
  if (!fontSizeKeys.length) {
    fontSizeDecreaseBtn.disabled = false;
    fontSizeIncreaseBtn.disabled = false;
    return;
  }
  const index = fontSizeKeys.indexOf(String(activeKey));
  if (index === -1) {
    fontSizeDecreaseBtn.disabled = false;
    fontSizeIncreaseBtn.disabled = false;
    return;
  }
  fontSizeDecreaseBtn.disabled = index <= 0;
  fontSizeIncreaseBtn.disabled = index >= fontSizeKeys.length - 1;
}

function updateAlignmentButtons(targetAlign) {
  if (!targetAlign) targetAlign = "left";
  alignLeftBtn?.classList.toggle("active", targetAlign === "left");
  alignCenterBtn?.classList.toggle("active", targetAlign === "center");
  alignRightBtn?.classList.toggle("active", targetAlign === "right");
}

function updateVerticalAlignmentButtons(verticalAlign) {
  alignTopBtn?.classList.toggle("active", verticalAlign === "flex-start");
  alignMiddleBtn?.classList.toggle("active", verticalAlign === "center");
  alignBottomBtn?.classList.toggle("active", verticalAlign === "flex-end");
}

function syncToolbarFromData() {
  const data = store.selectedElementData;
  if (!data || data.type !== "tiptap-textbox") return;

  if (fontFamilySelect) {
    fontFamilySelect.value = data.fontFamily || getDefaultFont();
  }
  if (fontSizeSelect) {
    fontSizeSelect.value = data.fontSize || "12";
    updateFontSizeStepperState(fontSizeSelect.value);
  }
  if (lineHeightSelect) {
    lineHeightSelect.value = data.lineHeight || "1.2";
  }
  if (letterSpacingSelect) {
    letterSpacingSelect.value = data.letterSpacing || "normal";
  }
  if (fontWeightSelect) {
    fontWeightSelect.value = data.fontWeight || "normal";
  }
  if (horizontalTextModeRadio && verticalTextModeRadio) {
    const direction = data.textDirection || "horizontal";
    horizontalTextModeRadio.checked = direction !== "vertical";
    verticalTextModeRadio.checked = direction === "vertical";
  }
  updateAlignmentButtons(data.textAlign || "left");
  updateVerticalAlignmentButtons(data.verticalAlign || "flex-start");
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

  if (fontSizeSelect) {
    const sizeValue = attrs.fontSize;
    if (sizeValue) {
      const sizeKey = findKeyByValue(fontSizeMapping, sizeValue);
      if (sizeKey) {
        fontSizeSelect.value = sizeKey;
      } else if (store.selectedElementData) {
        fontSizeSelect.value = store.selectedElementData.fontSize || "12";
      }
    } else if (store.selectedElementData) {
      fontSizeSelect.value = store.selectedElementData.fontSize || "12";
    }
    updateFontSizeStepperState(fontSizeSelect.value);
  }

  if (lineHeightSelect) {
    const lineHeightValue =
      attrs.lineHeight || store.selectedElementData?.lineHeight;
    if (lineHeightValue) {
      const key =
        findKeyByValue(lineHeightMapping, lineHeightValue) || lineHeightValue;
      lineHeightSelect.value = String(key);
    } else if (store.selectedElementData?.lineHeight) {
      lineHeightSelect.value = store.selectedElementData.lineHeight;
    }
  }

  if (letterSpacingSelect) {
    const letterSpacingValue =
      attrs.letterSpacing || store.selectedElementData?.letterSpacing;
    if (letterSpacingValue) {
      const key =
        findKeyByValue(letterSpacingMapping, letterSpacingValue) ||
        letterSpacingValue;
      letterSpacingSelect.value = String(key);
    } else if (store.selectedElementData?.letterSpacing) {
      letterSpacingSelect.value = store.selectedElementData.letterSpacing;
    }
  }

  if (fontWeightSelect) {
    const weightValue =
      attrs.fontWeight || store.selectedElementData?.fontWeight;
    if (weightValue) {
      const key = findKeyByValue(fontWeightMapping, weightValue) || weightValue;
      fontWeightSelect.value = String(key);
    } else if (store.selectedElementData?.fontWeight) {
      fontWeightSelect.value = store.selectedElementData.fontWeight;
    }
  }

  updateColorButton(attrs.color || store.selectedElementData?.textColor);

  const textAlign = editor.isActive({ textAlign: "center" })
    ? "center"
    : editor.isActive({ textAlign: "right" })
      ? "right"
      : "left";
  updateAlignmentButtons(textAlign);
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

  let headlessApplied = true;
  if (editor) {
    editor.chain().focus().setFontFamily(value).run();
    updateToolbarFromEditor(editor);
  } else {
    headlessApplied = !!applyCommandToEntireElement((chain) =>
      chain.setFontFamily(value),
    );
    if (!headlessApplied) {
      return;
    }
  }

  if (!editor || applyDefaults) {
    if (store.selectedElementData) {
      store.selectedElementData.fontFamily = value;
    }
    const wrapper = getSelectedTiptapWrapper();
    if (wrapper) {
      wrapper.style.fontFamily = `"${value}"`;
      const container = store.selectedElement;
      if (container && store.selectedElementData) {
        autoResizeTextbox(wrapper, container, store.selectedElementData);
      }
    }
  }
}

function getCurrentFontSizeKey() {
  if (!fontSizeSelect) return null;
  const current = fontSizeSelect.value;
  if (fontSizeKeys.includes(current)) {
    return current;
  }
  return fontSizeKeys.length ? fontSizeKeys[0] : null;
}

function stepFontSize(step) {
  if (!fontSizeSelect) return;
  const currentKey = getCurrentFontSizeKey();
  if (!currentKey) return;
  const currentIndex = fontSizeKeys.indexOf(currentKey);
  const targetIndex = currentIndex + step;
  if (targetIndex < 0 || targetIndex >= fontSizeKeys.length) {
    return;
  }
  const targetKey = fontSizeKeys[targetIndex];
  if (targetKey === fontSizeSelect.value) {
    return;
  }
  fontSizeSelect.value = targetKey;
  fontSizeSelect.dispatchEvent(new Event("change", { bubbles: true }));
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
  const cssValue = fontSizeMapping[key] || fontSizeMapping["12"];

  pushCurrentSlideState();

  let headlessApplied = true;
  if (editor) {
    editor.chain().focus().setFontSize(cssValue).run();
    updateToolbarFromEditor(editor);
  } else {
    headlessApplied = !!applyCommandToEntireElement((chain) =>
      chain.setFontSize(cssValue),
    );
    if (!headlessApplied) {
      return;
    }
  }

  if (!editor || applyDefaults) {
    if (store.selectedElementData) {
      store.selectedElementData.fontSize = key;
    }
    const wrapper = getSelectedTiptapWrapper();
    if (wrapper) {
      wrapper.style.fontSize = cssValue;
      const container = store.selectedElement;
      if (container && store.selectedElementData) {
        autoResizeTextbox(wrapper, container, store.selectedElementData);
      }
    }
  }

  updateFontSizeStepperState(key);
}

function handleLineHeightChange(e) {
  const key = e.target.value;
  const editor = getActiveEditor();
  const applyDefaults = shouldApplyDefaultFormatting(editor);
  const value = lineHeightMapping[key] || key;

  pushCurrentSlideState();

  let headlessApplied = true;
  if (editor) {
    editor.chain().focus().setLineHeight(value).run();
    updateToolbarFromEditor(editor);
  } else {
    headlessApplied = !!applyCommandToEntireElement((chain) =>
      chain.setLineHeight(value),
    );
    if (!headlessApplied) {
      return;
    }
  }

  if (!editor || applyDefaults) {
    if (store.selectedElementData) {
      store.selectedElementData.lineHeight = key;
    }
    const wrapper = getSelectedTiptapWrapper();
    if (wrapper) {
      wrapper.style.lineHeight = value;
      const container = store.selectedElement;
      if (container && store.selectedElementData) {
        autoResizeTextbox(wrapper, container, store.selectedElementData);
      }
    }
  }
}

function handleLetterSpacingChange(e) {
  const key = e.target.value;
  const editor = getActiveEditor();
  const applyDefaults = shouldApplyDefaultFormatting(editor);
  const value = letterSpacingMapping[key] || key;

  pushCurrentSlideState();

  let headlessApplied = true;
  if (editor) {
    editor.chain().focus().setLetterSpacing(value).run();
    updateToolbarFromEditor(editor);
  } else {
    headlessApplied = !!applyCommandToEntireElement((chain) =>
      chain.setLetterSpacing(value),
    );
    if (!headlessApplied) {
      return;
    }
  }

  if (!editor || applyDefaults) {
    if (store.selectedElementData) {
      store.selectedElementData.letterSpacing = key;
    }
    const wrapper = getSelectedTiptapWrapper();
    if (wrapper) {
      wrapper.style.letterSpacing = value;
      const container = store.selectedElement;
      if (container && store.selectedElementData) {
        autoResizeTextbox(wrapper, container, store.selectedElementData);
      }
    }
  }
}

function handleFontWeightChange(e) {
  if (!isTextFormattingFeatureEnabled(TEXT_FORMATTING_FEATURES.FONT_WEIGHT)) {
    return;
  }
  const value = e.target.value;
  const editor = getActiveEditor();
  const applyDefaults = shouldApplyDefaultFormatting(editor);
  const currentFontFamily =
    store.selectedElementData?.fontFamily || getDefaultFont();

  pushCurrentSlideState();

  let headlessApplied = true;
  if (editor) {
    const chain = editor.chain().focus();
    if (currentFontFamily) {
      chain.setFontFamily(currentFontFamily);
    }
    if (typeof chain.unsetBold === "function") {
      chain.unsetBold();
    } else if (typeof chain.unsetMark === "function") {
      chain.unsetMark("bold");
    }
    chain.setFontWeight(value).run();
    updateToolbarFromEditor(editor);
  } else {
    headlessApplied = !!applyCommandToEntireElement((chain) => {
      if (currentFontFamily) {
        chain.setFontFamily(currentFontFamily);
      }
      if (typeof chain.unsetBold === "function") {
        chain.unsetBold();
      } else if (typeof chain.unsetMark === "function") {
        chain.unsetMark("bold");
      }
      chain.setFontWeight(value);
    });
    if (!headlessApplied) {
      return;
    }
    boldBtn?.classList.remove("active");
  }

  if (!editor || applyDefaults) {
    if (store.selectedElementData) {
      store.selectedElementData.fontWeight = value;
    }
    const wrapper = getSelectedTiptapWrapper();
    if (wrapper) {
      wrapper.style.fontWeight = value;
      const container = store.selectedElement;
      if (container && store.selectedElementData) {
        autoResizeTextbox(wrapper, container, store.selectedElementData);
      }
    }
  }
}

function handleBoldClick() {
  if (!isTextFormattingFeatureEnabled(TEXT_FORMATTING_FEATURES.BOLD)) {
    return;
  }
  pushCurrentSlideState();
  const editor = getActiveEditor();

  if (editor) {
    editor.chain().focus().toggleBold().run();
    updateToolbarFromEditor(editor);
    return;
  }

  const executed = applyCommandToEntireElement((chain) => chain.toggleBold());
  if (!executed) {
    return;
  }

  if (boldBtn) {
    const shouldActivate = !boldBtn.classList.contains("active");
    boldBtn.classList.toggle("active", shouldActivate);
  }

  const wrapper = getSelectedTiptapWrapper();
  const container = store.selectedElement;
  if (wrapper && container && store.selectedElementData) {
    autoResizeTextbox(wrapper, container, store.selectedElementData);
  }
}

function handleItalicClick() {
  if (!isTextFormattingFeatureEnabled(TEXT_FORMATTING_FEATURES.ITALIC)) {
    return;
  }
  pushCurrentSlideState();
  const editor = getActiveEditor();

  if (editor) {
    editor.chain().focus().toggleItalic().run();
    updateToolbarFromEditor(editor);
    return;
  }

  const executed = applyCommandToEntireElement((chain) => chain.toggleItalic());
  if (!executed) {
    return;
  }

  if (italicBtn) {
    const shouldActivate = !italicBtn.classList.contains("active");
    italicBtn.classList.toggle("active", shouldActivate);
  }

  const wrapper = getSelectedTiptapWrapper();
  const container = store.selectedElement;
  if (wrapper && container && store.selectedElementData) {
    autoResizeTextbox(wrapper, container, store.selectedElementData);
  }
}

function handleUnderlineClick() {
  if (!isTextFormattingFeatureEnabled(TEXT_FORMATTING_FEATURES.UNDERLINE)) {
    return;
  }
  pushCurrentSlideState();
  const editor = getActiveEditor();

  if (editor) {
    editor.chain().focus().toggleUnderline().run();
    updateToolbarFromEditor(editor);
    return;
  }

  const executed = applyCommandToEntireElement((chain) =>
    chain.toggleUnderline(),
  );
  if (!executed) {
    return;
  }

  if (underlineBtn) {
    const shouldActivate = !underlineBtn.classList.contains("active");
    underlineBtn.classList.toggle("active", shouldActivate);
  }

  const wrapper = getSelectedTiptapWrapper();
  const container = store.selectedElement;
  if (wrapper && container && store.selectedElementData) {
    autoResizeTextbox(wrapper, container, store.selectedElementData);
  }
}

function setTextAlignment(targetAlign) {
  const editor = getActiveEditor();
  const applyDefaults = shouldApplyDefaultFormatting(editor);

  pushCurrentSlideState();

  if (editor) {
    editor.chain().focus().setTextAlign(targetAlign).run();
    updateToolbarFromEditor(editor);
  } else {
    const executed = applyCommandToEntireElement((chain) =>
      chain.setTextAlign(targetAlign),
    );
    if (!executed) {
      return;
    }
  }

  if (!editor || applyDefaults) {
    if (store.selectedElementData) {
      store.selectedElementData.textAlign = targetAlign;
    }
    const wrapper = getSelectedTiptapWrapper();
    if (wrapper && store.selectedElementData) {
      const direction = store.selectedElementData.textDirection || "horizontal";
      wrapper.style.textAlign = mapTextAlignForDirection(
        targetAlign,
        direction,
      );
      const container = store.selectedElement;
      if (container) {
        autoResizeTextbox(wrapper, container, store.selectedElementData);
      }
    }
  }

  updateAlignmentButtons(targetAlign);
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

function setVerticalAlignment(value) {
  if (!store.selectedElementData) return;
  pushCurrentSlideState();
  store.selectedElementData.verticalAlign = value;
  const wrapper = getSelectedTiptapWrapper();
  if (wrapper) {
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.justifyContent = value;
  }
  updateVerticalAlignmentButtons(value);
}

function handleAlignTop() {
  setVerticalAlignment("flex-start");
}

function handleAlignMiddle() {
  setVerticalAlignment("center");
}

function handleAlignBottom() {
  setVerticalAlignment("flex-end");
}

function handleTextDirectionChange(e) {
  const direction = e.target.value === "vertical" ? "vertical" : "horizontal";
  pushCurrentSlideState();
  if (store.selectedElementData) {
    store.selectedElementData.textDirection = direction;
  }
  const wrapper = getSelectedTiptapWrapper();
  const container = store.selectedElement;
  if (wrapper) {
    const writingMode = textDirectionMapping[direction];
    wrapper.style.writingMode = writingMode;
    const resolvedAlign = mapTextAlignForDirection(
      store.selectedElementData?.textAlign || "left",
      direction,
    );
    wrapper.style.textAlign = resolvedAlign;
    if (container && store.selectedElementData) {
      autoResizeTextbox(wrapper, container, store.selectedElementData);
    }
  }
  if (container) {
    container.style.writingMode = textDirectionMapping[direction];
  }
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

      if (editor) {
        editor.chain().focus().setColor(chosenColor).run();
        updateToolbarFromEditor(editor);
      } else {
        const executed = applyCommandToEntireElement((chain) =>
          chain.setColor(chosenColor),
        );
        if (!executed) {
          return;
        }
      }

      updateColorButton(chosenColor);

      if (!editor || applyDefaults) {
        if (store.selectedElementData) {
          store.selectedElementData.textColor = chosenColor;
        }
        const wrapper = getSelectedTiptapWrapper();
        if (wrapper) {
          wrapper.style.color = chosenColor;
          const container = store.selectedElement;
          if (container && store.selectedElementData) {
            autoResizeTextbox(wrapper, container, store.selectedElementData);
          }
        }
      }
    },
    { allowRemove: false },
  );
}

function handleToolbarMousedown(e) {
  if (!e.target.closest("button") && !e.target.closest("select")) {
    e.preventDefault();
  }
}

function createEditorForElement(elementData, wrapper, container) {
  const editor = new Editor({
    element: wrapper,
    extensions: getTiptapExtensions(),
    content: elementData.tiptapContent || elementData.text || DEFAULT_TEXT_HTML,
    autofocus: "end",
    onUpdate: () => {
      const html = editor.getHTML();
      elementData.tiptapContent = html;
      elementData.text = html;
      if (wrapper && container) {
        autoResizeTextbox(wrapper, container, elementData);
      }
      updateToolbarFromEditor(editor);
    },
  });

  editor.on("selectionUpdate", () => {
    updateToolbarFromEditor(editor);
  });

  editor.on("transaction", () => {
    const html = editor.getHTML();
    elementData.tiptapContent = html;
    elementData.text = html;
  });

  editor.on("blur", ({ event }) => {
    const related = event?.relatedTarget || null;
    setTimeout(() => {
      const active = document.activeElement;
      const stayedInsideEditor = active?.closest?.(
        `.tiptap-text-content[data-element-id="${elementData.id}"]`,
      );
      if (stayedInsideEditor) {
        return;
      }

      if (
        related?.closest?.(".tiptap-toolbar") ||
        active?.closest?.(".tiptap-toolbar")
      ) {
        return;
      }

      if (active?.closest?.(".toolbar-general")) {
        return;
      }

      finalizeEditorForElement(elementData.id);
    }, 0);
  });

  tiptapEditors.set(elementData.id, editor);
  wrapper.setAttribute("contenteditable", "true");
  updateToolbarFromEditor(editor);
  return editor;
}

function enterEditMode(elementData, wrapper, container) {
  if (!elementData || !wrapper) return;
  const existing = tiptapEditors.get(elementData.id);
  if (existing) {
    existing.chain().focus().run();
    return;
  }
  pushCurrentSlideState();
  wrapper.innerHTML = "";
  const editor = createEditorForElement(elementData, wrapper, container);
  editor.chain().focus("end").run();
}

function finalizeEditorForElement(elementId) {
  const editor = tiptapEditors.get(elementId);
  if (!editor) return;
  const wrapper = editor.options.element;
  const html = editor.getHTML();
  const data = store.slides
    ?.flatMap((slide) => slide.elements || [])
    .find((el) => el.id === elementId);
  if (data) {
    data.tiptapContent = html;
    data.text = html;
  }
  editor.destroy();
  tiptapEditors.delete(elementId);
  if (wrapper) {
    wrapper.innerHTML = html;
    wrapper.setAttribute("contenteditable", "false");
  }
}

function addTiptapTextboxToSlide() {
  if (store.currentSlideIndex < 0) {
    showToast(gettext("Please select a slide first!"), "Info");
    return;
  }

  pushCurrentSlideState();
  const defaultFontSizeKey = "12";
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
    lineHeight: "1.2",
    letterSpacing: "normal",
    textColor: "#000000",
    fontWeight: "normal",
    textAlign: "left",
    textDirection: "horizontal",
    verticalAlign: "flex-start",
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
  fontSizeSelect?.addEventListener("change", handleFontSizeChange);
  lineHeightSelect?.addEventListener("change", handleLineHeightChange);
  letterSpacingSelect?.addEventListener("change", handleLetterSpacingChange);
  fontWeightSelect?.addEventListener("change", handleFontWeightChange);

  boldBtn?.addEventListener("click", handleBoldClick);
  italicBtn?.addEventListener("click", handleItalicClick);
  underlineBtn?.addEventListener("click", handleUnderlineClick);

  alignLeftBtn?.addEventListener("click", handleAlignLeft);
  alignCenterBtn?.addEventListener("click", handleAlignCenter);
  alignRightBtn?.addEventListener("click", handleAlignRight);

  alignTopBtn?.addEventListener("click", handleAlignTop);
  alignMiddleBtn?.addEventListener("click", handleAlignMiddle);
  alignBottomBtn?.addEventListener("click", handleAlignBottom);

  horizontalTextModeRadio?.addEventListener(
    "change",
    handleTextDirectionChange,
  );
  verticalTextModeRadio?.addEventListener("change", handleTextDirectionChange);

  textColorBtn?.addEventListener("click", handleTextColorPickerClick);

  tiptapToolbar?.addEventListener("mousedown", handleToolbarMousedown);

  if (fontSizeSelect) {
    updateFontSizeStepperState(fontSizeSelect.value);
  }
}

export function _renderTiptapTextbox(el, container, isInteractivePlayback) {
  destroyEditorForElement(el.id, true);
  const textWrapper = document.createElement("div");
  textWrapper.classList.add("text-content", "tiptap-text-content");
  textWrapper.setAttribute("spellcheck", "false");
  textWrapper.setAttribute("autocorrect", "off");
  textWrapper.setAttribute("autocapitalize", "off");
  textWrapper.dataset.elementId = String(el.id);
  textWrapper.contentEditable = "false";
  textWrapper.innerHTML = el.tiptapContent || el.text || DEFAULT_TEXT_HTML;

  applyElementStyles(el, textWrapper, container);
  autoResizeTextbox(textWrapper, container, el);

  if (
    (!isInteractivePlayback && queryParams.mode === "edit") ||
    (!isInteractivePlayback && queryParams.mode === "template_editor") ||
    (!isInteractivePlayback && queryParams.mode === "suborg_templates")
  ) {
    textWrapper.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      enterEditMode(el, textWrapper, container);
    });

    textWrapper.addEventListener("mousedown", (event) => {
      if (textWrapper.isContentEditable) {
        event.stopPropagation();
      }
    });
  }

  container.appendChild(textWrapper);
}

export function finalizeAllTiptapEditors() {
  Array.from(tiptapEditors.keys()).forEach((id) => {
    finalizeEditorForElement(id);
  });
}
