// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * newstickerSlideType.js
 * News Ticker slide type definition
 ************************************************************/

import { BASE_URL } from "../../../../../utils/constants.js";
import { SlideTypeUtils } from "../slideTypeRegistry.js";

export const NewstickerSlideType = {
  name: "Newsticker",
  description: "Scrolling news ticker with clock and weather",
  categoryId: 3, // Newsfeed category

  ...SlideTypeUtils.getDefaultSlideSettings(),

  _weatherLocations: null,

  async fetchWeatherLocations() {
    if (this._weatherLocations) return this._weatherLocations;

    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${BASE_URL}/api/rss/weather/locations/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch weather locations: ${response.statusText}`,
        );
      }

      const data = await response.json();
      this._weatherLocations = data.locations || [];
      return this._weatherLocations;
    } catch (error) {
      console.error("Error fetching weather locations:", error);
      return [];
    }
  },

  getDefaultConfig(existingConfig = {}) {
    const config = existingConfig || {};
    return {
      showNews: config.showNews !== false,
      showClock: config.showClock !== false,
      showWeather: config.showWeather !== false,
      selectedLocation: config.selectedLocation || "",
      tickerSpeed: config.tickerSpeed || 80,
      fontSize: config.fontSize || 2,
      lightMode: config.lightMode || false,
    };
  },

  async generateForm(existingConfig = null) {
    try {
      const weatherLocations = await this.fetchWeatherLocations();
      this.currentWeatherLocations = weatherLocations;
      const config = this.getDefaultConfig(existingConfig);

      return await SlideTypeUtils.loadFormTemplateWithCallback(
        "/slide-types/newsticker-form",
        "Newsticker Form",
        () => {
          this.populateFormData(config);
          this.setupFormEventListeners();
        },
      );
    } catch (error) {
      console.error("Error generating Newsticker form:", error);
      return SlideTypeUtils.getErrorTemplate(
        `Could not initialize Newsticker form: ${error.message}`,
        "Newsticker Form",
      );
    }
  },

  populateFormData(config) {
    this.populateWeatherLocationOptions(config.selectedLocation);

    // Set form values
    this.setElementChecked("showNews-input", config.showNews);
    this.setElementChecked("showClock-input", config.showClock);
    this.setElementChecked("showWeather-input", config.showWeather);
    this.setElementChecked("lightMode-input", config.lightMode);
    this.setElementValue("ticker-speed-input", config.tickerSpeed);
    this.setElementValue("font-size-input", config.fontSize);
    this.setElementValue("weather-location-input", config.selectedLocation);
  },

  populateWeatherLocationOptions(selectedLocation) {
    const locationSelect = document.getElementById("weather-location-input");
    if (!locationSelect || !this.currentWeatherLocations) return;

    locationSelect.innerHTML = '<option value="">Select location...</option>';

    this.currentWeatherLocations.forEach((location) => {
      const option = document.createElement("option");
      option.value = location;
      option.textContent = location;
      option.selected = location === selectedLocation;
      locationSelect.appendChild(option);
    });
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
    this.currentWeatherLocations = null;
  },

  async generateSlide(config) {
    const params = {
      showNews: config.showNews || "false",
      showClock: config.showClock || "false",
      showWeather: config.showWeather || "false",
      selectedLocation: config.selectedLocation || "",
      tickerSpeed: config.tickerSpeed || "80",
      fontSize: config.fontSize || "2",
      lightMode: config.lightMode || "false",
    };

    return SlideTypeUtils.generateSlideUrl(
      "/slide-types/newsticker",
      params,
      "Newsticker",
    );
  },

  extractFormData() {
    const getElementValue = (id) => document.getElementById(id)?.value || "";
    const getElementChecked = (id) =>
      document.getElementById(id)?.checked || false;

    return {
      showNews: getElementChecked("showNews-input"),
      showClock: getElementChecked("showClock-input"),
      showWeather: getElementChecked("showWeather-input"),
      selectedLocation: getElementValue("weather-location-input"),
      tickerSpeed: Number(getElementValue("ticker-speed-input")) || 80,
      fontSize: Number(getElementValue("font-size-input")) || 2,
      lightMode: getElementChecked("lightMode-input"),
    };
  },

  validateSlide() {
    const data = this.extractFormData();

    // At least one component must be enabled
    if (!data.showNews && !data.showClock && !data.showWeather) {
      alert("Please enable at least one component (News, Clock, or Weather).");
      return false;
    }

    // If weather is enabled, location must be selected
    if (data.showWeather && !data.selectedLocation) {
      alert("Please select a weather location when weather is enabled.");
      return false;
    }

    return true;
  },

  generateSlideData() {
    const config = this.extractFormData();
    const defaults = SlideTypeUtils.getDefaultSlideSettings();

    return {
      gridWidth: 200,
      gridHeight: 12,
      gridX: 0,
      gridY: 188,
      backgroundColor: defaults.backgroundColor,
      slideTypeId: 5,
      config: config,
      integrationName: "Newsticker",
    };
  },
};
