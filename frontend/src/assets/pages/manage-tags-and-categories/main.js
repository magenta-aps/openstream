// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
import * as bootstrap from "bootstrap";
import {
  gettext,
  translateHTML,
  fetchUserLangugage,
} from "../../utils/locales";
import {
  validateToken,
  makeActiveInNav,
  updateNavbarBranchName,
  updateNavbarUsername,
  showToast,
  genericFetch,
  parentOrgID,
  initSignOutButton,
} from "../../utils/utils";
import { BASE_URL } from "../../utils/constants";

/**
 * Manage Tags and Categories Page
 * Allows administrators to create, edit, and delete tags and categories
 */

// DOM Elements - Categories
const categoryTableBody = document.getElementById("cateogry-table-body");
const categoriesLoading = document.getElementById("categories-loading");
const noCategoriesAlert = document.getElementById("no-categories-alert");
const addCategoryBtn = document.getElementById("add-category-btn");
// Category Modal
const categoryModal = new bootstrap.Modal(
  document.getElementById("category-modal"),
);
const categoryModalLabel = document.getElementById("categoryModalLabel");
const categoryIdInput = document.getElementById("category-id");
const categoryNameInput = document.getElementById("category-name");
const saveCategoryBtn = document.getElementById("save-category-btn");

// DOM Elements - Tags
const tagsTableBody = document.getElementById("tags-table-body");
const tagsLoading = document.getElementById("tags-loading");
const noTagsAlert = document.getElementById("no-tags-alert");
const addTagBtn = document.getElementById("add-tag-btn");
// Tags Modal
const tagModal = new bootstrap.Modal(document.getElementById("tag-modal"));
const tagModalLabel = document.getElementById("tagModalLabel");
const tagIdInput = document.getElementById("tag-id");
const tagNameInput = document.getElementById("tag-name");
const saveTagBtn = document.getElementById("save-tag-btn");

// DOM Elements - Confirm Delete Modal
const deleteConfirmModal = new bootstrap.Modal(
  document.getElementById("delete-confirm-modal"),
);
const deleteItemName = document.getElementById("delete-item-name");
const confirmDeleteBtn = document.getElementById("confirm-delete-btn");

// Data and State
let itemToDelete = null;
let deleteType = null; // "category" or "tag"

// Initialize the page
document.addEventListener("DOMContentLoaded", async () => {
  initSignOutButton();
  await fetchUserLangugage();
  translateHTML();

  makeActiveInNav("/manage-categories-and-tags");
  await validateToken();
  updateNavbarBranchName();
  updateNavbarUsername();
  // Fetch data
  await Promise.all([fetchCategories(), fetchTags()]);

  // Set up event listeners
  setupEventListeners();
});

// Fetch all categories from the API
async function fetchCategories() {
  try {
    // Check if organisation ID is available
    if (!parentOrgID) {
      showToast(
        gettext("Organization ID not found. Please refresh the page."),
        "Error",
      );
      return;
    }

    const categories = await genericFetch(
      `${BASE_URL}/api/categories/?organisation_id=${parentOrgID}`,
    );
    renderCategories(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    showToast(gettext("Failed to load categories"), "Error");
    categoriesLoading.classList.add("d-none");
    noCategoriesAlert.classList.remove("d-none");
  }
}

// Fetch all tags from the API
async function fetchTags() {
  try {
    // Check if organisation ID is available
    if (!parentOrgID) {
      showToast(
        gettext("Organization ID not found. Please refresh the page."),
        "Error",
      );
      return;
    }

    const tags = await genericFetch(
      `${BASE_URL}/api/tags/?organisation_id=${parentOrgID}`,
    );
    renderTags(tags);
  } catch (error) {
    console.error("Error fetching tags:", error);
    showToast(gettext("Failed to load tags"), "Error");
    tagsLoading.classList.add("d-none");
    noTagsAlert.classList.remove("d-none");
  }
}

// Setup all event listeners
function setupEventListeners() {
  // Category modal events
  addCategoryBtn.addEventListener("click", () => showAddCategoryModal());
  saveCategoryBtn.addEventListener("click", saveCategory);

  // Tag modal events
  addTagBtn.addEventListener("click", () => showAddTagModal());
  saveTagBtn.addEventListener("click", saveTag);

  // Delete confirmation
  confirmDeleteBtn.addEventListener("click", confirmDelete);
}

// Show the add category modal
function showAddCategoryModal() {
  categoryIdInput.value = "";
  categoryNameInput.value = "";
  categoryModalLabel.textContent = gettext("Add Category");
  categoryModal.show();
}

// Show the edit category modal
function showEditCategoryModal(category) {
  categoryIdInput.value = category.id;
  categoryNameInput.value = category.name;
  categoryModalLabel.textContent = gettext("Edit Category");
  categoryModal.show();
}

// Show the add tag modal
function showAddTagModal() {
  tagIdInput.value = "";
  tagNameInput.value = "";
  tagModalLabel.textContent = gettext("Add Tag");
  tagModal.show();
}

// Show the edit tag modal
function showEditTagModal(tag) {
  tagIdInput.value = tag.id;
  tagNameInput.value = tag.name;
  tagModalLabel.textContent = gettext("Edit Tag");
  tagModal.show();
}

// Save a category (create or update)
async function saveCategory() {
  const categoryId = categoryIdInput.value;
  const categoryName = categoryNameInput.value.trim();

  if (!categoryName) {
    showToast(gettext("Category name is required"), "Warning");
    return;
  }

  try {
    let savedCategory;
    if (categoryId) {
      // Update existing category
      savedCategory = await genericFetch(
        `${BASE_URL}/api/categories/${categoryId}/?organisation_id=${parentOrgID}`,
        "PATCH",
        JSON.stringify({ name: categoryName }),
      );
      showToast(gettext("Category updated successfully"), "Success");
    } else {
      // Create new category
      savedCategory = await genericFetch(
        `${BASE_URL}/api/categories/?organisation_id=${parentOrgID}`,
        "POST",
        JSON.stringify({ name: categoryName, organisation_id: parentOrgID }),
      );
      showToast(gettext("Category created successfully"), "Success");
    }

    // Update the list of categories
    await fetchCategories();
    categoryModal.hide();
  } catch (error) {
    console.error("Error saving category:", error);
    if (error.non_field_errors) {
      showToast(gettext(error.non_field_errors), "Error");
    } else {
    showToast(error.detail || gettext("Failed to save category"), "Error");
  }
}
}

// Save a tag (create or update)
async function saveTag() {
  const tagId = tagIdInput.value;
  const tagName = tagNameInput.value.trim();

  if (!tagName) {
    showToast(gettext("Tag name is required"), "Warning");
    return;
  }

  try {
    if (tagId) {
      await genericFetch(
        `${BASE_URL}/api/tags/${tagId}/?organisation_id=${parentOrgID}`,
        "PATCH",
        JSON.stringify({ name: tagName }),
      );
      showToast(gettext("Tag updated successfully"), "Success");
    } else {
      await genericFetch(
        `${BASE_URL}/api/tags/?organisation_id=${parentOrgID}`,
        "POST",
        JSON.stringify({ name: tagName, organisation_id: parentOrgID }),
      );
      showToast(gettext("Tag created successfully"), "Success");
    }
    await fetchTags();
    tagModal.hide();
  } catch (error) {
    console.error("Error saving tag:", error);
    showToast(error.detail || gettext("Failed to save tag"), "Error");
  }
}

// Show delete confirmation modal
function showDeleteConfirmation(item, type) {
  itemToDelete = item;
  deleteType = type;
  deleteItemName.textContent = `${item.name} (${gettext(type)})`;
  deleteConfirmModal.show();
}

// Handle delete confirmation
async function confirmDelete() {
  if (!itemToDelete || !deleteType) return;

  try {
    if (deleteType === "category") {
      await genericFetch(
        `${BASE_URL}/api/categories/${itemToDelete.id}/?organisation_id=${parentOrgID}`,
        "DELETE",
      );
      await fetchCategories();
      showToast(gettext("Category deleted successfully"), "Success");
    } else if (deleteType === "tag") {
      await genericFetch(
        `${BASE_URL}/api/tags/${itemToDelete.id}/?organisation_id=${parentOrgID}`,
        "DELETE",
      );
      await fetchTags();
      showToast(gettext("Tag deleted successfully"), "Success");
    }
    deleteConfirmModal.hide();
  } catch (error) {
    console.error(`Error deleting ${deleteType}:`, error);
    showToast(
      error.detail ||
        gettext(
          `This ${deleteType} cannot be deleted because it is being used`,
        ),
      "Error",
    );
  } finally {
    itemToDelete = null;
    deleteType = null;
  }
}

// Render categories to the DOM
function renderCategories(categories) {
  categoriesLoading.classList.add("d-none");

  // Clear the table
  categoryTableBody.innerHTML = "";

  if (!categories || categories.length === 0) {
    // Show no categories message
    noCategoriesAlert.classList.remove("d-none");
    return;
  }

  // Hide no categories message
  noCategoriesAlert.classList.add("d-none");

  categories.forEach((category) => {
    const row = document.createElement("tr");

    // Create category name cell
    const nameCell = document.createElement("td");
    nameCell.textContent = category.name;

    // Create actions cell
    const actionsCell = document.createElement("td");
    actionsCell.className = "action-cell-td";

    const editBtn = document.createElement("button");
    editBtn.className =
      "btn btn-sm btn-outline-secondary-light me-2 text-secondary";
    editBtn.innerHTML = `<span class="material-symbols-outlined text-secondary-hover">edit</span> ${gettext("Edit")}`;
    editBtn.title = gettext("Edit");
    editBtn.addEventListener("click", () => showEditCategoryModal(category));

    const deleteBtn = document.createElement("button");
    deleteBtn.className =
      "btn btn-sm btn-outline-secondary-light text-secondary";
    deleteBtn.innerHTML = `<span class="material-symbols-outlined text-secondary-hover">delete_forever</span> ${gettext("Delete")}`;
    deleteBtn.title = gettext("Delete");
    deleteBtn.addEventListener("click", () =>
      showDeleteConfirmation(category, "category"),
    );

    actionsCell.appendChild(editBtn);
    actionsCell.appendChild(deleteBtn);

    // Add cells to row
    row.appendChild(nameCell);
    row.appendChild(actionsCell);

    // Add row to table
    categoryTableBody.appendChild(row);
  });
}

// Render tags to the DOM
function renderTags(tags) {
  tagsLoading.classList.add("d-none");

  // Clear the table
  tagsTableBody.innerHTML = "";

  if (!tags || tags.length === 0) {
    // Show no tags message
    noTagsAlert.classList.remove("d-none");
    return;
  }

  // Hide no tags message
  noTagsAlert.classList.add("d-none");

  tags.forEach((tag) => {
    const row = document.createElement("tr");

    // Create tags name cell
    const nameCell = document.createElement("td");
    nameCell.textContent = tag.name;

    // Create actions cell
    const actionsCell = document.createElement("td");
    actionsCell.className = "action-cell-td";

    const editBtn = document.createElement("button");
    editBtn.className =
      "btn btn-sm btn-outline-secondary-light me-2 text-secondary";
    editBtn.innerHTML = `<span class="material-symbols-outlined text-secondary-hover">edit</span> ${gettext("Edit")}`;
    editBtn.title = gettext("Edit");
    editBtn.addEventListener("click", () => showEditTagModal(tag));

    const deleteBtn = document.createElement("button");
    deleteBtn.className =
      "btn btn-sm btn-outline-secondary-light text-secondary";
    deleteBtn.innerHTML = `<span class="material-symbols-outlined text-secondary-hover">delete_forever</span> ${gettext("Delete")}`;
    deleteBtn.title = gettext("Delete");
    deleteBtn.addEventListener("click", () =>
      showDeleteConfirmation(tag, "tag"),
    );

    actionsCell.appendChild(editBtn);
    actionsCell.appendChild(deleteBtn);

    // Add cells to row
    row.appendChild(nameCell);
    row.appendChild(actionsCell);

    // Add row to table
    tagsTableBody.appendChild(row);
  });
}
