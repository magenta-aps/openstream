// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { loadSlide, scaleAllSlides } from "./renderSlide.js";
import { updateSlideSelector } from "./slideSelector.js";
import {
  showToast,
  token,
  parentOrgID,
  selectedSubOrgID,
} from "../../../../utils/utils.js";
import { showSavingStatus } from "./slideshowDataManager.js"; // Assuming this can be reused
import { updateResolution } from "./virutalPreviewResolution.js";
import { updateAllSlidesZoom } from "../utils/zoomController.js";
import { getCurrentAspectRatio } from "./addSlide.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";
import {
  DEFAULT_ASPECT_RATIO,
  getResolutionForAspectRatio,
} from "../../../../utils/availableAspectRatios.js";

let templateAutosaveTimer = null;

let lastStoredSingleSlideStr = null;

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
  setTimeout(() => {
    scaleAllSlides();
    updateAllSlidesZoom();
  }, 50);

  console.log(
    `Set resolution to ${width}x${height} for aspect ratio ${aspectRatio}`,
  );
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

export async function fetchAllOrgTemplatesAndPopulateStore(
  templateIdToPreserve = null,
) {
  if (!parentOrgID) {
    showToast(
      gettext("Organisation ID is missing. Cannot fetch templates."),
      "Error",
    );
    console.error("fetchAllOrgTemplates: Organisation ID is missing.");
    return false;
  }

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
        `Failed to load templates. Status: ${resp.status} ${await resp.text()}`,
      );
    }
    const fetchedTemplates = await resp.json();

    store.slides.length = 0;

    if (fetchedTemplates && fetchedTemplates.length > 0) {
      fetchedTemplates.forEach((template) => {
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
        slideObject.aspect_ratio =
          template.aspect_ratio || DEFAULT_ASPECT_RATIO;

        slideObject.categoryId =
          template.category_id ||
          (template.category ? template.category.id : null);
        slideObject.tagIds = template.tags
          ? template.tags.map((tag) => tag.id)
          : [];

        slideObject.previewWidth = template.previewWidth;
        slideObject.previewHeight = template.previewHeight;

        if (!slideObject.duration) slideObject.duration = 5;
        if (!slideObject.elements) slideObject.elements = [];
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

          // Ensure lock state is properly initialized
          if (typeof element.isLocked === "undefined") {
            element.isLocked = false;
          }

          if (element.type === "html" && element.content) {
            try {
              const parser = new DOMParser();
              const doc = parser.parseFromString(element.content, "text/html");
              element.html = doc.body.innerHTML.trim();
              const styleEl = doc.querySelector("style");
              element.css = styleEl ? styleEl.textContent : "";
              const scriptEl = doc.querySelector("script");
              element.js = scriptEl ? scriptEl.textContent : "";
            } catch (e) {
              console.error(
                "Failed to parse HTML element content for template's slide",
                e,
              );
              element.html = element.html || "";
              element.css = element.css || "";
              element.js = element.js || "";
            }
          }
        });

        store.slides.push(slideObject);
      });
    }

    // Try to preserve the selection of the specified template
    let targetSlideIndex = 0;
    if (templateIdToPreserve && store.slides.length > 0) {
      const foundIndex = store.slides.findIndex(
        (slide) => slide.templateId === templateIdToPreserve,
      );
      if (foundIndex !== -1) {
        targetSlideIndex = foundIndex;
      }
    }

    store.currentSlideIndex = store.slides.length > 0 ? targetSlideIndex : -1;
    updateSlideSelector();

    if (store.currentSlideIndex !== -1) {
      const currentTemplateSlide = store.slides[store.currentSlideIndex];

      // Set resolution based on template's aspect ratio
      const aspectRatio =
        currentTemplateSlide.aspect_ratio || DEFAULT_ASPECT_RATIO;
      setResolutionFromAspectRatio(aspectRatio);

      // Fallback to previewWidth/Height if needed
      if (!store.emulatedWidth || !store.emulatedHeight) {
        store.emulatedWidth = currentTemplateSlide.previewWidth || 1920;
        store.emulatedHeight = currentTemplateSlide.previewHeight || 1080;
      }

      loadSlide(currentTemplateSlide);
      scaleAllSlides();
      initTemplateAutoSave();
      lastStoredSingleSlideStr = JSON.stringify(currentTemplateSlide);
    }
    return true;
  } catch (err) {
    console.error("Error fetching and populating templates:", err);
    showToast(`Failed to load templates: ${err.message}`, "Error");
    store.slides.length = 0;
    store.currentSlideIndex = -1;
    updateSlideSelector();
    document.querySelector(".preview-slide").innerHTML =
      "<p class='text-center text-danger mt-5'>" +
      gettext("Error loading templates.") +
      "</p>";
    return false;
  }
}

export async function saveCurrentTemplateData() {
  if (
    store.currentSlideIndex === -1 ||
    !store.slides[store.currentSlideIndex]
  ) {
    console.warn("saveCurrentTemplateData: No template selected or no data.");
    return Promise.reject("No template selected");
  }

  const currentSlideObject = store.slides[store.currentSlideIndex];
  const templateIdToSave = currentSlideObject.templateId;

  if (!templateIdToSave) {
    showToast(
      gettext("Error: Cannot save template. Original template ID is missing."),
      "Error",
    );
    console.error(
      "saveCurrentTemplateData: templateId missing on slide object",
      currentSlideObject,
    );
    return Promise.reject("Missing templateId");
  }

  const slideDataToSave = { ...currentSlideObject };
  delete slideDataToSave.templateId;
  delete slideDataToSave.templateOriginalName;
  delete slideDataToSave.previewWidth;
  delete slideDataToSave.previewHeight;
  delete slideDataToSave.categoryId;
  delete slideDataToSave.tagIds;
  delete slideDataToSave.aspect_ratio;
  delete slideDataToSave.isSuborgTemplate;
  delete slideDataToSave.isGlobalTemplate;
  delete slideDataToSave.organisationId;
  delete slideDataToSave.suborganisationId;
  delete slideDataToSave.parentTemplate;

  // Remove frontend-only properties from elements
  if (slideDataToSave.elements && Array.isArray(slideDataToSave.elements)) {
    slideDataToSave.elements.forEach((element) => {
      delete element.lockedFromParent;
    });
  }

  // For suborg templates, use organisationId from slide object; otherwise use parentOrgID
  const orgId =
    currentSlideObject.isSuborgTemplate && currentSlideObject.organisationId
      ? currentSlideObject.organisationId
      : parentOrgID;

  const payload = {
    name: currentSlideObject.name,
    slideData: slideDataToSave,
    previewWidth: store.emulatedWidth,
    previewHeight: store.emulatedHeight,
    organisation_id: orgId,
  aspect_ratio: currentSlideObject.aspect_ratio || DEFAULT_ASPECT_RATIO,
  };

  // Use the correct endpoint based on whether it's a suborg template or global template
  const isSuborgTemplate = currentSlideObject.isSuborgTemplate === true;
  const apiEndpoint = isSuborgTemplate
    ? `${BASE_URL}/api/suborg-templates/${templateIdToSave}/`
    : `${BASE_URL}/api/slide-templates/${templateIdToSave}/`;

  console.log(`Saving template ${templateIdToSave} to ${apiEndpoint}`, {
    isSuborgTemplate,
    editorMode: store.editorMode,
    templateId: templateIdToSave,
  });

  try {
    const resp = await fetch(apiEndpoint, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      throw new Error(`Save failed. Status: ${resp.status}: ${errTxt}`);
    }

    const updatedTemplateFromServer = await resp.json();

    currentSlideObject.templateOriginalName = updatedTemplateFromServer.name;
    currentSlideObject.previewWidth = updatedTemplateFromServer.previewWidth;
    currentSlideObject.previewHeight = updatedTemplateFromServer.previewHeight;
    currentSlideObject.aspect_ratio =
  updatedTemplateFromServer.aspect_ratio || DEFAULT_ASPECT_RATIO;

    lastStoredSingleSlideStr = JSON.stringify(currentSlideObject);

    return updatedTemplateFromServer;
  } catch (err) {
    console.error("Error saving template:", err);
    showToast(`Failed to save template: ${err.message}`, "Error");
    throw err;
  }
}

export function initTemplateAutoSave() {
  console.log("initTemplateAutoSave called", {
    editorMode: store.editorMode,
    currentSlideIndex: store.currentSlideIndex,
    hasSlide: !!store.slides[store.currentSlideIndex],
  });

  if (templateAutosaveTimer) {
    clearInterval(templateAutosaveTimer);
  }
  if (
    store.currentSlideIndex === -1 ||
    (store.editorMode !== "template_editor" &&
      store.editorMode !== "suborg_templates") ||
    !store.slides[store.currentSlideIndex]
  ) {
    console.warn("Auto-save not initialized - conditions not met");
    lastStoredSingleSlideStr = null;
    return;
  }

  console.log("Auto-save initialized successfully for template mode");
  lastStoredSingleSlideStr = JSON.stringify(
    store.slides[store.currentSlideIndex],
  );

  templateAutosaveTimer = setInterval(() => {
    if (
      store.currentSlideIndex === -1 ||
      !store.slides[store.currentSlideIndex]
    ) {
      clearInterval(templateAutosaveTimer);
      return;
    }
    const currentSlideObject = store.slides[store.currentSlideIndex];
    const currentStateStr = JSON.stringify(currentSlideObject);

    if (currentStateStr !== lastStoredSingleSlideStr) {
      console.log("Template changed - auto-saving...", {
        templateId: currentSlideObject.templateId,
        isSuborgTemplate: currentSlideObject.isSuborgTemplate,
      });
      saveCurrentTemplateData()
        .then(() => {
          console.log("Auto-save successful");
          showSavingStatus();
        })
        .catch((err) => {
          if (err !== "No template selected" && err !== "Missing templateId") {
            console.error("Template auto-save failed:", err);
            showToast(
              gettext("Template auto-save error: ") + err.message,
              "Error",
            );
          } else if (err === "Missing templateId") {
            console.warn(
              "Template auto-save attempt failed due to missing templateId.",
            );
          }
        });
    }
  }, 500);
}

export async function initTemplateEditor() {
  store.editorMode = "template_editor";

  const slideshowNameEl = document.getElementById("slideshow-name");
  if (slideshowNameEl)
    slideshowNameEl.textContent = gettext("Manage Templates");

  const modeTextEl = document.getElementById("slideshow-mode-text");
  if (modeTextEl) modeTextEl.innerText = gettext("Manage Templates");

  const addSlideButton = document.getElementById("add-slide-button");
  if (addSlideButton) addSlideButton.style.display = "none";

  const slideSelectorContainer = document.querySelector(
    ".slide-selector-container",
  );
  if (slideSelectorContainer) slideSelectorContainer.style.display = "block";

  await fetchAllOrgTemplatesAndPopulateStore(parentOrgID);
}

export function clearTemplateAutoSave() {
  if (templateAutosaveTimer) {
    clearInterval(templateAutosaveTimer);
    templateAutosaveTimer = null;
  }
  lastStoredSingleSlideStr = null;
}

export async function duplicateTemplateOnBackend(templateId) {
  if (!templateId) {
    showToast(gettext("Cannot duplicate: Template ID is missing."), "Error");
    return false;
  }

  const queryParams = new URLSearchParams(window.location.search);
  const isSuborgMode = queryParams.get("mode") === "suborg_templates";
  const suborgIdFromParams =
    queryParams.get("suborgId") ??
    queryParams.get("suborg_id") ??
    selectedSubOrgID ??
    "";
  const suborgIdInt = parseInt(suborgIdFromParams, 10);
  const hasValidSuborgId = !Number.isNaN(suborgIdInt);

  if (!isSuborgMode && !parentOrgID) {
    showToast(
      gettext("Organisation ID is missing. Cannot duplicate template."),
      "Error",
    );
    return false;
  }

  if (isSuborgMode && !hasValidSuborgId) {
    showToast(
      gettext("Suborganisation ID is missing. Cannot duplicate template."),
      "Error",
    );
    return false;
  }

  try {
    if (isSuborgMode && hasValidSuborgId) {
      // Fetch the existing suborg template
      const originalResp = await fetch(
        `${BASE_URL}/api/suborg-templates/${templateId}/`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!originalResp.ok) {
        throw new Error(
          `Failed to fetch suborg template. Status: ${originalResp.status} ${await originalResp.text()}`,
        );
      }

      const originalTemplate = await originalResp.json();

      if (!originalTemplate?.parent_template?.id) {
        showToast(
          gettext(
            "Cannot duplicate this template because the parent template reference is missing.",
          ),
          "Error",
        );
        return false;
      }

      // Step 1: create a fresh copy from the parent global template
      const createPayload = {
        suborg_id: suborgIdInt,
        parent_template_id: originalTemplate.parent_template.id,
        name: gettext("Copy of ") + originalTemplate.name,
      };

      const createResp = await fetch(`${BASE_URL}/api/suborg-templates/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createPayload),
      });

      if (!createResp.ok) {
        throw new Error(
          `Failed to create duplicate template. Status: ${createResp.status} ${await createResp.text()}`,
        );
      }

      const createdTemplate = await createResp.json();

      // Step 2: apply the customised data from the original suborg template
      const patchPayload = {
        slideData: originalTemplate.slideData,
        previewWidth: originalTemplate.previewWidth,
        previewHeight: originalTemplate.previewHeight,
        aspect_ratio: originalTemplate.aspect_ratio || DEFAULT_ASPECT_RATIO,
      };

      if (originalTemplate.category?.id) {
        patchPayload.category_id = originalTemplate.category.id;
      }

      if (originalTemplate.tags && originalTemplate.tags.length > 0) {
        patchPayload.tag_ids = originalTemplate.tags.map((tag) => tag.id);
      }

      const patchResp = await fetch(
        `${BASE_URL}/api/suborg-templates/${createdTemplate.id}/`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(patchPayload),
        },
      );

      if (!patchResp.ok) {
        throw new Error(
          `Failed to update duplicated template. Status: ${patchResp.status} ${await patchResp.text()}`,
        );
      }

      const duplicatedTemplate = await patchResp.json();
      showToast(gettext("Template duplicated successfully."), "success");

      const { fetchAllSuborgTemplatesAndPopulateStore } = await import(
        "./suborgTemplateDataManager.js"
      );
      await fetchAllSuborgTemplatesAndPopulateStore(
        suborgIdInt,
        duplicatedTemplate.id,
      );

      return duplicatedTemplate;
    }

    // Global template duplication fallback
    const getResp = await fetch(
      `${BASE_URL}/api/slide-templates/${templateId}/`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!getResp.ok) {
      throw new Error(
        `Failed to fetch template. Status: ${getResp.status} ${await getResp.text()}`,
      );
    }

    const originalTemplate = await getResp.json();

    const duplicatePayload = {
      name: gettext("Copy of ") + originalTemplate.name,
      slideData: originalTemplate.slideData,
      previewWidth: originalTemplate.previewWidth,
      previewHeight: originalTemplate.previewHeight,
      aspect_ratio: originalTemplate.aspect_ratio || DEFAULT_ASPECT_RATIO,
      category_id: originalTemplate.category_id,
      tags: originalTemplate.tags || [],
    };

    const createResp = await fetch(
      `${BASE_URL}/api/slide-templates/?organisation_id=${parentOrgID}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(duplicatePayload),
      },
    );

    if (!createResp.ok) {
      throw new Error(
        `Failed to create duplicate template. Status: ${createResp.status} ${await createResp.text()}`,
      );
    }

    const duplicatedTemplate = await createResp.json();
    showToast(gettext("Template duplicated successfully."), "success");
    await fetchAllOrgTemplatesAndPopulateStore(duplicatedTemplate.id);

    return duplicatedTemplate;
  } catch (err) {
    console.error("Error duplicating template:", err);
    showToast(`Failed to duplicate template: ${err.message}`, "Error");
    return false;
  }
}

export async function deleteTemplateOnBackend(templateId) {
  if (!templateId) {
    showToast(gettext("Cannot delete: Template ID is missing."), "Error");
    return false;
  }

  // Check if we're in suborg templates mode
  const queryParams = new URLSearchParams(window.location.search);
  const isSuborgMode = queryParams.get("mode") === "suborg_templates";
  const suborgId =
    queryParams.get("suborgId") ??
    queryParams.get("suborg_id") ??
    selectedSubOrgID ??
    "";

  try {
    // Use appropriate endpoint based on mode
    const endpoint = isSuborgMode
      ? `${BASE_URL}/api/suborg-templates/${templateId}/`
      : `${BASE_URL}/api/slide-templates/${templateId}/`;

    const resp = await fetch(endpoint, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!resp.ok) {
      throw new Error(
        `Failed to delete template. Status: ${resp.status} ${await resp.text()}`,
      );
    }
    showToast(gettext("Template deleted successfully."), "success");

    // Refresh the appropriate template list
    if (isSuborgMode && suborgId) {
      // Import and call suborg template refresh
      const { fetchAllSuborgTemplatesAndPopulateStore } = await import(
        "./suborgTemplateDataManager.js"
      );
      // Refresh suborg templates; do not reapply a previously captured
      // resolution. The populate function will set resolution based on
      // the currently selected template (or defaults) when applicable.
      await fetchAllSuborgTemplatesAndPopulateStore(suborgId);
    } else if (parentOrgID) {
      // Refresh org templates; do not reapply a previously captured
      // resolution. The populate function will set resolution based on
      // the currently selected template (or defaults) when applicable.
      await fetchAllOrgTemplatesAndPopulateStore();
    }
    return true;
  } catch (err) {
    console.error("Error deleting template:", err);
    showToast(`Failed to delete template: ${err.message}`, "Error");
    return false;
  }
}
