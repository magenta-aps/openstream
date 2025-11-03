// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import * as bootstrap from "bootstrap";
import Sortable from "sortablejs";
import { gettext } from "../../../../utils/locales";
import {
  genericFetch,
  showToast,
  parentOrgID,
  isUserOrgAdminForOrganisation,
} from "../../../../utils/utils";
import { BASE_URL } from "../../../../utils/constants";

let colors = [];
let colorBeingEdited = null;
let deleteId = null;
let canManageColors = false;
let colorsSortable = null;

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
  canManageColors = await isUserOrgAdminForOrganisation(parentOrgID);
  toggleAdminUI();
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

function toggleAdminUI() {
  if (openModalBtn) {
    openModalBtn.classList.toggle("d-none", !canManageColors);
    openModalBtn.disabled = !canManageColors;
  }
  if (adminRequiredMessage && canManageColors) {
    adminRequiredMessage.classList.add("d-none");
  }
}

function sortColorsInPlace() {
  colors.sort((a, b) => {
    const posA =
      typeof a.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
    const posB =
      typeof b.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
    if (posA !== posB) return posA - posB;
    return a.name.localeCompare(b.name);
  });
}

function destroyColorSortable() {
  if (colorsSortable) {
    colorsSortable.destroy();
    colorsSortable = null;
  }
}

function initColorSortable() {
  destroyColorSortable();
  if (!canManageColors || !colorsTableBody || colors.length < 2) {
    return;
  }

  colorsSortable = new Sortable(colorsTableBody, {
    animation: 150,
    handle: ".drag-handle",
    onEnd: handleColorReorder,
  });
}

/** Render colors table */
function renderColors() {
  destroyColorSortable();
  colorsTableBody.innerHTML = "";
  if (!colors || colors.length === 0) {
    show(colorsTable);
    return;
  }

  sortColorsInPlace();
  colors.forEach((color) => {
    const row = document.createElement("tr");
    row.dataset.id = color.id;
    if (typeof color.position === "number") {
      row.dataset.position = String(color.position);
    }

    const dragTd = document.createElement("td");
    dragTd.className = "drag-cell";
    const dragIcon = document.createElement("span");
    dragIcon.textContent = "drag_indicator";
    dragIcon.className = "material-symbols-outlined drag-icon";
    if (canManageColors) {
      dragIcon.classList.add("drag-handle");
      dragTd.title = gettext("Drag to reorder");
    } else {
      dragTd.classList.add("drag-cell-disabled");
    }
    dragTd.appendChild(dragIcon);

    const nameTd = document.createElement("td");
    nameTd.textContent = color.name;

    const previewTd = document.createElement("td");
    const previewDiv = document.createElement("div");
    previewDiv.className = "color-preview";
    previewDiv.style.backgroundColor = color.hexValue;
    previewTd.appendChild(previewDiv);

    const hexTd = document.createElement("td");
    hexTd.textContent = color.hexValue;

    const typeTd = document.createElement("td");
    typeTd.textContent = color.type;

    const actionsTd = document.createElement("td");
    actionsTd.className = "action-cell-td";
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-sm btn-outline-secondary-light me-2";
    editBtn.innerHTML =
      '<span class="material-symbols-outlined text-secondary-hover">edit</span>';
    editBtn.title = gettext("Edit");
    editBtn.addEventListener("click", () => openEditModal(color));
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-sm btn-outline-secondary-light";
    delBtn.innerHTML =
      '<span class="material-symbols-outlined text-secondary-hover">delete_forever</span>';
    delBtn.title = gettext("Delete");
    delBtn.addEventListener("click", () => showDeleteConfirmation(color));
    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(delBtn);

    row.appendChild(dragTd);
    row.appendChild(nameTd);
    row.appendChild(previewTd);
    row.appendChild(hexTd);
    row.appendChild(typeTd);
    row.appendChild(actionsTd);
    colorsTableBody.appendChild(row);
  });

  show(colorsTable);
  initColorSortable();
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
    sortColorsInPlace();
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
    sortColorsInPlace();
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
  if (openModalBtn) {
    openModalBtn.addEventListener("click", openAddModal);
  }
  modalSaveBtn.addEventListener("click", handleModalSave);
  confirmDeleteBtn.addEventListener("click", deleteColor);

  modalColorPicker.addEventListener("input", (e) => {
    modalHexInput.value = e.target.value.toUpperCase();
  });

  modalHexInput.addEventListener("input", (e) => {
    const hexValue = e.target.value;
    if (/^#[0-9A-Fa-f]{6}$/.test(hexValue)) {
      modalColorPicker.value = hexValue;
      e.target.setCustomValidity("");
    } else if (hexValue === "") {
      e.target.setCustomValidity("");
    } else {
      e.target.setCustomValidity(
        gettext("Please enter a valid hex color (e.g., #FF5733)"),
      );
    }
  });

  modalHexInput.addEventListener("keydown", (e) => {
    if (e.target.value === "" && e.key.match(/[0-9A-Fa-f]/)) {
      e.target.value = "#";
    }
  });
}

async function handleColorReorder() {
  if (!canManageColors) {
    return;
  }

  const rows = Array.from(colorsTableBody.querySelectorAll("tr"));
  const updates = rows.map((row, index) => ({
    id: row.dataset.id,
    position: index + 1,
  }));

  try {
    await Promise.all(
      updates.map(({ id, position }) =>
        genericFetch(
          `${BASE_URL}/api/custom-colors/${id}/?organisation_id=${parentOrgID}`,
          "PATCH",
          { position },
        ),
      ),
    );

    const colorsById = new Map(
      colors.map((color) => [String(color.id), { ...color }]),
    );
    colors = updates
      .map(({ id, position }) => {
        const color = colorsById.get(String(id));
        if (!color) return null;
        color.position = position;
        return color;
      })
      .filter(Boolean);

    renderColors();
    showToast(gettext("Color order updated"), "Success");
  } catch (err) {
    const detail = err?.detail || err?.message || "";
    showToast(
      `${gettext("Failed to update color order.")}${detail ? ` ${detail}` : ""}`,
      "Error",
    );
    await loadColors();
  }
}
