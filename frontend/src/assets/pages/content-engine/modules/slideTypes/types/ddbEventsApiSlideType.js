// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/*
 ************************************************************
 * ddbEventsApiSlideType.js
 * DDB Events API slide type definition
 ************************************************************
 */

import { BASE_URL } from "../../../../../utils/constants.js";
import { gettext, translateHTML } from "../../../../../utils/locales.js";
import { SlideTypeUtils } from "../slideTypeRegistry.js";

export const DdbEventsApiSlideType = {
  name: "DDB Events API",
  description: "Display events from the Danish Digital Library",
  categoryId: 1,

  ...SlideTypeUtils.getDefaultSlideSettings(),

  _librariesData: null,
  currentLibrariesData: null,
  eventListenerCleanup: [],
  layoutRadioCleanup: [],
  previewElements: null,
  previewAbortController: null,
  previewRefreshTimeout: null,
  manualSelectedEvents: null,
  manualSearchTerm: "",
  latestFetchedEvents: null,
  latestLookupContext: null,

  buildAuthHeaders() {
    const headers = {};
    const token = localStorage.getItem("accessToken");
    const apiKey = localStorage.getItem("apiKey");

    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (apiKey) headers["X-API-KEY"] = apiKey;

    return headers;
  },

  async fetchLibrariesData() {
    if (this._librariesData) return this._librariesData;

    try {
      const headers = this.buildAuthHeaders();
      headers["Content-Type"] = "application/json";

      const response = await fetch(
        `${BASE_URL}/api/ddb/options?include_categories=true`,
        {
          method: "GET",
          headers,
        },
      );

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
    const legacyLibrary = config.library ? [config.library] : [];
    const normalizedLibraries = Array.isArray(config.libraries)
      ? config.libraries
      : legacyLibrary;
    const legacyCategory = config.category ? [config.category] : [];
    const normalizedCategories = Array.isArray(config.categories)
      ? config.categories
      : legacyCategory;

    return {
      kommune: config.kommune || "",
      libraries: normalizedLibraries,
      library: normalizedLibraries[0] || config.library || "",
      categories: normalizedCategories,
      category: normalizedCategories[0] || config.category || "",
      days: config.days || "",
      slideDuration: config.slideDuration || "",
      layout: config.layout || "vertical",
      showTitle: config.showTitle !== false,
      showSubtitle: config.showSubtitle || false,
      showDateTime: config.showDateTime !== false,
      showDescription: config.showDescription || false,
      showQr: config.showQr !== false,
      showLocation: config.showLocation !== false,
      selectionMode: config.selectionMode === "manual" ? "manual" : "automatic",
      selectedEventIds: Array.isArray(config.selectedEventIds)
        ? config.selectedEventIds
        : [],
    };
  },

  async generateForm(existingConfig = null) {
    try {
      const librariesData = await this.fetchLibrariesData();
      this.currentLibrariesData = librariesData;
      const config = this.getDefaultConfig(existingConfig);
      this.initializeManualSelection(config);

      return await SlideTypeUtils.loadFormTemplateWithCallback(
        "/slide-types/ddb-events-form",
        "DDB Events Form",
        () => {
          translateHTML(); // Translate after loading template
          this.populateFormData(config);
          this.setupFormEventListeners();
          this.schedulePreviewRefresh(0);
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

  initializeManualSelection(config) {
    this.manualSelectedEvents = new Map();
    this.latestFetchedEvents = new Map();
    this.latestLookupContext = null;
    this.manualSearchTerm = "";

    if (config && Array.isArray(config.selectedEventIds)) {
      config.selectedEventIds.forEach((rawId) => {
        const normalizedId = this.normalizeEventId(rawId);
        if (!normalizedId) return;

        this.manualSelectedEvents.set(normalizedId, {
          id: rawId,
          normalizedId,
          title: "",
          subtitle: "",
          start: "",
          formattedStart: "",
          location: "",
          libraries: [],
          categories: [],
          url: "",
          isPlaceholder: true,
        });
      });
    }
  },

  populateFormData(config) {
    const selectionMode = config.selectionMode || "automatic";
    this.populateMunicipalityOptions(config.kommune);
    this.updateLibraryOptions(config.kommune, config.libraries);
    this.updateCategoryOptions(config.kommune, config.categories);

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

    // Selection mode controls
    const modeRadio = document.querySelector(
      `input[name="ddbEventsMode"][value="${selectionMode}"]`,
    );
    if (modeRadio) modeRadio.checked = true;

    // Search input
    const searchInput = document.getElementById("eventSearchInput");
    if (searchInput) searchInput.value = this.manualSearchTerm || "";

    this.updateModeVisibility(selectionMode);
    this.renderSelectedEventsSummary();
  },

  populateMunicipalityOptions(selectedMunicipality) {
    const kommuneSelect = document.getElementById("kommuneSelect");
    if (!kommuneSelect || !this.currentLibrariesData) return;

    kommuneSelect.innerHTML = `<option value="">${gettext("Select municipality")}</option>`;

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
    if (!element) return;

    if (element instanceof HTMLSelectElement && element.multiple) {
      const normalizedValues = Array.isArray(value)
        ? value.map((item) => String(item).toLowerCase())
        : value
        ? [String(value).toLowerCase()]
        : [];

      Array.from(element.options).forEach((option) => {
        option.selected = normalizedValues.includes(option.value.toLowerCase());
      });
    } else {
      element.value = value ?? "";
    }
  },

  setElementChecked(selector, checked) {
    const element =
      document.getElementById(selector) || document.querySelector(selector);
    if (element) element.checked = checked;
  },

  getSelectionMode() {
    return (
      document.querySelector('input[name="ddbEventsMode"]:checked')?.value ||
      "automatic"
    );
  },

  updateModeVisibility(mode) {
    const automaticFields = document.getElementById("automaticModeFields");
    if (automaticFields) {
      automaticFields.classList.toggle("d-none", mode === "manual");
    }

    const daysInput = document.getElementById("nrOfDaysInput");
    if (daysInput) {
      daysInput.toggleAttribute("required", mode !== "manual");
      daysInput.disabled = mode === "manual";
      if (mode === "manual") {
        daysInput.dataset.prevValue = daysInput.value;
        daysInput.value = "";
      } else if (!daysInput.value && daysInput.dataset.prevValue) {
        daysInput.value = daysInput.dataset.prevValue;
        delete daysInput.dataset.prevValue;
      }
    }

    const manualSearchRow = document.getElementById("manualSearchRow");
    if (manualSearchRow) {
      manualSearchRow.classList.toggle("d-none", mode !== "manual");
    }

    const manualSelectedContainer = document.getElementById(
      "manualSelectedEventsContainer",
    );
    if (manualSelectedContainer) {
      manualSelectedContainer.classList.toggle(
        "d-none",
        mode !== "manual",
      );
    }

    if (mode === "manual") {
      const searchInput = document.getElementById("eventSearchInput");
      if (searchInput) {
        searchInput.value = this.manualSearchTerm || "";
      }
    }
  },

  clearManualSelection() {
    if (!(this.manualSelectedEvents instanceof Map)) {
      this.manualSelectedEvents = new Map();
    } else {
      this.manualSelectedEvents.clear();
    }

    const previewCheckboxes = document.querySelectorAll(
      '#eventPreviewList input[type="checkbox"]',
    );
    previewCheckboxes.forEach((checkbox) => {
      checkbox.checked = false;
      const listItem = checkbox.closest("li");
      if (listItem) listItem.classList.remove("active");
    });

    this.renderSelectedEventsSummary();
  },

  renderSelectedEventsSummary() {
    const list = document.getElementById("manualSelectedEventsList");
    const emptyState = document.getElementById("manualSelectedEventsEmpty");

    if (!list || !emptyState) return;

    const mode = this.getSelectionMode();
    const containerColumn = document.getElementById(
      "manualSelectedEventsContainer",
    );
    if (containerColumn) {
      containerColumn.classList.toggle("d-none", mode !== "manual");
    }

    if (mode !== "manual") return;

    list.innerHTML = "";

    const selections =
      this.manualSelectedEvents instanceof Map
        ? Array.from(this.manualSelectedEvents.values())
        : [];

    if (!selections.length) {
      emptyState.classList.remove("d-none");
      return;
    }

    emptyState.classList.add("d-none");

    selections.forEach((meta) => {
      const item = document.createElement("li");
      item.className =
        "list-group-item d-flex justify-content-between align-items-start";

      const content = document.createElement("div");
      content.className = "me-3";

      const title = document.createElement("div");
      title.className = "fw-bold";
      title.textContent =
        meta?.title || meta?.id || gettext("Untitled event");
      content.appendChild(title);

      const detailParts = [];
      if (meta?.formattedStart) detailParts.push(meta.formattedStart);
      if (meta?.location) detailParts.push(meta.location);
      if (Array.isArray(meta?.libraries) && meta.libraries.length > 0) {
        detailParts.push(meta.libraries.join(", "));
      }

      if (detailParts.length > 0) {
        const details = document.createElement("div");
        details.className = "small text-muted";
        details.textContent = detailParts.join(" | ");
        content.appendChild(details);
      }

      if (meta?.isPlaceholder) {
        const placeholder = document.createElement("div");
        placeholder.className = "small text-muted";
        placeholder.textContent = gettext(
          "Details will load once events are fetched.",
        );
        content.appendChild(placeholder);
      }

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "btn btn-sm btn-outline-secondary";
      removeButton.textContent = gettext("Remove");
      removeButton.setAttribute("data-action", "remove-event");
      removeButton.setAttribute("data-event-id", meta?.normalizedId || "");

      item.appendChild(content);
      item.appendChild(removeButton);
      list.appendChild(item);
    });
  },

  updateManualSelection({
    normalizedId,
    rawId,
    eventData,
    isSelected,
    context,
  }) {
    if (!normalizedId) return;

    if (!(this.manualSelectedEvents instanceof Map)) {
      this.manualSelectedEvents = new Map();
    }

    if (isSelected) {
      const effectiveRawId = rawId || this.getEventPrimaryId(eventData);
      if (!effectiveRawId) return;

      const meta = eventData
        ? this.buildEventMeta(eventData, effectiveRawId, context)
        : {
            id: effectiveRawId,
            normalizedId,
            title: effectiveRawId,
            subtitle: "",
            start: "",
            formattedStart: "",
            location: "",
            libraries: [],
            categories: [],
            url: "",
            isPlaceholder: true,
          };

      meta.id = effectiveRawId;
      meta.normalizedId = normalizedId;
      this.manualSelectedEvents.set(normalizedId, meta);
    } else {
      this.manualSelectedEvents.delete(normalizedId);
    }

    this.renderSelectedEventsSummary();
  },

  updateLibraryOptions(selectedMunicipality, selectedLibraries = []) {
    const container = document.getElementById("libraryCheckboxContainer");
    const placeholder = document.getElementById("libraryCheckboxPlaceholder");
    const grid = document.getElementById("libraryCheckboxGrid");

    if (!container || !placeholder || !grid) return;

    const setPlaceholder = (message) => {
      placeholder.textContent = message;
      placeholder.classList.toggle("d-none", !message);
    };

    grid.innerHTML = "";

    const normalizedSelections = Array.isArray(selectedLibraries)
      ? selectedLibraries.map((library) =>
          String(library).toLowerCase().trim(),
        )
      : selectedLibraries
      ? [String(selectedLibraries).toLowerCase().trim()]
      : [];

    if (!selectedMunicipality) {
      setPlaceholder(gettext("Select a municipality to load libraries."));
      return;
    }

    const municipalityData =
      this.currentLibrariesData &&
      this.currentLibrariesData[selectedMunicipality]
        ? this.currentLibrariesData[selectedMunicipality]
        : null;
    const libraries = municipalityData?.libraries || [];

    if (!Array.isArray(libraries) || libraries.length === 0) {
      setPlaceholder(
        gettext("No libraries are available for the selected municipality."),
      );
      return;
    }

    setPlaceholder("");

    libraries.forEach((libraryName, index) => {
      if (typeof libraryName !== "string") return;

      const normalizedValue = libraryName.toLowerCase().trim();
      const checkboxId = `library-checkbox-${
        normalizedValue.replace(/[^a-z0-9]+/g, "-") || index
      }`;

      const column = document.createElement("div");
      column.className = "col mb-2";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "form-check-input";
      input.id = checkboxId;
      input.value = normalizedValue;
      input.dataset.label = libraryName;
      input.checked = normalizedSelections.includes(normalizedValue);

      const label = document.createElement("label");
      label.className = "form-check-label";
      label.setAttribute("for", checkboxId);
      label.textContent = libraryName;

      const wrapper = document.createElement("div");
      wrapper.className = "form-check";

      wrapper.appendChild(input);
      wrapper.appendChild(label);
      column.appendChild(wrapper);
      grid.appendChild(column);
    });
  },

  updateCategoryOptions(selectedMunicipality, selectedCategories = []) {
    const container = document.getElementById("categoryCheckboxContainer");
    const placeholder = document.getElementById("categoryCheckboxPlaceholder");
    const grid = document.getElementById("categoryCheckboxGrid");

    if (!container || !placeholder || !grid) return;

    const setPlaceholder = (message) => {
      placeholder.textContent = message;
      placeholder.classList.toggle("d-none", !message);
    };

    grid.innerHTML = "";

    const normalizedSelections = Array.isArray(selectedCategories)
      ? selectedCategories.map((category) =>
          String(category).toLowerCase().trim(),
        )
      : selectedCategories
      ? [String(selectedCategories).toLowerCase().trim()]
      : [];

    if (!selectedMunicipality) {
      setPlaceholder(gettext("Select a municipality to load categories."));
      return;
    }

    const municipalityData =
      this.currentLibrariesData &&
      this.currentLibrariesData[selectedMunicipality]
        ? this.currentLibrariesData[selectedMunicipality]
        : null;
    const categories = municipalityData?.categories || [];

    if (!Array.isArray(categories) || categories.length === 0) {
      setPlaceholder(
        gettext("No categories are available for the selected municipality."),
      );
      return;
    }

    setPlaceholder("");

    categories.forEach((categoryName, index) => {
      if (typeof categoryName !== "string") return;

      const normalizedValue = categoryName.toLowerCase().trim();
      const checkboxId = `category-checkbox-${
        normalizedValue.replace(/[^a-z0-9]+/g, "-") || index
      }`;

      const column = document.createElement("div");
      column.className = "col mb-2";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "form-check-input";
      input.id = checkboxId;
      input.value = normalizedValue;
      input.dataset.label = categoryName;
      input.checked = normalizedSelections.includes(normalizedValue);

      const label = document.createElement("label");
      label.className = "form-check-label";
      label.setAttribute("for", checkboxId);
      label.textContent = categoryName;

      const wrapper = document.createElement("div");
      wrapper.className = "form-check";

      wrapper.appendChild(input);
      wrapper.appendChild(label);
      column.appendChild(wrapper);
      grid.appendChild(column);
    });
  },

  setupFormEventListeners() {
    const kommuneSelect = document.getElementById("kommuneSelect");
    const libraryContainer = document.getElementById(
      "libraryCheckboxContainer",
    );
    const categoryContainer = document.getElementById(
      "categoryCheckboxContainer",
    );
    const previewList = document.getElementById("eventPreviewList");

    if (!kommuneSelect || !libraryContainer || !categoryContainer || !previewList) {
      setTimeout(() => this.setupFormEventListeners(), 100);
      return;
    }

    this.eventListenerCleanup = [];

    const kommuneListener = SlideTypeUtils.setupEventListener(
      "kommuneSelect",
      "change",
      function (event) {
        this.updateLibraryOptions(event.target.value, []);
        this.updateCategoryOptions(event.target.value, []);

        if (this.getSelectionMode() === "manual") {
          this.clearManualSelection();
          this.manualSearchTerm = "";
          const searchInput = document.getElementById("eventSearchInput");
          if (searchInput) searchInput.value = "";
        }

        this.schedulePreviewRefresh(100);
      },
      this,
    );
    if (kommuneListener) this.eventListenerCleanup.push(kommuneListener);

    const libraryListener = SlideTypeUtils.setupEventListener(
      "libraryCheckboxContainer",
      "change",
      function (event) {
        if (
          event?.target &&
          event.target instanceof HTMLInputElement &&
          event.target.type === "checkbox"
        ) {
          this.schedulePreviewRefresh(100);
        }
      },
      this,
    );
    if (libraryListener) this.eventListenerCleanup.push(libraryListener);

    const categoryListener = SlideTypeUtils.setupEventListener(
      "categoryCheckboxContainer",
      "change",
      function (event) {
        if (
          event?.target &&
          event.target instanceof HTMLInputElement &&
          event.target.type === "checkbox"
        ) {
          this.schedulePreviewRefresh(100);
        }
      },
      this,
    );
    if (categoryListener) this.eventListenerCleanup.push(categoryListener);

    const automaticModeListener = SlideTypeUtils.setupEventListener(
      "ddbModeAutomatic",
      "change",
      function (event) {
        if (!event?.target?.checked) return;
        this.updateModeVisibility("automatic");
        this.renderSelectedEventsSummary();
        this.schedulePreviewRefresh(0);
      },
      this,
    );
    if (automaticModeListener)
      this.eventListenerCleanup.push(automaticModeListener);

    const manualModeListener = SlideTypeUtils.setupEventListener(
      "ddbModeManual",
      "change",
      function (event) {
        if (!event?.target?.checked) return;
        this.updateModeVisibility("manual");
        this.renderSelectedEventsSummary();
        this.schedulePreviewRefresh(0);
      },
      this,
    );
    if (manualModeListener) this.eventListenerCleanup.push(manualModeListener);

    const daysListener = SlideTypeUtils.setupEventListener(
      "nrOfDaysInput",
      "input",
      function () {
        this.schedulePreviewRefresh(200);
      },
      this,
    );
    if (daysListener) this.eventListenerCleanup.push(daysListener);

    const searchListener = SlideTypeUtils.setupEventListener(
      "eventSearchInput",
      "input",
      function (event) {
        if (this.getSelectionMode() !== "manual") return;
        this.manualSearchTerm = event?.target?.value || "";
        this.schedulePreviewRefresh(300);
      },
      this,
    );
    if (searchListener) this.eventListenerCleanup.push(searchListener);

    const refreshPreviewListener = SlideTypeUtils.setupEventListener(
      "refreshEventsPreviewBtn",
      "click",
      function () {
        this.refreshEventPreview();
      },
      this,
    );
    if (refreshPreviewListener)
      this.eventListenerCleanup.push(refreshPreviewListener);

    const previewSelectionListener = SlideTypeUtils.setupEventListener(
      "eventPreviewList",
      "change",
      function (event) {
        if (this.getSelectionMode() !== "manual") return;
        const target = event?.target;
        if (
          !(target instanceof HTMLInputElement) ||
          target.type !== "checkbox"
        ) {
          return;
        }

        const rawId = target.value;
        const normalizedId =
          target.dataset.normalizedId || this.normalizeEventId(rawId);
        if (!normalizedId) return;

        const eventInfo = this.latestFetchedEvents?.get(normalizedId);
        const context = this.latestLookupContext || {
          libraryLookup: this.getLibraryLookup(
            document.getElementById("kommuneSelect")?.value,
          ),
          categoryLookup: this.getCategoryLookup(
            document.getElementById("kommuneSelect")?.value,
          ),
        };

        this.updateManualSelection({
          normalizedId,
          rawId: rawId || eventInfo?.id || "",
          eventData: eventInfo?.event,
          isSelected: target.checked,
          context,
        });

        const listItem = target.closest("li");
        if (listItem) {
          listItem.classList.toggle("active", target.checked);
        }
      },
      this,
    );
    if (previewSelectionListener)
      this.eventListenerCleanup.push(previewSelectionListener);

    const selectedListListener = SlideTypeUtils.setupEventListener(
      "manualSelectedEventsList",
      "click",
      function (event) {
        const target = event?.target;
        if (!target || target.getAttribute("data-action") !== "remove-event")
          return;

        const normalizedId = target.getAttribute("data-event-id");
        if (!normalizedId) return;

        this.updateManualSelection({
          normalizedId,
          rawId: this.manualSelectedEvents?.get(normalizedId)?.id || "",
          eventData: null,
          isSelected: false,
          context: this.latestLookupContext || {
            libraryLookup: this.getLibraryLookup(
              document.getElementById("kommuneSelect")?.value,
            ),
            categoryLookup: this.getCategoryLookup(
              document.getElementById("kommuneSelect")?.value,
            ),
          },
        });

        const checkbox = document.querySelector(
          `#eventPreviewList input[type="checkbox"][data-normalized-id="${normalizedId}"]`,
        );
        if (checkbox) {
          checkbox.checked = false;
          const listItem = checkbox.closest("li");
          if (listItem) listItem.classList.remove("active");
        }
      },
      this,
    );
    if (selectedListListener)
      this.eventListenerCleanup.push(selectedListListener);

    // Handle layout selection changes
    const layoutRadios = document.querySelectorAll('input[name="layout"]');
    if (!this.boundUpdateLayoutVisuals) {
      this.boundUpdateLayoutVisuals = this.updateLayoutVisuals.bind(this);
    }
    this.layoutRadioCleanup = Array.from(layoutRadios);
    this.layoutRadioCleanup.forEach((radio) => {
      radio.addEventListener("change", this.boundUpdateLayoutVisuals);
    });

    // Set initial state
    this.updateLayoutVisuals();
  },

  updateLayoutVisuals() {
    const layoutRadios = document.querySelectorAll('input[name="layout"]');
    const visualRadios = document.querySelectorAll(
      'input[name="layout-visual"]',
    );
    const selectedValue = document.querySelector(
      'input[name="layout"]:checked',
    )?.value;

    layoutRadios.forEach((r, index) => {
      const card = r.closest("label").querySelector(".card");
      if (r.checked) {
        card.classList.add("bg-secondary-accent-lighter");
        if (visualRadios[index]) visualRadios[index].checked = true;
      } else {
        card.classList.remove("bg-secondary-accent-lighter");
        if (visualRadios[index]) visualRadios[index].checked = false;
      }
    });
  },

  cleanupFormEventListeners() {
    if (Array.isArray(this.eventListenerCleanup)) {
      this.eventListenerCleanup.forEach((listener) =>
        listener?.cleanup?.(),
      );
    } else if (this.eventListenerCleanup?.cleanup) {
      this.eventListenerCleanup.cleanup();
    }
    this.eventListenerCleanup = [];

    if (Array.isArray(this.layoutRadioCleanup) && this.boundUpdateLayoutVisuals) {
      this.layoutRadioCleanup.forEach((radio) => {
        if (radio && radio.removeEventListener) {
          radio.removeEventListener("change", this.boundUpdateLayoutVisuals);
        }
      });
    }
    this.layoutRadioCleanup = [];
    this.boundUpdateLayoutVisuals = null;

    if (this.previewAbortController) {
      this.previewAbortController.abort();
      this.previewAbortController = null;
    }

    if (this.previewRefreshTimeout) {
      clearTimeout(this.previewRefreshTimeout);
      this.previewRefreshTimeout = null;
    }

    this.previewElements = null;
    this.currentLibrariesData = null;

    if (this.manualSelectedEvents instanceof Map) {
      this.manualSelectedEvents.clear();
    }
    this.manualSelectedEvents = null;
    this.manualSearchTerm = "";
    if (this.latestFetchedEvents instanceof Map) {
      this.latestFetchedEvents.clear();
    }
    this.latestFetchedEvents = null;
    this.latestLookupContext = null;
  },

  schedulePreviewRefresh(delay = 250) {
    if (typeof window === "undefined") return;

    if (this.previewRefreshTimeout) {
      clearTimeout(this.previewRefreshTimeout);
    }

    this.previewRefreshTimeout = window.setTimeout(() => {
      this.previewRefreshTimeout = null;
      this.refreshEventPreview();
    }, Math.max(delay, 0));
  },

  ensurePreviewElements() {
    if (
      this.previewElements &&
      this.previewElements.status &&
      this.previewElements.list &&
      document.body.contains(this.previewElements.status) &&
      document.body.contains(this.previewElements.list)
    ) {
      return this.previewElements;
    }

    const status = document.getElementById("eventPreviewStatus");
    const list = document.getElementById("eventPreviewList");

    if (!status || !list) {
      this.previewElements = null;
      return null;
    }

    this.previewElements = { status, list };
    return this.previewElements;
  },

  renderPreviewMessage(message) {
    const elements = this.ensurePreviewElements();
    if (!elements) return;

    elements.status.textContent = message;
    elements.list.innerHTML = "";
  },

  renderPreviewLoading() {
    const elements = this.ensurePreviewElements();
    if (!elements) return;

    elements.status.textContent = gettext("Loading preview...");
    elements.list.innerHTML = "";
  },

  renderPreviewError(message) {
    this.renderPreviewMessage(message);
  },

  async refreshEventPreview() {
    const elements = this.ensurePreviewElements();
    if (!elements) return;

    const config = this.extractFormData();
    const kommune = (config.kommune || "").trim();
    const selectionMode = config.selectionMode || this.getSelectionMode();
    const libraries = Array.isArray(config.libraries)
  ? config.libraries
      .map((library) => String(library).toLowerCase().trim())
      .filter((library) => library.length > 0)
      : [];
    const categories = Array.isArray(config.categories)
  ? config.categories
      .map((category) => String(category).toLowerCase().trim())
      .filter((category) => category.length > 0)
      : [];

    if (!kommune) {
      this.renderPreviewMessage(
        gettext("Select a municipality to preview events."),
      );
      return;
    }

    if (libraries.length === 0) {
      this.renderPreviewMessage(
        gettext("Select at least one library to preview events."),
      );
      return;
    }

    const params = new URLSearchParams();
    params.set("kommune", kommune);

    if (selectionMode === "manual") {
      params.set("days", "0");
    } else {
      const days = parseInt(config.days, 10);
      if (!Number.isNaN(days) && days >= 0) {
        params.set("days", String(days));
      } else {
        params.set("days", "0");
      }
    }

    const joinedLibraries = libraries.join(",");
    params.set("libraries", joinedLibraries);
    params.set("branches", joinedLibraries);
    params.set("library", libraries[0]);

    if (categories.length > 0) {
      const joinedCategories = categories.join(",");
      params.set("categories", joinedCategories);
      params.set("category", categories[0]);
    }

    if (selectionMode === "manual" && this.manualSearchTerm) {
      const trimmedSearch = this.manualSearchTerm.trim();
      if (trimmedSearch) {
        params.set("search", trimmedSearch);
      }
    }

    if (this.previewAbortController) {
      this.previewAbortController.abort();
    }
    this.previewAbortController = new AbortController();

    this.renderPreviewLoading();

    try {
      const response = await fetch(
        `${BASE_URL}/api/ddb/events?${params.toString()}`,
        {
          method: "GET",
          headers: this.buildAuthHeaders(),
          signal: this.previewAbortController.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const events = await response.json();
      this.renderPreviewEvents(events, {
        kommune,
        selectedLibraries: libraries,
        selectedCategories: categories,
        selectionMode,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      console.error("Error fetching DDB preview events:", error);
      this.renderPreviewError(
        gettext("Could not load events for the selected filters."),
      );
    } finally {
      this.previewAbortController = null;
    }
  },

  renderPreviewEvents(
    events,
    { kommune, selectedLibraries, selectedCategories, selectionMode } = {},
  ) {
    const elements = this.ensurePreviewElements();
    if (!elements) return;

    const { status, list } = elements;
    list.innerHTML = "";

    const mode = selectionMode === "manual" ? "manual" : "automatic";

    if (!Array.isArray(events) || events.length === 0) {
      status.textContent =
        mode === "manual"
          ? gettext(
              "No events match the current filters. Adjust the filters or search to find events to select.",
            )
          : gettext("No events match the current filters.");

      if (mode === "manual") {
        if (this.latestFetchedEvents instanceof Map) {
          this.latestFetchedEvents.clear();
        }
        this.renderSelectedEventsSummary();
      }
      return;
    }

    const baseStatus = `${gettext("Events matching current filters:")} ${events.length}`;
    status.textContent =
      mode === "manual"
        ? `${baseStatus}. ${gettext("Tick the events to include in the slide.")}`
        : baseStatus;

    const selectedLibrarySet = new Set(
      (selectedLibraries || []).map((library) =>
        String(library).toLowerCase().trim(),
      ),
    );
    const selectedCategorySet = new Set(
      (selectedCategories || []).map((category) =>
        String(category).toLowerCase().trim(),
      ),
    );
    const libraryLookup = this.getLibraryLookup(kommune);
    const categoryLookup = this.getCategoryLookup(kommune);

    this.latestLookupContext = {
      kommune,
      libraryLookup,
      categoryLookup,
    };

    if (this.latestFetchedEvents instanceof Map) {
      this.latestFetchedEvents.clear();
    } else {
      this.latestFetchedEvents = new Map();
    }

    events.forEach((event, index) => {
      const item = document.createElement("li");
      item.className = "list-group-item py-2";

      const rawId = this.getEventPrimaryId(event);
      const normalizedId = this.normalizeEventId(rawId);

      let contentTarget = item;

      if (mode === "manual") {
        item.classList.add("d-flex", "align-items-start", "gap-2");
        const checkboxWrapper = document.createElement("div");
        checkboxWrapper.className = "form-check mt-1 me-2";

        const checkboxId = `manual-event-${index}`;
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "form-check-input";
        checkbox.id = checkboxId;
        checkbox.value = rawId || "";
        if (normalizedId) {
          checkbox.dataset.normalizedId = normalizedId;
        } else {
          checkbox.disabled = true;
        }

        const isSelected =
          normalizedId &&
          this.manualSelectedEvents instanceof Map &&
          this.manualSelectedEvents.has(normalizedId);

        checkbox.checked = Boolean(isSelected);
        checkboxWrapper.appendChild(checkbox);
        item.appendChild(checkboxWrapper);

        contentTarget = document.createElement("div");
        contentTarget.className = "flex-grow-1";
        item.appendChild(contentTarget);

        if (isSelected) {
          item.classList.add("active");
        }
      }

      const title = document.createElement("strong");
      title.textContent = event?.title || gettext("Untitled event");
      contentTarget.appendChild(title);

      const metaParts = [];
      const startDate = this.formatDateTime(event?.date_time?.start);
      if (startDate) metaParts.push(startDate);

      const libraryMatches = this.getEventLibraryMatches(
        event,
        selectedLibrarySet,
        libraryLookup,
      );

      if (libraryMatches.length > 0) {
        metaParts.push(libraryMatches.join(", "));
      } else {
        const fallbackLocation =
          event?.address?.location ||
          event?.address?.street ||
          event?.location ||
          event?.venue_name ||
          "";
        if (fallbackLocation) metaParts.push(fallbackLocation);
      }

      const categoryMatches = this.getEventCategoryMatches(
        event,
        selectedCategorySet,
        categoryLookup,
      );
      if (categoryMatches.length > 0) {
        metaParts.push(
          `${gettext("Categories")}: ${categoryMatches.join(", ")}`,
        );
      }

      if (metaParts.length > 0) {
        const meta = document.createElement("div");
        meta.className = "small text-muted";
        meta.textContent = metaParts.join(" | ");
        contentTarget.appendChild(meta);
      }

      if (event?.subtitle) {
        const subtitle = document.createElement("div");
        subtitle.className = "small text-muted";
        subtitle.textContent = event.subtitle;
        contentTarget.appendChild(subtitle);
      }

      if (mode === "manual" && !normalizedId) {
        const warning = document.createElement("div");
        warning.className = "small text-muted";
        warning.textContent = gettext(
          "This event cannot be selected because it is missing an identifier.",
        );
        contentTarget.appendChild(warning);
      }

      if (normalizedId) {
        this.latestFetchedEvents.set(normalizedId, {
          id: rawId,
          event,
        });

        if (
          mode === "manual" &&
          this.manualSelectedEvents instanceof Map &&
          this.manualSelectedEvents.has(normalizedId)
        ) {
          const meta = this.buildEventMeta(
            event,
            rawId,
            this.latestLookupContext,
          );
          this.manualSelectedEvents.set(normalizedId, meta);
        }
      }

      list.appendChild(item);
    });

    if (mode === "manual") {
      this.renderSelectedEventsSummary();
    }
  },

  getLibraryLookup(kommune) {
    const lookup = new Map();

    if (
      kommune &&
      this.currentLibrariesData &&
      this.currentLibrariesData[kommune] &&
      Array.isArray(this.currentLibrariesData[kommune].libraries)
    ) {
      this.currentLibrariesData[kommune].libraries.forEach((libraryName) => {
        if (typeof libraryName === "string") {
          lookup.set(libraryName.toLowerCase(), libraryName);
        }
      });
    }

    return lookup;
  },

  getCategoryLookup(kommune) {
    const lookup = new Map();

    if (
      kommune &&
      this.currentLibrariesData &&
      this.currentLibrariesData[kommune] &&
      Array.isArray(this.currentLibrariesData[kommune].categories)
    ) {
      this.currentLibrariesData[kommune].categories.forEach((categoryName) => {
        if (typeof categoryName === "string") {
          lookup.set(categoryName.toLowerCase(), categoryName);
        }
      });
    }

    return lookup;
  },

  getEventLibraryMatches(event, selectedSet, libraryLookup) {
    const matches = new Set();

    const candidateValues = [];
    if (Array.isArray(event?.branches)) {
      candidateValues.push(...event.branches);
    }
    if (event?.branch) candidateValues.push(event.branch);
    if (event?.address?.location) candidateValues.push(event.address.location);
    if (event?.location) candidateValues.push(event.location);
    if (event?.venue_name) candidateValues.push(event.venue_name);

    candidateValues.forEach((value) => {
      if (value === null || value === undefined) return;
      const normalized = String(value).toLowerCase();
      if (!normalized) return;
      if (selectedSet.size === 0 || selectedSet.has(normalized)) {
        matches.add(libraryLookup.get(normalized) || String(value));
      }
    });

    return Array.from(matches);
  },

  getEventCategoryMatches(event, selectedSet, categoryLookup) {
    const matches = new Set();

    const candidateValues = [];
    if (Array.isArray(event?.categories)) {
      candidateValues.push(...event.categories);
    } else if (event?.categories !== undefined && event?.categories !== null) {
      candidateValues.push(event.categories);
    }

    candidateValues.forEach((value) => {
      if (value === null || value === undefined) return;
      const normalized = String(value).trim().toLowerCase();
      if (!normalized) return;
      if (selectedSet.size === 0 || selectedSet.has(normalized)) {
        matches.add(categoryLookup.get(normalized) || String(value).trim());
      }
    });

    return Array.from(matches);
  },

  formatDateTime(isoString) {
    if (!isoString) return "";

    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "";

    const datePart = date.toLocaleDateString("da-DK", {
      day: "numeric",
      month: "long",
    });
    const timePart = date.toLocaleTimeString("da-DK", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return `${datePart} kl. ${timePart}`;
  },

  normalizeEventId(value) {
    if (value === null || value === undefined) return "";
    const text = String(value).trim();
    return text ? text.toLowerCase() : "";
  },

  getEventIdCandidates(event) {
    const candidates = [];
    if (!event || typeof event !== "object") return candidates;

    const keys = [
      "id",
      "event_id",
      "eventId",
      "record_id",
      "recordId",
      "uuid",
      "slug",
    ];

    keys.forEach((key) => {
      const value = event[key];
      if (value === null || value === undefined) return;
      const text = String(value).trim();
      if (text) candidates.push(text);
    });

    if (typeof event?.url === "string") {
      const text = event.url.trim();
      if (text) candidates.push(text);
    }

    const title = event?.title;
    const start = event?.date_time?.start;
    if (title && start) {
      const text = `${title}|${start}`.trim();
      if (text) candidates.push(text);
    }

    return candidates;
  },

  getEventPrimaryId(event) {
    const candidates = this.getEventIdCandidates(event);
    return candidates.length > 0 ? candidates[0] : "";
  },

  buildEventMeta(event, rawId, context = {}) {
    const normalizedId = this.normalizeEventId(rawId);
    const libraryLookup = context.libraryLookup || new Map();
    const categoryLookup = context.categoryLookup || new Map();

    const libraryMatches = this.getEventLibraryMatches(
      event,
      new Set(),
      libraryLookup,
    );

    const fallbackLocation =
      event?.address?.location ||
      event?.address?.street ||
      event?.location ||
      event?.venue_name ||
      event?.branch ||
      "";

    const categories = this.getEventCategoryMatches(
      event,
      new Set(),
      categoryLookup,
    );

    return {
      id: rawId,
      normalizedId,
      title: event?.title || "",
      subtitle: event?.subtitle || "",
      start: event?.date_time?.start || "",
      formattedStart: this.formatDateTime(event?.date_time?.start),
      location: libraryMatches.length > 0
        ? libraryMatches.join(", ")
        : fallbackLocation,
      libraries: libraryMatches,
      categories,
      url: event?.url || "",
      isPlaceholder: false,
    };
  },

  async generateSlide(config) {
    const libraries = Array.isArray(config.libraries)
      ? config.libraries
      : config.library
      ? [config.library]
      : [];
    const categories = Array.isArray(config.categories)
      ? config.categories
      : config.category
      ? [config.category]
      : [];

    const selectionMode = config.selectionMode === "manual" ? "manual" : "automatic";
    const selectedEventIds = Array.isArray(config.selectedEventIds)
      ? config.selectedEventIds.filter((id) => typeof id === "string" && id.trim().length > 0)
      : [];

    const params = {
      kommune: config.kommune || "",
      days:
        selectionMode === "manual"
          ? "0"
          : config.days || "7",
      slideDuration: config.slideDuration || "",
      layout: config.layout || "vertical",
      showTitle: config.showTitle === false ? "false" : "true",
      showSubtitle: config.showSubtitle ? "true" : "false",
      showDescription: config.showDescription ? "true" : "false",
      showQr: config.showQr === false ? "false" : "true",
      showDateTime: config.showDateTime === false ? "false" : "true",
      showLocation: config.showLocation === false ? "false" : "true",
      selectionMode,
    };

    if (libraries.length > 0) {
      params.libraries = libraries.join(",");
      params.library = libraries[0];
    } else if (config.library) {
      params.library = config.library;
    }

    if (categories.length > 0) {
      params.categories = categories.join(",");
      params.category = categories[0];
    } else if (config.category) {
      params.category = config.category;
    }

    if (selectionMode === "manual" && selectedEventIds.length > 0) {
      params.eventIds = selectedEventIds.join(",");
    }

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

    const selectionMode = this.getSelectionMode();

    const selectedLibraries = Array.from(
      document.querySelectorAll(
        "#libraryCheckboxContainer input[type=\"checkbox\"]:checked",
      ),
    )
      .map((input) => input.value)
      .map((value) => String(value).toLowerCase().trim())
      .filter((value) => value.length > 0);

    const selectedCategories = Array.from(
      document.querySelectorAll(
        "#categoryCheckboxContainer input[type=\"checkbox\"]:checked",
      ),
    )
      .map((input) => input.value)
      .map((value) => String(value).toLowerCase().trim())
      .filter((value) => value.length > 0);

    const selectedEventIds =
      this.manualSelectedEvents instanceof Map
        ? Array.from(this.manualSelectedEvents.values())
            .map((meta) => meta?.id)
            .filter((id) => typeof id === "string" && id.trim().length > 0)
        : [];

    return {
      kommune: getElementValue("kommuneSelect"),
      libraries: selectedLibraries,
      library: selectedLibraries[0] || "",
      categories: selectedCategories,
      category: selectedCategories[0] || "",
      days:
        selectionMode === "manual"
          ? "0"
          : getElementValue("nrOfDaysInput"),
      slideDuration: getElementValue("slideDurationInput"),
      layout: getSelectedRadio("layout"),
      showTitle: getElementChecked("title"),
      showSubtitle: getElementChecked("subtitle"),
      showDateTime: getElementChecked("dateTime"),
      showDescription: getElementChecked("description"),
      showQr: getElementChecked("qrCode"),
      showLocation: getElementChecked("location"),
      selectionMode,
      selectedEventIds,
    };
  },

  validateSlide() {
    const data = this.extractFormData();

    const requiredFields = {
      municipality: data.kommune,
      libraries: data.libraries.join(","),
    };
    const labels = {
      municipality: "municipality",
      libraries: "library",
    };

    if (data.selectionMode === "manual") {
      requiredFields.events = data.selectedEventIds.join(",");
      labels.events = "event";
    } else {
      requiredFields.days = data.days;
      labels.days = "number of days";
    }

    return SlideTypeUtils.validateRequired(requiredFields, labels);
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
      config: {
        ...config,
        libraries: Array.isArray(config.libraries)
          ? config.libraries
          : config.library
          ? [config.library]
          : [],
        categories: Array.isArray(config.categories)
          ? config.categories
          : config.category
          ? [config.category]
          : [],
      },
      integrationName: "Det Digitale Folkebibliotek Events API",
    };
  },
};
