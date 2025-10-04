// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import Sortable from "sortablejs";
import { store } from "./slideStore.js";
import { loadSlide } from "./renderSlide.js";
import * as bootstrap from "bootstrap";
import {
  hideElementToolbars,
  hideResizeHandles,
  removeGradientWrapper,
} from "./elementSelector.js";
import { showConfirmModal } from "../modals/confirmModal.js";
import {
  openSaveAsTemplateModal,
  openEditTemplateMetadataModal,
} from "../modals/templatesModal.js";
import {
  openActivationModal,
  isSlideActiveNow,
} from "../modals/activationModal.js";
import {
  queryParams,
  showToast,
  parentOrgID,
  autoHyphenate,
} from "../../../../utils/utils.js"; // Removed token
import {
  deleteTemplateOnBackend,
  duplicateTemplateOnBackend,
  initTemplateEditor,
} from "./templateDataManager.js"; // Removed fetchAllOrgTemplatesAndPopulateStore, added initTemplateEditor
import { gettext } from "../../../../utils/locales.js";

let slideSortable; // Declare a variable to store the Sortable instance

// Add function to create slide context menu
function createSlideContextMenu(e, slideIndex) {
  e.preventDefault();

  const menu = document.createElement("div");
  menu.className = "custom-context-menu";
  menu.style.position = "absolute";
  menu.style.top = e.clientY + "px";
  menu.style.left = e.clientX + "px";
  menu.style.backgroundColor = "#fff";
  menu.style.border = "1px solid #ccc";
  menu.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
  menu.style.zIndex = "10000";
  menu.style.padding = "5px";
  menu.style.minWidth = "120px";
  menu.style.borderRadius = "4px";

  // Different labels based on editor mode
  const isTemplateEditor =
    queryParams.mode === "template_editor" ||
    queryParams.mode === "suborg_templates";
  const duplicateLabel = isTemplateEditor
    ? gettext("Duplicate Template")
    : gettext("Duplicate Slide");
  const deleteLabel = isTemplateEditor
    ? gettext("Delete Template")
    : gettext("Delete Slide");
  const confirmMessage = isTemplateEditor
    ? gettext("Are you sure you want to delete this template?")
    : gettext("Are you sure you want to delete this slide?");

  const options = [
    {
      label: duplicateLabel,
      icon: "content_copy",
      action: () => {
        duplicateSlide(slideIndex);
        menu.remove();
      },
    },
    {
      label: deleteLabel,
      icon: "delete",
      action: () => {
        showConfirmModal(confirmMessage, () => {
          deleteSlide(slideIndex);
        });
        menu.remove();
      },
    },
  ];

  options.forEach((opt) => {
    const item = document.createElement("div");
    item.style.padding = "8px 12px";
    item.style.cursor = "pointer";
    item.style.display = "flex";
    item.style.alignItems = "center";
    item.style.gap = "8px";

    const icon = document.createElement("i");
    icon.className = "material-symbols-outlined";
    icon.style.fontSize = "16px";
    icon.textContent = opt.icon;

    const text = document.createElement("span");
    text.textContent = opt.label;

    item.appendChild(icon);
    item.appendChild(text);

    item.addEventListener("mouseenter", () => {
      item.style.backgroundColor = "#f8f9fa";
    });
    item.addEventListener("mouseleave", () => {
      item.style.backgroundColor = "#fff";
    });
    item.addEventListener("click", opt.action);
    menu.appendChild(item);
  });

  document.body.appendChild(menu);

  setTimeout(() => {
    function removeMenu(ev) {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener("click", removeMenu);
      }
    }

    document.addEventListener("click", removeMenu);
  }, 0);
}

export function updateSlideSelector() {
  const slideSelector = document.querySelector(".slide-selector");
  slideSelector.innerHTML = "";

  store.slides.forEach((slide, index) => {
    const slideItem = document.createElement("div");
    slideItem.classList.add("slide-item");
    slideItem.dataset.index = index;

    let isActive = true;
    let generalIndicatorClass = ""; // For the button
    if (slide.activationEnabled) {
      generalIndicatorClass = "btn-success"; // Base color when feature is ON

      // Use the exact same logic as the slideshow player
      const now = new Date();
      const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const currentTime =
        now.getHours().toString().padStart(2, "0") +
        ":" +
        now.getMinutes().toString().padStart(2, "0");
      const currentDateString = now.toISOString().split("T")[0];

      if (slide.recurringActivation && slide.recurringActivation.enabled) {
        // Check recurring activation
        const recurring = slide.recurringActivation;
        isActive = false; // Default to inactive for recurring

        // Check if any intervals match the current day and time
        if (recurring.intervals && recurring.intervals.length > 0) {
          for (const interval of recurring.intervals) {
            if (
              interval.day === currentDay &&
              currentTime >= interval.startTime &&
              currentTime <= interval.endTime
            ) {
              isActive = true;
              break;
            }
          }
        }
      } else {
        // Check one-time activation (existing logic)
        if (slide.activationDate && currentDateString < slide.activationDate) {
          isActive = false;
        }
        if (
          slide.deactivationDate &&
          currentDateString > slide.deactivationDate
        ) {
          isActive = false;
        }
      }

      if (!isActive) {
        slideItem.classList.add("inactive-slide"); // Add class for styling inactive slides
        generalIndicatorClass = "btn-secondary"; // Grey out button if inactive NOW
      }
    } else {
      generalIndicatorClass = "btn-secondary"; // Default when feature is OFF
    }

    if (index === store.currentSlideIndex) {
      slideItem.classList.add("active");
    }

    const slideNumber = document.createElement("div");
    slideNumber.classList.add("slide-number");
    slideNumber.textContent = index + 1;

    const slidePreview = document.createElement("div");
    slidePreview.classList.add("slide-preview");

    const previewBox = document.createElement("div");
    previewBox.classList.add("preview-box");
    previewBox.style.border = "1px solid #303331";
    previewBox.style.marginBottom = "5px";
    previewBox.style.borderRadius = "5px";

    // Add CSS for aspect ratio display
    const styleElement = document.createElement("style");
    if (!document.querySelector("#aspect-ratio-styles")) {
      styleElement.id = "aspect-ratio-styles";
      styleElement.textContent = `
        .aspect-ratios {
          font-size: 0.8rem;
          opacity: 0.8;
          text-overflow: ellipsis;
          max-width: 100%;
        }
      `;
      document.head.appendChild(styleElement);
    }

    const slideDetails = document.createElement("div");
    slideDetails.classList.add(
      "slide-details",
      "d-flex",
      "align-items-center",
      "justify-content-between",
    );

    const slideNameDiv = document.createElement("div");
    slideNameDiv.classList.add("slide-name");
    slideNameDiv.classList.add("mb-5");
    const slideNameStrong = document.createElement("span");
    slideNameStrong.innerHTML = autoHyphenate(slide.name);
    slideNameDiv.appendChild(slideNameStrong);

    // Add aspect ratio display for templates
    const isTemplateMode =
      queryParams.mode === "template_editor" ||
      queryParams.mode === "suborg_templates";
    if (
      isTemplateMode &&
      slide.accepted_aspect_ratios &&
      slide.accepted_aspect_ratios.length > 0
    ) {
      const aspectRatioDiv = document.createElement("div");
      aspectRatioDiv.classList.add(
        "aspect-ratios",
        "small",
        "text-muted",
        "mt-1",
      );
      aspectRatioDiv.innerHTML = `<i class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">aspect_ratio</i> ${slide.accepted_aspect_ratios.join(", ")}`;
      slideNameDiv.appendChild(aspectRatioDiv);
    }

    // Add indicator for suborg-specific templates
    if (queryParams.mode === "suborg_templates" && slide.isSuborgTemplate) {
      const suborgBadge = document.createElement("span");
      suborgBadge.classList.add("badge", "bg-info", "ms-2", "small");
      suborgBadge.textContent = "SubOrg";
      suborgBadge.style.fontSize = "10px";
      slideNameDiv.appendChild(suborgBadge);
    } else if (
      queryParams.mode === "suborg_templates" &&
      slide.isGlobalTemplate
    ) {
      const globalBadge = document.createElement("span");
      globalBadge.classList.add("badge", "bg-secondary", "ms-2", "small");
      globalBadge.textContent = "Global";
      globalBadge.style.fontSize = "10px";
      slideNameDiv.appendChild(globalBadge);
    }

    slideNameDiv.addEventListener("click", (e) => {
      e.stopPropagation();
      if (slideNameDiv.querySelector("input")) return;

      const currentName = slide.name;
      const input = document.createElement("input");
      input.type = "text";
      input.value = currentName;
      input.style.width = "100%";
      slideNameDiv.innerHTML = "";
      slideNameDiv.appendChild(input);
      input.focus();

      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          const newName = input.value.trim();
          if (newName) {
            slide.name = newName;
            updateSlideSelector();
          } else {
            alert(gettext("Please enter a valid slide name."));
          }
        }
      });
      input.addEventListener("blur", function () {
        const newName = input.value.trim();
        if (newName) {
          slide.name = newName;
        }
        updateSlideSelector();
      });
    });

    const slideDurationDiv = document.createElement("div");
    slideDurationDiv.classList.add(
      "slide-duration",
      "pe-2",
      "d-flex",
      "align-items-center",
    );

    // Create outer tooltip wrapper for duration
    const durationTooltipWrapper = document.createElement("div");
    durationTooltipWrapper.setAttribute("data-bs-toggle", "tooltip");
    durationTooltipWrapper.setAttribute(
      "data-bs-title",
      gettext("Angiv varighed for slide i sekunder"),
    );

    slideDurationDiv.innerHTML = `<i class="material-symbols-outlined" style="color: var(--secondary);">timer</i>&nbsp;${slide.duration}s`;
    durationTooltipWrapper.appendChild(slideDurationDiv);

    slideDurationDiv.addEventListener("click", (e) => {
      e.stopPropagation();
      if (slideDurationDiv.querySelector("input")) return;

      // Force hide tooltip when editing starts
      const tooltipInstance = bootstrap.Tooltip.getInstance(
        durationTooltipWrapper,
      );
      if (tooltipInstance) {
        tooltipInstance.hide();
        tooltipInstance.disable(); // Also disable it to prevent it from showing again
      }

      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.value = slide.duration;
      input.style.width = "60px";
      slideDurationDiv.innerHTML = "";

      slideDurationDiv.appendChild(input);
      input.focus();

      // Re-enable tooltip when editing is done
      const finishEditing = () => {
        if (tooltipInstance) {
          tooltipInstance.enable();
        }
      };

      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          const newDuration = parseInt(input.value, 10);
          if (newDuration > 0) {
            slide.duration = newDuration;
            finishEditing();
            updateSlideSelector();
          } else {
            alert(gettext("Please enter a valid duration."));
          }
        }
      });
      input.addEventListener("blur", function () {
        const newDuration = parseInt(input.value, 10);
        if (newDuration > 0) {
          slide.duration = newDuration;
        }
        finishEditing();
        updateSlideSelector();
      });
    });

    const slideDetailsButtons = document.createElement("div");
    slideDetailsButtons.className = "d-flex justify-content-between";

    // Create outer tooltip wrapper for calendar button
    const calendarTooltipWrapper = document.createElement("div");
    calendarTooltipWrapper.setAttribute("data-bs-toggle", "tooltip");
    calendarTooltipWrapper.setAttribute(
      "data-bs-title",
      gettext("Advanced Slide Planning"),
    );

    const calendarButton = document.createElement("button");
    calendarButton.classList.add(
      "btn",
      generalIndicatorClass, // Use the determined class
      "btn-sm",
      "me-2",
      "btn-secondary",
    );
    calendarButton.innerHTML = `<i class="material-symbols-outlined" style="vertical-align:middle; color: var(--secondary);">edit_calendar</i>`;

    calendarTooltipWrapper.appendChild(calendarButton);

    // --> ADDED: Click listener <--
    calendarButton.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent slide selection
      // Assuming openActivationModal is globally available or imported
      openActivationModal(index);
    });

    if (
      queryParams.mode !== "template_editor" &&
      queryParams.mode !== "suborg_templates" &&
      store.slideshowMode !== "interactive"
    ) {
      slideDetailsButtons.appendChild(calendarTooltipWrapper);
    }
    const saveAsTemplateBtn = document.createElement("button");
    saveAsTemplateBtn.classList.add("btn", "btn-primary", "btn-sm", "me-2");

    saveAsTemplateBtn.innerHTML =
      '<i class="material-symbols-outlined" style="vertical-align:middle;">share</i>';
    saveAsTemplateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openSaveAsTemplateModal(index);
    });

    if (
      queryParams.mode === "template_editor" ||
      queryParams.mode === "suborg_templates"
    ) {
      saveAsTemplateBtn.innerHTML =
        '<i class="material-symbols-outlined" style="vertical-align:middle;">content_copy</i>';
      saveAsTemplateBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openSaveAsTemplateModal(index);
      });
    }

    //slideDetailsButtons.appendChild(saveAsTemplateBtn);

    // Removed duplicate and delete buttons from here

    if (
      queryParams.mode === "template_editor" ||
      queryParams.mode === "suborg_templates"
    ) {
      // Only show edit button for suborg templates in suborg_templates mode, or all templates in template_editor mode
      const canEdit =
        queryParams.mode === "template_editor" ||
        (queryParams.mode === "suborg_templates" && slide.isSuborgTemplate);

      if (canEdit) {
        const editTemplateMetadataBtn = document.createElement("button");
        editTemplateMetadataBtn.classList.add(
          "btn",
          "btn-outline-info",
          "btn-sm",
          "me-2",
        );
        editTemplateMetadataBtn.innerHTML =
          '<i class="material-symbols-outlined" style="vertical-align:middle;">edit_note</i>';
        editTemplateMetadataBtn.title = gettext("Edit Template Details");
        editTemplateMetadataBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openEditTemplateMetadataModal(index);
        });
        slideDetailsButtons.appendChild(editTemplateMetadataBtn);
      }

      // Only show delete button for templates that can be deleted
      const canDelete =
        queryParams.mode === "template_editor" ||
        (queryParams.mode === "suborg_templates" && slide.isSuborgTemplate);

      if (canDelete) {
        const deleteTemplateBtn = document.createElement("button");
        deleteTemplateBtn.classList.add(
          "btn",
          "btn-outline-danger",
          "btn-sm",
          "me-2",
        );
        deleteTemplateBtn.innerHTML =
          '<i class="material-symbols-outlined" style="vertical-align:middle;">delete</i>';
        deleteTemplateBtn.addEventListener("click", async (e) => {
          // Added event arg e
          e.stopPropagation(); // Prevent slide selection
          const currentSlide = store.slides[index];
          if (!currentSlide || !currentSlide.templateId) {
            showToast(
              gettext("Error: Cannot delete template. Template ID is missing."),
              "Error",
            );
            return;
          }

          showConfirmModal(
            gettext("Are you sure you want to delete this template?"),
            async () => {
              const success = await deleteTemplateOnBackend(
                currentSlide.templateId,
              );
              if (success) {
                if (store.slides.length === 0) {
                  document.querySelector(".preview-slide").innerHTML = "";
                }
                // fetchAllOrgTemplatesAndPopulateStore will be called by deleteTemplateOnBackend if successful
                // No need to call it again here explicitly unless deleteTemplateOnBackend changes
                showToast(
                  gettext("Template deleted and list refreshed."),
                  "Success",
                );
              }
            },
          );
        });
        slideDetailsButtons.appendChild(deleteTemplateBtn); // Moved this line
      }
    }

    slideDetails.appendChild(slideNameDiv);

    if (
      queryParams.mode !== "template_editor" &&
      queryParams.mode !== "suborg_templates" &&
      store.slideshowMode !== "interactive"
    ) {
      slideDetails.appendChild(durationTooltipWrapper); // Changed from slideDurationDiv to durationTooltipWrapper
    }

    if (store.slideshowMode === "interactive") {
      document.getElementById("add-slide-btn").innerText = gettext("Add Page");
      document
        .getElementById("playBtn")
        .setAttribute("data-bs-title", gettext("Preview Interactive Content"));
    }

    slideDetails.appendChild(slideDetailsButtons);

    slidePreview.appendChild(slideDetails);

    slideItem.appendChild(slideNumber);
    slideItem.appendChild(slidePreview);

    slideItem.addEventListener("click", () => {
      // Only deselect elements if we're changing to a different slide
      if (store.currentSlideIndex !== index) {
        // Deselect any currently selected elements
        hideElementToolbars();
        hideResizeHandles();
        removeGradientWrapper(store.selectedElement);
        store.selectedElement = null;
        store.selectedElementData = null;
        window.selectedElementForUpdate = null;
      }

      store.currentSlideIndex = index;
      loadSlide(slide, undefined, undefined, true);

      updateSlideSelector();
    });

    // Add context menu event listener
    slideItem.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      createSlideContextMenu(e, index);
    });

    slideSelector.appendChild(slideItem);
  });

  // Initialize Sortable.js after populating the slide selector
  if (slideSortable) {
    slideSortable.destroy(); // Destroy previous instance if it exists
  }

  slideSortable = new Sortable(slideSelector, {
    animation: 150, // Animation speed in ms
    ghostClass: "sortable-ghost", // Class name for the drop placeholder
    chosenClass: "sortable-chosen", // Class name for the chosen item
    dragClass: "sortable-drag", // Class name for the dragged item
    handle: ".slide-item", // Drag handle selector within list items
    onEnd: function (evt) {
      // Update the store when drag ends
      const fromIndex = evt.oldIndex;
      const toIndex = evt.newIndex;

      if (fromIndex !== toIndex) {
        reorderSlides(fromIndex, toIndex);
      }
    },
  });

  // Update slide numbers after reordering
  updateSlideNumbers();

  // Initialize tooltips for newly created elements
  setTimeout(() => {
    const tooltipTriggerList = slideSelector.querySelectorAll(
      '[data-bs-toggle="tooltip"]',
    );
    [...tooltipTriggerList].forEach((tooltipTriggerEl) => {
      // Dispose existing tooltip if it exists to avoid duplicates
      const existingTooltip = bootstrap.Tooltip.getInstance(tooltipTriggerEl);
      if (existingTooltip) {
        existingTooltip.dispose();
      }

      // Check if this is a duration tooltip to set placement to top
      const isDurationTooltip =
        tooltipTriggerEl.querySelector(".slide-duration");
      const tooltipOptions = isDurationTooltip ? { placement: "top" } : {};

      // Create new tooltip
      new bootstrap.Tooltip(tooltipTriggerEl, tooltipOptions);
    });
  }, 100);
  // Notify other modules that the selected slide may have changed so they can update (e.g. elements list)
  try {
    document.dispatchEvent(
      new CustomEvent("os:slideChanged", {
        detail: { currentSlideIndex: store.currentSlideIndex },
      }),
    );
  } catch (err) {
    // ignore if dispatch fails for any reason
    console.warn("Failed to dispatch os:slideChanged", err);
  }
}

// Add a helper function to update slide numbers
function updateSlideNumbers() {
  const slideItems = document.querySelectorAll(".slide-item");
  slideItems.forEach((item, index) => {
    const slideNumber = item.querySelector(".slide-number");
    if (slideNumber) {
      slideNumber.textContent = index + 1;
    }
    item.dataset.index = index;
  });
}

export function reorderSlides(fromIndex, toIndex) {
  const movedSlide = store.slides.splice(fromIndex, 1)[0];
  store.slides.splice(toIndex, 0, movedSlide);

  if (store.currentSlideIndex === fromIndex) {
    store.currentSlideIndex = toIndex;
  } else if (
    store.currentSlideIndex > fromIndex &&
    store.currentSlideIndex <= toIndex
  ) {
    store.currentSlideIndex--;
  } else if (
    store.currentSlideIndex < fromIndex &&
    store.currentSlideIndex >= toIndex
  ) {
    store.currentSlideIndex++;
  }

  // Only update the active state and slide numbers, no need to rebuild the entire list
  const slideItems = document.querySelectorAll(".slide-item");
  slideItems.forEach((item, index) => {
    if (index === store.currentSlideIndex) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  updateSlideNumbers();
}

function duplicateSlide(slideIndex) {
  // If in template editor mode, use the backend API
  if (
    queryParams.mode === "template_editor" ||
    queryParams.mode === "suborg_templates"
  ) {
    const currentSlide = store.slides[slideIndex];
    if (!currentSlide || !currentSlide.templateId) {
      showToast(
        gettext("Error: Cannot duplicate template. Template ID is missing."),
        "Error",
      );
      return;
    }
    duplicateTemplateOnBackend(currentSlide.templateId);
    return;
  }

  // Original logic for regular slides
  const originalSlide = store.slides[slideIndex];
  const newSlide = JSON.parse(JSON.stringify(originalSlide));

  // Ensure slide and element ID counters are up-to-date
  let maxSlideId = 0;
  store.slides.forEach((s) => {
    if (s.id > maxSlideId) {
      maxSlideId = s.id;
    }
  });
  store.slideIdCounter = Math.max(store.slideIdCounter || 1, maxSlideId + 1);

  let maxElementId = 0;
  store.slides.forEach((s) => {
    if (s.elements && Array.isArray(s.elements)) {
      s.elements.forEach((element) => {
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

  newSlide.id = store.slideIdCounter++;
  newSlide.name = gettext("Copy of ") + originalSlide.name;
  newSlide.undoStack = [];
  newSlide.redoStack = [];

  // Assign new unique IDs to elements
  if (newSlide.elements && Array.isArray(newSlide.elements)) {
    newSlide.elements.forEach((element) => {
      element.id = store.elementIdCounter++;
    });
  }

  store.slides.splice(slideIndex + 1, 0, newSlide);
  updateSlideSelector();
}

function deleteSlide(index) {
  // If in template editor mode, use the backend API
  if (
    queryParams.mode === "template_editor" ||
    queryParams.mode === "suborg_templates"
  ) {
    const currentSlide = store.slides[index];
    if (!currentSlide || !currentSlide.templateId) {
      showToast(
        gettext("Error: Cannot delete template. Template ID is missing."),
        "Error",
      );
      return;
    }
    deleteTemplateOnBackend(currentSlide.templateId);
    return;
  }

  // Original logic for regular slides
  store.slides.splice(index, 1);
  if (store.currentSlideIndex === index) {
    store.currentSlideIndex =
      store.slides.length > 0 ? store.slides.length - 1 : -1; // Ensure -1 if empty
    if (store.currentSlideIndex >= 0) {
      loadSlide(store.slides[store.currentSlideIndex]);
    } else {
      // Clear preview if no slides left
      const previewSlide = document.querySelector(".preview-slide");
      if (previewSlide)
        previewSlide.innerHTML =
          '<p class="text-center text-muted mt-5 no-content-placeholder">' +
          gettext("No slides available.") +
          "</p>";
      // Also clear slideshow name or set to default if applicable
      const slideshowNameEl = document.getElementById("slideshow-name");
      if (slideshowNameEl)
        slideshowNameEl.textContent =
          queryParams.mode === "template_editor"
            ? gettext("Template Manager")
            : gettext("Slideshow");
    }
  } else if (store.currentSlideIndex > index) {
    store.currentSlideIndex--;
  }
  updateSlideSelector();
  if (
    (queryParams.mode === "template_editor" ||
      queryParams.mode === "suborg_templates") &&
    store.slides.length === 0
  ) {
    // If in template editor and all templates are deleted, re-init to show "No templates" message
    initTemplateEditor(parentOrgID);
  }
}
