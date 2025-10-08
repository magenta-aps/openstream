// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import {
  genericFetch,
  selectedBranchID,
  showToast,
  parentOrgID,
  addDebounceEventListenerToElements,
  addTagToDisplay,
  createCheckboxDropdown,
  createPageSelector,
  debounce,
  getSelectedExtensions,
  promptDelete,
  updateTagSearchSuggestions,
} from "../../../../utils/utils.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";
// Tag state for modal filters
let modalTags = [];
async function refreshModalTags() {
  try {
    modalTags = await genericFetch(
      `${BASE_URL}/api/tags?organisation_id=${parentOrgID}`,
    );
  } catch (e) {
    console.error("Failed to fetch tags for modal:", e);
    modalTags = [];
  }
}
import * as bootstrap from "bootstrap";

// Modal Elements - Check if they exist before initializing
const mediaListModalEl = document.getElementById("mediaListModal");
const submitMediaModalEl = document.getElementById("submitMediaModal");
const previewMediaModalEl = document.getElementById("previewMediaModal");

// Only initialize modals if elements exist
const bsMediaListModal = mediaListModalEl
  ? bootstrap.Modal.getOrCreateInstance(mediaListModalEl)
  : null;
const bsSubmitModal = submitMediaModalEl
  ? bootstrap.Modal.getOrCreateInstance(submitMediaModalEl)
  : null;
const bsPreviewModal = previewMediaModalEl
  ? bootstrap.Modal.getOrCreateInstance(previewMediaModalEl)
  : null;

const tagsContainer = document.querySelector("#mediaEditTagsContainer");
const submitMediaForm = document.querySelector("#submitMediaForm");
const previewContainer = document.querySelector("#preview-media-container");
const deleteMediaBtn = document.querySelector("#btnDeleteMedia");
const fileInput = document.querySelector("#mediaFileInput");
const titleInput = document.querySelector("#titleSearchInput");
const mediaOwnerEl = document.querySelector("#media-owner-wrapper");
const mediaCategoryEl = document.querySelector("#media-category-wrapper");
const extensionSelectEl = document.querySelector("#extension-select-wrapper");
const tagInput = document.querySelector("#submitMediaTagsInput");
const mediaSubmitOverlay = document.querySelector("#mediaSubmitOverlay");
const saveMediaBtn = document.querySelector("#saveMediaBtn");
const cancelSubmitMediaBtn = document.querySelector("#cancelSubmitMediaBtn");
const imageGrid = document.getElementById("imageGrid");
const toggleCheckerboardBtn = document.getElementById("toggleCheckerboardBtn");

export { bsMediaListModal, bsSubmitModal };

const currentMediaTags = new Set();
const currentFilterTags = new Set();
export let currentlyEditingMedia = null;
let categories = [];
let associatedBranches = [];
let currentPage = 1;
let currentOnSelectCallback = null;
let currentInitialFilters = {};
let currentAcceptString = "*";
let firstOpeningFlag = true;
let currentInputType = "Image";

const mimeTypeMap = {
  png: "image/png",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  gif: "image/gif",
  webp: "image/webp",
  webm: "video/webm",
};

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

const videoExtensionsList = ["mp4", "webm", "gif"];

const tagSearch = debounce(updateTagSearchSuggestions, 300);
const updateFilteringDebounce = debounce(() => {
  if (currentOnSelectCallback) {
    displayMediaModal(1, currentOnSelectCallback, currentInitialFilters);
  } else {
    console.warn("Cannot refresh media list - no callback is set.");
  }
});

// Global state for managing selected files
let selectedFilesArray = [];

// ============ MODAL DISPLAY & INITIALIZATION ============

export async function displayMediaModal(
  page = currentPage,
  onSelectCallback,
  initialFilters = {},
  inputType,
) {
  // Check if modal elements exist
  if (!bsMediaListModal || !mediaListModalEl) {
    console.warn("Media modal not available - skipping display");
    return;
  }

  if (!onSelectCallback) {
    console.error("displayMediaModal requires an onSelectCallback function.");
    return;
  }

  // Reset filters if opening with different initialFilters than before
  const isNewMediaType = hasMediaTypeChanged(initialFilters);
  if (isNewMediaType) {
    resetAllFilters();
  }
  if (inputType && inputType !== currentInputType) currentInputType = inputType;

  currentOnSelectCallback = onSelectCallback;
  currentInitialFilters = initialFilters; // Store initial filters for pagination/refresh

  // Determine the accept string based on filters
  const allowedTypes = initialFilters.file_types;
  if (allowedTypes && Array.isArray(allowedTypes) && allowedTypes.length > 0) {
    currentAcceptString = allowedTypes
      .map((ext) => mimeTypeMap[ext.toLowerCase()] || `.${ext.toLowerCase()}`)
      .join(",");
  } else {
    // Default: accept all known types if no specific filter is passed
    currentAcceptString = Object.values(mimeTypeMap).join(",");
  }

  if (firstOpeningFlag) {
    await initMediaModalInternal(); // Internal init on first open
    firstOpeningFlag = false;
  } else {
    // Always refresh the extension select when the media type changes
    if (isNewMediaType) {
      createExtensionSelect(); // Rebuild extension options
    }
  }

  try {
    // Get user-selected filters WITHOUT merging with initialFilters
    // This ensures user selections take precedence
    const filters = getFilters();

    const data = await fetchMedia(page, filters);

    currentPage = data?.current_page ?? currentPage;
    const mediaGrid = document.getElementById("imageGrid");

    mediaGrid.innerHTML = "";
    if (data.results.length === 0) {
      const currentInputTypeText =
        currentInputType === gettext("Image")
          ? gettext("No images found")
          : gettext("No videos found");

      mediaGrid.insertAdjacentHTML(
        "beforeend",
        `
      <div class="alert alert-primary fw-bold fs-4 w-100 text-center">${currentInputTypeText}</div>
      `,
      );
    } else {
      data.results.forEach((file) => {
        const mediaBox = document.createElement("div");
        mediaBox.className = "image-box d-flex flex-column";

        // Conditional rendering for image vs video preview
        let previewHTML = "";
        if (videoExtensionsList.includes(file.file_type?.toLowerCase())) {
          previewHTML = `
            <video loop muted playsinline>
              <source src="${file.file_url}" type="video/${file.file_type?.toLowerCase()}">
              Your browser does not support the video tag.
            </video>`;
        } else {
          previewHTML = `
            <img src="${file.file_url}" alt="${file.title}">`;
        }

        // Create the bottom info section
        const infoDiv = document.createElement("div");
        infoDiv.className = "media-info d-flex gap-1 align-items-center mt-2";

        const titleP = document.createElement("p");
        titleP.className = "media-title small flex-grow-1 m-0 text-truncate";
        titleP.title = `${file.title}.${file.file_type?.toLowerCase()}`;
        titleP.textContent = `${file.title}.${file.file_type?.toLowerCase()}`;
        infoDiv.appendChild(titleP);
        // <p class="media-title flex-grow-1 m-0" title="${file.title}.${file.file_type?.toLowerCase()}">${file.title}.${file.file_type?.toLowerCase()}</p>

        // Create and add edit button conditionally
        // let editButtonHTML = "";
        let actionButtonHTML = "";
        if (file.is_owned_by_branch) {
          // editButtonHTML = `
          //   <button class="btn btn-info btn-sm edit-media-btn">
          //       <span class="material-symbols-outlined">edit</span>
          //   </button>`;
            
          actionButtonHTML = 
            `<div class="dropdown">
                <button class="btn btn-secondary btn-sm" type="button" data-bs-toggle="dropdown" aria-expanded="false">
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
                </ul>
            </div>`
        }
        

        // Set innerHTML for the main mediaBox
        mediaBox.innerHTML = `
          <div class="checkerboard-bg">
            ${previewHTML}
          </div>
        `;

        infoDiv.insertAdjacentHTML("beforeend", actionButtonHTML);
        // infoDiv.insertAdjacentHTML("beforeend", editButtonHTML);
        mediaBox.appendChild(infoDiv);

        mediaBox.addEventListener("click", (e) => {
          if (e.target.closest(".dropdown")) {
            return;
          }
          // if (e.target.closest(".edit-media-btn")) {
          //   return;
          // }
          if (bsMediaListModal) {
            bsMediaListModal.hide();
          }
          if (currentOnSelectCallback) {
            currentOnSelectCallback(file.id);
          }
        });

        const editButton = infoDiv.querySelector(".edit-media-btn");
        editButton?.addEventListener("click", (e) => {
          e.stopPropagation();
          currentlyEditingMedia = file;
          createOrUpdateMediaClicked(currentInputType);
        });
        
        const previewBtn = mediaBox.querySelector(".preview-media-btn");
        previewBtn?.addEventListener("click", (e) => {
          e.stopPropagation();
          currentlyEditingMedia = file;
          // console.log(currentlyEditingMedia);
          openPreviewMediaModal();
        })

        mediaGrid.appendChild(mediaBox);
      });
    }

    const paginationWrapper = document.querySelector(
      "#media-pagination-wrapper",
    );
    paginationWrapper.innerHTML = "";
    paginationWrapper.appendChild(
      createPageSelector(data, (newPage) =>
        displayMediaModal(
          newPage,
          currentOnSelectCallback,
          currentInitialFilters,
        ),
      ),
    );

    document.querySelector("#fileTypeName").textContent =
      currentInputType === gettext("Image")
        ? gettext("Image")
        : gettext("Video");

    const mediaListLabel = document.querySelector("#mediaListLabel");
    if (mediaListLabel) {
      mediaListLabel.textContent = `${gettext("Insert")} ${currentInputType === gettext("Image") ? gettext("Image") : gettext("Video")}`;
    }

    if (bsMediaListModal) {
      bsMediaListModal.show();
    }
  } catch (err) {
    console.error("Error fetching media:", err);
  }
}

async function initMediaModalInternal() {
  // Only initialize if modal elements exist
  if (!mediaListModalEl) {
    console.warn("Media modal elements not found - skipping initialization");
    return;
  }

  await refreshCategories();
  await refreshModalTags();
  createExtensionSelect();
  if (mediaCategoryEl) {
    createCheckboxDropdown(
      mediaCategoryEl,
      gettext("Categories"),
      categories,
      false,
    );
  }
  // Create tag filter dropdown
  const filterTagWrapper = document.querySelector("#media-filter-tags-wrapper");
  if (filterTagWrapper) {
    createCheckboxDropdown(filterTagWrapper, "Tags", modalTags, false);
    addDebounceEventListenerToElements(
      filterTagWrapper.querySelectorAll("input"),
      updateFilteringDebounce,
    );
  }
  // Create tag selection dropdown for submit/edit modal
  const tagsSelectEl = document.querySelector("#mediaEditTagsSelect");
  if (tagsSelectEl) {
    createCheckboxDropdown(tagsSelectEl, "Tags", modalTags, false);
    // Clear all selections
    tagsSelectEl
      .querySelectorAll('input[type="checkbox"]')
      .forEach((cb) => (cb.checked = false));
    addDebounceEventListenerToElements(
      tagsSelectEl.querySelectorAll('input[type="checkbox"]'),
      updateSelectedMediaTags,
    );
  }
  try {
    associatedBranches = await genericFetch(
      `${BASE_URL}/api/branches/?branch_id=${selectedBranchID}&organisation_id=${parentOrgID}`,
    );
  } catch (error) {
    console.error("Error fetching organisation branches:", error);
    showToast(gettext("Error fetching branches."), 5000, "error");
    associatedBranches = [];
  }
  await createUploadedBySelect();
  initEventListeners();
}

function createExtensionSelect() {
  const separatorComment = (text) =>
    `<li class="dropdown-header text-muted p-0 m-0 small">${text}</li>`;

  extensionSelectEl.innerHTML = "";

  const imageExtensions = ["PNG", "JPEG", "SVG", "PDF", "WebP"];
  const videoExtensions = ["MP4", "WebM", "GIF"];

  // Filter extensions based on current media type
  let filteredExtensions = [...validExtensions];

  // If we have file type filters in the initial filters, use those to determine which extensions to show
  if (
    currentInitialFilters.file_types &&
    currentInitialFilters.file_types.length > 0
  ) {
    // Extract lowercase types from the initial filters
    const requestedTypes = currentInitialFilters.file_types.map((type) =>
      type.toLowerCase(),
    );

    // Check if we're looking at images or videos
    const isVideoRequest = requestedTypes.some((type) =>
      videoExtensions.map((e) => e.toLowerCase()).includes(type),
    );
    const isImageRequest = requestedTypes.some((type) =>
      imageExtensions.map((e) => e.toLowerCase()).includes(type),
    );

    // Filter extensions accordingly
    if (isVideoRequest && !isImageRequest) {
      // Only show video extensions
      filteredExtensions = validExtensions.filter((ext) =>
        videoExtensions.includes(ext.value),
      );
    } else if (isImageRequest && !isVideoRequest) {
      // Only show image extensions
      filteredExtensions = validExtensions.filter((ext) =>
        imageExtensions.includes(ext.value),
      );
    }
  }

  // Create the dropdown with the filtered extensions
  createCheckboxDropdown(
    extensionSelectEl,
    gettext("File extensions"),
    filteredExtensions,
  );

  // Select all checkboxes by default for the respective media type
  if (
    currentInitialFilters.file_types &&
    currentInitialFilters.file_types.length > 0
  ) {
    // By default, DO NOT check all checkboxes, let user select specific ones
    extensionSelectEl
      .querySelectorAll(".extension-checkbox")
      .forEach((checkbox) => {
        checkbox.checked = false;
      });

    // Preselect the toggle all checkbox to false as well
    const toggleAll = extensionSelectEl.querySelector("#toggleAll");
    if (toggleAll) toggleAll.checked = false;
  }

  // Add event listeners for changing the checkboxes
  addDebounceEventListenerToElements(
    extensionSelectEl.querySelectorAll("input"),
    updateFilteringDebounce,
  );

  // Add labels for image and video sections if showing both
  if (
    !currentInitialFilters.file_types ||
    (currentInitialFilters.file_types.some((t) =>
      imageExtensions.map((e) => e.toLowerCase()).includes(t.toLowerCase()),
    ) &&
      currentInitialFilters.file_types.some((t) =>
        videoExtensions.map((e) => e.toLowerCase()).includes(t.toLowerCase()),
      ))
  ) {
    extensionSelectEl
      .querySelector("li")
      .insertAdjacentHTML("afterend", separatorComment("Images"));

    let firstVideoLi = null;
    extensionSelectEl
      .querySelectorAll(".extension-checkbox")
      .forEach((checkbox) => {
        if (videoExtensions.includes(checkbox.value) && !firstVideoLi) {
          firstVideoLi = checkbox.closest("li");
        }
      });

    if (firstVideoLi) {
      firstVideoLi.insertAdjacentHTML(
        "beforebegin",
        `<hr class="my-1">${separatorComment("Videos")}`,
      );
    }
  }
}

async function createUploadedBySelect() {
  mediaOwnerEl.innerHTML = ""; // Clear previous options

  if (!associatedBranches || associatedBranches.length === 0) {
    console.warn("No associated branches found or provided.");
    mediaOwnerEl.innerHTML = `<li class="dropdown-item text-muted">${gettext("No branches available")}</li>`;
    return;
  }

  // Find the Global branch and current branch
  const globalBranch = associatedBranches.find(
    (b) => b.name.toLowerCase() === "global",
  );
  const currentBranch = associatedBranches.find(
    (b) => String(b.id) === String(selectedBranchID),
  );

  // Create priority branches section (Global + Current if different)
  let priorityBranches = [];
  const otherBranches = [];

  // Add Global branch first if it exists
  if (globalBranch) {
    priorityBranches.push(globalBranch);
  }

  // Add current branch if it exists and is different from Global
  if (
    currentBranch &&
    (!globalBranch || String(currentBranch.id) !== String(globalBranch.id))
  ) {
    priorityBranches.push(currentBranch);
  }

  // Add remaining branches to other section
  associatedBranches.forEach((branch) => {
    const isGlobal =
      globalBranch && String(branch.id) === String(globalBranch.id);
    const isCurrent =
      currentBranch && String(branch.id) === String(currentBranch.id);

    if (!isGlobal && !isCurrent) {
      otherBranches.push(branch);
    }
  });

  // Create ordered array: priority branches first, then others
  const orderedBranches = [...priorityBranches, ...otherBranches];

  // Render the dropdown, explicitly telling it NOT to check all by default.
  createCheckboxDropdown(
    mediaOwnerEl,
    gettext("Uploaded by"),
    orderedBranches,
    false,
  );

  // Add horizontal separator after priority branches if we have both priority and other branches
  if (priorityBranches.length > 0 && otherBranches.length > 0) {
    const ul = mediaOwnerEl.querySelector("ul");
    const lastPriorityBranch = priorityBranches[priorityBranches.length - 1];
    const lastPriorityLi = ul
      .querySelector(`input[value="${lastPriorityBranch.id}"]`)
      ?.closest("li");
    if (lastPriorityLi) {
      lastPriorityLi.insertAdjacentHTML(
        "afterend",
        '<li><hr class="dropdown-divider my-1"></li>',
      );
    }
  }

  // --- Explicitly uncheck all items first ---
  const allItemCheckboxes = mediaOwnerEl.querySelectorAll(
    'input[type="checkbox"]:not(#toggleAll)',
  );
  allItemCheckboxes.forEach((cb) => {
    cb.checked = false;
  });

  // --- Set Toggle All to unchecked initially ---
  const toggleAllCheckbox = mediaOwnerEl.querySelector("#toggleAll");
  if (toggleAllCheckbox) {
    toggleAllCheckbox.checked = false;
  }

  // Check the priority branches (Global and current branch)
  priorityBranches.forEach((branch) => {
    const checkbox = mediaOwnerEl.querySelector(
      `input[type="checkbox"][value="${branch.id}"]`,
    );
    if (checkbox) {
      checkbox.checked = true;
    } else {
      console.warn(
        `Checkbox for branch "${branch.name}" (ID: ${branch.id}) not found.`,
      );
    }
  });

  // Add event listeners AFTER setting the initial state
  addDebounceEventListenerToElements(
    mediaOwnerEl.querySelectorAll("input"),
    updateFilteringDebounce,
  );
}

// ============ SUBMIT/EDIT MODAL ============

export function createOrUpdateMediaClicked() {
  submitMediaModalEl.querySelector("#submitMediaLabel").textContent =
    currentlyEditingMedia
      ? `${gettext("Update")} ${currentInputType}`
      : `${gettext("Upload")} ${currentInputType}`;
  // Reflect the current file types in the UI
  const fileInputWrapper = document.querySelector("#fileUploadSelectWrapper");
  fileInputWrapper.querySelector("input").accept =
    currentInputType === "Video"
      ? ".mp4,.webm"
      : ".pdf,.png,.jpeg,.jpg,.svg,.gif,.webp";
  fileInputWrapper.classList.toggle("d-none", currentlyEditingMedia !== null); // Remove file input on edit.

  // Also hide the file upload separator when editing
  const fileUploadSeparator = document.querySelector("#file_upload_seperator");
  if (fileUploadSeparator) {
    fileUploadSeparator.classList.toggle(
      "d-none",
      currentlyEditingMedia !== null,
    );
  }

  const select = document.querySelector("#submitMediaCtgSelect");
  select.innerHTML = "";
  select.insertAdjacentHTML(
    "beforeend",
    `<option value="">${gettext("None")}</option>`,
  );
  for (const category of categories) {
    select.insertAdjacentHTML(
      "beforeend",
      `<option value="${category.id}">${category.name}</option>`,
    );
  }

  syncFileTitleAndInput();
  currentMediaTags.clear();
  tagsContainer.innerHTML = "";
  deleteMediaBtn.classList.add("d-none"); // Hide delete button by default
  if (currentlyEditingMedia) {
    currentlyEditingMedia.tags?.forEach((tag) => addTagToMediaList(tag));
    select.value = currentlyEditingMedia?.category ?? "";
    // Only show delete button if owned by branch
    deleteMediaBtn.classList.toggle(
      "d-none",
      !currentlyEditingMedia.is_owned_by_branch,
    );
  }
  // Sync tag dropdown checkboxes to reflect currentMediaTags
  const tagsSelectEl = document.querySelector("#mediaEditTagsSelect");
  if (tagsSelectEl) {
    tagsSelectEl
      .querySelectorAll('input[type="checkbox"]:not(#toggleAll)')
      .forEach((cb) => {
        cb.checked = currentMediaTags.has(cb.value);
      });
  }

  if (bsMediaListModal) {
    bsMediaListModal.hide();
  }
  if (bsSubmitModal) {
    bsSubmitModal.show();
  }
}

async function deleteMediaClicked() {
  await promptDelete(
    currentlyEditingMedia.title,
    confirmDeleteMedia,
    bsSubmitModal,
    bsMediaListModal, // Return to list modal after delete prompt
  );
}

function openPreviewMediaModal(){
  if (videoExtensionsList.includes(currentlyEditingMedia["file_type"]?.toLowerCase())) {
    previewContainer.innerHTML = `
      <video loop muted autoplay controls playsinline class="object-fit-contain w-100 h-100 mh-100 mw-100 checkerboard-bg">
        <source src="${currentlyEditingMedia['file_url']}" type="video/${currentlyEditingMedia['file_type']?.toLowerCase()}">
        ${gettext("Your browser does not support the video tag.")}
      </video>`;
  } else {
    previewContainer.innerHTML = `
      <img src="${currentlyEditingMedia['file_url']}" alt="${currentlyEditingMedia['title']}" class="object-fit-contain w-100 h-100 mh-100 mw-100 checkerboard-bg">`;
  }

  if (bsMediaListModal) {
    bsMediaListModal.hide();
  }
  if (bsPreviewModal) {
    bsPreviewModal.show();
  }
}

// ================ API Functions ================

async function refreshCategories() {
  categories = await genericFetch(
    `${BASE_URL}/api/categories?organisation_id=${parentOrgID}`,
  );
}

async function fetchMedia(page, filters) {
  return genericFetch(
    `${BASE_URL}/api/documents/list/?page=${page}&branch_id=${selectedBranchID}&organisation_id=${parentOrgID}`,
    "POST",
    filters,
  );
}

async function confirmDeleteMedia() {
  try {
    await genericFetch(
      `${BASE_URL}/api/documents/${currentlyEditingMedia.id}?branch_id=${selectedBranchID}&organisation_id=${parentOrgID}`,
      "DELETE",
    );
    currentlyEditingMedia = null;
    showToast(gettext("Media succesfully deleted"), "Success");
    // Refresh the list modal with the stored callback and filters
    await displayMediaModal(1, currentOnSelectCallback, currentInitialFilters);
  } catch (e) {
    showToast(e.error, "Error");
  }
}

async function submitMediaUpdate(event) {
  const form = event.target;
  const body = new FormData();

  body.append("branch_id", selectedBranchID);
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

  let title = form.title.value;
  if (!title) {
    showToast(gettext("The file must have a name"), "Error");
    return;
  }
  body.append("title", title);

  toggleMediaUploadDisabled(true);
  try {
    await genericFetch(
      `${BASE_URL}/api/documents/${idParam}?branch_id=${selectedBranchID}&organisation_id=${parentOrgID}`,
      method,
      body,
    );
    showToast(
      `${gettext("Media succesfully")} ${method === "POST" ? gettext("created") : gettext("updated")}`,
      "Success",
    );
    currentlyEditingMedia = null;
    if (bsSubmitModal) {
      bsSubmitModal.hide();
    }
    // Refresh the list modal with the stored callback and filters
    displayMediaModal(1, currentOnSelectCallback, currentInitialFilters);
  } catch (error) {
    console.error("Failed to submit media");
    showToast(error.message, "Error");
  } finally {
    toggleMediaUploadDisabled(false);
    form.file.value = "";
  }
}

async function submitMultipleMediaUpload(formFile, body) {
  const files = formFile.files;
  if (!files.length) {
    showToast(gettext("Please select one or more files to upload."), "Error");
    return;
  }

  toggleMediaUploadDisabled(true);
  try {
    const uploads = Array.from(files).map(async (file) => {
      // Use filename (without extension) as title
      const fileTitle = extractExtensionFromFile(file.name, true);
      // Use original file; backend will suffix with a content hash
      // Create a fresh FormData per upload to avoid shared state between uploads
      const uploadBody = new FormData();
      uploadBody.append("branch_id", body.get("branch_id"));
      const category = body.get("category");
      if (category) uploadBody.append("category", category);
      currentMediaTags.forEach((tag) => uploadBody.append("tags[]", tag));
      uploadBody.append("title", fileTitle);
      uploadBody.append("file", file);
      await genericFetch(
        `${BASE_URL}/api/documents/?branch_id=${selectedBranchID}&organisation_id=${parentOrgID}`,
        "POST",
        uploadBody,
      );
    });

    await Promise.all(uploads);
    showToast(gettext("Files uploaded successfully"), "Success");
    currentlyEditingMedia = null;
    if (bsSubmitModal) {
      bsSubmitModal.hide();
    }
    displayMediaModal(1, currentOnSelectCallback, currentInitialFilters);
    if (formFile) {
      formFile.value = "";
    }
  } catch (error) {
    showToast(error.message, "Error");
  } finally {
    toggleMediaUploadDisabled(false);
  }
}

function toggleMediaUploadDisabled(disabled) {
  mediaSubmitOverlay.classList.toggle("d-none", !disabled);
  saveMediaBtn.disabled = disabled;
  deleteMediaBtn.disabled = disabled;
  cancelSubmitMediaBtn.disabled = disabled;
}

// ================ Selected Files Display ================

function displaySelectedFiles() {
  const selectedFilesContainer = document.getElementById(
    "selectedFilesContainer",
  );
  const selectedFilesList = document.getElementById("selectedFilesList");

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    // If no files in input but we have files in our array, don't hide the container
    if (selectedFilesArray.length === 0) {
      selectedFilesContainer.classList.add("d-none");
    }
    return;
  }

  // Add new files to existing selection instead of replacing
  const newFiles = Array.from(fileInput.files);
  newFiles.forEach((newFile) => {
    // Check if file is already in the selection (by name and size to avoid duplicates)
    const isDuplicate = selectedFilesArray.some(
      (existingFile) =>
        existingFile.name === newFile.name &&
        existingFile.size === newFile.size,
    );

    if (!isDuplicate) {
      selectedFilesArray.push(newFile);
    }
  });

  // Update the file input to reflect our complete selection
  const dataTransfer = new DataTransfer();
  selectedFilesArray.forEach((file) => {
    dataTransfer.items.add(file);
  });
  fileInput.files = dataTransfer.files;

  // Always show the container if we have any files
  if (selectedFilesArray.length > 0) {
    selectedFilesContainer.classList.remove("d-none");
  } else {
    selectedFilesContainer.classList.add("d-none");
    return;
  }

  selectedFilesList.innerHTML = "";

  selectedFilesArray.forEach((file, index) => {
    const fileItem = document.createElement("div");
    fileItem.className = "file-item";
    fileItem.innerHTML = `
      <span class="file-name">${file.name}</span>
      <button type="button" class="remove-file" data-index="${index}" title="${gettext("Remove file")}">
        <span class="material-symbols-outlined">close</span>
      </button>
    `;

    const removeBtn = fileItem.querySelector(".remove-file");
    removeBtn.addEventListener("click", () => removeFileFromSelection(index));

    selectedFilesList.appendChild(fileItem);
  });
}

function removeFileFromSelection(indexToRemove) {
  if (indexToRemove < 0 || indexToRemove >= selectedFilesArray.length) return;

  // Remove the file from our array
  selectedFilesArray.splice(indexToRemove, 1);

  // Create a new DataTransfer object to update the file input
  const dataTransfer = new DataTransfer();
  selectedFilesArray.forEach((file) => {
    dataTransfer.items.add(file);
  });

  // Update the file input with the new file list
  fileInput.files = dataTransfer.files;

  // Refresh the display and sync the title input
  displaySelectedFiles();
  syncFileTitleAndInput();
}

// ================ Tags ================
// Add a tag by name: look up its ID, store ID, and display name.
function addTagToMediaList(name) {
  if (!name) return;
  const tagObj = modalTags.find((t) => t.name === name);
  if (!tagObj) return;
  const idStr = String(tagObj.id);
  if (currentMediaTags.has(idStr)) return;
  currentMediaTags.add(idStr);
  addTagToDisplay(tagsContainer, tagObj.name, removeTagFromMedia);
}
// Remove a tag by name: find its ID, remove ID, refresh display and dropdown.
function removeTagFromMedia(name) {
  const tagObj = modalTags.find((t) => t.name === name);
  if (!tagObj) return;
  currentMediaTags.delete(String(tagObj.id));
  // Uncheck in dropdown if present
  const tagsSelectEl = document.querySelector("#mediaEditTagsSelect");
  if (tagsSelectEl) {
    const cbElem = tagsSelectEl.querySelector(`input[value="${tagObj.id}"]`);
    if (cbElem) cbElem.checked = false;
  }
  refreshTagListDisplay();
}
// Redisplay tagsContainer based on currentMediaTags IDs.
function refreshTagListDisplay() {
  tagsContainer.innerHTML = "";
  currentMediaTags.forEach((idStr) => {
    const tagObj = modalTags.find((t) => String(t.id) === idStr);
    if (tagObj) addTagToDisplay(tagsContainer, tagObj.name, removeTagFromMedia);
  });
}

// ========= HELPERS ==================

function getFilters() {
  const branches = getSelectedExtensions(mediaOwnerEl);
  const categories = getSelectedExtensions(mediaCategoryEl);

  // Get selected file extensions from the UI
  const selectedExtensions = getSelectedExtensions(extensionSelectEl).map(
    (value) => value.toLowerCase(),
  );

  // Handle file types based on user selections
  let file_types = [];

  if (selectedExtensions.length > 0) {
    // If user has selected specific extensions, use ONLY those
    // and ignore the initial filters
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

    file_types = selectedExtensions.map((ext) => extensionMap[ext] || ext);
  } else if (
    currentInitialFilters.file_types &&
    currentInitialFilters.file_types.length > 0
  ) {
    // If no extensions are selected, fall back to the initial filters
    // Map initial filters to backend enum casing where necessary
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

    file_types = currentInitialFilters.file_types.map((t) => {
      const lower = String(t).toLowerCase();
      return extensionMap[lower] || t;
    });
  }

  // Get selected tag IDs from dropdown
  const tags = getSelectedExtensions(
    document.querySelector("#media-filter-tags-wrapper"),
  );
  const title = titleInput.value.trim();

  // Create a new filter object without file_types first
  const filters = { categories, branches, tags, title };

  // Only add file_types if we have some to filter by
  if (file_types.length > 0) {
    filters.file_types = file_types;
  }

  return filters;
}

function extractExtensionFromFile(fileString, returnPrefix = false) {
  const lastDotIndex = fileString.lastIndexOf(".");
  if (lastDotIndex === -1) return returnPrefix ? fileString : ""; // Handle files without extension
  if (returnPrefix) {
    return fileString.substring(0, lastDotIndex);
  } else {
    return fileString.substring(lastDotIndex);
  }
}

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
      // Extract the filename without the file extension
      submitMediaForm.title.value = extractExtensionFromFile(fileName, true);
      // But still show the extension as "ghost text"
      fileExtensionDisplay.innerHTML = extractExtensionFromFile(fileName);
    }
  } else {
    submitMediaForm.title.value = "";
    fileExtensionDisplay.innerHTML = "";
  }
}

// Sync selected checkboxes in submit modal to currentMediaTags
function updateSelectedMediaTags() {
  currentMediaTags.clear();
  const tagsSelectEl = document.querySelector("#mediaEditTagsSelect");
  if (!tagsSelectEl) return;
  tagsSelectEl
    .querySelectorAll('input[type="checkbox"]:checked:not(#toggleAll)')
    .forEach((cb) => {
      currentMediaTags.add(cb.value);
    });
  refreshTagListDisplay();
}

// =========== EVENT LISTENERS SETUP ==============

function initEventListeners() {
  try {
    if (!mediaListModalEl || !submitMediaModalEl) return;
    const uploadBtn = document.querySelector("#uploadNewMediaBtn");

    if (uploadBtn) {
      uploadBtn.addEventListener("click", () => {
        currentlyEditingMedia = null;
        if (fileInput) fileInput.accept = currentAcceptString;
        createOrUpdateMediaClicked();
      });
    }

    submitMediaForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      submitMediaUpdate(e);
    });

    if (deleteMediaBtn) {
      deleteMediaBtn.addEventListener("click", deleteMediaClicked);
    }

    fileInput?.addEventListener("change", (_e) => {
      syncFileTitleAndInput();
      displaySelectedFiles();
    });

    // // Background Pattern Toggle Buttons
    // const lightPatternBtn = document.getElementById("lightPattern");
    // const darkPatternBtn = document.getElementById("darkPattern");

    // if (lightPatternBtn && darkPatternBtn && imageGrid) {
    //   lightPatternBtn.addEventListener("change", () => {
    //     if (lightPatternBtn.checked) {
    //       imageGrid.classList.remove("checkerboard-dark");
    //       imageGrid.classList.add("checkerboard-light");
    //     }
    //   });

    //   darkPatternBtn.addEventListener("change", () => {
    //     if (darkPatternBtn.checked) {
    //       imageGrid.classList.remove("checkerboard-light");
    //       imageGrid.classList.add("checkerboard-dark");
    //     }
    //   });
    // }

    // Background Pattern on Media preview (in mediaGrid and media_preview_modal) Toggle Buttons
    const lightPatternBtn = document.querySelectorAll(".pattern-light-btn");
    const darkPatternBtn = document.querySelectorAll(".pattern-dark-btn");

    lightPatternBtn?.forEach((btn) => {
      btn.addEventListener("change", () => {
        if (btn.checked) {
          imageGrid?.classList.remove("checkerboard-dark");
          imageGrid?.classList.add("checkerboard-light");
          previewContainer?.classList.remove("checkerboard-dark");
          previewContainer?.classList.add("checkerboard-light");

          // Make every lightPattern button be checked
          lightPatternBtn.forEach((b) => (b.checked = true));
        }
      });
    });
    
    darkPatternBtn?.forEach((btn)=>{
      btn.addEventListener("change", () => {
        if (btn.checked) {
          imageGrid?.classList.remove("checkerboard-light");
          imageGrid?.classList.add("checkerboard-dark");
          previewContainer?.classList.remove("checkerboard-light");
          previewContainer?.classList.add("checkerboard-dark");
      
          // Make every darkPattern button be checked
          darkPatternBtn.forEach((b) => (b.checked = true));
        }
      });
    });

    // Filter Collapse Toggle
    const collapseEl = document.getElementById("filterCollapse");
    const iconEl = document.getElementById("filterToggleIcon");
    const textEl = document.getElementById("filterToggleText");
    if (collapseEl && iconEl && textEl) {
      collapseEl.addEventListener("show.bs.collapse", () => {
        iconEl.textContent = "expand_less";
        textEl.textContent = gettext("Hide Filters");
      });
      collapseEl.addEventListener("hide.bs.collapse", () => {
        iconEl.textContent = "expand_more";
        textEl.textContent = gettext("Show Filters");
      });
    }

    // Filter Inputs
    if (titleInput) {
      titleInput.addEventListener("input", updateFilteringDebounce);
    }

    // Tag Input Suggestions
    const tagMappings = [
      {
        inputField: tagInput,
        containerId: "tagSuggestionsSubmit",
      },
    ];

    tagMappings.forEach((tagMapping) => {
      if (tagMapping.inputField) {
        tagMapping.inputField.addEventListener("input", (e) => {
          // Get the DOM element instead of using the string ID
          const containerElement = document.getElementById(
            tagMapping.containerId,
          );
          if (containerElement) {
            tagSearch(
              e.target.value,
              containerElement,
              tagMapping.inputField,
              () => {
                addTagToMediaList(tagInput.value);
                tagInput.focus();
                tagInput.select();
              },
            );
          } else {
            console.warn(
              `Tag suggestion container #${tagMapping.containerId} not found`,
            );
          }
        });
        tagMapping.inputField.addEventListener("focusin", (e) => {
          // Get the DOM element instead of using the string ID
          const containerElement = document.getElementById(
            tagMapping.containerId,
          );
          if (containerElement) {
            tagSearch(
              e.target.value,
              containerElement,
              tagMapping.inputField,
              () => {
                addTagToMediaList(tagInput.value);
                tagInput.focus();
                tagInput.select();
              },
            );
          }
        });
        tagMapping.inputField.addEventListener("focusout", (_e) => {
          // Delay hiding suggestions to allow click event on suggestion item
          setTimeout(() => {
            const containerElement = document.getElementById(
              tagMapping.containerId,
            );
            if (containerElement) {
              containerElement.classList.add("d-none");
            }
          }, 150);
        });
      }
    });
  } catch (e) {
    console.warn("initEventListeners error:", e);
  }
}

// Check if media type has changed between calls
function hasMediaTypeChanged(newFilters) {
  // If we have file type filters in both current and new filters, check if they've changed
  if (currentInitialFilters.file_types && newFilters.file_types) {
    // If arrays have different lengths, they're different
    if (
      currentInitialFilters.file_types.length !== newFilters.file_types.length
    ) {
      return true;
    }

    // Compare file types - checking if they're different sets
    const currentTypes = new Set(
      currentInitialFilters.file_types.map((type) => type.toLowerCase()),
    );
    const newTypes = new Set(
      newFilters.file_types.map((type) => type.toLowerCase()),
    );

    // Check if every type in currentTypes exists in newTypes and vice versa
    for (const type of currentTypes) {
      if (!newTypes.has(type)) return true;
    }

    for (const type of newTypes) {
      if (!currentTypes.has(type)) return true;
    }

    return false; // Same file types
  }

  // If one has file types and the other doesn't, they're different
  return !!currentInitialFilters.file_types !== !!newFilters.file_types;
}

// Reset all filter UI elements and internal state
function resetAllFilters() {
  // Clear search input
  if (titleInput) titleInput.value = "";

  // Clear tag filters
  currentFilterTags.clear();
  const tagFilterWrapper = document.querySelector("#tag-filter-wrapper");
  if (tagFilterWrapper) tagFilterWrapper.innerHTML = "";

  // Reset all checkboxes in file extension dropdown
  resetCheckboxGroup(extensionSelectEl);

  // Reset all checkboxes in categories dropdown
  resetCheckboxGroup(mediaCategoryEl);

  // Reset all checkboxes in uploader dropdown
  resetCheckboxGroup(mediaOwnerEl);
}

// Helper to reset all checkboxes in a dropdown group
function resetCheckboxGroup(containerEl) {
  if (!containerEl) return;

  const checkboxes = containerEl.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach((checkbox) => {
    checkbox.checked = false;
  });
}
