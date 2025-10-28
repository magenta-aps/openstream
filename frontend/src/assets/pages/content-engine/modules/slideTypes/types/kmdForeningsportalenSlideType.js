// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * kmdForeningsportalenSlideType.js
 * KMD Foreningsportalen slide type definition
 ************************************************************/

import { BASE_URL } from "../../../../../utils/constants.js";
import { gettext, translateHTML } from "../../../../../utils/locales.js";
import { SlideTypeUtils } from "../slideTypeRegistry.js";

export const KmdForeningsportalenSlideType = {
  name: "KMD - Foreningsportalen",
  description: "Display booking overview from KMD Foreningsportalen system",
  categoryId: 1,

  ...SlideTypeUtils.getDefaultSlideSettings(),

  _locationsData: null,

  async fetchLocationsData() {
    if (this._locationsData) return this._locationsData;

    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${BASE_URL}/api/kmd/locations`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch locations data: ${response.statusText}`,
        );
      }

      this._locationsData = await response.json();
      return this._locationsData;
    } catch (error) {
      console.error("Error fetching locations data:", error);
      return {};
    }
  },

  getDefaultConfig(existingConfig = {}) {
    const config = existingConfig || {};
    return {
      location: config.location || "",
      sub_locations: config.sub_locations || [],
      // Marquee-only: use infinite-marquee like WinKAS (scroll 1..10)
      scroll_speed: config.scroll_speed || 5,
    };
  },

  async generateForm(existingConfig = null) {
    try {
      const locationsData = await this.fetchLocationsData();
      this.currentLocationsData = locationsData;
      const config = this.getDefaultConfig(existingConfig);

      return await SlideTypeUtils.loadFormTemplateWithCallback(
        "/slide-types/kmd-foreningsportalen-form",
        "KMD Foreningsportalen Form",
        () => {
          translateHTML(); // Translate after loading template
          this.populateFormData(config);
          this.setupFormEventListeners();
        },
      );
    } catch (error) {
      console.error("Error generating KMD Foreningsportalen form:", error);
      return SlideTypeUtils.getErrorTemplate(
        `Could not initialize KMD Foreningsportalen form: ${error.message}`,
        "KMD Foreningsportalen Form",
      );
    }
  },

  populateFormData(config) {
    this.populateLocationOptions(config.location);
    this.updateSubLocationOptions(config.location, config.sub_locations);
    // Populate marquee (scroll speed) control
    const scrollSpeedInput = document.getElementById("scroll-speed");
    const scrollSpeedValue = document.getElementById("scroll-speed-value");

    if (scrollSpeedInput) {
      scrollSpeedInput.value = config.scroll_speed || 5;
    }
    if (scrollSpeedValue) {
      scrollSpeedValue.textContent = scrollSpeedInput
        ? scrollSpeedInput.value
        : config.scroll_speed || 5;
    }
  },

  populateLocationOptions(selectedLocation) {
    const locationSelect = document.getElementById("location-input");
    if (!locationSelect || !this.currentLocationsData) return;

    locationSelect.innerHTML = `<option value="">${gettext("Select a location...")}</option>`;

    Object.entries(this.currentLocationsData).forEach(([key, value]) => {
      const option = document.createElement("option");
      option.value = key;
      // try to match common shape: prefer location_name, fallback to name
      option.textContent = value.location_name || value.name || key;
      option.selected = key === selectedLocation;
      locationSelect.appendChild(option);
    });
  },

  updateSubLocationOptions(selectedLocation, selectedSubLocations = []) {
    const subLocationsSection = document.getElementById(
      "sub-locations-section",
    );
    const multiSelectContainer = document.getElementById(
      "multiSelectContainer",
    );
    const noLocationsMessage = document.getElementById("no-locations-message");

    if (!selectedLocation || !this.currentLocationsData[selectedLocation]) {
      if (subLocationsSection) subLocationsSection.style.display = "none";
      return;
    }

    // Show sub-locations section
    if (subLocationsSection) subLocationsSection.style.display = "block";

    // Clear existing sub-locations
    if (multiSelectContainer) multiSelectContainer.innerHTML = "";
    if (noLocationsMessage) noLocationsMessage.style.display = "none";

    const subLocations = this.currentLocationsData[selectedLocation];

    if (!subLocations || (Array.isArray(subLocations) && subLocations.length === 0) || (typeof subLocations === 'object' && Object.keys(subLocations).length === 0)) {
      if (noLocationsMessage) {
        noLocationsMessage.textContent = "No sub-locations available for this location.";
        noLocationsMessage.style.display = "block";
      }
      return;
    }

    // Create checkboxes in a grid layout
    // Support both array-of-values and object map shapes
    if (Array.isArray(subLocations)) {
      subLocations.forEach((subLocation) => {
        const valueStr = String(subLocation);
        const isChecked = selectedSubLocations.includes(valueStr);
        const checkboxHtml = `
          <div class="col-md-6 col-lg-4 mb-2">
            <div class="form-check">
              <input class="form-check-input sub_loc_box" type="checkbox" value="${valueStr}" id="sub-loc-${valueStr}" ${isChecked ? "checked" : ""}>
              <label class="form-check-label text-white" for="sub-loc-${valueStr}">
                ${valueStr}
              </label>
            </div>
          </div>
        `;
        if (multiSelectContainer) multiSelectContainer.insertAdjacentHTML("beforeend", checkboxHtml);
      });
    } else {
      Object.entries(subLocations).forEach(([key, value]) => {
        const isChecked = selectedSubLocations.includes(key);
        const label = value && value.name ? value.name : key;
        const checkboxHtml = `
          <div class="col-md-6 col-lg-4 mb-2">
            <div class="form-check">
              <input class="form-check-input sub_loc_box" type="checkbox" value="${key}" id="sub-loc-${key}" ${isChecked ? "checked" : ""}>
              <label class="form-check-label text-white" for="sub-loc-${key}">
                ${label}
              </label>
            </div>
          </div>
        `;
        if (multiSelectContainer) multiSelectContainer.insertAdjacentHTML("beforeend", checkboxHtml);
      });
    }

    // Reset "Select All" checkbox
    const allSelector = document.querySelector("#all-selector");
    if (allSelector) allSelector.checked = false;
  },

  setupFormEventListeners() {
    const locationSelect = document.getElementById("location-input");
    const allSelector = document.getElementById("all-selector");
    const scrollSpeedInput = document.getElementById("scroll-speed");
    const scrollSpeedValue = document.getElementById("scroll-speed-value");

    if (!locationSelect) {
      setTimeout(() => this.setupFormEventListeners(), 100);
      return;
    }

    // Store cleanup functions
    this.eventListenerCleanup = [];

    // Location change listener
    const locationChangeHandler = (event) => {
      this.updateSubLocationOptions(event.target.value);
    };
    locationSelect.addEventListener("change", locationChangeHandler);
    this.eventListenerCleanup.push(() =>
      locationSelect.removeEventListener("change", locationChangeHandler),
    );

    // Select all toggle listener
    if (allSelector) {
      const allSelectorHandler = (ev) => {
        const checkboxes = document.querySelectorAll(".sub_loc_box");
        checkboxes.forEach((cb) => {
          cb.checked = ev.target.checked;
        });
      };
      allSelector.addEventListener("change", allSelectorHandler);
      this.eventListenerCleanup.push(() =>
        allSelector.removeEventListener("change", allSelectorHandler),
      );
    }

    // Scroll speed listener
    if (scrollSpeedInput && scrollSpeedValue) {
      const speedHandler = (e) => {
        scrollSpeedValue.textContent = e.target.value;
      };
      scrollSpeedInput.addEventListener("input", speedHandler);
      this.eventListenerCleanup.push(() =>
        scrollSpeedInput.removeEventListener("input", speedHandler),
      );
    }
  },

  cleanupFormEventListeners() {
    if (this.eventListenerCleanup) {
      this.eventListenerCleanup.forEach((cleanup) => cleanup());
      this.eventListenerCleanup = null;
    }
    this.currentLocationsData = null;
  },

  async generateSlide(config) {
    const params = {
      location: config.location || "",
      sub_locations: (config.sub_locations || []).join(","),
      // marquee mode
      continuous_scroll: "1",
      scroll_speed: config.scroll_speed || 5,
    };

    return SlideTypeUtils.generateSlideUrl(
      "/slide-types/kmd-foreningsportalen",
      params,
      "KMD Foreningsportalen",
    );
  },

  extractFormData() {
    const locationSelect = document.getElementById("location-input");
    const subLocationCheckboxes = document.querySelectorAll(
      ".sub_loc_box:checked",
    );

    const scrollSpeedInput = document.getElementById("scroll-speed");

    const subLocations = Array.from(subLocationCheckboxes).map(
      (checkbox) => checkbox.value,
    );

    return {
      location: locationSelect?.value || "",
      sub_locations: subLocations,
      // marquee-only mode
      continuous_scroll: true,
      scroll_speed: scrollSpeedInput ? Number(scrollSpeedInput.value) : 5,
    };
  },

  validateSlide() {
    const data = this.extractFormData();

    // Check if location is selected
    if (!data.location) {
      alert("Please select a location.");
      return false;
    }

    // Check if at least one sub-location is selected
    if (!data.sub_locations || data.sub_locations.length === 0) {
      alert("Please select at least one sub-location to display bookings.");
      return false;
    }

    // ensure scroll speed is within the allowed 1..10 range (marquee)
    if (
      isNaN(data.scroll_speed) ||
      data.scroll_speed < 1 ||
      data.scroll_speed > 10
    ) {
      alert("Scroll speed must be a number between 1 (fast) and 10 (slow).");
      return false;
    }

    return true;
  },

  generateSlideData() {
    const config = this.extractFormData();
    const defaults = SlideTypeUtils.getDefaultSlideSettings();

    return {
      gridWidth: defaults.gridWidth,
      gridHeight: defaults.gridHeight,
      gridX: defaults.gridX,
      gridY: defaults.gridY,
      backgroundColor: defaults.backgroundColor,
      slideTypeId: 9,
      config: config,
      integrationName: "KMD - Foreningsportalen",
    };
  },
};
