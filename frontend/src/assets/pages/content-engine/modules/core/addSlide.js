// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { loadSlide, scaleSlide } from "./renderSlide.js";
import { updateSlideSelector } from "./slideSelector.js";
import { store } from "./slideStore.js";
import {
  createMiniSearchInstance,
  searchItems,
  token,
  showToast,
  parentOrgID,
  selectedSubOrgID,
} from "../../../../utils/utils.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";
import {
  getResolutionForAspectRatio,
  findAspectRatioValueByDimensions,
  getDefaultCellSnapForResolution,
} from "../../../../utils/availableAspectRatios.js";
import * as bootstrap from "bootstrap";
import {
  customTagsExtractField,
  buildTemplateSearchIndex,
  renderCategoryFilters,
  getSelectedCategoryFilterIds,
  renderTagsFilters,
  getSelectedTagFilters,
  sortFilteredTemplates,
  renderTemplateTable,
  attachSortHandlers,
} from "../modals/unifiedModalHelpers.js";

let unifiedTemplates = [];
let selectedUnifiedTemplate = null;

function cloneSnapSettings(settings) {
  if (!settings) {
    return null;
  }
  try {
    return structuredClone(settings);
  } catch (err) {
    try {
      return JSON.parse(JSON.stringify(settings));
    } catch {
      return null;
    }
  }
}

/**
 * Set the resolution based on aspect ratio and update resolution modal
 */
function setResolutionFromAspectRatio(aspectRatio) {
  const { width, height } = getResolutionForAspectRatio(aspectRatio);
  store.emulatedWidth = width;
  store.emulatedHeight = height;

  // Update resolution modal to show the correct active option
  updateResolutionModalSelection(width, height);

  // Update the aspect ratio display in the UI
  updateAspectRatioDisplay();

  // Trigger zoom adjustment to fit the new aspect ratio
  setTimeout(async () => {
    const { scaleAllSlides } = await import("./renderSlide.js");
    const { updateAllSlidesZoom } = await import("../utils/zoomController.js");
    scaleAllSlides();
    updateAllSlidesZoom();
  }, 50);
}

/**
 * Update the resolution modal to show the correct active selection
 */
function updateResolutionModalSelection(width, height) {
  const options = document.querySelectorAll(".resolution-option");
  options.forEach((option) => {
    const optionWidth = parseInt(option.getAttribute("data-width"), 10);
    const optionHeight = parseInt(option.getAttribute("data-height"), 10);

    if (optionWidth === width && optionHeight === height) {
      option.classList.add("active");
    } else {
      option.classList.remove("active");
    }
  });
}

/**
 * Update the aspect ratio display in the UI
 */
function updateAspectRatioDisplay() {
  const currentAspectRatio = getCurrentAspectRatio();

  const aspectRatioElement = document.getElementById("aspect-ratio");
  const aspectRatioValueElement = document.getElementById("aspect-ratio-value");

  if (aspectRatioElement) {
    aspectRatioElement.innerText = currentAspectRatio;
  }
  if (aspectRatioValueElement) {
    aspectRatioValueElement.innerText = currentAspectRatio;
  }
}
let filteredTemplates = [];
let currentSort = { column: null, order: "asc" };
let legacyFilterMessage = null;

// MiniSearch instance using shared custom extractor
const templateMiniSearcher = createMiniSearchInstance(
  ["name", "category", "tags"],
  { extractField: customTagsExtractField },
);

export function getCurrentAspectRatio() {
  if (!store.emulatedWidth || !store.emulatedHeight) {
    return null;
  }

  return findAspectRatioValueByDimensions(
    store.emulatedWidth,
    store.emulatedHeight,
  );
}

const noTemplatesFoundAlert = document.getElementById(
  "no-templates-found-alert",
);

/**
 * Determine if we're in suborg branch content creation mode
 * (as opposed to suborg template management mode)
 */
function isSuborgContentCreationMode() {
  // If we're managing templates, allow global templates
  if (
    store.editorMode === "template_editor" ||
    store.editorMode === "suborg_templates"
  ) {
    return false;
  }

  // If we have a suborg selected but we're not managing templates,
  // then we're creating content for the suborg branch
  return true;
}

async function fetchUnifiedTemplates() {
  const orgId = parentOrgID;
  const suborgId = selectedSubOrgID;

  try {
    let url;
    // If we have a suborgId, fetch suborg-specific templates (includes global + suborg templates)
    // Otherwise, fetch only global templates for the org
    if (suborgId) {
      url = `${BASE_URL}/api/suborg-templates/?suborg_id=${suborgId}`;
    } else {
      url = `${BASE_URL}/api/slide-templates/?organisation_id=${orgId}`;
    }

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      console.error("Failed to fetch templates", resp.status);
      return;
    }
    unifiedTemplates = await resp.json();
    legacyFilterMessage = null;

    // Filter out global templates when creating content for suborg branches
    // Only allow global templates when managing suborg templates (editorMode = "suborg_templates")
    if (suborgId && isSuborgContentCreationMode()) {
      const originalCount = unifiedTemplates.length;
      // Filter to only suborg-specific templates (suborganisation is not null)
      // Global templates have suborganisation === null
      unifiedTemplates = unifiedTemplates.filter(
        (template) => template.suborganisation !== null,
      );
    }

    // Filter templates by aspect ratio to match current slideshow aspect ratio
    const currentAspectRatio = getCurrentAspectRatio();
    if (currentAspectRatio) {
      const originalCount = unifiedTemplates.length;
      unifiedTemplates = unifiedTemplates.filter(
        (template) => template.aspect_ratio === currentAspectRatio,
      );
    }

    if (
      suborgId &&
      isSuborgContentCreationMode() &&
      typeof store.legacyGridEnabled === "boolean"
    ) {
      const targetLegacyState = Boolean(store.legacyGridEnabled);
      const beforeLegacyFilter = unifiedTemplates.length;
      unifiedTemplates = unifiedTemplates.filter(
        (template) => Boolean(template.is_legacy) === targetLegacyState,
      );
      if (beforeLegacyFilter > 0 && unifiedTemplates.length === 0) {
        legacyFilterMessage = targetLegacyState
          ? gettext(
              "No legacy templates are available for this suborganisation. Contact your administrator to create one.",
            )
          : gettext(
              "No per-pixel templates are available for this suborganisation. Contact your administrator to convert or create one.",
            );
      }
    }

    // Templates now set their own aspect ratio automatically, so no filtering needed
    document.getElementById("aspect-ratio").innerText = getCurrentAspectRatio();

    buildTemplateSearchIndex(templateMiniSearcher, unifiedTemplates);
    
    renderCategoryFilters(document, unifiedTemplates, {
      checkboxClass: "category-filter",
      idPrefix: "cat-",
      onChangeCallback: () => {
        filterTemplates();
        sortAndRenderTemplates();
      },
    });
    
    renderTagsFilters(document, unifiedTemplates, {
      checkboxClass: "tag-filter",
      idPrefix: "tag-",
      onChangeCallback: () => {
        filterTemplates();
        sortAndRenderTemplates();
      },
    });
    
    filteredTemplates = unifiedTemplates;
    sortAndRenderTemplates();
  } catch (err) {
    console.error("Error fetching templates:", err);
  }
}

function filterTemplates() {
  const query = document.getElementById("templateSearch").value.toLowerCase();
  const searchResults = searchItems(
    query,
    unifiedTemplates,
    templateMiniSearcher,
  );
  const selectedCategoryIds = getSelectedCategoryFilterIds(document, "category-filter");
  const selectedTags = getSelectedTagFilters(document, "tag-filter");

  // Get the current aspect ratio for filtering
  const currentAspectRatio = getCurrentAspectRatio();

  filteredTemplates = searchResults.filter((t) => {
    const categoryMatch =
      selectedCategoryIds.length === 0 ||
      selectedCategoryIds.includes(t.category?.id);

    if (!categoryMatch) {
      return false;
    }

    const passesTagFilter = !selectedTags.length || (t.tags || []).some((tag) => {
      const tagId = typeof tag === "string" ? tag : String(tag.id);
      const tagName = typeof tag === "string" ? tag : tag.name;
      return selectedTags.includes(tagId) || selectedTags.includes(tagName);
    });

    if (!passesTagFilter) {
      return false;
    }

    // Filter by aspect ratio - template must match current aspect ratio
    const aspectRatioMatch = t.aspect_ratio === currentAspectRatio;
    return aspectRatioMatch;
  });
}

function sortAndRenderTemplates() {
  const sorted = sortFilteredTemplates(filteredTemplates, currentSort);
  filteredTemplates = sorted;
  
  renderTemplateTable(
    document,
    filteredTemplates,
    (template) => {
      document
        .querySelectorAll("#unifiedTemplateTable tbody tr")
        .forEach((row) => row.classList.remove("table-active"));
      const clickedRow = document.querySelector(
        `#unifiedTemplateTable tbody tr[data-template-id="${template.id}"]`,
      );
      if (clickedRow) {
        clickedRow.classList.add("table-active");
      }
      selectedUnifiedTemplate = template;
      loadUnifiedTemplatePreview(template);
    },
    {
      noResultsMessage: legacyFilterMessage || gettext("No templates found."),
    },
  );
}

function loadUnifiedTemplatePreview(template) {
  const previewContainer = document.getElementById("unifiedTemplatePreview");
  previewContainer.innerHTML = ""; // Clear the outer container first

  const wrapper = document.createElement("div");
  wrapper.classList.add("template-preview-wrapper");

  previewContainer.appendChild(wrapper);

  const previewSlide = document.createElement("div");
  previewSlide.classList.add("preview-slide");
  previewSlide.id = "template-slide-preview"; // Unique ID for the template preview slide div
  previewSlide.style.transform = ""; // Reset transform before loading
  wrapper.appendChild(previewSlide);

  // Load the slide content into the specific previewSlide div
  // Pass the unique ID selector as the target
  loadSlide(template.slide_data, "#template-slide-preview", true, true, {
    previewMode: true,
  }); // Render in isolated preview mode

  // Scale the content based on the wrapper container
  scaleSlide(wrapper);
}

export function initAddSlide() {
  document
    .getElementById("templateSearch")
    .addEventListener("input", function () {
      filterTemplates();
      sortAndRenderTemplates();
    });

  const unifiedSlideModalEl = document.getElementById("unifiedSlideModal");

  if (unifiedSlideModalEl) {
    unifiedSlideModalEl.addEventListener("shown.bs.modal", async () => {
      await fetchUnifiedTemplates();
      const tableBody = document.querySelector("#unifiedTemplateTable tbody");
      if (tableBody && tableBody.children.length > 0) {
        const firstRow = tableBody.children[0];
        firstRow.classList.add("table-active");
        selectedUnifiedTemplate = filteredTemplates[0];
        loadUnifiedTemplatePreview(filteredTemplates[0]);
      }
    });

    unifiedSlideModalEl.addEventListener("hidden.bs.modal", () => {
      selectedUnifiedTemplate = null;
      const activePreviewContainer =
        document.querySelector(".preview-column .preview-container") ||
        document.querySelector(".slide-canvas .preview-container");

      if (activePreviewContainer) {
        // Restore editor scaling after preview modal alters store.currentScale.
        scaleSlide(activePreviewContainer);
      }
    });
  }

  document
    .getElementById("unifiedSaveSlideBtn")
    .addEventListener("click", () => {
      // Ensure slide and element ID counters are up-to-date to prevent conflicts.
      let maxSlideId = 0;
      store.slides.forEach((slide) => {
        if (slide.id > maxSlideId) {
          maxSlideId = slide.id;
        }
      });
      store.slideIdCounter = Math.max(
        store.slideIdCounter || 1,
        maxSlideId + 1,
      );

      let maxElementId = 0;
      store.slides.forEach((slide) => {
        if (slide.elements && Array.isArray(slide.elements)) {
          slide.elements.forEach((element) => {
            if (element.id > maxElementId) {
              maxElementId = element.id;
            }
          });
        }
      });
      store.elementIdCounter = Math.max(
        store.elementIdCounter || 1,
        maxElementId + 1,
      );

      if (!selectedUnifiedTemplate) {
        showToast(
          gettext("Please select a template from the list."),
          "Warning",
        );
        return;
      }
      const templateSlide = selectedUnifiedTemplate.slide_data;
      const newSlide = JSON.parse(JSON.stringify(templateSlide));
      newSlide.id = store.slideIdCounter++;

      // Set resolution based on template's aspect ratio
      if (selectedUnifiedTemplate.aspect_ratio) {
        setResolutionFromAspectRatio(selectedUnifiedTemplate.aspect_ratio);
      }

      const manualName = document
        .getElementById("templateSlideName")
        .value.trim();
      const manualDuration = parseInt(
        document.getElementById("templateSlideDuration").value,
        10,
      );
      newSlide.name = manualName
        ? manualName
        : selectedUnifiedTemplate.name + gettext(" (From Template)");
      if (!isNaN(manualDuration) && manualDuration > 0) {
        newSlide.duration = manualDuration;
      }
      newSlide.undoStack = [];
      newSlide.redoStack = [];

      // When creating a slide from a template, ensure all elements have new unique IDs
      // and their `originSlideIndex` is updated to the new slide's index.
      // Also, reset persistence.
      const newSlideIndex = store.slides.length;
      if (newSlide.elements && Array.isArray(newSlide.elements)) {
        newSlide.elements.forEach((element) => {
          element.id = store.elementIdCounter++;
          element.originSlideIndex = newSlideIndex;
          element.isPersistent = false;
        });
      }

      const templateSnap = cloneSnapSettings(templateSlide.savedSnapSettings);
      if (templateSnap) {
        newSlide.savedSnapSettings = {
          unit: templateSnap.unit === "division" ? "division" : "cells",
          amount: Math.max(1, Math.round(Number(templateSnap.amount)) || 1),
          isAuto: templateSnap.isAuto ?? false,
          snapEnabled: templateSnap.snapEnabled !== false,
          savedUnit: templateSnap.savedUnit,
          savedAmount: templateSnap.savedAmount,
          appliedGridSignature: templateSnap.appliedGridSignature,
        };
      } else {
        const defaultSnapAmount =
          getDefaultCellSnapForResolution(
            store.emulatedWidth,
            store.emulatedHeight,
          ) || 1;
        newSlide.savedSnapSettings = {
          unit: "cells",
          amount: defaultSnapAmount,
          isAuto: true,
          snapEnabled: false,
        };
      }

      store.slides.push(newSlide);
      store.currentSlideIndex = store.slides.length - 1;
      updateSlideSelector();
      bootstrap.Modal.getInstance(
        document.getElementById("unifiedSlideModal"),
      ).hide();
      loadSlide(newSlide);

      // Ensure proper scaling after adding slide from template
      const previewContainer =
        document.querySelector(".preview-column .preview-container") ||
        document.querySelector(".slide-canvas .preview-container");
      if (previewContainer) {
        scaleSlide(previewContainer);
      }
    });

  document.querySelector("#addSlideBtn").addEventListener("click", function () {
    const unifiedModal = new bootstrap.Modal(
      document.getElementById("unifiedSlideModal"),
    );
    unifiedModal.show();
  });

  attachSortHandlers(document, currentSort, (newSortState) => {
    currentSort = newSortState;
    sortAndRenderTemplates();
  });
}

// Function to open the add slide modal programmatically
export function openAddSlideModal() {
  const modalElement = document.getElementById("unifiedSlideModal");
  if (modalElement) {
    const unifiedModal = new bootstrap.Modal(modalElement);
    unifiedModal.show();
  } else {
    console.warn(
      "Add slide modal not found. Please check if the modal DOM element exists.",
    );
  }
}

export { fetchUnifiedTemplates };
