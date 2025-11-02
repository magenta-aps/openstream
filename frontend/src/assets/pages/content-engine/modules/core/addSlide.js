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
  parentOrgID,
  selectedSubOrgID,
} from "../../../../utils/utils.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";
import {
  getResolutionForAspectRatio,
  findAspectRatioValueByDimensions,
} from "../../../../utils/availableAspectRatios.js";
import * as bootstrap from "bootstrap";
let unifiedTemplates = [];
let selectedUnifiedTemplate = null;

/**
 * Set the resolution based on aspect ratio and update resolution modal
 */
function setResolutionFromAspectRatio(aspectRatio) {
  const { width, height } = getResolutionForAspectRatio(aspectRatio);
  store.emulatedWidth = width;
  store.emulatedHeight = height;

  // Update resolution modal to show the correct active option
  updateResolutionModalSelection(width, height);

  // Update the aspect ratio display in the UI
  updateAspectRatioDisplay();

  // Trigger zoom adjustment to fit the new aspect ratio
  setTimeout(async () => {
    const { scaleAllSlides } = await import("./renderSlide.js");
    const { updateAllSlidesZoom } = await import("../utils/zoomController.js");
    scaleAllSlides();
    updateAllSlidesZoom();
  }, 50);
}

/**
 * Update the resolution modal to show the correct active selection
 */
function updateResolutionModalSelection(width, height) {
  const options = document.querySelectorAll(".resolution-option");
  options.forEach((option) => {
    const optionWidth = parseInt(option.getAttribute("data-width"), 10);
    const optionHeight = parseInt(option.getAttribute("data-height"), 10);

    if (optionWidth === width && optionHeight === height) {
      option.classList.add("active");
    } else {
      option.classList.remove("active");
    }
  });
}

/**
 * Update the aspect ratio display in the UI
 */
function updateAspectRatioDisplay() {
  const currentAspectRatio = getCurrentAspectRatio();

  const aspectRatioElement = document.getElementById("aspect-ratio");
  const aspectRatioValueElement = document.getElementById("aspect-ratio-value");

  if (aspectRatioElement) {
    aspectRatioElement.innerText = currentAspectRatio;
  }
  if (aspectRatioValueElement) {
    aspectRatioValueElement.innerText = currentAspectRatio;
  }
}
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

  return findAspectRatioValueByDimensions(
    store.emulatedWidth,
    store.emulatedHeight,
  );
}

const templateMiniSearcher = createMiniSearchInstance(
  ["name", "category", "tags"],
  { extractField: customTagsExtractField },
);

const noTemplatesFoundAlert = document.getElementById(
  "no-templates-found-alert",
);

/**
 * Determine if we're in suborg branch content creation mode
 * (as opposed to suborg template management mode)
 */
function isSuborgContentCreationMode() {
  // If we're managing templates, allow global templates
  if (
    store.editorMode === "template_editor" ||
    store.editorMode === "suborg_templates"
  ) {
    return false;
  }

  // If we have a suborg selected but we're not managing templates,
  // then we're creating content for the suborg branch
  return true;
}

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
  const orgId = parentOrgID;
  const suborgId = selectedSubOrgID;

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

    // Filter out global templates when creating content for suborg branches
    // Only allow global templates when managing suborg templates (editorMode = "suborg_templates")
    if (suborgId && isSuborgContentCreationMode()) {
      const originalCount = unifiedTemplates.length;
      // Filter to only suborg-specific templates (suborganisation is not null)
      // Global templates have suborganisation === null
      unifiedTemplates = unifiedTemplates.filter(
        (template) => template.suborganisation !== null,
      );
    }

    // Filter templates by aspect ratio to match current slideshow aspect ratio
    const currentAspectRatio = getCurrentAspectRatio();
    if (currentAspectRatio) {
      const originalCount = unifiedTemplates.length;
      unifiedTemplates = unifiedTemplates.filter(
        (template) => template.aspect_ratio === currentAspectRatio,
      );
      console.log(
        `Filtered templates by aspect ratio ${currentAspectRatio}: ${originalCount} → ${unifiedTemplates.length}`,
      );
    }

    // Templates now set their own aspect ratio automatically, so no filtering needed
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

  // Get the current aspect ratio for filtering
  const currentAspectRatio = getCurrentAspectRatio();

  console.log("Filtering templates:");
  console.log("- Current aspect ratio:", currentAspectRatio);
  console.log("- Total templates before filtering:", searchResults.length);

  filteredTemplates = searchResults.filter((t) => {
    const categoryMatch =
      selectedCategoryIds.length === 0 ||
      selectedCategoryIds.includes(t.category?.id);

    // Filter by aspect ratio - template must match current aspect ratio
    const aspectRatioMatch = t.aspect_ratio === currentAspectRatio;

    if (!aspectRatioMatch) {
      console.log(
        `- Template "${t.name}" filtered out: has aspect ratio "${t.aspect_ratio}" but current is "${currentAspectRatio}"`,
      );
    }

    return categoryMatch && aspectRatioMatch;
  });

  console.log("- Templates after filtering:", filteredTemplates.length);
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

      // Set resolution based on template's aspect ratio
      if (selectedUnifiedTemplate.aspect_ratio) {
        setResolutionFromAspectRatio(selectedUnifiedTemplate.aspect_ratio);
      }

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
      const previewContainer =
        document.querySelector(".preview-column .preview-container") ||
        document.querySelector(".slide-canvas .preview-container");
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
