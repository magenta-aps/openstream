import { BASE_URL } from "../../../../../utils/constants";
import { gettext, translateHTML } from "../../../../../utils/locales";
import { shouldUseApiKeyInSlideTypeIframe } from "../../../../../utils/utils";
import { SlideTypeUtils } from "../slideTypeRegistry";

/**
 * @typedef {Object} DomCtx
 * @property {HTMLSelectElement} context.municipalitySelectEl
 * @property {HTMLSelectElement} context.librarySelectEl
 * @property {HTMLInputElement} context.daysInputEl
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

/** @returns {DomCtx} */
function initDomCtx() {
  const ctxPrimitive = {
    librarySelectEl: null,
    municipalitySelectEl: null,
    daysInputEl: null,
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

        ctxPrimitive.kommuneSelectEl = munincipalitySelectEl;
      }
      return ctxPrimitive.kommuneSelectEl;
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

export const DdbOpeningHoursSlideType = {
  /** @type {DomCtx} Used for handling element fetching from the dom */
  _domCtx: initDomCtx(),
  /** @type {MunicipalitiesData} */
  _municipalitiesData: null,
  /** @type {string} */
  _selectedMunicipality: null,
  /** @type {{baseURL: string, selectedLibrary: MunicipalityLibrary, branchID: number, days: string}} */
  _currentData: {
    baseURL: null,
    selectedLibrary: null,
    branchID: null,
    days: null,
  },
  name: "DDB Opening Hours",
  description: "Display events from the Danish Digital Library",
  categoryId: 1,

  ...SlideTypeUtils.getDefaultSlideSettings(),

  // SlideTypeRegistry required functions

  generateForm(existingConfig = null) {
    return SlideTypeUtils.loadFormTemplateWithCallback(
      "/slide-types/ddb-opening-hours-form",
      "DDB opening hours",
      () => {
        translateHTML();
        this.initMunicipalitySelection();
      },
    );
  },

  /**
   * @typedef {Object} FormConfig
   * @property {string} baseURL
   * @property {string} libraryName
   * @property {number} branchID
   * @property {string} days
   */

  /**
   *
   * @returns {FormConfig}
   */
  extractFormData() {
    return {
      baseURL: this._currentData.baseURL,
      libraryName: this._currentData.selectedLibrary.label,
      branchID: this._currentData.selectedLibrary.branch_id,
      days: this._currentData.days,
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
      integrationName: "Det Digitale Folkebibliotek åbningstider API",
    };
  },

  // Component functions

  async initMunicipalitySelection() {
    await this.fetchLibrariesData();
    if (!this._municipalitiesData) return;

    // municipality init
    const munincipalitySelectEl = this._domCtx.municipalitySelectEl;

    const emptyOption = new Option(gettext("Select municipality"), "");
    munincipalitySelectEl.options.add(emptyOption);

    Object.keys(this._municipalitiesData.kommuner).forEach((key) => {
      const option = new Option(key, key);
      munincipalitySelectEl.options.add(option);
    });

    munincipalitySelectEl.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;

      this.updateLibrarySelection(target.value);
    });

    // library init
    const librarySelectEl = this._domCtx.librarySelectEl;
    librarySelectEl.addEventListener("change", (event) =>
      this.setSelectedLibrary(event),
    );

    // days init
    const daysInputEl = this._domCtx.daysInputEl;
    daysInputEl.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        console.error("Expected input element");
        return;
      }

      this._currentData.days = target.value;
    });
  },

  /**
   * @param {Event} event
   */
  setSelectedLibrary(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      console.error("expected target to be of type select");
      return;
    }
    // handle empty value option
    if (!target.value) {
      return;
    }

    const selectedMunicipality =
      this._municipalitiesData.kommuner[this._selectedMunicipality];
    const selectedLibrary = selectedMunicipality.libraries.find(
      (library) => library.name === target.value,
    );
    if (!selectedLibrary) {
      console.error("Could not find library when it was expected");
    }

    this._currentData.baseURL = selectedMunicipality.base_url;
    this._currentData.selectedLibrary = selectedLibrary;
    this._currentData.branchID = selectedLibrary.branch_id;
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
      this._selectedMunicipality = selectedMunincipality;
      this.displayLibraries(municipalityData);
    } else {
      this._selectedMunicipality = null;
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
