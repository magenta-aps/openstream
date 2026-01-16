// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

import * as bootstrap from "bootstrap";
import { store } from "./slideStore.js";
import { gettext } from "../../../../utils/locales.js";
import { queryParams } from "../../../../utils/utils.js";

const FILTER_EVENT = "os:templateFiltersChanged";
const DEFAULT_SORT_KEY = "name:asc";
const TAG_SORT_KEY = "tags";
const CATEGORY_SORT_KEY = "category";
const NAME_SORT_KEY = "name";

const filterState = {
  search: "",
  categories: new Set(),
  tags: new Set(),
  aspectRatios: new Set(),
  sortKey: DEFAULT_SORT_KEY,
};

let filterPanel;
let isInitialized = false;
let filterOptionsRoot = createAccordion("templateFilterOptions", true);
let categoryOptionsRoot;
let tagOptionsRoot;
let aspectOptionsRoot;
let searchInput;
let clearSearchBtn;
let filterPopoverBtn;
let filterPopoverAPI;
let filterPopoverContent;
let sortSelect;
let resetBtn;
let chipsContainer;
let categoryToggleBtn;
let tagToggleBtn;
let aspectToggleBtn;

let availableCategories = new Map();
let availableTags = new Map();
let availableAspectRatios = new Map();

/**
 * @description
 * Creates a Bootstrap popover instance.
 * @param triggerID - The id of the element that will trigger the popover
 * @param content - The html content to display inside the popover
 */
function createPopover(triggerID, content) {
  return new bootstrap.Popover(document.querySelector(`#${triggerID}`), {
    html: true,
    content: () => content.innerHTML,
    sanitize: false,
    template: `
      <div class="popover" role="tooltip" style="width: 15.5rem;">
        <div class="popover-body">
        </div>
      </div>
    `,
    offset: [0, 0]
  })
}

/**
 * @description
 * Creates a bootstrap accordion element
 * @param {string} parentID - The id of the root element
 * @param {boolean} forceOpen - Determines if the accordions can be remain open independent of one another
 * @returns The accordion element node and a item appender fn
 */
function createAccordion(parentID, forceOpen) {
  const accordion = document.createElement("div");
  accordion.id = parentID;
  accordion.classList.add("accordion");

  const addAccordionItem = createAccordionItemAppender(accordion, forceOpen);

  return { accordion, addAccordionItem };
}

/**
* @description
* Creates a accordion item appender
* @param {HTMLElement} accordion - The root element
* @param {boolean} forceOpen - Determines if the accordions can be remain open independent of one another
* @returns A function that will append a new accordion item to the root element
*/
function createAccordionItemAppender(accordion, forceOpen) {
  /**
  * @description
  * Adds a new item to the accordion returned from createAccordion
  * @param {string} itemID - The id of this item
  * @param {string} headerText - The header text
  * @param {string} body - The item body
  * @param {boolean} forceOpen - Determines if the accordions can be remain open independent of one another
  * @returns A function that will append a new accordion item to the root element
  */
  return (itemID, headerText, body, forceOpen) => {
    const existingItem = accordion.querySelector(`#${itemID}`);
    if (existingItem) {
      console.log(existingItem)
      accordion.removeChild(existingItem);
    }
    const item = document.createElement("div");
      item.classList.add("accordion-item");

      item.innerHTML = `
        <h2 class="accordion-header">
          <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#${itemID}" aria-expanded="true" aria-controls="${itemID}">
            ${headerText}
          </button>
        </h2>
        <div id="${itemID}" class="accordion-collapse collapse show" ${forceOpen ? "" : "data-bs-parent='#" + parentID + "'"}>
          <div class="accordion-body">
            ${body}
          </div>
        </div>
      `;

      accordion.appendChild(item);
  }
}

/**
 * @description
 * Creates an html string for a filter option
 * @param {string} itemID - Id of the checkbox element
 * @param {string} filterID - Id of the filter inside of the filterState
 * @param {string} labelText - The label text value
 * @param {boolean} checked - The checkbox indicator for being checked
 * @param {string} value - The checkbox value
 * @returns A bootstrap checkbox as a html string
 */
function createFilterItem(itemID, filterID, labelText, checked) {
  return `
    <div class="form-check">
      <input class="form-check-input" type="checkbox" value="${filterID}" id="${itemID}" ${checked}>
      <label class="form-check-label" for="${itemID}">${labelText}</label>
    </div>`
  };

function isTemplateMode() {
  return (
    queryParams.mode === "template_editor" ||
    queryParams.mode === "suborg_templates"
  );
}

function escapeForSelector(value) {
  const stringValue = String(value);
  const cssApi =
    typeof window !== "undefined" && window.CSS ? window.CSS : null;
  if (cssApi && typeof cssApi.escape === "function") {
    return cssApi.escape(stringValue);
  }
  return stringValue.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function isTemplateFilteringEnabled() {
  return isTemplateMode();
}

export function hasActiveTemplateFilters() {
  return (
    filterState.search.trim().length > 0 ||
    filterState.categories.size > 0 ||
    filterState.tags.size > 0 ||
    filterState.aspectRatios.size > 0
  );
}

export function resetTemplateFilters() {
  filterState.search = "";
  filterState.categories.clear();
  filterState.tags.clear();
  filterState.aspectRatios.clear();
  filterState.sortKey = DEFAULT_SORT_KEY;
  syncInputsWithState();
  emitFilterChange();
}

export function initTemplateFilterControls() {
  if (!isTemplateMode() || isInitialized) {
    return;
  }

  filterPanel = document.getElementById("templateFilterPanel");
  if (!filterPanel) {
    return;
  }

  isInitialized = true;
  renderFilterPanel();
  cacheDomReferences();
  attachEventListeners();
  filterPanel.classList.remove("d-none");
  syncInputsWithState();
  refreshTemplateFilterOptions();
}

export function refreshTemplateFilterOptions() {
  if (!isTemplateMode()) {
        return;
      }

      const categoriesMap = new Map();
      const tagsMap = new Map();
      const aspectMap = new Map();

      store.slides.forEach((slide) => {
        if (slide.categoryId && slide.categoryName) {
          categoriesMap.set(String(slide.categoryId), slide.categoryName);
        }

        if (Array.isArray(slide.tagIds)) {
          slide.tagIds.forEach((tagId, idx) => {
            const stringId = String(tagId);
            let tagLabel = null;
            if (Array.isArray(slide.tagNames) && slide.tagNames[idx]) {
              tagLabel = slide.tagNames[idx];
            }
            if (tagLabel && !tagsMap.has(stringId)) {
              tagsMap.set(stringId, tagLabel);
            }
          });
        }

        if (typeof slide.aspect_ratio === "string" && slide.aspect_ratio) {
          aspectMap.set(slide.aspect_ratio, slide.aspect_ratio);
        }
      });

      availableCategories = categoriesMap;
      availableTags = tagsMap;
      availableAspectRatios = aspectMap;

  renderCategoryOptions();
    renderTagOptions();
    renderAspectOptions();
    updateToggleLabels();
    updateChips();
    updateResetButtonState();

    if (filterPopoverContent) {
      filterPopoverContent.innerHTML = filterOptionsRoot.accordion.outerHTML;
    }
}

export function applyTemplateFilters(slidesWithIndex) {
  if (!isTemplateMode()) {
    return slidesWithIndex;
  }

  let workingList = Array.isArray(slidesWithIndex) ? [...slidesWithIndex] : [];

  const query = filterState.search.trim().toLowerCase();
  if (query) {
    workingList = workingList.filter(({ slide }) => {
      const searchable = [
        slide.name,
        slide.categoryName,
        slide.aspect_ratio,
        ...(Array.isArray(slide.tagNames) ? slide.tagNames : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(query);
    });
  }

  if (filterState.categories.size > 0) {
    workingList = workingList.filter(({ slide }) => {
      if (!slide.categoryId) {
        return false;
      }
      console.log(filterState.categories, slide.categoryId);
      return filterState.categories.has(String(slide.categoryId));
    });
  }

  if (filterState.tags.size > 0) {
    workingList = workingList.filter(({ slide }) => {
      if (!Array.isArray(slide.tagIds) || slide.tagIds.length === 0) {
        return false;
      }
      return slide.tagIds.some((tagId) => filterState.tags.has(String(tagId)));
    });
  }

  if (filterState.aspectRatios.size > 0) {
    workingList = workingList.filter(({ slide }) => {
      if (!slide.aspect_ratio) {
        return false;
      }
      return filterState.aspectRatios.has(slide.aspect_ratio);
    });
  }

  return sortWorkingList(workingList);
}

function sortWorkingList(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return list;
  }

  const [column, direction] = filterState.sortKey.split(":");
  const multiplier = direction === "desc" ? -1 : 1;
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });

  const resolveValue = (entry) => {
    const { slide } = entry;
    if (column === CATEGORY_SORT_KEY) {
      return slide.categoryName || "";
    }
    if (column === TAG_SORT_KEY) {
      if (Array.isArray(slide.tagNames) && slide.tagNames.length > 0) {
        return slide.tagNames.join(", ");
      }
      return "";
    }
    return slide.name || "";
  };

  return [...list].sort((a, b) => {
    const aVal = resolveValue(a);
    const bVal = resolveValue(b);

    if (typeof aVal === "number" && typeof bVal === "number") {
      return (aVal - bVal) * multiplier;
    }

    return collator.compare(String(aVal), String(bVal)) * multiplier;
  });
}

function renderFilterPanel() {
  const categoriesLabel = gettext("Categories");
  const tagsLabel = gettext("Tags");
  const aspectLabel = gettext("Aspect ratios");
  const searchLabel = gettext("Search templates");
  const orderByLabel = gettext("Order by");
  const resetLabel = gettext("Reset filters");


  filterPopoverBtn = document.createElement("button");
  filterPopoverBtn.id = "templateFilterPopoverBtn";
  filterPopoverBtn.classList.add("btn", "btn-sm", "d-flex", "align-items-center", "align-items-center", "row-gap-1");
  filterPopoverBtn.setAttribute("data-bs-toggle", "popover");
  filterPopoverBtn.setAttribute("data-bs-placement", "bottom");
  filterPopoverBtn.innerHTML = `<i class="material-symbols-outlined">tune</i><span>${gettext("Filters")}</span>`

  filterPopoverContent = document.createElement("div");

  filterPopoverContent.innerHTML = filterOptionsRoot.accordion.outerHTML;

  createFilterItem(
    "templateFilterTags",
    "Tags",
    [{name: "Foo"}, {name: "Bar"}, {name: "Baz"}]
  );
  createFilterItem(
    "templateFilterAspects",
    "Aspect ratios",
    [{name: "16:9"}, {name:"9:16"}, {name:"4:3"}, {name:"3:4"}]
  );

  filterPanel.innerHTML = `
    <div class="template-filter-panel__wrapper">
      <div class="template-filter-panel__row">
        <div class="form-floating flex-grow-1">
          <input type="search" class="form-control rounded-pill" id="templateFilterSearch" placeholder="${searchLabel}" />
          <label for="templateFilterSearch">
            <i class="material-symbols-outlined">search</i>
            ${searchLabel}
          </label>
          <button class="btn btn-sm btn-link text-decoration-none template-filter-panel__clear d-none" type="button" id="templateFilterSearchClear">
            ${gettext("Clear")}
          </button>
        </div>

        ${filterPopoverBtn.outerHTML}

        <!-- Removing sort temp
        <div class="form-floating template-filter-panel__sort">
          <select class="form-select" id="templateFilterSort">
            <option value="${NAME_SORT_KEY}:asc">${gettext("Name (A-Z)")}</option>
            <option value="${NAME_SORT_KEY}:desc">${gettext("Name (Z-A)")}</option>
            <option value="${CATEGORY_SORT_KEY}:asc">${gettext("Category (A-Z)")}</option>
            <option value="${CATEGORY_SORT_KEY}:desc">${gettext("Category (Z-A)")}</option>
            <option value="${TAG_SORT_KEY}:asc">${gettext("Tags (A-Z)")}</option>
            <option value="${TAG_SORT_KEY}:desc">${gettext("Tags (Z-A)")}</option>
          </select>
          <label for="templateFilterSort">${orderByLabel}</label>
        </div>
        -->
      </div>
      <!-- TODO: Remove
      <button class="btn btn-sm btn-outline-secondary w-100 template-filter-panel__toggle" type="button" data-bs-toggle="collapse" data-bs-target="#templateCategoryCollapse" id="templateFilterCategoryToggle">
        <span class="template-filter-panel__toggle-label">${categoriesLabel}</span>
        <span class="material-symbols-outlined">expand_more</span>
      </button>
      <div class="collapse show" id="templateCategoryCollapse">
        <div class="template-filter-options" id="templateFilterCategories"></div>
      </div>
      <button class="btn btn-sm btn-outline-secondary w-100 template-filter-panel__toggle" type="button" data-bs-toggle="collapse" data-bs-target="#templateTagCollapse" id="templateFilterTagToggle">
        <span class="template-filter-panel__toggle-label">${tagsLabel}</span>
        <span class="material-symbols-outlined">expand_more</span>
      </button>
      <div class="collapse" id="templateTagCollapse">
        <div class="template-filter-options" id="templateFilterTags"></div>
      </div>
      <button class="btn btn-sm btn-outline-secondary w-100 template-filter-panel__toggle" type="button" data-bs-toggle="collapse" data-bs-target="#templateAspectCollapse" id="templateFilterAspectToggle">
        <span class="template-filter-panel__toggle-label">${aspectLabel}</span>
        <span class="material-symbols-outlined">expand_more</span>
      </button>
      <div class="collapse" id="templateAspectCollapse">
        <div class="template-filter-options" id="templateFilterAspects"></div>
      </div>
      <div class="d-flex justify-content-between align-items-center gap-2 mt-2">
        <div class="template-filter-chips flex-grow-1" id="templateFilterChips"></div>
        <button class="btn btn-sm btn-link template-filter-panel__reset" type="button" id="templateFilterReset">${resetLabel}</button>
      </div>
      -->
    </div>
  `;
}

function cacheDomReferences() {
  categoryOptionsRoot = filterPanel.querySelector("#templateFilterCategories");
  tagOptionsRoot = filterPanel.querySelector("#templateFilterTags");
  aspectOptionsRoot = filterPanel.querySelector("#templateFilterAspects");
  searchInput = filterPanel.querySelector("#templateFilterSearch");
  clearSearchBtn = filterPanel.querySelector("#templateFilterSearchClear");
  filterPopoverBtn = filterPanel.querySelector("#templateFilterPopoverBtn");
  sortSelect = filterPanel.querySelector("#templateFilterSort");
  resetBtn = filterPanel.querySelector("#templateFilterReset");
  chipsContainer = filterPanel.querySelector("#templateFilterChips");
  categoryToggleBtn = filterPanel.querySelector(
    "#templateFilterCategoryToggle",
  );
  tagToggleBtn = filterPanel.querySelector("#templateFilterTagToggle");
  aspectToggleBtn = filterPanel.querySelector("#templateFilterAspectToggle");
}

function attachEventListeners() {
  if (searchInput) {
    searchInput.addEventListener("input", handleSearchInput);
  }
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      if (!searchInput) return;
      searchInput.value = "";
      filterState.search = "";
      clearSearchBtn.classList.add("d-none");
      emitFilterChange();
    });
  }

  if (filterPopoverBtn) {
    filterPopoverAPI = createPopover("templateFilterPopoverBtn",filterPopoverContent);

    filterPopoverBtn.addEventListener("click", () => {
      filterPopoverAPI.toggle();
    });

    document.addEventListener("shown.bs.popover", () => {
      document
        .querySelector("#template-filter-category-select")
        .addEventListener("change", (event) => handleFilterChange("category", event));

      document
        .querySelector("#template-filter-tag-select")
        .addEventListener("change", (event) => handleFilterChange("tag", event));

      document
        .querySelector("#template-filter-aspect-ratio-select")
        .addEventListener("change", (event) => handleFilterChange("aspect-ratio", event));
    })
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", (event) => {
      filterState.sortKey = event.target.value;
      emitFilterChange();
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", resetTemplateFilters);
  }


  /*
  if (categoryOptionsRoot) {
    categoryOptionsRoot.addEventListener("change", handleCategoryChange);
  }
  if (tagOptionsRoot) {
    tagOptionsRoot.addEventListener("change", handleTagChange);
  }
  if (aspectOptionsRoot) {
    aspectOptionsRoot.addEventListener("change", handleAspectChange);
  }
  */
  if (chipsContainer) {
    chipsContainer.addEventListener("click", handleChipInteraction);
  }
}

function handleSearchInput(event) {
  filterState.search = event.target.value;
  if (clearSearchBtn) {
    clearSearchBtn.classList.toggle("d-none", filterState.search.length === 0);
  }
  emitFilterChange();
}

/**
 *
 * @param {"category" | "tag" | "aspect-ratio"} type
 * @param {Event} event
 */
function handleFilterChange(type, event) {
  const target = event.target;
  let state;

  switch (type) {
    case "category":
      state = filterState.categories;
      break;
    case "tag":
      state = filterState.tags;
      break;
    case "aspect-ratio":
      state = filterState.aspectRatios;
      break;
  }

  if (!target || target.tagName !== "INPUT") {
      return;
    }
    const value = target.value;
    if (!value) {
      return;
    }
    if (target.checked) {
      state.add(value);
    } else {
      state.delete(value);
    }

    emitFilterChange();
}

/* TODO: Remove
function handleCategoryChange(event) {
  const target = event.target;
  if (!target || target.tagName !== "INPUT") {
    return;
  }
  const id = target.value;
  if (!id) {
    return;
  }
  if (target.checked) {
    filterState.categories.add(id);
  } else {
    filterState.categories.delete(id);
  }
  emitFilterChange();
}

function handleTagChange(event) {
  const target = event.target;
  if (!target || target.tagName !== "INPUT") {
    return;
  }
  const id = target.value;
  if (!id) {
    return;
  }
  if (target.checked) {
    filterState.tags.add(id);
  } else {
    filterState.tags.delete(id);
  }
  emitFilterChange();
}

function handleAspectChange(event) {
  const target = event.target;
  if (!target || target.tagName !== "INPUT") {
    return;
  }
  const value = target.value;
  if (!value) {
    return;
  }
  if (target.checked) {
    filterState.aspectRatios.add(value);
  } else {
    filterState.aspectRatios.delete(value);
  }
  emitFilterChange();
}
*/

function handleChipInteraction(event) {
  const button = event.target.closest("button[data-filter-chip]");
  if (!button) {
    return;
  }
  const filterType = button.getAttribute("data-filter-chip");
  const filterValue = button.getAttribute("data-filter-value");

  if (filterType === "search") {
    filterState.search = "";
    if (searchInput) {
      searchInput.value = "";
    }
  } else if (filterType === "category" && filterValue) {
    filterState.categories.delete(filterValue);
    const checkbox = filterPanel.querySelector(
      `#template-filter-category-${escapeForSelector(filterValue)}`,
    );
    if (checkbox) {
      checkbox.checked = false;
    }
  } else if (filterType === "tag" && filterValue) {
    filterState.tags.delete(filterValue);
    const checkbox = filterPanel.querySelector(
      `#template-filter-tag-${escapeForSelector(filterValue)}`,
    );
    if (checkbox) {
      checkbox.checked = false;
    }
  } else if (filterType === "aspect" && filterValue) {
    filterState.aspectRatios.delete(filterValue);
    const checkbox = filterPanel.querySelector(
      `#template-filter-aspect-${escapeForSelector(filterValue)}`,
    );
    if (checkbox) {
      checkbox.checked = false;
    }
  }

  emitFilterChange();
}

function renderCategoryOptions() {
  const entries = Array.from(availableCategories.entries()).sort((a, b) =>
    a[1].localeCompare(b[1], undefined, { sensitivity: "base" }),
  );

  /* TODO: Handle no available categories
  if (!entries.length) {
    categoryOptionsRoot.innerHTML = `<p class="text-muted small mb-0">${gettext(
      "No categories available yet.",
    )}</p>`;
    return;
  }
  */


  const categoryOptions = entries
    .map(([id, name]) => {
      const checkboxId = `template-filter-category-${id}`;
      const checked = filterState.categories.has(id) ? "checked" : "";
      return createFilterItem(
        checkboxId,
        id,
        name,
        checked
      );
    }).join("")

  filterOptionsRoot.addAccordionItem("template-filter-category-select", "Categories", categoryOptions, true);
}

function renderTagOptions() {
  const entries = Array.from(availableTags.entries()).sort((a, b) =>
    a[1].localeCompare(b[1], undefined, { sensitivity: "base" }),
  );

  /* TODO: Handle no tags availble
  if (!entries.length) {
    tagOptionsRoot.innerHTML = `<p class="text-muted small mb-0">${gettext(
      "No tags available yet.",
    )}</p>`;
    return;
  }
  */

  const tagOptions = entries
    .map(([id, name]) => {
      console.log(id);
      const checkboxId = `template-filter-tag-${id}`;
      const checked = filterState.tags.has(id) ? "checked" : "";
      return createFilterItem(
        checkboxId,
        id,
        name,
        checked
      )
    })
    .join("");

  filterOptionsRoot.addAccordionItem("template-filter-tag-select", "Tags", tagOptions, true);
}

function renderAspectOptions() {
  const entries = Array.from(availableAspectRatios.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
  );

  /* TODO: Handle no availble aspect ratios
  if (!entries.length) {
    aspectOptionsRoot.innerHTML = `<p class="text-muted small mb-0">${gettext(
      "No aspect ratios detected",
    )}</p>`;
    return;
  }
  */

  const aspectRatios = entries
    .map(([value]) => {
      const checkboxId = `template-filter-aspect-${escapeForSelector(value)}`;
      const checked = filterState.aspectRatios.has(value) ? "checked" : "";
      return createFilterItem(checkboxId, value, value, checked);
    })
    .join("");


  filterOptionsRoot.addAccordionItem("template-filter-aspect-ratio-select", "Aspect Ratios", aspectRatios, true);
}

function updateToggleLabels() {
  if (categoryToggleBtn) {
    const label = categoryToggleBtn.querySelector(
      ".template-filter-panel__toggle-label",
    );
    if (label) {
      const count = filterState.categories.size;
      label.textContent = count
        ? `${gettext("Categories")} (${count})`
        : gettext("Categories");
    }
  }
  if (tagToggleBtn) {
    const label = tagToggleBtn.querySelector(
      ".template-filter-panel__toggle-label",
    );
    if (label) {
      const count = filterState.tags.size;
      label.textContent = count
        ? `${gettext("Tags")} (${count})`
        : gettext("Tags");
    }
  }
  if (aspectToggleBtn) {
    const label = aspectToggleBtn.querySelector(
      ".template-filter-panel__toggle-label",
    );
    if (label) {
      const count = filterState.aspectRatios.size;
      label.textContent = count
        ? `${gettext("Aspect ratios")} (${count})`
        : gettext("Aspect ratios");
    }
  }
}

function updateChips() {
  if (!chipsContainer) {
    return;
  }

  const chips = [];

  if (filterState.search.trim().length > 0) {
    chips.push(createChip(gettext("Search"), filterState.search, "search"));
  }

  filterState.categories.forEach((categoryId) => {
    const label = availableCategories.get(categoryId) || gettext("Category");
    chips.push(createChip(label, categoryId, "category"));
  });

  filterState.tags.forEach((tagId) => {
    const label = availableTags.get(tagId) || gettext("Tag");
    chips.push(createChip(label, tagId, "tag"));
  });

  filterState.aspectRatios.forEach((ratio) => {
    chips.push(createChip(ratio, ratio, "aspect"));
  });

  if (!chips.length) {
    chipsContainer.innerHTML = `<p class="text-muted small mb-0">${gettext(
      "No filters applied",
    )}</p>`;
    return;
  }

  chipsContainer.innerHTML = chips.join("");
}

function createChip(label, value, type) {
  const sanitizedLabel = label ?? "";
  return `
    <span class="badge template-filter-chip">
      ${sanitizedLabel}
      <button type="button" class="btn-close btn-close-white" aria-label="${gettext(
        "Remove filter",
      )}" data-filter-chip="${type}" data-filter-value="${value}"></button>
    </span>
  `;
}

function syncInputsWithState() {
  if (searchInput) {
    searchInput.value = filterState.search;
  }
  if (clearSearchBtn) {
    clearSearchBtn.classList.toggle("d-none", filterState.search === "");
  }
  if (sortSelect) {
    sortSelect.value = filterState.sortKey;
  }
  syncCheckboxSelections();
  updateToggleLabels();
  updateResetButtonState();
}

function syncCheckboxSelections() {
  const filters = [
    { id: "template-filter-category-select", state: filterState.categories },
    { id: "template-filter-tag-select", state: filterState.tags },
    { id: "template-filter-aspect-ratio-select", state: filterState.aspectRatios },
  ];

  filters.forEach(filter => {
    filterOptionsRoot.accordion
      .querySelectorAll(`${filter.id} input[type='checkbox']`)
      .forEach((input) => {
        input.checked = state.has(input.value);
      });
  });

  /* TODO: Remove
  if (categoryOptionsRoot) {
    categoryOptionsRoot
      .querySelectorAll('input[type="checkbox"]')
      .forEach((input) => {
        input.checked = filterState.categories.has(input.value);
      });
  }
  if (tagOptionsRoot) {
    tagOptionsRoot
      .querySelectorAll('input[type="checkbox"]')
      .forEach((input) => {
        input.checked = filterState.tags.has(input.value);
      });
  }
  if (aspectOptionsRoot) {
    aspectOptionsRoot
      .querySelectorAll('input[type="checkbox"]')
      .forEach((input) => {
        input.checked = filterState.aspectRatios.has(input.value);
      });
  }
  */
}

function updateResetButtonState() {
  if (!resetBtn) {
    return;
  }
  resetBtn.disabled = !hasActiveTemplateFilters();
}

function emitFilterChange() {
  updateChips();
  updateToggleLabels();
  updateResetButtonState();
  document.dispatchEvent(
    new CustomEvent(FILTER_EVENT, {
      detail: {
        search: filterState.search,
        categories: Array.from(filterState.categories),
        tags: Array.from(filterState.tags),
        aspectRatios: Array.from(filterState.aspectRatios),
        sortKey: filterState.sortKey,
      },
    }),
  );
}
