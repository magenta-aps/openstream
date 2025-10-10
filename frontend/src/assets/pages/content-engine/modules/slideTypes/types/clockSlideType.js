// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * clockSlideType.js
 * Clock Widget slide type definition
 ************************************************************/

import { SlideTypeUtils } from "../slideTypeRegistry.js";

export const ClockSlideType = {
  name: "Clock",
  description: "Digital clock widget that updates every second",
  categoryId: 4, // Widgets category

  ...SlideTypeUtils.getDefaultSlideSettings(),

  getDefaultConfig(existingConfig = {}) {
    const config = existingConfig || {};
    return {
      color: config.color || "white",
      size: config.size || 100,
    };
  },

  async generateForm(existingConfig = null) {
    try {
      const config = this.getDefaultConfig(existingConfig);

      return await SlideTypeUtils.loadFormTemplateWithCallback(
        "/slide-types/clock-form",
        "Clock Form",
        () => {
          this.populateFormData(config);
          this.setupFormEventListeners();
        },
      );
    } catch (error) {
      console.error("Error generating Clock form:", error);
      return SlideTypeUtils.getErrorTemplate(
        `Could not initialize Clock form: ${error.message}`,
        "Clock Form",
      );
    }
  },

  populateFormData(config) {
    // Set color selection
    const colorSelect = document.getElementById("choose-color");
    const customColorSection = document.getElementById("custom-color-section");
    const customColorPicker = document.getElementById("custom-color-picker");

    if (colorSelect) {
      // Check if the color is a standard option
      const isStandardColor = [...colorSelect.options].some(
        (opt) => opt.value === config.color,
      );

      if (isStandardColor) {
        colorSelect.value = config.color;
        if (customColorSection) customColorSection.style.display = "none";
      } else {
        // It's a custom color
        colorSelect.value = "custom";
        if (customColorSection) customColorSection.style.display = "block";
        if (customColorPicker) customColorPicker.value = config.color;
      }
    }

    // Set size
    this.setElementValue("clock-size-input", config.size);

    // Update preview
    this.updatePreviewColor(config.color);
  },

  setElementValue(selector, value) {
    const element =
      document.getElementById(selector) || document.querySelector(selector);
    if (element) element.value = value;
  },

  updatePreviewColor(color) {
    const clockPreview = document.getElementById("clock-preview");
    if (clockPreview) {
      clockPreview.style.color = color;
    }
  },

  updateClockPreview() {
    const clockPreview = document.getElementById("clock-preview");
    if (!clockPreview) return;

    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    let seconds = now.getSeconds();

    hours = hours < 10 ? "0" + hours : hours;
    minutes = minutes < 10 ? "0" + minutes : minutes;
    seconds = seconds < 10 ? "0" + seconds : seconds;

    clockPreview.textContent = `${hours}:${minutes}:${seconds}`;
  },

  setupFormEventListeners() {
    const colorSelect = document.getElementById("choose-color");
    const customColorSection = document.getElementById("custom-color-section");
    const customColorPicker = document.getElementById("custom-color-picker");

    if (!colorSelect) {
      setTimeout(() => this.setupFormEventListeners(), 100);
      return;
    }

    // Show/hide custom color picker based on selection
    this.colorSelectListener = SlideTypeUtils.setupEventListener(
      "choose-color",
      "change",
      (event) => {
        if (event.target.value === "custom") {
          if (customColorSection) customColorSection.style.display = "block";
          this.updatePreviewColor(customColorPicker?.value || "#ffffff");
        } else {
          if (customColorSection) customColorSection.style.display = "none";
          this.updatePreviewColor(event.target.value);
        }
      },
      this,
    );

    // Update preview when custom color changes
    this.customColorListener = SlideTypeUtils.setupEventListener(
      "custom-color-picker",
      "input",
      (event) => {
        if (colorSelect.value === "custom") {
          this.updatePreviewColor(event.target.value);
        }
      },
      this,
    );

    // Start preview clock updates
    this.updateClockPreview();
    this.clockInterval = setInterval(() => this.updateClockPreview(), 1000);
  },

  cleanupFormEventListeners() {
    if (this.colorSelectListener) {
      this.colorSelectListener.cleanup();
      this.colorSelectListener = null;
    }
    if (this.customColorListener) {
      this.customColorListener.cleanup();
      this.customColorListener = null;
    }
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
  },

  async generateSlide(config) {
    const params = {
      color: config.color || "white",
      size: config.size || "100",
    };

    return SlideTypeUtils.generateSlideUrl(
      "/slide-types/clock",
      params,
      "Clock",
    );
  },

  extractFormData() {
    const colorSelect = document.getElementById("choose-color");
    const customColorPicker = document.getElementById("custom-color-picker");
    const sizeInput = document.getElementById("clock-size-input");

    let color = "white";
    if (colorSelect) {
      if (colorSelect.value === "custom") {
        color = customColorPicker?.value || "#ffffff";
      } else {
        color = colorSelect.value;
      }
    }

    const size = parseInt(sizeInput?.value) || 100;

    return {
      color: color,
      size: size,
    };
  },

  validateSlide() {
    const data = this.extractFormData();

    // Basic validation - color should be set
    if (!data.color) {
      alert("Please select a color for the clock.");
      return false;
    }

    return true;
  },

  generateSlideData() {
    const config = this.extractFormData();

    return {
      gridWidth: 46,
      gridHeight: 25,
      gridX: 1,
      gridY: 1,
      backgroundColor: "transparent",
      slideTypeId: 7,
      config: config,
      integrationName: "Clock",
    };
  },
};
