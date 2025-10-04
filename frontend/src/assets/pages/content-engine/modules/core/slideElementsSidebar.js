// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { selectElement } from "./elementSelector.js";
import { pushCurrentSlideState } from "./undoRedo.js";
import { loadSlide, updateSlideElement } from "./renderSlide.js";
import { queryParams } from "../../../../utils/utils.js";
import { gettext } from "../../../../utils/locales.js";
import { showToast } from "../../../../utils/utils.js";
import { getNewZIndex } from "../utils/domUtils.js";
import { isElementLocked } from "../element_formatting/lockElement.js";
import {
  replaceElementWithType,
  getAvailableElementTypes,
  isConversionSupported,
} from "../utils/elementTypeConverter.js";
import Sortable from "sortablejs";

// Simple HTML escape for insertion into innerHTML
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function computeZOrderRanks(slideElements) {
  // slideElements is expected to be an array of element data objects with zIndex numeric
  const withIndex = slideElements.map((el, idx) => ({ el, idx }));
  // Sort by isAlwaysOnTop descending, then zIndex descending so highest zIndex (topmost) comes first.
  // If undefined, treat as 0.
  withIndex.sort((a, b) => {
    if (a.el.isAlwaysOnTop && !b.el.isAlwaysOnTop) return -1;
    if (!a.el.isAlwaysOnTop && b.el.isAlwaysOnTop) return 1;
    return (b.el.zIndex || 0) - (a.el.zIndex || 0);
  });
  // Build a map from element id -> rank (1..N) where 1 is topmost
  const rankMap = {};
  withIndex.forEach((item, sortedPos) => {
    rankMap[item.el.id] = sortedPos + 1;
  });
  return rankMap;
}

function elementSummary(dataObj) {
  // type, position (gridX, gridY) or (x,y), size (gridWidth, gridHeight or width/height)
  const type = dataObj.type || "?";
  const pos =
    typeof dataObj.gridX !== "undefined"
      ? `${dataObj.gridX}, ${dataObj.gridY}`
      : `${dataObj.x || "-"}, ${dataObj.y || "-"}`;
  const size =
    dataObj.gridWidth && dataObj.gridHeight
      ? `${dataObj.gridWidth}x${dataObj.gridHeight}`
      : `${dataObj.width || "-"}x${dataObj.height || "-"}`;
  return { type, pos, size };
}

function getLinkOptions(dataObj) {
  let options = `<option value="Open page by clicking ..">${gettext("Open page by clicking ..")}</option>`;
  store.slides.forEach((slide, index) => {
    const selected =
      typeof dataObj.goToSlideIndex === "number" &&
      dataObj.goToSlideIndex === index
        ? "selected"
        : "";
    options += `<option value="${index}" ${selected}>${index + 1}: ${slide.name}</option>`;
  });
  return options;
}

export function renderSlideElementsSidebar() {
  const container = document.getElementById("slide-elements-list");
  if (!container) return;

  // Clean up old popovers and event listeners
  // Preserve any currently open popovers so interactions inside them
  // (clicks, input changes) that cause a re-render don't make the
  // popover disappear permanently. We'll restore visible popovers after
  // the re-render completes.
  const currentlyOpenPopovers = new Set();
  try {
    document.querySelectorAll(".element-settings-popover").forEach((p) => {
      if (p && p.style && p.style.display === "block")
        currentlyOpenPopovers.add(p.id);
    });
  } catch (err) {
    // ignore DOM access errors in non-browser envs
  }

  // Clean up old popovers and event listeners
  if (window.__popoverCleanupFunctions) {
    window.__popoverCleanupFunctions.forEach((fn) => fn());
    window.__popoverCleanupFunctions = [];
  }

  // Initialize cleanup functions array
  window.__popoverCleanupFunctions = window.__popoverCleanupFunctions || [];
  // Keep the set around so newly-created popovers can be restored
  window.__previouslyOpenPopovers = currentlyOpenPopovers;

  // Determine current slide from store
  const slide = store.slides[store.currentSlideIndex];
  // Build a merged list of elements to show in the sidebar:
  // - all elements on the current slide
  // - all persistent (pinned) elements from all slides
  // Deduplicate by id so each element appears only once.
  const elementsMap = {};
  if (slide && slide.elements) {
    slide.elements.forEach((el) => {
      elementsMap[el.id] = el;
    });
  }

  // Add pinned elements from all slides
  store.slides.forEach((s) => {
    (s.elements || []).forEach((el) => {
      if (el.isPersistent) elementsMap[el.id] = el;
    });
  });

  const elementsArray = Object.values(elementsMap);
  if (!elementsArray.length) {
    container.innerHTML = `<div class="text-muted small">No elements</div>`;
    return;
  }

  // Compute z-order ranks across the merged set
  const rankMap = computeZOrderRanks(elementsArray);

  // Build rows: iterate elements with always on top first, then by descending z-index
  container.innerHTML = "";
  const elementsSorted = [...elementsArray].sort((a, b) => {
    if (a.isAlwaysOnTop && !b.isAlwaysOnTop) return -1;
    if (!a.isAlwaysOnTop && b.isAlwaysOnTop) return 1;
    return (b.zIndex || 0) - (a.zIndex || 0);
  });
  elementsSorted.forEach((elData) => {
    const rank = rankMap[elData.id] || "-";
    const summary = elementSummary(elData);
    const row = document.createElement("div");
    row.className =
      "list-group-item px-1 py-1 d-flex justify-content-between align-items-start my-1 border border-dark rounded";

    // Add visual indicator if element is locked from template changes
    // In suborg_templates mode, show overlay if locked from parent OR if preventSettingsChanges is enabled
    // In other non-editor modes, show overlay if preventSettingsChanges is enabled
    // In template_editor mode, never show the overlay (editors can always edit)
    if (queryParams.mode === "suborg_templates") {
      if (elData.lockedFromParent || elData.preventSettingsChanges) {
        row.classList.add("element-locked-from-template");
      }
    } else if (
      queryParams.mode !== "template_editor" &&
      elData.preventSettingsChanges
    ) {
      row.classList.add("element-locked-from-template");
    }

    row.dataset.elId = elData.id;
    // We'll render a checkbox with a pin icon in the right column to toggle persistence

    // Render a clear, semantic summary where each property is on its own line.
    // Name is editable in-place (defaults to type). Clicking the input should
    // not select the element; changes are applied to the element data and
    // the sidebar is re-rendered.
    const displayName = elData.name || summary.type;

    // Build active icons display (only show icons for enabled settings)
    const activeIcons = [];
    if (
      elData.isPersistent &&
      queryParams.mode !== "template_editor" &&
      queryParams.mode !== "suborg_templates"
    )
      activeIcons.push(
        `<span class="active-setting-icon" title="${gettext("Pinned")}"><i class="material-symbols-outlined">push_pin</i></span>`,
      );
    if (elData.isLocked)
      activeIcons.push(
        `<span class="active-setting-icon" title="${gettext("Locked")}"><i class="material-symbols-outlined">lock</i></span>`,
      );
    if (elData.isSelectionBlocked)
      activeIcons.push(
        `<span class="active-setting-icon" title="${gettext("Selection blocked")}"><i class="material-symbols-outlined">block</i></span>`,
      );
    if (elData.isAlwaysOnTop)
      activeIcons.push(
        `<span class="active-setting-icon" title="${gettext("Always on top")}"><i class="material-symbols-outlined">vertical_align_top</i></span>`,
      );
    if (
      (queryParams.mode === "template_editor" ||
        queryParams.mode === "suborg_templates") &&
      elData.preventSettingsChanges
    ) {
      const lockTitle =
        queryParams.mode === "suborg_templates" && elData.lockedFromParent
          ? gettext("Settings locked by parent template")
          : gettext("Settings locked");
      activeIcons.push(
        `<span class="active-setting-icon" title="${lockTitle}"><i class="material-symbols-outlined">lock_person</i></span>`,
      );
    }

    row.innerHTML = `
      <div class="w-100">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div class="d-flex align-items-center gap-1">
            ${activeIcons.join("")}
          </div>
          <div class="d-flex align-items-center gap-1">
            <span class="rank-badge">${rank}</span>
            <button class="btn btn-sm btn-link p-0 element-settings-btn" id="settings-btn-${elData.id}" type="button" title="${gettext("Element settings")}">
              <span class="material-symbols-outlined">more_vert</span>
            </button>
          </div>
        </div>
        <div class="fw-bold mb-1">
          <label class="visually-hidden">Name</label>
          <input id="el-name-${elData.id}" class="form-control form-control-sm p-0 m-0 border-0 bg-transparent fw-bold" type="text" value="${escapeHtml(displayName)}" aria-label="Element name" />
        </div>
        <div class="text-muted small mb-1"><strong>${gettext("Type")}:</strong> ${summary.type}</div>
        <div class="text-muted small mb-1"><strong>${gettext("Size")}:</strong> ${summary.size}</div>
        <div class="text-muted small mb-1"><strong>${gettext("Position")}:</strong> ${summary.pos}</div>
        ${store.slideshowMode === "interactive" && queryParams.mode === "edit" ? `<div class="text-muted small mb-1"><strong>${gettext("Link")}:</strong> <select id="link-select-${elData.id}" class="form-select form-select-sm">${getLinkOptions(elData)}</select></div>` : ""}
      </div>
      
      <!-- Settings Popover -->
      <div class="element-settings-popover" id="popover-${elData.id}" style="display: none;">
        <div class="popover-header">
          <strong>${gettext("Element Settings")}</strong>
          <button class="btn btn-link p-0 popover-close-btn" id="close-popover-${elData.id}" type="button" title="${gettext("Close")}">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="popover-body">
          <!-- Name editing section -->
          <div class="setting-item mb-3">
            <label class="form-label fw-semibold">${gettext("Name")}</label>
            <input id="popover-name-${elData.id}" class="form-control form-control-sm" type="text" value="${escapeHtml(displayName)}" placeholder="${gettext("Element name")}" />
          </div>
          
          <!-- Position and Size editing section -->
          <div class="setting-item mb-3">
            <label class="form-label fw-semibold">${gettext("Position & Size")}</label>
            <div class="row g-2">
              <div class="col-6">
                <label class="form-label small text-muted">${gettext("X Position")}</label>
                <input id="position-x-${elData.id}" class="form-control form-control-sm" type="number" value="${typeof elData.gridX !== "undefined" ? elData.gridX : elData.x || 0}" />
              </div>
              <div class="col-6">
                <label class="form-label small text-muted">${gettext("Y Position")}</label>
                <input id="position-y-${elData.id}" class="form-control form-control-sm" type="number" value="${typeof elData.gridY !== "undefined" ? elData.gridY : elData.y || 0}" />
              </div>
              <div class="col-6">
                <label class="form-label small text-muted">${gettext("Width")}</label>
                <input id="size-width-${elData.id}" class="form-control form-control-sm" type="number" value="${elData.gridWidth || elData.width || 0}" />
              </div>
              <div class="col-6">
                <label class="form-label small text-muted">${gettext("Height")}</label>
                <input id="size-height-${elData.id}" class="form-control form-control-sm" type="number" value="${elData.gridHeight || elData.height || 0}" />
              </div>
            </div>
          </div>
          
          <hr class="my-3">
          
          ${
            queryParams.mode === "edit"
              ? `
          <div class="setting-item mb-3">
            <div class="d-flex align-items-start">
              <input type="checkbox" id="pin-checkbox-${elData.id}" class="form-check-input me-2 mt-1" ${elData.isPersistent ? "checked" : ""}>
              <div class="flex-grow-1">
                <label for="pin-checkbox-${elData.id}" class="form-check-label fw-semibold d-flex align-items-center gap-1">
                  <span class="material-symbols-outlined small-icon">push_pin</span>
                  ${gettext("Pin element")}
                </label>
                <div class="text-muted small">${gettext("Element appears on all slides")}</div>
              </div>
            </div>
          </div>
          `
              : ""
          }
          
          <div class="setting-item mb-3">
            <div class="d-flex align-items-start">
              <input type="checkbox" id="lock-checkbox-${elData.id}" class="form-check-input me-2 mt-1" ${elData.isLocked ? "checked" : ""}>
              <div class="flex-grow-1">
                <label for="lock-checkbox-${elData.id}" class="form-check-label fw-semibold d-flex align-items-center gap-1">
                  <span class="material-symbols-outlined small-icon">${elData.isLocked ? "lock" : "lock_open"}</span>
                  ${gettext("Lock position & size")}
                </label>
                <div class="text-muted small">${gettext("Prevent moving or resizing this element")}</div>
              </div>
            </div>
          </div>
          
          <div class="setting-item mb-3">
            <div class="d-flex align-items-start">
              <input type="checkbox" id="block-select-checkbox-${elData.id}" class="form-check-input me-2 mt-1" ${elData.isSelectionBlocked ? "checked" : ""}>
              <div class="flex-grow-1">
                <label for="block-select-checkbox-${elData.id}" class="form-check-label fw-semibold d-flex align-items-center gap-1">
                  <span class="material-symbols-outlined small-icon">block</span>
                  ${gettext("Block selection")}
                </label>
                <div class="text-muted small">${gettext("Element cannot be selected on the canvas")}</div>
              </div>
            </div>
          </div>
          
          <div class="setting-item mb-3">
            <div class="d-flex align-items-start">
              <input type="checkbox" id="always-on-top-checkbox-${elData.id}" class="form-check-input me-2 mt-1" ${elData.isAlwaysOnTop ? "checked" : ""}>
              <div class="flex-grow-1">
                <label for="always-on-top-checkbox-${elData.id}" class="form-check-label fw-semibold d-flex align-items-center gap-1">
                  <span class="material-symbols-outlined small-icon">vertical_align_top</span>
                  ${gettext("Always on top")}
                </label>
                <div class="text-muted small">${gettext("Element stays above all other elements")}</div>
              </div>
            </div>
          </div>
          
          ${
            queryParams.mode === "template_editor" ||
            queryParams.mode === "suborg_templates"
              ? `
          <hr class="my-3">
          <div class="setting-item template-lock-setting">
            <div class="d-flex align-items-start">
              <div class="form-check form-switch w-100">
                <input class="form-check-input" type="checkbox" role="switch" id="force-settings-toggle-${elData.id}" ${elData.preventSettingsChanges ? "checked" : ""} ${queryParams.mode === "suborg_templates" && elData.lockedFromParent ? "disabled" : ""}>
                <label class="form-check-label fw-semibold d-flex align-items-center gap-1" for="force-settings-toggle-${elData.id}">
                  <span class="material-symbols-outlined small-icon">lock_person</span>
                  ${gettext("Block editing of element settings")}
                </label>
                <div class="text-muted small mt-1">${queryParams.mode === "suborg_templates" && elData.lockedFromParent ? gettext("This element's settings are locked by the parent global template and cannot be unlocked") : gettext("Prevent users from modifying this element's position, size, and other settings when using this template")}</div>
              </div>
            </div>
          </div>
          `
              : ""
          }
          
          <hr class="my-3">
          <div class="setting-item mb-3">
            <label class="form-label fw-semibold">${gettext("Change element type")}</label>
            <select id="change-element-type-select-${elData.id}" class="form-select form-select-sm">
              <option value="">${gettext("Select new type...")}</option>
            </select>
          </div>
          <div class="setting-item">
            <button class="btn btn-danger btn-sm w-100 d-flex align-items-center justify-content-center gap-2" id="delete-element-btn-${elData.id}" type="button">
              <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
              ${gettext("Delete element")}
            </button>
          </div>
        </div>
      </div>
    `;

    // Wire up settings button to show/hide popover
    const settingsBtn = row.querySelector(`#settings-btn-${elData.id}`);
    const popover = row.querySelector(`#popover-${elData.id}`);
    const closePopoverBtn = row.querySelector(`#close-popover-${elData.id}`);

    if (settingsBtn && popover) {
      // Move popover to body to avoid z-index/overflow issues
      document.body.appendChild(popover);

      // Ensure interactions inside the popover do not bubble to global
      // handlers that treat clicks as "outside" clicks (which close it).
      const stopPropagationHandler = (ev) => {
        ev.stopPropagation();
      };
      popover.addEventListener("click", stopPropagationHandler);
      popover.addEventListener("pointerdown", stopPropagationHandler);
      popover.addEventListener("focusin", stopPropagationHandler);

      // Register cleanup to remove these listeners
      window.__popoverCleanupFunctions.push(() => {
        try {
          popover.removeEventListener("click", stopPropagationHandler);
          popover.removeEventListener("pointerdown", stopPropagationHandler);
          popover.removeEventListener("focusin", stopPropagationHandler);
        } catch (err) {}
      });

      const showPopover = () => {
        const MARGIN = 8; // keep some breathing room from edges

        const preferredWidth = 320;
        const maxAllowedWidth = Math.min(
          preferredWidth,
          window.innerWidth - MARGIN * 2,
        );
        const popoverComputedWidth = Math.max(200, maxAllowedWidth);

        const popoverHeight = window.innerHeight - MARGIN * 2;

        popover.style.position = "fixed";
        popover.style.bottom = `${MARGIN}px`;
        popover.style.right = `${MARGIN}px`;
        popover.style.width = `${Math.round(popoverComputedWidth)}px`;
        popover.style.height = `${Math.round(popoverHeight)}px`;
        popover.style.top = "";
        popover.style.left = "";
        popover.style.maxHeight = "";
        popover.style.overflow = "visible";
        popover.style.display = "block";
      };

      const openPopover = (e) => {
        e.stopPropagation();
        e.preventDefault();

        // Close all other popovers first
        document.querySelectorAll(".element-settings-popover").forEach((p) => {
          if (p !== popover) {
            p.style.display = "none";
          }
        });

        // Toggle this popover using helper
        const isVisible = popover.style.display === "block";
        if (isVisible) {
          popover.style.display = "none";
        } else {
          showPopover();
          // mark as previously open so a re-render can re-open it
          if (window.__previouslyOpenPopovers)
            window.__previouslyOpenPopovers.add(popover.id);
        }
      };

      settingsBtn.addEventListener("click", openPopover);

      // Add right-click (context menu) support for opening popover
      row.addEventListener("contextmenu", openPopover);

      if (closePopoverBtn) {
        closePopoverBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          popover.style.display = "none";
          if (window.__previouslyOpenPopovers)
            window.__previouslyOpenPopovers.delete(popover.id);
        });
      }

      // Register cleanup function for this popover
      if (window.__popoverCleanupFunctions && popover) {
        window.__popoverCleanupFunctions.push(() => {
          try {
            if (popover && popover.parentNode) {
              popover.parentNode.removeChild(popover);
            }
          } catch (err) {}
        });
      }
    }

    // Wire up popover name input
    const popoverNameInput = popover
      ? popover.querySelector(`#popover-name-${elData.id}`)
      : null;
    if (popoverNameInput) {
      popoverNameInput.addEventListener("click", (e) => e.stopPropagation());

      const commitPopoverName = () => {
        const newName = popoverNameInput.value.trim();
        elData.name = newName || elData.type;
        renderSlideElementsSidebar();
      };

      popoverNameInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          commitPopoverName();
        } else if (ev.key === "Escape") {
          popoverNameInput.value = elData.name || elData.type;
        }
      });

      popoverNameInput.addEventListener("blur", () => {
        try {
          commitPopoverName();
        } catch (err) {
          console.warn("Failed to commit element name from popover", err);
        }
      });
    }

    // Ensure all inputs inside this popover stop propagation for click/pointer events
    try {
      if (popover) {
        popover
          .querySelectorAll("input, select, textarea, button")
          .forEach((inp) => {
            inp.addEventListener("click", (e) => e.stopPropagation());
            inp.addEventListener("pointerdown", (e) => e.stopPropagation());
            inp.addEventListener("focusin", (e) => e.stopPropagation());
          });
      }
    } catch (err) {}

    // Wire up position and size inputs
    const positionXInput = popover
      ? popover.querySelector(`#position-x-${elData.id}`)
      : null;
    const positionYInput = popover
      ? popover.querySelector(`#position-y-${elData.id}`)
      : null;
    const sizeWidthInput = popover
      ? popover.querySelector(`#size-width-${elData.id}`)
      : null;
    const sizeHeightInput = popover
      ? popover.querySelector(`#size-height-${elData.id}`)
      : null;

    [positionXInput, positionYInput, sizeWidthInput, sizeHeightInput].forEach(
      (input) => {
        if (input) {
          input.addEventListener("click", (e) => e.stopPropagation());

          const commitPositionSize = () => {
            try {
              pushCurrentSlideState();
            } catch (err) {}

            // Prevent changes outside template editor when flagged
            // In suborg_templates mode, respect parent template locks
            const isSettingsLocked =
              (queryParams.mode !== "template_editor" &&
                queryParams.mode !== "suborg_templates" &&
                elData.preventSettingsChanges) ||
              (queryParams.mode === "suborg_templates" &&
                elData.lockedFromParent);
            if (isSettingsLocked) {
              try {
                showToast(
                  gettext(
                    "This element's settings are enforced by the template.",
                  ),
                  "Info",
                );
              } catch (err) {}
              // Revert values
              if (positionXInput)
                positionXInput.value =
                  typeof elData.gridX !== "undefined"
                    ? elData.gridX
                    : elData.x || 0;
              if (positionYInput)
                positionYInput.value =
                  typeof elData.gridY !== "undefined"
                    ? elData.gridY
                    : elData.y || 0;
              if (sizeWidthInput)
                sizeWidthInput.value = elData.gridWidth || elData.width || 0;
              if (sizeHeightInput)
                sizeHeightInput.value = elData.gridHeight || elData.height || 0;
              return;
            }

            // Update element data
            const newX = parseFloat(positionXInput?.value) || 0;
            const newY = parseFloat(positionYInput?.value) || 0;
            const newWidth = parseFloat(sizeWidthInput?.value) || 0;
            const newHeight = parseFloat(sizeHeightInput?.value) || 0;

            // Update the appropriate position properties based on what exists
            if (typeof elData.gridX !== "undefined") {
              elData.gridX = newX;
              elData.gridY = newY;
            } else {
              elData.x = newX;
              elData.y = newY;
            }

            // Update the appropriate size properties
            if (
              elData.gridWidth !== undefined ||
              elData.gridHeight !== undefined
            ) {
              elData.gridWidth = newWidth;
              elData.gridHeight = newHeight;
            } else {
              elData.width = newWidth;
              elData.height = newHeight;
            }

            // Update DOM element if present
            try {
              updateSlideElement(elData);
            } catch (err) {
              console.warn(
                "Failed to update element after changing position/size",
                err,
              );
            }

            // Re-render sidebar to show updated values
            renderSlideElementsSidebar();
          };

          input.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              input.blur();
            }
          });

          input.addEventListener("blur", () => {
            try {
              commitPositionSize();
            } catch (err) {
              console.warn("Failed to commit position/size change", err);
            }
          });
        }
      },
    );

    // Wire up pin checkbox behavior (now from popover) - only in edit mode
    const pinCheckbox =
      queryParams.mode === "edit" && popover
        ? popover.querySelector(`#pin-checkbox-${elData.id}`)
        : null;

    if (pinCheckbox) {
      // prevent checkbox clicks from selecting the row
      pinCheckbox.addEventListener("click", (e) => e.stopPropagation());
      pinCheckbox.addEventListener("change", (e) => {
        e.stopPropagation();
        // push undo state
        try {
          pushCurrentSlideState();
        } catch (err) {
          // ignore if undo not available
        }
        // Prevent changes outside template editor when flagged
        const isSettingsLocked =
          (queryParams.mode !== "template_editor" &&
            queryParams.mode !== "suborg_templates" &&
            elData.preventSettingsChanges) ||
          (queryParams.mode === "suborg_templates" && elData.lockedFromParent);
        if (isSettingsLocked) {
          try {
            showToast(
              gettext("This element's settings are enforced by the template."),
              "Info",
            );
          } catch (err) {}
          // Revert checkbox
          pinCheckbox.checked = !!elData.isPersistent;
          return;
        }

        const shouldBePersistent = pinCheckbox.checked;
        // Toggle persistence flag on the element data
        elData.isPersistent = shouldBePersistent;

        // Update just this element in the preview (more efficient than reloading entire slide)
        try {
          updateSlideElement(elData);
        } catch (err) {
          console.warn(
            "Failed to update element after toggling persistence",
            err,
          );
        }

        // Don't close popover - user might want to change multiple settings

        // Re-render sidebar to update all rows
        renderSlideElementsSidebar();
      });
    }

    // Wire up template lock toggle (only in template editor, now from popover)
    if (
      queryParams.mode === "template_editor" ||
      queryParams.mode === "suborg_templates"
    ) {
      const forceSettingsToggle = popover
        ? popover.querySelector(`#force-settings-toggle-${elData.id}`)
        : null;
      if (forceSettingsToggle) {
        forceSettingsToggle.addEventListener("click", (e) =>
          e.stopPropagation(),
        );
        forceSettingsToggle.addEventListener("change", (e) => {
          e.stopPropagation();

          // In suborg_templates mode, prevent unlocking if element is locked from parent
          if (
            queryParams.mode === "suborg_templates" &&
            elData.lockedFromParent &&
            !forceSettingsToggle.checked
          ) {
            forceSettingsToggle.checked = true;
            showToast(
              gettext(
                "Cannot unlock this element - it is locked by the parent global template",
              ),
              "Warning",
            );
            return;
          }

          try {
            pushCurrentSlideState();
          } catch (err) {}
          elData.preventSettingsChanges = !!forceSettingsToggle.checked;

          // Don't close popover - user might want to change multiple settings

          renderSlideElementsSidebar();
        });
      }
    }

    // Wire up change element type select (in popover)
    const changeTypeSelect = popover
      ? popover.querySelector(`#change-element-type-select-${elData.id}`)
      : null;
    if (changeTypeSelect) {
      // Populate select with available element types
      const availableTypes = getAvailableElementTypes();

      // Determine current element type (handle iframe/dynamic-element mapping)
      const currentElementType =
        elData.type === "iframe" && elData.isDynamic
          ? "dynamic-element"
          : elData.type;

      // Clear the default placeholder option and add current type as first option
      changeTypeSelect.innerHTML = "";

      // Add current type as the first (selected) option
      const currentTypeInfo = availableTypes.find(
        (t) => t.type === currentElementType,
      );
      if (currentTypeInfo) {
        const currentOption = document.createElement("option");
        currentOption.value = currentElementType;
        currentOption.textContent = `${currentTypeInfo.name} (current)`;
        currentOption.selected = true;
        currentOption.disabled = true;
        changeTypeSelect.appendChild(currentOption);
      }

      // Add type options
      availableTypes.forEach((typeInfo) => {
        // Skip current type and placeholder type
        if (
          typeInfo.type === currentElementType ||
          typeInfo.type === "placeholder"
        )
          return;

        // Check if conversion is supported
        const sourceTypeForCheck =
          elData.type === "iframe" && elData.isDynamic
            ? "dynamic-element"
            : elData.type;
        if (!isConversionSupported(sourceTypeForCheck, typeInfo.type)) return;

        const option = document.createElement("option");
        option.value = typeInfo.type;
        option.textContent = typeInfo.name;
        changeTypeSelect.appendChild(option);
      });

      // Handle selection change
      changeTypeSelect.addEventListener("change", (e) => {
        e.stopPropagation();

        const selectedType = changeTypeSelect.value;
        if (!selectedType) return;

        try {
          // Convert the element type
          replaceElementWithType(elData, selectedType);

          // Close popover
          if (popover) popover.style.display = "none";

          const typeInfo = availableTypes.find((t) => t.type === selectedType);
          showToast(
            gettext(`Element converted to ${typeInfo?.name || selectedType}`),
            "Success",
          );
        } catch (error) {
          console.error("Error converting element type:", error);
          showToast(gettext("Failed to convert element type"), "Error");
          // Reset select to default
          changeTypeSelect.value = "";
        }
      });

      window.__popoverCleanupFunctions.push(() => {
        // Cleanup function will be called when sidebar is re-rendered
      });
    }

    // Wire up delete button (in popover)
    const deleteBtn = popover
      ? popover.querySelector(`#delete-element-btn-${elData.id}`)
      : null;
    if (deleteBtn) {
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        // Check if the element is locked - if so, prevent deletion (except in template editor)
        if (isElementLocked(elData) && queryParams.mode !== "template_editor") {
          try {
            showToast(gettext("Cannot delete locked element"), "Warning");
          } catch (err) {}
          return;
        }

        // Confirm deletion
        if (
          !confirm(gettext("Are you sure you want to delete this element?"))
        ) {
          return;
        }

        try {
          pushCurrentSlideState();
        } catch (err) {}

        // Remove element from store
        if (elData.isPersistent) {
          // For persistent elements, remove from all slides
          store.slides.forEach((slide) => {
            slide.elements = slide.elements.filter((el) => el.id !== elData.id);
          });
        } else {
          // For non-persistent elements, remove from current slide only
          const currentSlide = store.slides[store.currentSlideIndex];
          if (currentSlide) {
            currentSlide.elements = currentSlide.elements.filter(
              (el) => el.id !== elData.id,
            );
          }
        }

        // Remove element from DOM
        const domEl = document.getElementById("el-" + elData.id);
        if (domEl) {
          domEl.remove();
        }

        // Remove gradient wrapper if present
        document.querySelector(".gradient-border-wrapper")?.remove();

        // Clear selection if this was the selected element
        if (
          store.selectedElementData &&
          store.selectedElementData.id === elData.id
        ) {
          store.selectedElement = null;
          store.selectedElementData = null;

          // Hide element toolbars
          document
            .querySelectorAll(".element-type-toolbar")
            .forEach((toolbar) =>
              toolbar.classList.replace("d-flex", "d-none"),
            );
        }

        // Close popover
        if (popover) popover.style.display = "none";

        // Re-render sidebar
        renderSlideElementsSidebar();

        // No need to reload slide - DOM element was already removed above
      });
    }

    // Wire up lock checkbox behavior (now from popover)
    const lockCheckbox = popover
      ? popover.querySelector(`#lock-checkbox-${elData.id}`)
      : null;

    if (lockCheckbox) {
      // prevent checkbox clicks from selecting the row and from bubbling to global handlers
      lockCheckbox.addEventListener("click", (e) => e.stopPropagation());
      lockCheckbox.addEventListener("change", (e) => {
        e.stopPropagation();
        try {
          pushCurrentSlideState();
        } catch (err) {
          // ignore if undo not available
        }

        // Prevent changes outside template editor when flagged
        const isSettingsLocked =
          (queryParams.mode !== "template_editor" &&
            queryParams.mode !== "suborg_templates" &&
            elData.preventSettingsChanges) ||
          (queryParams.mode === "suborg_templates" && elData.lockedFromParent);
        if (isSettingsLocked) {
          try {
            showToast(
              gettext("This element's settings are enforced by the template."),
              "Info",
            );
          } catch (err) {}
          lockCheckbox.checked = !!elData.isLocked;
          return;
        }

        const shouldBeLocked = lockCheckbox.checked;
        // Toggle locked flag on the element data
        elData.isLocked = shouldBeLocked;

        // Update just this element in the preview (more efficient than reloading entire slide)
        try {
          updateSlideElement(elData);
        } catch (err) {
          console.warn("Failed to update element after toggling lock", err);
        }

        // Don't close popover - user might want to change multiple settings

        // Re-render sidebar to update all rows
        renderSlideElementsSidebar();
      });
    }

    // Wire up always on top checkbox behavior (now from popover)
    const alwaysOnTopCheckbox = popover
      ? popover.querySelector(`#always-on-top-checkbox-${elData.id}`)
      : null;

    if (alwaysOnTopCheckbox) {
      alwaysOnTopCheckbox.addEventListener("click", (e) => e.stopPropagation());
      alwaysOnTopCheckbox.addEventListener("change", (e) => {
        e.stopPropagation();
        try {
          pushCurrentSlideState();
        } catch (err) {
          // ignore if undo not available
        }

        // Prevent changes outside template editor when flagged
        const isSettingsLocked =
          (queryParams.mode !== "template_editor" &&
            queryParams.mode !== "suborg_templates" &&
            elData.preventSettingsChanges) ||
          (queryParams.mode === "suborg_templates" && elData.lockedFromParent);
        if (isSettingsLocked) {
          try {
            showToast(
              gettext("This element's settings are enforced by the template."),
              "Info",
            );
          } catch (err) {}
          alwaysOnTopCheckbox.checked = !!elData.isAlwaysOnTop;
          return;
        }

        const shouldBeAlwaysOnTop = alwaysOnTopCheckbox.checked;
        elData.isAlwaysOnTop = shouldBeAlwaysOnTop;

        // Adjust zIndex
        // Reserve a high range for always-on-top elements so they cannot be
        // accidentally covered by regular elements. Use a large base offset
        // and keep always-on-top elements inside that bucket.
        const ALWAYS_ON_TOP_BASE = 100000;
        const alwaysOnTopElements = elementsArray.filter(
          (el) => el.isAlwaysOnTop && el.id !== elData.id,
        );
        if (shouldBeAlwaysOnTop) {
          // Determine next offset inside the always-on-top bucket
          const offsets = alwaysOnTopElements
            .map((el) => (Number(el.zIndex) || 0) - ALWAYS_ON_TOP_BASE)
            .filter((n) => n >= 0);
          const nextOffset = offsets.length ? Math.max(...offsets) + 1 : 1;
          elData.zIndex = ALWAYS_ON_TOP_BASE + nextOffset;
        } else {
          // When removing always-on-top, put element back into the regular z-index space
          try {
            elData.zIndex = getNewZIndex();
          } catch (err) {
            // Fallback to 1 if z-index utility is unavailable for any reason
            elData.zIndex = 1;
          }
        }

        // Update just this element in the preview (more efficient than reloading entire slide)
        try {
          updateSlideElement(elData);
        } catch (err) {
          console.warn(
            "Failed to update element after toggling always on top",
            err,
          );
        }

        // Don't close popover - user might want to change multiple settings

        // Re-render sidebar to update all rows
        renderSlideElementsSidebar();
      });
    }

    // Wire up link select
    if (store.slideshowMode === "interactive" && queryParams.mode === "edit") {
      const linkSelect = row.querySelector(`#link-select-${elData.id}`);
      if (linkSelect) {
        linkSelect.addEventListener("click", (e) => e.stopPropagation());
        linkSelect.addEventListener("change", (e) => {
          e.stopPropagation();
          try {
            pushCurrentSlideState();
          } catch (err) {}
          const chosenValue = e.target.value;
          if (chosenValue === "Open page by clicking ..") {
            delete elData.goToSlideIndex;
          } else {
            const chosenIndex = parseInt(chosenValue, 10);
            if (!isNaN(chosenIndex)) {
              elData.goToSlideIndex = chosenIndex;
            }
          }
        });
      }
    }

    // Wire up name editing after inserting HTML
    const nameInput = row.querySelector(`#el-name-${elData.id}`);
    if (nameInput) {
      // Prevent clicks in the input from selecting the row
      nameInput.addEventListener("click", (e) => e.stopPropagation());
      nameInput.addEventListener("mousedown", (e) => e.stopPropagation());

      // Commit change on blur or Enter key
      const commitName = () => {
        const newName = nameInput.value.trim();
        // Update the element data in-place. This object references the
        // element in the store.slides structure, so changes are live.
        elData.name = newName || elData.type;
        // Re-render sidebar to reflect change
        renderSlideElementsSidebar();
      };

      nameInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          nameInput.blur();
        } else if (ev.key === "Escape") {
          // revert to original
          nameInput.value = elData.name || summary.type;
          nameInput.blur();
        }
      });

      nameInput.addEventListener("blur", () => {
        try {
          commitName();
        } catch (err) {
          console.warn("Failed to commit element name", err);
        }
      });
    }

    // Wire up block-selection checkbox behavior (now from popover)
    const blockSelectCheckbox = popover
      ? popover.querySelector(`#block-select-checkbox-${elData.id}`)
      : null;

    if (blockSelectCheckbox) {
      blockSelectCheckbox.addEventListener("click", (e) => e.stopPropagation());
      blockSelectCheckbox.addEventListener("change", (e) => {
        e.stopPropagation();
        try {
          pushCurrentSlideState();
        } catch (err) {
          // ignore if undo not available
        }

        // Prevent changes outside template editor when flagged
        const isSettingsLocked =
          (queryParams.mode !== "template_editor" &&
            queryParams.mode !== "suborg_templates" &&
            elData.preventSettingsChanges) ||
          (queryParams.mode === "suborg_templates" && elData.lockedFromParent);
        if (isSettingsLocked) {
          try {
            showToast(
              gettext("This element's settings are enforced by the template."),
              "Info",
            );
          } catch (err) {}
          blockSelectCheckbox.checked = !!elData.isSelectionBlocked;
          return;
        }

        const shouldBlock = blockSelectCheckbox.checked;
        elData.isSelectionBlocked = shouldBlock;

        // If this element is currently selected, deselect it
        if (
          store.selectedElementData &&
          store.selectedElementData.id === elData.id
        ) {
          // Clear selection state and remove selection visuals
          window.selectedElementForUpdate = null;
          store.selectedElement = null;
          store.selectedElementData = null;
          document
            .querySelectorAll(".gradient-border-wrapper")
            .forEach((n) => n.remove());
        }

        // Update just this element in the preview (more efficient than reloading entire slide)
        try {
          updateSlideElement(elData);
        } catch (err) {
          console.warn(
            "Failed to update element after toggling selection block",
            err,
          );
        }

        // Don't close popover - user might want to change multiple settings

        // Re-render sidebar to update icons
        renderSlideElementsSidebar();
      });
    }

    // Highlight if this is the selected element
    if (
      store.selectedElementData &&
      store.selectedElementData.id === elData.id
    ) {
      row.classList.add("active");
    }

    // (Sortable will handle drag/drop for smooth UX)

    // Click row to select element
    row.addEventListener("click", () => {
      const domEl = document.getElementById("el-" + elData.id);
      if (!domEl) return;

      // Do not allow selecting if element blocks selection
      if (elData.isSelectionBlocked) {
        try {
          showToast(gettext("Selection is blocked for this element"), "Info");
        } catch (e) {
          // ignore
        }
        return;
      }

      // Prefer the module's selectElement which handles toolbars, wrappers and state
      try {
        selectElement(domEl, elData);
      } catch (e) {
        // Fallback to direct store mutation if selectElement is unavailable for any reason
        window.store = window.store || store;
        window.store.selectedElement = domEl;
        window.store.selectedElementData = elData;
      }

      // Update visuals
      renderSlideElementsSidebar();
    });

    container.appendChild(row);
  });

  // Initialize Sortable for smoother dragging. Keep a reference to destroy previous instance.
  if (window.__slideElementsSortable) {
    try {
      window.__slideElementsSortable.destroy();
    } catch (e) {
      // ignore
    }
    window.__slideElementsSortable = null;
  }

  try {
    window.__slideElementsSortable = new Sortable(container, {
      animation: 150,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      // No explicit handle — allow dragging the whole item for expected UX
      onMove: function (evt) {
        // Prevent moving non-always-on-top elements above always-on-top elements
        const draggedElId = parseInt(evt.dragged.dataset.elId, 10);
        const relatedElId = parseInt(evt.related.dataset.elId, 10);

        const currentSlide = store.slides[store.currentSlideIndex];
        if (!currentSlide) return true;

        // Get all elements including persistent ones
        const elementsMap = {};
        if (currentSlide.elements) {
          currentSlide.elements.forEach((el) => {
            elementsMap[el.id] = el;
          });
        }
        store.slides.forEach((s) => {
          (s.elements || []).forEach((el) => {
            if (el.isPersistent) elementsMap[el.id] = el;
          });
        });

        const draggedEl = elementsMap[draggedElId];
        const relatedEl = elementsMap[relatedElId];

        if (!draggedEl || !relatedEl) return true;

        // If dragged element is not always-on-top, but related element is,
        // and we're trying to move above it (willInsertAfter is false),
        // prevent the move
        if (
          !draggedEl.isAlwaysOnTop &&
          relatedEl.isAlwaysOnTop &&
          !evt.willInsertAfter
        ) {
          return false;
        }

        return true;
      },
      onEnd: function (evt) {
        // Build new ordering from DOM children (topmost first as rendered)
        const ids = Array.from(container.children)
          .map((child) => parseInt(child.dataset.elId, 10))
          .filter(Boolean);

        if (!ids.length) return;

        const currentSlide = store.slides[store.currentSlideIndex];
        if (!currentSlide) return;

        pushCurrentSlideState();

        // Sidebar is rendered with topmost first; assign zIndex so topmost gets highest value
        ids.forEach((id, idx) => {
          const el = currentSlide.elements.find((e) => e.id === id);
          if (el) {
            el.zIndex = ids.length - idx;

            // Update DOM element z-index immediately to avoid flicker
            const domEl = document.getElementById("el-" + id);
            if (domEl) {
              domEl.style.zIndex = String(el.zIndex);
            }
          }
        });

        // No need to reload slide - z-index updated in data and DOM
        // The slide will be in sync when it eventually gets reloaded

        // Delay re-render of sidebar slightly to avoid interfering with Sortable's DOM update
        setTimeout(() => {
          renderSlideElementsSidebar();
        }, 150);
      },
    });
  } catch (e) {
    // Sortable may fail in some environments; ignore gracefully
    console.warn("Sortable init failed", e);
  }

  // Restore any popovers that were open before this render started
  try {
    const prev = window.__previouslyOpenPopovers || new Set();
    prev.forEach((popoverId) => {
      const p = document.getElementById(popoverId);
      if (p) {
        try {
          const MARGIN = 8; // keep some breathing room from edges

          const preferredWidth = 320;
          const maxAllowedWidth = Math.min(
            preferredWidth,
            window.innerWidth - MARGIN * 2,
          );
          const popoverComputedWidth = Math.max(200, maxAllowedWidth);

          const popoverHeight = window.innerHeight - MARGIN * 2;

          p.style.position = "fixed";
          p.style.bottom = `${MARGIN}px`;
          p.style.right = `${MARGIN}px`;
          p.style.width = `${Math.round(popoverComputedWidth)}px`;
          p.style.height = `${Math.round(popoverHeight)}px`;
          p.style.top = "";
          p.style.left = "";
          p.style.maxHeight = "";
          p.style.overflow = "visible";
          p.style.display = "block";
        } catch (err) {}
      }
    });
  } catch (err) {}
}

document.addEventListener("os:slideChanged", () => {
  try {
    renderSlideElementsSidebar();
  } catch (err) {
    console.warn(
      "Failed to render slide elements sidebar on slide change",
      err,
    );
  }
});

export function initSlideElementsSidebar() {
  // Render initially and whenever slide data or selection changes
  renderSlideElementsSidebar();

  // Observe store changes by polling simple interval (non-invasive)
  // The editor doesn't appear to use an observable store, so poll for changes
  let lastSlidesStr = store.lastSlidesStr || JSON.stringify(store.slides || []);
  // Track last selected element id to avoid re-rendering repeatedly while an
  // element remains selected. Re-render only when slides change or the
  // selected element id changes.
  let lastSelectedElementId = store.selectedElementData
    ? store.selectedElementData.id
    : null;

  setInterval(() => {
    const cur = JSON.stringify(store.slides || []);
    const curSelectedId = store.selectedElementData
      ? store.selectedElementData.id
      : null;

    if (cur !== lastSlidesStr) {
      lastSlidesStr = cur;
      renderSlideElementsSidebar();
    } else if (curSelectedId !== lastSelectedElementId) {
      // Selected element changed (selected, deselected, or switched to another id)
      lastSelectedElementId = curSelectedId;
      renderSlideElementsSidebar();
    }
    // Otherwise, do nothing to avoid interfering with drag interactions.
  }, 600);
}

export default initSlideElementsSidebar;
