// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { selectElement } from "./elementSelector.js";
import { pushCurrentSlideState } from "./undoRedo.js";
import { updateSlideElement } from "./renderSlide.js";
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

const ALWAYS_ON_TOP_BASE = 100000;
const ALWAYS_ON_TOP_PRIORITY_SPAN = 1000;
const POPOVER_MARGIN = 8;
const POPOVER_PREFERRED_WIDTH = 320;
const POPOVER_MIN_WIDTH = 200;
const POLL_INTERVAL_MS = 600;
const NO_ELEMENTS_HTML = `<div class="text-muted small">No elements</div>`;

// Sidebar collapse state key
const SIDEBAR_COLLAPSED_KEY = "os_slide_elements_sidebar_collapsed";

let globalExpandState = false; // Track global expand/collapse state

function safePushCurrentSlideState() {
  try {
    pushCurrentSlideState();
  } catch (err) {
    // Undo stack may not be available in all contexts.
  }
}

function safeShowToast(message, level = "Info") {
  try {
    showToast(message, level);
  } catch (err) {
    // Ignore toast errors outside browser environments.
  }
}

function safeUpdateSlideElement(elData) {
  try {
    updateSlideElement(elData);
  } catch (err) {
    console.warn("Failed to update slide element", err);
  }
}

function isTemplateEditorMode() {
  return queryParams.mode === "template_editor";
}

function isSuborgTemplatesMode() {
  return queryParams.mode === "suborg_templates";
}

function isEditMode() {
  return queryParams.mode === "edit";
}

function isInteractiveEditMode() {
  return store.slideshowMode === "interactive" && isEditMode();
}

function hasSuborgTemplateLock(elData) {
  if (!isSuborgTemplatesMode() || !elData?.preventSettingsChanges) return false;
  return elData.lockedSettingsSubOrgTemplate != null;
}

function hasParentTemplateLock(elData) {
  if (!isSuborgTemplatesMode() || !elData?.preventSettingsChanges) return false;
  return elData.lockedSettingsSubOrgTemplate == null;
}

function getAlwaysOnTopPriority(elData) {
  if (!elData?.isAlwaysOnTop) return 0;
  if (isSuborgTemplatesMode() && hasParentTemplateLock(elData)) return 3;
  if (elData?.preventSettingsChanges) return 2;
  return 1;
}

function isSettingsChangeLocked(elData) {
  if (isTemplateEditorMode()) return false;
  if (isSuborgTemplatesMode()) {
    return hasParentTemplateLock(elData);
  }
  return !!elData?.preventSettingsChanges;
}

function guardSettingsChange(elData, revert) {
  if (!isSettingsChangeLocked(elData)) return true;
  safeShowToast(
    gettext("This element's settings are enforced by the template."),
    "Info",
  );
  if (typeof revert === "function") {
    revert();
  }
  return false;
}

function computeZOrderRanks(slideElements) {
  const withIndex = slideElements.map((el, idx) => ({ el, idx }));
  withIndex.sort((a, b) => {
    const priorityDiff =
      getAlwaysOnTopPriority(b.el) - getAlwaysOnTopPriority(a.el);
    if (priorityDiff) return priorityDiff;
    return (b.el.zIndex || 0) - (a.el.zIndex || 0);
  });
  const rankMap = {};
  withIndex.forEach((item, sortedPos) => {
    rankMap[item.el.id] = sortedPos + 1;
  });
  return rankMap;
}

function elementSummary(dataObj) {
  const type = dataObj.type || "?";
  const pos =
    typeof dataObj.gridX !== "undefined"
      ? `${dataObj.gridX}, ${dataObj.gridY}`
      : `${dataObj.x ?? "-"}, ${dataObj.y ?? "-"}`;
  const size =
    typeof dataObj.gridWidth !== "undefined" &&
    typeof dataObj.gridHeight !== "undefined"
      ? `${dataObj.gridWidth}x${dataObj.gridHeight}`
      : `${dataObj.width ?? "-"}x${dataObj.height ?? "-"}`;
  return { type, pos, size };
}

function applyTemplateLockStyling(row, elData) {
  if (!row) return;
  if (isSuborgTemplatesMode()) {
    if (hasParentTemplateLock(elData)) {
      row.classList.add("element-locked-from-template");
    }
  } else if (!isTemplateEditorMode() && elData.preventSettingsChanges) {
    row.classList.add("element-locked-from-template");
  }
}

function collectSidebarElements() {
  const currentSlide = store.slides?.[store.currentSlideIndex];
  const elementsMap = new Map();

  if (currentSlide?.elements) {
    currentSlide.elements.forEach((el) => {
      elementsMap.set(el.id, el);
    });
  }

  (store.slides || []).forEach((slide) => {
    (slide.elements || []).forEach((el) => {
      if (el.isPersistent) {
        elementsMap.set(el.id, el);
      }
    });
  });

  return Array.from(elementsMap.values());
}

function sortElementsForSidebar(elements) {
  return [...elements].sort((a, b) => {
    const priorityDiff = getAlwaysOnTopPriority(b) - getAlwaysOnTopPriority(a);
    if (priorityDiff) return priorityDiff;
    const aZ = typeof a.zIndex === "number" ? a.zIndex : 0;
    const bZ = typeof b.zIndex === "number" ? b.zIndex : 0;
    if (bZ !== aZ) return bZ - aZ;
    return 0;
  });
}

function buildActiveIconsHtml(elData) {
  const icons = [];
  if (
    elData.isPersistent &&
    !isTemplateEditorMode() &&
    !isSuborgTemplatesMode()
  ) {
    icons.push(
      `<span class="active-setting-icon" title="${gettext("Pinned")}"><i class="material-symbols-outlined">push_pin</i></span>`,
    );
  }
  if (elData.isLocked) {
    icons.push(
      `<span class="active-setting-icon" title="${gettext("Locked")}"><i class="material-symbols-outlined">lock</i></span>`,
    );
  }
  if (elData.isSelectionBlocked) {
    icons.push(
      `<span class="active-setting-icon" title="${gettext("Selection blocked")}"><i class="material-symbols-outlined">block</i></span>`,
    );
  }
  if (elData.isAlwaysOnTop) {
    icons.push(
      `<span class="active-setting-icon" title="${gettext("Always on top")}"><i class="material-symbols-outlined">vertical_align_top</i></span>`,
    );
  }
  if (
    (isTemplateEditorMode() || isSuborgTemplatesMode()) &&
    elData.preventSettingsChanges
  ) {
    let lockTitle = gettext("Settings locked");
    if (isSuborgTemplatesMode()) {
      if (hasParentTemplateLock(elData)) {
        lockTitle = gettext("Settings locked by parent template");
      } else if (hasSuborgTemplateLock(elData)) {
        lockTitle = gettext("Settings locked by this template");
      }
    }
    icons.push(
      `<span class="active-setting-icon" title="${lockTitle}"><i class="material-symbols-outlined">lock_person</i></span>`,
    );
  }
  return icons.join("");
}

function getElementTypeIcon(type) {
  const iconMap = {
    image: "image",
    textbox: "text_fields",
    video: "videocam",
    "dynamic-element": "dynamic_feed",
    "embed-website": "language",
    shape: "interests",
    "html-element": "code",
    table: "table",
    list: "format_list_bulleted",
    placeholder: "crop_free",
    qrcode: "qr_code",
    box: "crop_din",
  };
  return iconMap[type] || "help";
}

function createRenderState(container, openPopovers) {
  const elements = collectSidebarElements();
  return {
    container,
    slide: store.slides?.[store.currentSlideIndex] || null,
    elements,
    sortedElements: sortElementsForSidebar(elements),
    rankMap: computeZOrderRanks(elements),
    openPopovers,
    showLinkSelect: isInteractiveEditMode(),
    rerender: renderSlideElementsSidebar,
  };
}

function isSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch (err) {
    return false;
  }
}

function setSidebarCollapsed(collapsed) {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch (err) {
    // ignore
  }
}

function applySidebarCollapsedState(container, collapsed) {
  const sidebar = container.closest('.slide-right-sidebar') || document.querySelector('.slide-right-sidebar');
  if (!sidebar) return;

  if (collapsed) {
    sidebar.classList.add('collapsed');
  } else {
    sidebar.classList.remove('collapsed');
  }

  // Update collapse button icon
  const btn = sidebar.querySelector('.sidebar-collapse-btn');
  if (btn) {
    const icon = btn.querySelector('.collapse-icon');
    if (icon) {
      icon.textContent = collapsed ? '<<' : '>>';
    }
    btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
  }
}

function createElementRow(elData, state) {
  const summary = elementSummary(elData);
  const displayName = elData.name || summary.type;
  const rank = state.rankMap[elData.id] || "-";
  const elementType =
    elData.type === "iframe" && elData.isDynamic
      ? "dynamic-element"
      : elData.type;
  const iconName = getElementTypeIcon(elementType);

  const row = document.createElement("div");
  row.className =
    "list-group-item px-1 py-1 d-flex justify-content-between align-items-start my-1 border border-dark rounded";
  if (elData.isHidden === true) {
    row.classList.add("element-hidden");
  }
  row.dataset.elId = elData.id;

  row.innerHTML = `
    <div class="w-100">
      <div class="d-flex justify-content-between align-items-center mb-1">
        <div class="d-flex align-items-center gap-1">
          <button class="btn btn-sm btn-link p-0 visibility-toggle-btn" type="button" title="${gettext(
            "Toggle visibility",
          )}" data-role="visibility-button">
            <span class="material-symbols-outlined">${elData.isHidden === true ? "visibility_off" : "visibility"}</span>
          </button>
          <div class="d-flex align-items-center gap-1" data-role="active-icons"></div>
        </div>
        <div class="d-flex align-items-center gap-1">
          <span class="rank-badge" data-role="rank-badge"></span>
          <button class="btn btn-sm btn-link p-0 element-settings-btn" type="button" title="${gettext(
            "Element settings",
          )}" data-role="settings-button">
            <span class="material-symbols-outlined">more_vert</span>
          </button>
        </div>
      </div>
      <div class="fw-bold mb-1 d-flex align-items-center gap-1">
        <i class="material-symbols-outlined">${iconName}</i>
        <label class="visually-hidden">${gettext("Name")}</label>
        <input class="form-control form-control-sm p-0 m-0 border-0 bg-transparent fw-bold" type="text" aria-label="${gettext(
          "Element name",
        )}" data-role="name-input" />
        <button class="btn btn-sm btn-link p-0 details-toggle-btn" type="button" title="${gettext(
          "Toggle details",
        )}" data-role="details-toggle">
          <span class="material-symbols-outlined">expand_more</span>
        </button>
      </div>
      <div class="element-details collapse" data-role="element-details">
        <div class="text-muted small mb-1">
          <strong>${gettext("Type")}:</strong>
          <span data-role="summary-type"></span>
        </div>
        <div class="text-muted small mb-1">
          <strong>${gettext("Size")}:</strong>
          <span data-role="summary-size"></span>
        </div>
        <div class="text-muted small mb-1">
          <strong>${gettext("Position")}:</strong>
          <span data-role="summary-position"></span>
        </div>
      </div>
      ${
        state.showLinkSelect
          ? `<div class="text-muted small mb-1 link-row-inline" data-role="link-row">
            <strong>${gettext("Link")}:</strong>
            <select class="form-select form-select-sm" data-role="link-select"></select>
          </div>`
          : ""
      }
    </div>
  `;

  const iconsContainer = row.querySelector('[data-role="active-icons"]');
  if (iconsContainer) {
    iconsContainer.innerHTML = buildActiveIconsHtml(elData);
  }

  const rankBadge = row.querySelector('[data-role="rank-badge"]');
  if (rankBadge) {
    rankBadge.textContent = String(rank);
  }

  const typeEl = row.querySelector('[data-role="summary-type"]');
  if (typeEl) typeEl.textContent = summary.type;

  const sizeEl = row.querySelector('[data-role="summary-size"]');
  if (sizeEl) sizeEl.textContent = summary.size;

  const posEl = row.querySelector('[data-role="summary-position"]');
  if (posEl) posEl.textContent = summary.pos;

  const nameInput = row.querySelector('[data-role="name-input"]');
  if (nameInput) nameInput.value = displayName;

  const linkSelect = row.querySelector('[data-role="link-select"]');
  if (state.showLinkSelect && linkSelect) {
    populateLinkSelect(linkSelect, elData);
  }

  const popoverInfo = createPopover(elData, displayName);
  attachElementInteractions({
    row,
    elData,
    state,
    nameInput,
    linkSelect,
    settingsButton: row.querySelector('[data-role="settings-button"]'),
    popoverInfo,
  });

  return row;
}

function createPopover(elData, displayName) {
  const popover = document.createElement("div");
  popover.className = "element-settings-popover";
  popover.id = `popover-${elData.id}`;
  popover.style.display = "none";

  const allowPinToggle = isEditMode();
  const showTemplateLockSetting =
    isTemplateEditorMode() || isSuborgTemplatesMode();

  const templateLockDescription =
    isSuborgTemplatesMode() && hasParentTemplateLock(elData)
      ? gettext(
          "This element's settings are locked by the parent global template and cannot be unlocked",
        )
      : gettext(
          "Prevent users from modifying this element's position, size, and other settings when using this template",
        );

  popover.innerHTML = `
    <div class="popover-header">
      <strong>${gettext("Element Settings")}</strong>
      <button class="btn btn-link p-0 popover-close-btn" type="button" title="${gettext(
        "Close",
      )}" data-role="popover-close">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="popover-body">
      <div class="setting-item mb-3">
        <label class="form-label fw-semibold">${gettext("Name")}</label>
        <input class="form-control form-control-sm" type="text" placeholder="${gettext(
          "Element name",
        )}" data-role="popover-name" />
      </div>
      <div class="setting-item mb-3">
        <label class="form-label fw-semibold">${gettext(
          "Position & Size",
        )}</label>
        <div class="row g-2">
          <div class="col-6">
            <label class="form-label small text-muted">${gettext(
              "X Position",
            )}</label>
            <input class="form-control form-control-sm" type="number" data-role="position-x" />
          </div>
          <div class="col-6">
            <label class="form-label small text-muted">${gettext(
              "Y Position",
            )}</label>
            <input class="form-control form-control-sm" type="number" data-role="position-y" />
          </div>
          <div class="col-6">
            <label class="form-label small text-muted">${gettext(
              "Width",
            )}</label>
            <input class="form-control form-control-sm" type="number" data-role="size-width" />
          </div>
          <div class="col-6">
            <label class="form-label small text-muted">${gettext(
              "Height",
            )}</label>
            <input class="form-control form-control-sm" type="number" data-role="size-height" />
          </div>
        </div>
      </div>
      <hr class="my-3">
      ${
        allowPinToggle
          ? `
      <div class="setting-item mb-3">
        <div class="d-flex align-items-start">
          <input type="checkbox" class="form-check-input me-2 mt-1" data-role="pin-checkbox">
          <div class="flex-grow-1">
            <label class="form-check-label fw-semibold d-flex align-items-center gap-1">
              <span class="material-symbols-outlined small-icon">push_pin</span>
              ${gettext("Pin element")}
            </label>
            <div class="text-muted small">${gettext(
              "Element appears on all slides",
            )}</div>
          </div>
        </div>
      </div>
      `
          : ""
      }
      <div class="setting-item mb-3">
        <div class="d-flex align-items-start">
          <input type="checkbox" class="form-check-input me-2 mt-1" data-role="lock-checkbox">
          <div class="flex-grow-1">
            <label class="form-check-label fw-semibold d-flex align-items-center gap-1">
              <span class="material-symbols-outlined small-icon">lock</span>
              ${gettext("Lock position & size")}
            </label>
            <div class="text-muted small">${gettext(
              "Prevent moving or resizing this element",
            )}</div>
          </div>
        </div>
      </div>
      <div class="setting-item mb-3">
        <div class="d-flex align-items-start">
          <input type="checkbox" class="form-check-input me-2 mt-1" data-role="block-select-checkbox">
          <div class="flex-grow-1">
            <label class="form-check-label fw-semibold d-flex align-items-center gap-1">
              <span class="material-symbols-outlined small-icon">block</span>
              ${gettext("Block selection")}
            </label>
            <div class="text-muted small">${gettext(
              "Element cannot be selected on the canvas",
            )}</div>
          </div>
        </div>
      </div>
      <div class="setting-item mb-3">
        <div class="d-flex align-items-start">
          <input type="checkbox" class="form-check-input me-2 mt-1" data-role="always-on-top-checkbox">
          <div class="flex-grow-1">
            <label class="form-check-label fw-semibold d-flex align-items-center gap-1">
              <span class="material-symbols-outlined small-icon">vertical_align_top</span>
              ${gettext("Always on top")}
            </label>
            <div class="text-muted small">${gettext(
              "Element stays above all other elements",
            )}</div>
          </div>
        </div>
      </div>
      ${
        showTemplateLockSetting
          ? `
      <hr class="my-3">
      <div class="setting-item template-lock-setting">
        <div class="d-flex align-items-start">
          <div class="form-check form-switch w-100">
            <input class="form-check-input" type="checkbox" role="switch" data-role="force-settings-toggle">
            <label class="form-check-label fw-semibold d-flex align-items-center gap-1">
              <span class="material-symbols-outlined small-icon">lock_person</span>
              ${gettext("Block editing of element settings")}
            </label>
            <div class="text-muted small mt-1">${templateLockDescription}</div>
          </div>
        </div>
      </div>
      `
          : ""
      }
      <hr class="my-3">
      <div class="setting-item mb-3">
        <label class="form-label fw-semibold">${gettext("Change element type")}</label>
        <select class="form-select form-select-sm" data-role="change-element-type"></select>
      </div>
      <div class="setting-item">
        <button class="btn btn-danger btn-sm w-100 d-flex align-items-center justify-content-center gap-2" type="button" data-role="delete-button">
          <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
          ${gettext("Delete element")}
        </button>
      </div>
    </div>
  `;

  const controls = {
    closeButton: popover.querySelector('[data-role="popover-close"]'),
    nameInput: popover.querySelector('[data-role="popover-name"]'),
    positionX: popover.querySelector('[data-role="position-x"]'),
    positionY: popover.querySelector('[data-role="position-y"]'),
    sizeWidth: popover.querySelector('[data-role="size-width"]'),
    sizeHeight: popover.querySelector('[data-role="size-height"]'),
    pinCheckbox: popover.querySelector('[data-role="pin-checkbox"]'),
    lockCheckbox: popover.querySelector('[data-role="lock-checkbox"]'),
    blockSelectCheckbox: popover.querySelector(
      '[data-role="block-select-checkbox"]',
    ),
    alwaysOnTopCheckbox: popover.querySelector(
      '[data-role="always-on-top-checkbox"]',
    ),
    forceSettingsToggle: popover.querySelector(
      '[data-role="force-settings-toggle"]',
    ),
    changeTypeSelect: popover.querySelector(
      '[data-role="change-element-type"]',
    ),
    deleteButton: popover.querySelector('[data-role="delete-button"]'),
  };

  if (controls.nameInput) {
    controls.nameInput.value = displayName;
  }

  const hasGridPosition = typeof elData.gridX !== "undefined";
  if (controls.positionX) {
    controls.positionX.value = hasGridPosition
      ? (elData.gridX ?? 0)
      : (elData.x ?? 0);
  }
  if (controls.positionY) {
    controls.positionY.value = hasGridPosition
      ? (elData.gridY ?? 0)
      : (elData.y ?? 0);
  }

  if (controls.sizeWidth) {
    controls.sizeWidth.value =
      typeof elData.gridWidth !== "undefined"
        ? (elData.gridWidth ?? 0)
        : (elData.width ?? 0);
  }
  if (controls.sizeHeight) {
    controls.sizeHeight.value =
      typeof elData.gridHeight !== "undefined"
        ? (elData.gridHeight ?? 0)
        : (elData.height ?? 0);
  }

  if (controls.pinCheckbox) {
    controls.pinCheckbox.checked = !!elData.isPersistent;
  }
  if (controls.lockCheckbox) {
    controls.lockCheckbox.checked = !!elData.isLocked;
  }
  if (controls.blockSelectCheckbox) {
    controls.blockSelectCheckbox.checked = !!elData.isSelectionBlocked;
  }
  if (controls.alwaysOnTopCheckbox) {
    controls.alwaysOnTopCheckbox.checked = !!elData.isAlwaysOnTop;
  }
  if (controls.forceSettingsToggle) {
    controls.forceSettingsToggle.checked = !!elData.preventSettingsChanges;
    if (hasParentTemplateLock(elData)) {
      controls.forceSettingsToggle.disabled = true;
    }
  }

  try {
    document.body.appendChild(popover);
  } catch (err) {
    // Ignore environments without a real DOM.
  }

  registerCleanup(() => {
    try {
      if (popover && popover.parentNode) {
        popover.parentNode.removeChild(popover);
      }
    } catch (err) {
      // ignore cleanup errors
    }
  });

  return { popover, controls };
}

function attachElementInteractions({
  row,
  elData,
  state,
  nameInput,
  linkSelect,
  settingsButton,
  popoverInfo,
}) {
  if (!row || !popoverInfo) return;

  applyTemplateLockStyling(row, elData);

  if (store.selectedElementData?.id === elData.id) {
    row.classList.add("active");
  }

  const { popover, controls } = popoverInfo;

  setupRowSelection({ row, elData, state });
  setupPopoverToggle({
    row,
    settingsButton,
    popover,
    state,
    closeButton: controls.closeButton,
  });
  setupVisibilityToggle({
    button: row.querySelector('[data-role="visibility-button"]'),
    elData,
    state,
  });

  setupInlineNameEditing({ input: nameInput, elData, state });
  setupPopoverNameEditing({ input: controls.nameInput, elData, state });

  setupPositionSizeInputs({
    positionX: controls.positionX,
    positionY: controls.positionY,
    sizeWidth: controls.sizeWidth,
    sizeHeight: controls.sizeHeight,
    elData,
    state,
  });

  setupPinToggle({ checkbox: controls.pinCheckbox, elData, state });
  setupLockToggle({ checkbox: controls.lockCheckbox, elData, state });
  setupBlockSelectToggle({
    checkbox: controls.blockSelectCheckbox,
    elData,
    state,
  });
  setupAlwaysOnTopToggle({
    checkbox: controls.alwaysOnTopCheckbox,
    elData,
    state,
  });
  setupTemplateLockToggle({
    control: controls.forceSettingsToggle,
    elData,
    state,
  });
  setupChangeTypeSelect({
    select: controls.changeTypeSelect,
    elData,
    state,
    popover,
  });
  setupDeleteButton({ button: controls.deleteButton, elData, state, popover });
  setupLinkSelect({ select: linkSelect, elData });
  setupDetailsToggle({
    button: row.querySelector('[data-role="details-toggle"]'),
    detailsContainer: row.querySelector('[data-role="element-details"]'),
  });

  preventInternalPopoverPropagation(popover);
}

function setupRowSelection({ row, elData, state }) {
  if (!row) return;
  registerListener(row, "click", () => {
    const domEl = document.getElementById(`el-${elData.id}`);
    if (!domEl) return;

    if (elData.isSelectionBlocked) {
      safeShowToast(gettext("Selection is blocked for this element"), "Info");
      return;
    }

    try {
      selectElement(domEl, elData);
    } catch (err) {
      window.store = window.store || store;
      window.store.selectedElement = domEl;
      window.store.selectedElementData = elData;
    }

    state.rerender();
  });
}

function setupPopoverToggle({
  row,
  settingsButton,
  popover,
  state,
  closeButton,
}) {
  if (!popover) return;

  const togglePopover = (event) => {
    event.stopPropagation();
    event.preventDefault?.();
    const isVisible = popover.style.display === "block";
    if (isVisible) {
      hidePopover(popover, state);
    } else {
      closeOtherPopovers(popover, state);
      showPopover(popover, state);
    }
  };

  if (settingsButton) {
    registerListener(settingsButton, "click", togglePopover);
  }

  if (row) {
    registerListener(row, "contextmenu", (event) => {
      event.preventDefault();
      togglePopover(event);
    });
  }

  if (closeButton) {
    registerListener(closeButton, "click", (event) => {
      event.stopPropagation();
      hidePopover(popover, state);
    });
  }
}

function setupInlineNameEditing({ input, elData, state }) {
  if (!input) return;

  // Allow text selection by only stopping row-click propagation, not mousedown
  registerListener(input, "click", stopEventPropagation);
  // Removed mousedown stop to allow text selection and dragging

  const commit = () => {
    const newName = input.value.trim();
    elData.name = newName || elData.type;
    state.rerender();
  };

  registerListener(input, "keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    } else if (event.key === "Escape") {
      input.value = elData.name || elData.type;
      input.blur();
    }
  });

  registerListener(input, "blur", () => {
    try {
      commit();
    } catch (err) {
      console.warn("Failed to commit element name", err);
    }
  });
}

function setupPopoverNameEditing({ input, elData, state }) {
  if (!input) return;

  // Allow text selection by only stopping click propagation to prevent popover close
  registerListener(input, "click", stopEventPropagation);
  // Don't stop mousedown to allow text selection and dragging

  const commit = () => {
    const newName = input.value.trim();
    elData.name = newName || elData.type;
    state.rerender();
  };

  registerListener(input, "keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      input.value = elData.name || elData.type;
    }
  });

  registerListener(input, "blur", () => {
    try {
      commit();
    } catch (err) {
      console.warn("Failed to commit element name from popover", err);
    }
  });
}

function setupPositionSizeInputs({
  positionX,
  positionY,
  sizeWidth,
  sizeHeight,
  elData,
  state,
}) {
  const inputs = [positionX, positionY, sizeWidth, sizeHeight].filter(Boolean);
  if (!inputs.length) return;

  const resetInputs = () => {
    if (positionX) {
      positionX.value =
        typeof elData.gridX !== "undefined"
          ? (elData.gridX ?? 0)
          : (elData.x ?? 0);
    }
    if (positionY) {
      positionY.value =
        typeof elData.gridY !== "undefined"
          ? (elData.gridY ?? 0)
          : (elData.y ?? 0);
    }
    if (sizeWidth) {
      sizeWidth.value =
        typeof elData.gridWidth !== "undefined"
          ? (elData.gridWidth ?? 0)
          : (elData.width ?? 0);
    }
    if (sizeHeight) {
      sizeHeight.value =
        typeof elData.gridHeight !== "undefined"
          ? (elData.gridHeight ?? 0)
          : (elData.height ?? 0);
    }
  };

  inputs.forEach((input) => {
    registerListener(input, "click", stopEventPropagation);
    registerListener(input, "keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      } else if (event.key === "Escape") {
        resetInputs();
        input.blur();
      }
    });
    registerListener(input, "blur", () => {
      safePushCurrentSlideState();

      if (
        !guardSettingsChange(elData, () => {
          resetInputs();
        })
      ) {
        return;
      }

      const newX = positionX ? parseFloat(positionX.value) || 0 : null;
      const newY = positionY ? parseFloat(positionY.value) || 0 : null;
      const newWidth = sizeWidth ? parseFloat(sizeWidth.value) || 0 : null;
      const newHeight = sizeHeight ? parseFloat(sizeHeight.value) || 0 : null;

      if (typeof elData.gridX !== "undefined" && newX !== null) {
        elData.gridX = newX;
        elData.gridY = newY !== null ? newY : elData.gridY;
      } else {
        if (newX !== null) elData.x = newX;
        if (newY !== null) elData.y = newY;
      }

      if (
        typeof elData.gridWidth !== "undefined" ||
        typeof elData.gridHeight !== "undefined"
      ) {
        if (newWidth !== null) elData.gridWidth = newWidth;
        if (newHeight !== null) elData.gridHeight = newHeight;
      } else {
        if (newWidth !== null) elData.width = newWidth;
        if (newHeight !== null) elData.height = newHeight;
      }

      safeUpdateSlideElement(elData);
      state.rerender();
    });
  });
}

function setupVisibilityToggle({ button, elData, state }) {
  if (!button) return;

  registerListener(button, "click", (event) => {
    event.stopPropagation();
    safePushCurrentSlideState();

    if (
      !guardSettingsChange(elData, () => {
        // Revert the visual state if change is blocked
        const icon = button.querySelector(".material-symbols-outlined");
        if (icon) {
          icon.textContent =
            elData.isHidden === true ? "visibility_off" : "visibility";
        }
      })
    ) {
      return;
    }

    // Toggle visibility state (handle undefined as false)
    elData.isHidden = !(elData.isHidden === true);

    // Update button icon and styling
    const icon = button.querySelector(".material-symbols-outlined");
    if (icon) {
      icon.textContent = elData.isHidden ? "visibility_off" : "visibility";
    }

    // Update button styling
    if (elData.isHidden === true) {
      button.classList.add("element-hidden");
    } else {
      button.classList.remove("element-hidden");
    }

    // Update button tooltip
    button.title =
      elData.isHidden === true
        ? gettext("Show element")
        : gettext("Hide element");

    // Update row styling
    const row = button.closest(".list-group-item");
    if (row) {
      if (elData.isHidden === true) {
        row.classList.add("element-hidden");
      } else {
        row.classList.remove("element-hidden");
      }
    }

    // Update the DOM element's visibility
    const domElement = document.getElementById(`el-${elData.id}`);
    if (domElement) {
      domElement.style.visibility =
        elData.isHidden === true ? "hidden" : "visible";
    }

    safeUpdateSlideElement(elData);
    state.rerender();
  });

  // Set initial state
  const icon = button.querySelector(".material-symbols-outlined");
  if (icon) {
    icon.textContent =
      elData.isHidden === true ? "visibility_off" : "visibility";
  }

  // Set initial button styling
  if (elData.isHidden === true) {
    button.classList.add("element-hidden");
  } else {
    button.classList.remove("element-hidden");
  }

  button.title =
    elData.isHidden === true
      ? gettext("Show element")
      : gettext("Hide element");
}

function setupPinToggle({ checkbox, elData, state }) {
  if (!checkbox) return;

  registerListener(checkbox, "click", stopEventPropagation);
  registerListener(checkbox, "change", (event) => {
    event.stopPropagation();
    safePushCurrentSlideState();

    if (
      !guardSettingsChange(elData, () => {
        checkbox.checked = !!elData.isPersistent;
      })
    ) {
      return;
    }

    elData.isPersistent = checkbox.checked;
    safeUpdateSlideElement(elData);
    state.rerender();
  });

  checkbox.checked = !!elData.isPersistent;
}

function setupLockToggle({ checkbox, elData, state }) {
  if (!checkbox) return;

  registerListener(checkbox, "click", stopEventPropagation);
  registerListener(checkbox, "change", (event) => {
    event.stopPropagation();
    safePushCurrentSlideState();

    if (
      !guardSettingsChange(elData, () => {
        checkbox.checked = !!elData.isLocked;
      })
    ) {
      return;
    }

    elData.isLocked = checkbox.checked;
    safeUpdateSlideElement(elData);
    state.rerender();
  });

  checkbox.checked = !!elData.isLocked;
}

function setupBlockSelectToggle({ checkbox, elData, state }) {
  if (!checkbox) return;

  registerListener(checkbox, "click", stopEventPropagation);
  registerListener(checkbox, "change", (event) => {
    event.stopPropagation();
    safePushCurrentSlideState();

    if (
      !guardSettingsChange(elData, () => {
        checkbox.checked = !!elData.isSelectionBlocked;
      })
    ) {
      return;
    }

    const shouldBlock = checkbox.checked;
    elData.isSelectionBlocked = shouldBlock;

    if (
      shouldBlock &&
      store.selectedElementData &&
      store.selectedElementData.id === elData.id
    ) {
      window.selectedElementForUpdate = null;
      store.selectedElement = null;
      store.selectedElementData = null;
      document
        .querySelectorAll(".gradient-border-wrapper")
        .forEach((node) => node.remove());
    }

    safeUpdateSlideElement(elData);
    state.rerender();
  });

  checkbox.checked = !!elData.isSelectionBlocked;
}

function setupAlwaysOnTopToggle({ checkbox, elData, state }) {
  if (!checkbox) return;

  registerListener(checkbox, "click", stopEventPropagation);
  registerListener(checkbox, "change", (event) => {
    event.stopPropagation();
    safePushCurrentSlideState();

    if (
      !guardSettingsChange(elData, () => {
        checkbox.checked = !!elData.isAlwaysOnTop;
      })
    ) {
      return;
    }

    const shouldBeAlwaysOnTop = checkbox.checked;
    elData.isAlwaysOnTop = shouldBeAlwaysOnTop;
    adjustAlwaysOnTopZIndex(elData, state.elements, shouldBeAlwaysOnTop);
    safeUpdateSlideElement(elData);
    state.rerender();
  });

  checkbox.checked = !!elData.isAlwaysOnTop;
}

function recalculateAlwaysOnTopZIndices(elements) {
  if (!Array.isArray(elements)) return [];

  const alwaysOnTopElements = elements
    .map((element, index) => ({
      element,
      index,
      priority: getAlwaysOnTopPriority(element),
      currentZ: typeof element?.zIndex === "number" ? element.zIndex : 0,
    }))
    .filter(({ element }) => element?.isAlwaysOnTop)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.currentZ !== b.currentZ) return a.currentZ - b.currentZ;
      return a.index - b.index;
    });

  const perPriorityOffsets = new Map();
  const changedElements = [];

  alwaysOnTopElements.forEach(({ element, priority }) => {
    const tier = Math.max(priority, 1);
    const base = ALWAYS_ON_TOP_BASE + ALWAYS_ON_TOP_PRIORITY_SPAN * (tier - 1);
    const offset = perPriorityOffsets.get(tier) || 0;
    perPriorityOffsets.set(tier, offset + 1);
    const newZIndex = base + offset + 1;

    if ((Number(element.zIndex) || 0) !== newZIndex) {
      element.zIndex = newZIndex;
      changedElements.push(element);
    }
  });

  return changedElements;
}

function adjustAlwaysOnTopZIndex(elData, elements, shouldBeAlwaysOnTop) {
  if (!shouldBeAlwaysOnTop) {
    try {
      elData.zIndex = getNewZIndex();
    } catch (err) {
      elData.zIndex = 1;
    }
  }

  const updatedElements = recalculateAlwaysOnTopZIndices(elements);
  updatedElements
    .filter((element) => element.id !== elData.id)
    .forEach((element) => {
      safeUpdateSlideElement(element);
    });
}

function setupTemplateLockToggle({ control, elData, state }) {
  if (!control) return;

  control.checked = !!elData.preventSettingsChanges;
  if (hasParentTemplateLock(elData)) {
    control.disabled = true;
  }

  registerListener(control, "click", stopEventPropagation);
  registerListener(control, "change", (event) => {
    event.stopPropagation();

    const parentLocked = hasParentTemplateLock(elData);

    if (parentLocked && !control.checked) {
      control.checked = true;
      safeShowToast(
        gettext(
          "Cannot unlock this element - it is locked by the parent global template",
        ),
        "Warning",
      );
      return;
    }

    safePushCurrentSlideState();
    elData.preventSettingsChanges = !!control.checked;
    if (isSuborgTemplatesMode()) {
      if (control.checked) {
        elData.lockedSettingsSubOrgTemplate = true;
      } else {
        delete elData.lockedSettingsSubOrgTemplate;
      }
    } else if (!control.checked && elData.lockedSettingsSubOrgTemplate) {
      delete elData.lockedSettingsSubOrgTemplate;
    }
    state.rerender();
  });
}

function setupChangeTypeSelect({ select, elData, state, popover }) {
  if (!select) return;
  populateElementTypeSelect(select, elData, state, popover);
}

function populateElementTypeSelect(select, elData, state, popover) {
  const availableTypes = getAvailableElementTypes();
  const currentType =
    elData.type === "iframe" && elData.isDynamic
      ? "dynamic-element"
      : elData.type;

  select.innerHTML = "";

  const currentTypeInfo = availableTypes.find(
    (typeInfo) => typeInfo.type === currentType,
  );
  if (currentTypeInfo) {
    const currentOption = document.createElement("option");
    currentOption.value = currentType;
    currentOption.textContent = `${currentTypeInfo.name} (current)`;
    currentOption.disabled = true;
    currentOption.selected = true;
    select.appendChild(currentOption);
  }

  availableTypes.forEach((typeInfo) => {
    if (typeInfo.type === currentType || typeInfo.type === "placeholder") {
      return;
    }

    const sourceType =
      elData.type === "iframe" && elData.isDynamic
        ? "dynamic-element"
        : elData.type;

    if (!isConversionSupported(sourceType, typeInfo.type)) return;

    const option = document.createElement("option");
    option.value = typeInfo.type;
    option.textContent = typeInfo.name;
    select.appendChild(option);
  });

  registerListener(select, "click", stopEventPropagation);
  registerListener(select, "change", (event) => {
    event.stopPropagation();
    const selectedType = select.value;
    if (!selectedType || selectedType === currentType) return;

    safePushCurrentSlideState();

    try {
      replaceElementWithType(elData, selectedType);
      hidePopover(popover, state);
      const typeInfo = availableTypes.find(
        (type) => type.type === selectedType,
      );
      safeShowToast(
        gettext(`Element converted to ${typeInfo?.name || selectedType}`),
        "Success",
      );
      state.rerender();
    } catch (error) {
      console.error("Error converting element type:", error);
      safeShowToast(gettext("Failed to convert element type"), "Error");
      select.value = currentType;
    }
  });
}

function setupDeleteButton({ button, elData, state, popover }) {
  if (!button) return;

  registerListener(button, "click", (event) => {
    event.stopPropagation();

    if (isElementLocked(elData) && !isTemplateEditorMode()) {
      safeShowToast(gettext("Cannot delete locked element"), "Warning");
      return;
    }

    if (!confirm(gettext("Are you sure you want to delete this element?"))) {
      return;
    }

    safePushCurrentSlideState();
    removeElementFromSlides(elData);

    const domEl = document.getElementById(`el-${elData.id}`);
    if (domEl) {
      domEl.remove();
    }

    document.querySelector(".gradient-border-wrapper")?.remove();

    if (store.selectedElementData?.id === elData.id) {
      store.selectedElement = null;
      store.selectedElementData = null;
      document.querySelectorAll(".element-type-toolbar").forEach((toolbar) => {
        if (toolbar.classList.contains("d-flex")) {
          toolbar.classList.replace("d-flex", "d-none");
        }
      });
    }

    hidePopover(popover, state);
    state.rerender();
  });
}

function removeElementFromSlides(elData) {
  if (elData.isPersistent) {
    (store.slides || []).forEach((slide) => {
      if (!slide?.elements) return;
      slide.elements = slide.elements.filter(
        (element) => element.id !== elData.id,
      );
    });
  } else {
    const currentSlide = store.slides?.[store.currentSlideIndex];
    if (currentSlide?.elements) {
      currentSlide.elements = currentSlide.elements.filter(
        (element) => element.id !== elData.id,
      );
    }
  }
}

function setupLinkSelect({ select, elData }) {
  if (!select) return;

  registerListener(select, "click", stopEventPropagation);
  registerListener(select, "change", (event) => {
    event.stopPropagation();
    safePushCurrentSlideState();

    const selectedValue = select.value;
    if (selectedValue === "Open page by clicking ..") {
      delete elData.goToSlideIndex;
    } else {
      const chosenIndex = parseInt(selectedValue, 10);
      if (!Number.isNaN(chosenIndex)) {
        elData.goToSlideIndex = chosenIndex;
      }
    }
  });
}

function setupDetailsToggle({ button, detailsContainer }) {
  if (!button || !detailsContainer) return;

  // Set initial state based on global state
  if (globalExpandState) {
    detailsContainer.classList.remove("collapse");
    const icon = button.querySelector(".material-symbols-outlined");
    if (icon) icon.textContent = "expand_less";
    button.title = gettext("Hide details");
  } else {
    detailsContainer.classList.add("collapse");
    const icon = button.querySelector(".material-symbols-outlined");
    if (icon) icon.textContent = "expand_more";
    button.title = gettext("Show details");
  }

  registerListener(button, "click", (event) => {
    event.stopPropagation();

    const isCollapsed = detailsContainer.classList.contains("collapse");
    const icon = button.querySelector(".material-symbols-outlined");

    if (isCollapsed) {
      detailsContainer.classList.remove("collapse");
      if (icon) icon.textContent = "expand_less";
      button.title = gettext("Hide details");
    } else {
      detailsContainer.classList.add("collapse");
      if (icon) icon.textContent = "expand_more";
      button.title = gettext("Show details");
    }
  });
}

function populateLinkSelect(select, elData) {
  if (!select) return;

  select.innerHTML = "";

  const placeholderValue = "Open page by clicking ..";
  const placeholder = document.createElement("option");
  placeholder.value = placeholderValue;
  placeholder.textContent = gettext("Open page by clicking ..");
  select.appendChild(placeholder);

  (store.slides || []).forEach((slide, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}: ${slide.name}`;
    if (
      typeof elData.goToSlideIndex === "number" &&
      elData.goToSlideIndex === index
    ) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  if (typeof elData.goToSlideIndex !== "number" && select.options.length) {
    select.selectedIndex = 0;
  }
}

function preventInternalPopoverPropagation(popover) {
  if (!popover) return;
  const stop = stopEventPropagation;

  registerListener(popover, "click", stop);
  registerListener(popover, "pointerdown", stop);
  registerListener(popover, "focusin", stop);

  const interactiveElements = Array.from(
    popover.querySelectorAll("input, select, textarea, button"),
  );

  interactiveElements.forEach((element) => {
    registerListener(element, "click", stop);
    registerListener(element, "pointerdown", stop);
    registerListener(element, "focusin", stop);
  });
}

function stopEventPropagation(event) {
  event.stopPropagation();
}

function showPopover(popover, state, options = {}) {
  if (!popover) return;
  const { track = true } = options;

  const maxAllowedWidth = Math.min(
    POPOVER_PREFERRED_WIDTH,
    window.innerWidth - POPOVER_MARGIN * 2,
  );
  const width = Math.max(POPOVER_MIN_WIDTH, maxAllowedWidth);
  const height = window.innerHeight - POPOVER_MARGIN * 2;

  popover.style.position = "fixed";
  popover.style.bottom = `${POPOVER_MARGIN}px`;
  popover.style.right = `${POPOVER_MARGIN}px`;
  popover.style.width = `${Math.round(width)}px`;
  popover.style.height = `${Math.round(height)}px`;
  popover.style.top = "";
  popover.style.left = "";
  popover.style.maxHeight = "";
  popover.style.overflow = "visible";
  popover.style.display = "block";

  if (track && state?.openPopovers) {
    state.openPopovers.add(popover.id);
  }
}

function hidePopover(popover, state) {
  if (!popover) return;
  popover.style.display = "none";
  if (state?.openPopovers) {
    state.openPopovers.delete(popover.id);
  }
}

function closeOtherPopovers(currentPopover, state) {
  try {
    document.querySelectorAll(".element-settings-popover").forEach((pop) => {
      if (pop !== currentPopover) {
        hidePopover(pop, state);
      }
    });
  } catch (err) {
    // Ignore DOM access issues.
  }
}

function restoreOpenPopovers(openPopovers, state) {
  if (!openPopovers?.size) return;
  openPopovers.forEach((popoverId) => {
    const popover = document.getElementById(popoverId);
    if (popover) {
      showPopover(popover, state, { track: false });
    }
  });
}

function beginPopoverLifecycle() {
  const openPopovers = new Set();
  try {
    document
      .querySelectorAll(".element-settings-popover")
      .forEach((popover) => {
        if (popover?.style?.display === "block") {
          openPopovers.add(popover.id);
        }
      });
  } catch (err) {
    // Ignore DOM access issues.
  }

  if (Array.isArray(window.__popoverCleanupFunctions)) {
    window.__popoverCleanupFunctions.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        // Ignore cleanup errors.
      }
    });
  }

  window.__popoverCleanupFunctions = [];

  return openPopovers;
}

function registerCleanup(fn) {
  window.__popoverCleanupFunctions = window.__popoverCleanupFunctions || [];
  window.__popoverCleanupFunctions.push(fn);
}

function registerListener(target, eventName, handler, options) {
  if (!target) return;
  target.addEventListener(eventName, handler, options);
  registerCleanup(() => {
    try {
      target.removeEventListener(eventName, handler, options);
    } catch (err) {
      // Ignore removal errors.
    }
  });
}

function buildElementsMapForSortable(state) {
  const map = new Map();
  if (state.slide?.elements) {
    state.slide.elements.forEach((el) => map.set(el.id, el));
  }
  (store.slides || []).forEach((slide) => {
    (slide.elements || []).forEach((el) => {
      if (el.isPersistent) {
        map.set(el.id, el);
      }
    });
  });
  return map;
}

function initSortable(container, state) {
  if (window.__slideElementsSortable) {
    try {
      window.__slideElementsSortable.destroy();
    } catch (err) {
      // Ignore destroy errors.
    }
    window.__slideElementsSortable = null;
  }

  try {
    window.__slideElementsSortable = new Sortable(container, {
      animation: 150,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      filter:
        '[data-role="expand-collapse-all"], input, button, select, textarea', // Prevent dragging when interacting with form elements or expand/collapse button
      preventOnFilter: false, // Allow default behavior on filtered elements
      onMove(evt) {
        const draggedId = parseInt(evt.dragged.dataset.elId, 10);
        const relatedId = parseInt(evt.related?.dataset?.elId, 10);

        if (Number.isNaN(draggedId) || Number.isNaN(relatedId)) {
          return true;
        }

        const elementsMap = buildElementsMapForSortable(state);
        const draggedEl = elementsMap.get(draggedId);
        const relatedEl = elementsMap.get(relatedId);

        if (!draggedEl || !relatedEl) return true;

        if (
          !draggedEl.isAlwaysOnTop &&
          relatedEl.isAlwaysOnTop &&
          !evt.willInsertAfter
        ) {
          return false;
        }

        return true;
      },
      onEnd() {
        const ids = Array.from(container.children)
          .map((child) => parseInt(child.dataset.elId, 10))
          .filter((id) => !Number.isNaN(id));

        if (!ids.length || !state.slide) return;

        safePushCurrentSlideState();

        ids.forEach((id, index) => {
          const element =
            state.slide.elements?.find((item) => item.id === id) || null;
          if (!element) return;

          element.zIndex = ids.length - index;
          const domEl = document.getElementById(`el-${id}`);
          if (domEl) {
            domEl.style.zIndex = String(element.zIndex);
          }
        });

        setTimeout(() => {
          state.rerender();
        }, 150);
      },
    });
  } catch (err) {
    console.warn("Sortable init failed", err);
  }
}

function toggleAllDetails(expand) {
  globalExpandState = expand;
  const container = document.getElementById("slide-elements-list");
  if (!container) return;

  const detailsContainers = container.querySelectorAll(
    '[data-role="element-details"]',
  );
  const toggleButtons = container.querySelectorAll(
    '[data-role="details-toggle"]',
  );

  detailsContainers.forEach((detailsContainer) => {
    if (expand) {
      detailsContainer.classList.remove("collapse");
    } else {
      detailsContainer.classList.add("collapse");
    }
  });

  toggleButtons.forEach((button) => {
    const icon = button.querySelector(".material-symbols-outlined");
    if (expand) {
      if (icon) icon.textContent = "expand_less";
      button.title = gettext("Hide details");
    } else {
      if (icon) icon.textContent = "expand_more";
      button.title = gettext("Show details");
    }
  });
}

function createExpandCollapseButton() {
  const button = document.createElement("button");
  button.className =
    "btn btn-sm btn-outline-secondary w-100 mb-2 d-flex align-items-center justify-content-center gap-1";
  button.type = "button";
  button.dataset.role = "expand-collapse-all";

  const updateButtonText = () => {
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.style.fontSize = "16px";
    icon.textContent = globalExpandState ? "unfold_less" : "unfold_more";

    const text = document.createTextNode(
      globalExpandState ? gettext("Collapse All") : gettext("Expand All"),
    );

    button.innerHTML = "";
    button.appendChild(icon);
    button.appendChild(text);
  };

  updateButtonText();

  registerListener(button, "click", (event) => {
    event.stopPropagation();
    toggleAllDetails(!globalExpandState);
    updateButtonText();
  });

  return button;
}



function attachSidebarToggleHandler() {
  const btn = document.querySelector('.slide-right-sidebar .sidebar-collapse-btn');
  if (!btn) return;
  const sidebar = btn.closest('.slide-right-sidebar');
  if (!sidebar) return;
  // prevent double attaching
  if (btn.__osToggleAttached) return;
  btn.__osToggleAttached = true;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const collapsed = sidebar.classList.toggle('collapsed');
    setSidebarCollapsed(collapsed);
    const container = document.getElementById('slide-elements-list');
    if (container) applySidebarCollapsedState(container, collapsed);
  });
}

export function renderSlideElementsSidebar() {
  const container = document.getElementById("slide-elements-list");
  if (!container) return;

  const openPopovers = beginPopoverLifecycle();

  const state = createRenderState(container, openPopovers);

  if (!state.elements.length) {
    container.innerHTML = NO_ELEMENTS_HTML;
    restoreOpenPopovers(state.openPopovers, state);
    window.__previouslyOpenPopovers = state.openPopovers;
    return;
  }

  container.innerHTML = "";

  // Add expand/collapse all button
  const expandCollapseButton = createExpandCollapseButton();
  container.appendChild(expandCollapseButton);

  state.sortedElements.forEach((elData) => {
    const row = createElementRow(elData, state);
    container.appendChild(row);
  });

  initSortable(container, state);
  restoreOpenPopovers(state.openPopovers, state);
  window.__previouslyOpenPopovers = state.openPopovers;
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

function startSidebarPolling() {
  if (window.__slideElementsSidebarInterval) {
    clearInterval(window.__slideElementsSidebarInterval);
  }

  let lastSlidesStr = store.lastSlidesStr || JSON.stringify(store.slides || []);
  let lastSelectedElementId = store.selectedElementData
    ? store.selectedElementData.id
    : null;

  window.__slideElementsSidebarInterval = setInterval(() => {
    const currentSlidesStr = JSON.stringify(store.slides || []);
    const currentSelectedId = store.selectedElementData
      ? store.selectedElementData.id
      : null;

    if (currentSlidesStr !== lastSlidesStr) {
      lastSlidesStr = currentSlidesStr;
      store.lastSlidesStr = currentSlidesStr;
      renderSlideElementsSidebar();
    } else if (currentSelectedId !== lastSelectedElementId) {
      lastSelectedElementId = currentSelectedId;
      renderSlideElementsSidebar();
    }
  }, POLL_INTERVAL_MS);
}

export function initSlideElementsSidebar() {
  // Apply persisted collapsed state before initial render
  const collapsed = isSidebarCollapsed();
  const container = document.getElementById('slide-elements-list');
  if (container) applySidebarCollapsedState(container, collapsed);

  renderSlideElementsSidebar();
  attachSidebarToggleHandler();
  startSidebarPolling();
}

export default initSlideElementsSidebar;
