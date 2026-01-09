// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import {
  parentOrgID,
  queryParams,
  selectedBranchID,
  showToast,
  token,
} from "../../../../utils/utils.js";
import { gettext } from "../../../../utils/locales.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { GridUtils } from "../config/gridConfig.js";
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { loadSlide, updateSlideElement } from "../core/renderSlide.js";
import { selectElement } from "../core/elementSelector.js";
import { getNewZIndex } from "../utils/domUtils.js";
import { displayMediaModal } from "../modals/mediaModal.js";
import { showColorPalette } from "../utils/colorUtils.js";
import { videoCacheManager } from "../core/videoCacheManager.js";
import { getShapeSVG, shapeMap } from "./shapeElement.js";
import { isDirectImageUrl } from "../utils/specialSaveUtils.js";
import * as bootstrap from "bootstrap";

const MASK_SOURCE_EXTENSIONS = ["png", "svg"];
const MASK_IMAGE_EXTENSIONS = ["png", "jpeg", "jpg", "svg", "webp"];
const MASK_VIDEO_EXTENSIONS = ["mp4", "webm", "gif"];

const DEFAULT_MASK_COLOR = "#ffffff";
const DEFAULT_MASK_FIT = "contain";
const VALID_MASK_FITS = ["contain", "stretch"];
const DEFAULT_CONTENT_FIT = "cover";
const DEFAULT_CONTENT_POSITION = "center center";
const MASK_SHAPE_COLOR = "#ffffff";
const MASK_SHAPE_PREVIEW_COLOR = "#000000";

function ensureMaskDefaults(element) {
  if (!element) return;
  if (!element.maskSourceType) {
    element.maskSourceType = element.maskShape ? "shape" : "image";
  }
  if (!element.maskShape) element.maskShape = "circle";
  if (!VALID_MASK_FITS.includes(element.maskFit)) {
    element.maskFit = DEFAULT_MASK_FIT;
  }
  if (!element.contentType) element.contentType = "color";
  if (!element.contentColor) element.contentColor = DEFAULT_MASK_COLOR;
  if (!element.contentFit || !["cover", "fill"].includes(element.contentFit)) {
    element.contentFit = DEFAULT_CONTENT_FIT;
  }
  if (!element.contentPosition) element.contentPosition = DEFAULT_CONTENT_POSITION;
  if (typeof element.contentMuted === "undefined") {
    element.contentMuted = true;
  }
}

function createMaskElement() {
  const defaultSize = GridUtils.getDefaultElementSize('mask');
  const centeredPos = GridUtils.getCenteredPosition(defaultSize.width, defaultSize.height);
  const base = {
    id: store.elementIdCounter++,
    type: "mask",
    gridX: defaultSize.x ?? centeredPos.x,
    gridY: defaultSize.y ?? centeredPos.y,
    gridWidth: defaultSize.width,
    gridHeight: defaultSize.height,
    backgroundColor: "transparent",
    zIndex: getNewZIndex(),
    originSlideIndex: store.currentSlideIndex,
    isLocked: false,
    isHidden: false,
  };

  return {
    ...base,
    maskSourceType: "image",
    maskSourceId: null,
    maskShape: "circle",
    maskFit: DEFAULT_MASK_FIT,
    contentType: "color",
    contentColor: DEFAULT_MASK_COLOR,
    contentMediaId: null,
    contentFit: DEFAULT_CONTENT_FIT,
    contentPosition: DEFAULT_CONTENT_POSITION,
    contentMuted: true,
  };
}

function withSelectedMaskElement(callback, { silent = false } = {}) {
  const ctx = window.selectedElementForUpdate;
  if (ctx?.element?.type === "mask") {
    callback(ctx.element);
  } else if (!silent) {
    showToast(gettext("Please select a mask element first!"), "Info");
  }
}

function refreshMaskElement(element) {
  updateSlideElement(element);
  setupMaskToolbar();
}

function openMaskSourcePicker() {
  withSelectedMaskElement(() => {
    displayMediaModal(
      1,
      (docId) => {
        if (!docId) return;
        withSelectedMaskElement((element) => {
          pushCurrentSlideState();
          element.maskSourceType = "image";
          element.maskSourceId = docId;
          if (!element.maskShape) {
            element.maskShape = "circle";
          }
          refreshMaskElement(element);
        });
      },
      { file_types: MASK_SOURCE_EXTENSIONS },
      gettext("Image"),
    );
  });
}

function buildMaskShapeGrid() {
  const wrapper = document.createElement("div");
  wrapper.classList.add("d-flex", "gap-2", "flex-wrap");

  Object.keys(shapeMap).forEach((shapeKey) => {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add(
      "btn",
      "btn-outline-secondary",
      "btn-sm",
      "mask-shape-option-btn",
    );
    button.dataset.shapeType = shapeKey;
    button.style.width = "40px";
    button.style.height = "40px";
    button.style.padding = "4px";
    button.style.boxSizing = "border-box";
    button.innerHTML = getShapeSVG(
      shapeKey,
      MASK_SHAPE_PREVIEW_COLOR,
      MASK_SHAPE_PREVIEW_COLOR,
      "scale",
      { h: "center", v: "middle" },
      6,
      false,
      true,
    );
    button.title = gettext(shapeKey);
    wrapper.appendChild(button);
  });

  return wrapper;
}

function buildMaskSourcePopoverContent() {
  const wrapper = document.createElement("div");
  wrapper.classList.add("d-flex", "flex-column", "gap-2", "p-2", "mask-source-menu");

  const imageBtn = document.createElement("button");
  imageBtn.type = "button";
  imageBtn.classList.add(
    "btn",
    "btn-outline-secondary",
    "btn-sm",
    "w-100",
    "mask-source-image-btn",
  );
  imageBtn.textContent = gettext("Select image");
  wrapper.appendChild(imageBtn);

  const shapesLabel = document.createElement("span");
  shapesLabel.classList.add("text-muted", "small", "text-uppercase");
  shapesLabel.textContent = gettext("Shapes");
  wrapper.appendChild(shapesLabel);

  wrapper.appendChild(buildMaskShapeGrid());
  return wrapper;
}

function buildMaskContentPopoverContent() {
  const wrapper = document.createElement("div");
  wrapper.classList.add("d-flex", "flex-column", "gap-2", "p-2", "mask-content-menu");

  const options = [
    { kind: "image", label: gettext("Use image") },
    { kind: "video", label: gettext("Use video") },
    { kind: "color", label: gettext("Pick color") },
  ];

  options.forEach((option) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add(
      "btn",
      "btn-outline-secondary",
      "btn-sm",
      "w-100",
      "mask-content-option-btn",
    );
    btn.dataset.contentKind = option.kind;
    btn.textContent = option.label;
    wrapper.appendChild(btn);
  });

  return wrapper;
}

function initMaskSourcePopover(toolbar) {
  const trigger = toolbar?.querySelector("#mask-source-menu-btn");
  if (!trigger || trigger.dataset.maskSourcePopoverInitialized === "true") {
    return;
  }

  const content = buildMaskSourcePopoverContent();
  new bootstrap.Popover(trigger, {
    content,
    html: true,
    placement: "bottom",
    trigger: "click",
    container: "body",
  });
  trigger.dataset.maskSourcePopoverInitialized = "true";
}

function initMaskContentPopover(toolbar) {
  const trigger = toolbar?.querySelector("#mask-content-menu-btn");
  if (!trigger || trigger.dataset.maskContentPopoverInitialized === "true") {
    return;
  }

  const content = buildMaskContentPopoverContent();
  new bootstrap.Popover(trigger, {
    content,
    html: true,
    placement: "bottom",
    trigger: "click",
    container: "body",
  });
  trigger.dataset.maskContentPopoverInitialized = "true";
}

function handleMaskShapeSelection(shapeType) {
  if (!shapeType) return;
  withSelectedMaskElement(
    (element) => {
      pushCurrentSlideState();
      element.maskSourceType = "shape";
      element.maskShape = shapeType;
      element.maskSourceId = null;
      refreshMaskElement(element);
    },
    { silent: true },
  );
}

document.addEventListener("click", (event) => {
  const button = event.target.closest(".mask-shape-option-btn");
  if (!button) return;
  handleMaskShapeSelection(button.dataset.shapeType);
  const trigger = document.getElementById("mask-source-menu-btn");
  if (trigger) {
    bootstrap.Popover.getInstance(trigger)?.hide();
  }
});

document.addEventListener("click", (event) => {
  const imageBtn = event.target.closest(".mask-source-image-btn");
  if (imageBtn) {
    openMaskSourcePicker();
    const trigger = document.getElementById("mask-source-menu-btn");
    if (trigger) {
      bootstrap.Popover.getInstance(trigger)?.hide();
    }
    return;
  }

  const contentBtn = event.target.closest(".mask-content-option-btn");
  if (contentBtn) {
    const kind = contentBtn.dataset.contentKind;
    openMaskContentPicker(kind, contentBtn);
    const trigger = document.getElementById("mask-content-menu-btn");
    if (trigger) {
      bootstrap.Popover.getInstance(trigger)?.hide();
    }
  }
});

function openMaskContentPicker(kind, anchorEl = null) {
  if (kind === "image") {
    withSelectedMaskElement(() => {
      displayMediaModal(
        1,
        (docId) => {
          if (!docId) return;
          withSelectedMaskElement((element) => {
            pushCurrentSlideState();
            element.contentType = "image";
            element.contentMediaId = docId;
            delete element.contentColor;
            refreshMaskElement(element);
          });
        },
        { file_types: MASK_IMAGE_EXTENSIONS },
        gettext("Image"),
      );
    });
    return;
  }

  if (kind === "video") {
    withSelectedMaskElement(() => {
      displayMediaModal(
        1,
        (docId) => {
          if (!docId) return;
          withSelectedMaskElement((element) => {
            pushCurrentSlideState();
            element.contentType = "video";
            element.contentMediaId = docId;
            delete element.contentColor;
            refreshMaskElement(element);
          });
        },
        { file_types: MASK_VIDEO_EXTENSIONS },
        gettext("Video"),
      );
    });
    return;
  }

  if (kind === "color") {
    const anchor =
      document.querySelector("#mask-content-menu-btn") || anchorEl;
    withSelectedMaskElement((element) => {
      showColorPalette(anchor, (chosenColor) => {
        if (!chosenColor) return;
        pushCurrentSlideState();
        element.contentType = "color";
        element.contentColor = chosenColor;
        element.contentMediaId = null;
        refreshMaskElement(element);
      });
    });
  }
}

function handleMaskFitChange(event) {
  const value = event.target?.value;
  if (!value) return;
  withSelectedMaskElement((element) => {
    if (element.maskFit === value) return;
    pushCurrentSlideState();
    element.maskFit = value;
    refreshMaskElement(element);
  }, { silent: true });
}

function handleContentFitChange(event) {
  const value = event.target?.value;
  if (!value) return;
  withSelectedMaskElement((element) => {
    if (element.contentFit === value) return;
    pushCurrentSlideState();
    element.contentFit = value;
    refreshMaskElement(element);
  }, { silent: true });
}

export function setupMaskToolbar() {
  const toolbar = document.querySelector(".mask-element-toolbar");
  if (!toolbar) return;
  const ctx = window.selectedElementForUpdate;
  if (ctx?.element?.type !== "mask") return;

  const element = ctx.element;
  ensureMaskDefaults(element);

  toolbar.querySelectorAll('input[name="maskFit"]').forEach((radio) => {
    const isActive = radio.value === element.maskFit;
    radio.checked = isActive;
    radio.parentElement?.classList.toggle("active", isActive);
  });

  toolbar
    .querySelectorAll('input[name="maskContentFit"]')
    .forEach((radio) => {
      const isActive = radio.value === element.contentFit;
      radio.checked = isActive;
      radio.parentElement?.classList.toggle("active", isActive);
    });

}

function attachToolbarHandlers() {
  const toolbar = document.querySelector(".mask-element-toolbar");
  if (!toolbar) return;

  toolbar
    .querySelectorAll('input[name="maskFit"]')
    .forEach((radio) => radio.addEventListener("change", handleMaskFitChange));

  toolbar
    .querySelectorAll('input[name="maskContentFit"]')
    .forEach((radio) =>
      radio.addEventListener("change", handleContentFitChange),
    );

  initMaskSourcePopover(toolbar);
  initMaskContentPopover(toolbar);
}

function addMaskElement() {
  if (store.currentSlideIndex < 0) {
    showToast(gettext("Please select a slide first!"), "Info");
    return;
  }

  pushCurrentSlideState();
  const newMask = createMaskElement();
  store.slides[store.currentSlideIndex].elements.push(newMask);
  loadSlide(store.slides[store.currentSlideIndex]);
  const domRef = document.getElementById(`el-${newMask.id}`);
  if (domRef) {
    selectElement(domRef, newMask);
  }
}

export function initMaskElement() {
  const addBtn = document.querySelector('[data-type="mask"]');
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      window.selectedElementForUpdate = null;
      addMaskElement();
    });
  }

  attachToolbarHandlers();
}

function mapMaskFitToCss(value) {
  if (value === "stretch") {
    return "100% 100%";
  }
  return "contain";
}

function mapContentFitToCss(value) {
  switch (value) {
    case "contain":
      return "contain";
    case "fill":
      return "100% 100%";
    case "cover":
    default:
      return "cover";
  }
}

function mapContentFitToObjectFit(value) {
  switch (value) {
    case "fill":
      return "fill";
    case "contain":
      return "contain";
    case "cover":
    default:
      return "cover";
  }
}

function fetchDocumentUrl(documentId) {
  if (!documentId) return Promise.resolve(null);
  if (isDirectImageUrl(documentId)) return Promise.resolve(documentId);

  const headers = { "Content-Type": "application/json" };
  if (queryParams.apiKey) {
    headers["X-API-KEY"] = queryParams.apiKey;
  } else if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const params = new URLSearchParams({
    branch_id: selectedBranchID,
    organisation_id: parentOrgID,
  });

  if (queryParams.displayWebsiteId) {
    params.append("id", queryParams.displayWebsiteId);
  }

  return fetch(
    `${BASE_URL}/api/documents/file-token/${documentId}/?${params.toString()}`,
    { headers },
  )
    .then((resp) => resp.json())
    .then((data) => data.file_url || null)
    .catch((err) => {
      console.error("Failed to fetch document URL", err);
      return null;
    });
}

function getShapeMaskDataUrl(shapeName, fitMode = "scale") {
  if (!shapeName) return null;
  const key = String(shapeName).toLowerCase();
  if (!shapeMap[key]) return null;

  const svgMarkup = getShapeSVG(
    key,
    MASK_SHAPE_COLOR,
    MASK_SHAPE_COLOR,
    fitMode === "stretch" ? "stretch" : "scale",
    { h: "center", v: "middle" },
    0,
    false,
    false,
  );

  if (!svgMarkup) return null;

  const compactSvg = svgMarkup.replace(/\s+/g, " ").trim();
  const encoded = encodeURIComponent(compactSvg);
  return `data:image/svg+xml,${encoded}`;
}

function setMaskPlaceholder(target, visible) {
  let placeholder = target.querySelector(".mask-element__placeholder");
  if (!visible) {
    placeholder?.remove();
    return;
  }

  if (!placeholder) {
    placeholder = document.createElement("div");
    placeholder.classList.add("mask-element__placeholder");
    placeholder.textContent = gettext("Select mask image or shape");
    target.appendChild(placeholder);
  }
}

function applyMaskSource(element, contentWrapper) {
  const cssSize = mapMaskFitToCss(element.maskFit);
  contentWrapper.style.maskRepeat = "no-repeat";
  contentWrapper.style.webkitMaskRepeat = "no-repeat";
  contentWrapper.style.maskPosition = "center";
  contentWrapper.style.webkitMaskPosition = "center";
  contentWrapper.style.maskSize = cssSize;
  contentWrapper.style.webkitMaskSize = cssSize;
  const shouldShowPlaceholder =
    element.maskSourceType !== "shape" && !element.maskSourceId;
  setMaskPlaceholder(contentWrapper, shouldShowPlaceholder);

  if (element.maskSourceType === "shape") {
    const dataUrl = getShapeMaskDataUrl(element.maskShape, element.maskFit);
    if (dataUrl) {
      contentWrapper.style.maskImage = `url("${dataUrl}")`;
      contentWrapper.style.webkitMaskImage = `url("${dataUrl}")`;
    } else {
      contentWrapper.style.maskImage = "none";
      contentWrapper.style.webkitMaskImage = "none";
      setMaskPlaceholder(contentWrapper, true);
    }
    return;
  }

  if (!element.maskSourceId) {
    contentWrapper.style.maskImage = "none";
    contentWrapper.style.webkitMaskImage = "none";
    return;
  }

  const expectedId = element.maskSourceId;
  fetchDocumentUrl(expectedId).then((url) => {
    if (!url || !contentWrapper.isConnected) return;
    if (element.maskSourceId !== expectedId) return;
    contentWrapper.style.maskImage = `url(${url})`;
    contentWrapper.style.webkitMaskImage = `url(${url})`;
  });
}

function applyColorContent(element, mediaLayer) {
  mediaLayer.innerHTML = "";
  mediaLayer.style.backgroundColor = element.contentColor || DEFAULT_MASK_COLOR;
  mediaLayer.style.backgroundImage = "none";
}

function applyImageContent(element, mediaLayer) {
  mediaLayer.innerHTML = "";
  mediaLayer.style.backgroundColor = "transparent";

  const expectedId = element.contentMediaId;
  fetchDocumentUrl(expectedId).then((url) => {
    if (!url || !mediaLayer.isConnected) return;
    if (element.contentMediaId !== expectedId) return;
    mediaLayer.style.backgroundImage = `url(${url})`;
    mediaLayer.style.backgroundRepeat = "no-repeat";
    mediaLayer.style.backgroundPosition = element.contentPosition;
    mediaLayer.style.backgroundSize = mapContentFitToCss(element.contentFit);
  });
}

function applyVideoContent(element, mediaLayer) {
  mediaLayer.innerHTML = "";
  const video = document.createElement("video");
  video.autoplay = true;
  video.loop = true;
  video.muted = element.contentMuted !== false;
  video.playsInline = true;
  video.controls = false;
  video.classList.add("mask-element__video");
  video.style.objectFit = mapContentFitToObjectFit(element.contentFit);
  video.style.objectPosition = element.contentPosition;

  mediaLayer.appendChild(video);

  const expectedId = element.contentMediaId;
  if (isDirectImageUrl(expectedId)) {
    video.src = expectedId;
    video.play().catch(() => {});
    return;
  }

  videoCacheManager.attachVideoToElement(video, expectedId);
  video.addEventListener(
    "loadeddata",
    () => {
      if (!video.isConnected) {
        return;
      }
      video.play().catch(() => {});
    },
    { once: true },
  );
}

function applyContent(element, mediaLayer) {
  ensureMaskDefaults(element);
  mediaLayer.style.backgroundImage = "none";
  mediaLayer.style.backgroundColor = "transparent";

  if (element.contentType === "image" && element.contentMediaId) {
    applyImageContent(element, mediaLayer);
    return;
  }

  if (element.contentType === "video" && element.contentMediaId) {
    applyVideoContent(element, mediaLayer);
    return;
  }

  applyColorContent(element, mediaLayer);
}

export function _renderMask(element, container) {
  ensureMaskDefaults(element);

  const root = document.createElement("div");
  root.classList.add("mask-element");
  root.style.width = "100%";
  root.style.height = "100%";

  const contentWrapper = document.createElement("div");
  contentWrapper.classList.add("mask-element__content");
  root.appendChild(contentWrapper);

  const mediaLayer = document.createElement("div");
  mediaLayer.classList.add("mask-element__media");
  contentWrapper.appendChild(mediaLayer);

  container.appendChild(root);

  applyMaskSource(element, contentWrapper);
  applyContent(element, mediaLayer);
}
