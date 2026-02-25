// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { fetchUnifiedTemplates } from "../core/addSlide.js";

import {
  parentOrgID,
  showToast,
  token,
  queryParams,
  genericFetch,
} from "../../../../utils/utils.js";
import { fetchAllOrgTemplatesAndPopulateStore } from "../core/templateDataManager.js"; // Removed initTemplateEditor
import { loadSlide, scaleAllSlides } from "../core/renderSlide.js";
import { updateSlideSelector } from "../core/slideSelector.js";
import { scaleSlide } from "../core/renderSlide.js";
import { updateResolution } from "../core/virutalPreviewResolution.js";
import { BASE_URL } from "../../../../utils/constants.js";
import * as bootstrap from "bootstrap";
import { gettext } from "../../../../utils/locales.js";
import {
  DEFAULT_ASPECT_RATIO,
  DISPLAYABLE_ASPECT_RATIOS,
  ORIENTATION,
  getAspectRatioDefinition,
  getAspectRatiosByOrientation,
  getResolutionForAspectRatio,
  getDefaultCellSnapForResolution,
} from "../../../../utils/availableAspectRatios.js";
import { refreshTemplateFilterOptions } from "../core/templateFilterControls.js";
import { initializeMultiSelectDropdown } from "../../../../utils/multiSelectDropdownUtils.js";

const modalEl = document.getElementById("saveAsTemplateModal");
const modalTitleEl = document.getElementById("saveAsTemplateModalLabel");
const templateNameField = document.getElementById("templateName");
const templateCategorySelect = document.getElementById("templateCategory");
const confirmBtn = document.getElementById("confirmSaveTemplateBtn");
const templateAspectRatioInput = document.getElementById("templateAspectRatio");
const templateAspectRatioContainers = document.querySelectorAll(
  ".js-template-aspect-ratio-options",
);
const templateAspectRatioGroup = document.querySelector(
  ".js-template-aspect-ratio-group",
);

const globalTemplateThumbnailField = document.getElementById(
  "globalTemplateThumbnailField",
);
const globalTemplateThumbnailInput = document.getElementById(
  "globalTemplateThumbnailInput",
);
const globalTemplateThumbnailPreview = document.getElementById(
  "globalTemplateThumbnailPreview",
);
const globalTemplateThumbnailPreviewImage = document.getElementById(
  "globalTemplateThumbnailPreviewImage",
);
const globalTemplateThumbnailPlaceholder = document.getElementById(
  "globalTemplateThumbnailPlaceholder",
);
const clearGlobalTemplateThumbnailBtn = document.getElementById(
  "clearGlobalTemplateThumbnailBtn",
);

const MAX_GLOBAL_THUMBNAIL_BYTES = 1024 * 1024; // 1 MB
let globalTemplateThumbnailValue = null;

const templateAspectRatioOptionMap = new Map();

const saveAsTemplateForm = document.getElementById("saveAsTemplateForm");

if (saveAsTemplateForm) {
  saveAsTemplateForm.addEventListener("submit", (e) => {
    e.preventDefault();
  });
}

function getTemplateAspectRatiosForOrientation(orientation) {
  if (orientation === ORIENTATION.LANDSCAPE) {
    return getAspectRatiosByOrientation(ORIENTATION.LANDSCAPE);
  }

  if (orientation === ORIENTATION.PORTRAIT) {
    return getAspectRatiosByOrientation(ORIENTATION.PORTRAIT);
  }

  if (orientation === ORIENTATION.SQUARE) {
    return getAspectRatiosByOrientation(ORIENTATION.SQUARE);
  }

  return DISPLAYABLE_ASPECT_RATIOS;
}

function createTemplateAspectRatioOption(container, ratio) {
  const wrapper = document.createElement("div");
  wrapper.className =
    "template-resolution-option-wrapper d-flex flex-column align-items-center";

  if (ratio.note) {
    const note = document.createElement("div");
    note.className = "template-resolution-option-note text-muted text-center";
    note.textContent = ratio.note;
    wrapper.appendChild(note);
  }

  const option = document.createElement("div");
  option.className =
    "template-resolution-option d-flex justify-content-center align-items-center border bg-light fw-bold cursor-pointer";
  option.setAttribute("data-ratio", ratio.value);
  option.setAttribute("data-width", ratio.width);
  option.setAttribute("data-height", ratio.height);
  option.style.width = `${ratio.smallMenuPreviewWidth || 60}px`;
  option.style.height = `${ratio.smallMenuPreviewHeight || 40}px`;
  option.title = ratio.label;
  option.textContent = ratio.value;

  option.addEventListener("click", () => {
    selectTemplateAspectRatio(ratio.value, { force: true });
  });

  wrapper.addEventListener("click", (event) => {
    if (event.target !== option) {
      selectTemplateAspectRatio(ratio.value, { force: true });
    }
  });

  wrapper.appendChild(option);
  container.appendChild(wrapper);
  templateAspectRatioOptionMap.set(ratio.value, { option, wrapper, ratio });
}

function applyTemplateMetadataLocally(
  templateId,
  metadataUpdate = {},
  serverData = null,
) {
  if (!templateId || !Array.isArray(store.slides)) return;

  const templateIndex = store.slides.findIndex(
    (slide) => slide.templateId === templateId,
  );
  if (templateIndex === -1) {
    return;
  }

  const targetSlide = store.slides[templateIndex];
  const previousAspect = targetSlide.aspect_ratio || DEFAULT_ASPECT_RATIO;

  const resolvedName = serverData?.name || metadataUpdate.name;
  if (resolvedName) {
    targetSlide.name = resolvedName;
    targetSlide.templateOriginalName = resolvedName;
  }

  if (Object.prototype.hasOwnProperty.call(metadataUpdate, "category_id")) {
    targetSlide.categoryId = metadataUpdate.category_id;
  }

  const categoryName = serverData?.category?.name;
  if (categoryName) {
    targetSlide.categoryName = categoryName;
  }

  if (Array.isArray(metadataUpdate.tag_ids)) {
    targetSlide.tagIds = metadataUpdate.tag_ids;
  }

  const tagNames = serverData?.tags?.map((tag) => tag.name);
  if (tagNames) {
    targetSlide.tagNames = tagNames;
  }

  const updatedAt = serverData?.updated_at;
  if (updatedAt) {
    targetSlide.updated_at = updatedAt;
  }

  if (
    Object.prototype.hasOwnProperty.call(metadataUpdate, "thumbnail_url") ||
    (serverData &&
      Object.prototype.hasOwnProperty.call(serverData, "thumbnail_url"))
  ) {
    if (
      serverData &&
      Object.prototype.hasOwnProperty.call(serverData, "thumbnail_url")
    ) {
      targetSlide.thumbnail_url = serverData.thumbnail_url;
    } else {
      targetSlide.thumbnail_url = metadataUpdate.thumbnail_url;
    }
  }

  const nextAspect =
    serverData?.aspect_ratio ||
    metadataUpdate.aspect_ratio ||
    previousAspect ||
    DEFAULT_ASPECT_RATIO;
  targetSlide.aspect_ratio = nextAspect;

  if (typeof serverData?.preview_width === "number") {
    targetSlide.preview_width = serverData.preview_width;
  } else if (typeof metadataUpdate.preview_width === "number") {
    targetSlide.preview_width = metadataUpdate.preview_width;
  }
  if (typeof serverData?.preview_height === "number") {
    targetSlide.preview_height = serverData.preview_height;
  } else if (typeof metadataUpdate.preview_height === "number") {
    targetSlide.preview_height = metadataUpdate.preview_height;
  }

  updateSlideSelector();

  if (templateIndex === store.currentSlideIndex && targetSlide) {
    if (nextAspect !== previousAspect) {
      const resolution = getResolutionForAspectRatio(nextAspect);
      if (resolution) {
        store.emulatedWidth = resolution.width;
        store.emulatedHeight = resolution.height;
        scaleAllSlides();
      }
    }
    loadSlide(targetSlide);
  }
}

function ensureTemplateAspectRatioOption(value) {
  if (!value || templateAspectRatioOptionMap.has(value)) {
    return;
  }

  const definition = getAspectRatioDefinition(value);
  if (!definition) {
    return;
  }

  const orientation = definition.orientation || ORIENTATION.LANDSCAPE;
  const container = Array.from(templateAspectRatioContainers).find(
    (node) => node.getAttribute("data-orientation") === orientation,
  );

  if (!container) {
    return;
  }

  createTemplateAspectRatioOption(container, definition);
}

function updateTemplateAspectRatioActiveState(selectedValue) {
  templateAspectRatioOptionMap.forEach(({ option }) => {  
    if(option.getAttribute("data-ratio") === selectedValue) {
      option.classList.add("active");
      
      // Create check icon if not already present
      if (!option.querySelector("i")) {
        const checkedIcon = document.createElement("i");
        checkedIcon.className = "material-symbols-outlined me-1 fs-5";
        checkedIcon.textContent = "check_circle";
        option.insertBefore(checkedIcon, option.firstChild);
      }
    } else {
      // Remove active state and icon
      option.querySelector("i")?.remove();
      option.classList.remove("active");
    }
  });
}

function selectTemplateAspectRatio(value, { force = false } = {}) {
  const definition = getAspectRatioDefinition(value);
  const resolvedValue = definition ? definition.value : DEFAULT_ASPECT_RATIO;

  ensureTemplateAspectRatioOption(resolvedValue);

  if (!force && templateAspectRatioInput?.value === resolvedValue) {
    updateTemplateAspectRatioActiveState(resolvedValue);
    return;
  }

  if (templateAspectRatioInput) {
    templateAspectRatioInput.value = resolvedValue;
  }

  updateTemplateAspectRatioActiveState(resolvedValue);
}

function renderTemplateAspectRatioOptions() {
  if (!templateAspectRatioContainers.length) {
    return;
  }

  templateAspectRatioOptionMap.clear();

  templateAspectRatioContainers.forEach((container) => {
    const orientation = container.getAttribute("data-orientation");
    const ratios = getTemplateAspectRatiosForOrientation(orientation);

    container.innerHTML = "";

    ratios.forEach((ratio) => {
      createTemplateAspectRatioOption(container, ratio);
    });

    // Hide the entire aspect ratio section if there are no ratios to display
    const aspectRatioContainer = container.closest(".js-template-aspect-ratio-options");
    if (aspectRatioContainer) {
      aspectRatioContainer.classList.toggle("d-none", ratios.length === 0);
    }
  });

  const initialValue = templateAspectRatioInput?.value || DEFAULT_ASPECT_RATIO;
  selectTemplateAspectRatio(initialValue, { force: true });
}

function setTemplateAspectRatioDisabled(disabled) {
  templateAspectRatioOptionMap.forEach(({ option, wrapper }) => {
    if (disabled) {
      option.classList.add("disabled", "opacity-50");
      option.setAttribute("aria-disabled", "true");
      wrapper.style.pointerEvents = "none";
    } else {
      option.classList.remove("disabled", "opacity-50");
      option.removeAttribute("aria-disabled");
      wrapper.style.pointerEvents = "";
    }
  });
}

renderTemplateAspectRatioOptions();

function toggleGlobalThumbnailField(shouldShow) {
  if (!globalTemplateThumbnailField) {
    return;
  }
  globalTemplateThumbnailField.classList.toggle("d-none", !shouldShow);
}

function setGlobalThumbnailPreview(thumbnailValue) {
  globalTemplateThumbnailValue = thumbnailValue || null;

  if (globalTemplateThumbnailPreviewImage) {
    if (globalTemplateThumbnailValue) {
      globalTemplateThumbnailPreviewImage.src = globalTemplateThumbnailValue;
      globalTemplateThumbnailPreviewImage.classList.remove("d-none");
    } else {
      globalTemplateThumbnailPreviewImage.removeAttribute("src");
      globalTemplateThumbnailPreviewImage.classList.add("d-none");
    }
  }

  if (globalTemplateThumbnailPlaceholder) {
    globalTemplateThumbnailPlaceholder.classList.toggle(
      "d-none",
      Boolean(globalTemplateThumbnailValue),
    );
  }

  if (clearGlobalTemplateThumbnailBtn) {
    clearGlobalTemplateThumbnailBtn.disabled = !globalTemplateThumbnailValue;
  }
}

function resetGlobalThumbnailState() {
  if (globalTemplateThumbnailInput) {
    globalTemplateThumbnailInput.value = "";
  }
  setGlobalThumbnailPreview(null);
}

function prepareGlobalThumbnailControlsForTemplate(template) {
  const isGlobalTemplate = Boolean(
    template?.isGlobalTemplate || store.globalTemplateContext,
  );
  toggleGlobalThumbnailField(isGlobalTemplate);
  if (isGlobalTemplate) {
    setGlobalThumbnailPreview(template?.thumbnail_url || null);
  } else {
    resetGlobalThumbnailState();
  }
}

if (globalTemplateThumbnailInput) {
  globalTemplateThumbnailInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    if (file.size > MAX_GLOBAL_THUMBNAIL_BYTES) {
      showToast(gettext("Thumbnail image must be 1 MB or smaller."), "Warning");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setGlobalThumbnailPreview(reader.result);
    };
    reader.onerror = () => {
      showToast(gettext("Unable to read the selected image."), "Error");
      event.target.value = "";
      setGlobalThumbnailPreview(null);
    };
    reader.readAsDataURL(file);
  });
}

if (clearGlobalTemplateThumbnailBtn) {
  clearGlobalTemplateThumbnailBtn.addEventListener("click", () => {
    resetGlobalThumbnailState();
  });
}

if (modalEl) {
  modalEl.addEventListener("hidden.bs.modal", () => {
    resetGlobalThumbnailState();
    toggleGlobalThumbnailField(false);
  });
}

function isAspectRatioLocked() {
  // Lock aspect ratio when EDITING existing templates (not when creating new ones)
  // For suborg templates, always lock (both creating and editing)
  if (queryParams.mode === "suborg_templates") {
    return true;
  }

  // For global templates, only lock when editing an existing template
  if (queryParams.mode === "template_editor") {
    return store.editingTemplateId !== null;
  }

  return false;
}

function getAspectRatioForIndex(index = null) {
  if (typeof index === "number" && index > -1 && store.slides[index]) {
    return store.slides[index].aspect_ratio || DEFAULT_ASPECT_RATIO;
  }

  if (store.currentSlideIndex > -1 && store.slides[store.currentSlideIndex]) {
    return (
      store.slides[store.currentSlideIndex].aspect_ratio || DEFAULT_ASPECT_RATIO
    );
  }

  if (store.slides.length > 0) {
    return store.slides[0].aspect_ratio || DEFAULT_ASPECT_RATIO;
  }

  return DEFAULT_ASPECT_RATIO;
}

function applyAspectRatioSelectState(preferredValue, lockSelection) {
  const resolvedValue =
    preferredValue || templateAspectRatioInput?.value || DEFAULT_ASPECT_RATIO;

  selectTemplateAspectRatio(resolvedValue, { force: true });

  if (templateAspectRatioGroup) {
    templateAspectRatioGroup.style.display = lockSelection ? "none" : "";
  }

  setTemplateAspectRatioDisabled(lockSelection);
}

export function openSaveAsTemplateModal(index = null, isBlank = false) {
  if (!isBlank && index == null) {
    showToast(gettext("No slide index provided."), "Error");
    return;
  }

  toggleGlobalThumbnailField(false);
  resetGlobalThumbnailState();

  store.editingTemplateId = null; // Ensure we are in "create" mode
  store.editingTemplateIndex = null;
  store.currentTemplateSlideIndex = isBlank ? null : index;

  templateNameField.value = isBlank
    ? gettext("New Blank Template")
    : store.slides[index].name + " " + gettext("Template");

  if (modalTitleEl) {
    modalTitleEl.textContent = isBlank
      ? gettext("Create New Blank Template")
      : gettext("Save Slide as Template");
  }
  if (confirmBtn) {
    confirmBtn.textContent = gettext("Save Template");
  }

  fetchCategoriesForDropdown();
  fetchTagsForDropdown("tagsDropdownToggle", "tagsDropdownMenu");
  // Reset aspect ratio to default when opening modal
  const allowAspectRatioChanges = !isAspectRatioLocked();
  const defaultAspectRatio = allowAspectRatioChanges
    ? DEFAULT_ASPECT_RATIO
    : getAspectRatioForIndex(isBlank ? store.currentSlideIndex : index);
  applyAspectRatioSelectState(defaultAspectRatio, !allowAspectRatioChanges);

  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();
}

export function openEditTemplateMetadataModal(index) {
  const templateToEdit = store.slides[index];
  if (!templateToEdit || !templateToEdit.templateId) {
    showToast(gettext("Cannot edit template: Invalid template data."), "Error");
    return;
  }

  store.editingTemplateId = templateToEdit.templateId;
  store.editingTemplateIndex = index;
  store.currentTemplateSlideIndex = null; // Not saving "as new"

  templateNameField.value = templateToEdit.name;

  prepareGlobalThumbnailControlsForTemplate(templateToEdit);

  if (modalTitleEl) {
    modalTitleEl.textContent = gettext("Edit Template Details");
  }
  if (confirmBtn) {
    confirmBtn.textContent = gettext("Save Changes");
  }

  fetchCategoriesForDropdown(templateToEdit.categoryId);
  fetchTagsForDropdown("tagsDropdownToggle", "tagsDropdownMenu", templateToEdit.tagIds || []);
  loadAspectRatio(templateToEdit.aspect_ratio || DEFAULT_ASPECT_RATIO);

  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();
}

function loadAspectRatio(aspectRatio = DEFAULT_ASPECT_RATIO) {
  ensureTemplateAspectRatioOption(aspectRatio);
  applyAspectRatioSelectState(aspectRatio, isAspectRatioLocked());
}

/**
 * @description Fetches categories for the organization and populates the category dropdown in the template modal. If a selectedCategoryId is provided, that category will be pre-selected in the dropdown.
 * @param {number} selectedCategoryId 
 */
async function fetchCategoriesForDropdown(selectedCategoryId = null) {
  if (!templateCategorySelect) return;

  templateCategorySelect.innerHTML =
    '<option value="">(' + gettext("Nothing selected") + ")</option>";
  
  await fetchCategories().then((cats) => {
    cats.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.name;
      templateCategorySelect.appendChild(opt);
    });
    if (selectedCategoryId) {
      templateCategorySelect.value = selectedCategoryId;
    }
  });
}

/**
 * @description Fetches tags and initializes the tags multi-select dropdown for the template modal. If selectedTagIds are provided, those tags will be pre-selected in the dropdown.
 * @param {string} dropdownBtnId 
 * @param {string} dropdownMenuId 
 * @param {Array<number>} selectedTagIds 
 */
async function fetchTagsForDropdown(dropdownBtnId, dropdownMenuId, selectedTagIds = []) {
  await fetchTags().then((tagsList) => {
    // Initialize tags dropdown
    initializeMultiSelectDropdown(tagsList, dropdownBtnId, dropdownMenuId, selectedTagIds);
  });
}

/**
 * @description Fetches tags for the organization.
 * @returns list of tags
 */
async function fetchTags() {
  const tagsList = await genericFetch(
    `${BASE_URL}/api/tags/?organisation_id=${parentOrgID}`,
  );

  return tagsList;
}

/**
 * @description Fetches categories for the organization.
 * @returns list of categories
 */
async function fetchCategories() {
    const categoriesList = await genericFetch(
    `${BASE_URL}/api/categories/?organisation_id=${parentOrgID}`,
  );

  return categoriesList;
}

if (confirmBtn) {
  confirmBtn.addEventListener("click", async () => {
    // Start with current emulated resolution as fallback
    let selectedResolution = {
      width: store.emulatedWidth,
      height: store.emulatedHeight,
    };

    const name = templateNameField.value.trim();
    const categoryId = templateCategorySelect.value;
    const tag_ids = [];
    const tagCheckboxes = document.querySelectorAll(
      ".dropdownCheckboxesContainer input[type='checkbox']",
    );
    tagCheckboxes.forEach((cb) => {
      if (cb.checked) {
        tag_ids.push(parseInt(cb.dataset.valueId, 10));
      }
    });

    const canEditAspectRatio = !isAspectRatioLocked();
    const contextSlideIndex =
      typeof store.editingTemplateIndex === "number"
        ? store.editingTemplateIndex
        : typeof store.currentTemplateSlideIndex === "number"
          ? store.currentTemplateSlideIndex
          : store.currentSlideIndex;
    const enforcedAspectRatio = getAspectRatioForIndex(contextSlideIndex);

    // Get selected aspect ratio
    const aspectRatio = canEditAspectRatio
      ? templateAspectRatioInput?.value || enforcedAspectRatio
      : enforcedAspectRatio;

    ensureTemplateAspectRatioOption(aspectRatio);

    // Map common aspect ratios to sensible preview resolutions.
    // This ensures the server receives preview_width/preview_height matching
    // the chosen aspect ratio instead of the currently selected template's values.
    if (canEditAspectRatio && aspectRatio) {
      const resolution = getResolutionForAspectRatio(aspectRatio);
      selectedResolution = {
        width: resolution.width,
        height: resolution.height,
      };
    }

    if (!name) {
      showToast(gettext("Please enter a template name."), "Warning");
      return;
    }

    const bsModalInstance = bootstrap.Modal.getInstance(modalEl);

    if (store.editingTemplateId) {
      // Editing existing template metadata
      const currentTemplate = store.slides[store.editingTemplateIndex];
      const isSuborgTemplate = Boolean(currentTemplate?.isSuborgTemplate);
      const isGlobalTemplate = Boolean(
        currentTemplate?.isGlobalTemplate || store.globalTemplateContext,
      );

      const payload = {
        name: name,
        aspect_ratio: aspectRatio,
      };

      let apiEndpoint = `${BASE_URL}/api/slide-templates/${store.editingTemplateId}/`;

      if (isGlobalTemplate) {
        payload.thumbnail_url = globalTemplateThumbnailValue;
        payload.preview_width = selectedResolution.width;
        payload.preview_height = selectedResolution.height;
        apiEndpoint = `${BASE_URL}/api/global-templates/${store.editingTemplateId}/`;
      } else {
        payload.category_id = categoryId ? parseInt(categoryId) : null;
        payload.tag_ids = tag_ids;
        payload.organisation_id = parentOrgID;
        if (isSuborgTemplate) {
          apiEndpoint = `${BASE_URL}/api/suborg-templates/${store.editingTemplateId}/`;
        }
      }

      try {
        const resp = await fetch(apiEndpoint, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const errTxt = await resp.text();
          console.error("Failed to update template metadata:", errTxt);
          showToast(
            gettext("Failed to update template metadata: ") + errTxt,
            "Error",
          );
          return;
        }
        let updatedTemplateFromServer = null;
        try {
          updatedTemplateFromServer = await resp.json();
        } catch {
          // Ignore empty/invalid JSON bodies (some PATCH endpoints return 204)
        }

        applyTemplateMetadataLocally(
          store.editingTemplateId,
          payload,
          updatedTemplateFromServer,
        );

        showToast(gettext("Template details updated successfully."), "Success");

        if (bsModalInstance) bsModalInstance.hide();

      } catch (err) {
        console.error("Error updating template metadata:", err);
        showToast(gettext("Error: ") + err.message, "Error");
      } finally {
        store.editingTemplateId = null;
        store.editingTemplateIndex = null;
      }
    } else {
      // Creating a new template
      let highestId = 1;
      if (store.slides.length > 0) {
        store.slides.forEach((slide) => {
          if (slide.id > highestId) {
            // Assuming slide.id is numeric, might need parsing if string
            highestId = slide.id;
          }
        });
      }

      const isBlank = store.currentTemplateSlideIndex === null;
      // const newId = +highestId + 1; // Ensure numeric. Backend should assign ID.

      const slideData = isBlank
        ? {
            // id: newId, // API should assign ID for new slideData, not client
            elements: [],
            redoStack: [],
            undoStack: [],
            backgroundColor: "#ffffff",
            name: name, // Default name for blank slide
            duration: 5, // Default duration
            savedSnapSettings: {
              unit: "cells",
              amount:
                getDefaultCellSnapForResolution(
                  store.emulatedWidth,
                  store.emulatedHeight,
                ) || 1,
              isAuto: true,
              snapEnabled: false,
            },
          }
        : {
            ...structuredClone(store.slides[store.currentTemplateSlideIndex]),
            // id: newId, // API should assign ID
            name: store.slides[store.currentTemplateSlideIndex].name, // Keep original name or use new name?
          };
      // Remove template specific IDs if copying from another template
      delete slideData.templateId;
      delete slideData.templateOriginalName;
      delete slideData.categoryId;
      delete slideData.tagIds;
      delete slideData.aspect_ratio;

      const payload = {
        name: name,
        category_id: categoryId ? parseInt(categoryId) : null,
        tag_ids: tag_ids,
        aspect_ratio: aspectRatio,
        slide_data: slideData,
        // Prefer the resolution derived from the selected aspect ratio.
        preview_width: selectedResolution.width || store.emulatedWidth || 1920,
        preview_height:
          selectedResolution.height || store.emulatedHeight || 1080,
        // organisation_id is part of the URL for POST
      };

      try {
        const resp = await fetch(
          `${BASE_URL}/api/slide-templates/?organisation_id=${parentOrgID}`, // Use parentOrgID from import
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );
        if (!resp.ok) {
          const errTxt = await resp.text();
          console.error("Failed to save template:", errTxt);
          showToast(gettext("Failed to save template: ") + errTxt, "Error");
          return;
        }
        const savedTemplate = await resp.json();
        showToast(gettext("Template saved: ") + savedTemplate.name, "Success");
        await fetchUnifiedTemplates(); // This might be for a different template list

        if (
          queryParams.mode === "template_editor" ||
          queryParams.mode === "suborg_templates"
        ) {
          await fetchAllOrgTemplatesAndPopulateStore(parentOrgID);
          const newTemplateIndex = store.slides.findIndex(
            (slide) => slide.templateId === savedTemplate.id,
          );
          if (newTemplateIndex !== -1) {
            store.currentSlideIndex = newTemplateIndex;
            loadSlide(store.slides[newTemplateIndex]); // Load the newly created and selected template
            updateResolution(selectedResolution);

            updateSlideSelector(); // Update selector to highlight new template
            // Ensure proper scaling after adding slide from template
            const previewContainer =
              document.querySelector(".preview-column .preview-container") ||
              document.querySelector(".slide-canvas .preview-container");
            if (previewContainer) {
              scaleSlide(previewContainer);
            }
          }
        }

        if (bsModalInstance) bsModalInstance.hide();

        store.currentTemplateSlideIndex = null;
      } catch (err) {
        console.error("Error saving template:", err);
        showToast(gettext("Error: ") + err.message, "Error");
      }
    }
    refreshTemplateFilterOptions();
  });
}
