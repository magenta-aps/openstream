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

const modalEl = document.getElementById("saveAsTemplateModal");
const modalTitleEl = document.getElementById("saveAsTemplateModalLabel");
const templateNameField = document.getElementById("templateName");
const templateCategorySelect = document.getElementById("templateCategory");
const confirmBtn = document.getElementById("confirmSaveTemplateBtn");
const selectAllLandscape = document.getElementById("selectAllLandscape");
const selectAllPortrait = document.getElementById("selectAllPortrait");
const landscapeRatiosContainer = document.getElementById("landscapeRatios");
const portraitRatiosContainer = document.getElementById("portraitRatios");

// Initialize aspect ratio checkboxes event listeners
if (selectAllLandscape) {
  selectAllLandscape.addEventListener("change", (e) => {
    const landscapeRatios = document.querySelectorAll(".landscape-ratio");
    landscapeRatios.forEach((checkbox) => {
      checkbox.checked = e.target.checked;
    });
    updateAspectRatioSummary();
  });
}

if (selectAllPortrait) {
  selectAllPortrait.addEventListener("change", (e) => {
    const portraitRatios = document.querySelectorAll(".portrait-ratio");
    portraitRatios.forEach((checkbox) => {
      checkbox.checked = e.target.checked;
    });
    updateAspectRatioSummary();
  });
}

// Add change listeners to all ratio checkboxes
document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelectorAll('input[name="aspectRatios"]')
    .forEach((checkbox) => {
      checkbox.addEventListener("change", updateAspectRatioSummary);
    });
});

// Function to update aspect ratio selection summary
function updateAspectRatioSummary() {
  const selectedRatios = Array.from(
    document.querySelectorAll('input[name="aspectRatios"]:checked'),
  ).map((checkbox) => checkbox.value);

  const countSummary =
    document.getElementById("aspectRatioSummary") ||
    document.createElement("div");
  if (!document.getElementById("aspectRatioSummary")) {
    countSummary.id = "aspectRatioSummary";
    countSummary.className = "mt-2 text-info small";
    const container = document.querySelector(
      ".modal-body form .mb-3:last-of-type",
    );
    if (container) container.appendChild(countSummary);
  }

  if (selectedRatios.length > 0) {
    countSummary.innerHTML = `<i class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">check_circle</i> ${selectedRatios.length} ${gettext("aspect ratio")}${selectedRatios.length !== 1 ? gettext("s") : ""} ${gettext("selected")}`;
  } else {
    countSummary.innerHTML = `<i class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">info</i> ${gettext("No aspect ratios selected yet")}`;
  }

  // Update select all checkboxes
  updateSelectAllCheckboxes();
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
  resetAspectRatios(); // Reset aspect ratio checkboxes when opening modal

  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();
}

// Function to reset aspect ratio checkboxes
function resetAspectRatios() {
  // Uncheck all checkboxes
  document
    .querySelectorAll('input[name="aspectRatios"]')
    .forEach((checkbox) => {
      checkbox.checked = false;
    });

  // Uncheck select all checkboxes
  if (selectAllLandscape) selectAllLandscape.checked = false;
  if (selectAllPortrait) selectAllPortrait.checked = false;

  // We intentionally don't auto-select any aspect ratios by default
  // This allows users to manually choose which aspect ratios the template supports
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
  loadAspectRatios(templateToEdit.accepted_aspect_ratios || []);

  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();
}

// Function to load aspect ratios from template data
function loadAspectRatios(aspectRatios = []) {
  // First clear all checkboxes without applying defaults
  document
    .querySelectorAll('input[name="aspectRatios"]')
    .forEach((checkbox) => {
      checkbox.checked = false;
    });

  // Uncheck select all checkboxes
  if (selectAllLandscape) selectAllLandscape.checked = false;
  if (selectAllPortrait) selectAllPortrait.checked = false;

  // Then check the ones included in the template
  aspectRatios.forEach((ratio) => {
    const checkbox = document.querySelector(
      `input[name="aspectRatios"][value="${ratio}"]`,
    );
    if (checkbox) checkbox.checked = true;
  });

  // Check if all landscape or portrait ratios are selected and update "select all" checkboxes
  updateSelectAllCheckboxes();

  // Show selected ratio count in a summary element
  const countSummary =
    document.getElementById("aspectRatioSummary") ||
    document.createElement("div");
  if (!document.getElementById("aspectRatioSummary")) {
    countSummary.id = "aspectRatioSummary";
    countSummary.className = "mt-2 text-info small";
    const container = document.querySelector(
      ".modal-body form .mb-3:last-of-type",
    );
    if (container) container.appendChild(countSummary);
  }
}

// Function to update "select all" checkboxes based on individual selections
function updateSelectAllCheckboxes() {
  const landscapeRatios = document.querySelectorAll(".landscape-ratio");
  const portraitRatios = document.querySelectorAll(".portrait-ratio");

  // Check if all landscape ratios are selected
  const allLandscapeSelected = Array.from(landscapeRatios).every(
    (checkbox) => checkbox.checked,
  );
  if (selectAllLandscape) selectAllLandscape.checked = allLandscapeSelected;

  // Check if all portrait ratios are selected
  const allPortraitSelected = Array.from(portraitRatios).every(
    (checkbox) => checkbox.checked,
  );
  if (selectAllPortrait) selectAllPortrait.checked = allPortraitSelected;
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
    let selectedResolution = {
      width: store.emulatedWidth,
      height: store.emulatedHeight,
    };

    const name = templateNameField.value.trim();
    const categoryId = templateCategorySelect.value;
    const tagValues = document.getElementById("templateTags").value
      ? document.getElementById("templateTags").value.split(",")
      : [];

    // Get selected aspect ratios
    const aspectRatios = Array.from(
      document.querySelectorAll('input[name="aspectRatios"]:checked'),
    ).map((checkbox) => checkbox.value);

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
        accepted_aspect_ratios: aspectRatios,
        organisation_id: parentOrgID, // Include if your API requires/uses it for PATCH
      };

      try {
        const resp = await fetch(
          `${BASE_URL}/api/slide-templates/${store.editingTemplateId}/`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

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
        if (
          queryParams.mode === "template_editor" ||
          queryParams.mode === "suborg_templates"
        ) {
          await fetchAllOrgTemplatesAndPopulateStore(store.editingTemplateId);
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
      delete slideData.accepted_aspect_ratios;

      const payload = {
        name: name,
        category_id: categoryId ? parseInt(categoryId) : null,
        tag_ids: tagValues.map((t) => parseInt(t)),
        accepted_aspect_ratios: aspectRatios,
        slideData: slideData,
        previewWidth: store.emulatedWidth || 1920,
        previewHeight: store.emulatedHeight || 1080,
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
            const previewContainer = document.querySelector(
              ".slide-canvas .preview-container",
            );
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
