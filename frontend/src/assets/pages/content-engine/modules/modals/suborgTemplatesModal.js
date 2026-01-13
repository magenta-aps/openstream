// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import {
  showToast,
  token,
  parentOrgID,
  createMiniSearchInstance,
  searchItems,
} from "../../../../utils/utils.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";
import * as bootstrap from "bootstrap";
import {
  fetchAllSuborgTemplatesAndPopulateStore,
  setResolutionFromAspectRatio,
} from "../core/suborgTemplateDataManager.js";
import { loadSlide, scaleAllSlides } from "../core/renderSlide.js";
import { scaleSlide } from "../core/renderSlide.js";
import { store } from "../core/slideStore.js";
import { updateAllSlidesZoom } from "../utils/zoomController.js";
import { syncGridToCurrentSlide } from "../config/gridConfig.js";

const modalId = "createSuborgTemplateModal";

function customTagsExtractField(document, fieldName) {
  if (fieldName === "tags") {
    return (document.tags || []).map((tag) => tag.name);
  }

  if (fieldName === "category") {
    return document.category ? document.category.name : "";
  }

  if (fieldName === "aspect_ratio") {
    return document.aspect_ratio || "";
  }

  return document[fieldName];
}

const templateMiniSearcher = createMiniSearchInstance(
  ["name", "category", "tags", "aspect_ratio"],
  { extractField: customTagsExtractField },
);

let currentSuborgId = null;
let savedResolution = null;
let globalTemplatesCache = [];
let filteredTemplates = [];
let selectedTemplate = null;
let currentSort = { column: "name", order: "asc" };

// Ensure a template is active so the preview renders immediately once the modal is visible.
function ensureInitialTemplateSelection(modal) {
  if (!modal) {
    return;
  }

  if (selectedTemplate) {
    selectTemplate(selectedTemplate, modal);
    return;
  }

  if (filteredTemplates.length > 0) {
    selectTemplate(filteredTemplates[0], modal);
  }
}


function buildTemplateSearchIndex(templates) {
  templateMiniSearcher.removeAll();
  if (Array.isArray(templates) && templates.length > 0) {
    templateMiniSearcher.addAll(templates);
  }
}

function renderCategorySidebar(modal, templates) {
  const sidebar = modal.querySelector("#suborgCategorySidebar");
  if (!sidebar) {
    return;
  }

  const categoriesMap = new Map();
  templates.forEach((template) => {
    if (template.category) {
      categoriesMap.set(template.category.id, template.category.name);
    }
  });

  sidebar.innerHTML = `
    <h6 class="border-bottom secondary p-2 d-flex justify-content-between align-items-center">
      ${gettext("Filter by Category")}
      <span class="material-symbols-outlined">category_search</span>
    </h6>
  `;

  if (categoriesMap.size === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "text-muted small mt-2";
    emptyState.textContent = gettext("No categories available");
    sidebar.appendChild(emptyState);
    return;
  }

  categoriesMap.forEach((name, id) => {
    const wrapper = document.createElement("div");
    wrapper.className = "form-check form-switch py-1";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "form-check-input suborg-category-filter";
    input.value = id;
    input.id = `suborg-cat-${id}`;

    const label = document.createElement("label");
    label.className = "form-check-label small";
    label.htmlFor = input.id;
    label.textContent = name;

    wrapper.appendChild(input);
    wrapper.appendChild(label);
    sidebar.appendChild(wrapper);
  });

  sidebar
    .querySelectorAll(".suborg-category-filter")
    .forEach((checkbox) => {
      checkbox.addEventListener("change", () => applyTemplateFilters(modal));
    });
}

function getSelectedCategoryFilterIds(modal) {
  return Array.from(
    modal.querySelectorAll(".suborg-category-filter:checked"),
  )
    .map((checkbox) => parseInt(checkbox.value, 10))
    .filter((value) => !Number.isNaN(value));
}

function renderAspectRatioFilters(modal, templates) {
  const container = modal.querySelector("#suborgAspectRatioFilters");
  if (!container) {
    return;
  }

  const ratioSet = new Set();
  templates.forEach((template) => {
    if (template.aspect_ratio) {
      ratioSet.add(template.aspect_ratio);
    }
  });

  const ratios = Array.from(ratioSet).sort((a, b) => a.localeCompare(b));

  if (!ratios.length) {
    container.innerHTML = `<p class="text-muted small mb-0">${gettext("No aspect ratios detected")}</p>`;
    return;
  }

  container.innerHTML = "";

  ratios.forEach((ratio, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "form-check form-check-inline mb-1";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "form-check-input suborg-aspect-filter";
    input.id = `suborg-aspect-${index}`;
    input.value = ratio;

    const label = document.createElement("label");
    label.className = "form-check-label small";
    label.htmlFor = input.id;
    label.textContent = ratio;

    wrapper.appendChild(input);
    wrapper.appendChild(label);
    container.appendChild(wrapper);
  });

  container
    .querySelectorAll(".suborg-aspect-filter")
    .forEach((checkbox) => {
      checkbox.addEventListener("change", () => applyTemplateFilters(modal));
    });
}

function getSelectedAspectRatios(modal) {
  return Array.from(
    modal.querySelectorAll(".suborg-aspect-filter:checked"),
  ).map((checkbox) => checkbox.value);
}

function clearPreviewAndInfo(modal) {
  const preview = modal.querySelector("#suborgTemplatePreview");
  if (preview) {
    preview.innerHTML = `<p class="text-muted mb-0">${gettext("Select a template to see preview")}</p>`;
  }

  updateTemplateInfo(modal, null);
  updateAspectRatioBadge(modal, null);
  selectedTemplate = null;
}

function updateAspectRatioBadge(modal, template) {
  const badge = modal.querySelector("#suborgAspectRatioValue");
  if (!badge) {
    return;
  }
  badge.textContent = template?.aspect_ratio || "—";
}

function updateTemplateInfo(modal, template) {
  const infoContainer = modal.querySelector("#suborgTemplateInfo");
  if (!infoContainer) {
    return;
  }

  if (!template) {
    infoContainer.innerHTML = `<p class="text-muted mb-0">${gettext("Select a template to see details")}</p>`;
    return;
  }

  const gridModeLabel = template.is_legacy
    ? gettext("Legacy grid (200×200)")
    : gettext("Per-pixel grid");
  const categoryLabel = template.category
    ? template.category.name
    : gettext("(none)");
  const tagNames = (template.tags || []).map((tag) => tag.name);

  infoContainer.innerHTML = `
    <div class="card">
      <div class="card-body">
        <h6 class="fw-semibold mb-3 d-flex align-items-center gap-2">
          <span class="material-symbols-outlined">info</span>${gettext("Template Details")}
        </h6>
        <p class="mb-1"><strong>${gettext("Name")}:</strong> ${template.name}</p>
        <p class="mb-1"><strong>${gettext("Category")}:</strong> ${categoryLabel}</p>
        <p class="mb-1"><strong>${gettext("Tags")}:</strong> ${
          tagNames.length > 0 ? tagNames.join(", ") : gettext("(none)")
        }</p>
        <p class="mb-1"><strong>${gettext("Grid Mode")}:</strong> ${gridModeLabel}</p>
        ${
          template.aspect_ratio
            ? `<p class="mb-0"><strong>${gettext("Aspect Ratio")}:</strong> ${template.aspect_ratio}</p>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderTemplatePreview(modal, template) {
  const previewContainer = modal.querySelector("#suborgTemplatePreview");
  if (!previewContainer) {
    return;
  }

  if (!template) {
    previewContainer.innerHTML = `<p class="text-muted mb-0">${gettext("Select a template to see preview")}</p>`;
    return;
  }

  previewContainer.innerHTML = "";
  previewContainer.style.backgroundColor = "#f8f9fa";
  previewContainer.style.position = "relative";
  previewContainer.style.overflow = "hidden";

  const wrapper = document.createElement("div");
  wrapper.classList.add("template-preview-wrapper");
  wrapper.style.position = "relative";
  wrapper.style.width = "100%";
  const fallbackHeight = 430;
  const measuredHeight = previewContainer.clientHeight;
  const resolvedHeight = Math.max(measuredHeight, fallbackHeight);
  wrapper.style.height = `${resolvedHeight}px`;
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "center";

  const previewSlide = document.createElement("div");
  previewSlide.classList.add("preview-slide");
  previewSlide.id = "suborg-template-preview";
  previewSlide.style.transform = "";

  wrapper.appendChild(previewSlide);
  previewContainer.appendChild(wrapper);

  if (template.aspect_ratio) {
    setResolutionFromAspectRatio(template.aspect_ratio);
  }

  const slideObject = {
    ...template.slide_data,
    preview_width: template.preview_width || 1920,
    preview_height: template.preview_height || 1080,
  };

  loadSlide(slideObject, "#suborg-template-preview", true);

  setTimeout(() => {
    scaleSlide(wrapper);
  }, 100);
}

function selectTemplate(template, modal) {
  if (!template) {
    clearPreviewAndInfo(modal);
    return;
  }

  selectedTemplate = template;
  const rows = modal.querySelectorAll("#suborgTemplateTable tbody tr");
  rows.forEach((row) => {
    row.classList.toggle(
      "table-active",
      Number(row.getAttribute("data-template-id")) === template.id,
    );
  });

  renderTemplatePreview(modal, template);
  updateTemplateInfo(modal, template);
  updateAspectRatioBadge(modal, template);
}

function sortFilteredTemplates() {
  if (!currentSort.column) {
    return;
  }

  filteredTemplates.sort((a, b) => {
    const multiplier = currentSort.order === "asc" ? 1 : -1;

    const getValue = (template) => {
      if (currentSort.column === "name") {
        return template.name?.toLowerCase() || "";
      }
      if (currentSort.column === "category") {
        return template.category?.name?.toLowerCase() || "";
      }
      if (currentSort.column === "tags") {
        return (template.tags || [])
          .map((tag) => (typeof tag === "string" ? tag : tag.name))
          .join(", ")
          .toLowerCase();
      }
      if (currentSort.column === "aspect_ratio") {
        return template.aspect_ratio?.toLowerCase() || "";
      }
      return "";
    };

    const aVal = getValue(a);
    const bVal = getValue(b);
    if (aVal < bVal) return -1 * multiplier;
    if (aVal > bVal) return 1 * multiplier;
    return 0;
  });
}

function renderTemplateTable(modal) {
  const tableBody = modal.querySelector("#suborgTemplateTable tbody");
  const noResultsAlert = modal.querySelector("#suborgNoTemplatesAlert");
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = "";

  if (!filteredTemplates.length) {
    if (noResultsAlert) {
      noResultsAlert.classList.remove("d-none");
      noResultsAlert.textContent = gettext("No templates match your filters.");
    }
    clearPreviewAndInfo(modal);
    return;
  }

  if (noResultsAlert) {
    noResultsAlert.classList.add("d-none");
  }

  filteredTemplates.forEach((template) => {
    const tr = document.createElement("tr");
    tr.setAttribute("data-template-id", String(template.id));

    const nameTd = document.createElement("td");
    nameTd.textContent = template.name;
    tr.appendChild(nameTd);

    const categoryTd = document.createElement("td");
    categoryTd.textContent = template.category
      ? template.category.name
      : gettext("(none)");
    tr.appendChild(categoryTd);

    const tagsTd = document.createElement("td");
    const tagNames = (template.tags || []).map((tag) =>
      typeof tag === "string" ? tag : tag.name,
    );
    tagsTd.textContent = tagNames.length ? tagNames.join(", ") : "-";
    tr.appendChild(tagsTd);

    const aspectTd = document.createElement("td");
    aspectTd.textContent = template.aspect_ratio || "—";
    tr.appendChild(aspectTd);

    tr.addEventListener("click", () => selectTemplate(template, modal));
    tableBody.appendChild(tr);
  });

  const preservedSelection =
    selectedTemplate &&
    filteredTemplates.some((template) => template.id === selectedTemplate.id)
      ? selectedTemplate
      : null;

  const templateToActivate = preservedSelection || filteredTemplates[0];
  if (templateToActivate) {
    selectTemplate(templateToActivate, modal);
  }
}

function applyTemplateFilters(modal) {
  const searchInput = modal.querySelector("#suborgTemplateSearch");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  const searchResults = query
    ? searchItems(query, globalTemplatesCache, templateMiniSearcher)
    : [...globalTemplatesCache];

  const selectedCategories = getSelectedCategoryFilterIds(modal);
  const selectedAspectRatios = getSelectedAspectRatios(modal);

  filteredTemplates = searchResults.filter((template) => {
    const categoryId = template.category ? template.category.id : null;
    const passesCategoryFilter =
      !selectedCategories.length ||
      (categoryId ? selectedCategories.includes(categoryId) : false);

    if (!passesCategoryFilter) {
      return false;
    }

    const ratio = template.aspect_ratio || null;
    const passesAspectFilter =
      !selectedAspectRatios.length ||
      (ratio ? selectedAspectRatios.includes(ratio) : false);

    return passesAspectFilter;
  });

  sortFilteredTemplates();
  renderTemplateTable(modal);
}

function attachSortHandlers(modal) {
  modal
    .querySelectorAll("#suborgTemplateTable th[data-sort]")
    .forEach((th) => {
      th.style.cursor = "pointer";
      th.addEventListener("click", () => {
        const sortKey = th.getAttribute("data-sort");
        if (!sortKey) {
          return;
        }

        if (currentSort.column === sortKey) {
          currentSort.order = currentSort.order === "asc" ? "desc" : "asc";
        } else {
          currentSort = { column: sortKey, order: "asc" };
        }

        sortFilteredTemplates();
        renderTemplateTable(modal);
      });
    });
}

function initializeTemplateInteractions(modal, templates) {
  globalTemplatesCache = Array.isArray(templates) ? [...templates] : [];
  filteredTemplates = [...globalTemplatesCache];
  selectedTemplate = null;
  currentSort = { column: "name", order: "asc" };

  buildTemplateSearchIndex(globalTemplatesCache);
  renderCategorySidebar(modal, globalTemplatesCache);
  renderAspectRatioFilters(modal, globalTemplatesCache);
  attachSortHandlers(modal);

  const searchInput = modal.querySelector("#suborgTemplateSearch");
  if (searchInput) {
    searchInput.addEventListener("input", () => applyTemplateFilters(modal));
  }

  applyTemplateFilters(modal);
}

/**
 * Restore the resolution properly with all UI updates
 */
function restoreResolution(resolution) {
  if (!resolution) return;

  store.emulatedWidth = resolution.width;
  store.emulatedHeight = resolution.height;
  syncGridToCurrentSlide();

  // Import and call the same update functions that setResolutionFromAspectRatio calls
  setTimeout(async () => {
    try {
      // Dynamically import the functions we need to avoid circular imports
      const { updateResolutionModalSelection, updateAspectRatioDisplay } =
        await import("../core/suborgTemplateDataManager.js");

      updateResolutionModalSelection(resolution.width, resolution.height);
      updateAspectRatioDisplay();
      scaleAllSlides();
      updateAllSlidesZoom();

    } catch (err) {
      console.warn("Could not fully restore resolution UI:", err);
    }
  }, 50);
}

/**
 * Fetch global templates for the organisation
 */
async function fetchGlobalTemplates() {
  try {
    const resp = await fetch(
      `${BASE_URL}/api/slide-templates/?organisation_id=${parentOrgID}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!resp.ok) {
      throw new Error(
        `Failed to load global templates. Status: ${resp.status}`,
      );
    }

    return await resp.json();
  } catch (err) {
    console.error("Error fetching global templates:", err);
    showToast(
      gettext("Error loading global templates: ") + err.message,
      "Error",
    );
    return [];
  }
}

/**
 * Create a suborg template from a global template
 */
async function createSuborgTemplate(suborgId, parentTemplateId, templateName) {
  try {
    const resp = await fetch(`${BASE_URL}/api/suborg-templates/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        suborg_id: suborgId,
        parent_template_id: parentTemplateId,
        name: templateName,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(JSON.stringify(err));
    }

    return await resp.json();
  } catch (err) {
    console.error("Error creating suborg template:", err);
    throw err;
  }
}

/**
 * Open modal to select and create a template from global templates
 */
export async function openCreateSuborgTemplateModal(suborgId) {
  currentSuborgId = suborgId;

  // Save current resolution to restore if user cancels
  savedResolution = {
    width: store.emulatedWidth,
    height: store.emulatedHeight,
  };

  // Create modal HTML dynamically
  let modal = document.getElementById(modalId);

  if (!modal) {
    modal = document.createElement("div");
    modal.className = "modal fade";
    modal.id = modalId;
    modal.setAttribute("tabindex", "-1");
    modal.setAttribute("aria-labelledby", modalId + "Label");
    modal.setAttribute("aria-hidden", "true");
    document.body.appendChild(modal);
  }

  // Fetch global templates
  const globalTemplates = await fetchGlobalTemplates();

  if (globalTemplates.length === 0) {
    showToast(
      gettext("No global templates available to create from."),
      "Warning",
    );
    return;
  }

  // Build modal content
  modal.innerHTML = `
    <div class="modal-dialog modal-fullscreen">
      <div class="modal-content">
        <div class="modal-header bg-light">
          <h5 class="modal-title" id="${modalId}Label">${gettext("Create Template from Global Template")}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 px-3 py-2 mb-2" style="background-color: var(--lightest-gray, #f5f6f8);">
            <p class="semibold my-0">${gettext("Select a global template to create a copy for this suborganisation.")}</p>
            <p class="semibold my-0">
              ${gettext("Selected template aspect ratio:")}
              <span class="badge bg-info text-dark d-inline-flex align-items-center gap-1">
                <span id="suborgAspectRatioValue">—</span>
                <span class="material-symbols-outlined">aspect_ratio</span>
              </span>
            </p>
          </div>
          <div class="row border-top">
            <div class="col-md-2 border-end rounded p-3" id="suborgCategorySidebar"></div>
            <div class="col-md-10">
              <div class="row">
                <div class="col-lg-6 p-3">
                  <div class="mb-3">
                    <input type="text" id="suborgTemplateSearch" class="form-control" placeholder="${gettext("Search by name, category, tags or aspect ratio...")}">
                  </div>
                  <div class="mb-3">
                    <label class="form-label fw-semibold d-flex align-items-center gap-2">
                      <span class="material-symbols-outlined">tune</span>${gettext("Filter by Aspect Ratio")}
                    </label>
                    <div id="suborgAspectRatioFilters" class="d-flex flex-wrap gap-2"></div>
                  </div>
                  <div class="table-responsive">
                    <table class="table table-hover table-bordered" id="suborgTemplateTable">
                      <thead>
                        <tr>
                          <th role="button" data-sort="name">
                            <span class="material-symbols-outlined me-1">signature</span>${gettext("Name")}
                          </th>
                          <th role="button" data-sort="category">
                            <span class="material-symbols-outlined me-1">category</span>${gettext("Category")}
                          </th>
                          <th role="button" data-sort="tags">
                            <span class="material-symbols-outlined me-1">shoppingmode</span>${gettext("Tags")}
                          </th>
                          <th role="button" data-sort="aspect_ratio">
                            <span class="material-symbols-outlined me-1">aspect_ratio</span>${gettext("Aspect Ratio")}
                          </th>
                        </tr>
                      </thead>
                      <tbody></tbody>
                    </table>
                    <div id="suborgNoTemplatesAlert" class="alert alert-primary d-none mt-2">${gettext(
                      "No templates match your filters."
                    )}</div>
                  </div>
                </div>
                <div class="col-lg-6 p-3">
                  <h6>${gettext("Template Preview")}</h6>
                  <div id="suborgTemplatePreview" class="bg-light p-2 border rounded d-flex align-items-center justify-content-center" style="min-height: 430px;">
                    <p class="text-muted mb-0">${gettext("Select a template to see preview")}</p>
                  </div>
                  <div id="suborgTemplateInfo" class="mt-3"></div>
                </div>
              </div>
              <div class="row mt-4 border-top pt-3 g-3">
                <div class="col-md-8">
                  <label for="newTemplateName" class="form-label fw-semibold d-flex align-items-center gap-2">
                    <span class="material-symbols-outlined">signature</span>${gettext("New Template Name")}
                  </label>
                  <input type="text" class="form-control" id="newTemplateName" placeholder="${gettext("Enter template name")}">
                  <small class="text-muted">${gettext("Leave empty to use original name with '(Copy)' suffix")}</small>
                </div>
                <div class="col-md-4">
                  <div class="alert alert-secondary py-2 px-3 small mb-0 d-flex align-items-start gap-2">
                    <span class="material-symbols-outlined">lock</span>
                    <span>${gettext("Grid, resolution, and locks follow the selected global template.")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer bg-light">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
            <span class="material-symbols-outlined">cancel</span> ${gettext("Cancel")}
          </button>
          <button type="button" class="btn btn-primary" id="createSuborgTemplateBtn">
            <span class="material-symbols-outlined">add</span> ${gettext("Create Template")}
          </button>
        </div>
      </div>
    </div>
  `;

  initializeTemplateInteractions(modal, globalTemplates);
  ensureInitialTemplateSelection(modal);

  // Handle create button
  const createBtn = modal.querySelector("#createSuborgTemplateBtn");
  createBtn.addEventListener("click", async () => {
    if (!selectedTemplate) {
      showToast(gettext("Please select a global template."), "Warning");
      return;
    }
    const manualName = modal.querySelector("#newTemplateName").value.trim();
    const slideName = manualName
      ? manualName
      : selectedTemplate.name + gettext(" (Copy)");

    try {
      createBtn.disabled = true;
      createBtn.textContent = gettext("Creating...");

      const newTemplate = await createSuborgTemplate(
        currentSuborgId,
        selectedTemplate.id,
        slideName,
      );

      showToast(gettext("Template created successfully!"), "Success");

      // Clear saved resolution since template was created successfully
      savedResolution = null;

      // Close modal
      const bsModal = bootstrap.Modal.getInstance(modal);
      if (bsModal) {
        bsModal.hide();
      }

      // Refresh template list and automatically select the newly created template
      await fetchAllSuborgTemplatesAndPopulateStore(
        currentSuborgId,
        newTemplate.id,
      );
    } catch (err) {
      showToast(gettext("Error creating template: ") + err.message, "Error");
      createBtn.disabled = false;
      createBtn.textContent = gettext("Create Template");
    }
  });

  if (!modal.dataset.restoreHandlerAttached) {
    modal.addEventListener("hidden.bs.modal", () => {
      if (savedResolution) {
        restoreResolution(savedResolution);
        savedResolution = null;
      }
      selectedTemplate = null;
    });
    modal.dataset.restoreHandlerAttached = "true";
  }

  if (!modal.dataset.initialPreviewHandlerAttached) {
    modal.addEventListener("shown.bs.modal", () => {
      setTimeout(() => ensureInitialTemplateSelection(modal), 50);
    });
    modal.dataset.initialPreviewHandlerAttached = "true";
  }

  const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
  bsModal.show();
}
