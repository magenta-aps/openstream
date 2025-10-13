// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
import { fetchUserLangugage, translateHTML } from "../../utils/locales";
import {
  validateToken,
  makeActiveInNav,
  updateNavbarBranchName,
  updateNavbarUsername,
  showToast,
  genericFetch,
  parentOrgID,
  selectedBranchID,
  addDebounceEventListenerToElements,
  addTagToDisplay,
  createCheckboxDropdown,
  createPageSelector,
  debounce,
  getSelectedExtensions,
  initSignOutButton,
} from "../../utils/utils";
import * as bootstrap from "bootstrap";
import { BASE_URL } from "../../utils/constants";
import { gettext } from "../../utils/locales";

// On page load
document.addEventListener("DOMContentLoaded", async function () {
  await fetchUserLangugage();
  translateHTML();
  makeActiveInNav("/manage-media-files");
  await validateToken();
  updateNavbarBranchName();
  updateNavbarUsername();
  await initPage();
  initSignOutButton();
});

// Global variables
let currentPage = 1;
let categories = [];
let tags = [];
let associatedBranches = [];
let globalBranchId = null;
let currentlyEditingMedia = null;
const currentMediaTags = new Set();

// Constants
const videoExtensionsList = ["mp4", "webm", "gif"];
const validExtensions = [
  { value: "PNG" },
  { value: "JPEG" },
  { value: "SVG" },
  { value: "PDF" },
  { value: "MP4" },
  { value: "GIF" },
  { value: "WebP" },
  { value: "WebM" },
];

// Elements
const submitMediaModalEl = document.getElementById("submitMediaModal");
const previewMediaModalEl = document.getElementById("previewMediaModal");
const previewContainer = document.querySelector("#preview-media-container");
const tagsContainer = document.querySelector("#mediaEditTagsContainer");
const submitMediaForm = document.querySelector("#submitMediaForm");
const deleteMediaBtn = document.querySelector("#btnDeleteMedia");
const deleteMediaPreviewBtn = document.querySelector("#btnDeleteMediaPreview");
const editMediaPreviewBtn = document.querySelector("#btnEditMediaPreview");
const fileInput = document.querySelector("#mediaFileInput");
const titleInput = document.querySelector("#titleSearchInput");
const mediaCategoryEl = document.querySelector("#media-category-wrapper");
const extensionSelectEl = document.querySelector("#extension-select-wrapper");
const mediaTagsWrapperEl = document.querySelector("#media-tags-wrapper");
const mediaEditTagsSelectEl = document.querySelector("#mediaEditTagsSelect");
const mediaGrid = document.getElementById("mediaGrid");
const pageSizeEl = document.querySelector("#resultsPerPageDropdown");

// Initialize Bootstrap components
const bsSubmitModal = bootstrap.Modal.getOrCreateInstance(submitMediaModalEl);
const bsPreviewModal = bootstrap.Modal.getOrCreateInstance(previewMediaModalEl);

// Debounced filtering function
const updateFilteringDebounce = debounce(() => loadMediaFiles(1));

async function initPage() {
  // Initialize components
  await refreshCategories();
  await refreshTags(); // Fetch tags
  createExtensionSelect();
  createCheckboxDropdown(
    mediaCategoryEl,
    gettext("Categories"),
    categories,
    false,
  );
  // Add event listeners for category filter checkboxes
  addDebounceEventListenerToElements(
    mediaCategoryEl.querySelectorAll("input"), // Assuming only relevant inputs are checkboxes
    updateFilteringDebounce,
  );
  createTagsCheckboxDropdown(); // Create tags dropdown
  createMediaEditTagsDropdown(); // Create media edit tags dropdown

  try {
    associatedBranches = await genericFetch(
      `${BASE_URL}/api/branches/?branch_id=${selectedBranchID}`,
    );

    // Find the global branch ID
    const globalBranch = associatedBranches.find(
      (b) => b.name.toLowerCase() === "global",
    );
    if (globalBranch) {
      globalBranchId = globalBranch.id;
    }

    // We don't need to display the branch selector anymore
    // await createUploadedBySelect();
  } catch (error) {
    console.error("Error fetching organisation branches:", error);
    showToast(gettext("Error fetching branches."), "error");
    associatedBranches = [];
  }

  initEventListeners();
  // Calculate how many media items fit in the current viewport and set the
  // page size automatically so pagination matches the visible grid.
  calculateAndSetPageSize();
  loadMediaFiles(1);
}

/**
 * Calculate how many `.media-box` items will fit inside the `mediaGrid`
 * and set the page size dropdown accordingly. Adds an "auto-fit" option
 * to the dropdown when the computed size is not one of the existing
 * options.
 */
function calculateAndSetPageSize() {
  if (!mediaGrid || !pageSizeEl) return;

  // Create a temporary element to measure real rendered size (including padding/border)
  const temp = document.createElement("div");
  temp.className = "media-box";
  temp.style.visibility = "hidden";
  document.body.appendChild(temp);

  // Use computed styles to include margins
  const tempRect = temp.getBoundingClientRect();
  const cs = window.getComputedStyle(temp);
  const marginRight = parseFloat(cs.marginRight) || 0;
  const marginBottom = parseFloat(cs.marginBottom) || 0;
  const itemWidth = Math.ceil(tempRect.width + marginRight);
  const itemHeight = Math.ceil(tempRect.height + marginBottom);

  document.body.removeChild(temp);

  // Determine container available width/height
  let containerWidth = mediaGrid.clientWidth - 48;
  let containerHeight = mediaGrid.clientHeight - 48;

  // If mediaGrid has no height yet (not visible), fall back to viewport calculations
  if (!containerHeight) {
    const gridTop = mediaGrid.getBoundingClientRect().top;
    const paginationEl = document.querySelector("#media-pagination-wrapper");
    const paginationHeight = paginationEl ? paginationEl.offsetHeight : 0;
    containerHeight = Math.max(
      window.innerHeight - gridTop - paginationHeight - 48,
    ); // small padding
  }

  // Ensure at least 1 column/row
  const cols = Math.max(1, Math.floor(containerWidth / Math.max(1, itemWidth)));
  const rows = Math.max(
    1,
    Math.floor(containerHeight / Math.max(1, itemHeight)),
  );
  const computedPageSize = cols * rows;

  // Cap the page size to a reasonable number (prevents insane values)
  const pageSize = Math.min(Math.max(computedPageSize, 1), 200);

  // If the dropdown already has an option with this value, select it.
  const existingOption = pageSizeEl.querySelector(
    `option[value="${pageSize}"]`,
  );
  // Remove any previous auto option we created
  const prevAuto = pageSizeEl.querySelector("#autoPageSizeOption");
  if (prevAuto) prevAuto.remove();

  if (existingOption) {
    pageSizeEl.value = pageSize;
  } else {
    // Add a temporary auto option and select it so the UI reflects the computed size
    const opt = document.createElement("option");
    opt.id = "autoPageSizeOption";
    opt.value = String(pageSize);
    opt.text = `${pageSize} (fit)`;
    // Append and select
    pageSizeEl.appendChild(opt);
    pageSizeEl.value = String(pageSize);
  }
}

// Recalculate page size on window resize with debounce
window.addEventListener(
  "resize",
  debounce(() => {
    calculateAndSetPageSize();
    // Reload first page so new page size takes effect
    loadMediaFiles(1);
  }, 200),
);

// ============ MEDIA LOADING ============

async function loadMediaFiles(page = 1) {
  showLoadingOverlay(true);
  try {
    const page_size = pageSizeEl.value || 10;

    const filters = getFilters();
    const data = await fetchMedia(page, filters, page_size);
    currentPage = data?.current_page ?? currentPage;

    renderMediaGrid(data.results);
    renderPagination(data);
    showFilters(filters);
  } catch (err) {
    console.error("Error fetching media files:", err);
    showToast(gettext("Failed to load media files"), "Error");
    mediaGrid.innerHTML =
      '<div class="alert alert-danger w-100">' +
      gettext("Failed to load media files") +
      "</div>";
  } finally {
    showLoadingOverlay(false);
  }
}

function renderMediaGrid(mediaFiles) {
  mediaGrid.innerHTML = "";

  if (mediaFiles.length === 0) {
    mediaGrid.innerHTML =
      '<div class="alert alert-primary fw-bold fs-4 w-100 text-center">' +
      gettext("No media files found") +
      "</div>";
    return;
  }

  mediaFiles.forEach((file) => {
    const mediaBox = document.createElement("div");
    mediaBox.className = "media-box";

    // Conditional rendering for image vs video preview
    let previewHTML = "";
    if (videoExtensionsList.includes(file.file_type?.toLowerCase())) {
      previewHTML = `
        <div class="preview-container checkerboard-bg">
          <video loop muted playsinline>
            <source src="${file.file_url}" type="video/${file.file_type?.toLowerCase()}">
            ${gettext("Your browser does not support the video tag.")}
          </video>
        </div>`;
    } else {
      previewHTML = `
        <div class="preview-container checkerboard-bg">
          <img src="${file.file_url}" alt="${file.title}">
        </div>`;
    }

    // Create the info section
    const infoHTML = `
      <div class="media-info d-flex gap-1 align-items-center mt-2">
        <p class="media-title flex-grow-1 m-0" title="${file.title}.${file.file_type?.toLowerCase()}">${file.title}.${file.file_type?.toLowerCase()}</p>
        <div class="media-actions">
          ${
            file.is_owned_by_branch
              ? `
              <div class="dropdown">
                <button class="btn btn-secondary btn-sm py-0 px-1" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                  <span class="material-symbols-outlined">more_horiz</span>
                </button>
                <ul class="dropdown-menu dropdown-menu-end border-lighter-gray shadow-xl p-2">
                  <li>
                    <button class="btn btn-secondary btn-sm d-flex gap-1 align-items-center edit-media-btn">
                      <span class="material-symbols-outlined">edit</span> ${gettext("Edit")}
                    </button>
                  </li>
                  <li class="mt-2">
                    <button class="btn btn-secondary btn-sm d-flex gap-1 align-items-center preview-media-btn">
                      <span class="material-symbols-outlined">zoom_in</span> ${gettext("Preview")}
                    </button>
                  </li>
                  <li class="mt-2">
                    <button class="btn btn-danger btn-sm d-flex gap-1 align-items-center delete-media-btn">
                      <span class="material-symbols-outlined">delete</span> ${gettext("Delete")}
                    </button>
                  </li>
                </ul>
              </div>
              `
              : `<button class="btn btn-secondary btn-sm" disabled title="${gettext("Not editable")}">
              <span class="material-symbols-outlined">lock</span>
            </button>`
          }
        </div>
      </div>`;

    // Combine preview and info
    mediaBox.innerHTML = previewHTML + infoHTML;

    const previewEl = mediaBox.querySelector(".preview-container");
    previewEl?.addEventListener("click", () => {
      currentlyEditingMedia = file;
      openPreviewMediaModal();
    });
    previewEl?.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const dropdownBtn = mediaBox.querySelector('[data-bs-toggle="dropdown"]');
      if (dropdownBtn) {
        const dropdown = bootstrap.Dropdown.getOrCreateInstance(dropdownBtn);
        dropdown.show();
      }
    });

    // Add event listeners to the action buttons
    if (file.is_owned_by_branch) {
      const editBtn = mediaBox.querySelector(".edit-media-btn");
      editBtn?.addEventListener("click", () => {
        currentlyEditingMedia = file;
        openEditMediaModal();
      });

      const previewBtn = mediaBox.querySelector(".preview-media-btn");
      previewBtn?.addEventListener("click", () => {
        currentlyEditingMedia = file;
        openPreviewMediaModal();
      });

      const deleteBtn = mediaBox.querySelector(".delete-media-btn");
      deleteBtn?.addEventListener("click", () => {
        currentlyEditingMedia = file;
        confirmDeleteMedia();
      });
    }

    mediaGrid.appendChild(mediaBox);
  });

  // Add pseudo-items to fill out the grid and prevent spacing issues
  const pageSize = parseInt(pageSizeEl.value, 10);
  const remainingItems = pageSize - mediaFiles.length;
  if (remainingItems > 0) {
    for (let i = 0; i < remainingItems; i++) {
      const pseudoBox = document.createElement("div");
      pseudoBox.className = "media-box pseudo-item";
      mediaGrid.appendChild(pseudoBox);
    }
  }

  // Initialize video previews
  mediaGrid.querySelectorAll("video").forEach((video) => {
    video.addEventListener("mouseenter", () => {
      video.play().catch((e) => console.warn("Autoplay blocked:", e));
    });
    video.addEventListener("mouseleave", () => {
      video.pause();
      video.currentTime = 0;
    });
  });
}

function renderPagination(data) {
  const paginationWrapper = document.querySelector("#media-pagination-wrapper");
  paginationWrapper.innerHTML = "";
  paginationWrapper.appendChild(createPageSelector(data, loadMediaFiles));
}

// ============ MODAL FUNCTIONS ============

function openEditMediaModal() {
  // Set modal title based on whether we're editing or creating
  submitMediaModalEl.querySelector("#submitMediaLabel").textContent =
    currentlyEditingMedia ? gettext("Update Media") : gettext("Upload Media");

  // Configure the file input field
  const fileInputWrapper = document.querySelector("#fileUploadSelectWrapper");
  fileInputWrapper.classList.toggle("d-none", currentlyEditingMedia !== null);

  // Set up the category select
  const select = document.querySelector("#submitMediaCtgSelect");
  select.innerHTML = "";
  select.insertAdjacentHTML(
    "beforeend",
    `<option value="">${gettext("None")}</option>`,
  );

  categories.forEach((category) => {
    select.insertAdjacentHTML(
      "beforeend",
      `<option value="${category.id}">${category.name}</option>`,
    );
  });

  // Reset and populate form fields for editing
  currentMediaTags.clear();
  tagsContainer.innerHTML = "";
  deleteMediaBtn.classList.add("d-none");

  if (currentlyEditingMedia) {
    // Set title
    submitMediaForm.title.value = currentlyEditingMedia.title;
    document.querySelector("#fileExtensionDisplay").innerHTML =
      "." + currentlyEditingMedia.file_type?.toLowerCase();

    // Set category
    select.value = currentlyEditingMedia?.category ?? "";

    // Add existing tags to currentMediaTags and display them
    if (currentlyEditingMedia.tags) {
      currentlyEditingMedia.tags.forEach((tagName) => {
        const tagObj = tags.find((t) => t.name === tagName);
        if (tagObj) {
          const idStr = String(tagObj.id);
          currentMediaTags.add(idStr);
          addTagToDisplay(tagsContainer, tagObj.name, removeTagFromMedia);
        }
      });
    }

    // Update tag checkboxes based on media tags
    createMediaEditTagsDropdown();

    // Show delete button if owned by branch
    deleteMediaBtn.classList.toggle(
      "d-none",
      !currentlyEditingMedia.is_owned_by_branch,
    );
  } else {
    // Reset form for new upload
    submitMediaForm.title.value = "";
    document.querySelector("#fileExtensionDisplay").innerHTML = "";

    // Reset tag checkboxes
    createMediaEditTagsDropdown();
  }

  bsSubmitModal.show();
}

function openPreviewMediaModal() {
  if (
    videoExtensionsList.includes(
      currentlyEditingMedia["file_type"]?.toLowerCase(),
    )
  ) {
    previewContainer.innerHTML = `
      <video loop muted autoplay controls playsinline class="object-fit-contain w-100 h-100 mh-100 mw-100 checkerboard-bg">
        <source src="${currentlyEditingMedia["file_url"]}" type="video/${currentlyEditingMedia["file_type"]?.toLowerCase()}">
        ${gettext("Your browser does not support the video tag.")}
      </video>`;
  } else {
    previewContainer.innerHTML = `
      <img src="${currentlyEditingMedia["file_url"]}" alt="${currentlyEditingMedia["title"]}" class="object-fit-contain w-100 h-100 mh-100 mw-100 checkerboard-bg">`;
  }

  bsPreviewModal.show();
}

// ============ EVENT LISTENERS ============

function initEventListeners() {
  // Upload new media button
  document.querySelector("#uploadNewMediaBtn").addEventListener("click", () => {
    currentlyEditingMedia = null;
    openEditMediaModal();
  });

  // Amount of media files shown per page
  pageSizeEl.addEventListener("change", () => {
    updateFilteringDebounce(1);
  });

  // Submit form
  submitMediaForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitMediaUpdate(e);
  });

  // Delete button
  deleteMediaBtn?.addEventListener("click", confirmDeleteMedia);
  deleteMediaPreviewBtn?.addEventListener("click", confirmDeleteMedia);

  editMediaPreviewBtn?.addEventListener("click", () => {
    bsPreviewModal.hide();
    openEditMediaModal();
  });

  // File input change
  fileInput?.addEventListener("change", syncFileTitleAndInput);

  // Filter inputs
  titleInput?.addEventListener("input", updateFilteringDebounce);

  // Background Pattern on Media preview (in mediaGrid and media_preview_modal) Toggle Buttons
  const lightPatternBtns = document.querySelectorAll(".pattern-light-btn");
  const darkPatternBtns = document.querySelectorAll(".pattern-dark-btn");

  lightPatternBtns?.forEach((btn) => {
    btn.addEventListener("change", () => {
      if (btn.checked) {
        mediaGrid?.classList.remove("checkerboard-dark");
        mediaGrid?.classList.add("checkerboard-light");
        previewContainer?.classList.remove("checkerboard-dark");
        previewContainer?.classList.add("checkerboard-light");

        // Make every lightPattern button be checked
        lightPatternBtns.forEach((b) => (b.checked = true));
      }
    });
  });

  darkPatternBtns?.forEach((btn) => {
    btn.addEventListener("change", () => {
      if (btn.checked) {
        mediaGrid?.classList.remove("checkerboard-light");
        mediaGrid?.classList.add("checkerboard-dark");
        previewContainer?.classList.remove("checkerboard-light");
        previewContainer?.classList.add("checkerboard-dark");

        // Make every darkPattern button be checked
        darkPatternBtns.forEach((b) => (b.checked = true));
      }
    });
  });
}

// ============ FILTER FUNCTIONS ============

function createExtensionSelect() {
  extensionSelectEl.innerHTML = "";
  createCheckboxDropdown(
    extensionSelectEl,
    gettext("File extensions"),
    validExtensions,
  );

  // Add event listeners for changing the checkboxes
  addDebounceEventListenerToElements(
    extensionSelectEl.querySelectorAll("input"),
    updateFilteringDebounce,
  );
}

function getFilters() {
  // Always show only Global branch media
  const branches = globalBranchId ? [globalBranchId] : [];
  const categories = getSelectedExtensions(mediaCategoryEl);
  const selectedExtensions = getSelectedExtensions(extensionSelectEl).map(
    (value) => value.toLowerCase(),
  );
  const selectedTags = getSelectedExtensions(mediaTagsWrapperEl);

  const title = titleInput.value.trim();

  // Create filters object with explicit property names
  const filters = {
    branches: branches,
    title: title,
  };

  // Add categories if any are selected (using the proper property name expected by the API)
  if (categories.length > 0) {
    filters.categories = categories;
  }

  // Add tags if any are selected
  if (selectedTags.length > 0) {
    filters.tags = selectedTags;
  }

  // Only add file_types if selections exist
  if (selectedExtensions.length > 0) {
    // Map frontend extension strings to backend Document.FileType values
    const extensionMap = {
      pdf: "pdf",
      png: "png",
      jpeg: "jpeg",
      jpg: "jpeg",
      svg: "svg",
      gif: "gif",
      mp4: "mp4",
      webp: "WebP",
      webm: "WebM",
    };

    filters.file_types = selectedExtensions
      .map((ext) => extensionMap[ext] || ext)
      .filter(Boolean);
  }

  return filters;
}

/** Render the chosen filter option(s) in HTML */
function renderFilter(values, targetSelector, data = null) {
  const container = document.querySelector(targetSelector);
  const wrapper = document.createElement("div");

  container.innerHTML = "";

  if (values) {
    values.forEach((val) => {
      // 'val' may only contain an id for the filter option - so find the name from data param
      const match = data?.find((el) => el.id === parseInt(val));
      const name = match ? match.name : val;

      const el = document.createElement("p");
      el.classList = "m-0";
      el.innerHTML = `<span class="material-symbols-outlined fs-6">add</span> ${name}`;
      wrapper.appendChild(el);
    });

    container.innerHTML = wrapper.innerHTML;
  } else {
    // No filters selected
    container.textContent = gettext("Nothing selected");
  }
}

/** Show chosen filter option(s) */
function showFilters(filters) {
  renderFilter(filters["file_types"], "#extensions-active");
  renderFilter(filters["categories"], "#categories-active", categories);
  renderFilter(filters["tags"], "#tags-active", tags);
}

// ============ MEDIA TAG FUNCTIONS ============

function removeTagFromMedia(tagName) {
  const tagObj = tags.find((t) => t.name === tagName);
  if (tagObj) {
    currentMediaTags.delete(String(tagObj.id));
  }
  // Uncheck in dropdown if present
  const tagsSelectEl = document.querySelector("#mediaEditTagsSelect");
  if (tagsSelectEl) {
    const cbElem = tagsSelectEl.querySelector(`input[value="${tagObj.id}"]`);
    if (cbElem) cbElem.checked = false;
  }
  refreshTagListDisplay();
}

function refreshTagListDisplay() {
  tagsContainer.innerHTML = "";
  currentMediaTags.forEach((tagId) => {
    const tagObj = tags.find((t) => String(t.id) === tagId);
    if (tagObj) {
      addTagToDisplay(tagsContainer, tagObj.name, removeTagFromMedia);
    }
  });
}

// ============ TAG FILTER FUNCTIONS ============

async function refreshTags() {
  try {
    tags = await genericFetch(
      `${BASE_URL}/api/tags/?organisation_id=${parentOrgID}`,
    );
  } catch (error) {
    console.error("Failed to fetch tags:", error);
    showToast(gettext("Error fetching tags"), "error");
    tags = [];
  }
}

function createTagsCheckboxDropdown() {
  mediaTagsWrapperEl.innerHTML = "";

  if (!tags || tags.length === 0) {
    console.warn("No tags found.");
    mediaTagsWrapperEl.innerHTML = `<div class="dropdown-item text-muted">${gettext("No tags available")}</div>`;
    return;
  }

  // Create dropdown with tags
  createCheckboxDropdown(mediaTagsWrapperEl, gettext("Tags"), tags, false);

  // Uncheck all items first
  const allItemCheckboxes = mediaTagsWrapperEl.querySelectorAll(
    'input[type="checkbox"]:not(#toggleAll)',
  );
  allItemCheckboxes.forEach((cb) => {
    cb.checked = false;
  });

  // Set Toggle All checkbox to unchecked
  const toggleAllCheckbox = mediaTagsWrapperEl.querySelector("#toggleAll");
  if (toggleAllCheckbox) {
    toggleAllCheckbox.checked = false;
  }

  // Add event listeners for the checkboxes
  addDebounceEventListenerToElements(
    mediaTagsWrapperEl.querySelectorAll("input"),
    updateFilteringDebounce,
  );
}

function createMediaEditTagsDropdown() {
  if (!mediaEditTagsSelectEl) return;

  mediaEditTagsSelectEl.innerHTML = "";

  if (!tags || tags.length === 0) {
    console.warn("No tags found for media edit dropdown.");
    mediaEditTagsSelectEl.innerHTML = `<div class="dropdown-item text-muted">${gettext("No tags available")}</div>`;
    return;
  }

  // Create dropdown with tags
  createCheckboxDropdown(mediaEditTagsSelectEl, gettext("Tags"), tags, false);

  // Uncheck all items first
  const allItemCheckboxes = mediaEditTagsSelectEl.querySelectorAll(
    'input[type="checkbox"]:not(#toggleAll)',
  );
  allItemCheckboxes.forEach((cb) => {
    cb.checked = false;
  });

  // Set Toggle All checkbox to unchecked
  const toggleAllCheckbox = mediaEditTagsSelectEl.querySelector("#toggleAll");
  if (toggleAllCheckbox) {
    toggleAllCheckbox.checked = false;
  }

  // Check boxes for tags that are already in currentMediaTags
  mediaEditTagsSelectEl
    .querySelectorAll('input[type="checkbox"]:not(#toggleAll)')
    .forEach((cb) => {
      cb.checked = currentMediaTags.has(cb.value);
    });

  // Add event listeners for changes to update the currentMediaTags
  mediaEditTagsSelectEl
    .querySelectorAll('input[type="checkbox"]:not(#toggleAll)')
    .forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        updateSelectedMediaTags();
      });
    });

  // Also handle the toggle all checkbox
  const toggleAll = mediaEditTagsSelectEl.querySelector("#toggleAll");
  if (toggleAll) {
    toggleAll.addEventListener("change", () => {
      setTimeout(updateSelectedMediaTags, 50); // Small delay to ensure checkboxes are updated
    });
  }
}

function updateSelectedMediaTags() {
  // Clear the current set of tags
  currentMediaTags.clear();

  // Get all checked checkboxes (except the toggle all checkbox)
  const checkedBoxes = mediaEditTagsSelectEl.querySelectorAll(
    'input[type="checkbox"]:checked:not(#toggleAll)',
  );

  // Add each checked tag to the currentMediaTags set
  checkedBoxes.forEach((checkbox) => {
    currentMediaTags.add(checkbox.value);
  });

  // Update the visual display of tags
  refreshTagListDisplay();
}

// ============ API FUNCTIONS ============

async function refreshCategories() {
  try {
    categories = await genericFetch(
      `${BASE_URL}/api/categories/?organisation_id=${parentOrgID}`,
    );
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    categories = [];
  }
}

async function fetchMedia(page, filters, page_size) {
  return genericFetch(
    `${BASE_URL}/api/documents/list/?page=${page}&branch_id=${selectedBranchID}&page_size=${page_size}`,
    "POST",
    filters,
  );
}

async function confirmDeleteMedia() {
  if (!currentlyEditingMedia) return;

  if (
    confirm(
      gettext(
        'Are you sure you want to delete "{title}"? This action cannot be undone.',
      ).replace("{title}", currentlyEditingMedia.title),
    )
  ) {
    try {
      showLoadingOverlay(true);
      await genericFetch(
        `${BASE_URL}/api/documents/${currentlyEditingMedia.id}?branch_id=${selectedBranchID}`,
        "DELETE",
      );
      showToast(gettext("Media successfully deleted"), "Success");
      currentlyEditingMedia = null;

      if (bsSubmitModal) {
        bsSubmitModal.hide();
      }
      if (bsPreviewModal) {
        bsPreviewModal.hide();
      }

      // Refresh the media grid
      await loadMediaFiles(currentPage);
    } catch (e) {
      showToast(e.error || gettext("Failed to delete media"), "Error");
    } finally {
      showLoadingOverlay(false);
    }
  }
}

async function submitMediaUpdate(event) {
  event.preventDefault();
  const form = event.target;
  const body = new FormData();

  // Always upload to the Global branch if available, otherwise use selected branch
  const uploadBranchId = globalBranchId || selectedBranchID;
  body.append("branch_id", uploadBranchId);

  if (form.category.value) body.append("category", form.category.value);
  currentMediaTags.forEach((tag) => body.append("tags[]", tag));

  let method = "PUT";
  let idParam = "";

  if (!currentlyEditingMedia) {
    if (form.file.files.length > 1) {
      await submitMultipleMediaUpload(form.file, body);
      return;
    }

    const newFile = form.file.files[0];
    if (!newFile) {
      showToast(gettext("Please select a file to upload."), "Error");
      return;
    }
    // Use original file name; backend will suffix with a content hash
    body.append("file", newFile);
    method = "POST";
  } else {
    idParam = currentlyEditingMedia.id;
  }

  let title = form.title.value.trim();
  if (!title) {
    showToast(gettext("The file must have a name"), "Error");
    return;
  }
  body.append("title", title);

  showLoadingOverlay(true);
  try {
    await genericFetch(
      `${BASE_URL}/api/documents/${idParam}?branch_id=${selectedBranchID}`,
      method,
      body,
    );
    showToast(
      method === "POST"
        ? gettext("Media successfully uploaded")
        : gettext("Media successfully updated"),
      "Success",
    );

    currentlyEditingMedia = null;
    bsSubmitModal.hide();

    // Refresh the media grid
    await loadMediaFiles(currentPage);
  } catch (error) {
    console.error("Failed to submit media");
    showToast(error.message || gettext("Failed to process media"), "Error");
  } finally {
    showLoadingOverlay(false);
    form.file.value = "";
  }
}

async function submitMultipleMediaUpload(formFile, body) {
  const files = Array.from(formFile.files);
  if (!files.length) {
    showToast(gettext("Please select one or more files to upload."), "Error");
    return;
  }

  showLoadingOverlay(true);
  try {
    const uploads = files.map(async (file) => {
      const form = formFile.form;
      const originalName = file.name;
      const fileName =
        originalName.substring(0, originalName.lastIndexOf(".")) ||
        originalName;
      const uploadBody = new FormData();
      uploadBody.append("branch_id", body.get("branch_id"));
      const category = form.category.value;
      if (category) uploadBody.append("category", category);
      currentMediaTags.forEach((tag) => uploadBody.append("tags[]", tag));
      uploadBody.append("title", fileName);
      // Use original file; backend will suffix with a content hash
      uploadBody.append("file", file);
      await genericFetch(
        `${BASE_URL}/api/documents/?branch_id=${selectedBranchID}`,
        "POST",
        uploadBody,
      );
    });

    await Promise.all(uploads);
    showToast(gettext("Files uploaded successfully"), "Success");

    currentlyEditingMedia = null;
    bsSubmitModal.hide();

    // Refresh the grid
    await loadMediaFiles(1);
  } catch (error) {
    showToast(error.message || gettext("Failed to upload files"), "Error");
  } finally {
    showLoadingOverlay(false);
    formFile.value = "";
  }
}

// ============ HELPER FUNCTIONS ============

function syncFileTitleAndInput() {
  const fileExtensionDisplay = document.querySelector("#fileExtensionDisplay");
  const tooltip = bootstrap.Tooltip.getOrCreateInstance(submitMediaForm.title);

  if (fileInput.files.length > 1) {
    submitMediaForm.title.value = "";
    submitMediaForm.title.disabled = true;
    tooltip.enable();
    return;
  } else {
    submitMediaForm.title.disabled = false;
    tooltip.hide();
    tooltip.disable();
  }

  let fileName = currentlyEditingMedia?.title || fileInput?.files[0]?.name;
  if (fileName) {
    if (currentlyEditingMedia) {
      submitMediaForm.title.value = fileName;
      fileExtensionDisplay.innerHTML =
        "." + currentlyEditingMedia.file_type?.toLowerCase();
    } else {
      // Extract filename without extension
      const lastDotIndex = fileName.lastIndexOf(".");
      if (lastDotIndex !== -1) {
        submitMediaForm.title.value = fileName.substring(0, lastDotIndex);
        fileExtensionDisplay.innerHTML = fileName.substring(lastDotIndex);
      } else {
        submitMediaForm.title.value = fileName;
        fileExtensionDisplay.innerHTML = "";
      }
    }
  } else {
    submitMediaForm.title.value = "";
    fileExtensionDisplay.innerHTML = "";
  }
}

function showLoadingOverlay(show) {
  let overlay = document.querySelector(".loading-overlay");

  if (show) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "loading-overlay";
      overlay.innerHTML = `
        <div class="spinner-border text-primary mb-3" role="status">
          <span class="visually-hidden">${gettext("Loading...")}</span>
        </div>
        <div class="fw-bold">${gettext("Loading...")}</div>
      `;
      document.body.appendChild(overlay);
    }
    overlay.style.display = "flex";
  } else if (overlay) {
    overlay.style.display = "none";
  }
}
