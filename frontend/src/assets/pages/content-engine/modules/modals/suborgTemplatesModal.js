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

const modalId = "unifiedSlideModal";

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
let lastRenderedTemplateId = null;
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

function renderCategoryFilters(modal, templates) {
  const sidebar = modal.querySelector("#category-filter");
  if (!sidebar) {
    return;
  }

  const categoriesMap = new Map();
  templates.forEach((template) => {
    if (template.category) {
      categoriesMap.set(template.category.id, template.category.name);
    }
  });

  sidebar.innerHTML = "";

  if (categoriesMap.size === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "text-muted small mt-2";
    emptyState.textContent = gettext("No categories available");
    sidebar.appendChild(emptyState);
    return;
  }

  categoriesMap.forEach((name, id) => {
    const wrapper = document.createElement("div");
    wrapper.className = "form-check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "form-check-input unified-category-filter";
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
    .querySelectorAll(".unified-category-filter")
    .forEach((checkbox) => {
      checkbox.addEventListener("change", () => applyTemplateFilters(modal));
    });
}

function getSelectedCategoryFilterIds(modal) {
  return Array.from(
    modal.querySelectorAll(".unified-category-filter:checked"),
  )
    .map((checkbox) => parseInt(checkbox.value, 10))
    .filter((value) => !Number.isNaN(value));
}

function renderAspectRatioFilters(modal, templates) {
  const container = modal.querySelector("#aspect-ratio-filter");
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
    input.className = "form-check-input unified-aspect-filter";
    input.id = `unified-aspect-${index}`;
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
    .querySelectorAll(".unified-aspect-filter")
    .forEach((checkbox) => {
      checkbox.addEventListener("change", () => applyTemplateFilters(modal));
    });
}

function getSelectedAspectRatios(modal) {
  return Array.from(
    modal.querySelectorAll(".unified-aspect-filter:checked"),
  ).map((checkbox) => checkbox.value);
}

function clearPreviewAndInfo(modal) {
  const preview = modal.querySelector("#unifiedTemplatePreview");
  if (preview) {
    preview.innerHTML = `<p class="text-muted mb-0">${gettext("Select a template to see preview")}</p>`;
  }

  selectedTemplate = null;
  lastRenderedTemplateId = null;
}

function renderTemplatePreview(modal, template) {
  const previewContainer = modal.querySelector("#unifiedTemplatePreview");
  if (!previewContainer) {
    return;
  }

  if (!template) {
    previewContainer.innerHTML = `<p class="text-muted mb-0">${gettext("Select a template to see preview")}</p>`;
    lastRenderedTemplateId = null;
    return;
  }

  document.querySelector(".aspect-ratio-th").classList.remove("d-none");
  document.querySelector(".aspect-ratio-info").classList.add("d-none");

  previewContainer.innerHTML = "";
  previewContainer.style.backgroundColor = "#f8f9fa";
  previewContainer.style.position = "relative";
  previewContainer.style.overflow = "hidden";

  const wrapper = document.createElement("div");
  wrapper.classList.add("template-preview-wrapper");


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
  lastRenderedTemplateId = template.id;

  setTimeout(() => {
    scaleSlide(wrapper);
  }, 100);
}

function selectTemplate(template, modal) {
  if (!template) {
    clearPreviewAndInfo(modal);
    return;
  }

  const wasSameTemplate =
    selectedTemplate && selectedTemplate.id === template.id;
  selectedTemplate = template;
  const rows = modal.querySelectorAll("#unifiedTemplateTable tbody tr");
  rows.forEach((row) => {
    row.classList.toggle(
      "table-active",
      Number(row.getAttribute("data-template-id")) === template.id,
    );
  });

  if (wasSameTemplate && lastRenderedTemplateId === template.id) {
    return;
  }

  renderTemplatePreview(modal, template);
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
  const tableBody = modal.querySelector("#unifiedTemplateTable tbody");
  const noResultsAlert = modal.querySelector("#no-templates-found-alert");
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
  const searchInput = modal.querySelector("#templateSearch");
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
    .querySelectorAll("#unifiedTemplateTable th[data-sort]")
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
  renderCategoryFilters(modal, globalTemplatesCache);
  renderAspectRatioFilters(modal, globalTemplatesCache);
  attachSortHandlers(modal);

  const searchInput = modal.querySelector("#templateSearch");
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

  // Use existing modal markup from the page
  const modal = document.getElementById(modalId);

  if (!modal) {
    showToast(gettext("Modal template not present on page."), "Error");
    return;
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

  // Initialize interactions using unified modal DOM
  initializeTemplateInteractions(modal, globalTemplates);
  ensureInitialTemplateSelection(modal);

  // Handle create button — reuse unified modal's save button
  const createBtn = modal.querySelector("#unifiedSaveSlideBtn");
  if (createBtn && !createBtn.dataset.createHandlerAttached) {
    createBtn.addEventListener("click", async () => {
    if (!selectedTemplate) {
      showToast(gettext("Please select a global template."), "Warning");
      return;
    }
    const manualNameElement = modal.querySelector("#templateSlideName");
    const manualName = manualNameElement ? manualNameElement.value.trim() : "";
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
    createBtn.dataset.createHandlerAttached = "true";
  }

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
