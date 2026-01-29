// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

import { store } from "./slideStore.js";
import { gettext } from "../../../../utils/locales.js";
import { queryParams } from "../../../../utils/utils.js";

const FILTER_EVENT = "os:templateFiltersChanged";
const DEFAULT_SORT_KEY = "name:asc";
const TAG_SORT_KEY = "tags";
const CATEGORY_SORT_KEY = "category";
const NAME_SORT_KEY = "name";
const CREATED_SORT_KEY = "created";
const UPDATED_SORT_KEY = "updated";

const filterState = {
  search: "",
  categories: new Set(),
  tags: new Set(),
  aspectRatios: new Set(),
  sortKey: DEFAULT_SORT_KEY,
};

/** @type {HTMLElement | null} */
let filterPanel;
let isInitialized = false;

/** @type {HTMLInputElement | null} */
let searchInput;
/** @type {Element | null} */
let filterPopoverContent;
/** @type {Element | null} */
let sortDropdown;
/** @type {Element | null} */
let resetBtn;
/** @type {Element | null} */
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
 * @typedef {Object} ComponentOptions
 * @property {string} Component.id
 * @property {string} [Component.classNames]
 * @property {string} Component.content
 */

/**
 * @description
 * Creates a popover that is compatible with the popover API.
 * @param {ComponentOptions} triggerOptions
 * @param {ComponentOptions} popoverOptions
 * @returns A trigger element for the popover as well as the popover itself
 */
function createPopover(triggerOptions, popoverOptions) {
  const trigger = document.createElement("button");
  trigger.id = triggerOptions.id;
  trigger.classList.add("btn");
  if (triggerOptions.classNames) {
    trigger.classList.add(...triggerOptions.classNames.split(" "));
  }
  trigger.setAttribute("popovertarget", popoverOptions.id);
  trigger.innerHTML = triggerOptions.content;

  const popover = document.createElement("div");
  popover.id = popoverOptions.id;
  popover.setAttribute("popover", "auto");
  if (popoverOptions.classNames) {
    popover.classList.add(...popoverOptions.classNames.split(" "));
  }
  popover.innerHTML = popoverOptions.content;

  return { trigger, popover };
}

/**
 * @description
 * Creates a bootstrap collapse element
 * @param {ComponentOptions} triggerOptions
 * @param {ComponentOptions} contentOptions
 * @returns A trigger for the collapse element as well as the collapse element itself
 */
function createCollapse(triggerOptions, contentOptions) {
  const collapseOpendIcon =
    "<i class='material-symbols-outlined'>keyboard_arrow_up</i>";
  const collapseClosedIcon =
    "<i class='material-symbols-outlined'>keyboard_arrow_down</i>";
  let isCollapseOpen = true;

  const collapseTrigger = document.createElement("button");
  collapseTrigger.id = triggerOptions.id;
  collapseTrigger.type = "button";
  collapseTrigger.classList.add(
    "btn",
    "btn-sm",
    "w-100",
    "d-flex",
    "justify-content-between",
  );
  if (triggerOptions.classNames) {
    collapseTrigger.classList.add(triggerOptions.classNames);
  }
  collapseTrigger.setAttribute("data-bs-toggle", "collapse");
  collapseTrigger.setAttribute("data-bs-target", `#${contentOptions.id}`);
  collapseTrigger.setAttribute("aria-expanded", contentOptions.id);
  collapseTrigger.setAttribute("aria-control", contentOptions.id);
  collapseTrigger.innerHTML = triggerOptions.content + collapseOpendIcon;

  const collapseContent = document.createElement("div");
  collapseContent.id = contentOptions.id;
  collapseContent.classList.add("collapse", "show");
  if (contentOptions.classNames) {
    collapseContent.classList.add(contentOptions.classNames);
  }
  collapseContent.innerHTML = contentOptions.content;

  /** @type {(content: string) => void} */
  const setButtonContent = (icon) => {
    collapseTrigger.innerHTML = `
    ${triggerOptions.content}
    ${icon}
  `;
  };

  const setTextFolded = () => setButtonContent(collapseClosedIcon);
  const setTextExpanded = () => setButtonContent(collapseOpendIcon);

  collapseTrigger.addEventListener("click", () => {
    isCollapseOpen = !isCollapseOpen;
    if (isCollapseOpen) {
      setTextExpanded();
    } else {
      setTextFolded();
    }
  });

  return { trigger: collapseTrigger, content: collapseContent };
}

/**
 * @description
 * Creates an html string for a filter option
 * @param {string} itemID - Id of the checkbox element
 * @param {string} filterID - Id of the filter inside of the filterState
 * @param {string} labelText - The label text value
 * @param {string} checked - The checkbox indicator for being checked
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

  let sortByDate = false;
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

    if (column === CREATED_SORT_KEY) {
      sortByDate = true;
      return slide.created_at || "";
    }

    if (column === UPDATED_SORT_KEY) {
      sortByDate = true;
      return slide.updated_at || "";
    }
    return slide.name || "";
  };

  return [...list].sort((a, b) => {
    const aVal = resolveValue(a);
    const bVal = resolveValue(b);

    if (typeof aVal === "number" && typeof bVal === "number") {
      return (aVal - bVal) * multiplier;
    }

    if (sortByDate) {
      // when the multiplier is 1 (asc) it returns the smallest number, the past, and vice versa
      // this is the opposite behaviour of what is expected so the multiplier is reversed on the line below
      return (new Date(aVal) - new Date(bVal)) * -multiplier;
    }

    return collator.compare(String(aVal), String(bVal)) * multiplier;
  });
}

export function updateTemplateSlideCount() {
  const templateCount = filterPanel?.querySelector(
    "#templateFilterPanelSlideCount",
  );

  if (templateCount) {
    templateCount.textContent = `${store.slides.length} ${gettext("Templates").toLowerCase()}`;
  }
}

function renderFilterPanel() {
  const categoriesLabel = gettext("Categories");
  const tagsLabel = gettext("Tags");
  const aspectLabel = gettext("Aspect Ratio");
  const searchLabel = gettext("Search templates");
  const resetLabel = gettext("Reset Filters");

  const categoryCollapse = createCollapse(
    {
      id: "templateFilterCategoryToggle",
      classNames: "template-filter-panel__toggle",
      content: categoriesLabel,
    },
    {
      id: "templateCategoryCollapse",
      content:
        "<div id='templateCategoryOptions' class='template-filter-panel__options'></div>",
    },
  );

  const tagCollapse = createCollapse(
    {
      id: "templateFilterTagToggle",
      classNames: "template-filter-panel__toggle",
      content: tagsLabel,
    },
    {
      id: "templateTagCollapse",
      content:
        "<div id='templateTagOptions' class='template-filter-panel__options'></div>",
    },
  );

  const aspectCollapse = createCollapse(
    {
      id: "templateFilterAspectToggle",
      classNames: "template-filter-panel__toggle",
      content: aspectLabel,
    },
    {
      id: "templateAspectCollapse",
      content:
        "<div id='templateAspectOptions' class='template-filter-panel__options'></div>",
    },
  );

  filterPanel.innerHTML = `
    <div class="template-filter-panel__wrapper">
      <div id="templateFilterPanelFilterContainer">
        <div id="templateFilterPanelSearchContainer">
          <input type="search" class="form-control rounded-pill" id="templateFilterSearch" placeholder="${searchLabel}">

          <span id="templateFilterSearchIcon" class="material-symbols-outlined">search</span>
        </div>
      </div>

      <div id="templateFilterChips" class="template-filter-panel__chips-container template-filter-panel__row">
      </div>

      <div class="template-filter-panel__row-between align-items-center">
        <p id="templateFilterPanelSlideCount"></p>

        <div class="dropdown" id="templateFilterSort" data-selected-value="${NAME_SORT_KEY}:asc">
          <button class="btn btn-sm text-black dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
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
            <li><button class="dropdown-item" type="button" data-value="${CREATED_SORT_KEY}:asc">${gettext("Created (Newest)")}</button></li>
            <li><button class="dropdown-item" type="button" data-value="${CREATED_SORT_KEY}:desc">${gettext("Created (Oldest)")}</button></li>
            <li><button class="dropdown-item" type="button" data-value="${UPDATED_SORT_KEY}:asc">${gettext("Updated (Newest)")}</button></li>
            <li><button class="dropdown-item" type="button" data-value="${UPDATED_SORT_KEY}:desc">${gettext("Updated (Oldest)")}</button></li>
          </ul>
        </div>
      </div>
    </div>
  `;

  const popover = createPopover(
    {
      id: "templateFilterPopoverBtn",
      classNames:
        "btn btn-sm d-flex align-items-center row-gap-1 text-black template-filter-panel__popover-trigger",
      content: `
        <i class="material-symbols-outlined">tune</i>
        ${gettext("Filters")}
      `,
    },
    {
      id: "templateFilterPopoverContent",
      classNames: "template-filter-panel__popover-content",
      content: `
        <div class="d-flex justify-content-end">
          <button class="btn btn-sm btn-link template-filter-panel__reset" type="button" id="templateFilterReset">${resetLabel}</button>
        </div>
      `,
    },
  );

  const searchFilterContainer = filterPanel.querySelector(
    "#templateFilterPanelFilterContainer",
  );
  searchFilterContainer.appendChild(popover.trigger);
  searchFilterContainer.appendChild(popover.popover);

  const popoverContent = filterPanel?.querySelector(
    "#templateFilterPopoverContent",
  );
  const resetBtn = popoverContent?.firstChild;

  if (popoverContent && resetBtn) {
    popoverContent.insertBefore(categoryCollapse.trigger, resetBtn);
    popoverContent.insertBefore(categoryCollapse.content, resetBtn);

    popoverContent.insertBefore(tagCollapse.trigger, resetBtn);
    popoverContent.insertBefore(tagCollapse.content, resetBtn);

    popoverContent.insertBefore(aspectCollapse.trigger, resetBtn);
    popoverContent.insertBefore(aspectCollapse.content, resetBtn);
  }

  updateTemplateSlideCount();
}

function cacheDomReferences() {
  searchInput = filterPanel.querySelector("#templateFilterSearch");
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
    return;
  }

  chips.forEach((chip) => chipsContainer.appendChild(chip));

  const btn = document.createElement("btn");
  btn.id = "templateFilterPanelChipReset";
  btn.classList.add(
    "btn",
    "btn-link",
    "template-filter-panel__reset",
    "m-0",
    "p-0",
  );
  btn.textContent = gettext("Clear all");
  btn.addEventListener("click", resetTemplateFilters);

  chipsContainer.appendChild(btn);
}

function createChip(label, value, type) {
  const sanitizedLabel = label ?? "";
  const chip = document.createElement("button");
  chip.type = "button";
  chip.classList.add("template-filter-chip");
  chip.setAttribute("data-filter-chip", type);
  chip.setAttribute("data-filter-value", value);

  chip.innerHTML = `
    <i class="material-symbols-outlined icon-16">close</i>
    ${sanitizedLabel}
  `;

  return chip;
}

function syncInputsWithState() {
  if (searchInput) {
    searchInput.value = filterState.search;
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
