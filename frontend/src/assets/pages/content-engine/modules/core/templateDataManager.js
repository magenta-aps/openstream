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
import {
  subscribeToPersistedStateChanges,
  suspendPersistedStateNotifications,
} from "./persistedStateObserver.js";
import { updateResolution } from "./virutalPreviewResolution.js";
import { updateAllSlidesZoom } from "../utils/zoomController.js";
import { getCurrentAspectRatio } from "./addSlide.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";
import {
  DEFAULT_ASPECT_RATIO,
  getResolutionForAspectRatio,
} from "../../../../utils/availableAspectRatios.js";
import { syncGridToCurrentSlide } from "../config/gridConfig.js";
import {
  refreshTemplateFilterOptions,
  updateTemplateSlideCount,
} from "./templateFilterControls.js";
import { registerFontsFromSlides } from "../utils/fontUtils.js";
import {
  SPECIAL_SAVE_ENABLED,
  resolveSingleSlideForSpecialSave,
} from "../utils/specialSaveUtils.js";

const TEMPLATE_AUTOSAVE_DEBOUNCE_MS = 1200;
let templateAutosaveTimer = null;
let templateAutosaveUnsubscribe = null;
let templatePendingSnapshot = null;
let templateLastSavedSnapshot = null;
let templateDirtySinceLastSave = false;
let templateSaveInFlight = false;

let lastStoredSingleSlideStr = null;

function ensureTemplateLegacyMap() {
  if (!(store.templateLegacyFlags instanceof Map)) {
    store.templateLegacyFlags = new Map();
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
  setTimeout(() => {
    scaleAllSlides();
    updateAllSlidesZoom();
  }, 50);

  syncGridToCurrentSlide();
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

export async function populateStoreFromTemplates({
  templates = [],
  templateIdToPreserve = null,
  transformSlideObject = () => {},
} = {}) {
  const resumePersistedNotifications = suspendPersistedStateNotifications();
  try {
    store.slides.length = 0;
    store.currentSlideIndex = -1;
    store.lastSlideIndex = null;
    store.activeSlideshowIsLegacy = false;
    store.legacyGridEnabled = false;
    ensureTemplateLegacyMap();
    store.templateLegacyFlags.clear();

    templates.forEach((template) => {
      if (!template?.slide_data) {
        console.warn(
          `Template ID ${template?.id} ('${template?.name}') is missing slide_data. Skipping.`,
        );
        return;
      }

      store.templateLegacyFlags.set(template.id, Boolean(template.is_legacy));

      const slideObject = JSON.parse(JSON.stringify(template.slide_data));
      slideObject.templateId = template.id;
      slideObject.templateOriginalName = template.name;
      slideObject.name = template.name;
      slideObject.aspect_ratio = template.aspect_ratio || DEFAULT_ASPECT_RATIO;
      slideObject.created_at = template.created_at;
      slideObject.updated_at = template.updated_at;

      const templateCategory = template.category || null;
      slideObject.categoryId =
        template.category_id || (templateCategory ? templateCategory.id : null);
      slideObject.categoryName = templateCategory
        ? templateCategory.name
        : null;

      const templateTags = Array.isArray(template.tags) ? template.tags : [];
      slideObject.tagIds = templateTags.map((tag) => tag.id);
      slideObject.tagNames = templateTags.map((tag) => tag.name || "");

      slideObject.preview_width = template.preview_width;
      slideObject.preview_height = template.preview_height;

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

      transformSlideObject(slideObject, template);
      store.slides.push(slideObject);
    });
    updateTemplateSlideCount();

    await registerFontsFromSlides(store.slides);

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
    refreshTemplateFilterOptions();

    if (store.currentSlideIndex !== -1) {
      const currentTemplateSlide = store.slides[store.currentSlideIndex];
      const aspectRatio =
        currentTemplateSlide.aspect_ratio || DEFAULT_ASPECT_RATIO;
      setResolutionFromAspectRatio(aspectRatio);

      if (!store.emulatedWidth || !store.emulatedHeight) {
        store.emulatedWidth = currentTemplateSlide.preview_width || 1920;
        store.emulatedHeight = currentTemplateSlide.preview_height || 1080;
        syncGridToCurrentSlide(currentTemplateSlide);
      }

      syncGridToCurrentSlide(currentTemplateSlide);
      loadSlide(currentTemplateSlide);
      scaleAllSlides();
      initTemplateAutoSave();
      lastStoredSingleSlideStr = JSON.stringify(currentTemplateSlide);
    }
  } finally {
    resumePersistedNotifications();
  }

  return true;
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

  store.globalTemplateContext = false;

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
    await populateStoreFromTemplates({
      templates: fetchedTemplates,
      templateIdToPreserve,
      transformSlideObject: (slideObject) => {
        slideObject.isSuborgTemplate = false;
        slideObject.isGlobalTemplate = false;
      },
    });
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

  let slideDataToSave = { ...currentSlideObject };
  delete slideDataToSave.templateId;
  delete slideDataToSave.templateOriginalName;
  delete slideDataToSave.preview_width;
  delete slideDataToSave.preview_height;
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

  if (SPECIAL_SAVE_ENABLED) {
    slideDataToSave = await resolveSingleSlideForSpecialSave(slideDataToSave);
  }

  const isSuborgTemplate = currentSlideObject.isSuborgTemplate === true;
  const isGlobalTemplateContext =
    store.globalTemplateContext === true ||
    currentSlideObject.isGlobalTemplate === true;

  let orgId = null;
  if (!isGlobalTemplateContext) {
    orgId =
      isSuborgTemplate && currentSlideObject.organisationId
        ? currentSlideObject.organisationId
        : parentOrgID;
  }

  const payload = {
    name: currentSlideObject.name,
    slide_data: slideDataToSave,
    preview_width: store.emulatedWidth,
    preview_height: store.emulatedHeight,
    aspect_ratio: currentSlideObject.aspect_ratio || DEFAULT_ASPECT_RATIO,
  };

  if (!isGlobalTemplateContext) {
    payload.organisation_id = orgId;
  } else {
    payload.thumbnail_url = currentSlideObject.thumbnail_url || null;
  }

  let apiEndpoint;
  if (isGlobalTemplateContext) {
    apiEndpoint = `${BASE_URL}/api/global-templates/${templateIdToSave}/`;
  } else if (isSuborgTemplate) {
    apiEndpoint = `${BASE_URL}/api/suborg-templates/${templateIdToSave}/`;
  } else {
    apiEndpoint = `${BASE_URL}/api/slide-templates/${templateIdToSave}/`;
  }

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
    currentSlideObject.preview_width = updatedTemplateFromServer.preview_width;
    currentSlideObject.preview_height =
      updatedTemplateFromServer.preview_height;
    currentSlideObject.aspect_ratio =
      updatedTemplateFromServer.aspect_ratio || DEFAULT_ASPECT_RATIO;

    if (updatedTemplateFromServer?.id) {
      ensureTemplateLegacyMap();
      store.templateLegacyFlags.set(
        updatedTemplateFromServer.id,
        Boolean(updatedTemplateFromServer.isLegacy),
      );
    }

    if (isGlobalTemplateContext) {
      currentSlideObject.thumbnail_url =
        updatedTemplateFromServer.thumbnail_url || null;
    }

    lastStoredSingleSlideStr = JSON.stringify(currentSlideObject);

    return updatedTemplateFromServer;
  } catch (err) {
    console.error("Error saving template:", err);
    showToast(`Failed to save template: ${err.message}`, "Error");
    throw err;
  }
}

export function initTemplateAutoSave() {
  stopTemplateAutoSave();

  if (!canTemplateAutoSave()) {
    console.warn("Template auto-save not initialized - conditions not met");
    lastStoredSingleSlideStr = null;
    showSavingStatus("idle");
    return;
  }

  templateLastSavedSnapshot = captureCurrentTemplateSnapshot();
  templatePendingSnapshot = templateLastSavedSnapshot;
  templateDirtySinceLastSave = false;
  lastStoredSingleSlideStr = templateLastSavedSnapshot;
  showSavingStatus("idle");

  templateAutosaveUnsubscribe = subscribeToPersistedStateChanges(() => {
    if (!canTemplateAutoSave()) {
      return;
    }
    scheduleTemplateAutoSave();
  });
}

function canTemplateAutoSave() {
  return (
    store.currentSlideIndex !== -1 &&
    (store.editorMode === "template_editor" ||
      store.editorMode === "suborg_templates") &&
    !!store.slides[store.currentSlideIndex]
  );
}

function captureCurrentTemplateSnapshot() {
  if (!canTemplateAutoSave()) {
    return null;
  }
  return JSON.stringify(store.slides[store.currentSlideIndex]);
}

function scheduleTemplateAutoSave() {
  const snapshot = captureCurrentTemplateSnapshot();
  if (!snapshot) {
    templateDirtySinceLastSave = false;
    return;
  }

  templatePendingSnapshot = snapshot;
  templateDirtySinceLastSave =
    templatePendingSnapshot !== templateLastSavedSnapshot;

  if (!templateDirtySinceLastSave) {
    return;
  }

  showSavingStatus("pending");

  if (templateSaveInFlight) {
    return;
  }

  if (templateAutosaveTimer) {
    clearTimeout(templateAutosaveTimer);
  }

  templateAutosaveTimer = window.setTimeout(() => {
    runTemplateAutoSave();
  }, TEMPLATE_AUTOSAVE_DEBOUNCE_MS);
}

async function runTemplateAutoSave() {
  if (!templateDirtySinceLastSave || !canTemplateAutoSave()) {
    return;
  }

  if (templateAutosaveTimer) {
    clearTimeout(templateAutosaveTimer);
    templateAutosaveTimer = null;
  }

  templateSaveInFlight = true;
  const snapshotToPersist = templatePendingSnapshot;
  showSavingStatus("saving");

  try {
    await saveCurrentTemplateData();
    templateLastSavedSnapshot = snapshotToPersist;
    lastStoredSingleSlideStr = snapshotToPersist;
    templateDirtySinceLastSave =
      templatePendingSnapshot !== templateLastSavedSnapshot;
    showSavingStatus("success", { timestamp: new Date() });
  } catch (err) {
    templateDirtySinceLastSave = true;
    console.error("Template auto-save failed:", err);
    showSavingStatus("error", { message: err.message });
  } finally {
    templateSaveInFlight = false;
    if (templateDirtySinceLastSave) {
      scheduleTemplateAutoSave();
    }
  }
}

function stopTemplateAutoSave() {
  if (templateAutosaveTimer) {
    clearTimeout(templateAutosaveTimer);
    templateAutosaveTimer = null;
  }
  if (templateAutosaveUnsubscribe) {
    templateAutosaveUnsubscribe();
    templateAutosaveUnsubscribe = null;
  }
  templateSaveInFlight = false;
}

export async function initTemplateEditor() {
  store.editorMode = "template_editor";
  store.globalTemplateContext = false;

  const slideshowNameEl = document.getElementById("slideshow-name");
  if (slideshowNameEl)
    slideshowNameEl.textContent = gettext("Manage Templates");

  const addSlideButton = document.getElementById("add-slide-button");
  if (addSlideButton) addSlideButton.style.display = "none";

  const slideSelectorContainer = document.querySelector(
    ".slide-selector-container",
  );
  if (slideSelectorContainer) slideSelectorContainer.style.display = "block";

  await fetchAllOrgTemplatesAndPopulateStore(parentOrgID);
}

export function clearTemplateAutoSave() {
  stopTemplateAutoSave();
  templatePendingSnapshot = null;
  templateLastSavedSnapshot = null;
  templateDirtySinceLastSave = false;
  lastStoredSingleSlideStr = null;
}

export async function duplicateTemplateOnBackend(templateId) {
  if (!templateId) {
    showToast(gettext("Cannot duplicate: Template ID is missing."), "Error");
    return false;
  }

  const queryParams = new URLSearchParams(window.location.search);
  const isSuborgMode = queryParams.get("mode") === "suborg_templates";
  const isGlobalMode =
    store.globalTemplateContext === true ||
    queryParams.get("template_scope") === "global";
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
        slide_data: originalTemplate.slide_data,
        preview_width: originalTemplate.preview_width,
        preview_height: originalTemplate.preview_height,
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

    if (isGlobalMode) {
      const getResp = await fetch(
        `${BASE_URL}/api/global-templates/${templateId}/`,
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
          `Failed to fetch global template. Status: ${getResp.status} ${await getResp.text()}`,
        );
      }

      const originalTemplate = await getResp.json();
      const duplicatePayload = {
        name: gettext("Copy of ") + originalTemplate.name,
        slide_data: originalTemplate.slide_data,
        preview_width: originalTemplate.preview_width,
        preview_height: originalTemplate.preview_height,
        aspect_ratio: originalTemplate.aspect_ratio || DEFAULT_ASPECT_RATIO,
        thumbnail_url: originalTemplate.thumbnail_url || null,
      };

      const createResp = await fetch(`${BASE_URL}/api/global-templates/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(duplicatePayload),
      });

      if (!createResp.ok) {
        throw new Error(
          `Failed to create duplicate template. Status: ${createResp.status} ${await createResp.text()}`,
        );
      }

      const duplicatedTemplate = await createResp.json();
      showToast(gettext("Template duplicated successfully."), "success");
      const { fetchAllGlobalTemplatesAndPopulateStore } = await import(
        "./globalTemplateDataManager.js"
      );
      await fetchAllGlobalTemplatesAndPopulateStore(duplicatedTemplate.id);
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
      slide_data: originalTemplate.slide_data,
      preview_width: originalTemplate.preview_width,
      preview_height: originalTemplate.preview_height,
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
  const isGlobalMode =
    store.globalTemplateContext === true ||
    queryParams.get("template_scope") === "global";
  const suborgId =
    queryParams.get("suborgId") ??
    queryParams.get("suborg_id") ??
    selectedSubOrgID ??
    "";

  try {
    // Use appropriate endpoint based on mode
    const endpoint = isGlobalMode
      ? `${BASE_URL}/api/global-templates/${templateId}/`
      : isSuborgMode
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
    if (isGlobalMode) {
      const { fetchAllGlobalTemplatesAndPopulateStore } = await import(
        "./globalTemplateDataManager.js"
      );
      await fetchAllGlobalTemplatesAndPopulateStore();
    } else if (isSuborgMode && suborgId) {
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
