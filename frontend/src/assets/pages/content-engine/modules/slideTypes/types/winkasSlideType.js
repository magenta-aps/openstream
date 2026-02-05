// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * winkasSlideType.js
 * WinKAS Booking Display slide type definition
 ************************************************************/

import { BASE_URL } from "../../../../../utils/constants.js";
import { SlideTypeUtils } from "../slideTypeRegistry.js";
import { gettext, translateHTML } from "../../../../../utils/locales.js";

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
      // Marquee-only: we no longer offer a paginated mode, only scroll speed (1-10)
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
        "/slide-types/winkas-form",
        "WinKAS Form",
        () => {
          translateHTML(); // Translate after loading template
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

    // Inject and populate skipped events input
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

  ensureSkippedEventsInput(value) {
    // If hidden input exists, update and re-render list
    const existingHidden = document.getElementById("skipped-events-input");
    const containerPlaceholder =
      document.getElementById("skipped-events-container");

    const renderListFromHidden = () => {
      const hidden = document.getElementById("skipped-events-input");
      const list = document.getElementById("skipped-events-list");
      if (!hidden || !list) return;
      list.innerHTML = "";
      const items = (hidden.value || "").split(",").map((s) => s.trim()).filter(Boolean);
      items.forEach((it) => {
        const li = document.createElement("div");
        li.className = "d-flex align-items-center mb-1 skipped-event-item";
        li.dataset.value = it;
        li.innerHTML = `<span class=\"badge bg-secondary py-2\">${it}</span><button type=\"button\" class=\"btn btn-sm btn-outline-danger remove-skipped-event\" aria-label=\"Remove\">&minus;</button>`;
        list.appendChild(li);
      });
    };

    if (existingHidden) {
      existingHidden.value = value || "";
      // If list container exists, render from hidden
      const list = document.getElementById("skipped-events-list");
      if (list) renderListFromHidden();
      return;
    }

    // Build UI: visible input + add button, list, and hidden input for form extraction
    if (containerPlaceholder) {
      const wrapper = document.createElement("div");
      wrapper.className = "mb-3";

      const label = document.createElement("label");
      label.className = "form-label";
      label.htmlFor = "skipped-events-input-field";
      label.textContent = gettext("Skipped Events");

      const inputGroup = document.createElement("div");
      inputGroup.className = "d-flex gap-2 mb-2";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "form-control";
      input.id = "skipped-events-input-field";
      input.placeholder = gettext("Add event title, press + to add");

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.id = "add-skipped-event-btn";
      addBtn.className = "btn btn-primary";
      addBtn.innerHTML = "+";

      inputGroup.appendChild(input);
      inputGroup.appendChild(addBtn);

      const help = document.createElement("div");
      help.className = "mb-2 bg-secondary-accent p-2 rounded text-black";
      help.textContent = gettext(
        "Events with these exact titles will be hidden from the display.",
      );

      const list = document.createElement("div");
      list.id = "skipped-events-list";

      list.className = "d-flex gap-2 flex-wrap";

      // Hidden input used by existing extractFormData
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.id = "skipped-events-input";
      hidden.value = value || "";

      wrapper.appendChild(label);
      wrapper.appendChild(inputGroup);
      wrapper.appendChild(help);
      wrapper.appendChild(list);
      wrapper.appendChild(hidden);

      containerPlaceholder.appendChild(wrapper);

      renderListFromHidden();
    }
  },

  populateLocationOptions(selectedLocation) {
    const locationSelect = document.getElementById("location-input");
    if (!locationSelect || !this.currentLocationsData) return;

    locationSelect.innerHTML = `<option value="">${gettext("Select a location...")}</option>`;

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
            <label class="form-check-label" for="sub-loc-${key}">
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

    // Skipped events UI listeners (add, enter, remove)
    const addBtn = document.getElementById("add-skipped-event-btn");
    const skippedField = document.getElementById("skipped-events-input");
    const skippedTextField = document.getElementById("skipped-events-input-field");
    const skippedList = document.getElementById("skipped-events-list");

    const renderFromHidden = () => {
      if (!skippedField || !skippedList) return;
      skippedList.innerHTML = "";
      const items = (skippedField.value || "").split(",").map((s) => s.trim()).filter(Boolean);
      items.forEach((it) => {
        const li = document.createElement("div");
        li.className = "d-flex align-items-center mb-1 skipped-event-item";
        li.dataset.value = it;
        li.innerHTML = `<span class=\"badge bg-secondary py-2\">${it}</span><button type=\"button\" class=\"btn btn-sm btn-outline-danger remove-skipped-event\" aria-label=\"Remove\">&minus;</button>`;
        skippedList.appendChild(li);
      });
    };

    if (addBtn && skippedTextField && skippedField) {
      const addHandler = () => {
        const val = skippedTextField.value.trim();
        if (!val) return;
        const items = (skippedField.value || "").split(",").map((s) => s.trim()).filter(Boolean);
        if (!items.includes(val)) items.push(val);
        skippedField.value = items.join(",");
        skippedTextField.value = "";
        renderFromHidden();
      };
      addBtn.addEventListener("click", addHandler);
      this.eventListenerCleanup.push(() => addBtn.removeEventListener("click", addHandler));

      const enterHandler = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addHandler();
        }
      };
      skippedTextField.addEventListener("keydown", enterHandler);
      this.eventListenerCleanup.push(() => skippedTextField.removeEventListener("keydown", enterHandler));

      // Initial render
      renderFromHidden();
    }

    if (skippedList && skippedField) {
      const removeDelegate = (e) => {
        if (!e.target.classList.contains("remove-skipped-event")) return;
        const item = e.target.closest(".skipped-event-item");
        if (!item) return;
        const val = item.dataset.value;
        const items = (skippedField.value || "").split(",").map((s) => s.trim()).filter(Boolean).filter((i) => i !== val);
        skippedField.value = items.join(",");
        renderFromHidden();
      };
      skippedList.addEventListener("click", removeDelegate);
      this.eventListenerCleanup.push(() => skippedList.removeEventListener("click", removeDelegate));
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
      // Always use marquee (continuous scrolling)
      continuous_scroll: "1",
      scroll_speed: config.scroll_speed || 5,
      skipped_events: config.skipped_events || "",
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
    const scrollSpeedInput = document.getElementById("scroll-speed");
    const skippedEventsInput = document.getElementById("skipped-events-input");

    const subLocations = Array.from(subLocationCheckboxes).map(
      (checkbox) => checkbox.value,
    );

    return {
      location: locationSelect?.value || "",
      sub_locations: subLocations,
      // Marquee-only: always enabled
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

    // Ensure scroll speed is within the allowed 1..10 range
    if (
      isNaN(data.scroll_speed) ||
      data.scroll_speed < 1 ||
      data.scroll_speed > 10
    ) {
      alert("Please set a valid scroll speed between 1 and 10.");
      return false;
    }

    return true;
  },

  generateSlideData() {
    const config = this.extractFormData();
    const defaults = SlideTypeUtils.getDefaultSlideSettings();

    return {
      backgroundColor: defaults.backgroundColor,
      slideTypeId: 6,
      config: config,
      integrationName: "Winkas",
    };
  },
};