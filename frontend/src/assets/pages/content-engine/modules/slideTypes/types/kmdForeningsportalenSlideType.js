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

  // Helper method to parse double-underscore separated strings into arrays
  _parseSeparatedValues(value) {
    return (value || "").split("__").map((s) => s.trim()).filter(Boolean);
  },

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
      skipped_events: config.skipped_events || "",
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
    this.ensureSkippedEventsInput(config.skipped_events); 

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

  // Render skipped events list from hidden input value
  _renderSkippedEventsList() {
    const hidden = document.getElementById("skipped-events-input");
    const list = document.getElementById("skipped-events-list");
    if (!hidden || !list) return;

    const items = this._parseSeparatedValues(hidden.value);
    
    list.innerHTML = items.map(item => `
      <div class="d-flex align-items-center mb-1 skipped-event-item" data-value="${item}">
        <span class="badge bg-secondary py-2">${item}</span>
        <button type="button" class="btn btn-sm btn-outline-danger remove-skipped-event" aria-label="Remove">&minus;</button>
      </div>
    `).join('');
  },

  ensureSkippedEventsInput(value) {
    const container = document.getElementById("skipped-events-container");
    const existingHidden = document.getElementById("skipped-events-input");
    
    if (existingHidden) {
      existingHidden.value = value || "";
      this._renderSkippedEventsList();
      return;
    }

    if (!container) return;

    container.innerHTML = `
      <div class="mb-3">
        <label class="form-label" for="skipped-events-input-field">${gettext("Skipped Events")}</label>
        <div class="d-flex gap-2 mb-2">
          <input type="text" class="form-control" id="skipped-events-input-field" placeholder="${gettext("Add event title, press + to add")}">
          <button type="button" id="add-skipped-event-btn" class="btn btn-primary">+</button>
        </div>
        <div class="mb-2 bg-secondary-accent p-2 rounded text-black">${gettext("Events with these exact titles will be hidden from the display.")}</div>
        <div id="skipped-events-list" class="d-flex gap-2 flex-wrap"></div>
        <input type="hidden" id="skipped-events-input" value="${value || ""}">
      </div>
    `;

    this._renderSkippedEventsList();
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

    if (
      !subLocations ||
      (Array.isArray(subLocations) && subLocations.length === 0) ||
      (typeof subLocations === "object" &&
        Object.keys(subLocations).length === 0)
    ) {
      if (noLocationsMessage) {
        noLocationsMessage.textContent =
          "No sub-locations available for this location.";
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
              <label class="form-check-label" for="sub-loc-${valueStr}">
                ${valueStr}
              </label>
            </div>
          </div>
        `;
        if (multiSelectContainer)
          multiSelectContainer.insertAdjacentHTML("beforeend", checkboxHtml);
      });
    } else {
      Object.entries(subLocations).forEach(([key, value]) => {
        const isChecked = selectedSubLocations.includes(key);
        const label = value && value.name ? value.name : key;
        const checkboxHtml = `
          <div class="col-md-6 col-lg-4 mb-2">
            <div class="form-check">
              <input class="form-check-input sub_loc_box" type="checkbox" value="${key}" id="sub-loc-${key}" ${isChecked ? "checked" : ""}>
              <label class="form-check-label" for="sub-loc-${key}">
                ${label}
              </label>
            </div>
          </div>
        `;
        if (multiSelectContainer)
          multiSelectContainer.insertAdjacentHTML("beforeend", checkboxHtml);
      });
    }

    // Reset "Select All" checkbox
    const allSelector = document.querySelector("#all-selector");
    if (allSelector) allSelector.checked = false;
  },

  // Helper to add event listener with cleanup tracking
  _addListener(element, event, handler) {
    if (!element) return;
    element.addEventListener(event, handler);
    this.eventListenerCleanup.push(() => element.removeEventListener(event, handler));
  },

  // Setup listeners for skipped events section
  _setupSkippedEventsListeners() {
    const elements = {
      addBtn: document.getElementById("add-skipped-event-btn"),
      skippedField: document.getElementById("skipped-events-input"),
      skippedTextField: document.getElementById("skipped-events-input-field"),
      skippedList: document.getElementById("skipped-events-list"),
    };

    if (!elements.addBtn || !elements.skippedTextField || !elements.skippedField) return;

    const addHandler = () => {
      const val = elements.skippedTextField.value.trim();
      if (!val) return;
      
      const items = this._parseSeparatedValues(elements.skippedField.value);
      if (!items.includes(val)) {
        items.push(val);
        elements.skippedField.value = items.join("__");
        elements.skippedTextField.value = "";
        this._renderSkippedEventsList();
      }
    };

    this._addListener(elements.addBtn, "click", addHandler);
    this._addListener(elements.skippedTextField, "keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addHandler();
      }
    });

    if (elements.skippedList) {
      this._addListener(elements.skippedList, "click", (e) => {
        if (!e.target.classList.contains("remove-skipped-event")) return;
        
        const item = e.target.closest(".skipped-event-item");
        if (!item) return;
        
        const items = this._parseSeparatedValues(elements.skippedField.value)
          .filter((i) => i !== item.dataset.value);
        elements.skippedField.value = items.join("__");
        this._renderSkippedEventsList();
      });
    }

    this._renderSkippedEventsList();
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

    this._setupSkippedEventsListeners();
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
      sub_locations: (config.sub_locations || []).join("__"),
      // marquee mode
      continuous_scroll: "1",
      scroll_speed: config.scroll_speed || 5,
      skipped_events: config.skipped_events || "",
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
    const skippedEventsInput = document.getElementById("skipped-events-input");

    const subLocations = Array.from(subLocationCheckboxes).map(
      (checkbox) => checkbox.value,
    );

    return {
      location: locationSelect?.value || "",
      sub_locations: subLocations,
      // marquee-only mode
      continuous_scroll: true,
      scroll_speed: scrollSpeedInput ? Number(scrollSpeedInput.value) : 5,
      skipped_events: skippedEventsInput ? skippedEventsInput.value.trim() : "",
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
      backgroundColor: defaults.backgroundColor,
      slideTypeId: 9,
      config: config,
      integrationName: "KMD - Foreningsportalen",
    };
  },
};
