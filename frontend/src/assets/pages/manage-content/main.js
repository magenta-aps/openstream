// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import * as bootstrap from "bootstrap";
import "./style.scss";
import {
  makeActiveInNav,
  autoHyphenate,
  createMiniSearchInstance,
  queryParams,
  searchItems,
  token,
  selectedBranchID,
  showToast,
  parentOrgID,
  genericFetch,
  initOrgQueryParams,
  updateNavbarBranchName,
  updateNavbarUsername,
  initSignOutButton,
  setupDeleteConfirmation,
  selectedSubOrgID,
} from "../../utils/utils";

updateNavbarUsername();
updateNavbarBranchName();

import { BASE_URL } from "../../utils/constants";

import {
  translateHTML,
  fetchUserLangugage,
  gettext,
} from "../../utils/locales";

// Initialize translations
(async () => {
  await fetchUserLangugage();
  translateHTML();
})();

makeActiveInNav("/manage-content");

// Global data
let allSlideshows = [];
let categoriesList = [];
let tagsList = [];

let sortBy = "name";
let sortDir = "asc";

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function getAspectRatioInfo(slideshow) {
  const width = slideshow.previewWidth || slideshow.preview_width || 0;
  const height = slideshow.previewHeight || slideshow.preview_height || 0;
  const widthInt = parseInt(width, 10);
  const heightInt = parseInt(height, 10);
  if (widthInt > 0 && heightInt > 0) {
    const divisor = gcd(widthInt, heightInt);
    return {
      ratioText: `${widthInt / divisor}:${heightInt / divisor}`,
      pixelText: `${widthInt}x${heightInt}`,
    };
  }
  if (slideshow.aspect_ratio) {
    return {
      ratioText: slideshow.aspect_ratio,
      pixelText: slideshow.aspect_ratio,
    };
  }
  return null;
}

function normalizeSearchTerm(rawValue) {
  if (!rawValue) {
    return "";
  }
  return rawValue.toString().trim();
}

function reorderSlideshowsByQuery(slideshows, query) {
  if (!query) {
    return slideshows;
  }

  const reorderedByAspect = reorderSlideshowsByAspectRatio(slideshows, query);
  return reorderedByAspect ?? slideshows;
}

function reorderSlideshowsByAspectRatio(slideshows, query) {
  const ratioMatch = query.match(/^(\d+)\s*:\s*(\d+)$/);
  if (!ratioMatch) {
    return null;
  }

  const queryWidth = parseInt(ratioMatch[1], 10);
  const queryHeight = parseInt(ratioMatch[2], 10);
  if (!queryWidth || !queryHeight) {
    return null;
  }

  const exactMatches = [];
  const flippedMatches = [];
  const remainder = [];

  slideshows.forEach((slideshow) => {
    const aspectInfo = getAspectRatioInfo(slideshow);
    if (!aspectInfo?.ratioText) {
      remainder.push(slideshow);
      return;
    }

    const ratioParts = aspectInfo.ratioText
      .split(":")
      .map((part) => parseInt(part, 10));
    if (ratioParts.length !== 2 || ratioParts.some((part) => Number.isNaN(part))) {
      remainder.push(slideshow);
      return;
    }

    const [ratioWidth, ratioHeight] = ratioParts;
    if (ratioWidth === queryWidth && ratioHeight === queryHeight) {
      exactMatches.push(slideshow);
    } else if (ratioWidth === queryHeight && ratioHeight === queryWidth) {
      flippedMatches.push(slideshow);
    } else {
      remainder.push(slideshow);
    }
  });

  if (exactMatches.length === 0 && flippedMatches.length === 0) {
    return null;
  }

  return [...exactMatches, ...flippedMatches, ...remainder];
}

function customSlideshowExtractField(document, fieldName) {
  switch (fieldName) {
    case "tags": {
      const tags = Array.isArray(document.tags) ? document.tags : [];
      return tags.map((tag) => tag.name);
    }
    case "category": {
      if (document.category?.name) {
        return document.category.name;
      }
      return [gettext("(None)"), "(None)"];
    }
    case "mode": {
      if (!document.mode) {
        return "";
      }
      const translatedMode =
        document.mode === "interactive"
          ? gettext("Interactive")
          : gettext("Slideshow");
      return [document.mode, translatedMode];
    }
    case "aspect_ratio": {
      const aspectInfo = getAspectRatioInfo(document);
      if (!aspectInfo) {
        return "";
      }
      const tokens = [aspectInfo.ratioText];
      if (
        aspectInfo.pixelText &&
        aspectInfo.pixelText !== aspectInfo.ratioText
      ) {
        tokens.push(aspectInfo.pixelText);
      }
      return tokens;
    }
    default:
      return document[fieldName];
  }
}

const miniSearchSlideshows = createMiniSearchInstance(
  ["name", "mode", "category", "tags", "aspect_ratio"],
  {
    extractField: customSlideshowExtractField,
  },
);
const miniSearchTags = createMiniSearchInstance(["name"]);

let searchQuery = "";
let rawSearchQuery = "";
let selectedCategoryIds = new Set();
let selectedModes = new Set(["slideshow", "interactive"]);

const searchInput = document.getElementById("searchInput");
const relevantResultsFirst = document.getElementById("orderByMatching");
const slideshowsTableBody = document
  .getElementById("manage-content-table")
  .getElementsByTagName("tbody")[0];
const emptyListAlert = document.getElementById("emptyListAlert");

const categoriesFilterContainer = document.getElementById(
  "categoriesFilterContainer",
);
const modesFilterContainer = document.getElementById("modesFilterContainer");

const deleteModalEl = document.getElementById("deleteConfirmModal");
const deleteModal = new bootstrap.Modal(deleteModalEl);

let slideshowIdToDelete = null;

const createSlideshowButton = document.getElementById(
  "create-slideshow-button",
);

const thName = document.getElementById("th-name");
const thMode = document.getElementById("th-mode");
const thCategory = document.getElementById("th-category");
const thTags = document.getElementById("th-tags");
const thAspect = document.getElementById("th-aspect");

const sortIndicatorName = document.getElementById("sortIndicatorName");
const sortIndicatorMode = document.getElementById("sortIndicatorMode");
const sortIndicatorCategory = document.getElementById("sortIndicatorCategory");
const sortIndicatorTags = document.getElementById("sortIndicatorTags");
const sortIndicatorAspect = document.getElementById("sortIndicatorAspect");

const categoryModalEl = document.getElementById("categoryModal");
const categoryModal = new bootstrap.Modal(categoryModalEl);
const categoryForm = document.getElementById("categoryForm");
const categorySelect = document.getElementById("categorySelect");

const tagsModalEl = document.getElementById("tagsModal");
const tagsModal = new bootstrap.Modal(tagsModalEl);
const tagsForm = document.getElementById("tagsForm");

const tagsCheckboxContainer = document.getElementById("tagsCheckboxContainer");
let currentlyEditingTagIds = [];
let currentlyEditingSlideshowId = null;

/* =============================================================================
   1) Initialization: fetch data, set up event listeners
============================================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  initOrgQueryParams();
  initSignOutButton();
  categoriesList = await fetchCategories();
  await fetchTags();
  await fetchAllSlideshows();

  renderSidebarFilters();
  applySearchFilterSort();

  searchInput.addEventListener("input", (e) => {
    rawSearchQuery = normalizeSearchTerm(e.target.value);
    searchQuery = rawSearchQuery.toLowerCase();
    applySearchFilterSort();
  });

  relevantResultsFirst.addEventListener("input", applySearchFilterSort);

  thName.addEventListener("click", () => handleSortClick("name"));
  thMode.addEventListener("click", () => handleSortClick("mode"));
  thCategory.addEventListener("click", () => handleSortClick("category"));
  thTags.addEventListener("click", () => handleSortClick("tags"));
  thAspect?.addEventListener("click", () => handleSortClick("aspect_ratio"));

  const createSlideshowModalEl = document.getElementById(
    "createSlideshowModal",
  );
  const createSlideshowModal = new bootstrap.Modal(createSlideshowModalEl);
  const createSlideshowForm = document.getElementById("createSlideshowForm");

  const createSlideshowName = document.getElementById("createSlideshowName");
  const createSlideshowMode = document.getElementById("createSlideshowMode");
  const createSlideshowCategory = document.getElementById(
    "createSlideshowCategory",
  );
  const createSlideshowTagsContainer = document.getElementById(
    "createSlideshowTagsContainer",
  );

  // Initialize aspect ratio selection
  let selectedAspectRatio = null;
  initializeAspectRatioSelection();

  createSlideshowMode.addEventListener("input", (e) => {
    document
      .querySelector("#mode-explanation-wrapper")
      ?.classList.toggle("d-none", e.target.value === "slideshow");
  });

  createSlideshowButton.addEventListener("click", () => {
    openCreateSlideshowModal();
  });

  function openCreateSlideshowModal() {
    {
      createSlideshowName.value = "";
      createSlideshowMode.value = "slideshow";

      // Reset aspect ratio selection - default to 16:9
      resetAspectRatioSelection();
      const defaultOption = document.querySelector(
        '.create-resolution-option[data-ratio="16:9"]',
      );
      if (defaultOption) {
        defaultOption.classList.add("active");
        selectedAspectRatio = {
          width: parseInt(defaultOption.getAttribute("data-width")),
          height: parseInt(defaultOption.getAttribute("data-height")),
          ratio: defaultOption.getAttribute("data-ratio"),
        };
      }

      createSlideshowCategory.innerHTML = "";
      const noneOpt = document.createElement("option");
      noneOpt.value = "";
      noneOpt.textContent = gettext("(No Category)");
      createSlideshowCategory.appendChild(noneOpt);

      categoriesList.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat.id;
        opt.textContent = cat.name;
        createSlideshowCategory.appendChild(opt);
      });

      createSlideshowTagsContainer.innerHTML = "";
      tagsList.forEach((tag) => {
        const div = document.createElement("div");
        div.className = "form-check mb-1";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "form-check-input";
        input.id = `createTag_${tag.id}`;
        input.value = tag.id;

        const label = document.createElement("label");
        label.className = "form-check-label ms-2";
        label.htmlFor = input.id;
        label.textContent = tag.name;

        div.appendChild(input);
        div.appendChild(label);
        createSlideshowTagsContainer.appendChild(div);
      });

      createSlideshowModal.show();
    }
  }

  if (queryParams.createSlideshow === "true") {
    openCreateSlideshowModal();
  }

  function initializeAspectRatioSelection() {
    const aspectRatioOptions = document.querySelectorAll(
      ".create-resolution-option",
    );

    aspectRatioOptions.forEach((option) => {
      option.addEventListener("click", () => {
        // Remove active class from all options
        aspectRatioOptions.forEach((opt) => opt.classList.remove("active"));

        // Add active class to clicked option
        option.classList.add("active");

        // Store selected aspect ratio
        selectedAspectRatio = {
          width: parseInt(option.getAttribute("data-width")),
          height: parseInt(option.getAttribute("data-height")),
          ratio: option.getAttribute("data-ratio"),
        };
      });
    });
  }

  function resetAspectRatioSelection() {
    document.querySelectorAll(".create-resolution-option").forEach((opt) => {
      opt.classList.remove("active");
    });
    selectedAspectRatio = null;
  }

  categoryForm.addEventListener("submit", handleCategoryFormSubmit);
  tagsForm.addEventListener("submit", handleTagsFormSubmit);

  const slideshowCreatedModalEl = document.getElementById(
    "slideshowCreatedModal",
  );
  const slideshowCreatedModal = new bootstrap.Modal(slideshowCreatedModalEl);

  const slideshowCreatedNameSpan = document.getElementById(
    "slideshowCreatedNameSpan",
  );
  const openSlideshowBtn = document.getElementById("openSlideshowBtn");

  createSlideshowForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = createSlideshowName.value.trim();
    const mode = createSlideshowMode.value;

    const categoryValue = createSlideshowCategory.value;
    const category_id = categoryValue ? parseInt(categoryValue, 10) : null;

    const tag_ids = [];
    const tagCheckboxes = createSlideshowTagsContainer.querySelectorAll(
      "input[type='checkbox']",
    );
    tagCheckboxes.forEach((cb) => {
      if (cb.checked) {
        tag_ids.push(parseInt(cb.value, 10));
      }
    });

    if (!name) {
      showToast(gettext("Please provide a slideshow name."), "Info");
      return;
    }

    if (!selectedAspectRatio) {
      showToast(gettext("Please select an aspect ratio."), "Info");
      return;
    }

    const bodyData = {
      name,
      mode,
      previewWidth: selectedAspectRatio.width,
      previewHeight: selectedAspectRatio.height,
    };
    if (category_id) {
      bodyData.category_id = category_id;
    }
    if (tag_ids.length > 0) {
      bodyData.tag_ids = tag_ids;
    }

    try {
      const res = await fetch(
        `${BASE_URL}/api/manage_content/?branch_id=${selectedBranchID}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(bodyData),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(gettext("Failed to create slideshow."));
      }

      showToast(gettext("Slideshow created!"), "Success");

      createSlideshowModal.hide();

      await fetchAllSlideshows();
      applySearchFilterSort();

      slideshowCreatedNameSpan.textContent = data.name;

      slideshowCreatedModal.show();

      openSlideshowBtn.onclick = () => {
        window.location.href = `/edit-content?id=${data.id}&mode=edit&orgId=${parentOrgID}&suborgId=${selectedSubOrgID}&branchId=${selectedBranchID}`;
      };
    } catch (err) {
      console.error(err);
      showToast(gettext(err.message), "Error");
    }
  });
  initOrgQueryParams();
});

async function fetchCategories() {
  return await genericFetch(
    `${BASE_URL}/api/categories/?organisation_id=${parentOrgID}`,
  );
}
async function fetchTags() {
  tagsList = await genericFetch(
    `${BASE_URL}/api/tags/?organisation_id=${parentOrgID}`,
  );
  miniSearchTags.removeAll();
  miniSearchTags.addAll(tagsList);
}

async function fetchAllSlideshows() {
  const result = await genericFetch(
    `${BASE_URL}/api/manage_content/?includeSlideshowData=false&branch_id=${selectedBranchID}`,
  );
  allSlideshows = result;
  miniSearchSlideshows.removeAll();
  miniSearchSlideshows.addAll(allSlideshows);
}

function renderSidebarFilters() {
  categoriesFilterContainer.innerHTML = "";
  categoriesList.forEach((cat) => {
    const div = document.createElement("div");
    div.className = "form-check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "form-check-input";
    input.id = `categoryFilter_${cat.id}`;
    input.value = cat.id;
    if (selectedCategoryIds.has(cat.id)) {
      input.checked = true;
    }
    input.addEventListener("change", () => {
      const val = parseInt(input.value, 10);
      if (input.checked) selectedCategoryIds.add(val);
      else selectedCategoryIds.delete(val);
      applySearchFilterSort();
    });

    const label = document.createElement("label");
    label.className = "form-check-label ms-1";
    label.htmlFor = input.id;
    label.textContent = cat.name;

    div.appendChild(input);
    div.appendChild(label);
    categoriesFilterContainer.appendChild(div);
  });

  modesFilterContainer.innerHTML = "";
  ["slideshow", "interactive"].forEach((m) => {
    const div = document.createElement("div");
    div.className = "form-check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "form-check-input";
    input.id = `modeFilter_${m}`;
    input.value = m;
    if (selectedModes.has(m)) {
      input.checked = true;
    }
    input.addEventListener("change", () => {
      if (input.checked) selectedModes.add(m);
      else selectedModes.delete(m);
      applySearchFilterSort();
    });

    const label = document.createElement("label");
    label.className = "form-check-label ms-1";
    label.htmlFor = input.id;
    label.textContent =
      m === "slideshow" ? gettext("Slideshow") : gettext("Interactive");

    div.appendChild(input);
    div.appendChild(label);
    modesFilterContainer.appendChild(div);
  });
}

function handleSortClick(columnKey) {
  if (sortBy === columnKey) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortBy = columnKey;
    sortDir = "asc";
  }
  applySearchFilterSort();
}

function applySearchFilterSort() {
  let searched = searchItems(searchQuery, allSlideshows, miniSearchSlideshows);
  let filtered = searched.filter((ss) => {
    if (selectedCategoryIds.size > 0) {
      const catId = ss.category?.id;
      if (!catId || !selectedCategoryIds.has(catId)) {
        return false;
      }
    }

    return selectedModes.has(ss.mode);
  });

  const skipSorting = Boolean(relevantResultsFirst.checked && rawSearchQuery);
  if (skipSorting) {
    filtered = reorderSlideshowsByQuery(filtered, rawSearchQuery);
  } else {
    filtered.sort((a, b) => {
      let valA;
      let valB;
      if (sortBy === "tags") {
        const aCount = a.tags?.length || 0;
        const bCount = b.tags?.length || 0;
        if (aCount !== bCount) {
          valA = aCount;
          valB = bCount;
        } else {
          valA = a.tags?.map((t) => t.name.toLowerCase()).join(",") || "";
          valB = b.tags?.map((t) => t.name.toLowerCase()).join(",") || "";
        }
      } else if (sortBy === "category") {
        valA = a.category?.name?.toLowerCase() || "";
        valB = b.category?.name?.toLowerCase() || "";
      } else if (sortBy === "aspect_ratio") {
        // We want a stable sort by numeric ratio (width/height) if available, otherwise fallback to string
        const aW = a.previewWidth || a.preview_width || 0;
        const aH = a.previewHeight || a.preview_height || 0;
        const bW = b.previewWidth || b.preview_width || 0;
        const bH = b.previewHeight || b.preview_height || 0;
        const aRatio = aW && aH ? aW / aH : 0;
        const bRatio = bW && bH ? bW / bH : 0;
        valA = String(aRatio).toLowerCase();
        valB = String(bRatio).toLowerCase();
      } else {
        valA = a[sortBy]?.toLowerCase() || "";
        valB = b[sortBy]?.toLowerCase() || "";
      }

      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  renderSlideshowsTable(filtered);
  updateSortIndicators(skipSorting);
}

function updateSortIndicators(onlyReset) {
  const indicators = [
    sortIndicatorName,
    sortIndicatorMode,
    sortIndicatorCategory,
    sortIndicatorTags,
    sortIndicatorAspect,
  ];
  indicators.forEach((entry) => (entry.textContent = ""));

  let indicatorEl;
  if (!onlyReset) {
    if (sortBy === "name") indicatorEl = sortIndicatorName;
    else if (sortBy === "mode") indicatorEl = sortIndicatorMode;
    else if (sortBy === "category") indicatorEl = sortIndicatorCategory;
    else if (sortBy === "tags") indicatorEl = sortIndicatorTags;
  }
  indicators.forEach((entry) => {
    if (entry === indicatorEl) {
      entry.textContent = sortDir === "asc" ? "arrow_upward" : "arrow_downward";
    } else {
      entry.textContent = "unfold_more";
    }
  });
}

function displayTagsFirst3(tagsArray) {
  if (!tagsArray || tagsArray.length === 0) {
    return "";
  }
  if (tagsArray.length <= 3) {
    return tagsArray.map((t) => t.name).join(", ");
  }
  const firstThree = tagsArray
    .slice(0, 3)
    .map((t) => t.name)
    .join(", ");
  const remainder = tagsArray.length - 3;
  return `${firstThree} ${gettext("and")} ${remainder} ${gettext("more")}`;
}

function renderSlideshowsTable(slideshows) {
  slideshowsTableBody.innerHTML = "";
  if (!slideshows || slideshows.length === 0) {
    emptyListAlert.classList.remove("d-none");
    emptyListAlert.textContent =
      allSlideshows.length > 0
        ? gettext("No matching content found")
        : gettext(
            "No content found. Use the 'Add Content' button to the left",
          );
    return;
  }
  emptyListAlert.classList.add("d-none");
  slideshows.forEach((ss) => {
    const row = slideshowsTableBody.insertRow();

    const nameCell = row.insertCell();
    nameCell.innerHTML = `
      <span>${autoHyphenate(ss.name)}</span>
      <i class="material-symbols-outlined ms-1"
         style="cursor:pointer;" title="${gettext("Edit Name")}">
        edit
      </i>`;
    nameCell
      .querySelector("i")
      .addEventListener("click", () => renameSlideshow(ss.id, ss.name));

    const modeCell = row.insertCell();
    modeCell.insertAdjacentHTML(
      "beforeend",
      `<div>${
        ss.mode === "interactive"
          ? gettext("Interactive")
          : gettext("Slideshow")
      }</div>`,
    );

    const catCell = row.insertCell();
    const catName = ss.category ? ss.category.name : gettext("(None)");
    catCell.innerHTML = `
      <span>${catName}</span>
      <i class="material-symbols-outlined ms-1"
         style="cursor:pointer;" title="${gettext("Edit Category")}">
        edit
      </i>
    `;
    catCell
      .querySelector("i")
      .addEventListener("click", () => showCategoryModal(ss.id, ss.category));

    const tagsCell = row.insertCell();
    const shortTagsStr = displayTagsFirst3(ss.tags || []);
    tagsCell.innerHTML = `
      <span>${shortTagsStr}</span>
      <i class="material-symbols-outlined ms-1"
         style="cursor:pointer;" title="${gettext("Edit Tags")}">
        edit
      </i>
    `;
    tagsCell
      .querySelector("i")
      .addEventListener("click", () => showTagsModal(ss.id, ss.tags));

    const aspectCell = row.insertCell();
    const aspectInfo = getAspectRatioInfo(ss);
    const aspectDisplay = aspectInfo?.ratioText || "-";
    aspectCell.innerHTML = `<div>${aspectDisplay}</div>`;

    const actionsCell = row.insertCell();
    const openBtn = document.createElement("a");
    openBtn.className = "btn btn-primary btn-sm me-2 px-3";
    openBtn.innerHTML = gettext(`Open`);
    openBtn.href = `/edit-content?id=${ss.id}&mode=edit`;
    actionsCell.appendChild(openBtn);
    const duplicateBtn = document.createElement("button");
    duplicateBtn.className = "btn btn-secondary btn-sm me-2";
    duplicateBtn.innerHTML = `<i class="material-symbols-outlined">file_copy</i> ${gettext("Duplicate")}`;
    duplicateBtn.addEventListener("click", () => duplicateSlideshow(ss.id));
    actionsCell.appendChild(duplicateBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-secondary btn-sm";
    deleteBtn.innerHTML = `<i class="material-symbols-outlined" style="color: var(--error-red)">delete</i> ${gettext(
      "Delete",
    )}`;
    deleteBtn.addEventListener("click", () => {
      openDeleteSlideshowModal(ss.id, ss.name);
    });
    actionsCell.appendChild(deleteBtn);
  });
}

async function duplicateSlideshow(id) {
  try {
    const slideshowData = await genericFetch(
      `${BASE_URL}/api/manage_content/?branch_id=${selectedBranchID}&id=${id}&organisation_id=${parentOrgID}`,
    );

    slideshowData.name = slideshowData.name + ` (${gettext("Copy")})`;
    delete slideshowData.id;

    delete slideshowData.branch;
    delete slideshowData.created_by;

    await genericFetch(
      `${BASE_URL}/api/manage_content/?branch_id=${selectedBranchID}`,
      "POST",
      JSON.stringify(slideshowData),
    );
    showToast(gettext("Slideshow duplicated!"), "Success");

    await fetchAllSlideshows();
    applySearchFilterSort();
  } catch (err) {
    console.error(err);
    showToast(gettext(err.message), "Error");
  }
}

let currentlyRenamingSlideshowId = null;
let currentNameForRename = "";
const renameModalEl = document.getElementById("renameModal");
const renameModal = new bootstrap.Modal(renameModalEl);
const renameForm = document.getElementById("renameForm");
const renameInput = document.getElementById("renameInput");

function renameSlideshow(id, currentName) {
  currentlyRenamingSlideshowId = id;
  currentNameForRename = currentName;
  renameInput.value = currentName;
  renameModal.show();
}

renameForm.addEventListener("submit", function (e) {
  e.preventDefault();
  const newName = renameInput.value.trim();
  if (!newName || newName === currentNameForRename) {
    renameModal.hide();
    return;
  }
  patchSlideshow(currentlyRenamingSlideshowId, { name: newName });
  renameModal.hide();
});

window.openDeleteSlideshowModal = (id, name) => {
  slideshowIdToDelete = id;
  document.getElementById("slideshowToDeleteName").textContent = name;

  // Set up confirmation text for typing validation
  const requiredText = `Delete slideshow ${name}`;

  // Use the utility function for delete confirmation setup
  setupDeleteConfirmation(
    "deleteSlideshowInput",
    "confirmDeleteSlideshowButton",
    "deleteSlideshowError",
    "deleteSlideshowTextToType",
    requiredText,
  );

  // Store slideshow info
  document.getElementById("deleteSlideshowId").value = id;
  document.getElementById("deleteSlideshowName").value = name;

  deleteModal.show();
};

async function handleDeleteSlideshowConfirm() {
  if (!slideshowIdToDelete) return;
  try {
    await genericFetch(
      `${BASE_URL}/api/manage_content/${slideshowIdToDelete}/?branch_id=${selectedBranchID}`,
      "DELETE",
    );
    showToast(gettext("Slideshow deleted!"), "Success");
    slideshowIdToDelete = null;
    deleteModal.hide();

    await fetchAllSlideshows();
    applySearchFilterSort();
  } catch (err) {
    console.error(err);
    showToast(gettext(err.message), "Error");
  }
}

async function patchSlideshow(id, partialData) {
  try {
    await genericFetch(
      `${BASE_URL}/api/manage_content/${id}/?branch_id=${selectedBranchID}`,
      "PATCH",
      JSON.stringify(partialData),
    );
    showToast(gettext("Updated slideshow!"), "Success");
    await fetchAllSlideshows();
    applySearchFilterSort();
  } catch (err) {
    console.error(err);

    showToast(gettext(err.message || err.detail), "Error");
  }
}

function showCategoryModal(slideshowId, categoryObj) {
  currentlyEditingSlideshowId = slideshowId;

  categorySelect.innerHTML = "";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.text = gettext("(No Category)");
  categorySelect.appendChild(noneOpt);

  categoriesList.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.text = cat.name;
    categorySelect.appendChild(opt);
  });

  if (categoryObj) {
    categorySelect.value = categoryObj.id;
  } else {
    categorySelect.value = "";
  }
  categoryModal.show();
}

function handleCategoryFormSubmit(e) {
  e.preventDefault();
  if (!currentlyEditingSlideshowId) return;

  let category_id = null;
  if (categorySelect.value) {
    category_id = parseInt(categorySelect.value, 10);
  }
  categoryModal.hide();
  patchSlideshow(currentlyEditingSlideshowId, { category_id });
}

function showTagsModal(slideshowId, tagsArr) {
  currentlyEditingSlideshowId = slideshowId;
  if (tagsArr && tagsArr.length > 0) {
    currentlyEditingTagIds = tagsArr.map((t) => t.id);
  } else {
    currentlyEditingTagIds = [];
  }

  renderTagsCheckboxList("");
  tagsModal.show();
}

function createAlertElement(alertText) {
  return `<div class="alert alert-primary text-center mx-0" role="alert">
           ${gettext(alertText)}
     </div>`;
}

function renderTagsCheckboxList(searchTerm) {
  tagsCheckboxContainer.innerHTML = "";

  let filtered = tagsList;
  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    filtered = tagsList.filter((tag) => tag.name.toLowerCase().includes(lower));
  }

  if (filtered.length === 0 || tagsList.length === 0) {
    tagsCheckboxContainer.classList.remove("border");
    tagsCheckboxContainer.insertAdjacentHTML(
      "beforeend",
      createAlertElement(
        tagsList.length === 0
          ? gettext("No tags found")
          : gettext("No matching tags"),
      ),
    );
    return;
  }
  tagsCheckboxContainer.classList.add("border");

  filtered.forEach((tag) => {
    const div = document.createElement("div");
    div.className = "form-check mb-1";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "form-check-input";
    input.id = `tag_${tag.id}`;
    input.value = tag.id;
    if (currentlyEditingTagIds.includes(tag.id)) {
      input.checked = true;
    }

    const label = document.createElement("label");
    label.className = "form-check-label ms-2";
    label.htmlFor = input.id;
    label.textContent = tag.name;

    input.addEventListener("change", () => {
      const val = parseInt(input.value, 10);
      if (input.checked) {
        if (!currentlyEditingTagIds.includes(val)) {
          currentlyEditingTagIds.push(val);
        }
      } else {
        currentlyEditingTagIds = currentlyEditingTagIds.filter(
          (x) => x !== val,
        );
      }
    });

    div.appendChild(input);
    div.appendChild(label);
    tagsCheckboxContainer.appendChild(div);
  });
}

function handleTagsFormSubmit(e) {
  e.preventDefault();
  if (!currentlyEditingSlideshowId) return;
  tagsModal.hide();
  patchSlideshow(currentlyEditingSlideshowId, {
    tag_ids: currentlyEditingTagIds,
  });
}

document
  .getElementById("confirmDeleteSlideshowButton")
  .addEventListener("click", async () => {
    if (!slideshowIdToDelete) return;

    try {
      await genericFetch(
        `${BASE_URL}/api/manage_content/${slideshowIdToDelete}/?branch_id=${selectedBranchID}`,
        "DELETE",
      );
      showToast(gettext("Slideshow deleted!"), "Success");
      slideshowIdToDelete = null;
      deleteModal.hide();

      await fetchAllSlideshows();
      applySearchFilterSort();
    } catch (err) {
      console.error(err);
      showToast(gettext(err.message), "Error");
    }
  });
