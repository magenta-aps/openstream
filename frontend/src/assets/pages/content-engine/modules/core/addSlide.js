// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { loadSlide, scaleSlide } from "./renderSlide.js";
import { updateSlideSelector } from "./slideSelector.js";
import { store } from "./slideStore.js";
import {
  createMiniSearchInstance,
  searchItems,
  token,
  showToast,
} from "../../../../utils/utils.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";
import * as bootstrap from "bootstrap";
let unifiedTemplates = [];
let selectedUnifiedTemplate = null;
let filteredTemplates = [];
let currentSort = { column: null, order: "asc" };

// MiniSearch instance
function customTagsExtractField(document, fieldName) {
  if (fieldName === "tags") {
    return document.tags.map((tag) => tag.name); // Extract tag names as an array
  }
  return document[fieldName]; // Default extraction
}

export function getCurrentAspectRatio() {
  if (!store.emulatedWidth || !store.emulatedHeight) {
    return null;
  }

  const width = store.emulatedWidth;
  const height = store.emulatedHeight;

  // Check for common aspect ratios based on dimensions
  if (width === 1920 && height === 1080) return "16:9";
  if (width === 1080 && height === 1920) return "9:16";
  if (width === 1024 && height === 768) return "4:3";
  if (width === 768 && height === 1024) return "3:4";
  if (width === 3440 && height === 1440) return "21:9";
  if (width === 1440 && height === 3440) return "9:21";
  if (width === 1998 && height === 1080) return "1.85:1";
  if (width === 1080 && height === 1998) return "1:1.85";
  if (width === 2048 && height === 858) return "2.39:1";
  if (width === 858 && height === 2048) return "1:2.39";

  // If dimensions don't match any predefined ratio, return a simplified ratio
  // This is a fallback but the UI only offers specific ratio options
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

const templateMiniSearcher = createMiniSearchInstance(
  ["name", "category", "tags"],
  { extractField: customTagsExtractField },
);

const noTemplatesFoundAlert = document.getElementById(
  "no-templates-found-alert",
);

function updateCategorySidebar(templates) {
  // Create a map of unique categories (id => name)
  const categoriesMap = new Map();
  templates.forEach((t) => {
    if (t.category) {
      categoriesMap.set(t.category.id, t.category.name);
    }
  });

  const sidebar = document.getElementById("categorySidebar");
  sidebar.innerHTML =
    '<h6 class="border-bottom secondary p-2">' +
    gettext("Filter by Category") +
    '<span class="material-symbols-outlined">\n' +
    "category_search\n" +
    "</span></h6>";

  categoriesMap.forEach((name, id) => {
    const div = document.createElement("div");
    div.className = "form-check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "form-check-input category-filter";
    input.value = id;
    input.id = "cat-" + id;
    input.checked = false; // default: show all categories

    const label = document.createElement("label");
    label.className = "form-check-label";
    label.htmlFor = "cat-" + id;
    label.textContent = name;

    div.appendChild(input);
    div.appendChild(label);
    sidebar.appendChild(div);
  });

  const checkboxes = document.querySelectorAll(".category-filter");
  checkboxes.forEach((cb) => {
    cb.addEventListener("change", () => {
      filterTemplates();
      sortAndRenderTemplates();
    });
  });
}

async function fetchUnifiedTemplates() {
  const orgId = localStorage.getItem("parentOrgID");
  const suborgId = localStorage.getItem("selectedSubOrgID");

  try {
    let url;
    // If we have a suborgId, fetch suborg-specific templates (includes global + suborg templates)
    // Otherwise, fetch only global templates for the org
    if (suborgId) {
      url = `${BASE_URL}/api/suborg-templates/?suborg_id=${suborgId}`;
    } else {
      url = `${BASE_URL}/api/slide-templates/?organisation_id=${orgId}`;
    }

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      console.error("Failed to fetch templates", resp.status);
      return;
    }
    unifiedTemplates = await resp.json();

    unifiedTemplates = unifiedTemplates.filter((template) =>
      template.accepted_aspect_ratios.includes(getCurrentAspectRatio()),
    );

    document.getElementById("aspect-ratio").innerText = getCurrentAspectRatio();

    templateMiniSearcher.removeAll();
    templateMiniSearcher.addAll(unifiedTemplates);
    updateCategorySidebar(unifiedTemplates);
    filteredTemplates = unifiedTemplates;
    sortAndRenderTemplates();
  } catch (err) {
    console.error("Error fetching templates:", err);
  }
}

function filterTemplates() {
  const query = document.getElementById("templateSearch").value.toLowerCase();
  const searchResults = searchItems(
    query,
    unifiedTemplates,
    templateMiniSearcher,
  );
  const selectedCategoryIds = Array.from(
    document.querySelectorAll(".category-filter:checked"),
  ).map((cb) => parseInt(cb.value, 10));

  filteredTemplates = searchResults.filter((t) => {
    return (
      selectedCategoryIds.length === 0 ||
      selectedCategoryIds.includes(t.category?.id)
    );
  });
}

function sortAndRenderTemplates() {
  if (currentSort.column) {
    filteredTemplates.sort((a, b) => {
      let aVal, bVal;
      if (currentSort.column === "name") {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else if (currentSort.column === "category") {
        aVal = (a.category ? a.category.name : "").toLowerCase();
        bVal = (b.category ? b.category.name : "").toLowerCase();
      } else if (currentSort.column === "tags") {
        aVal = a.tags ? a.tags.join(", ").toLowerCase() : "";
        bVal = b.tags ? b.tags.join(", ").toLowerCase() : "";
      }
      if (aVal < bVal) return currentSort.order === "asc" ? -1 : 1;
      if (aVal > bVal) return currentSort.order === "asc" ? 1 : -1;
      return 0;
    });
  }
  renderUnifiedTemplateTable(filteredTemplates);
}

function renderUnifiedTemplateTable(templates) {
  const tableBody = document.querySelector("#unifiedTemplateTable tbody");
  tableBody.innerHTML = "";
  if (templates.length === 0) {
    noTemplatesFoundAlert.classList.remove("d-none");
    return;
  } else {
    noTemplatesFoundAlert.classList.add("d-none");
    templates.forEach((t) => {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.textContent = t.name;
      tr.appendChild(tdName);

      const tdCat = document.createElement("td");
      tdCat.textContent = t.category ? t.category.name : gettext("(none)");
      tr.appendChild(tdCat);

      const tdTags = document.createElement("td");
      if (t.tags && t.tags.length > 0) {
        const tagNames = t.tags.map((tag) => tag.name);
        const visibleTags = tagNames.slice(0, 3);
        tdTags.textContent = visibleTags.join(", ");
        if (tagNames.length > 3) {
          const moreCount = tagNames.length - 3;
          tdTags.appendChild(
            document.createTextNode(
              ` ${gettext("and")} ${moreCount} ${gettext("more")}. `,
            ),
          );
          const showAllLink = document.createElement("a");
          showAllLink.href = "#";
          showAllLink.textContent = gettext("Show All");
          showAllLink.addEventListener("click", (e) => {
            e.preventDefault();
            tdTags.textContent = tagNames.join(", ");
          });
          tdTags.appendChild(showAllLink);
        }
      } else {
        tdTags.textContent = "-";
      }
      tr.appendChild(tdTags);

      tr.addEventListener("click", () => {
        document
          .querySelectorAll("#unifiedTemplateTable tbody tr")
          .forEach((row) => row.classList.remove("table-active"));
        tr.classList.add("table-active");
        selectedUnifiedTemplate = t;
        loadUnifiedTemplatePreview(t);
      });

      tableBody.appendChild(tr);
    });
  }
}

function loadUnifiedTemplatePreview(template) {
  const previewContainer = document.getElementById("unifiedTemplatePreview");
  previewContainer.innerHTML = ""; // Clear the outer container first

  const wrapper = document.createElement("div");
  wrapper.classList.add("template-preview-wrapper");
  wrapper.style.position = "relative";
  wrapper.style.width = "100%";
  wrapper.style.height = "100%";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "center";

  previewContainer.appendChild(wrapper);

  const previewSlide = document.createElement("div");
  previewSlide.classList.add("preview-slide");
  previewSlide.id = "template-slide-preview"; // Unique ID for the template preview slide div
  previewSlide.style.transform = ""; // Reset transform before loading
  wrapper.appendChild(previewSlide);

  // Load the slide content into the specific previewSlide div
  // Pass the unique ID selector as the target
  loadSlide(template.slideData, "#template-slide-preview", true); // Force complete reload for preview

  // Scale the content based on the wrapper container
  scaleSlide(wrapper);
}

export function initAddSlide() {
  document
    .getElementById("templateSearch")
    .addEventListener("input", function () {
      filterTemplates();
      sortAndRenderTemplates();
    });

  document
    .getElementById("unifiedSlideModal")
    .addEventListener("shown.bs.modal", async () => {
      await fetchUnifiedTemplates();
      const tableBody = document.querySelector("#unifiedTemplateTable tbody");
      if (tableBody && tableBody.children.length > 0) {
        const firstRow = tableBody.children[0];
        firstRow.classList.add("table-active");
        selectedUnifiedTemplate = filteredTemplates[0];
        loadUnifiedTemplatePreview(filteredTemplates[0]);
      }
    });

  document
    .getElementById("unifiedSaveSlideBtn")
    .addEventListener("click", () => {
      // Ensure slide and element ID counters are up-to-date to prevent conflicts.
      let maxSlideId = 0;
      store.slides.forEach((slide) => {
        if (slide.id > maxSlideId) {
          maxSlideId = slide.id;
        }
      });
      store.slideIdCounter = Math.max(
        store.slideIdCounter || 1,
        maxSlideId + 1,
      );

      let maxElementId = 0;
      store.slides.forEach((slide) => {
        if (slide.elements && Array.isArray(slide.elements)) {
          slide.elements.forEach((element) => {
            if (element.id > maxElementId) {
              maxElementId = element.id;
            }
          });
        }
      });
      store.elementIdCounter = Math.max(
        store.elementIdCounter || 1,
        maxElementId + 1,
      );

      if (!selectedUnifiedTemplate) {
        showToast(
          gettext("Please select a template from the list."),
          "Warning",
        );
        return;
      }
      const templateSlide = selectedUnifiedTemplate.slideData;
      const newSlide = JSON.parse(JSON.stringify(templateSlide));
      newSlide.id = store.slideIdCounter++;

      const manualName = document
        .getElementById("templateSlideName")
        .value.trim();
      const manualDuration = parseInt(
        document.getElementById("templateSlideDuration").value,
        10,
      );
      newSlide.name = manualName
        ? manualName
        : selectedUnifiedTemplate.name + gettext(" (From Template)");
      if (!isNaN(manualDuration) && manualDuration > 0) {
        newSlide.duration = manualDuration;
      }
      newSlide.undoStack = [];
      newSlide.redoStack = [];

      // When creating a slide from a template, ensure all elements have new unique IDs
      // and their `originSlideIndex` is updated to the new slide's index.
      // Also, reset persistence.
      const newSlideIndex = store.slides.length;
      if (newSlide.elements && Array.isArray(newSlide.elements)) {
        newSlide.elements.forEach((element) => {
          element.id = store.elementIdCounter++;
          element.originSlideIndex = newSlideIndex;
          element.isPersistent = false;
        });
      }

      store.slides.push(newSlide);
      store.currentSlideIndex = store.slides.length - 1;
      updateSlideSelector();
      bootstrap.Modal.getInstance(
        document.getElementById("unifiedSlideModal"),
      ).hide();
      loadSlide(newSlide);

      // Ensure proper scaling after adding slide from template
      const previewContainer = document.querySelector(
        ".preview-column .preview-container"
      ) || document.querySelector(".slide-canvas .preview-container");
      if (previewContainer) {
        scaleSlide(previewContainer);
      }
    });

  document.querySelector("#addSlideBtn").addEventListener("click", function () {
    const unifiedModal = new bootstrap.Modal(
      document.getElementById("unifiedSlideModal"),
    );
    unifiedModal.show();
  });

  document
    .querySelectorAll("#unifiedTemplateTable th[data-sort]")
    .forEach((th) => {
      th.style.cursor = "pointer";
      th.addEventListener("click", function () {
        const sortKey = this.getAttribute("data-sort");
        if (currentSort.column === sortKey) {
          currentSort.order = currentSort.order === "asc" ? "desc" : "asc";
        } else {
          currentSort.column = sortKey;
          currentSort.order = "asc";
        }
        sortAndRenderTemplates();
      });
    });
}

// Function to open the add slide modal programmatically
export function openAddSlideModal() {
  const modalElement = document.getElementById("unifiedSlideModal");
  if (modalElement) {
    const unifiedModal = new bootstrap.Modal(modalElement);
    unifiedModal.show();
  } else {
    console.warn(
      "Add slide modal not found. Please check if the modal DOM element exists.",
    );
  }
}

export { fetchUnifiedTemplates };
