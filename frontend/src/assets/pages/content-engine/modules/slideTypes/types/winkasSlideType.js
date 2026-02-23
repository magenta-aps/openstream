// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * winkasSlideType.js
 * WinKAS Booking Display slide type definition
 ************************************************************/

import { BASE_URL } from "../../../../../utils/constants.js";
import { SlideTypeUtils } from "../slideTypeRegistry.js";
import { gettext, translateHTML } from "../../../../../utils/locales.js";

const skipSeparator = "__OS_SEPARATOR__";

export const WinkasSlideType = {
  name: "WinKAS - Bookingoversigt",
  description: "Display booking overview from WinKAS system",
  categoryId: 1,

  ...SlideTypeUtils.getDefaultSlideSettings(),

  _locationsData: null,

  // Helper method to parse comma-separated strings into arrays
  _parseCommaSeparated(value) {
    return (value || "").split(skipSeparator).filter(Boolean);
  },

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

      if (!response.ok)
        throw new Error(
          `Failed to fetch locations data: ${response.statusText}`,
        );

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
      scroll_speed: config.scroll_speed || 5,
      skipped_events_title: config.skipped_events_title || "",
      skipped_events_booked_by: config.skipped_events_booked_by || "",
    };
  },

  async generateForm(existingConfig = null) {
    try {
      this.currentLocationsData = await this.fetchLocationsData();
      const config = this.getDefaultConfig(existingConfig);

      return await SlideTypeUtils.loadFormTemplateWithCallback(
        "/slide-types/winkas-form",
        "WinKAS Form",
        () => {
          translateHTML();
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
    this.ensureSkippedEventsInput(
      config.skipped_events_title,
      config.skipped_events_booked_by,
    );

    const scrollSpeedInput = document.getElementById("scroll-speed");
    const scrollSpeedValue = document.getElementById("scroll-speed-value");

    if (scrollSpeedInput) scrollSpeedInput.value = config.scroll_speed;
    if (scrollSpeedValue) scrollSpeedValue.textContent = config.scroll_speed;
  },

  // Render skipped events list from hidden input value
  _renderSkippedEventsList() {
    const titleHidden = document.getElementById("skipped-events-title-input");
    const titleList = document.getElementById("skipped-events-title-list");

    const bookedByHidden = document.getElementById(
      "skipped-events-booked-by-input",
    );
    const bookedByList = document.getElementById(
      "skipped-events-booked-by-list",
    );
    if (!titleHidden || !titleList || !bookedByHidden || !bookedByList) return;

    [
      [titleList, titleHidden],
      [bookedByList, bookedByHidden],
    ].forEach(([list, hidden]) => {
      const items = this._parseCommaSeparated(hidden.value);
      list.innerHTML = items
        .map(
          (item) => `
            <div class="d-flex align-items-center mb-1 skipped-event-item" data-value="${item}">
              <span class="badge bg-secondary py-2">${item}</span>
              <button type="button" class="btn btn-sm btn-outline-danger remove-skipped-event" aria-label="Remove">&minus;</button>
            </div>
          `,
        )
        .join("");
    });
  },

  ensureSkippedEventsInput(titleValue, bookedByValue) {
    const container = document.getElementById("skipped-events-container");
    const existingTitleHidden = document.getElementById(
      "skipped-events-title-input",
    );
    const existingBookedByHidden = document.getElementById(
      "skipped-events-booked-by-input",
    );

    if (existingTitleHidden && existingBookedByHidden) {
      existingTitleHidden.value = titleValue || "";
      existingBookedByHidden.vaue = bookedByValue || "";
      this._renderSkippedEventsList();

      return;
    }

    if (!container) return;

    container.innerHTML = `
      <label class="form-label" for="skipped-events-input-field">${gettext("Skipped Events")}</label>

      <!-- skipped by "title" -->
      <div class="col-6 border-end border-gray">
        <div class="d-flex gap-2 mb-2">
          <input type="text" class="form-control" id="skipped-events-title-input-field" placeholder="${gettext("Add event title, press + to add")}">
          <button type="button" id="add-skipped-event-title-btn" class="btn btn-primary">+</button>
        </div>
        <div class="mb-2 bg-secondary-accent p-2 rounded text-black">${gettext("Events with these exact titles will be hidden from the display.")}</div>

        <div id="skipped-events-title-list" class="d-flex gap-2 flex-wrap"></div>
        <input type="hidden" id="skipped-events-title-input" value="${titleValue || ""}">
      </div>

      <!-- skipped by "booked-by" -->
      <div class="col-6">
        <div class="d-flex gap-2 mb-2">
          <input type="text" class="form-control" id="skipped-events-booked-by-input-field" placeholder="${gettext("Add event organizer, press + to add")}">
          <button type="button" id="add-skipped-event-booked-by-btn" class="btn btn-primary">+</button>
        </div>
        <div class="mb-2 bg-secondary-accent p-2 rounded text-black">${gettext("Events with these exact organizers will be hidden from the display.")}</div>

        <div id="skipped-events-booked-by-list" class="d-flex gap-2 flex-wrap"></div>
        <input type="hidden" id="skipped-events-booked-by-input" value="${bookedByValue || ""}">
      </div>
    `;

    this._renderSkippedEventsList();
  },

  populateLocationOptions(selectedLocation) {
    const locationSelect = document.getElementById("location-input");
    if (!locationSelect || !this.currentLocationsData) return;

    locationSelect.innerHTML = "";
    locationSelect.add(new Option(gettext("Select a location..."), ""));

    Object.entries(this.currentLocationsData).forEach(([key, value]) => {
      locationSelect.add(
        new Option(value.location_name, key, false, key === selectedLocation),
      );
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
    const allSelector = document.getElementById("all-selector");

    if (subLocationsSection) subLocationsSection.style.display = "none";
    if (noLocationsMessage) noLocationsMessage.style.display = "none";
    if (multiSelectContainer) multiSelectContainer.innerHTML = "";
    if (allSelector) allSelector.checked = false;

    const locationData = this.currentLocationsData?.[selectedLocation];
    if (!locationData) return;

    if (subLocationsSection) subLocationsSection.style.display = "block";

    const bookables = locationData.bookables;
    if (!bookables || Object.keys(bookables).length === 0) {
      if (noLocationsMessage) {
        noLocationsMessage.textContent =
          "No sub-locations available for this location.";
        noLocationsMessage.style.display = "block";
      }
      return;
    }

    if (multiSelectContainer) {
      multiSelectContainer.innerHTML = Object.entries(bookables)
        .map(
          ([key, value]) => `
        <div class="col-md-6 col-lg-4 mb-2">
          <div class="form-check">
            <input class="form-check-input sub_loc_box" type="checkbox" value="${key}" id="sub-loc-${key}" ${selectedSubLocations.includes(key) ? "checked" : ""}>
            <label class="form-check-label" for="sub-loc-${key}">${value.name}</label>
          </div>
        </div>
      `,
        )
        .join("");
    }
  },

  // Helper to add event listener with cleanup tracking
  _addListener(element, event, handler) {
    if (!element) return;
    element.addEventListener(event, handler);
    this.eventListenerCleanup.push(() =>
      element.removeEventListener(event, handler),
    );
  },

  setupFormEventListeners() {
    this.eventListenerCleanup = [];

    const locationSelect = document.getElementById("location-input");
    this._addListener(locationSelect, "change", (e) =>
      this.updateSubLocationOptions(e.target.value),
    );

    const allSelector = document.getElementById("all-selector");
    this._addListener(allSelector, "click", () => {
      const isChecked = allSelector.checked;
      document
        .querySelectorAll(".sub_loc_box")
        .forEach((box) => (box.checked = isChecked));
    });

    const scrollSpeedInput = document.getElementById("scroll-speed");
    this._addListener(scrollSpeedInput, "input", (e) => {
      const display = document.getElementById("scroll-speed-value");
      if (display) display.textContent = e.target.value;
    });

    this._setupSkippedEventsListeners();
  },

  _setupSkippedEventsListeners() {
    const elements = {
      addTitleBtn: document.getElementById("add-skipped-event-title-btn"),
      addBookedByBtn: document.getElementById(
        "add-skipped-event-booked-by-btn",
      ),
      skippedTitleField: document.getElementById("skipped-events-title-input"),
      skippedBookedByField: document.getElementById(
        "skipped-events-booked-by-input",
      ),
      skippedTitleTextField: document.getElementById(
        "skipped-events-title-input-field",
      ),
      skippedBookedByTextField: document.getElementById(
        "skipped-events-booked-by-input-field",
      ),
      skippedTitleList: document.getElementById("skipped-events-title-list"),
      skippedBookedByList: document.getElementById(
        "skipped-events-booked-by-list",
      ),
    };

    if (
      !elements.addTitleBtn ||
      !elements.addBookedByBtn ||
      !elements.skippedTitleTextField ||
      !elements.skippedBookedByTextField ||
      !elements.skippedTitleField ||
      !elements.skippedBookedByField
    )
      return;

    const addHandler = (textField, field) => {
      const val = textField.value.trim();
      if (!val) return;

      const items = this._parseCommaSeparated(field.value);
      if (!items.includes(val)) {
        items.push(val);
        field.value = items.join(skipSeparator);
        textField.value = "";
        this._renderSkippedEventsList();
      }
    };

    [
      [
        elements.skippedTitleTextField,
        elements.skippedTitleField,
        elements.addTitleBtn,
      ],
      [
        elements.skippedBookedByTextField,
        elements.skippedBookedByField,
        elements.addBookedByBtn,
      ],
    ].forEach(([textField, field, addBtn]) => {
      this._addListener(addBtn, "click", () => {
        addHandler(textField, field);
      });
      this._addListener(textField, "keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addHandler(textField, field);
        }
      });
    });

    if (elements.skippedTitleList || elements.skippedBookedByList) {
      [
        [elements.skippedTitleList, elements.skippedTitleField],
        [elements.skippedBookedByList, elements.skippedBookedByField],
      ].forEach(([list, field]) =>
        this._addListener(list, "click", (e) => {
          if (!e.target.classList.contains("remove-skipped-event")) return;

          const item = e.target.closest(".skipped-event-item");
          if (!item) return;

          const items = this._parseCommaSeparated(field.value).filter(
            (i) => i !== item.dataset.value,
          );
          field.value = items.join(skipSeparator);
          this._renderSkippedEventsList();
        }),
      );
    }

    this._renderSkippedEventsList();
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
      skipped_events_title: config.skipped_events_title || "",
      skipped_events_booked_by: config.skipped_events_booked_by,
    };

    return SlideTypeUtils.generateSlideUrl(
      "/slide-types/winkas",
      params,
      "WinKAS Bookings",
    );
  },

  extractFormData() {
    const subLocations = Array.from(
      document.querySelectorAll(".sub_loc_box:checked"),
    ).map((cb) => cb.value);

    return {
      location: document.getElementById("location-input")?.value || "",
      sub_locations: subLocations,
      continuous_scroll: true,
      scroll_speed: Number(document.getElementById("scroll-speed")?.value || 5),
      skipped_events_title:
        document.getElementById("skipped-events-title-input")?.value.trim() ||
        "",
      skipped_events_booked_by:
        document
          .getElementById("skipped-events-booked-by-input")
          ?.value.trim() || "",
    };
  },

  validateSlide() {
    const data = this.extractFormData();

    if (!data.location) {
      alert("Please select a location.");
      return false;
    }

    if (!data.sub_locations?.length) {
      alert("Please select at least one sub-location to display bookings.");
      return false;
    }

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
