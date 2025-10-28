// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * frontendSlideTypeModal.js
 * Simple frontend slide type modal
 ************************************************************/

import { slideTypeRegistry } from "./slideTypeRegistry.js";
import MiniSearch from "minisearch";
import { addIframe } from "../elements/iframeElement.js";
import * as bootstrap from "bootstrap";
import { gettext } from "../../../../utils/locales.js";

class FrontendSlideTypeModal {
  constructor() {
    this.modal = null;
    this.modalElement = null;
    this.currentSlideTypeId = null;
    this.existingConfig = null;
    this.initialized = false;

    // New properties for table functionality
    this.allSlideTypes = [];
    this.visibleSlideTypes = [];
    this.selectedCategories = new Set();
    this.currentSortKey = null;
    this.currentSortDir = "asc";
    this.searchTerm = "";

    // Initialize MiniSearch
    this.miniSearch = new MiniSearch({
      fields: ["name", "description", "categoryName"], // fields to index for full-text search
      storeFields: ["id", "name", "description", "categoryName", "categoryId"], // fields to return with search results
    });
  }

  async initialize() {
    if (this.initialized) return;

    // Ensure slideTypeRegistry is loaded
    await slideTypeRegistry.initialize();

    // Create the modal HTML and add to DOM
    this.initializeModal();

    // Setup event listeners
    this.setupEventListeners();

    this.initialized = true;
  }

  createModalHTML() {
    return `
      <div class="modal fade" id="frontendSlideTypeModal" tabindex="-1" aria-labelledby="frontendSlideTypeModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-xl">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="frontendSlideTypeModalLabel">${gettext("Add Dynamic Content")}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <!-- Overview Section (Three-column layout) -->
              <div id="slideTypeOverviewRow" style="display: block;">
                <div class="row">
                  <!-- Categories Column -->
                  <div class="col-md-3">
                    <h6>${gettext("Categories")}</h6>
                    <div id="categoryCheckboxes">
                      <!-- Category checkboxes will be populated here -->
                    </div>
                  </div>
                  
                  <!-- Search and Table Column -->
                  <div class="col-md-9">
                    <div class="mb-3">
                      <input type="text" class="form-control" id="slideTypeSearchInput" placeholder="${gettext('Search slide types...')}">
                    </div>
                    
                    <div class="table-responsive">
                      <table class="table table-hover" id="slideTypeTable">
                        <thead>
                          <tr>
                            <th class="sortable-col" data-sort-key="name" style="cursor: pointer;">
                              ${gettext("Name")} ↕
                            </th>
                            <th class="sortable-col" data-sort-key="categoryName" style="cursor: pointer;">
                              ${gettext("Category")} ↕
                            </th>
                            <th>${gettext("Action")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <!-- Slide type rows will be populated here -->
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Form Section -->
              <div id="slideTypeContainer" style="display: none;">
                <div class="row">
                  <div class="col-12">
                    <div id="dynamicSlideFormContainer">
                      <!-- Dynamic slide configuration form will be populated here -->
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer" id="slideTypeModalFooter">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${gettext("Cancel")}</button>
              <button type="button" class="btn btn-primary" id="generateSlideBtn" style="display: none;">${gettext("Generate Slide")}</button>
            </div>
          </div>
        </div>
      </div>
      
      <style>
        .modal-xl .modal-body {
          min-height: 500px;
        }
        
        .sortable-col:hover {
          background-color: #f8f9fa;
        }
        
        .sort-asc:after {
          content: " ▲";
        }
        
        .sort-desc:after {
          content: " ▼";
        }
        
        #categoryCheckboxes .form-check {
          margin-bottom: 0.25rem;
        }
        
        #slideTypeTable tbody tr:hover {
          background-color: #f8f9fa;
        }
        
        .btn-sm {
          font-size: 0.8rem;
          padding: 0.25rem 0.5rem;
        }
        
        .is-invalid {
          border-color: #dc3545 !important;
          box-shadow: 0 0 0 0.2rem rgba(220, 53, 69, 0.25) !important;
        }
        
        .is-invalid:focus {
          border-color: #dc3545 !important;
          box-shadow: 0 0 0 0.2rem rgba(220, 53, 69, 0.25) !important;
        }
      </style>
    `;
  }

  initializeModal() {
    // Remove existing modal if it exists
    const existingModal = document.getElementById("frontendSlideTypeModal");
    if (existingModal) {
      existingModal.remove();
    }

    const modalHTML = this.createModalHTML();

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    this.modalElement = document.getElementById("frontendSlideTypeModal");
    this.modal = new bootstrap.Modal(this.modalElement);
  }

  setupEventListeners() {
    // Category checkbox filtering
    this.modalElement.addEventListener("change", (e) => {
      if (e.target.classList.contains("category-checkbox")) {
        this.handleCategoryFilter();
      }
    });

    // Search functionality
    const searchInput = this.modalElement.querySelector(
      "#slideTypeSearchInput",
    );

    if (searchInput) {
      searchInput.addEventListener("input", () => this.handleSearch());
      searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          this.handleSearch();
        }
      });
    }

    // Table sorting
    this.modalElement.addEventListener("click", (e) => {
      if (e.target.classList.contains("sortable-col")) {
        const sortKey = e.target.dataset.sortKey;
        this.handleSort(sortKey);
      }
    });

    // Slide type row click (Open button)
    this.modalElement.addEventListener("click", (e) => {
      if (e.target.classList.contains("open-slide-type-btn")) {
        const slideTypeId = parseInt(e.target.dataset.slideTypeId);
        this.selectSlideType(slideTypeId);
      }
    });

    // Form submission
    this.modalElement.addEventListener("click", async (e) => {
      if (e.target.id === "generateSlideBtn") {
        await this.generateSlide();
      }
    });

    // Back to overview button
    this.modalElement.addEventListener("click", (e) => {
      if (e.target.id === "backToOverviewBtn") {
        this.showOverview();
      }
    });
  }

  async show(existingElement = null) {
    if (!this.initialized) {
      console.error("Modal not initialized. Call initialize() first.");
      return;
    }

    // Ensure registry is fully loaded
    await slideTypeRegistry.initialize();

    this.existingConfig = existingElement?.config || null;
    this.prepareSlideTypes();

    // Show modal first
    this.modal.show();

    // Wait for modal to be fully rendered, then populate
    setTimeout(() => {
      this.populateCategoryCheckboxes();
      this.populateSlideTypesTable();
      this.showOverview();
    }, 100);

    // If editing existing element, preselect its slide type
    if (existingElement?.slideTypeId) {
      setTimeout(() => {
        // Try to resolve numeric id first
        const candidate = existingElement.slideTypeId;
        const numeric = Number(candidate);
        if (
          Number.isInteger(numeric) &&
          slideTypeRegistry.getSlideType(numeric)
        ) {
          this.selectSlideType(numeric);
          return;
        }

        // If candidate is a string identifier (legacy), attempt to find the
        // registered slide type whose metadata matches that identifier.
        const lowerCandidate = String(candidate).toLowerCase();
        for (const [key, slideType] of slideTypeRegistry.slideTypes.entries()) {
          // Check common properties that may match the legacy id
          if (
            (slideType.slideTypeId &&
              String(slideType.slideTypeId).toLowerCase() === lowerCandidate) ||
            (slideType.id && String(slideType.id) === String(candidate)) ||
            (slideType.name &&
              slideType.name.toLowerCase().includes(lowerCandidate))
          ) {
            this.selectSlideType(key);
            return;
          }
        }

        // Fallback: try selecting by numeric conversion again (no-op if invalid)
        this.selectSlideType(numeric);
      }, 200);
    }
  }

  prepareSlideTypes() {
    const categories = slideTypeRegistry.getCategories();
    const allowedSlideTypes = slideTypeRegistry.getAllowedSlideTypes();
    this.allSlideTypes = [];

    categories.forEach((category) => {
      category.slideTypes.forEach((slideType) => {
        // Only include slide types that are in the allowed list
        if (allowedSlideTypes.includes(slideType.id)) {
          this.allSlideTypes.push({
            ...slideType,
            categoryName: category.name,
            categoryId: category.id,
          });
        }
      });
    });

    this.visibleSlideTypes = [...this.allSlideTypes];

    // Index slide types in MiniSearch
    this.miniSearch.removeAll();
    this.miniSearch.addAll(this.allSlideTypes);
  }

  populateCategoryCheckboxes() {
    const categories = slideTypeRegistry.getCategories();
    const allowedSlideTypes = slideTypeRegistry.getAllowedSlideTypes();
    // Use querySelector within the modal instead of global getElementById
    const container = this.modalElement.querySelector("#categoryCheckboxes");

    if (!container) {
      console.error("Category container not found");
      return;
    }

    let html = "";
    categories.forEach((category) => {
      // Count only allowed slide types in this category
      const allowedSlideTypesInCategory = category.slideTypes.filter(
        (slideType) => allowedSlideTypes.includes(slideType.id),
      );

      if (allowedSlideTypesInCategory.length > 0) {
        html += `
          <div class="form-check">
            <input class="form-check-input category-checkbox" type="checkbox" value="${category.id}" id="category-${category.id}" checked>
            <label class="form-check-label" for="category-${category.id}">
              ${category.name} (${allowedSlideTypesInCategory.length})
            </label>
          </div>
        `;
      }
    });

    container.innerHTML = html;
  }

  populateSlideTypesTable() {
    // Use querySelector within the modal instead of global querySelector
    const tbody = this.modalElement.querySelector("#slideTypeTable tbody");

    if (!tbody) {
      console.error("Table tbody not found");
      return;
    }

    let html = "";
    this.visibleSlideTypes.forEach((slideType) => {
      html += `
        <tr>
          <td>${slideType.name}</td>
          <td>${slideType.categoryName}</td>
          <td>
            <button type="button" class="btn btn-primary btn-sm open-slide-type-btn" data-slide-type-id="${slideType.id}">
              Open
            </button>
          </td>
        </tr>
      `;
    });

    if (html === "") {
      html =
        '<tr><td colspan="3" class="text-center text-muted">No slide types match your filters</td></tr>';
    }

    tbody.innerHTML = html;
  }

  handleCategoryFilter() {
    const checkboxes = document.querySelectorAll(".category-checkbox");
    this.selectedCategories.clear();

    checkboxes.forEach((cb) => {
      if (cb.checked) {
        this.selectedCategories.add(parseInt(cb.value));
      }
    });

    this.filterAndRenderTable();
  }

  handleSearch() {
    const searchInput = this.modalElement.querySelector(
      "#slideTypeSearchInput",
    );
    this.searchTerm = searchInput.value.toLowerCase().trim();
    this.filterAndRenderTable();
  }

  handleSort(sortKey) {
    if (this.currentSortKey === sortKey) {
      this.currentSortDir = this.currentSortDir === "asc" ? "desc" : "asc";
    } else {
      this.currentSortKey = sortKey;
      this.currentSortDir = "asc";
    }

    this.visibleSlideTypes.sort((a, b) => {
      let aVal = a[sortKey] || "";
      let bVal = b[sortKey] || "";

      if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      let result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return this.currentSortDir === "desc" ? -result : result;
    });

    this.populateSlideTypesTable();
    this.updateSortHeaders();
  }

  updateSortHeaders() {
    document.querySelectorAll(".sortable-col").forEach((th) => {
      th.classList.remove("sort-asc", "sort-desc");
      if (th.dataset.sortKey === this.currentSortKey) {
        th.classList.add(`sort-${this.currentSortDir}`);
      }
    });
  }

  filterAndRenderTable() {
    let filteredSlideTypes = [...this.allSlideTypes];

    // Apply search filter using MiniSearch if there's a search term
    if (this.searchTerm) {
      const searchResults = this.miniSearch.search(this.searchTerm, {
        fuzzy: 0.2,
        prefix: true,
      });
      const searchResultIds = new Set(searchResults.map((result) => result.id));
      filteredSlideTypes = this.allSlideTypes.filter((slideType) =>
        searchResultIds.has(slideType.id),
      );
    }

    // Apply category filter
    if (this.selectedCategories.size > 0) {
      filteredSlideTypes = filteredSlideTypes.filter((slideType) =>
        this.selectedCategories.has(slideType.categoryId),
      );
    }

    this.visibleSlideTypes = filteredSlideTypes;
    this.populateSlideTypesTable();
  }

  showOverview() {
    const overviewRow = this.modalElement.querySelector(
      "#slideTypeOverviewRow",
    );
    const containerRow = this.modalElement.querySelector("#slideTypeContainer");
    const generateBtn = this.modalElement.querySelector("#generateSlideBtn");

    if (overviewRow) {
      overviewRow.style.display = "block";
    }
    if (containerRow) {
      containerRow.style.display = "none";
    }

    // Hide the Generate Slide button in overview
    if (generateBtn) {
      generateBtn.style.display = "none";
    }

    const titleElement = this.modalElement.querySelector(
      "#frontendSlideTypeModalLabel",
    );
    if (titleElement) {
      titleElement.textContent = gettext("Add Dynamic Content");
    }
    // If a slide type was previously active, ensure it cleans up its event listeners
    // so handlers (like the Frontdesk click handler) don't persist and hijack
    // the centralized generate button when another slide type is selected.
    if (this.currentSlideTypeId) {
      const prev = slideTypeRegistry.getSlideType(this.currentSlideTypeId);
      if (prev && typeof prev.cleanupFormEventListeners === "function") {
        try {
          prev.cleanupFormEventListeners();
        } catch (e) {
          console.debug("Error during slide type cleanup:", e);
        }
      }
      this.currentSlideTypeId = null;
    }
  }

  showForm() {
    document.getElementById("slideTypeOverviewRow").style.display = "none";
    document.getElementById("slideTypeContainer").style.display = "block";

    const slideType = slideTypeRegistry.getSlideType(this.currentSlideTypeId);
    if (slideType) {
      document.getElementById("frontendSlideTypeModalLabel").textContent =
        slideType.name;
    }
  }

  hide() {
    // Cleanup slide type specific resources
    if (this.currentSlideTypeId) {
      const slideType = slideTypeRegistry.getSlideType(this.currentSlideTypeId);
      if (
        slideType &&
        typeof slideType.cleanupFormEventListeners === "function"
      ) {
        slideType.cleanupFormEventListeners();
      }
    }

    if (this.modal) {
      this.modal.hide();
    }
  }

  async selectSlideType(slideTypeId) {
    // If a different slide type is currently active, call its cleanup so that
    // any event listeners it registered (for example on #generateSlideBtn)
    // are removed before the new slide type is shown.
    if (this.currentSlideTypeId && this.currentSlideTypeId !== slideTypeId) {
      const prev = slideTypeRegistry.getSlideType(this.currentSlideTypeId);
      if (prev && typeof prev.cleanupFormEventListeners === "function") {
        try {
          prev.cleanupFormEventListeners();
        } catch (e) {
          console.debug("Error during previous slide type cleanup:", e);
        }
      }
    }

    this.currentSlideTypeId = slideTypeId;
    await this.showForm();
  }

  async showForm() {
    if (!this.currentSlideTypeId) return;

    // Hide overview, show form
    const overviewRow = this.modalElement.querySelector(
      "#slideTypeOverviewRow",
    );
    const containerRow = this.modalElement.querySelector("#slideTypeContainer");
    const generateBtn = this.modalElement.querySelector("#generateSlideBtn");

    if (overviewRow) overviewRow.style.display = "none";
    if (containerRow) containerRow.style.display = "block";

    // Show the Generate Slide button in form view
    if (generateBtn) {
      generateBtn.style.display = "inline-block";
    }

    // Update modal title
    const slideType = slideTypeRegistry.getSlideType(this.currentSlideTypeId);
    const titleElement = this.modalElement.querySelector(
      "#frontendSlideTypeModalLabel",
    );
    if (slideType && titleElement) {
      titleElement.textContent = slideType.name;
    }

    try {
      const formHTML = await slideTypeRegistry.generateForm(
        this.currentSlideTypeId,
        this.existingConfig,
      );
      const formContainer = this.modalElement.querySelector(
        "#dynamicSlideFormContainer",
      );
      if (formContainer) {
        // Add a back button at the top of the form
        const backButtonHTML = `
          <div class="mb-3">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="backToOverviewBtn">
            <span class="material-symbols-outlined">arrow_back</span>
              ${gettext("Back to Overview")}
            </button>
          </div>
        `;
        formContainer.innerHTML = backButtonHTML + formHTML;
      }
    } catch (error) {
      console.error("Error generating form:", error);
      const formContainer = this.modalElement.querySelector(
        "#dynamicSlideFormContainer",
      );
      if (formContainer) {
        formContainer.innerHTML = `
          <div class="alert alert-danger">
            Error loading form: ${error.message}
          </div>
        `;
      }
    }
  }

  validateRequiredFields() {
    // Find all required inputs within the modal
    const requiredInputs = this.modalElement.querySelectorAll(
      "input[required], select[required], textarea[required]",
    );
    const missingFields = [];

    requiredInputs.forEach((input) => {
      const value = input.value.trim();
      if (!value) {
        // Get field label or use name/id as fallback
        const label = this.getFieldLabel(input);
        missingFields.push(label);

        // Add visual indication of error
        input.classList.add("is-invalid");
      } else {
        // Remove error indication if field is now filled
        input.classList.remove("is-invalid");
      }
    });

    if (missingFields.length > 0) {
      const fieldList = missingFields.join(", ");
      alert(`Please fill out all required fields: ${fieldList}`);

      // Focus on the first missing field
      const firstMissingInput = this.modalElement.querySelector(
        "input[required], select[required], textarea[required]",
      );
      if (firstMissingInput && !firstMissingInput.value.trim()) {
        firstMissingInput.focus();
      }

      return false;
    }

    return true;
  }

  getFieldLabel(input) {
    // Try to find associated label
    const label = this.modalElement.querySelector(`label[for="${input.id}"]`);
    if (label) {
      return label.textContent.trim().replace(":", "");
    }

    // Try to find parent label
    const parentLabel = input.closest("label");
    if (parentLabel) {
      return parentLabel.textContent.trim().replace(":", "");
    }

    // Fallback to placeholder, name, or id
    return input.placeholder || input.name || input.id || "Unknown field";
  }

  async generateSlide() {
    if (!this.currentSlideTypeId) {
      console.error("No slide type selected");
      return;
    }

    try {
      // Validate required fields before proceeding
      if (!this.validateRequiredFields()) {
        return; // Validation failed, don't proceed
      }

      // Extract form data
      const config = slideTypeRegistry.extractFormData(this.currentSlideTypeId);

      // Generate slide HTML
      const slideHTML = await slideTypeRegistry.generateSlide(
        this.currentSlideTypeId,
        config,
      );

      // Get slide type info
      const slideType = slideTypeRegistry.getSlideType(this.currentSlideTypeId);

      // Get slide data which may include default size properties
      const slideData = slideTypeRegistry.generateSlideData(
        this.currentSlideTypeId,
      );

      // Ensure slideData cannot override the numeric slideTypeId (some slide types
      // incorrectly return a string id like "winkas" which breaks later lookup).
      if (
        slideData &&
        Object.prototype.hasOwnProperty.call(slideData, "slideTypeId")
      ) {
        delete slideData.slideTypeId;
      }

      // Prepare overrides - start with slide data defaults. Explicitly set the
      // numeric slideTypeId (this.currentSlideTypeId) so slideData can't override it.
      const overrides = {
        ...slideData, // include defaults from the slide type (without slideTypeId)
        slideTypeId: this.currentSlideTypeId,
        config: config,
        integrationName: slideType.name,
        ...slideData, // re-apply slideData to allow its config to be present
      };

      // If we're updating an existing element (e.g., from placeholder conversion),
      // remove size properties so we preserve the existing element's size
      if (window.selectedElementForUpdate) {
        delete overrides.gridX;
        delete overrides.gridY;
        delete overrides.gridWidth;
        delete overrides.gridHeight;
      }

      // Create the iframe element
      addIframe(slideHTML, overrides);

      // Close modal
      this.hide();
    } catch (error) {
      console.error("Error generating slide:", error);
      alert("Error generating slide: " + error.message);
    }
  }
}

// Create singleton instance
export const frontendSlideTypeModal = new FrontendSlideTypeModal();

// Export function to show modal (for compatibility with existing code)
export async function showFrontendSlideTypeModal(existingElement = null) {
  try {
    await frontendSlideTypeModal.initialize();
    await frontendSlideTypeModal.show(existingElement);
  } catch (error) {
    console.error("Error showing frontend slide type modal:", error);
  }
}
