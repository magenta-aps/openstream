// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/*******************    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${BASE_URL}/api/ddb/options`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {******************************
 * ddbEventsApiSlideType.js
 * DDB Events API slide type definition
 ************************************************************/

import { BASE_URL } from "../../../../../utils/constants.js";
import { SlideTypeUtils } from "../slideTypeRegistry.js";

export const DdbEventsApiSlideType = {
  name: "DDB Events API",
  description: "Display events from the Danish Digital Library",
  categoryId: 1,

  ...SlideTypeUtils.getDefaultSlideSettings(),

  _librariesData: null,

  async fetchLibrariesData() {
    if (this._librariesData) return this._librariesData;

    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${BASE_URL}/api/ddb/options`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch library data: ${response.statusText}`);
      }

      this._librariesData = await response.json();
      return this._librariesData;
    } catch (error) {
      console.error("Error fetching library data:", error);
      return {};
    }
  },

  getDefaultConfig(existingConfig = {}) {
    const config = existingConfig || {};
    return {
      kommune: config.kommune || "",
      library: config.library || "",
      days: config.days || "",
      slideDuration: config.slideDuration || "",
      layout: config.layout || "vertical",
      showTitle: config.showTitle !== false,
      showSubtitle: config.showSubtitle || false,
      showDateTime: config.showDateTime !== false,
      showDescription: config.showDescription || false,
      showQr: config.showQr !== false,
      showLocation: config.showLocation !== false,
    };
  },

  async generateForm(existingConfig = null) {
    try {
      const librariesData = await this.fetchLibrariesData();
      this.currentLibrariesData = librariesData;
      const config = this.getDefaultConfig(existingConfig);

      return await SlideTypeUtils.loadFormTemplateWithCallback(
        "/slide-types/ddb-events-form",
        "DDB Events Form",
        () => {
          this.populateFormData(config);
          this.setupFormEventListeners();
        },
      );
    } catch (error) {
      console.error("Error generating DDB Events form:", error);
      return SlideTypeUtils.getErrorTemplate(
        `Could not initialize DDB Events form: ${error.message}`,
        "DDB Events Form",
      );
    }
  },

  populateFormData(config) {
    this.populateMunicipalityOptions(config.kommune);
    this.updateLibraryOptions(config.kommune, config.library);

    // Set form values
    this.setElementValue("nrOfDaysInput", config.days);
    this.setElementValue("slideDurationInput", config.slideDuration);
    this.setElementChecked(
      `input[name="layout"][value="${config.layout}"]`,
      true,
    );

    // Set checkboxes
    const checkboxMapping = {
      title: config.showTitle,
      subtitle: config.showSubtitle,
      dateTime: config.showDateTime,
      description: config.showDescription,
      qrCode: config.showQr,
      location: config.showLocation,
    };

    Object.entries(checkboxMapping).forEach(([id, checked]) => {
      this.setElementChecked(`#${id}`, checked);
    });
  },

  populateMunicipalityOptions(selectedMunicipality) {
    const kommuneSelect = document.getElementById("kommuneSelect");
    if (!kommuneSelect || !this.currentLibrariesData) return;

    kommuneSelect.innerHTML = '<option value="">Select municipality</option>';

    Object.keys(this.currentLibrariesData).forEach((municipalityName) => {
      const option = document.createElement("option");
      option.value = municipalityName;
      option.textContent = municipalityName;
      option.selected = municipalityName === selectedMunicipality;
      kommuneSelect.appendChild(option);
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

  updateLibraryOptions(selectedMunicipality, selectedLibrary = "") {
    const librarySelect = document.getElementById("librarySelect");
    if (!librarySelect) return;

    librarySelect.innerHTML = '<option value="">Select library</option>';

    if (
      selectedMunicipality &&
      this.currentLibrariesData[selectedMunicipality]
    ) {
      const libraries =
        this.currentLibrariesData[selectedMunicipality].libraries || [];

      libraries.forEach((libraryName) => {
        const option = document.createElement("option");
        option.value = libraryName.toLowerCase();
        option.textContent = libraryName;
        option.selected = libraryName.toLowerCase() === selectedLibrary;
        librarySelect.appendChild(option);
      });
    }
  },

  setupFormEventListeners() {
    const kommuneSelect = document.getElementById("kommuneSelect");
    const librarySelect = document.getElementById("librarySelect");

    if (!kommuneSelect || !librarySelect) {
      setTimeout(() => this.setupFormEventListeners(), 100);
      return;
    }

    this.eventListenerCleanup = SlideTypeUtils.setupEventListener(
      "kommuneSelect",
      "change",
      (event) => this.updateLibraryOptions(event.target.value),
      this,
    );
  },

  cleanupFormEventListeners() {
    if (this.eventListenerCleanup) {
      this.eventListenerCleanup.cleanup();
      this.eventListenerCleanup = null;
    }
    this.currentLibrariesData = null;
  },

  async generateSlide(config) {
    const params = {
      kommune: config.kommune || "",
      library: config.library || "",
      days: config.days || "7",
      slideDuration: config.slideDuration || "",
      layout: config.layout || "vertical",
      showSubtitle: config.showSubtitle || "false",
      showDescription: config.showDescription || "false",
      showQr: config.showQr || "false",
    };

    return SlideTypeUtils.generateSlideUrl(
      "/slide-types/ddb-events",
      params,
      "DDB Events",
    );
  },

  extractFormData() {
    const getElementValue = (id) => document.getElementById(id)?.value || "";
    const getElementChecked = (id) =>
      document.getElementById(id)?.checked || false;
    const getSelectedRadio = (name) =>
      document.querySelector(`input[name="${name}"]:checked`)?.value ||
      "vertical";

    return {
      kommune: getElementValue("kommuneSelect"),
      library: getElementValue("librarySelect"),
      days: getElementValue("nrOfDaysInput"),
      slideDuration: getElementValue("slideDurationInput"),
      layout: getSelectedRadio("layout"),
      showTitle: getElementChecked("title"),
      showSubtitle: getElementChecked("subtitle"),
      showDateTime: getElementChecked("dateTime"),
      showDescription: getElementChecked("description"),
      showQr: getElementChecked("qrCode"),
      showLocation: getElementChecked("location"),
    };
  },

  validateSlide() {
    const data = this.extractFormData();

    return SlideTypeUtils.validateRequired(
      {
        municipality: data.kommune,
        library: data.library,
        days: data.days,
      },
      {
        municipality: "municipality",
        library: "library",
        days: "number of days",
      },
    );
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
      slideTypeId: 1,
      config: config,
      integrationName: "Det Digitale Folkebibliotek Events API",
    };
  },
};
