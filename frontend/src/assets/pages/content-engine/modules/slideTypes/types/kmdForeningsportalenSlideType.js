// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * kmdForeningsportalenSlideType.js
 * KMD Foreningsportalen slide type definition
 ************************************************************/

import { BASE_URL } from "../../../../../utils/constants.js";
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
  },

  populateLocationOptions(selectedLocation) {
    const locationSelect = document.getElementById("location-input");
    if (!locationSelect || !this.currentLocationsData) return;

    locationSelect.innerHTML = '<option value="">Select a location...</option>';

    Object.keys(this.currentLocationsData).forEach((location) => {
      const option = document.createElement("option");
      option.value = location;
      option.textContent = location;
      option.selected = location === selectedLocation;
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

    if (!subLocations || subLocations.length === 0) {
      if (noLocationsMessage) {
        noLocationsMessage.textContent =
          "No sub-locations available for this location.";
        noLocationsMessage.style.display = "block";
      }
      return;
    }

    // Create checkboxes in a grid layout
    subLocations.forEach((subLocation) => {
      const isChecked = selectedSubLocations.includes(subLocation);
      const checkboxHtml = `
        <div class="col-md-6 col-lg-4 mb-2">
          <div class="form-check">
            <input class="form-check-input sub_loc_box" type="checkbox" value="${subLocation}" id="sub-loc-${subLocation}" ${isChecked ? "checked" : ""}>
            <label class="form-check-label text-white" for="sub-loc-${subLocation}">
              ${subLocation}
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

    const subLocations = Array.from(subLocationCheckboxes).map(
      (checkbox) => checkbox.value,
    );

    return {
      location: locationSelect?.value || "",
      sub_locations: subLocations,
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
