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
import { scaleAllSlides } from "../core/renderSlide.js";
import { store } from "../core/slideStore.js";
import { updateAllSlidesZoom } from "../utils/zoomController.js";
import { syncGridToCurrentSlide } from "../config/gridConfig.js";
import {
  customTagsExtractField,
  buildTemplateSearchIndex,
  renderCategoryFilters,
  getSelectedCategoryFilterIds,
  renderTagsFilters,
  getSelectedTagFilters,
  renderAspectRatioFilters,
  getSelectedAspectRatios,
  clearPreviewAndInfo,
  renderTemplatePreview,
  selectTemplate as selectTemplateHelper,
  sortFilteredTemplates,
  renderTemplateTable,
  attachSortHandlers,
  ensureInitialTemplateSelection as ensureInitialTemplateSelectionHelper,
} from "./unifiedModalHelpers.js";

const modalId = "unifiedSlideModal";

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

// Wrapper functions that use the shared helpers
function ensureInitialTemplateSelection(modal) {
  const state = { selectedTemplate, lastRenderedTemplateId };
  const newState = ensureInitialTemplateSelectionHelper(
    modal,
    state,
    filteredTemplates,
    (template, modal) => {
      const result = selectTemplate(template, modal);
      return result;
    },
  );
  selectedTemplate = newState.selectedTemplate;
  lastRenderedTemplateId = newState.lastRenderedTemplateId;
}

function selectTemplate(template, modal) {
  const state = { selectedTemplate, lastRenderedTemplateId };
  const newState = selectTemplateHelper(template, modal, state, {
    renderPreviewCallback: (modal, template) =>
      renderTemplatePreview(modal, template, {
        previewSlideId: "suborg-template-preview",
        setResolutionCallback: setResolutionFromAspectRatio,
      }),
  });
  selectedTemplate = newState.selectedTemplate;
  lastRenderedTemplateId = newState.lastRenderedTemplateId;
  return newState;
}

function applyTemplateFilters(modal) {
  const searchInput = modal.querySelector("#templateSearch");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  const searchResults = query
    ? searchItems(query, globalTemplatesCache, templateMiniSearcher)
    : [...globalTemplatesCache];

  const selectedCategories = getSelectedCategoryFilterIds(modal, "unified-category-filter");
  const selectedTags = getSelectedTagFilters(modal, "unified-tag-filter");
  const selectedAspectRatios = getSelectedAspectRatios(modal, "unified-aspect-filter");

  filteredTemplates = searchResults.filter((template) => {
    const categoryId = template.category ? template.category.id : null;
    const passesCategoryFilter =
      !selectedCategories.length ||
      (categoryId ? selectedCategories.includes(categoryId) : false);

    if (!passesCategoryFilter) {
      return false;
    }

    const passesTagFilter = !selectedTags.length || (template.tags || []).some((tag) => {
      const tagId = typeof tag === "string" ? tag : String(tag.id);
      const tagName = typeof tag === "string" ? tag : tag.name;
      return selectedTags.includes(tagId) || selectedTags.includes(tagName);
    });

    if (!passesTagFilter) {
      return false;
    }

    const ratio = template.aspect_ratio || null;
    const passesAspectFilter =
      !selectedAspectRatios.length ||
      (ratio ? selectedAspectRatios.includes(ratio) : false);

    return passesAspectFilter;
  });

  const sorted = sortFilteredTemplates(filteredTemplates, currentSort);
  filteredTemplates = sorted;
  
  renderTemplateTable(modal, filteredTemplates, (template) => selectTemplate(template, modal), {
    showAspectRatio: true,
  });

  // Preserve or select first template
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

function initializeTemplateInteractions(modal, templates) {
  globalTemplatesCache = Array.isArray(templates) ? [...templates] : [];
  filteredTemplates = [...globalTemplatesCache];
  selectedTemplate = null;
  currentSort = { column: "name", order: "asc" };

  buildTemplateSearchIndex(templateMiniSearcher, globalTemplatesCache);
  
  renderCategoryFilters(modal, globalTemplatesCache, {
    checkboxClass: "unified-category-filter",
    idPrefix: "suborg-cat-",
    onChangeCallback: () => applyTemplateFilters(modal),
  });
  
  renderTagsFilters(modal, globalTemplatesCache, {
    checkboxClass: "unified-tag-filter",
    idPrefix: "tag-",
    onChangeCallback: () => applyTemplateFilters(modal),
  });
  
  renderAspectRatioFilters(modal, globalTemplatesCache, {
    checkboxClass: "unified-aspect-filter",
    idPrefix: "unified-aspect-",
    onChangeCallback: () => applyTemplateFilters(modal),
  });
  
  attachSortHandlers(modal, currentSort, (newSortState) => {
    currentSort = newSortState;
    const sorted = sortFilteredTemplates(filteredTemplates, currentSort);
    filteredTemplates = sorted;
    renderTemplateTable(modal, filteredTemplates, (template) => selectTemplate(template, modal), {
      showAspectRatio: true,
    });
  });

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
