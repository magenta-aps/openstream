// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

import "./style.scss";

import { gettext, translateHTML } from "../../utils/locales";
translateHTML();
import { token, showToast, parentOrgID, initOrgUrlRouting,  } from "../../utils/utils";
import { DEFAULT_ASPECT_RATIO } from "../../utils/availableAspectRatios";
import { BASE_URL } from "../../utils/constants";

const PLACEHOLDER_THUMBNAIL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%230d1b2a'/%3E%3Cstop offset='100%25' stop-color='%231b263b'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='640' height='360' fill='url(%23grad)'/%3E%3Cpath d='M96 261l96-120 80 76 48-61 128 105' stroke='%23fff' stroke-width='12' fill='none' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'/%3E%3Ccircle cx='472' cy='120' r='32' fill='none' stroke='%23fff' stroke-width='10' opacity='0.35'/%3E%3C/svg%3E";

// Use the project's default aspect ratio definition
const DEFAULT_ASPECT = DEFAULT_ASPECT_RATIO;
const TEMPLATE_IMPORT_STATUS = {
  IDLE: "idle",
  LOADING: "loading",
  SUCCESS: "success",
};
const TEMPLATE_SUCCESS_RESET_MS = 1800;

const state = {
  all: [],
  filtered: [],
  filters: {
    search: "",
    aspect: DEFAULT_ASPECT,
    sort: "recent",
  },
  isLoading: false,
  importStatuses: new Map(),
};

function getTemplateKey(templateOrId) {
  if (templateOrId === null || typeof templateOrId === "undefined") {
    return null;
  }

  if (
    (typeof templateOrId === "string" || templateOrId instanceof String) &&
    templateOrId.trim() !== ""
  ) {
    return templateOrId.toString();
  }

  if (typeof templateOrId === "number" && Number.isFinite(templateOrId)) {
    return templateOrId.toString();
  }

  if (typeof templateOrId === "object") {
    if (templateOrId.id !== undefined && templateOrId.id !== null) {
      return templateOrId.id.toString();
    }
    if (templateOrId.slug) {
      return templateOrId.slug.toString();
    }
    if (templateOrId.thumbnail_url) {
      return templateOrId.thumbnail_url;
    }
    if (templateOrId.name) {
      return templateOrId.name;
    }
  }

  return null;
}

function getTemplateImportStatus(templateOrId) {
  const key = getTemplateKey(templateOrId);
  if (!key) {
    return TEMPLATE_IMPORT_STATUS.IDLE;
  }
  return state.importStatuses.get(key) ?? TEMPLATE_IMPORT_STATUS.IDLE;
}

function setTemplateImportStatus(templateOrId, status) {
  const key = getTemplateKey(templateOrId);
  if (!key) {
    return;
  }

  if (status === TEMPLATE_IMPORT_STATUS.IDLE) {
    state.importStatuses.delete(key);
  } else {
    state.importStatuses.set(key, status);
  }

  renderCards();
}

function scheduleImportStatusReset(template) {
  window.setTimeout(() => {
    if (getTemplateImportStatus(template) === TEMPLATE_IMPORT_STATUS.SUCCESS) {
      setTemplateImportStatus(template, TEMPLATE_IMPORT_STATUS.IDLE);
    }
  }, TEMPLATE_SUCCESS_RESET_MS);
}

const ui = {
  searchInput: null,
  aspectFilter: null,
  sortSelect: null,
  cardsGrid: null,
  emptyState: null,
  summary: null,
  resetButtons: [],
};

let searchDebounceId = null;
let relativeFormatter = null;

try {
  relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
} catch (error) {
  console.warn("RelativeTimeFormat is not available", error);
}

document.addEventListener("DOMContentLoaded", () => {
  cacheUI();

  if (!ui.cardsGrid) {
    console.warn("Template Store: missing grid container");
    return;
  }

  bindEvents();
  loadTemplates();
});

function cacheUI() {
  ui.searchInput = document.querySelector("[data-template-search]");
  ui.aspectFilter = document.querySelector("[data-template-aspect-filter]");
  ui.sortSelect = document.querySelector("[data-template-sort]");
  ui.cardsGrid = document.querySelector("[data-template-grid]");
  ui.emptyState = document.querySelector("[data-template-empty]");
  ui.summary = document.querySelector("[data-template-summary]");
  ui.resetButtons = Array.from(document.querySelectorAll("[data-template-reset]"));

  // The aspect filter shouldn't include an 'all' option; the default is a specific ratio

  // Make sure the UI reflects the currently selected aspect ratio
  if (ui.aspectFilter) {
    updateAspectSelection(state.filters.aspect);
  }
}

function bindEvents() {
  if (ui.searchInput) {
    ui.searchInput.addEventListener("input", handleSearchInput);
  }

  if (ui.aspectFilter) {
    ui.aspectFilter.addEventListener("click", handleAspectFilterClick);
  }

  if (ui.sortSelect) {
    ui.sortSelect.addEventListener("change", handleSortChange);
  }

  ui.resetButtons.forEach((button) => button.addEventListener("click", resetFilters));
}

async function loadTemplates() {
  setLoading(true);

  try {
    const response = await fetch(`${BASE_URL}/api/global-templates/`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Status ${response.status}: ${response.statusText}`);
    }

    const payload = await response.json();
    state.all = normalizeTemplates(payload);
    state.importStatuses.clear();
    applyFilters();
  } catch (error) {
    console.error("Error fetching templates from store:", error);
    showLoadError();
  } finally {
    setLoading(false);
    // Refresh the UI after loading finishes; ensures skeletons have been cleared
    // and the filtered set is rendered.
    refreshUI();
  }
}

function normalizeTemplates(payload) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.results)) {
    return payload.results;
  }

  if (Array.isArray(payload.templates)) {
    return payload.templates;
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  return payload.id ? [payload] : [];
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  if (isLoading) {
    renderSkeletons();
    if (ui.emptyState) {
      ui.emptyState.hidden = true;
    }
  }

  updateSummary();
  toggleEmptyState();
}

function handleSearchInput(event) {
  const nextValue = event.target.value ?? "";
  window.clearTimeout(searchDebounceId);
  searchDebounceId = window.setTimeout(() => {
    state.filters.search = nextValue.trim();
    applyFilters();
    refreshUI();
  }, 150);
}

function handleAspectFilterClick(event) {
  const button = event.target.closest("button[data-value]");
  if (!button) {
    return;
  }

  // Ignore clicks on disabled buttons (e.g. the 'all' option)
  if (button.disabled) {
    return;
  }

  const nextValue = button.dataset.value || DEFAULT_ASPECT;
  if (state.filters.aspect === nextValue) {
    return;
  }

  state.filters.aspect = nextValue;
  updateAspectSelection(nextValue);
  applyFilters();
  refreshUI();
}

function handleSortChange(event) {
  state.filters.sort = event.target.value || "recent";
  applyFilters();
  refreshUI();
}

function resetFilters() {
  state.filters.search = "";
  // Reset to a specific default aspect ratio instead of 'all'
  state.filters.aspect = DEFAULT_ASPECT;
  state.filters.sort = "recent";

  if (ui.searchInput) {
    ui.searchInput.value = "";
  }

  if (ui.sortSelect) {
    ui.sortSelect.value = "recent";
  }

  updateAspectSelection(state.filters.aspect);
  applyFilters();
  refreshUI();
}

function updateAspectSelection(value) {
  if (!ui.aspectFilter) {
    return;
  }
  const selected = value || DEFAULT_ASPECT;
  ui.aspectFilter.querySelectorAll(".btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === selected);
  });
}

function applyFilters() {
  if (!state.all.length) {
    state.filtered = [];
    return;
  }

  let filtered = [...state.all];

  if (state.filters.search) {
    const searchTerm = state.filters.search.toLowerCase();
    filtered = filtered.filter((item) => (item.name || "").toLowerCase().includes(searchTerm));
  }

  if (state.filters.aspect && state.filters.aspect !== "") {
    filtered = filtered.filter((item) => {
      const ratio = (item.aspect_ratio || "").toLowerCase();
      return ratio === state.filters.aspect.toLowerCase();
    });
  }

  if (state.filters.sort === "name") {
    filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else {
    filtered.sort((a, b) => sortByUpdated(a, b, state.filters.sort));
  }

  state.filtered = filtered;
}

// Refresh the UI (render cards and update auxiliary indicators). This is separate
// so we can keep `applyFilters` as a pure filtering operation useful from tests.
function refreshUI() {
  renderCards();
  toggleEmptyState();
  updateSummary();
}

function sortByUpdated(a, b, direction) {
  const first = new Date(a.updated_at || a.created_at || 0).getTime();
  const second = new Date(b.updated_at || b.created_at || 0).getTime();
  if (direction === "oldest") {
    return first - second;
  }
  return second - first;
}

function renderCards() {
  if (!ui.cardsGrid) {
    return;
  }

  if (!state.filtered.length) {
    if (!state.isLoading) {
      ui.cardsGrid.innerHTML = "";
    }
    return;
  }

  const fragment = document.createDocumentFragment();
  state.filtered.forEach((template) => {
    fragment.appendChild(createTemplateCard(template));
  });

  ui.cardsGrid.innerHTML = "";
  ui.cardsGrid.appendChild(fragment);
}

function renderSkeletons(count = 6) {
  if (!ui.cardsGrid) {
    return;
  }

  const fragment = document.createDocumentFragment();
  const aspectRatios = ["16:9", "9:16", "4:3", "3:4", "1:1"]; // Varied ratios for skeleton
  
  for (let index = 0; index < count; index += 1) {
    const col = document.createElement("div");
    col.className = "col";
    const aspectRatio = aspectRatios[index % aspectRatios.length];
    col.setAttribute("data-aspect", aspectRatio);
    
    col.innerHTML = `
      <div class="card template-card template-card--skeleton">
        <div class="position-relative">
          <div class="placeholder bg-light w-100 h-100"></div>
        </div>
        <div class="card-body">
          <div class="placeholder bg-light mb-2" style="width: 75%; height: 1rem;"></div>
          <div class="placeholder bg-light mb-2" style="width: 50%; height: 0.75rem;"></div>
          <div class="placeholder bg-light" style="width: 100%; height: 0.75rem;"></div>
        </div>
      </div>
    `;
    fragment.appendChild(col);
  }

  ui.cardsGrid.innerHTML = "";
  ui.cardsGrid.appendChild(fragment);
}

function toggleEmptyState() {
  if (!ui.emptyState) {
    return;
  }

  const noDataAvailable = !state.isLoading && !state.all.length;
  const noMatches = !state.isLoading && state.all.length > 0 && state.filtered.length === 0;
  const shouldShow = noDataAvailable || noMatches;

  if (shouldShow) {
    const title = ui.emptyState.querySelector("h3");
    const body = ui.emptyState.querySelector("p");

    if (noDataAvailable) {
      if (title) {
        title.textContent = gettext("No templates are available yet");
      }
      if (body) {
        body.textContent = gettext("Check back soon. We are adding new templates all the time.");
      }
    } else if (noMatches) {
      if (title) {
        title.textContent = gettext("No templates match your filters");
      }
      if (body) {
        body.textContent = gettext("Try a different search term or reset the filters.");
      }
    }
  }

  ui.emptyState.hidden = !shouldShow;
}

function updateSummary() {
  if (!ui.summary) {
    return;
  }

  if (state.isLoading) {
    ui.summary.textContent = gettext("Loading templates…");
    return;
  }

  const total = state.all.length;
  const visible = state.filtered.length;
  const noun = visible === 1 ? gettext("template") : gettext("templates");
  ui.summary.textContent = `${visible} / ${total} ${noun}`;
}

function showLoadError() {
  if (ui.summary) {
    ui.summary.textContent = gettext("We could not load the template store.");
  }

  if (ui.cardsGrid) {
    ui.cardsGrid.innerHTML = "";
  }

  if (ui.emptyState) {
    const title = ui.emptyState.querySelector("h3");
    const body = ui.emptyState.querySelector("p");
    if (title) {
      title.textContent = gettext("Unable to load templates");
    }
    if (body) {
      body.textContent = gettext("Please try again in a moment.");
    }
    ui.emptyState.hidden = false;
  }
}

function createEl(tag, options = {}) {
  const el = document.createElement(tag);
  if (options.className) el.className = options.className;
  if (options.text) el.textContent = options.text;
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([k, v]) => el.setAttribute(k, v));
  }
  if (options.dataset) {
    Object.entries(options.dataset).forEach(([k, v]) => (el.dataset[k] = v));
  }
  return el;
}

function createTemplateCard(template) {
  const aspectRatio = template.aspect_ratio || "16:9";
  const importStatus = getTemplateImportStatus(template);

  const col = createEl("div", { className: "col", dataset: { aspect: aspectRatio, templateId: template.id || "" } });

  const card = createEl("div", { className: "card template-card" });

  const imageContainer = createEl("div", { className: "d-flex justify-content-center" });

  const image = createEl("img", { className: "card-img-top" });
  image.src = template.thumbnail_url || PLACEHOLDER_THUMBNAIL;
  image.alt = `${template.name || gettext("Template")} ${gettext("preview")}`;
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.setAttribute("data-aspect", aspectRatio);
  image.addEventListener("error", () => { image.src = PLACEHOLDER_THUMBNAIL; }, { once: true });
  imageContainer.appendChild(image);

  const body = createEl("div", { className: "card-body" });
  body.setAttribute("data-aspect", aspectRatio);

  const name = createEl("h5", { className: "card-title", text: template.name || gettext("Untitled template") });
  body.appendChild(name);

  const meta = createEl("div", { className: "d-flex justify-content-between text-muted small mb-3" });
  const aspect = createEl("span", { text: formatAspectRatio(template.aspect_ratio) });
  const updated = createEl("span", { text: formatUpdated(template.updated_at || template.created_at) });
  meta.appendChild(aspect);
  meta.appendChild(updated);
  body.appendChild(meta);

  const footer = createEl("div", { className: "d-flex justify-content-between align-items-center" });
  const price = createEl("span", { className: "fw-bold text-success", text: gettext("Free") });
  const action = createEl("button", { className: "btn btn-primary btn-sm" });
  action.type = "button";

  if (importStatus === TEMPLATE_IMPORT_STATUS.LOADING) {
    action.disabled = true;
    action.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>${gettext("Adding…")}`;
  } else if (importStatus === TEMPLATE_IMPORT_STATUS.SUCCESS) {
    action.disabled = true;
    action.classList.replace("btn-primary", "btn-outline-success");
    action.textContent = gettext("Added");
  } else {
    action.disabled = false;
    action.textContent = gettext("Get Template");
  }

  action.addEventListener("click", () => handleGetTemplate(template));
  footer.appendChild(price);
  footer.appendChild(action);

  body.appendChild(footer);
  card.appendChild(imageContainer);
  card.appendChild(body);
  col.appendChild(card);
  return col;
}

function formatAspectRatio(value) {
  if (!value) {
    return gettext("Flexible ratio");
  }
  return `${value}`;
}

function formatUpdated(value) {
  if (!value) {
    return gettext("Updated recently");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return gettext("Updated recently");
  }

  if (relativeFormatter) {
    return `${gettext("Updated")} ${formatRelativeTime(date)}`;
  }

  return `${gettext("Updated on")} ${date.toLocaleDateString()}`;
}

function formatRelativeTime(date) {
  const divisions = [
    { amount: 60, unit: "second" },
    { amount: 60, unit: "minute" },
    { amount: 24, unit: "hour" },
    { amount: 7, unit: "day" },
    { amount: 4.34524, unit: "week" },
    { amount: 12, unit: "month" },
    { amount: Number.POSITIVE_INFINITY, unit: "year" },
  ];

  let duration = (date.getTime() - Date.now()) / 1000;

  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return relativeFormatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }

  return relativeFormatter.format(0, "day");
}

async function handleGetTemplate(template) {
  if (!template || getTemplateImportStatus(template) === TEMPLATE_IMPORT_STATUS.LOADING) {
    return;
  }

  if (!parentOrgID) {
    showToast(gettext("Missing organisation context. Open the template store from an organisation."), "Error");
    return;
  }

  if (!token) {
    showToast(gettext("Your session has expired. Please sign in again."), "Error");
    return;
  }

  const payload = buildOrganisationTemplatePayload(template);
  if (!payload) {
    showToast(gettext("This template cannot be added because it is missing slide data."), "Error");
    return;
  }

  setTemplateImportStatus(template, TEMPLATE_IMPORT_STATUS.LOADING);

  try {
    const response = await fetch(
      `${BASE_URL}/api/slide-templates/?organisation_id=${encodeURIComponent(parentOrgID)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const detail = await parseErrorResponse(response);
      throw new Error(detail || `${response.status} ${response.statusText}`);
    }

    setTemplateImportStatus(template, TEMPLATE_IMPORT_STATUS.SUCCESS);
    scheduleImportStatusReset(template);
    showToast(gettext("Template added to your organisation templates."), "Success");
  } catch (error) {
    console.error("Template Store: failed to add template", error);
    const fallbackMessage = gettext("Could not add the template.");
    const detailMessage = error?.message ? `${fallbackMessage} ${error.message}` : fallbackMessage;
    showToast(detailMessage, "Error");
    setTemplateImportStatus(template, TEMPLATE_IMPORT_STATUS.IDLE);
  }
}

function buildOrganisationTemplatePayload(template) {
  const slideData = cloneSlideData(template.slideData);
  if (!slideData) {
    return null;
  }

  const previewWidth = template.previewWidth ?? slideData.previewWidth ?? null;
  const previewHeight = template.previewHeight ?? slideData.previewHeight ?? null;

  if (previewWidth) {
    slideData.previewWidth = previewWidth;
  }
  if (previewHeight) {
    slideData.previewHeight = previewHeight;
  }

  return {
    name: template.name || gettext("Untitled template"),
    slideData,
    aspect_ratio:
      template.aspect_ratio || deriveAspectRatioFromDimensions(previewWidth, previewHeight),
    isLegacy: Boolean(template.isLegacy),
  };
}

function cloneSlideData(slideData) {
  if (slideData === null || typeof slideData === "undefined") {
    return null;
  }

  if (typeof slideData === "string") {
    try {
      return JSON.parse(slideData);
    } catch (error) {
      console.error("Template Store: slideData string is invalid JSON", error);
      return null;
    }
  }

  try {
    return JSON.parse(JSON.stringify(slideData));
  } catch (error) {
    console.warn("Template Store: failed to clone slideData", error);
    if (typeof slideData === "object") {
      return { ...slideData };
    }
  }

  return null;
}

function deriveAspectRatioFromDimensions(width, height) {
  const parsedWidth = Number(width);
  const parsedHeight = Number(height);

  if (
    !Number.isFinite(parsedWidth) ||
    !Number.isFinite(parsedHeight) ||
    parsedWidth <= 0 ||
    parsedHeight <= 0
  ) {
    return DEFAULT_ASPECT;
  }

  const divisor = gcd(parsedWidth, parsedHeight);
  const normalizedWidth = Math.round(parsedWidth / divisor);
  const normalizedHeight = Math.round(parsedHeight / divisor);
  return `${normalizedWidth}:${normalizedHeight}`;
}

function gcd(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x || 1;
}

async function parseErrorResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const data = await response.json();
      if (typeof data === "string") {
        return data;
      }
      if (Array.isArray(data)) {
        return data.join(", ");
      }
      if (data.detail) {
        return data.detail;
      }
      const [firstKey] = Object.keys(data);
      if (firstKey) {
        const value = data[firstKey];
        if (Array.isArray(value)) {
          return value.join(", ");
        }
        if (typeof value === "string") {
          return value;
        }
        return JSON.stringify(value);
      }
    } catch (error) {
      console.warn("Template Store: could not parse error payload", error);
    }
  }

  try {
    return await response.text();
  } catch (error) {
    console.warn("Template Store: could not read error response", error);
    return "";
  }
}

initOrgUrlRouting();