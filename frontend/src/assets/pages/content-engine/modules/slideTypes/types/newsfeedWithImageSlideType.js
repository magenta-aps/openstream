// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * newsfeedWithImageSlideType.js
 * Newsfeed with Image slide type definition
 ************************************************************/

import { translateHTML } from "../../../../../utils/locales.js";
import { SlideTypeUtils } from "../slideTypeRegistry.js";

export const NewsfeedWithImageSlideType = {
  name: "Newsfeed with Image",
  description: "DR-style news carousel with optional weather and clock",
  categoryId: 3, // Newsfeed category

  ...SlideTypeUtils.getDefaultSlideSettings(),

  getDefaultConfig(existingConfig = {}) {
    const config = existingConfig || {};
    return {
      textColor: config.textColor || "#ffffff",
      backgroundColor: config.backgroundColor || "#000000",
      includeClock: config.includeClock !== false,
      includeWeather: config.includeWeather !== false,
      titleFontSize: config.titleFontSize || 2.5,
      descriptionFontSize: config.descriptionFontSize || 1.25,
      categoryFontSize: config.categoryFontSize || 0.875,
      clockFontSize: config.clockFontSize || 1.75,
      weatherFontSize: config.weatherFontSize || 1.25,
      storyDuration: config.storyDuration || 10,
    };
  },

  async generateForm(existingConfig = null) {
    try {
      const config = this.getDefaultConfig(existingConfig);

      return await SlideTypeUtils.loadFormTemplateWithCallback(
        "/slide-types/newsfeed-with-image-form",
        "Newsfeed with Image Form",
        () => {
          translateHTML(); // Translate after loading template
          this.populateFormData(config);
          this.setupFormEventListeners();
        },
      );
    } catch (error) {
      console.error("Error generating Newsfeed with Image form:", error);
      return SlideTypeUtils.getErrorTemplate(
        `Could not initialize Newsfeed with Image form: ${error.message}`,
        "Newsfeed with Image Form",
      );
    }
  },

  populateFormData(config) {
    // Set color inputs
    this.setElementValue("text-color", config.textColor);
    this.setElementValue("background-color", config.backgroundColor);

    // Set checkboxes
    this.setElementChecked("include-clock", config.includeClock);
    this.setElementChecked("include-weather", config.includeWeather);

    // Set font sizes
    this.setElementValue("title-font-size", config.titleFontSize);
    this.setElementValue("description-font-size", config.descriptionFontSize);
    this.setElementValue("category-font-size", config.categoryFontSize);
    this.setElementValue("clock-font-size", config.clockFontSize);
    this.setElementValue("weather-font-size", config.weatherFontSize);

    // Set duration
    this.setElementValue("story-duration", config.storyDuration);
  },

  setElementValue(selector, value) {
    const element =
      document.getElementById(selector) || document.querySelector(selector);
    if (element) element.value = value;
  },

  setElementChecked(selector, checked) {
    const element =
      document.getElementById(selector) || document.querySelector(selector);
    if (element) element.checked = checked;
  },

  setupFormEventListeners() {
    // No specific event listeners needed for this slide type
    // but keeping the structure for consistency
  },

  cleanupFormEventListeners() {
    // No cleanup needed for this slide type
  },

  async generateSlide(config) {
    const params = {
      textColor: config.textColor || "#ffffff",
      backgroundColor: config.backgroundColor || "#000000",
      includeClock: config.includeClock ? "true" : "false",
      includeWeather: config.includeWeather ? "true" : "false",
      titleFontSize: config.titleFontSize || "2.5",
      descriptionFontSize: config.descriptionFontSize || "1.25",
      categoryFontSize: config.categoryFontSize || "0.875",
      clockFontSize: config.clockFontSize || "1.75",
      weatherFontSize: config.weatherFontSize || "1.25",
      storyDuration: config.storyDuration || "10",
    };

    return SlideTypeUtils.generateSlideUrl(
      "/slide-types/newsfeed-with-image",
      params,
      "Newsfeed with Image",
    );
  },

  extractFormData() {
    const getElementValue = (id) => document.getElementById(id)?.value || "";
    const getElementChecked = (id) =>
      document.getElementById(id)?.checked || false;

    return {
      textColor: getElementValue("text-color") || "#ffffff",
      backgroundColor: getElementValue("background-color") || "#000000",
      includeClock: getElementChecked("include-clock"),
      includeWeather: getElementChecked("include-weather"),
      titleFontSize: parseFloat(getElementValue("title-font-size")) || 2.5,
      descriptionFontSize:
        parseFloat(getElementValue("description-font-size")) || 1.25,
      categoryFontSize:
        parseFloat(getElementValue("category-font-size")) || 0.875,
      clockFontSize: parseFloat(getElementValue("clock-font-size")) || 1.75,
      weatherFontSize: parseFloat(getElementValue("weather-font-size")) || 1.25,
      storyDuration: parseInt(getElementValue("story-duration")) || 10,
    };
  },

  validateSlide() {
    const data = this.extractFormData();

    // Validate story duration
    if (data.storyDuration < 3 || data.storyDuration > 30) {
      alert("Story duration must be between 3 and 30 seconds.");
      return false;
    }

    // Validate font sizes
    const fontSizeValidations = [
      { value: data.titleFontSize, min: 1, max: 4, name: "Title font size" },
      {
        value: data.descriptionFontSize,
        min: 0.75,
        max: 2,
        name: "Description font size",
      },
      {
        value: data.categoryFontSize,
        min: 0.5,
        max: 1.5,
        name: "Category font size",
      },
      { value: data.clockFontSize, min: 0.75, max: 3, name: "Clock font size" },
      {
        value: data.weatherFontSize,
        min: 0.75,
        max: 2,
        name: "Weather font size",
      },
    ];

    for (const validation of fontSizeValidations) {
      if (
        validation.value < validation.min ||
        validation.value > validation.max
      ) {
        alert(
          `${validation.name} must be between ${validation.min} and ${validation.max} rem.`,
        );
        return false;
      }
    }

    return true;
  },

  generateSlideData() {
    const config = this.extractFormData();

    return {
      gridWidth: 100,
      gridHeight: 200,
      gridX: 0,
      gridY: 0,
      backgroundColor: "transparent",
      slideTypeId: 3,
      config: config,
      integrationName: "Newsfeed with Image",
    };
  },
};
