/**
 * @typedef {Object} DomCtx
 * @property {HTMLSelectElement} weekdaySelectEl - the selection element for the weekday value
 * @property {HTMLSelectElement} daySelectEl - the selection element for the day value
 * @property {HTMLSelectElement} monthSelectEl - the selection element for the month value
 * @property {HTMLSelectElement} colorSelectEl - the selection element for the color value
 * @property {HTMLElement} colorPickerWrapperEl - the wrapper element for the custom color value
 * @property {HTMLInputElement} colorPickerEl - the input element for the color value
 * @property {HTMLSelectElement} fontSizeSelectEl - the select element for the font size value
 * @property {HTMLElement} previewEl - the preview element
 * @property {() => void} resetCtx - used for reseting the contexct between form generation
 */

import { translateHTML } from "../../../../../utils/locales";
import { createFormattedDate } from "../../../../../utils/utils";
import { SlideTypeUtils } from "../slideTypeRegistry";

/**
 * @returns {DomCtx}
 */
function initDomCtx() {
  /** @type {DomCtx} */
  const domCtxPrimitive = {
    weekdaySelectEl: undefined,
    daySelectEl: undefined,
    monthSelectEl: undefined,
    colorSelectEl: undefined,
    colorPickerWrapperEl: undefined,
    colorPickerEl: undefined,
    fontSizeSelectEl: undefined,
    previewEl: undefined,
    resetCtx() {
      this.weekdaySelectEl = undefined;
      this.daySelectEl = undefined;
      this.monthSelectEl = undefined;
      this.colorSelectEl = undefined;
      this.colorPickerWrapperEl = undefined;
      this.colorPickerEl = undefined;
      this.fontSizeSelectEl = undefined;
      this.previewEl = undefined;
    },
  };

  return {
    get weekdaySelectEl() {
      if (!domCtxPrimitive.weekdaySelectEl) {
        const weekdaySelectEl = document.getElementById(
          "date-format-weekday-select",
        );
        if (!(weekdaySelectEl instanceof HTMLSelectElement)) {
          console.error("Expected select element");
          return;
        }

        domCtxPrimitive.weekdaySelectEl = weekdaySelectEl;
      }

      return domCtxPrimitive.weekdaySelectEl;
    },

    get daySelectEl() {
      if (!domCtxPrimitive.daySelectEl) {
        const daySelectEl = document.getElementById("date-format-day-select");
        if (!(daySelectEl instanceof HTMLSelectElement)) {
          console.error("Expected select element");
          return;
        }

        domCtxPrimitive.daySelectEl = daySelectEl;
      }

      return domCtxPrimitive.daySelectEl;
    },

    get monthSelectEl() {
      if (!domCtxPrimitive.monthSelectEl) {
        const monthSelectEl = document.getElementById(
          "date-format-month-select",
        );
        if (!(monthSelectEl instanceof HTMLSelectElement)) {
          console.error("Expected select element");
          return;
        }

        domCtxPrimitive.monthSelectEl = monthSelectEl;
      }

      return domCtxPrimitive.monthSelectEl;
    },

    get colorSelectEl() {
      if (!domCtxPrimitive.colorSelectEl) {
        const colorSelectEl = document.getElementById("date-color-select");
        if (!(colorSelectEl instanceof HTMLSelectElement)) {
          console.error("Expected select element");
          return;
        }

        domCtxPrimitive.colorSelectEl = colorSelectEl;
      }

      return domCtxPrimitive.colorSelectEl;
    },

    get colorPickerWrapperEl() {
      if (!domCtxPrimitive.colorPickerWrapperEl) {
        const colorPickerWrapperEl = document.getElementById(
          "date-color-picker-wrapper",
        );
        domCtxPrimitive.colorPickerWrapperEl = colorPickerWrapperEl;
      }

      return domCtxPrimitive.colorPickerWrapperEl;
    },

    get colorPickerEl() {
      if (!domCtxPrimitive.colorPickerEl) {
        const colorPickerEl = document.getElementById("date-color-picker");
        if (!(colorPickerEl instanceof HTMLInputElement)) {
          console.error("Expected input element");
          return;
        }

        domCtxPrimitive.colorPickerEl = colorPickerEl;
      }

      return domCtxPrimitive.colorPickerEl;
    },

    get fontSizeSelectEl() {
      if (!domCtxPrimitive.fontSizeSelectEl) {
        const fontSizeSelectEl = document.getElementById(
          "date-font-size-select",
        );
        if (!(fontSizeSelectEl instanceof HTMLSelectElement)) {
          console.error("Expected select element");
          return;
        }

        domCtxPrimitive.fontSizeSelectEl = fontSizeSelectEl;
      }

      return domCtxPrimitive.fontSizeSelectEl;
    },

    get previewEl() {
      if (!domCtxPrimitive.previewEl) {
        domCtxPrimitive.previewEl = document.getElementById(
          "date-format-preview",
        );
      }

      return domCtxPrimitive.previewEl;
    },
    resetCtx() {
      domCtxPrimitive.resetCtx();
    },
  };
}

/** @typedef {"narrow" | "short" | "long"} WeekdayValues */
/** @typedef {"2-digit" | "numeric"} DayValues */
/** @typedef {"narrow" | "short" | "long" | "2-digit" | "numeric"} MonthValues */

/**
 * @typedef {Object} CurrentData
 * @property {WeekdayValues} [CurrentData.weekday]
 * @property {DayValues} [CurrentData.day]
 * @property {MonthValues} [CurrentData.month]
 * @property {string} [CurrentData.color]
 * @property {string} [CurrentData.fontSize]
 */

/**
 * @returns {CurrentData}
 */
function initCurrentData() {
  /** @type {CurrentData} */
  const currentDataPrimitive = {
    weekday: undefined,
    day: undefined,
    month: undefined,
    color: undefined,
    fontSize: undefined,
  };

  return {
    get weekday() {
      return currentDataPrimitive.weekday;
    },

    set weekday(value) {
      // if the value is taken from a element value, then we need to check and cant depend on types
      if (value?.length === 0) {
        currentDataPrimitive.weekday = undefined;
        return;
      }
      if (!["narrow", "short", "long"].includes(value)) {
        console.error(
          "Expected string value to have characters equal to a weekday value",
        );
        return;
      }

      currentDataPrimitive.weekday = value;
    },

    get day() {
      return currentDataPrimitive.day;
    },

    set day(value) {
      // if the value is taken from a element value, then we need to check and cant depend on types
      if (value?.length === 0) {
        currentDataPrimitive.day = undefined;
        return;
      }
      if (!["2-digit", "numeric"].includes(value)) {
        console.error(
          "Expected string value to have characters equal to a day value",
        );
        return;
      }

      currentDataPrimitive.day = value;
    },

    get month() {
      return currentDataPrimitive.month;
    },

    set month(value) {
      // if the value is taken from a element value, then we need to check and cant depend on types
      if (value?.length === 0) {
        currentDataPrimitive.month = undefined;
        return;
      }
      if (!["2-digit", "numeric", "narrow", "short", "long"].includes(value)) {
        console.error(
          "Expected string value to have characters equal to a day value",
        );
        return;
      }

      currentDataPrimitive.month = value;
    },
  };
}

export const DateSlideType = {
  name: "Date",
  description: "Date wiget with formatting functionality",
  categoryId: 4,

  /** @type {DomCtx} */
  _domCtx: initDomCtx(),
  /** @type {CurrentData} */
  _currentData: initCurrentData(),

  // Slidetype functions

  async generateForm(existingConfig = null) {
    return await SlideTypeUtils.loadFormTemplateWithCallback(
      "/slide-types/date-form",
      "Date Form",
      () => {
        translateHTML();
        this.initDateWidget();
      },
    );
  },

  /**
   * @returns {CurrentData}
   */
  extractFormData() {
    return this._currentData;
  },

  validateSlide() {
    const data = this.extractFormData();
    if (!data.weekday && !data.day && !data.month) {
      alert(
        "Please select at least one value for either 'day of week', 'day' or 'month'.",
      );

      return false;
    }

    return true;
  },

  /**
   * @param {CurrentData} config
   */
  generateSlide(config) {
    /** @type {CurrentData} */
    const params = {
      color: config.color,
      fontSize: config.fontSize,
    };

    if (config.weekday) {
      params.weekday = config.weekday;
    }
    if (config.day) {
      params.day = config.day;
    }
    if (config.month) {
      params.month = config.month;
    }

    return SlideTypeUtils.generateSlideUrl(
      "/slide-types/date",
      params,
      "Date widget",
    );
  },

  generateSlideData() {
    return {
      ...SlideTypeUtils.getDefaultSlideSettings(),
      backgroundColor: "transparent",
    };
  },

  cleanupFormEventListeners() {
    // get elements
    const weekdaySelectEl = this._domCtx.weekdaySelectEl;
    const daySelectEl = this._domCtx.daySelectEl;
    const monthSelectEl = this._domCtx.monthSelectEl;
    const colorSelectEl = this._domCtx.colorSelectEl;
    const colorPickerEl = this._domCtx.colorPickerEl;

    // remove listeners
    weekdaySelectEl.removeEventListener("change", setWeekday);
    daySelectEl.removeEventListener("change", setDay);
    monthSelectEl.removeEventListener("change", setMonth);
    colorSelectEl.removeEventListener("change", setColorFromSelect);
    colorPickerEl.removeEventListener("change", setColorFromPicker);
  },

  // component functions

  initDateWidget() {
    // reset between inits
    this._domCtx.resetCtx();
    // date format
    const weekdaySelectEl = this._domCtx.weekdaySelectEl;
    // @ts-ignore-error - weekday select element value is a string, the value is checked in the .weekday select
    this._currentData.weekday = weekdaySelectEl.value;
    weekdaySelectEl.addEventListener("change", setWeekday);

    const daySelectEl = this._domCtx.daySelectEl;
    // @ts-ignore-error - day select element value is a string, the value is checked in the .day select
    this._currentData.day = daySelectEl.value;
    daySelectEl.addEventListener("change", setDay);

    const monthSelectEl = this._domCtx.monthSelectEl;
    // @ts-ignore-error - month select element value is a string, the value is checked in the .month select
    this._currentData.month = monthSelectEl.value;
    monthSelectEl.addEventListener("change", setMonth);

    // color
    const colorSelectEl = this._domCtx.colorSelectEl;
    this._currentData.color = colorSelectEl.value;
    colorSelectEl.addEventListener("change", setColorFromSelect);

    const colorPickerEl = this._domCtx.colorPickerEl;
    colorPickerEl.addEventListener("change", setColorFromPicker);

    // font size
    const fontSizeEl = this._domCtx.fontSizeSelectEl;
    this._currentData.fontSize = fontSizeEl.value;
    fontSizeEl.addEventListener("change", setFontSize);

    // initial render of preview
    this.updatePreview();
  },

  /**
   * @description
   * Will set the color value, expected to be called by an event listener function
   * @param {string} value
   */
  setWeekday(value) {
    // @ts-ignore-error - weekday select element value is a string, the value is checked in the .weekday select
    this._currentData.weekday = value;
    this.updatePreview();
  },

  /**
   * @description
   * Will set the color value, expected to be called by an event listener function
   * @param {string} value
   */
  setDay(value) {
    // @ts-ignore-error - day select element value is a string, the value is checked in the .day select
    this._currentData.day = value;
    this.updatePreview();
  },

  /**
   * @description
   * Will set the color value, expected to be called by an event listener function
   * @param {string} value
   */
  setMonth(value) {
    // @ts-ignore-error - month select element value is a string, the value is checked in the .month select
    this._currentData.month = value;
    this.updatePreview();
  },

  /**
   * @description
   * Will set the color value, expected to be called by an event listener function
   * @param {string} value
   */
  setColorFromSelect(value) {
    const colorPickerWrapperEl = this._domCtx.colorPickerWrapperEl;
    if (value === "custom") {
      colorPickerWrapperEl.classList.remove("d-none");
      this._currentData.color = this._domCtx.colorPickerEl.value;
    } else {
      // if picker was enabled ealier we remove it
      colorPickerWrapperEl.classList.add("d-none");

      this._currentData.color = value;
    }

    this.updatePreview();
  },

  /**
   * @description
   * Will set the color value, expected to be called by an event listener function
   * @param {string} value
   */
  setColorFromPicker(value) {
    this._currentData.color = value;
    this.updatePreview();
  },

  /**
   * @description
   * Will set the font size value, expected to be called by an event listener function
   * @param {string} value
   */
  setFontSize(value) {
    this._currentData.fontSize = value;
    this.updatePreview();
  },

  updatePreview() {
    const previewEl = this._domCtx.previewEl;
    let text = null;

    if (
      !this._currentData.weekday &&
      !this._currentData.day &&
      !this._currentData.month
    ) {
      text = "Please select a format for the date";
    } else {
      text = createFormattedDate({
        weekday: this._currentData.weekday,
        day: this._currentData.day,
        month: this._currentData.month,
      });
    }

    previewEl.textContent = text;
    previewEl.style.color = this._currentData.color;
    previewEl.style.fontSize = `${this._currentData.fontSize}px`;
  },
};

// Event listeners

/**
 * @param {Event} event
 */
function setWeekday(event) {
  // expecting a select element
  const target = /** @type {HTMLSelectElement} */ (event.target);

  DateSlideType.setWeekday(target.value);
}

/**
 * @param {Event} event
 */
function setDay(event) {
  // expecting a select element
  const target = /** @type {HTMLSelectElement} */ (event.target);

  DateSlideType.setDay(target.value);
}

/**
 * @param {Event} event
 */
function setMonth(event) {
  // expecting a select element
  const target = /** @type {HTMLSelectElement} */ (event.target);

  DateSlideType.setMonth(target.value);
}

/**
 * @param {Event} event
 */
function setColorFromSelect(event) {
  // expecting a select element
  const target = /** @type {HTMLSelectElement} */ (event.target);

  DateSlideType.setColorFromSelect(target.value);
}

/**
 * @param {Event} event
 */
function setColorFromPicker(event) {
  // expecting a select element
  const target = /** @type {HTMLSelectElement} */ (event.target);

  DateSlideType.setColorFromPicker(target.value);
}

/**
 * @param {Event} event
 */
function setFontSize(event) {
  // expecting a select element
  const target = /** @type {HTMLSelectElement} */ (event.target);

  DateSlideType.setFontSize(target.value);
}
