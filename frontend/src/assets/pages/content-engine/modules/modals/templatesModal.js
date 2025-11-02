// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { fetchUnifiedTemplates } from "../core/addSlide.js";

import {
  parentOrgID,
  showToast,
  token,
  queryParams,
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
} from "../../../../utils/availableAspectRatios.js";

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

const templateAspectRatioOptionMap = new Map();

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
    note.className =
      "template-resolution-option-note text-muted text-center";
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
    option.classList.toggle(
      "active",
      option.getAttribute("data-ratio") === selectedValue,
    );
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

    const card = container.closest(".card");
    if (card) {
      card.classList.toggle("d-none", ratios.length === 0);
    }
  });

  const initialValue =
    templateAspectRatioInput?.value || DEFAULT_ASPECT_RATIO;
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

function isAspectRatioLocked() {
  return queryParams.mode === "suborg_templates";
}

function getAspectRatioForIndex(index = null) {
  if (typeof index === "number" && index > -1 && store.slides[index]) {
    return store.slides[index].aspect_ratio || DEFAULT_ASPECT_RATIO;
  }

  if (store.currentSlideIndex > -1 && store.slides[store.currentSlideIndex]) {
    return (
      store.slides[store.currentSlideIndex].aspect_ratio ||
      DEFAULT_ASPECT_RATIO
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

  fetchCategoriesForTemplate();
  fetchTagsForTemplate();
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

  if (modalTitleEl) {
    modalTitleEl.textContent = gettext("Edit Template Details");
  }
  if (confirmBtn) {
    confirmBtn.textContent = gettext("Save Changes");
  }

  fetchCategoriesForTemplate(templateToEdit.categoryId);
  fetchTagsForTemplate(templateToEdit.tagIds || []);
  loadAspectRatio(templateToEdit.aspect_ratio || DEFAULT_ASPECT_RATIO);

  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();
}

function loadAspectRatio(aspectRatio = DEFAULT_ASPECT_RATIO) {
  ensureTemplateAspectRatioOption(aspectRatio);
  applyAspectRatioSelectState(aspectRatio, isAspectRatioLocked());
}

async function fetchCategoriesForTemplate(selectedCategoryId = null) {
  if (!templateCategorySelect) return;
  templateCategorySelect.innerHTML =
    '<option value="">' + gettext("-- None --") + "</option>";
  try {
    const resp = await fetch(
      `${BASE_URL}/api/categories/?organisation_id=${parentOrgID}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!resp.ok) return;
    const cats = await resp.json();
    cats.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.name;
      templateCategorySelect.appendChild(opt);
    });
    if (selectedCategoryId) {
      templateCategorySelect.value = selectedCategoryId;
    }
  } catch (err) {
    console.error("Failed to fetch categories", err);
  }
}

async function fetchTagsForTemplate(selectedTagIds = []) {
  const tagCheckboxes = document.getElementById("tagCheckboxes");
  const selectAllTags = document.getElementById("selectAllTags");
  const tagsDropdownToggle = document.getElementById("tagsDropdownToggle");
  const selectedTagsCount = tagsDropdownToggle.querySelector(
    ".selected-tags-count",
  );
  const selectedTagsText = tagsDropdownToggle.querySelector(
    ".selected-tags-text",
  );

  if (!tagCheckboxes) return;

  // Convert selectedTagIds to strings for easier comparison
  const selectedTagIdsStr = selectedTagIds.map((id) => String(id));

  // Clear previous options
  tagCheckboxes.innerHTML = "";

  try {
    const resp = await fetch(
      `${BASE_URL}/api/tags/?organisation_id=${parentOrgID}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!resp.ok) return;
    const tags = await resp.json();

    // Add tag checkboxes to the dropdown
    tags.forEach((tag) => {
      const isSelected = selectedTagIdsStr.includes(String(tag.id));

      const checkboxDiv = document.createElement("div");
      checkboxDiv.className = "form-check";

      const checkbox = document.createElement("input");
      checkbox.className = "form-check-input tag-checkbox";
      checkbox.type = "checkbox";
      checkbox.id = `tag-${tag.id}`;
      checkbox.value = tag.id;
      checkbox.checked = isSelected;

      const label = document.createElement("label");
      label.className = "form-check-label";
      label.htmlFor = `tag-${tag.id}`;
      label.textContent = tag.name;

      checkboxDiv.appendChild(checkbox);
      checkboxDiv.appendChild(label);
      tagCheckboxes.appendChild(checkboxDiv);
    });

    // Setup event listeners for tags
    setupTagsDropdownListeners();

    // Update the visual state based on selections
    updateTagsDropdownState();
  } catch (err) {
    console.error("Failed to fetch tags", err);
  }
}

// Setup the event listeners for the tags dropdown
function setupTagsDropdownListeners() {
  const tagCheckboxes = document.querySelectorAll(".tag-checkbox");
  const selectAllTags = document.getElementById("selectAllTags");
  const tagsDropdownMenu = document.getElementById("tagsDropdownMenu");

  // Prevent dropdown from closing when clicking inside
  if (tagsDropdownMenu) {
    tagsDropdownMenu.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // Setup select all checkbox
  if (selectAllTags) {
    // Remove any existing listeners to prevent duplicates
    selectAllTags.replaceWith(selectAllTags.cloneNode(true));
    const newSelectAllTags = document.getElementById("selectAllTags");

    newSelectAllTags.addEventListener("change", (e) => {
      const currentTagCheckboxes = document.querySelectorAll(".tag-checkbox");
      currentTagCheckboxes.forEach((checkbox) => {
        checkbox.checked = e.target.checked;
      });
      updateTagsDropdownState();
    });
  }

  // Setup individual tag checkboxes
  tagCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      updateTagsDropdownState();
    });
  });
}

// Update the dropdown state based on selections
function updateTagsDropdownState() {
  const tagCheckboxes = document.querySelectorAll(".tag-checkbox");
  const selectAllTags = document.getElementById("selectAllTags");
  const tagsDropdownToggle = document.getElementById("tagsDropdownToggle");
  const selectedTagsCount = tagsDropdownToggle?.querySelector(
    ".selected-tags-count",
  );
  const selectedTagsText = tagsDropdownToggle?.querySelector(
    ".selected-tags-text",
  );
  const templateTags = document.getElementById("templateTags");

  // Get selected tags
  const selectedTags = Array.from(tagCheckboxes).filter((cb) => cb.checked);

  // Update select all checkbox - be more defensive about the check
  if (selectAllTags) {
    const allSelected =
      tagCheckboxes.length > 0 && selectedTags.length === tagCheckboxes.length;
    if (selectAllTags.checked !== allSelected) {
      selectAllTags.checked = allSelected;
    }
  }

  // Update counter and text
  if (selectedTagsCount && selectedTagsText) {
    const count = selectedTags.length;
    selectedTagsCount.textContent = count;
    selectedTagsCount.style.display = count > 0 ? "inline-block" : "none";

    if (count === 0) {
      selectedTagsText.textContent = gettext("Select tags...");
    } else if (count <= 2) {
      // Show tag names if 2 or fewer
      const tagNames = selectedTags
        .map((cb) => {
          const label = document.querySelector(`label[for="${cb.id}"]`);
          return label ? label.textContent : "";
        })
        .filter((name) => name); // Filter out empty names
      selectedTagsText.textContent = tagNames.join(", ");
    } else {
      // Just show count if more than 2
      selectedTagsText.textContent = gettext("Tags selected");
    }
  }

  // Update hidden input value with selected tag ids
  if (templateTags) {
    const selectedIds = selectedTags.map((cb) => cb.value);
    templateTags.value = selectedIds.join(",");
  }
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
    const tagValues = document.getElementById("templateTags").value
      ? document.getElementById("templateTags").value.split(",")
      : [];

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
    // This ensures the server receives previewWidth/previewHeight matching
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
      const payload = {
        name: name,
        category_id: categoryId ? parseInt(categoryId) : null,
        tag_ids: tagValues.map((t) => parseInt(t)),
        aspect_ratio: aspectRatio,
        organisation_id: parentOrgID, // Include if your API requires/uses it for PATCH
      };

      // Check if we're editing a suborg template by looking at the current template
      const currentTemplate = store.slides[store.editingTemplateIndex];
      const isSuborgTemplate =
        currentTemplate && currentTemplate.isSuborgTemplate;

      // Use the appropriate API endpoint based on template type
      const apiEndpoint = isSuborgTemplate
        ? `${BASE_URL}/api/suborg-templates/${store.editingTemplateId}/`
        : `${BASE_URL}/api/slide-templates/${store.editingTemplateId}/`;

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
        showToast(gettext("Template details updated successfully."), "Success");
        // Refresh the templates list to show changes
        if (queryParams.mode === "template_editor") {
          await fetchAllOrgTemplatesAndPopulateStore(store.editingTemplateId);
        } else if (queryParams.mode === "suborg_templates") {
          // For suborg templates, we need to import and use the suborg-specific refresh function
          const { fetchAllSuborgTemplatesAndPopulateStore } = await import(
            "../core/suborgTemplateDataManager.js"
          );
          const suborgId = queryParams.suborg_id;
          if (suborgId) {
            await fetchAllSuborgTemplatesAndPopulateStore(
              suborgId,
              store.editingTemplateId,
            );
          }
        }
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
        tag_ids: tagValues.map((t) => parseInt(t)),
        aspect_ratio: aspectRatio,
        slideData: slideData,
        // Prefer the resolution derived from the selected aspect ratio.
        previewWidth: selectedResolution.width || store.emulatedWidth || 1920,
        previewHeight:
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
  });
}
