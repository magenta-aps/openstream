/**
 * @typedef {Object} DomCtx
 * @property {HTMLElement} weekdayCheckbox
 * @property {HTMLElement} dayCheckbox
 * @property {HTMLElement} monthCheckbox
 * @property {HTMLElement} preview
 */

/**
 * @returns {DomCtx}
 */
function initDomCtx() {
  /** @type {DomCtx} */
  const domCtxPrimitive = {
    weekdayCheckbox: null,
    dayCheckbox: null,
    monthCheckbox: null,
    preview: null,
  };

  return {
    get weekdayCheckbox() {
      if (!domCtxPrimitive.weekdayCheckbox) {
        domCtxPrimitive.weekdayCheckbox = document.getElementById(
          "date-format-weekday",
        );
      }

      return domCtxPrimitive.weekdayCheckbox;
    },

    get dayCheckbox() {
      if (!domCtxPrimitive.dayCheckbox) {
        domCtxPrimitive.dayCheckbox = document.getElementById(
          "date-format-checkbox-date",
        );
      }

      return domCtxPrimitive.dayCheckbox;
    },

    get monthCheckbox() {
      if (!domCtxPrimitive.monthCheckbox) {
        domCtxPrimitive.monthCheckbox = document.getElementById(
          "date-format-checkbox-month",
        );
      }

      return domCtxPrimitive.monthCheckbox;
    },

    get preview() {
      if (!domCtxPrimitive.preview) {
        domCtxPrimitive.preview = document.getElementById(
          "date-format-preview",
        );
      }

      return domCtxPrimitive.preview;
    },
  };
}

/**
 * @typedef {Object} CurrentData
 * @property {Object} CurrentData.weekday
 * @property {boolean} CurrentData.weekday.isEnabled
 * @property {"short" | "long"} CurrentData.weekday.mode
 * @property {Object} CurrentData.day
 * @property {boolean} CurrentData.day.isEnabled
 * @property {"short" | "long"} CurrentData.day.mode
 * @property {Object} CurrentData.month
 * @property {boolean} CurrentData.month.isEnabled
 * @property {"short" | "long"} CurrentData.month.mode
 */

export const DateSlideType = {
  /** @type {DomCtx} */
  _domCtx: null,
  /** @type {CurrentData} */
  _currentData: null,

  // Slidetype functions

  generateForm(existingConfig = null) {},

  extractFormData() {},

  generateSlide() {},

  generateSlideDatA() {},
};
