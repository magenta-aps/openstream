import { BASE_URL } from "../../../../../utils/constants";
import { gettext, translateHTML } from "../../../../../utils/locales";
import { shouldUseApiKeyInSlideTypeIframe } from "../../../../../utils/utils";
import { SlideTypeUtils } from "../slideTypeRegistry";

/**
 * @typedef {Object} Context
 * @property {HTMLElement} context.libraryGridEl
 * @property {HTMLSelectElement} context.kommuneSelectEl
 * @property {HTMLElement} context.selectAllLibrariesWrapperEl
 * @property {HTMLInputElement} context.selectAllLibrariesEl
 * @property {HTMLElement} context.selectLibrariesPlaceholderEl
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

/** @returns {Context} */
function initContext() {
  return {
    libraryGridEl: null,
    kommuneSelectEl: null,
    selectAllLibrariesWrapperEl: null,
    selectAllLibrariesEl: null,
    selectLibrariesPlaceholderEl: null,
  };
}

/**
 * @param {Context} ctx
 * @returns {HTMLSelectElement}
 */
function getMunicipalitySelect(ctx) {
  if (!ctx.kommuneSelectEl) {
    const munincipalitySelectEl = getElementByID(
      "ddb-opening-hours-kommune-select",
    );
    if (!(munincipalitySelectEl instanceof HTMLSelectElement)) {
      console.error(
        "Could not find munincipality select element, or is not a select element",
      );
      return;
    }

    ctx.kommuneSelectEl = munincipalitySelectEl;
  }

  return ctx.kommuneSelectEl;
}

/**
 * @param {Context} ctx
 * @returns {HTMLElement}
 */
function getLibraryGrid(ctx) {
  if (!ctx.libraryGridEl) {
    const libraryGrid = getElementByID(
      "ddb-opening-hours-library-checkbox-grid",
    );
    ctx.libraryGridEl = libraryGrid;
  }

  return ctx.libraryGridEl;
}

/**
 * @param {Context} ctx
 * @returns {HTMLElement}
 */
function getLibraryPlaceHolder(ctx) {
  if (!ctx.selectLibrariesPlaceholderEl) {
    const libraryPlaceholder = getElementByID(
      "ddb-opening-hours-library-checkbox-placeholder",
    );
    ctx.selectLibrariesPlaceholderEl = libraryPlaceholder;
  }

  return ctx.selectLibrariesPlaceholderEl;
}

/**
 * @param {Context} ctx
 * @returns {HTMLElement}
 */
function getSelectAllLibrariesWrapper(ctx) {
  if (!ctx.selectAllLibrariesWrapperEl) {
    const selectAll = getElementByID(
      "ddb-opening-hours-library-select-all-wrapper",
    );

    ctx.selectAllLibrariesWrapperEl = selectAll;
  }

  return ctx.selectAllLibrariesWrapperEl;
}

/**
 * @param {Context} ctx
 * @returns {HTMLInputElement}
 */
function getSelectAllLibraries(ctx) {
  if (!ctx.selectAllLibrariesEl) {
    const selectAll = getElementByID("ddb-opening-hours-library-select-all");

    if (!(selectAll instanceof HTMLInputElement)) {
      return;
    }

    ctx.selectAllLibrariesEl = selectAll;
  }

  return ctx.selectAllLibrariesEl;
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
  /** @type {Context} Used for handling element fetching from the dom */
  _ctx: initContext(),
  /** @type {MunicipalitiesData} */
  _municipalitiesData: null,
  /** @type {{libraries: Array<MunicipalityLibrary>, areAllSelected: () => boolean, areSomeSelected: () => boolean}} */
  _currentData: {
    libraries: [],
    areAllSelected() {
      return this.libraries.every((library) => library.isSelected);
    },
    areSomeSelected() {
      return this.libraries.some((library) => library.isSelected);
    },
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

  extractFormData() {
    return {
      libraries: this._currentData.libraries,
    };
  },

  /**
   * @param {MunicipalityData} config
   */
  generateSlide(config) {
    const params = {};

    const selectedLibraries = config.libraries.filter(
      (library) => library.isSelected,
    );
    if (selectedLibraries.length > 0) {
      params.selectedLibraries = selectedLibraries
        .map((library) => library.label)
        .join(",");
    }

    return SlideTypeUtils.generateSlideUrl(
      "/slide-types/ddb-opening-hours",
      params,
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

    const munincipalitySelectEl = getMunicipalitySelect(this._ctx);

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
      this._currentData.libraries = municipalityData.libraries.map(
        (library) => ({
          ...library,
          name: this.normalizeLibraryName(library.name),
          label: library.name,
          isSelected: false,
        }),
      );
      this.displayLibraries(municipalityData);
    } else {
      this._currentData.libraries = [];
      this.displayNoLibraries();
    }
  },

  /**
   * @description
   * Used to set the library section the default none selected state
   */
  displayNoLibraries() {
    const libraryGrid = getLibraryGrid(this._ctx);
    libraryGrid.innerHTML = "";

    this.setSelectAllVisibility(false);

    const selectLibrariesPlaceholderEl = getLibraryPlaceHolder(this._ctx);
    selectLibrariesPlaceholderEl.textContent = gettext(
      "Select a municipality to load libraries.",
    );
  },

  /**
   * @description
   * Used to display libraries when a municipality is chosen
   * @param {MunicipalityData} municipalityData
   */
  displayLibraries(municipalityData) {
    const selectLibrariesPlaceholderEl = getLibraryPlaceHolder(this._ctx);
    selectLibrariesPlaceholderEl.textContent = "";

    const libraryGrid = getLibraryGrid(this._ctx);
    libraryGrid.innerHTML = "";

    const LibraryFormElements = municipalityData.libraries.map((library, i) => {
      const checkboxID = `ddb-opening-hours-library-${i}`;

      const label = document.createElement("label");
      label.className = "form-check-label";
      label.setAttribute("for", checkboxID);
      label.textContent = library.name;

      const normalizedValue = this.normalizeLibraryName(library.name);

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "form-check-input";
      checkbox.id = checkboxID;
      checkbox.value = normalizedValue;
      checkbox.dataset.label = library.name;
      checkbox.checked = false;

      checkbox.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
          return;
        }

        const libraryIndex = this._currentData.libraries.findIndex(
          (library) => library.name === target.value,
        );
        this._currentData.libraries[libraryIndex].isSelected = target.checked;

        const selectAllLibrariesEl = getSelectAllLibraries(this._ctx);
        if (this._currentData.areAllSelected()) {
          selectAllLibrariesEl.indeterminate = false;
          selectAllLibrariesEl.checked = true;
        } else if (this._currentData.areSomeSelected()) {
          selectAllLibrariesEl.checked = false;
          selectAllLibrariesEl.indeterminate = true;
        } else {
          selectAllLibrariesEl.checked = false;
          selectAllLibrariesEl.indeterminate = false;
        }
      });

      return { label, checkbox };
    });
    if (LibraryFormElements.length === 0) {
      return;
    }

    this.setSelectAllVisibility(true);

    LibraryFormElements.forEach(({ label, checkbox }) => {
      const column = document.createElement("div");
      column.className = "col mb-2";

      const wrapper = document.createElement("div");
      wrapper.className = "form-check";
      wrapper.append(checkbox);
      wrapper.append(label);

      column.append(wrapper);

      libraryGrid.append(column);
    });
  },

  /**
   * @param {boolean} isVisible
   */
  setSelectAllVisibility(isVisible) {
    const selectAllWrapper = getSelectAllLibrariesWrapper(this._ctx);
    const selectAll = getSelectAllLibraries(this._ctx);

    const eventType = "change";
    /** @type {(event: Event) => void} */
    const eventHandler = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      if (target.checked) {
        this.setSelectionForAll(true);
      } else {
        this.setSelectionForAll(false);
      }
    };

    const visibilityClass = "d-none";
    if (isVisible) {
      selectAll.addEventListener(eventType, eventHandler);
      selectAllWrapper.classList.remove(visibilityClass);
    } else {
      selectAll.removeEventListener(eventType, eventHandler);
      selectAllWrapper.classList.add(visibilityClass);
    }
  },

  /**
   * @description
   * set the selection state by name
   * @param {string} libraryName - Name of the library
   * @param {boolean} selectionState - The selection state to set the library to
   */
  setSelectionByName(libraryName, selectionState) {
    const libraryIndex = this._currentData.libraries.findIndex(
      (library) => library.name === libraryName,
    );
    if (libraryIndex < 0) {
      console.error(`Could not set state of ${libraryName}`);
      return;
    }

    const libraryGrid = getLibraryGrid(this._ctx);
    /** @type {HTMLInputElement} */
    const libraryCheckbox = libraryGrid.querySelector(
      `input[type="checkbox"][value=${libraryName}]`,
    );
    if (!libraryCheckbox) {
      console.error(`Could not find checkbox with value of ${libraryName}`);
      return;
    }

    this._currentData.libraries[libraryIndex].isSelected = selectionState;
    libraryCheckbox.checked = selectionState;
  },

  /**
   * @description
   * set the selection state for all libraries
   * @param {boolean} selectionState - the selection state to set the library
   */
  setSelectionForAll(selectionState) {
    const libraryGrid = getLibraryGrid(this._ctx);
    /** @type {NodeListOf<HTMLInputElement>} */
    const libraryCheckboxes = libraryGrid.querySelectorAll(
      "input[type='checkbox']",
    );
    libraryCheckboxes.forEach((checkbox) => {
      checkbox.checked = selectionState;
    });
    this._currentData.libraries.forEach(
      (library) => (library.isSelected = selectionState),
    );
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

      this._municipalitiesData = await response.json();
      return this._municipalitiesData;
    } catch (error) {
      console.error("Error fetching library data:", error);
      return {};
    }
  },
};
