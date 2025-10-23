// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { showToast, token, parentOrgID } from "../../../../utils/utils.js";
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

let currentSuborgId = null;
let savedResolution = null;

/**
 * Restore the resolution properly with all UI updates
 */
function restoreResolution(resolution) {
  if (!resolution) return;

  store.emulatedWidth = resolution.width;
  store.emulatedHeight = resolution.height;

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

      console.log(
        `Restored resolution to ${resolution.width}x${resolution.height}`,
      );
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

  // Create modal HTML dynamically
  const modalId = "createSuborgTemplateModal";
  let modal = document.getElementById(modalId);

  if (!modal) {
    modal = document.createElement("div");
    modal.className = "modal fade";
    modal.id = modalId;
    modal.setAttribute("tabindex", "-1");
    modal.setAttribute("aria-labelledby", modalId + "Label");
    modal.setAttribute("aria-hidden", "true");
    document.body.appendChild(modal);
  }

  // Fetch global templates
  const globalTemplates = await fetchGlobalTemplates();
  // Variable to store chosen global template
  let chosenTemplate = null;

  if (globalTemplates.length === 0) {
    showToast(
      gettext("No global templates available to create from."),
      "Warning",
    );
    return;
  }

  // Build modal content
  modal.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-xl">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="${modalId}Label">${gettext("Create Template from Global Template")}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="row">
            <div class="col-md-5">
              <p>${gettext("Select a global template to create a copy for this suborganisation:")}</p>
              <div class="form-group mb-3">
                <label for="globalTemplateSelect">${gettext("Global Template")}</label>
                <select class="form-select" id="globalTemplateSelect">
                  <option value="">--${gettext("Select a template")}--</option>
                  ${globalTemplates.map((t) => `<option value="${t.id}">${t.name}</option>`).join("")}
                </select>
              </div>
              <div class="form-group mb-3">
                <label for="newTemplateName">${gettext("New Template Name")}</label>
                <input type="text" class="form-control" id="newTemplateName" placeholder="${gettext("Enter template name")}" />
                <small class="form-text text-muted">${gettext("Leave empty to use original name with '(Copy)' suffix")}</small>
              </div>
              <div id="templateInfo" class="mt-3"></div>
            </div>
            <div class="col-md-7">
              <h6>${gettext("Template Preview")}</h6>
              <div id="templatePreview" class="border rounded p-2" style="min-height: 400px; background-color: #f8f9fa; display: flex; align-items: center; justify-content: center;">
                <p class="text-muted">${gettext("Select a template to see preview")}</p>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${gettext("Cancel")}</button>
          <button type="button" class="btn btn-primary" id="createSuborgTemplateBtn">${gettext("Create Template")}</button>
        </div>
      </div>
    </div>
  `;

  // Show preview when template is selected
  const selectElement = modal.querySelector("#globalTemplateSelect");
  selectElement.addEventListener("change", (e) => {
    const templateId = e.target.value;
    const previewDiv = modal.querySelector("#templatePreview");
    const infoDiv = modal.querySelector("#templateInfo");

    if (templateId) {
      chosenTemplate = globalTemplates.find((t) => t.id == templateId);
      if (chosenTemplate && chosenTemplate.slideData) {
        // Show template info
        infoDiv.innerHTML = `
          <div class="card">
            <div class="card-body">
              <h6>${gettext("Template Details")}</h6>
              <p class="mb-1"><strong>${gettext("Name")}:</strong> ${chosenTemplate.name}</p>
              ${chosenTemplate.category ? `<p class="mb-1"><strong>${gettext("Category")}:</strong> ${chosenTemplate.category.name}</p>` : ""}
              ${chosenTemplate.tags && chosenTemplate.tags.length > 0 ? `<p class="mb-1"><strong>${gettext("Tags")}:</strong> ${chosenTemplate.tags.map((t) => t.name).join(", ")}</p>` : ""}
              ${chosenTemplate.aspect_ratio ? `<p class="mb-1"><strong>${gettext("Aspect Ratio")}:</strong> ${chosenTemplate.aspect_ratio}</p>` : ""}
            </div>
          </div>
        `;

        // Show visual preview
        previewDiv.innerHTML = "";
        previewDiv.style.backgroundColor = "#f8f9fa";

        const wrapper = document.createElement("div");
        wrapper.classList.add("template-preview-wrapper");
        wrapper.style.position = "relative";
        wrapper.style.width = "100%";
        wrapper.style.height = "400px";
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "center";
        wrapper.style.justifyContent = "center";

        previewDiv.appendChild(wrapper);

        const previewSlide = document.createElement("div");
        previewSlide.classList.add("preview-slide");
        previewSlide.id = "suborg-template-preview";
        previewSlide.style.transform = "";
        wrapper.appendChild(previewSlide);

        // Set the resolution based on the template's aspect ratio
        if (chosenTemplate.aspect_ratio) {
          setResolutionFromAspectRatio(chosenTemplate.aspect_ratio);
        }

        // Create a proper slide object with the template data
        const slideObject = {
          ...chosenTemplate.slideData,
          previewWidth: chosenTemplate.previewWidth || 1920,
          previewHeight: chosenTemplate.previewHeight || 1080,
        };

        // Load the slide content
        loadSlide(slideObject, "#suborg-template-preview", true);

        // Scale the content after a brief delay to ensure rendering
        setTimeout(() => {
          scaleSlide(wrapper);
        }, 100);
      }
    } else {
      previewDiv.innerHTML = `<p class="text-muted">${gettext("Select a template to see preview")}</p>`;
      infoDiv.innerHTML = "";
    }
  });

  // Handle create button
  const createBtn = modal.querySelector("#createSuborgTemplateBtn");
  createBtn.addEventListener("click", async () => {
    const selectedTemplateId = selectElement.value;
    const manualName = modal.querySelector("#newTemplateName").value.trim();
    const slideName = manualName
            ? manualName
            : chosenTemplate.name + gettext(" (Copy)");

    if (!selectedTemplateId) {
      showToast(gettext("Please select a global template."), "Warning");
      return;
    }

    try {
      createBtn.disabled = true;
      createBtn.textContent = gettext("Creating...");

      const newTemplate = await createSuborgTemplate(
        currentSuborgId,
        selectedTemplateId,
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

  // Handle modal close/cancel - restore original resolution
  modal.addEventListener("hidden.bs.modal", () => {
    if (savedResolution) {
      restoreResolution(savedResolution);
      savedResolution = null;
      console.log("Restored original resolution after modal cancel");
    }
  });

  // Show modal
  const bsModal = new bootstrap.Modal(modal);
  bsModal.show();
}
