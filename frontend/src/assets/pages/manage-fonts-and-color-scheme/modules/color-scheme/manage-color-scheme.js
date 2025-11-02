// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import * as bootstrap from "bootstrap";
import { gettext } from "../../../../utils/locales";
import { genericFetch, showToast, parentOrgID } from "../../../../utils/utils";
import { BASE_URL } from "../../../../utils/constants";

let colors = [];
let colorBeingEdited = null;
let deleteId = null;

// DOM elements
const adminRequiredMessage = document.getElementById(
  "admin-required-message-colors",
);
const loadingSpinner = document.getElementById("loading-spinner-colors");
const colorsTable = document.getElementById("colors-table");
const colorsTableBody = document.getElementById("colors-table-body");
const deleteModalEl = document.getElementById("deleteColorModal");
const deleteModal = new bootstrap.Modal(deleteModalEl);
const confirmDeleteBtn = document.getElementById("confirm-delete-color-btn");
const deleteNameEl = document.getElementById("delete-color-name");

// Modal elements
const colorModal = new bootstrap.Modal(document.getElementById("colorModal"));
const openModalBtn = document.getElementById("open-color-modal-btn");
const modalNameInput = document.getElementById("modal-color-name");
const modalHexInput = document.getElementById("modal-color-hex");
const modalColorPicker = document.getElementById("modal-color-picker");
const modalTypeSelect = document.getElementById("modal-color-type");
const modalEditIdInput = document.getElementById("modal-edit-color-id");
const modalSaveBtn = document.getElementById("modal-save-btn");

/**
 * Initialize color scheme management
 */
export default async function initializeManageColorScheme() {
  await loadColors();
  setupEventListeners();
}

/** Load colors from API */
async function loadColors() {
  show(loadingSpinner);
  hide(colorsTable);
  try {
    colors = await genericFetch(
      `${BASE_URL}/api/custom-colors/?organisation_id=${parentOrgID}`,
      "GET",
    );
    renderColors();
  } catch (err) {
    if (err.status === 403) {
      show(adminRequiredMessage);
    } else {
      showToast(
        gettext("Failed to load colors: ") + (err.detail || err.message),
        "Error",
      );
    }
  } finally {
    hide(loadingSpinner);
  }
}

/** Render colors table */
function renderColors() {
  colorsTableBody.innerHTML = "";
  if (!colors || colors.length === 0) {
    // nothing
    show(colorsTable);
    return;
  }
  colors.forEach((color) => {
    const row = document.createElement("tr");
    // Name
    const nameTd = document.createElement("td");
    nameTd.textContent = color.name;
    // Preview
    const previewTd = document.createElement("td");
    const previewDiv = document.createElement("div");
    previewDiv.className = "color-preview";
    previewDiv.style.backgroundColor = color.hexValue;
    previewTd.appendChild(previewDiv);
    // HEX value
    const hexTd = document.createElement("td");
    hexTd.textContent = color.hexValue;
    // Actions
    const actionsTd = document.createElement("td");
    actionsTd.className = "action-cell-td";
    // Edit
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-sm btn-outline-secondary-light me-2";
    editBtn.innerHTML =
      '<span class="material-symbols-outlined text-secondary-hover">edit</span>';
    editBtn.title = gettext("Edit");
    editBtn.addEventListener("click", () => openEditModal(color));
    // Delete
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-sm btn-outline-secondary-light";
    delBtn.innerHTML =
      '<span class="material-symbols-outlined text-secondary-hover">delete_forever</span>';
    delBtn.title = gettext("Delete");
    delBtn.addEventListener("click", () => showDeleteConfirmation(color));
    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(delBtn);
    // Type column
    const typeTd = document.createElement("td");
    typeTd.textContent = color.type;
    // Append
    row.appendChild(nameTd);
    row.appendChild(previewTd);
    row.appendChild(hexTd);
    row.appendChild(typeTd);
    row.appendChild(actionsTd);
    colorsTableBody.appendChild(row);
  });
  show(colorsTable);
}

/** Open add color modal */
function openAddModal() {
  modalEditIdInput.value = "";
  modalNameInput.value = "";
  modalHexInput.value = "#000000";
  modalColorPicker.value = "#000000";
  modalTypeSelect.value = "primary";
  document.getElementById("colorModalLabel").textContent = gettext("Add Color");
  modalSaveBtn.textContent = gettext("Save");
  colorBeingEdited = null;
  colorModal.show();
}

/** Open edit color modal */
function openEditModal(color) {
  colorBeingEdited = color;
  modalEditIdInput.value = color.id;
  modalNameInput.value = color.name;
  const hexValue = color.hexValue;
  modalHexInput.value = hexValue;
  modalColorPicker.value = hexValue;
  modalTypeSelect.value = color.type;
  document.getElementById("colorModalLabel").textContent =
    gettext("Edit Color");
  modalSaveBtn.textContent = gettext("Save");
  colorModal.show();
}

/** Handle modal save */
async function handleModalSave() {
  // Validate hex input before saving
  const hexValue = modalHexInput.value;
  if (!/^#[0-9A-Fa-f]{6}$/.test(hexValue)) {
    modalHexInput.setCustomValidity(
      gettext("Please enter a valid hex color (e.g., #FF5733)"),
    );
    modalHexInput.reportValidity();
    return;
  }

  const payload = {
    name: modalNameInput.value,
    hexValue: hexValue,
    type: modalTypeSelect.value,
  };

  if (!payload.name || !payload.hexValue || !payload.type) {
    showToast(gettext("Please fill in all required fields"), "Error");
    return;
  }

  try {
    let res;
    if (colorBeingEdited) {
      res = await genericFetch(
        `${BASE_URL}/api/custom-colors/${colorBeingEdited.id}/?organisation_id=${parentOrgID}`,
        "PATCH",
        payload,
      );
      colors = colors.map((c) => (c.id === res.id ? res : c));
      showToast(gettext("Color updated successfully"), "Success");
    } else {
      res = await genericFetch(
        `${BASE_URL}/api/custom-colors/?organisation_id=${parentOrgID}`,
        "POST",
        payload,
      );
      colors.push(res);
      showToast(gettext("Color added successfully"), "Success");
    }
    renderColors();
    colorModal.hide();
  } catch (err) {
    const errorMessage = err.message;
    if (errorMessage) {
      showToast(
        gettext("Failed to save color") + ": " + gettext(errorMessage),
        "Error",
      );
    } else {
      showToast(err.detail || gettext("Failed to save color"), "Error");
    }
  }
}

/** Show delete confirmation */
function showDeleteConfirmation(color) {
  deleteId = color.id;
  deleteNameEl.textContent = color.name;
  deleteModal.show();
}

/** Delete color */
async function deleteColor() {
  if (!deleteId) return;
  try {
    await genericFetch(
      `${BASE_URL}/api/custom-colors/${deleteId}/?organisation_id=${parentOrgID}`,
      "DELETE",
    );
    colors = colors.filter((c) => c.id !== deleteId);
    renderColors();
    showToast(gettext("Color deleted successfully"), "Success");
  } catch (err) {
    showToast(
      gettext("Failed to delete color: ") + (err.detail || err.message),
      "Error",
    );
  } finally {
    deleteId = null;
    deleteModal.hide();
  }
}

/** Utility show/hide */
function show(el) {
  if (el) el.classList.remove("d-none");
}
function hide(el) {
  if (el) el.classList.add("d-none");
}

/** Setup EventListeners */
function setupEventListeners() {
  openModalBtn.addEventListener("click", openAddModal);
  modalSaveBtn.addEventListener("click", handleModalSave);
  confirmDeleteBtn.addEventListener("click", deleteColor);

  // Synchronize color picker and hex input
  modalColorPicker.addEventListener("input", (e) => {
    modalHexInput.value = e.target.value.toUpperCase();
  });

  modalHexInput.addEventListener("input", (e) => {
    const hexValue = e.target.value;
    // Validate hex format
    if (/^#[0-9A-Fa-f]{6}$/.test(hexValue)) {
      modalColorPicker.value = hexValue;
      e.target.setCustomValidity(""); // Clear any validation errors
    } else if (hexValue === "") {
      e.target.setCustomValidity(""); // Allow empty for now, required will handle it
    } else {
      e.target.setCustomValidity(
        gettext("Please enter a valid hex color (e.g., #FF5733)"),
      );
    }
  });

  // Ensure hex input starts with # when user starts typing
  modalHexInput.addEventListener("keydown", (e) => {
    if (e.target.value === "" && e.key.match(/[0-9A-Fa-f]/)) {
      e.target.value = "#";
    }
  });
}
