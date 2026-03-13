// SPDX-FileCopyrightText: 2026 Magenta ApS <https: //magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

import { BASE_URL } from "../../../../../utils/constants";
import { gettext, translateHTML } from "../../../../../utils/locales";
import { shouldUseApiKeyInSlideTypeIframe } from "../../../../../utils/utils";
import { SlideTypeUtils } from "../slideTypeRegistry";

/**
 * @typedef {Object} DomCtx
 * @property {HTMLSelectElement} DomCtx.municipalitySelectEl
 * @property {HTMLSelectElement} DomCtx.librarySelectEl
 * @property {HTMLInputElement} DomCtx.daysInputEl
 * @property {HTMLSelectElement} DomCtx.dateHeaderFontSizeEl
 * @property {HTMLSelectElement} DomCtx.listElementFontSizeEl
 */

/**
 * @description
 * Helper function for getting elements
 * @param {string} elementID
 */
function getElementByID(elementID) {
  const element = document.getElementById(elementID);
  if (!element) {
    console.error(`Could not find element with id: ${elementID}`);
    return;
  }

  return element;
}

/**
 * @description
 * Initiates the dom context, an object which retrieval of the relevant dom elements.
 * If an element is used often it should be added to the dom context so as to avoid too many querySelectors
 * @returns {DomCtx & {resetCtx: () => void}}
 */
function initDomCtx() {
  /** @type {DomCtx} */
  const ctxPrimitive = {
    librarySelectEl: null,
    municipalitySelectEl: null,
    daysInputEl: null,
    dateHeaderFontSizeEl: null,
    listElementFontSizeEl: null,
  };

  return {
    get municipalitySelectEl() {
      if (!ctxPrimitive.municipalitySelectEl) {
        const munincipalitySelectEl = getElementByID(
          "ddb-opening-hours-kommune-select",
        );
        if (!(munincipalitySelectEl instanceof HTMLSelectElement)) {
          console.error(
            "Could not find munincipality select element, or is not a select element",
          );
          return;
        }

        ctxPrimitive.municipalitySelectEl = munincipalitySelectEl;
      }
      return ctxPrimitive.municipalitySelectEl;
    },

    get librarySelectEl() {
      if (!ctxPrimitive.librarySelectEl) {
        const librarySelectEl = getElementByID(
          "ddb-opening-hours-library-select",
        );
        if (!(librarySelectEl instanceof HTMLSelectElement)) {
          console.error(
            "Could not find library select element, or is not a select element",
          );
          return;
        }

        ctxPrimitive.librarySelectEl = librarySelectEl;
      }

      return ctxPrimitive.librarySelectEl;
    },
    get daysInputEl() {
      if (!ctxPrimitive.daysInputEl) {
        const daysInputEl = getElementByID(
          "ddb-opening-hours-nr-of-days-input",
        );
        if (!(daysInputEl instanceof HTMLInputElement)) {
          console.error(
            "Could not find days input element, or is not a input element",
          );
          return;
        }

        ctxPrimitive.daysInputEl = daysInputEl;
      }

      return ctxPrimitive.daysInputEl;
    },
    get dateHeaderFontSizeEl() {
      if (!ctxPrimitive.dateHeaderFontSizeEl) {
        const dateHeaderFontSizeEl = getElementByID(
          "ddb-opening-hours-date-header-font-size",
        );
        if (!(dateHeaderFontSizeEl instanceof HTMLSelectElement)) {
          console.error(
            "Could not find date header font size select element, or is not a select element",
          );
          return;
        }

        ctxPrimitive.dateHeaderFontSizeEl = dateHeaderFontSizeEl;
      }

      return ctxPrimitive.dateHeaderFontSizeEl;
    },

    get listElementFontSizeEl() {
      if (!ctxPrimitive.listElementFontSizeEl) {
        const listElementFontSizeEl = getElementByID(
          "ddb-opening-hours-list-element-font-size",
        );
        if (!(listElementFontSizeEl instanceof HTMLSelectElement)) {
          console.error(
            "Could not find list element font size element, or is not a select element",
          );
          return;
        }

        ctxPrimitive.listElementFontSizeEl = listElementFontSizeEl;
      }

      return ctxPrimitive.listElementFontSizeEl;
    },

    resetCtx() {
      ctxPrimitive.municipalitySelectEl = null;
      ctxPrimitive.librarySelectEl = null;
      ctxPrimitive.daysInputEl = null;
      ctxPrimitive.dateHeaderFontSizeEl = null;
      ctxPrimitive.listElementFontSizeEl = null;
    },
  };
}

/**
 * @typedef {Object} MunicipalityLibrary
 * @property {string} MunicipalityLibrary.name - A normalized name used for identification
 * @property {string} MunicipalityLibrary.label - A display name
 * @property {number} MunicipalityLibrary.branch_id - The branch id for the library within that municipality
 * @property {boolean} MunicipalityLibrary.isSelected
 */

/** @typedef {{ base_url: string, libraries: Array<MunicipalityLibrary>}} MunicipalityData */

/**
 * @typedef {Object} MunicipalitiesData
 * @property {string} MunicipalityData.opening_hours_path
 * @property {Record<string, MunicipalityData>} MunicipalityData.kommuner
 */

/**
 * @typedef {Object} CurrentData
 * @property {string} CurrentData.selectedMunicipality
 * @property {string} CurrentData.baseURL
 * @property {MunicipalityLibrary} CurrentData.selectedLibrary
 * @property {number} CurrentData.branchID
 * @property {string} CurrentData.days
 * @property {string} CurrentData.dateHeaderFontSize
 * @property {string} CurrentData.listElementFontSize
 */

/**
 * @typedef {Object} EventListeners
 * @property {(event: Event) => void} EventListeners.updateLibrarySelection
 * @property {(event: Event) => void} EventListeners.setSelectedLibrary
 * @property {(event: Event) => void} EventListeners.setDays
 * @property {(event: Event) => void} EventListeners.setDateHeaderFontSize
 * @property {(event: Event) => void} EventListeners.setListElementFontSize
 */

export const DDBOpeningHoursSlideType = {
  ...SlideTypeUtils.getDefaultSlideSettings(),

  _domCtx: initDomCtx(),
  /** @type {EventListeners} */
  _eventListeners: {
    updateLibrarySelection: null,
    setSelectedLibrary: null,
    setDays: null,
    setDateHeaderFontSize: null,
    setListElementFontSize: null,
  },
  /** @type {MunicipalitiesData} */
  _municipalitiesData: null,

  /** @type {CurrentData} */
  _currentData: {
    selectedMunicipality: null,
    baseURL: null,
    selectedLibrary: null,
    branchID: null,
    days: null,
    dateHeaderFontSize: null,
    listElementFontSize: null,
  },
  name: "DDB Opening Hours",
  description: "Display events from the Danish Digital Library",
  categoryId: 1,

  // SlideTypeRegistry required functions

  /**
   * @param {FormConfig} [existingConfig=null]
   */
  generateForm(existingConfig = null) {
    return SlideTypeUtils.loadFormTemplateWithCallback(
      "/slide-types/ddb-opening-hours-form",
      "DDB opening hours",
      async () => {
        translateHTML();

        this._domCtx.resetCtx();
        await this.initDDBOpeningHoursWidget(existingConfig);
        this.initEventListeners();
      },
    );
  },

  /**
   * @typedef {Object} FormConfig
   * @property {string} FormConfig.selectedMunicipality
   * @property {string} FormConfig.baseURL
   * @property {string} FormConfig.libraryName
   * @property {number} FormConfig.branchID
   * @property {string} FormConfig.days
   * @property {string} FormConfig.dateHeaderFontSize
   * @property {string} FormConfig.listElementFontSize
   */

  /**
   *
   * @returns {FormConfig}
   */
  extractFormData() {
    return {
      selectedMunicipality: this._currentData.selectedMunicipality,
      baseURL: this._currentData.baseURL,
      libraryName: this._currentData.selectedLibrary.name,
      branchID: this._currentData.selectedLibrary.branch_id,
      days: Number(this._currentData.days) <= 0 ? "1" : this._currentData.days,
      dateHeaderFontSize: this._currentData.dateHeaderFontSize,
      listElementFontSize: this._currentData.listElementFontSize,
    };
  },

  /**
   * @param {FormConfig} config
   */
  generateSlide(config) {
    return SlideTypeUtils.generateSlideUrl(
      "/slide-types/ddb-opening-hours",
      config,
      "DDB opening hours",
    );
  },

  generateSlideData() {
    const defaults = SlideTypeUtils.getDefaultSlideSettings();

    return {
      ...defaults,
      gridHeight: 500,
      gridWidth: 1000,
      integrationName: "Det Digitale Folkebibliotek åbningstider API",
    };
  },

  cleanupFormEventListeners() {
    this._domCtx.municipalitySelectEl.removeEventListener(
      "change",
      this._eventListeners.updateLibrarySelection,
    );
    this._domCtx.librarySelectEl.removeEventListener(
      "change",
      this._eventListeners.setSelectedLibrary,
    );
    this._domCtx.daysInputEl.removeEventListener(
      "change",
      this._eventListeners.setDays,
    );
    this._domCtx.dateHeaderFontSizeEl.removeEventListener(
      "change",
      this._eventListeners.setDateHeaderFontSize,
    );
    this._domCtx.listElementFontSizeEl.removeEventListener(
      "change",
      this._eventListeners.setListElementFontSize,
    );
  },

  // Component functions

  /**
   * @param {FormConfig} [existingConfig=null]
   */
  async initDDBOpeningHoursWidget(existingConfig = null) {
    await this.fetchLibrariesData();
    if (!this._municipalitiesData) return;

    // municipality init
    const municipalitySelectEl = this._domCtx.municipalitySelectEl;

    const emptyOption = new Option(gettext("Select municipality"), "");
    municipalitySelectEl.options.add(emptyOption);

    Object.keys(this._municipalitiesData.kommuner).forEach((key) => {
      const option = new Option(key, key);
      municipalitySelectEl.options.add(option);
    });

    // days init
    const daysInputEl = this._domCtx.daysInputEl;
    this._currentData.days = daysInputEl.value;

    // font size init
    const dateHeaderFontSizeEl = this._domCtx.dateHeaderFontSizeEl;
    this._currentData.dateHeaderFontSize = dateHeaderFontSizeEl.value;

    const listElementFontSizeEl = this._domCtx.listElementFontSizeEl;
    this._currentData.listElementFontSize = listElementFontSizeEl.value;

    if (existingConfig) {
      this.useExistingConfig(existingConfig);
    }
  },

  /**
   * @description
   * Will use an existing config to set the values in the form
   * @param {FormConfig} existingConfig
   */
  useExistingConfig(existingConfig) {
    // set selected municipality
    const selectedMunicipality = existingConfig.selectedMunicipality;
    this._domCtx.municipalitySelectEl.value = selectedMunicipality;
    this._currentData.baseURL =
      this._municipalitiesData.kommuner[selectedMunicipality].base_url;

    // set selected library
    this._currentData.selectedLibrary = this._municipalitiesData.kommuner[
      selectedMunicipality
    ].libraries.find((library) => library.name === existingConfig.libraryName);

    this.updateLibrarySelection(selectedMunicipality);
    this._domCtx.librarySelectEl.value = this._currentData.selectedLibrary.name;

    // set selected days
    this._currentData.days = existingConfig.days;
    this._domCtx.daysInputEl.value = existingConfig.days;

    // set font size selection
    this._currentData.dateHeaderFontSize = existingConfig.dateHeaderFontSize;
    this._domCtx.dateHeaderFontSizeEl.value = existingConfig.dateHeaderFontSize;

    this._currentData.listElementFontSize = existingConfig.listElementFontSize;
    this._domCtx.listElementFontSizeEl.value =
      existingConfig.listElementFontSize;
  },

  /**
   * @description
   * adds all event listeners and stores the references to be removed later
   */
  initEventListeners() {
    this._eventListeners.updateLibrarySelection = (event) => {
      this.onMunicipalityChange(event);
    };
    this._domCtx.municipalitySelectEl.addEventListener(
      "change",
      this._eventListeners.updateLibrarySelection,
    );

    this._eventListeners.setSelectedLibrary = (event) => {
      this.onLibraryChange(event);
    };
    this._domCtx.librarySelectEl.addEventListener(
      "change",
      this._eventListeners.setSelectedLibrary,
    );

    this._eventListeners.setDays = (event) => {
      this.onDaysChange(event);
    };
    this._domCtx.daysInputEl.addEventListener(
      "change",
      this._eventListeners.setDays,
    );

    this._eventListeners.setDateHeaderFontSize = (event) => {
      this.onDateHeaderFontSizeChange(event);
    };
    this._domCtx.dateHeaderFontSizeEl.addEventListener(
      "change",
      this._eventListeners.setDateHeaderFontSize,
    );

    this._eventListeners.setListElementFontSize = (event) => {
      this.onListElementFontSizeChange(event);
    };
    this._domCtx.listElementFontSizeEl.addEventListener(
      "change",
      this._eventListeners.setListElementFontSize,
    );
  },

  /**
   * @param {string} libraryName
   */
  setSelectedLibrary(libraryName) {
    const selectedMunicipality =
      this._municipalitiesData.kommuner[this._currentData.selectedMunicipality];
    const selectedLibrary = selectedMunicipality.libraries.find(
      (library) => library.name === libraryName,
    );
    if (!selectedLibrary) {
      console.error("Could not find library when it was expected");
    }

    this._currentData.baseURL = selectedMunicipality.base_url;
    this._currentData.selectedLibrary = selectedLibrary;
    this._currentData.branchID = selectedLibrary.branch_id;
  },

  /**
   * @param {string} days
   */
  setDays(days) {
    this._currentData.days = days;
  },

  /**
   * @param {string} fontSize
   */
  setDateHeaderFontSize(fontSize) {
    this._currentData.dateHeaderFontSize = fontSize;
  },

  /**
   * @param {string} fontSize
   */
  setListElementFontSize(fontSize) {
    this._currentData.listElementFontSize = fontSize;
  },

  /**
   * @param {string} selectedMunincipality
   */
  updateLibrarySelection(selectedMunincipality) {
    if (!this._municipalitiesData || !this._municipalitiesData.kommuner) {
      console.error("Could not find kommune data");
      return;
    }

    const municipalityData =
      this._municipalitiesData.kommuner[selectedMunincipality];
    if (municipalityData) {
      this._currentData.selectedMunicipality = selectedMunincipality;
      this.displayLibraries(municipalityData);
    } else {
      this._currentData.selectedMunicipality = null;
      this._currentData.selectedLibrary = null;
      this.displayNoLibraries();
    }
  },

  /**
   * @description
   * Used to set the library section the default none selected state
   */
  displayNoLibraries() {
    const librarySelect = this._domCtx.librarySelectEl;

    librarySelect.innerHTML = "";

    const emptyOption = new Option(
      gettext("Select a municipality to load libraries."),
      "",
    );
    librarySelect.options.add(emptyOption);
  },

  /**
   * @description
   * Used to display libraries when a municipality is chosen
   * @param {MunicipalityData} municipalityData
   */
  displayLibraries(municipalityData) {
    const librarySelectEl = this._domCtx.librarySelectEl;

    // reset from previous state
    librarySelectEl.innerHTML = "";

    const emptyOption = new Option(
      gettext("Select a municipality to load libraries."),
      "",
    );
    librarySelectEl.options.add(emptyOption);

    municipalityData.libraries.forEach((library) => {
      const option = new Option(library.label, library.name);

      librarySelectEl.options.add(option);
    });
  },

  // event listener functions

  /**
   * @param {Event} event
   */
  onMunicipalityChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;

    this.updateLibrarySelection(target.value);
  },

  /**
   * @param {Event} event
   */
  onLibraryChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      console.error("expected target to be of type select");
      return;
    }

    // handle empty value option
    if (!target.value) {
      return;
    }

    this.setSelectedLibrary(target.value);
  },

  /**
   * @param {Event} event
   */
  onDaysChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      console.error("Expected input element");
      return;
    }

    this.setDays(target.value);
  },

  /**
   * @param {Event} event
   */
  onDateHeaderFontSizeChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      console.error("Expected select element");
      return;
    }

    this.setDateHeaderFontSize(target.value);
  },

  /**
   * @param {Event} event
   */
  onListElementFontSizeChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      console.error("Expected select element");
      return;
    }

    this.setListElementFontSize(target.value);
  },

  // Util functions

  /**
   * @description
   * Helper function for normalizing a library name across this file
   * @param {string} libraryName
   */
  normalizeLibraryName(libraryName) {
    return libraryName.toLowerCase().trim();
  },

  buildAuthHeaders() {
    const headers = {};
    const useApiKey = shouldUseApiKeyInSlideTypeIframe();
    const apiKey = localStorage.getItem("apiKey");
    const token = localStorage.getItem("accessToken");

    if (useApiKey && apiKey) {
      headers["X-API-KEY"] = apiKey;
    } else if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else if (apiKey) {
      headers["X-API-KEY"] = apiKey;
    }

    return headers;
  },

  async fetchLibrariesData() {
    if (this._municipalitiesData) return this._municipalitiesData;

    try {
      const headers = this.buildAuthHeaders();
      headers["Content-Type"] = "application/json";

      const response = await fetch(`${BASE_URL}/api/ddb/options`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch library data: ${response.statusText}`);
      }

      /** @type {MunicipalitiesData} */
      const municipalitiesData = await response.json();
      Object.values(municipalitiesData.kommuner).forEach((kommune) => {
        kommune.libraries = kommune.libraries.map((library) => ({
          ...library,
          label: library.name,
          name: this.normalizeLibraryName(library.name),
        }));
      });

      this._municipalitiesData = municipalitiesData;
    } catch (error) {
      console.error("Error fetching library data:", error);
      return {};
    }
  },
};
