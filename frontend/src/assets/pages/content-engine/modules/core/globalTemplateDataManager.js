// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";
import { showToast, token } from "../../../../utils/utils.js";
import {
  DEFAULT_ASPECT_RATIO,
  getResolutionForAspectRatio,
  getDefaultCellSnapForResolution,
} from "../../../../utils/availableAspectRatios.js";
import { populateStoreFromTemplates } from "./templateDataManager.js";

function buildAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function ensureGlobalTemplatePermissions() {
  try {
    const resp = await fetch(`${BASE_URL}/api/global-templates/permissions/`, {
      method: "GET",
      headers: buildAuthHeaders(),
    });

    if (!resp.ok) {
      throw new Error(`Status ${resp.status}: ${await resp.text()}`);
    }

    const data = await resp.json();
    if (!data?.can_manage) {
      showToast(
        gettext(
          "You need super administrator privileges to manage global templates.",
        ),
        "Error",
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("Unable to verify global template permissions:", err);
    showToast(
      gettext("Failed to verify permissions for global templates."),
      "Error",
    );
    return false;
  }
}

export async function fetchAllGlobalTemplatesAndPopulateStore(
  templateIdToPreserve = null,
) {
  try {
    const resp = await fetch(`${BASE_URL}/api/global-templates/`, {
      method: "GET",
      headers: buildAuthHeaders(),
    });

    if (!resp.ok) {
      throw new Error(
        `Failed to load global templates. Status: ${resp.status} ${await resp.text()}`,
      );
    }

    const templates = await resp.json();
    await populateStoreFromTemplates({
      templates,
      templateIdToPreserve,
      transformSlideObject: (slideObject, template) => {
        slideObject.isSuborgTemplate = false;
        slideObject.isGlobalTemplate = true;
        slideObject.organisationId = null;
        slideObject.suborganisationId = null;
        slideObject.thumbnail_url = template.thumbnail_url || null;
      },
    });
    return true;
  } catch (err) {
    console.error("Error fetching global templates:", err);
    showToast(gettext("Failed to load global templates: ") + err.message, "Error");
    return false;
  }
}

export async function initGlobalTemplateEditor() {
  store.editorMode = "template_editor";
  store.globalTemplateContext = true;

  const slideshowNameEl = document.getElementById("slideshow-name");
  if (slideshowNameEl) {
    slideshowNameEl.textContent = gettext("Manage Global Templates");
  }

  const addSlideButton = document.getElementById("add-slide-button");
  if (addSlideButton) addSlideButton.style.display = "none";

  const slideSelectorContainer = document.querySelector(
    ".slide-selector-container",
  );
  if (slideSelectorContainer) slideSelectorContainer.style.display = "block";

  const hasPermission = await ensureGlobalTemplatePermissions();
  if (!hasPermission) {
    store.globalTemplateContext = false;
    const previewContainer =
      document.querySelector(".preview-column .preview-container") ||
      document.querySelector(".preview-container");
    if (previewContainer) {
      previewContainer.innerHTML = `<p class="text-danger text-center mt-5">${gettext(
        "You do not have permission to manage global templates.",
      )}</p>`;
    }
    return false;
  }

  const success = await fetchAllGlobalTemplatesAndPopulateStore();
  if (!success) {
    const previewContainer =
      document.querySelector(".preview-column .preview-container") ||
      document.querySelector(".preview-container");
    if (previewContainer) {
      previewContainer.innerHTML = `<p class="text-danger text-center mt-5">${gettext(
        "Unable to load global templates.",
      )}</p>`;
    }
    return false;
  }

  const pageTitle = document.getElementById("contentEngineTitle");
  if (pageTitle) {
    pageTitle.textContent = gettext("Global Templates");
  }

  return true;
}

export async function createGlobalTemplate(options = {}) {
  const { name: providedName, aspectRatio: providedAspectRatio } = options;
  const defaultBaseName = gettext("New Global Template");
  const uniqueSuffix = new Date().toISOString().slice(11, 19); // HH:MM:SS
  const fallbackName = `${defaultBaseName} ${uniqueSuffix}`;
  const newTemplateName = providedName?.trim() || fallbackName;

  const activeSlide =
    store.currentSlideIndex > -1 ? store.slides[store.currentSlideIndex] : null;
  const inferredAspectRatio =
    activeSlide?.aspect_ratio || store.slides[0]?.aspect_ratio || DEFAULT_ASPECT_RATIO;
  const aspectRatio = providedAspectRatio || inferredAspectRatio;
  const resolution = getResolutionForAspectRatio(aspectRatio);
  const previewWidth = resolution?.width || store.emulatedWidth || 1920;
  const previewHeight = resolution?.height || store.emulatedHeight || 1080;
  const snapAmount =
    getDefaultCellSnapForResolution(previewWidth, previewHeight) || 1;

  const slideData = {
    elements: [],
    redoStack: [],
    undoStack: [],
    backgroundColor: "#ffffff",
    name: newTemplateName,
    duration: 5,
    savedSnapSettings: {
      unit: "cells",
      amount: snapAmount,
      isAuto: true,
      snapEnabled: false,
    },
  };

  const payload = {
    name: newTemplateName,
    slide_data: slideData,
    preview_width: previewWidth,
    preview_height: previewHeight,
    aspect_ratio: aspectRatio,
    thumbnail_url: null,
  };

  try {
    const resp = await fetch(`${BASE_URL}/api/global-templates/`, {
      method: "POST",
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      throw new Error(
        `Failed to create global template. Status ${resp.status}: ${errTxt}`,
      );
    }

    const createdTemplate = await resp.json();
    showToast(
      gettext("Global template created successfully."),
      "Success",
    );
    await fetchAllGlobalTemplatesAndPopulateStore(createdTemplate.id);
    return createdTemplate;
  } catch (err) {
    console.error("Error creating global template:", err);
    showToast(gettext("Failed to create global template: ") + err.message, "Error");
    throw err;
  }
}
