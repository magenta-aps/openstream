// SPDX-FileCopyrightText: 2026 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

import { gettext } from "../../../../utils/locales.js";
import { loadSlide } from "../core/renderSlide.js";
import { scaleSlide } from "../core/renderSlide.js";
import * as bootstrap from "bootstrap";

/**
 * Custom field extractor for MiniSearch to handle tags and category fields
 */
export function customTagsExtractField(document, fieldName) {
  if (fieldName === "tags") {
    return (document.tags || []).map((tag) => tag.name);
  }

  if (fieldName === "category") {
    return document.category ? document.category.name : "";
  }

  if (fieldName === "aspect_ratio") {
    return document.aspect_ratio || "";
  }

  return document[fieldName];
}

/**
 * Build or rebuild the search index with templates
 */
export function buildTemplateSearchIndex(miniSearcher, templates) {
  miniSearcher.removeAll();
  if (Array.isArray(templates) && templates.length > 0) {
    miniSearcher.addAll(templates);
  }
}

/**
 * Render category filter checkboxes in the sidebar
 */
export function renderCategoryFilters(modal, templates, options = {}) {
  const {
    sidebarSelector = "#category-filter",
    checkboxClass = "unified-category-filter",
    idPrefix = "cat-",
    onChangeCallback = null,
  } = options;

  const sidebar = modal.querySelector
    ? modal.querySelector(sidebarSelector)
    : document.querySelector(sidebarSelector);

  if (!sidebar) {
    return;
  }

  const categoriesMap = new Map();
  templates.forEach((template) => {
    if (template.category) {
      categoriesMap.set(template.category.id, template.category.name);
    }
  });

  sidebar.innerHTML = "";

  if (categoriesMap.size === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "text-muted small mt-2";
    emptyState.textContent = gettext("No categories available");
    sidebar.appendChild(emptyState);
    return;
  }

  categoriesMap.forEach((name, id) => {
    const wrapper = document.createElement("div");
    wrapper.className = "form-check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = `form-check-input ${checkboxClass}`;
    input.value = id;
    input.id = `${idPrefix}${id}`;
    input.checked = false;

    const label = document.createElement("label");
    label.className = "form-check-label small";
    label.htmlFor = input.id;
    label.textContent = name;

    wrapper.appendChild(input);
    wrapper.appendChild(label);
    sidebar.appendChild(wrapper);
  });

  if (onChangeCallback) {
    const checkboxes = sidebar.querySelectorAll(`.${checkboxClass}`);
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", onChangeCallback);
    });
  }
}

/**
 * Get selected category IDs from filter checkboxes
 */
export function getSelectedCategoryFilterIds(modal, checkboxClass = "unified-category-filter") {
  const container = modal.querySelector ? modal : document;
  return Array.from(container.querySelectorAll(`.${checkboxClass}:checked`))
    .map((checkbox) => parseInt(checkbox.value, 10))
    .filter((value) => !Number.isNaN(value));
}

/**
 * Render tags filter checkboxes
 */
export function renderTagsFilters(modal, templates, options = {}) {
  const {
    containerSelector = "#tags-filter",
    checkboxClass = "unified-tag-filter",
    idPrefix = "tag-",
    onChangeCallback = null,
  } = options;

  const container = modal.querySelector
    ? modal.querySelector(containerSelector)
    : document.querySelector(containerSelector);

  if (!container) {
    return;
  }

  const tagsMap = new Map();
  templates.forEach((template) => {
    if (template.tags && Array.isArray(template.tags)) {
      template.tags.forEach((tag) => {
        const tagName = typeof tag === "string" ? tag : tag.name;
        const tagId = typeof tag === "string" ? tagName : tag.id;
        if (tagName) {
          tagsMap.set(tagId, tagName);
        }
      });
    }
  });

  container.innerHTML = "";

  if (tagsMap.size === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "text-muted small mt-2";
    emptyState.textContent = gettext("No tags available");
    container.appendChild(emptyState);
    return;
  }

  // Sort tags alphabetically by name
  const sortedTags = Array.from(tagsMap.entries()).sort((a, b) => 
    a[1].localeCompare(b[1])
  );

  sortedTags.forEach(([id, name]) => {
    const wrapper = document.createElement("div");
    wrapper.className = "form-check form-check-inline";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = `form-check-input ${checkboxClass}`;
    input.value = String(id);
    input.id = `${idPrefix}${id}`;
    input.checked = false;

    const label = document.createElement("label");
    label.className = "form-check-label small";
    label.htmlFor = input.id;
    label.textContent = name;

    wrapper.appendChild(input);
    wrapper.appendChild(label);
    container.appendChild(wrapper);
  });

  if (onChangeCallback) {
    const checkboxes = container.querySelectorAll(`.${checkboxClass}`);
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", onChangeCallback);
    });
  }
}

/**
 * Get selected tag IDs/names from filter checkboxes
 */
export function getSelectedTagFilters(modal, checkboxClass = "unified-tag-filter") {
  const container = modal.querySelector ? modal : document;
  return Array.from(container.querySelectorAll(`.${checkboxClass}:checked`)).map(
    (checkbox) => checkbox.value,
  );
}

/**
 * Render aspect ratio filter checkboxes
 */
export function renderAspectRatioFilters(modal, templates, options = {}) {
  document.getElementById("aspect-ratio-filters")?.classList.remove("d-none");
  const {
    containerSelector = "#aspect-ratio-filter",
    checkboxClass = "unified-aspect-filter",
    idPrefix = "unified-aspect-",
    onChangeCallback = null,
  } = options;

  const container = modal.querySelector
    ? modal.querySelector(containerSelector)
    : document.querySelector(containerSelector);

  if (!container) {
    return;
  }

  const ratioSet = new Set();
  templates.forEach((template) => {
    if (template.aspect_ratio) {
      ratioSet.add(template.aspect_ratio);
    }
  });

  const ratios = Array.from(ratioSet).sort((a, b) => a.localeCompare(b));

  if (!ratios.length) {
    container.innerHTML = `<p class="text-muted small mb-0">${gettext("No aspect ratios detected")}</p>`;
    return;
  }

  container.innerHTML = "";

  ratios.forEach((ratio, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "form-check form-check-inline mb-1";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = `form-check-input ${checkboxClass}`;
    input.id = `${idPrefix}${index}`;
    input.value = ratio;

    const label = document.createElement("label");
    label.className = "form-check-label small";
    label.htmlFor = input.id;
    label.textContent = ratio;

    wrapper.appendChild(input);
    wrapper.appendChild(label);
    container.appendChild(wrapper);
  });

  if (onChangeCallback) {
    const checkboxes = container.querySelectorAll(`.${checkboxClass}`);
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", onChangeCallback);
    });
  }
}

/**
 * Get selected aspect ratios from filter checkboxes
 */
export function getSelectedAspectRatios(modal, checkboxClass = "unified-aspect-filter") {
  const container = modal.querySelector ? modal : document;
  return Array.from(container.querySelectorAll(`.${checkboxClass}:checked`)).map(
    (checkbox) => checkbox.value,
  );
}

/**
 * Clear the preview area and reset selection
 */
export function clearPreviewAndInfo(modal, previewSelector = "#unifiedTemplatePreview") {
  const preview = modal.querySelector
    ? modal.querySelector(previewSelector)
    : document.querySelector(previewSelector);

  if (preview) {
    preview.innerHTML = `<p class="text-muted mb-0">${gettext("Select a template to see preview")}</p>`;
  }

  return { selectedTemplate: null, lastRenderedTemplateId: null };
}

/**
 * Render a template preview in the preview container
 */
export function renderTemplatePreview(modal, template, options = {}) {
  const {
    previewSelector = "#unifiedTemplatePreview",
    previewSlideId = "template-preview",
    setResolutionCallback = null,
  } = options;

  const previewContainer = modal.querySelector
    ? modal.querySelector(previewSelector)
    : document.querySelector(previewSelector);

  if (!previewContainer) {
    return null;
  }

  if (!template) {
    previewContainer.innerHTML = `<p class="text-muted mb-0">${gettext("Select a template to see preview")}</p>`;
    return null;
  }

  // Hide aspect ratio info and show table header if they exist
  const aspectRatioTh = document.querySelector(".aspect-ratio-th");
  const aspectRatioInfo = document.querySelector(".aspect-ratio-info");
  if (aspectRatioTh) aspectRatioTh.classList.remove("d-none");
  if (aspectRatioInfo) aspectRatioInfo.classList.add("d-none");

  previewContainer.innerHTML = "";
  previewContainer.style.backgroundColor = "#f8f9fa";
  previewContainer.style.position = "relative";
  previewContainer.style.overflow = "hidden";

  const wrapper = document.createElement("div");
  wrapper.classList.add("template-preview-wrapper");

  const previewSlide = document.createElement("div");
  previewSlide.classList.add("preview-slide");
  previewSlide.id = previewSlideId;
  previewSlide.style.transform = "";

  wrapper.appendChild(previewSlide);
  previewContainer.appendChild(wrapper);

  // Set resolution if callback provided
  if (template.aspect_ratio && setResolutionCallback) {
    setResolutionCallback(template.aspect_ratio);
  }

  const slideObject = {
    ...template.slide_data,
    preview_width: template.preview_width || 1920,
    preview_height: template.preview_height || 1080,
  };

  loadSlide(slideObject, `#${previewSlideId}`, true);

  setTimeout(() => {
    scaleSlide(wrapper);
  }, 100);

  return template.id;
}

/**
 * Select a template and highlight it in the table
 */
export function selectTemplate(template, modal, state, options = {}) {
  const {
    tableSelector = "#unifiedTemplateTable tbody tr",
    renderPreviewCallback = null,
  } = options;

  if (!template) {
    return clearPreviewAndInfo(modal);
  }

  const wasSameTemplate =
    state.selectedTemplate && state.selectedTemplate.id === template.id;

  const newState = {
    ...state,
    selectedTemplate: template,
  };

  const rows = modal.querySelectorAll(tableSelector);
  rows.forEach((row) => {
    row.classList.toggle(
      "table-active",
      Number(row.getAttribute("data-template-id")) === template.id,
    );
  });

  if (wasSameTemplate && state.lastRenderedTemplateId === template.id) {
    return newState;
  }

  if (renderPreviewCallback) {
    const renderedId = renderPreviewCallback(modal, template);
    newState.lastRenderedTemplateId = renderedId;
  }

  return newState;
}

/**
 * Sort templates by a given column
 */
export function sortFilteredTemplates(templates, sortState) {
  if (!sortState.column) {
    return [...templates];
  }

  return [...templates].sort((a, b) => {
    const multiplier = sortState.order === "asc" ? 1 : -1;

    const getValue = (template) => {
      if (sortState.column === "name") {
        return template.name?.toLowerCase() || "";
      }
      if (sortState.column === "category") {
        return template.category?.name?.toLowerCase() || "";
      }
      if (sortState.column === "tags") {
        return (template.tags || [])
          .map((tag) => (typeof tag === "string" ? tag : tag.name))
          .join(", ")
          .toLowerCase();
      }
      if (sortState.column === "aspect_ratio") {
        return template.aspect_ratio?.toLowerCase() || "";
      }
      return "";
    };

    const aVal = getValue(a);
    const bVal = getValue(b);
    if (aVal < bVal) return -1 * multiplier;
    if (aVal > bVal) return 1 * multiplier;
    return 0;
  });
}

/**
 * Render the template table with the given templates
 */
export function renderTemplateTable(modal, templates, onSelectCallback, options = {}) {
  const {
    tableSelector = "#unifiedTemplateTable tbody",
    noResultsSelector = "#no-templates-found-alert",
    noResultsMessage = null,
    showAspectRatio = false,
  } = options;

  const tableBody = modal.querySelector
    ? modal.querySelector(tableSelector)
    : document.querySelector(tableSelector);

  const noResultsAlert = modal.querySelector
    ? modal.querySelector(noResultsSelector)
    : document.querySelector(noResultsSelector);

  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = "";

  if (!templates.length) {
    if (noResultsAlert) {
      noResultsAlert.classList.remove("d-none");
      if (noResultsMessage) {
        noResultsAlert.textContent = noResultsMessage;
      } else if (!noResultsAlert.textContent) {
        noResultsAlert.textContent = gettext("No templates match your filters.");
      }
    }
    return;
  }

  if (noResultsAlert) {
    noResultsAlert.classList.add("d-none");
  }

  templates.forEach((template) => {
    const tr = document.createElement("tr");
    tr.setAttribute("data-template-id", String(template.id));

    const nameTd = document.createElement("td");
    nameTd.textContent = template.name;
    tr.appendChild(nameTd);

    const categoryTd = document.createElement("td");
    categoryTd.textContent = template.category
      ? template.category.name
      : "-";
    tr.appendChild(categoryTd);

    const tagsTd = document.createElement("td");
    const tagNames = (template.tags || []).map((tag) =>
      typeof tag === "string" ? tag : tag.name,
    );
    if (tagNames.length > 0) {
      tagsTd.textContent = tagNames[0];
      
      if (tagNames.length > 1) {
        const moreCount = tagNames.length - 1;
        const badge = document.createElement("span");
        badge.className = "badge bg-light-gray text-dark fs-6 fw-normal ms-2";
        badge.style.cursor = "pointer";
        badge.textContent = `+${moreCount}`;
        badge.setAttribute("tabindex", "0");
        badge.setAttribute("role", "button");
        badge.setAttribute("data-bs-toggle", "popover");
        badge.setAttribute("data-bs-trigger", "focus");
        badge.setAttribute("data-bs-placement", "top");
        badge.setAttribute("data-bs-html", "true");
        badge.setAttribute("data-bs-title", gettext("Additional Tags"));
        
        const extraTags = tagNames.slice(1).join("<br>");
        badge.setAttribute("data-bs-content", extraTags);
        
        tagsTd.appendChild(badge);
        
        // Initialize Bootstrap popover
        new bootstrap.Popover(badge);
        
        // Prevent row click when clicking badge
        badge.addEventListener("click", (e) => {
          e.stopPropagation();
        });
      }
    } else {
      tagsTd.textContent = "-";
    }
    tr.appendChild(tagsTd);

    if (showAspectRatio) {
      const aspectTd = document.createElement("td");
      aspectTd.textContent = template.aspect_ratio || "—";
      tr.appendChild(aspectTd);
    }

    tr.addEventListener("click", () => onSelectCallback(template));
    tableBody.appendChild(tr);
  });
}

/**
 * Attach sort handlers to table headers
 */
export function attachSortHandlers(modal, sortState, onSortCallback, tableSelector = "#unifiedTemplateTable th[data-sort]") {
  const headers = modal.querySelectorAll
    ? modal.querySelectorAll(tableSelector)
    : document.querySelectorAll(tableSelector);

  headers.forEach((th) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const sortKey = th.getAttribute("data-sort");
      if (!sortKey) {
        return;
      }

      const newSortState = {
        column: sortKey,
        order:
          sortState.column === sortKey && sortState.order === "asc"
            ? "desc"
            : "asc",
      };

      onSortCallback(newSortState);
    });
  });
}

/**
 * Ensure initial template selection when modal opens
 */
export function ensureInitialTemplateSelection(modal, state, templates, selectCallback) {
  if (!modal) {
    return state;
  }

  if (state.selectedTemplate) {
    return selectCallback(state.selectedTemplate, modal);
  }

  if (templates.length > 0) {
    return selectCallback(templates[0], modal);
  }

  return state;
}
