// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * winkasSlideType.js
 * WinKAS Booking Display slide type definition
 ************************************************************/

import { BASE_URL } from "../../../../../utils/constants.js";
import { SlideTypeUtils } from "../slideTypeRegistry.js";

export const WinkasSlideType = {
  name: "WinKAS - Bookingoversigt",
  description: "Display booking overview from WinKAS system",
  categoryId: 1,

  ...SlideTypeUtils.getDefaultSlideSettings(),

  _locationsData: null,

  async fetchLocationsData() {
    if (this._locationsData) return this._locationsData;

    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${BASE_URL}/api/winkas/locations`, {
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
      // New continuous scrolling options
      continuous_scroll: config.continuous_scroll || false,
      scroll_speed: config.scroll_speed || 100,
    };
  },

  async generateForm(existingConfig = null) {
    try {
      const locationsData = await this.fetchLocationsData();
      this.currentLocationsData = locationsData;
      const config = this.getDefaultConfig(existingConfig);

      return await SlideTypeUtils.loadFormTemplateWithCallback(
        "/slide-types/winkas-form",
        "WinKAS Form",
        () => {
          this.populateFormData(config);
          this.setupFormEventListeners();
        },
      );
    } catch (error) {
      console.error("Error generating WinKAS form:", error);
      return SlideTypeUtils.getErrorTemplate(
        `Could not initialize WinKAS form: ${error.message}`,
        "WinKAS Form",
      );
    }
  },

  populateFormData(config) {
    this.populateLocationOptions(config.location);
    this.updateSubLocationOptions(config.location, config.sub_locations);
    // Populate continuous scroll settings
    const continuousToggle = document.getElementById(
      "continuous-scroll-toggle",
    );
    const scrollSettings = document.getElementById(
      "continuous-scroll-settings",
    );
    const scrollSpeedInput = document.getElementById("scroll-speed");
    const scrollSpeedValue = document.getElementById("scroll-speed-value");

    if (continuousToggle) {
      continuousToggle.checked = !!config.continuous_scroll;
    }
    if (scrollSettings) {
      scrollSettings.style.display = config.continuous_scroll
        ? "block"
        : "none";
    }
    if (scrollSpeedInput) {
      scrollSpeedInput.value = config.scroll_speed || 100;
    }
    if (scrollSpeedValue) {
      scrollSpeedValue.textContent = scrollSpeedInput
        ? scrollSpeedInput.value
        : config.scroll_speed || 100;
    }
  },

  populateLocationOptions(selectedLocation) {
    const locationSelect = document.getElementById("location-input");
    if (!locationSelect || !this.currentLocationsData) return;

    locationSelect.innerHTML = '<option value="">Select a location...</option>';

    Object.entries(this.currentLocationsData).forEach(([key, value]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = value.location_name;
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

    const bookables = this.currentLocationsData[selectedLocation]["bookables"];

    if (!bookables || Object.keys(bookables).length === 0) {
      if (noLocationsMessage) {
        noLocationsMessage.textContent =
          "No sub-locations available for this location.";
        noLocationsMessage.style.display = "block";
      }
      return;
    }

    // Create checkboxes in a grid layout
    Object.entries(bookables).forEach(([key, value]) => {
      const isChecked = selectedSubLocations.includes(key);
      const checkboxHtml = `
        <div class="col-md-6 col-lg-4 mb-2">
          <div class="form-check">
            <input class="form-check-input sub_loc_box" type="checkbox" value="${key}" id="sub-loc-${key}" ${isChecked ? "checked" : ""}>
            <label class="form-check-label text-white" for="sub-loc-${key}">
              ${value.name}
            </label>
          </div>
        </div>
      `;
      if (multiSelectContainer) {
        multiSelectContainer.insertAdjacentHTML("beforeend", checkboxHtml);
      }
    });

    // Reset "Select All" checkbox
    const allSelector = document.querySelector("#all-selector");
    if (allSelector) allSelector.checked = false;
  },

  setupFormEventListeners() {
    const locationSelect = document.getElementById("location-input");
    const allSelector = document.getElementById("all-selector");

    const continuousToggle = document.getElementById(
      "continuous-scroll-toggle",
    );
    const scrollSettings = document.getElementById(
      "continuous-scroll-settings",
    );
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
      const toggleAllHandler = () => {
        const allStatus = allSelector.checked;
        document.querySelectorAll("input.sub_loc_box").forEach((ele) => {
          ele.checked = allStatus;
        });
      };
      allSelector.addEventListener("click", toggleAllHandler);
      this.eventListenerCleanup.push(() =>
        allSelector.removeEventListener("click", toggleAllHandler),
      );
    }

    // Continuous scroll toggle listener
    if (continuousToggle) {
      const toggleHandler = (e) => {
        const enabled = e.target.checked;
        if (scrollSettings)
          scrollSettings.style.display = enabled ? "block" : "none";
      };
      continuousToggle.addEventListener("change", toggleHandler);
      this.eventListenerCleanup.push(() =>
        continuousToggle.removeEventListener("change", toggleHandler),
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
      continuous_scroll: config.continuous_scroll ? "1" : "0",
      scroll_speed: config.scroll_speed || 100,
    };

    return SlideTypeUtils.generateSlideUrl(
      "/slide-types/winkas",
      params,
      "WinKAS Bookings",
    );
  },

  extractFormData() {
    const locationSelect = document.getElementById("location-input");
    const subLocationCheckboxes = document.querySelectorAll(
      ".sub_loc_box:checked",
    );

    const continuousToggle = document.getElementById(
      "continuous-scroll-toggle",
    );
    const scrollSpeedInput = document.getElementById("scroll-speed");

    const subLocations = Array.from(subLocationCheckboxes).map(
      (checkbox) => checkbox.value,
    );

    return {
      location: locationSelect?.value || "",
      sub_locations: subLocations,
      continuous_scroll: continuousToggle ? !!continuousToggle.checked : false,
      scroll_speed: scrollSpeedInput ? Number(scrollSpeedInput.value) : 100,
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

    // If continuous scrolling is enabled, ensure scroll speed is within bounds
    if (data.continuous_scroll) {
      if (isNaN(data.scroll_speed) || data.scroll_speed <= 0) {
        alert("Please set a valid scroll speed for continuous scrolling.");
        return false;
      }
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
      slideTypeId: 11,
      config: config,
      integrationName: "WinKAS - Bookingoversigt",
    };
  },
};
