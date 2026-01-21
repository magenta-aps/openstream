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
let searchInput;
let clearSearchBtn;
let filterPopoverContent;
let sortDropdown;
let resetBtn;
let chipsContainer;

/**
 * @typedef {Map<string, {name: string, count: number }>} FilterOptionMap
 */

/** @type {FilterOptionMap} */
let availableCategories = new Map();
/** @type {FilterOptionMap} */
let availableTags = new Map();
/** @type {FilterOptionMap} */
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
    content: content,
    sanitize: false,
    template: `
      <div class="popover" role="tooltip" style="width: 15.5rem;">
        <div class="popover-body">
        </div>
      </div>
    `,
    offset: [0, 0],
  });
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
      accordion.removeChild(existingItem);
    }
    const item = document.createElement("div");
    item.classList.add("accordion-item");
    item.id = itemID;

    const itemBodyID = `${itemID}-body`;
    item.innerHTML = `
      <h2 class="accordion-header">
        <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#${itemBodyID}" aria-expanded="true" aria-controls="${itemBodyID}">
          ${headerText}
        </button>
      </h2>
      <div id="${itemBodyID}" class="accordion-collapse collapse show" ${forceOpen ? "" : "data-bs-parent='#" + item.id + "'"}>
        <div class="accordion-body">
          ${body}
        </div>
      </div>
    `;

    accordion.appendChild(item);
  };
}

/**
 * @description
 * Creates a bootstrap collapse element
 * @param {Object} triggerOptions
 * @param {string} triggerOptions.label
 * @param {Object} contentOptions
 * @param {string} contentOptions.id
 * @param {string} contentOptions.content
 */
function createCollapse(triggerOptions, contentOptions) {
  const triggerContainer = document.createElement("p");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.classList.add(
    "btn",
    "w-100",
    "d-flex",
    "justify-content-between",
    "p-0",
  );
  trigger.setAttribute("data-bs-toggle", "collapse");
  trigger.setAttribute("data-bs-target", `#${contentOptions.id}`);
  trigger.setAttribute("aria-expanded", "true");
  trigger.setAttribute("aria-controls", contentOptions.id);

  const isCollapseOpen = false;

  const setTextFolded = () =>
    (trigger.innerHTML = `
    ${triggerOptions.label}
    <i class="material-symbols-outlined">keyboard_arrow_up</i>
  `);
  const setTextExpanded = () =>
    (trigger.innerHTML = `
    ${triggerOptions.label}
    <i class="material-symbols-outlined">keyboard_arrow_down</i>
  `);
  setTextFolded();

  trigger.addEventListener("click", () => {
    isCollapseOpen = !isCollapseOpen;
    if (isCollapseOpen) {
      setTextExpanded();
    } else {
      setTextFolded();
    }
  });

  triggerContainer.appendChild(trigger);

  const collapseContent = document.createElement("div");
  collapseContent.id = contentOptions.id;
  collapseContent.classList.add("collapse", "show");
  collapseContent.innerHTML = contentOptions.content;

  return { triggerContainer, collapseContent };
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
    </div>`;
}

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

  /** @type {FilterOptionMap} */
  const categoriesMap = new Map();
  /** @type {FilterOptionMap} */
  const tagsMap = new Map();
  /** @type {FilterOptionMap} */
  const aspectMap = new Map();

  store.slides.forEach((slide) => {
    if (slide.categoryId && slide.categoryName) {
      const categoryID = String(slide.categoryId);

      let category = categoriesMap.get(categoryID);
      if (category) {
        category.count += 1;
      } else {
        category = { name: slide.categoryName, count: 1 };
      }

      categoriesMap.set(categoryID, category);
    }

    if (Array.isArray(slide.tagIds)) {
      slide.tagIds.forEach((tagId, idx) => {
        const stringId = String(tagId);
        let tagLabel = null;
        if (Array.isArray(slide.tagNames) && slide.tagNames[idx]) {
          tagLabel = slide.tagNames[idx];
        }

        let tag = tagsMap.get(stringId);
        if (tag) {
          tag.count += 1;
        } else if (tagLabel) {
          tag = { name: tagLabel, count: 1 };
        }

        tagsMap.set(stringId, tag);
      });
    }

    if (typeof slide.aspect_ratio === "string" && slide.aspect_ratio) {
      let aspectRatio = aspectMap.get(slide.aspect_ratio);
      if (aspectRatio) {
        aspectRatio.count += 1;
      } else {
        aspectRatio = { name: slide.aspect_ratio, count: 1 };
      }

      aspectMap.set(slide.aspect_ratio, aspectRatio);
    }
  });

  availableCategories = categoriesMap;
  availableTags = tagsMap;
  availableAspectRatios = aspectMap;

  renderFilterOptions();
  updateChips();
  updateResetButtonState();
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

export function updateTemplateSlideCount() {
  if (filterPanel) {
    const templateCount = filterPanel.querySelector(
      "#templateFilterPanelSlideCount",
    );
    templateCount.textContent = `${store.slides.length} ${gettext("Templates")}`;
  }
}

function renderFilterPanel() {
  const categoriesLabel = gettext("Categories");
  const tagsLabel = gettext("Tags");
  const aspectLabel = gettext("Aspect ratios");
  const searchLabel = gettext("Search templates");
  const orderByLabel = gettext("Order by");
  const resetLabel = gettext("Reset filters");

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

        <button id="templateFilterPopoverBtn" class="btn btn-sm d-flex align-items-center row-gap-1 template-filter-panel__popover-trigger" popovertarget="templateFilterPopoverContent">
          <i class="material-symbols-outlined">tune</i>
          ${gettext("Filters")}
        </button>

        <div id="templateFilterPopoverContent" class="template-filter-panel__popover-content" popover>
          <button class="btn btn-sm w-100 template-filter-panel__toggle" type="button" data-bs-toggle="collapse" data-bs-target="#templateCategoryCollapse" id="templateFilterCategoryToggle" aria-expanded="true">
            <span>${categoriesLabel}</span>
            <span class="material-symbols-outlined">expand_more</span>
          </button>
          <div id="templateCategoryCollapse" class="collapse show">
            <div id="templateCategoryOptions" class="template-filter-options">
            </div>
          </div>

          <button class="btn btn-sm w-100 template-filter-panel__toggle" type="button" data-bs-toggle="collapse" data-bs-target="#templateTagCollapse" id="templateFilterTagToggle" aria-expanded="true">
            <span>${tagsLabel}</span>
            <span class="material-symbols-outlined">expand_more</span>
          </button>
          <div id="templateTagCollapse" class="collapse show">
            <div id="templateTagOptions" class="template-filter-options">
            </div>
          </div>

          <button class="btn btn-sm w-100 template-filter-panel__toggle" type="button" data-bs-toggle="collapse" data-bs-target="#templateAspectCollapse" id="templateFilterAspectToggle" aria-expanded="true">
            <span>${aspectLabel}</span>
            <span class="material-symbols-outlined">expand_more</span>
          </button>
          <div id="templateAspectCollapse" class="collapse show">
            <div id="templateAspectOptions" class="template-filter-options">
            </div>
          </div>


          <div class="d-flex justify-content-end">
            <button class="btn btn-sm btn-link template-filter-panel__reset" type="button" id="templateFilterReset">${resetLabel}</button>
          </div>
        </div>
      </div>

      <div id="templateFilterChips" class="template-filter-panel__chips-container template-filter-panel__row">
      </div>

      <div class="template-filter-panel__row align-items-center">
        <span id="templateFilterPanelSlideCount"></span>

        <div class="dropdown" id="templateFilterSort" data-selected-value="${NAME_SORT_KEY}:asc">
          <button class="btn btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="material-symbols-outlined">sort</i>
            ${gettext("Name (A-Z)")}
          </button>

          <ul class="dropdown-menu">
            <li><button class="dropdown-item" type="button" data-value="${NAME_SORT_KEY}:asc">${gettext("Name (A-Z)")}</button></li>
            <li><button class="dropdown-item" type="button" data-value="${NAME_SORT_KEY}:desc">${gettext("Name (Z-A)")}</button></li>
            <li><button class="dropdown-item" type="button" data-value="${CATEGORY_SORT_KEY}:asc">${gettext("Category (A-Z)")}</button></li>
            <li><button class="dropdown-item" type="button" data-value="${CATEGORY_SORT_KEY}:desc">${gettext("Category (Z-A)")}</button></li>
            <li><button class="dropdown-item" type="button" data-value="${TAG_SORT_KEY}:asc">${gettext("Tag (A-Z)")}</button></li>
            <li><button class="dropdown-item" type="button" data-value="${TAG_SORT_KEY}:desc">${gettext("Tag (Z-A)")}</button></li>
          </ul>
        </div>
      </div>
    </div>
  `;
  updateTemplateSlideCount();
}

function cacheDomReferences() {
  searchInput = filterPanel.querySelector("#templateFilterSearch");
  clearSearchBtn = filterPanel.querySelector("#templateFilterSearchClear");
  filterPopoverContent = filterPanel.querySelector(
    "#templateFilterPopoverContent",
  );
  sortDropdown = filterPanel.querySelector("#templateFilterSort");
  chipsContainer = filterPanel.querySelector("#templateFilterChips");
  resetBtn = filterPanel.querySelector("#templateFilterReset");
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

  if (filterPopoverContent) {
    [
      { id: "#templateCategoryCollapse", type: "category" },
      { id: "#templateTagCollapse", type: "tag" },
      { id: "#templateAspectCollapse", type: "aspect-ratio" },
    ].forEach((filterType) => {
      filterPopoverContent
        .querySelector(filterType.id)
        .addEventListener("change", (event) =>
          handleFilterChange(filterType.type, event),
        );
    });
  }

  if (sortDropdown) {
    sortDropdown.querySelectorAll(".dropdown-item").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        const selectedValue = event.target.getAttribute("data-value");
        sortDropdown.setAttribute("data-selected-value", selectedValue);

        sortDropdown.querySelector(".dropdown-toggle").innerHTML =
          `<i class="material-symbols-outlined">sort</i>${event.target.textContent}`;

        filterState.sortKey = selectedValue;
        emitFilterChange();
      });
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", resetTemplateFilters);
  }

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
 * @description
 * handles filter changes for category, tags and aspect ratio
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
    const checkbox = document.getElementById(
      `template-filter-category-${filterValue}`,
    );
    if (checkbox) {
      checkbox.checked = false;
    }
  } else if (filterType === "tag" && filterValue) {
    filterState.tags.delete(filterValue);
    const checkbox = document.getElementById(
      `template-filter-tag-${filterValue}`,
    );
    if (checkbox) {
      checkbox.checked = false;
    }
  } else if (filterType === "aspect" && filterValue) {
    filterState.aspectRatios.delete(filterValue);
    const checkbox = document.getElementById(
      `template-filter-aspect-${escapeForSelector(filterValue)}`,
    );
    if (checkbox) {
      checkbox.checked = false;
    }
  }

  emitFilterChange();
}

function renderFilterOptions() {
  const existingCategoryCollapse = document.getElementById(
    "templateCategoryOptions",
  );
  const existingTagCollapse = document.getElementById("templateTagOptions");
  const existingAspectRatioCollapse = document.getElementById(
    "templateAspectOptions",
  );
  const existingElements =
    existingCategoryCollapse &&
    existingTagCollapse &&
    existingAspectRatioCollapse;

  if (!existingElements) {
    return;
  }

  const filterTypes = [
    {
      state: filterState.categories,
      parentID: "templateCategoryOptions",
      title: gettext("Category"),
      idPrefix: "template-filter-category",
      filters: availableCategories,
      noneAvailableName: "No categories available yet.",
    },
    {
      state: filterState.tags,
      parentID: "templateTagOptions",
      title: gettext("Tags"),
      idPrefix: "template-filter-tag",
      filters: availableTags,
      noneAvailableName: "No tags available yet.",
    },
    {
      state: filterState.aspectRatios,
      parentID: "templateAspectOptions",
      title: gettext("Aspect Ratio"),
      idPrefix: "template-filter-aspect",
      filters: availableAspectRatios,
      noneAvailableName: "No aspect ratios detected.",
    },
  ].map((type) => ({
    ...type,
    filters: Array.from(type.filters.entries()).sort(([a, b]) => {
      return a[0].localeCompare(b.name[0], undefined, { sensitivity: "base" });
    }),
  }));

  const filterOptions = filterTypes.map((type) => {
    const option = {
      parentID: type.parentID,
      title: type.title,
    };
    if (type.filters.length === 0) {
      return {
        ...option,
        body: `<p class="text-muted small mb-0">${gettext(type.noneAvailableName)}</p>`,
      };
    }

    return {
      ...option,
      body:
        type.filters.length === 0
          ? noFiltersAvailable
          : type.filters
              .map(([id, data]) => {
                const checkboxId = `${type.idPrefix}-${type.idPrefix !== "template-filter-aspect" ? id : escapeForSelector(id)}`;
                const checked = type.state.has(id) ? "checked" : "";
                return createFilterItem(
                  checkboxId,
                  id,
                  `${data.name} (${data.count})`,
                  checked,
                );
              })
              .join(""),
    };
  });

  filterOptions.forEach((filter) => {
    if (existingCategoryCollapse.id === filter.parentID) {
      existingCategoryCollapse.innerHTML = filter.body;
    } else if (existingTagCollapse.id === filter.parentID) {
      existingTagCollapse.innerHTML = filter.body;
    } else if (existingAspectRatioCollapse.id === filter.parentID) {
      existingAspectRatioCollapse.innerHTML = filter.body;
    }
  });
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
    const category = availableCategories.get(categoryId) || gettext("Category");
    chips.push(createChip(category.name, categoryId, "category"));
  });

  filterState.tags.forEach((tagId) => {
    const tag = availableTags.get(tagId) || gettext("Tag");
    chips.push(createChip(tag.name, tagId, "tag"));
  });

  filterState.aspectRatios.forEach((ratio) => {
    chips.push(createChip(ratio, ratio, "aspect"));
  });

  // reset from previous content
  chipsContainer.innerHTML = "";

  if (!chips.length) {
    /*
    chipsContainer.innerHTML = `<p class="text-muted small mb-0">${gettext(
      "No filters applied",
    )}</p>`;
    */
    return;
  }

  chips.forEach((chip) => chipsContainer.appendChild(chip));

  const btn = document.createElement("btn");
  btn.classList.add(
    "btn",
    "btn-sm",
    "btn-link",
    "template-filter-Panel__reset",
  );
  btn.textContent = gettext("Remove Chips");
  btn.addEventListener("click", resetTemplateFilters);

  chipsContainer.appendChild(btn);
}

function createChip(label, value, type) {
  const sanitizedLabel = label ?? "";
  const chip = document.createElement("span");
  chip.classList.add("badge", "template-filter-chip");
  chip.innerHTML = `
      ${sanitizedLabel}
      <button type="button" class="btn-close btn-close-white" aria-label="${gettext(
        "Remove filter",
      )}" data-filter-chip="${type}" data-filter-value="${value}"></button>
  `;

  return chip;
}

function syncInputsWithState() {
  if (searchInput) {
    searchInput.value = filterState.search;
  }
  if (clearSearchBtn) {
    clearSearchBtn.classList.toggle("d-none", filterState.search === "");
  }
  if (sortDropdown) {
    sortDropdown.setAttribute("data-selected-value", filterState.sortKey);
    const selectedName =
      sortDropdown.querySelector(
        `.dropdown-item[data-value="${filterState.sortKey}"`,
      )?.textContent ?? gettext("Name (A-Z)");
    sortDropdown.querySelector(".dropdown-toggle").innerHTML =
      `<i class="material-symbols-outlined">sort</i>${selectedName}`;
  }
  syncCheckboxSelections();
  updateResetButtonState();
}

function syncCheckboxSelections() {
  const filters = [
    { id: "templateCategoryCollapse", state: filterState.categories },
    { id: "templateTagCollapse", state: filterState.tags },
    {
      id: "templateAspectCollapse",
      state: filterState.aspectRatios,
    },
  ];

  filters.forEach((filter) => {
    filterPopoverContent
      .querySelectorAll(`#${filter.id} input[type='checkbox']`)
      .forEach((input) => {
        input.checked = filter.state.has(input.value);
      });
  });
}

function updateResetButtonState() {
  if (!resetBtn) {
    return;
  }
  resetBtn.disabled = !hasActiveTemplateFilters();
}

function emitFilterChange() {
  updateChips();
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
