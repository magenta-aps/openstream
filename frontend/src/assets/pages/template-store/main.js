import "./style.scss";

import { gettext, translateHTML } from "../../utils/locales";
translateHTML();
import { token } from "../../utils/utils";
import { DEFAULT_ASPECT_RATIO } from "../../utils/availableAspectRatios";
import { BASE_URL } from "../../utils/constants";

const PLACEHOLDER_THUMBNAIL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%230d1b2a'/%3E%3Cstop offset='100%25' stop-color='%231b263b'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='640' height='360' fill='url(%23grad)'/%3E%3Cpath d='M96 261l96-120 80 76 48-61 128 105' stroke='%23fff' stroke-width='12' fill='none' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'/%3E%3Ccircle cx='472' cy='120' r='32' fill='none' stroke='%23fff' stroke-width='10' opacity='0.35'/%3E%3C/svg%3E";

// Use the project's default aspect ratio definition
const DEFAULT_ASPECT = DEFAULT_ASPECT_RATIO;

const state = {
  all: [],
  filtered: [],
  filters: {
    search: "",
    aspect: DEFAULT_ASPECT,
    sort: "recent",
  },
  isLoading: false,
};

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

  // If the aspect filter includes an 'all' button, disable it; we require a specific ratio
  if (ui.aspectFilter) {
    const allButton = ui.aspectFilter.querySelector("[data-value='all']");
    if (allButton) {
      allButton.disabled = true;
      allButton.classList.add("btn--disabled-aspect");
      allButton.setAttribute("aria-disabled", "true");
      allButton.title = gettext("'All' is not a valid option for aspect ratio; please select a specific ratio.");
    }
  }

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
    applyFilters();
  } catch (error) {
    console.error("Error fetching templates from store:", error);
    showLoadError();
  } finally {
    setLoading(false);
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
}

function handleSortChange(event) {
  state.filters.sort = event.target.value || "recent";
  applyFilters();
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
}

function updateAspectSelection(value) {
  if (!ui.aspectFilter) {
    return;
  }

  const selected = value === "all" ? DEFAULT_ASPECT : value;
  ui.aspectFilter.querySelectorAll(".btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === selected);
  });
}

function applyFilters() {
  if (!state.all.length) {
    state.filtered = [];
    renderCards();
    toggleEmptyState();
    updateSummary();
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

function createTemplateCard(template) {
  const col = document.createElement("div");
  col.className = "col";
  
  // Set aspect ratio data attribute for CSS grid sizing
  const aspectRatio = template.aspect_ratio || "16:9";
  col.setAttribute("data-aspect", aspectRatio);

  const card = document.createElement("div");
  card.className = "card template-card";

  const imageContainer = document.createElement("div");
  imageContainer.className = "d-flex justify-content-center";

  const badge = document.createElement("span");
  badge.className = "badge bg-success";
  badge.textContent = gettext("Free");
  imageContainer.appendChild(badge);

  const image = document.createElement("img");
  image.className = "card-img-top";
  image.src = template.thumbnail_url || PLACEHOLDER_THUMBNAIL;
  image.alt = `${template.name || gettext("Template")} ${gettext("preview")}`;
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.setAttribute("data-aspect", aspectRatio);
  
  image.addEventListener("error", () => {
    image.src = PLACEHOLDER_THUMBNAIL;
  }, { once: true });
  imageContainer.appendChild(image);

  const body = document.createElement("div");
  body.className = "card-body";

  const name = document.createElement("h5");
  name.className = "card-title";
  name.textContent = template.name || gettext("Untitled template");
  body.appendChild(name);

  const meta = document.createElement("div");
  meta.className = "d-flex justify-content-between text-muted small mb-3";

  const aspect = document.createElement("span");
  aspect.textContent = formatAspectRatio(template.aspect_ratio);
  meta.appendChild(aspect);

  const updated = document.createElement("span");
  updated.textContent = formatUpdated(template.updated_at || template.created_at);
  meta.appendChild(updated);

  body.appendChild(meta);

  // Mirror the aspect ratio attribute on the body so CSS attribute selectors work
  body.setAttribute("data-aspect", aspectRatio);

  const footer = document.createElement("div");
  footer.className = "d-flex justify-content-between align-items-center";

  const price = document.createElement("span");
  price.className = "fw-bold text-success";
  price.textContent = gettext("Free");
  footer.appendChild(price);

  const action = document.createElement("button");
  action.type = "button";
  action.className = "btn btn-primary btn-sm";
  action.textContent = gettext("Get Template");
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
