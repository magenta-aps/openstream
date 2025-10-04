// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { showToast, token, parentOrgID } from "../../../../utils/utils.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";
import * as bootstrap from "bootstrap";
import { fetchAllSuborgTemplatesAndPopulateStore } from "../core/suborgTemplateDataManager.js";

let currentSuborgId = null;

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
      throw new Error(`Failed to load global templates. Status: ${resp.status}`);
    }

    return await resp.json();
  } catch (err) {
    console.error("Error fetching global templates:", err);
    showToast(gettext("Error loading global templates: ") + err.message, "Error");
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

  if (globalTemplates.length === 0) {
    showToast(gettext("No global templates available to create from."), "Warning");
    return;
  }

  // Build modal content
  modal.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="${modalId}Label">${gettext("Create Template from Global Template")}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <p>${gettext("Select a global template to create a copy for this suborganisation:")}</p>
          <div class="form-group mb-3">
            <label for="globalTemplateSelect">${gettext("Global Template")}</label>
            <select class="form-select" id="globalTemplateSelect">
              <option value="">${gettext("-- Select a template --")}</option>
              ${globalTemplates.map(t => `<option value="${t.id}">${t.name}</option>`).join("")}
            </select>
          </div>
          <div class="form-group mb-3">
            <label for="newTemplateName">${gettext("New Template Name")}</label>
            <input type="text" class="form-control" id="newTemplateName" placeholder="${gettext("Enter template name")}" />
            <small class="form-text text-muted">${gettext("Leave empty to use original name with '(Copy)' suffix")}</small>
          </div>
          <div id="templatePreview" class="mt-3"></div>
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
    if (templateId) {
      const template = globalTemplates.find(t => t.id == templateId);
      if (template) {
        const previewDiv = modal.querySelector("#templatePreview");
        previewDiv.innerHTML = `
          <div class="card">
            <div class="card-body">
              <h6>${gettext("Template Preview")}</h6>
              <p><strong>${gettext("Name")}:</strong> ${template.name}</p>
              ${template.category ? `<p><strong>${gettext("Category")}:</strong> ${template.category.name}</p>` : ""}
              ${template.tags && template.tags.length > 0 ? `<p><strong>${gettext("Tags")}:</strong> ${template.tags.map(t => t.name).join(", ")}</p>` : ""}
              ${template.accepted_aspect_ratios && template.accepted_aspect_ratios.length > 0 ? `<p><strong>${gettext("Aspect Ratios")}:</strong> ${template.accepted_aspect_ratios.join(", ")}</p>` : ""}
            </div>
          </div>
        `;
      }
    }
  });

  // Handle create button
  const createBtn = modal.querySelector("#createSuborgTemplateBtn");
  createBtn.addEventListener("click", async () => {
    const selectedTemplateId = selectElement.value;
    const newName = modal.querySelector("#newTemplateName").value.trim();

    if (!selectedTemplateId) {
      showToast(gettext("Please select a template."), "Warning");
      return;
    }

    try {
      createBtn.disabled = true;
      createBtn.textContent = gettext("Creating...");

      await createSuborgTemplate(currentSuborgId, selectedTemplateId, newName || null);
      
      showToast(gettext("Template created successfully!"), "Success");
      
      // Close modal
      const bsModal = bootstrap.Modal.getInstance(modal);
      if (bsModal) {
        bsModal.hide();
      }

      // Refresh template list
      await fetchAllSuborgTemplatesAndPopulateStore(currentSuborgId);
    } catch (err) {
      showToast(gettext("Error creating template: ") + err.message, "Error");
      createBtn.disabled = false;
      createBtn.textContent = gettext("Create Template");
    }
  });

  // Show modal
  const bsModal = new bootstrap.Modal(modal);
  bsModal.show();
}
