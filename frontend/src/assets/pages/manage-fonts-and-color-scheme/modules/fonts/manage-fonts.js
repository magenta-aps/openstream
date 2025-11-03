// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import {
  showToast,
  genericFetch,
  parentOrgID,
  isUserOrgAdminForOrganisation,
} from "../../../../utils/utils";
import * as bootstrap from "bootstrap";
import Sortable from "sortablejs";
import { BASE_URL } from "../../../../utils/constants";
import { gettext } from "../../../../utils/locales";
import {
  fetchTextFormattingSettings,
  getTextFormattingSettings,
  updateTextFormattingSettings,
  TEXT_FORMATTING_FEATURES,
} from "../../../../utils/textFormattingSettings.js";

// Global variables
let isAdmin = false;
let fonts = [];
let deleteId = null;
let fontsSortable = null;
let textFormattingSettings = getTextFormattingSettings();

// DOM elements
const fontsTableBody = document.getElementById("fonts-table-body");
const noFontsMessage = document.getElementById("no-fonts-message");
const loadingSpinner = document.getElementById("loading-spinner-fonts");
const adminRequiredMessage = document.getElementById(
  "admin-required-message-fonts",
);

// Add Font Modal elements
const addFontModalBtn = document.getElementById("add-font-modal-btn");
const addFontModal = new bootstrap.Modal(
  document.getElementById("addFontModal"),
);
const addFontForm = document.getElementById("add-font-form");
const addFontNameInput = document.getElementById("add-font-name");
const confirmAddFontBtn = document.getElementById("confirm-add-font-btn");
const addFontFileInput = document.getElementById("add-font-file");

// Edit Font Modal elements
const editFontModal = new bootstrap.Modal(
  document.getElementById("editFontModal"),
);
const editFontForm = document.getElementById("edit-font-form");
const editFontIdInput = document.getElementById("edit-font-id");
const editFontNameInput = document.getElementById("edit-font-name");
const editFontUrlInput = document.getElementById("edit-font-url");
const editFontFileInput = document.getElementById("edit-font-file");
const confirmEditFontBtn = document.getElementById("confirm-edit-font-btn");

// Delete Modal elements
const confirmDeleteBtn = document.getElementById("confirm-delete-font-btn");
const deleteFontNameEl = document.getElementById("delete-font-name");
const deleteModal = new bootstrap.Modal(
  document.getElementById("deleteFontModal"),
);

// Text formatting option elements
const textOptionsCard = document.getElementById("text-options-card");
const textOptionsLoading = document.getElementById("text-options-loading");
const textOptionsForm = document.getElementById("text-options-form");
const textOptionsAdminMessage = document.getElementById(
  "admin-required-message-text-options",
);
const textOptionInputs = {
  [TEXT_FORMATTING_FEATURES.BOLD]:
    document.getElementById("tiptap-option-bold"),
  [TEXT_FORMATTING_FEATURES.ITALIC]: document.getElementById(
    "tiptap-option-italic",
  ),
  [TEXT_FORMATTING_FEATURES.UNDERLINE]: document.getElementById(
    "tiptap-option-underline",
  ),
  [TEXT_FORMATTING_FEATURES.FONT_WEIGHT]: document.getElementById(
    "tiptap-option-font-weight",
  ),
};

/**
 * Initialize fonts management
 */
export default async function initializeManageFonts() {
  await loadFonts();
  await loadTextFormattingOptions();
  setupEventListeners();
}

/**
 * Load fonts from the API
 */
async function loadFonts() {
  try {
    loadingSpinner.classList.remove("d-none");

    // Check if organisation ID is available
    if (!parentOrgID) {
      showToast(
        gettext("Organization ID not found. Please refresh the page."),
        "Error",
      );
      return;
    }

    isAdmin = await isUserOrgAdminForOrganisation(parentOrgID);
    toggleFontAdminUI();

    // Fetch fonts from the API with organisation_id parameter
    fonts = await genericFetch(
      `${BASE_URL}/api/fonts/?organisation_id=${parentOrgID}`,
      "GET",
    );

    sortFontsInPlace();
    // Update UI
    renderFonts();
  } catch (error) {
    console.error("Error loading fonts:", error);
    showToast(gettext("Failed to load fonts: ") + error.message, "Error");
  } finally {
    loadingSpinner.classList.add("d-none");
  }
}

function toggleFontAdminUI() {
  if (addFontModalBtn) {
    addFontModalBtn.style.display = isAdmin ? "inline-block" : "none";
    addFontModalBtn.disabled = !isAdmin;
  }
  if (adminRequiredMessage) {
    adminRequiredMessage.classList.toggle("d-none", isAdmin);
  }
}

function sortFontsInPlace() {
  fonts.sort((a, b) => {
    const posA =
      typeof a.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
    const posB =
      typeof b.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
    if (posA !== posB) return posA - posB;
    return a.name.localeCompare(b.name);
  });
}

function destroyFontsSortable() {
  if (fontsSortable) {
    fontsSortable.destroy();
    fontsSortable = null;
  }
}

function initFontsSortable() {
  destroyFontsSortable();
  if (!isAdmin || !fontsTableBody || fonts.length < 2) {
    return;
  }

  fontsSortable = new Sortable(fontsTableBody, {
    animation: 150,
    handle: ".drag-handle",
    onEnd: handleFontsReorder,
  });
}

async function handleFontsReorder() {
  if (!isAdmin) {
    return;
  }

  const rows = Array.from(fontsTableBody.querySelectorAll("tr"));
  const updates = rows.map((row, index) => ({
    id: row.dataset.id,
    position: index + 1,
  }));

  try {
    await Promise.all(
      updates.map(({ id, position }) =>
        genericFetch(
          `${BASE_URL}/api/fonts/${id}/?organisation_id=${parentOrgID}`,
          "PATCH",
          { position },
        ),
      ),
    );

    const fontsById = new Map(
      fonts.map((font) => [String(font.id), { ...font }]),
    );
    fonts = updates
      .map(({ id, position }) => {
        const font = fontsById.get(String(id));
        if (!font) return null;
        font.position = position;
        return font;
      })
      .filter(Boolean);

    sortFontsInPlace();
    renderFonts();
    showToast(gettext("Font order updated"), "Success");
  } catch (error) {
    const detail = error?.detail || error?.message || "";
    showToast(
      `${gettext("Failed to update font order.")}${detail ? ` ${detail}` : ""}`,
      "Error",
    );
    await loadFonts();
  }
}

/**
 * Render fonts in the table
 */
function renderFonts() {
  destroyFontsSortable();
  fontsTableBody.innerHTML = "";

  if (!fonts || fonts.length === 0) {
    noFontsMessage.classList.remove("d-none");
    return;
  }

  noFontsMessage.classList.add("d-none");
  sortFontsInPlace();

  fonts.forEach((font) => {
    const row = document.createElement("tr");
    row.dataset.id = font.id;
    if (typeof font.position === "number") {
      row.dataset.position = String(font.position);
    }

    const dragCell = document.createElement("td");
    dragCell.className = "drag-cell";
    const dragIcon = document.createElement("span");
    dragIcon.className = "material-symbols-outlined drag-icon";
    dragIcon.textContent = "drag_indicator";
    if (isAdmin) {
      dragIcon.classList.add("drag-handle");
      dragCell.title = gettext("Drag to reorder");
    } else {
      dragCell.classList.add("drag-cell-disabled");
    }
    dragCell.appendChild(dragIcon);

    const nameCell = document.createElement("td");
    nameCell.textContent = font.name;

    const previewCell = document.createElement("td");
    const exampleText = document.createElement("span");
    exampleText.textContent = gettext(
      "The quick brown fox jumps over the lazy dog",
    );
    exampleText.className = "font-preview-text";

    const style = document.createElement("style");
    style.textContent = `
        @font-face {
          font-family: 'CustomFont-${font.id}';
          src: url('${font.font_url}');
        }

        .font-preview-${font.id} {
          font-family: 'CustomFont-${font.id}', sans-serif;
          font-size: 14px;
        }
      `;
    document.head.appendChild(style);

    exampleText.classList.add(`font-preview-${font.id}`);
    previewCell.appendChild(exampleText);

    const actionsCell = document.createElement("td");
    actionsCell.className = "action-cell-td";
    if (isAdmin) {
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-sm btn-outline-secondary-light me-2";
      editBtn.innerHTML =
        '<span class="material-symbols-outlined text-secondary-hover">edit</span>';
      editBtn.title = gettext("Edit");
      editBtn.addEventListener("click", () => openEditModal(font));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-sm btn-outline-secondary-light";
      deleteBtn.innerHTML =
        '<span class="material-symbols-outlined text-secondary-hover">delete_forever</span>';
      deleteBtn.title = gettext("Delete");
      deleteBtn.addEventListener("click", () => showDeleteConfirmation(font));

      actionsCell.appendChild(editBtn);
      actionsCell.appendChild(deleteBtn);
    } else {
      actionsCell.textContent = gettext("View only");
    }

    row.appendChild(dragCell);
    row.appendChild(nameCell);
    row.appendChild(previewCell);
    row.appendChild(actionsCell);

    fontsTableBody.appendChild(row);
  });

  initFontsSortable();
}

function renderTextFormattingOptions() {
  Object.entries(textOptionInputs).forEach(([featureKey, input]) => {
    if (!input) return;
    const isEnabled = !!textFormattingSettings[featureKey];
    input.checked = isEnabled;
    input.disabled = !isAdmin;
  });

  if (textOptionsForm) {
    if (isAdmin) {
      textOptionsForm.classList.remove("disabled");
    } else {
      textOptionsForm.classList.add("disabled");
    }
  }

  if (textOptionsAdminMessage) {
    textOptionsAdminMessage.classList.toggle("d-none", isAdmin);
  }
}

async function loadTextFormattingOptions() {
  if (!textOptionsCard) {
    return;
  }

  if (textOptionsLoading) {
    textOptionsLoading.classList.remove("d-none");
  }
  if (textOptionsForm) {
    textOptionsForm.classList.add("d-none");
  }

  renderTextFormattingOptions();

  try {
    textFormattingSettings = await fetchTextFormattingSettings({
      silent: false,
    });
  } catch (error) {
    console.error("Error loading text formatting options:", error);
    const detail = error?.detail || error?.message || "";
    const detailText = detail ? ` ${detail}` : "";
    showToast(
      `${gettext("Failed to load toolbar options.")}${detailText}`,
      "Error",
    );
    textFormattingSettings = getTextFormattingSettings();
  } finally {
    renderTextFormattingOptions();
    if (textOptionsLoading) {
      textOptionsLoading.classList.add("d-none");
    }
    if (textOptionsForm) {
      textOptionsForm.classList.remove("d-none");
    }
  }
}

async function handleTextOptionToggle(featureKey, isEnabled) {
  const input = textOptionInputs[featureKey];
  if (!input) {
    return;
  }

  if (!isAdmin) {
    input.checked = !!textFormattingSettings[featureKey];
    showToast(
      gettext("You must be an organization admin to modify toolbar options."),
      "Error",
    );
    return;
  }

  const previousValue = !!textFormattingSettings[featureKey];
  if (previousValue === isEnabled) {
    return;
  }

  input.disabled = true;

  try {
    textFormattingSettings = await updateTextFormattingSettings({
      [featureKey]: isEnabled,
    });
    renderTextFormattingOptions();
    showToast(gettext("Toolbar option updated"), "Success");
  } catch (error) {
    console.error("Error updating toolbar option:", error);
    const detail = error?.detail || error?.message || "";
    input.checked = previousValue;
    textFormattingSettings = {
      ...textFormattingSettings,
      [featureKey]: previousValue,
    };
    renderTextFormattingOptions();
    const detailText = detail ? ` ${detail}` : "";
    showToast(
      `${gettext("Failed to update toolbar option.")}${detailText}`,
      "Error",
    );
  } finally {
    if (isAdmin) {
      input.disabled = false;
    }
  }
}

/**
 * Open the add font modal
 */
function openAddModal() {
  if (!isAdmin) {
    showToast(
      gettext("You must be an organization admin to add fonts"),
      "Error",
    );
    return;
  }

  // Reset form
  addFontForm.reset();

  // Show modal
  addFontModal.show();
}

/**
 * Open the edit font modal
 */
function openEditModal(font) {
  if (!isAdmin) {
    showToast(
      gettext("You must be an organization admin to edit fonts"),
      "Error",
    );
    return;
  }

  // Populate form fields
  editFontIdInput.value = font.id;
  editFontNameInput.value = font.name;
  // If the edit URL input exists (older UI) populate it; otherwise populate a readonly display
  if (editFontUrlInput) {
    editFontUrlInput.value = font.font_url;
    const curContainer = document.getElementById(
      "edit-font-current-url-container",
    );
    if (curContainer) curContainer.style.display = "none";
  } else {
    const curUrlEl = document.getElementById("edit-font-current-url");
    if (curUrlEl) {
      if (font.font_url) {
        curUrlEl.innerHTML = `<a href="${font.font_url}" target="_blank" rel="noopener noreferrer">${font.font_url}</a>`;
      } else {
        curUrlEl.textContent = gettext("No URL stored");
      }
    }
  }
  // Clear any previous file selection
  if (editFontFileInput) editFontFileInput.value = "";

  // Show modal
  editFontModal.show();
}

/**
 * Show delete confirmation modal
 */
function showDeleteConfirmation(font) {
  deleteId = font.id;
  deleteFontNameEl.textContent = font.name;
  deleteModal.show();
}

/**
 * Add a new font
 */
async function addFont() {
  if (!isAdmin) {
    showToast(
      gettext("You must be an organization admin to add fonts"),
      "Error",
    );
    return;
  }

  // Get form data
  const name = addFontNameInput.value.trim();
  const file = addFontFileInput ? addFontFileInput.files[0] : null;

  if (!name || !file) {
    showToast(gettext("Please fill in all required fields"), "Error");
    return;
  }

  try {
    // Prepare body: use FormData if file present
    let body;
    let headers = undefined; // let genericFetch set Content-Type unless FormData
    body = new FormData();
    body.append("name", name);
    body.append("file", file);

    const response = await genericFetch(
      `${BASE_URL}/api/fonts/?organisation_id=${parentOrgID}`,
      "POST",
      body,
      headers,
    );

    // Add to local array
    fonts.push(response);

    // Update UI
    renderFonts();

    // Show success message
    showToast(gettext("Font added successfully"), "Success");

    // Close modal
    addFontModal.hide();
  } catch (error) {
    console.error("Error adding font:", error);
    const errorMessage = error.message;
    if (errorMessage) {
      showToast(
        gettext("Failed to add font") + ": " + gettext(errorMessage),
        "Error",
      );
    } else {
      showToast(error.detail || gettext("Failed to add font"), "Error");
    }
  }
}

/**
 * Update an existing font
 */
async function updateFont() {
  if (!isAdmin) {
    showToast(
      gettext("You must be an organization admin to edit fonts"),
      "Error",
    );
    return;
  }

  const fontId = editFontIdInput.value;

  // Get form data
  const formData = {
    name: editFontNameInput.value.trim(),
    font_url: editFontUrlInput ? editFontUrlInput.value.trim() : "",
  };

  // Validate form data
  if (!formData.name) {
    showToast(gettext("Please fill in all required fields"), "Error");
    return;
  }

  try {
    // If a new file is selected, use FormData and send file
    const newFile = editFontFileInput ? editFontFileInput.files[0] : null;
    let body;
    let headers = undefined;
    if (newFile) {
      body = new FormData();
      body.append("name", formData.name);
      body.append("file", newFile);
    } else {
      body = { name: formData.name };
    }

    const response = await genericFetch(
      `${BASE_URL}/api/fonts/${fontId}/?organisation_id=${parentOrgID}`,
      "PATCH",
      body,
      headers,
    );

    // Update in local array
    const index = fonts.findIndex((f) => f.id == fontId);
    if (index !== -1) {
      fonts[index] = response;
    }

    // Update UI
    renderFonts();

    // Show success message
    showToast(gettext("Font updated successfully"), "Success");

    // Close modal
    editFontModal.hide();
  } catch (error) {
    console.error("Error updating font:", error);
    const errorMessage = error.message;
    if (errorMessage) {
      showToast(
        gettext("Failed to update font") + ": " + gettext(errorMessage),
        "Error",
      );
    } else {
      showToast(error.detail || gettext("Failed to update font"), "Error");
    }
  }
}

/**
 * Delete a font
 */
async function deleteFont() {
  if (!deleteId) return;

  try {
    await genericFetch(
      `${BASE_URL}/api/fonts/${deleteId}/?organisation_id=${parentOrgID}`,
      "DELETE",
    );

    // Remove from local array
    fonts = fonts.filter((font) => font.id !== deleteId);

    // Update UI
    renderFonts();

    // Show success message
    showToast(gettext("Font deleted successfully"), "Success");

    // Close modal
    deleteModal.hide();
  } catch (error) {
    console.error("Error deleting font:", error);
    showToast(gettext("Failed to delete font: ") + error.message, "Error");
  } finally {
    deleteId = null;
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Add font modal button
  if (addFontModalBtn) {
    addFontModalBtn.addEventListener("click", openAddModal);
  }

  // Add font form submission
  addFontForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addFont();
  });

  // Confirm add font button
  confirmAddFontBtn.addEventListener("click", addFont);

  // Edit font form submission
  editFontForm.addEventListener("submit", (e) => {
    e.preventDefault();
    updateFont();
  });

  // Confirm edit font button
  confirmEditFontBtn.addEventListener("click", updateFont);

  // Confirm delete button
  confirmDeleteBtn.addEventListener("click", deleteFont);

  Object.entries(textOptionInputs).forEach(([featureKey, input]) => {
    if (!input) return;
    input.addEventListener("change", (event) => {
      handleTextOptionToggle(featureKey, event.target.checked);
    });
  });
}
