// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * SubOrganisation Template Data Manager
 *
 * Handles template settings lock hierarchy:
 * 1. Global template locks (preventSettingsChanges) are enforced in suborg templates
 *    - Suborg admins cannot modify or unlock these settings
 *    - Elements with parent locks are marked with `lockedFromParent` flag
 *
 * 2. Suborg template locks (preventSettingsChanges) are enforced for branch users
 *    - Suborg admins can add additional locks on non-parent-locked elements
 *    - Branch users respect both parent and suborg locks
 */

import { store } from "./slideStore.js";
import { loadSlide, scaleAllSlides } from "./renderSlide.js";
import { updateSlideSelector } from "./slideSelector.js";
import { showToast, token } from "../../../../utils/utils.js";
import { updateResolution } from "./virutalPreviewResolution.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";

let suborgId = null;

/**
 * Fetch all templates available for a suborg (global + suborg-specific)
 */
export async function fetchAllSuborgTemplatesAndPopulateStore(
  suborgIdToUse,
  templateIdToPreserve = null,
) {
  if (!suborgIdToUse) {
    showToast(
      gettext("SubOrganisation ID is missing. Cannot fetch templates."),
      "Error",
    );
    console.error("fetchAllSuborgTemplates: SubOrganisation ID is missing.");
    return false;
  }

  try {
    const resp = await fetch(
      `${BASE_URL}/api/suborg-templates/?suborg_id=${suborgIdToUse}`,
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
        `Failed to load templates. Status: ${resp.status} ${await resp.text()}`,
      );
    }
    const fetchedTemplates = await resp.json();

    store.slides.length = 0;

    if (fetchedTemplates && fetchedTemplates.length > 0) {
      // Filter to only show suborg-specific templates (not global ones)
      const suborgOnlyTemplates = fetchedTemplates.filter(
        (t) => t.suborganisation !== null,
      );

      suborgOnlyTemplates.forEach((template) => {
        if (!template.slideData) {
          console.warn(
            `Template ID ${template.id} ('${template.name}') is missing slideData. Skipping.`,
          );
          return;
        }
        const slideObject = JSON.parse(JSON.stringify(template.slideData));

        slideObject.templateId = template.id;
        slideObject.templateOriginalName = template.name;
        slideObject.name = template.name;
        slideObject.accepted_aspect_ratios =
          template.accepted_aspect_ratios || [];
        slideObject.isSuborgTemplate = true; // Always true since we filtered
        slideObject.isGlobalTemplate = false; // Always false since we filtered
        slideObject.parentTemplate = template.parent_template;
        slideObject.organisationId = template.organisation
          ? template.organisation.id
          : null;
        slideObject.suborganisationId = template.suborganisation
          ? template.suborganisation.id
          : null;

        slideObject.categoryId =
          template.category_id ||
          (template.category ? template.category.id : null);
        slideObject.tagIds = template.tags
          ? template.tags.map((tag) => tag.id)
          : [];

        slideObject.previewWidth = template.previewWidth;
        slideObject.previewHeight = template.previewHeight;

        if (!slideObject.duration) slideObject.duration = 5;
        if (!slideObject.elements || !Array.isArray(slideObject.elements)) {
          slideObject.elements = [];
        }
        if (!slideObject.undoStack) slideObject.undoStack = [];
        if (!slideObject.redoStack) slideObject.redoStack = [];
        if (typeof slideObject.activationEnabled === "undefined")
          slideObject.activationEnabled = false;
        if (typeof slideObject.activationDate === "undefined")
          slideObject.activationDate = null;
        if (typeof slideObject.deactivationDate === "undefined")
          slideObject.deactivationDate = null;

        slideObject.elements.forEach((element) => {
          if (element.id === undefined) {
            element.id = store.elementIdCounter++;
          } else if (element.id >= store.elementIdCounter) {
            store.elementIdCounter = element.id + 1;
          }

          if (typeof element.isLocked === "undefined") {
            element.isLocked = false;
          }

          // Mark elements that have settings locked from parent global template
          if (element.preventSettingsChanges && template.parent_template) {
            element.lockedFromParent = true;
          }

          if (element.type === "html" && element.content) {
            try {
              const parser = new DOMParser();
              const doc = parser.parseFromString(element.content, "text/html");
              element.content = doc.body.innerHTML || element.content;
            } catch (err) {
              console.warn(
                `Failed to parse HTML content for element ${element.id}:`,
                err,
              );
            }
          }
        });

        store.slides.push(slideObject);
      });
    }

    if (store.slides.length === 0) {
      console.warn(
        gettext(
          "No suborganisation-specific templates found. Create one using 'Create Template from Global' button.",
        ),
      );
    }

    let slideIdxToLoad = 0;
    if (templateIdToPreserve !== null) {
      const idx = store.slides.findIndex(
        (s) => s.templateId === templateIdToPreserve,
      );
      if (idx !== -1) {
        slideIdxToLoad = idx;
      }
    }

    // Set the current slide index BEFORE loading
    store.currentSlideIndex = store.slides.length > 0 ? slideIdxToLoad : -1;

    updateSlideSelector();

    if (store.currentSlideIndex !== -1) {
      const currentTemplateSlide = store.slides[store.currentSlideIndex];
      store.emulatedWidth = currentTemplateSlide.previewWidth || 1920;
      store.emulatedHeight = currentTemplateSlide.previewHeight || 1080;

      loadSlide(currentTemplateSlide);
      scaleAllSlides();

      // Initialize auto-save for suborg templates
      const { initTemplateAutoSave } = await import("./templateDataManager.js");
      initTemplateAutoSave();
    } else {
      scaleAllSlides();
    }
    return true;
  } catch (err) {
    console.error("Error loading suborg templates:", err);
    showToast(gettext("Error loading templates: ") + err.message, "Error");
    return false;
  }
}

/**
 * Initialize the suborg template editor
 */
export async function initSuborgTemplateEditor(suborgIdToUse) {
  suborgId = suborgIdToUse;
  store.editorMode = "suborg_templates";
  console.log(`Initializing suborg template editor for suborg ID: ${suborgId}`);

  const success = await fetchAllSuborgTemplatesAndPopulateStore(suborgId);
  if (!success) {
    console.error(gettext("Failed to fetch and populate suborg templates."));
    return;
  }

  // Set page title
  const pageTitle = document.getElementById("contentEngineTitle");
  if (pageTitle) {
    pageTitle.textContent = gettext("Manage SubOrganisation Templates");
  }

  console.log(gettext("Suborg template editor initialized successfully."));
}

/**
 * Update a suborg template
 */
export async function updateSuborgTemplate(templateId, templateData) {
  try {
    const resp = await fetch(
      `${BASE_URL}/api/suborg-templates/${templateId}/`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(templateData),
      },
    );

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(JSON.stringify(err));
    }

    return await resp.json();
  } catch (err) {
    console.error("Error updating suborg template:", err);
    throw err;
  }
}

/**
 * Delete a suborg template
 */
export async function deleteSuborgTemplate(templateId) {
  try {
    const resp = await fetch(
      `${BASE_URL}/api/suborg-templates/${templateId}/`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(JSON.stringify(err));
    }

    return true;
  } catch (err) {
    console.error("Error deleting suborg template:", err);
    throw err;
  }
}
