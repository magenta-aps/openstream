// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import {
  queryParams,
  selectedBranchID,
  token,
} from "../../../../utils/utils.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { _renderBackgroundColor } from "../element_formatting/backgroundColor.js";
import { _renderBorder } from "../element_formatting/border.js";
import { _renderBorderRadius } from "../element_formatting/borderRadius.js";
import { _renderBoxShadow } from "../element_formatting/boxShadow.js";
import { _renderZIndex } from "../element_formatting/bringFrontBack.js";
import { _renderOffset } from "../element_formatting/offset.js";
import { _renderOpacity } from "../element_formatting/opacity.js";
import { _renderPadding } from "../element_formatting/padding.js";
import { _renderRotate } from "../element_formatting/rotate.js";
import { _renderMirror } from "../element_formatting/mirror.js";
import { _renderScale } from "../element_formatting/scale.js";
import { _renderBlur } from "../element_formatting/blur.js";
import { _renderEmbedWebsite } from "../elements/embedWebsiteElement.js";
import { _renderHtmlElement } from "../elements/htmlElement.js";
import { _renderIframe } from "../elements/iframeElement.js";
import { _renderImage } from "../elements/imageElement.js";
import { _renderShape } from "../elements/shapeElement.js";
import { _renderBox } from "../elements/boxElement.js";
import { _renderTable } from "../elements/tableElement.js";
import { _renderList } from "../elements/listElement.js";
import { _renderTextbox } from "../elements/textbox.js";
import { _renderVideo } from "../elements/videoElement.js";
import { _renderPlaceholder } from "../elements/placeholderElement.js";
import {
  hideElementToolbars,
  hideResizeHandles,
  selectElement,
} from "./elementSelector.js";
import { makeDraggable, makeResizable } from "./gridResizer.js";
import { updateSlideSelector } from "./slideSelector.js";
import { playSlideshow } from "./slideshowPlayer.js";
import { store } from "./slideStore.js";
import { addLockIndicatorsToElements } from "../element_formatting/lockElement.js";
import {
  updateAllSlidesZoom,
  getCurrentZoomInfo,
} from "../utils/zoomController.js";
import { gettext } from "../../../../utils/locales.js";

export function loadSlide(
  slide,
  targetContainer = ".preview-slide",
  completeReload = false,
  forceCompleteReload = false,
) {
  // Sanitize all slides to ensure unique IDs and correct indices
  const slideIdSet = new Set();
  const elementIdSet = new Set();
  let maxSlideId = 0;
  let maxElementId = 0;

  store.slides.forEach((s) => {
    if (s.id > maxSlideId) maxSlideId = s.id;
    if (s.elements) {
      s.elements.forEach((element) => {
        if (element.id > maxElementId) maxElementId = element.id;
      });
    }
  });

  store.slideIdCounter = Math.max(store.slideIdCounter || 1, maxSlideId + 1);
  store.elementIdCounter = Math.max(
    store.elementIdCounter || 1,
    maxElementId + 1,
  );

  store.slides.forEach((s, index) => {
    // Sanitize slide ID
    if (slideIdSet.has(s.id)) {
      s.id = store.slideIdCounter++;
    }
    slideIdSet.add(s.id);

    // Sanitize element IDs and update originSlideIndex
    if (s.elements) {
      s.elements.forEach((element) => {
        if (elementIdSet.has(element.id)) {
          element.id = store.elementIdCounter++;
        }
        elementIdSet.add(element.id);
        element.originSlideIndex = index;
      });
    }
  });

  const noContentPlaceHolder = document.querySelector(
    ".no-content-placeholder",
  );
  if (noContentPlaceHolder) {
    noContentPlaceHolder.style.display = "none";
  }

  const wysiwygToolbar = document.querySelector(".wysiwyg-toolbar");
  _resetEditorSelection(wysiwygToolbar);

  _syncSlideBgColorIcon(slide.backgroundColor);

  const previewSlide = document.querySelector(targetContainer);

  if (!previewSlide) {
    console.error(`Target container "${targetContainer}" not found.`);
    return;
  }

  // Find or create the zoom wrapper *within* the previewSlide
  let zoomWrapper = previewSlide.querySelector(".zoom-wrapper");
  if (!zoomWrapper) {
    zoomWrapper = document.createElement("div");
    zoomWrapper.className = "zoom-wrapper"; // Add a class for easier selection
    previewSlide.appendChild(zoomWrapper); // Append early
  }

  // ALWAYS set dimensions after finding or creating
  zoomWrapper.style.width = store.emulatedWidth + "px";
  zoomWrapper.style.height = store.emulatedHeight + "px";

  // Apply background color to zoomWrapper
  if (slide.backgroundColor) {
    zoomWrapper.style.backgroundColor = slide.backgroundColor;
  }

  // Apply background image styles to zoomWrapper if they exist
  if (slide.backgroundImage) {
    const apiKey = queryParams.apiKey;

    const headers = { "Content-Type": "application/json" };
    if (apiKey) {
      headers["X-API-KEY"] = apiKey;
    } else if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      throw new Error(gettext("No API Key or Authorization token found."));
    }
    // Fetch and apply logic remains here, targeting zoomWrapper
    fetch(
      `${BASE_URL}/api/documents/file-token/${slide.backgroundImage}/?branch_id=${selectedBranchID}&id=${queryParams.displayWebsiteId}`,
      {
        method: "GET",
        headers,
      },
    )
      .then((r) => r.json())
      .then((data) => {
        zoomWrapper.style.backgroundImage = `url(${data.file_url})`;
        zoomWrapper.style.backgroundSize = slide.backgroundSize || "contain";
        zoomWrapper.style.backgroundRepeat =
          slide.backgroundRepeat || "no-repeat";
        zoomWrapper.style.backgroundPosition =
          slide.backgroundPosition || "center";
      })
      .catch((err) => {
        console.error("Failed to load background image:", err);
        // Potentially set background color on zoomWrapper as fallback?
      });
  } else {
    zoomWrapper.style.backgroundImage = "";
  }

  // Find or create the grid container *within* the zoomWrapper
  let gridContainer = zoomWrapper.querySelector(".grid-container");

  // Determine the current slide ID to compare with the slide being loaded
  const currentSlideId = store.slides[store.currentSlideIndex]?.id;
  const loadingSlideId = slide.id;
  const isSameSlide = currentSlideId === loadingSlideId;

  // Only clear elements if it's a different slide OR if completeReload is true AND it's not the same slide
  // This prevents clearing elements when reloading the same slide in slideshow mode
  const shouldClearElements =
    store.currentSlideIndex !== store.lastSlideIndex ||
    (completeReload && !isSameSlide);

  if (forceCompleteReload || shouldClearElements) {
    if (gridContainer) {
      if (forceCompleteReload) {
        // Simply remove all elements for a forced reload
        gridContainer.innerHTML = "";
      } else {
        // Instead of clearing everything, remove only non-persistent slide elements
        gridContainer
          .querySelectorAll(".slide-element:not(.is-persistent)")
          .forEach((e) => {
            // Apply the transition and initial styles
            e.style.animation = "none";
            e.style.transition = "opacity 1s ease";
            e.style.opacity = "1"; // ensure it's fully visible to start

            // Force reflow to ensure transition applies
            void e.offsetWidth;

            // Start fade-out
            e.style.opacity = "0";

            // Remove after 1 second (duration of fade-out)
            setTimeout(() => {
              e.remove();
            }, 1000);
          });
      }
    } else {
      // If gridContainer doesn't exist, create it
      gridContainer = document.createElement("div");
      gridContainer.className = "grid-container";
      gridContainer.style.overflow = "hidden";
      zoomWrapper.appendChild(gridContainer); // Append early
    }

    // ALWAYS set grid dimensions after finding/creating/clearing
    gridContainer.style.width = store.emulatedWidth + "px";
    gridContainer.style.height = store.emulatedHeight + "px";
    if (store.showGrid) gridContainer.classList.add("show-grid");
    else gridContainer.classList.remove("show-grid"); // Ensure grid class is removed if needed

    // Attach listeners only when creating/clearing the grid
    gridContainer.addEventListener("click", (event) => {
      // Only deselect if clicking directly on the grid container (empty space), not on child elements
      if (event.target === gridContainer) {
        // Exit edit mode for any currently contentEditable elements
        const activeEditableElements = document.querySelectorAll(
          '[contenteditable="true"]',
        );
        activeEditableElements.forEach((editableEl) => {
          editableEl.blur();
          editableEl.contentEditable = false;
        });

        hideElementToolbars();
        hideResizeHandles();
        window.selectedElementForUpdate = null;
        store.selectedElement = null;
      }
    });
    gridContainer.addEventListener("click", () => {
      document.querySelectorAll(".popover").forEach((popover) => {
        popover.style.display = "none";
      });
    });
  } else if (!gridContainer) {
    // If it's the same slide, no completeReload, but grid is missing (shouldn't happen often)
    gridContainer = document.createElement("div");
    gridContainer.className = "grid-container";
    gridContainer.style.overflow = "hidden";
    zoomWrapper.appendChild(gridContainer); // Append early

    // ALWAYS set grid dimensions after finding/creating
    gridContainer.style.width = store.emulatedWidth + "px";
    gridContainer.style.height = store.emulatedHeight + "px";
    if (store.showGrid) gridContainer.classList.add("show-grid");
    else gridContainer.classList.remove("show-grid"); // Ensure grid class is removed if needed

    // Add listeners here too
    gridContainer.addEventListener("click", () => {
      hideElementToolbars();
      window.selectedElementForUpdate = null;
      store.selectedElement = null;
    });
    gridContainer.addEventListener("click", () => {
      document.querySelectorAll(".popover").forEach((popover) => {
        popover.style.display = "none";
      });
    });
  } else {
    // If gridContainer exists and it's the same slide, still update its dimensions and grid class
    gridContainer.style.width = store.emulatedWidth + "px";
    gridContainer.style.height = store.emulatedHeight + "px";
    if (store.showGrid) gridContainer.classList.add("show-grid");
    else gridContainer.classList.remove("show-grid");
  }

  // Render elements - _renderSlideElement handles checking if element already exists
  // Defensive check: ensure slide has elements array
  if (!slide.elements) {
    slide.elements = [];
  }

  slide.elements.forEach((el) => {
    if (!el.isPersistent) {
      _renderSlideElement(el, false, gridContainer);
    }
  });

  // Render persistent elements from all slides, plus unpinned elements on their origin slide
  store.slides.forEach((s, slideIndex) => {
    // Defensive check: ensure each slide has elements array
    if (!s.elements) {
      s.elements = [];
    }
    s.elements.forEach((el) => {
      if (el.isPersistent) {
        // Render persistent elements on all slides
        _renderSlideElement(el, false, gridContainer);
      } else if (
        typeof el.originSlideIndex === "number" &&
        el.originSlideIndex === store.currentSlideIndex &&
        slideIndex !== store.currentSlideIndex
      ) {
        // Render unpinned elements only on their origin slide (when they're from other slides)
        _renderSlideElement(el, false, gridContainer);
      }
    });
  });

  store.lastSlideIndex = store.currentSlideIndex;

  // Add lock indicators to locked elements in template editor mode
  addLockIndicatorsToElements();
}

export function renderPersistentElements() {
  const persistentContainer = document.querySelector(
    ".persistent-elements-container",
  );
  if (!persistentContainer) return;

  // Clear existing persistent elements
  persistentContainer.innerHTML = "";

  // Find and render all persistent elements from all slides
  store.slides.forEach((slide) => {
    slide.elements.forEach((element) => {
      if (element.isPersistent) {
        _renderSlideElement(element, false, persistentContainer);
      }
    });
  });
}

/**
 * Update a single element by removing it and re-rendering it with updated data.
 * This is more efficient than reloading the entire slide when only one element changes.
 *
 * @param {Object} elementData - The updated element data object
 */
export function updateSlideElement(elementData) {
  if (!elementData || !elementData.id) {
    console.error("updateSlideElement: Invalid element data");
    return;
  }

  // Find the grid container where this element should be rendered
  const previewSlide = document.querySelector(".preview-slide");
  if (!previewSlide) {
    console.error("updateSlideElement: Preview slide not found");
    return;
  }

  const gridContainer = previewSlide.querySelector(
    ".zoom-wrapper .grid-container",
  );
  if (!gridContainer) {
    console.error("updateSlideElement: Grid container not found");
    return;
  }

  // Remove the old element DOM node if it exists
  const oldElement = gridContainer.querySelector(`#el-${elementData.id}`);
  if (oldElement) {
    oldElement.remove();
  }

  // Re-render the element with updated data
  _renderSlideElement(elementData, false, gridContainer);
}

export function scaleSlide(previewContainer) {
  const zoomInfo = getCurrentZoomInfo();

  if (zoomInfo.mode === "fit") {
    // Original fit-to-window behavior
    const containerRect = previewContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    const scale = Math.min(
      containerWidth / store.emulatedWidth,
      containerHeight / store.emulatedHeight,
    );
    store.currentScale = scale;

    const previewSlide = previewContainer.querySelector(".preview-slide");
    if (previewSlide) {
      previewSlide.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
  } else {
    // Zoom mode - let zoom controller handle it
    updateAllSlidesZoom();
  }
}

export function scaleAllSlides() {
  const zoomInfo = getCurrentZoomInfo();

  // Use the same selector pattern as zoom controller to get the correct preview containers
  const previewContainers = document.querySelectorAll(
    ".preview-column .preview-container, .slide-canvas .preview-container:not(.preview-column .preview-container)",
  );

  previewContainers.forEach((container) => {
    const previewSlide = container.querySelector(".preview-slide");
    // Update zoomWrapper and gridContainer dimensions here as well,
    // because scaleAllSlides might be called independently after resolution change
    const zoomWrapper = previewSlide?.querySelector(".zoom-wrapper");
    const gridContainer = zoomWrapper?.querySelector(".grid-container");

    if (zoomWrapper) {
      zoomWrapper.style.width = `${store.emulatedWidth}px`;
      zoomWrapper.style.height = `${store.emulatedHeight}px`;
    }
    if (gridContainer) {
      gridContainer.style.width = `${store.emulatedWidth}px`;
      gridContainer.style.height = `${store.emulatedHeight}px`;
    }

    if (previewSlide) {
      if (zoomInfo.mode === "fit") {
        scaleSlide(container); // Scale the container based on the new dimensions
      } else {
        // In zoom mode, just update the zoom
        updateAllSlidesZoom();
      }
    }
  });
}

export function initSlideshowPlayerMode() {
  function autoRefreshEvery(minutes) {
    const interval = minutes * 60 * 1000;
    setInterval(() => {
      if (navigator.onLine) {
        // Only refresh if online
        location.reload();
      }
    }, interval);
  }
  autoRefreshEvery(30); // Refresh every 30 minutes

  localStorage.setItem("apiKey", queryParams.apiKey);
  // Emulated size becomes full window
  store.emulatedWidth = window.innerWidth;
  store.emulatedHeight = window.innerHeight;
  // Add body class to hide editor UI when in player mode
  try {
    document.body.classList.add("player-mode");
  } catch (e) {
    // document may not be available in some test environments
  }
  _startSlideshowPlayer();
}

async function _startSlideshowPlayer() {
  const apiKey = queryParams.apiKey;

  await (async function fetchActiveContent() {
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) {
        headers["X-API-KEY"] = apiKey;
      } else if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      } else {
        throw new Error(gettext("No API Key or Authorization token found."));
      }

      const response = await fetch(
        `${BASE_URL}/api/display-website/get-active-content?id=${queryParams.displayWebsiteId}`,
        {
          method: "GET",
          headers,
        },
      );
      if (!response.ok) {
        console.error("Failed to fetch data", response.status);
        return;
      }

      const data = await response.json();

      if (data.items && data.items.length > 0) {
        store.slideshowMode = data.items[0].slideshow.mode;
      } else if (data.slideshow_data) {
        store.slideshowMode = data.slideshow_data.mode;
      }

      const allSlides = [];
      if (data.items) {
        // Playlist
        let slideIndexOffset = 0;
        for (const item of data.items) {
          if (
            item.slideshow &&
            item.slideshow.slideshow_data &&
            Array.isArray(item.slideshow.slideshow_data.slides)
          ) {
            const slidesFromOneSlideshow = JSON.parse(
              JSON.stringify(item.slideshow.slideshow_data.slides),
            );

            slidesFromOneSlideshow.forEach((slide) => {
              if (slide.elements && Array.isArray(slide.elements)) {
                slide.elements.forEach((element) => {
                  if (typeof element.goToSlideIndex === "number") {
                    element.goToSlideIndex += slideIndexOffset;
                  }
                });
              }
            });
            allSlides.push(...slidesFromOneSlideshow);
            slideIndexOffset = allSlides.length;
          }
        }
      } else {
        // Single slideshow
        if (data.slideshow_data && data.slideshow_data.slides) {
          allSlides.push(...data.slideshow_data.slides);
        }
      }

      // Sanitize all slides to ensure unique IDs and correct indices
      const slideIdSet = new Set();
      const elementIdSet = new Set();
      let maxSlideId = 0;
      let maxElementId = 0;

      allSlides.forEach((slide) => {
        if (slide.id > maxSlideId) maxSlideId = slide.id;
        if (slide.elements) {
          slide.elements.forEach((element) => {
            if (element.id > maxElementId) maxElementId = element.id;
          });
        }
      });

      let slideIdCounter = maxSlideId + 1;
      let elementIdCounter = maxElementId + 1;

      allSlides.forEach((slide, index) => {
        // Sanitize slide ID
        if (slideIdSet.has(slide.id)) {
          slide.id = slideIdCounter++;
        }
        slideIdSet.add(slide.id);

        // Sanitize element IDs and update originSlideIndex
        if (slide.elements) {
          slide.elements.forEach((element) => {
            if (elementIdSet.has(element.id)) {
              element.id = elementIdCounter++;
            }
            elementIdSet.add(element.id);
            element.originSlideIndex = index;
          });
        }
      });

      store.slides = allSlides;
    } catch (err) {
      console.error("Fetch error:", err);
    }
  })();

  if (store.slideshowMode === "interactive") {
    // Ensure body has player-mode class
    try {
      document.body.classList.add("player-mode");
    } catch (e) {}

    if (store.slides.length > 0) {
      store.currentSlideIndex = 0;
      loadSlide(store.slides[0], undefined, undefined, true);
    }
  } else {
    // Not interactive mode: ensure any player-mode class is removed
    try {
      document.body.classList.remove("player-mode");
    } catch (e) {}

    if (store.slides.length > 0) {
      await playSlideshow(false);
    }
  }
  renderPersistentElements();
}

function _resetEditorSelection(wysiwygToolbar) {
  // Exit edit mode for any currently contentEditable elements
  const activeEditableElements = document.querySelectorAll(
    '[contenteditable="true"]',
  );
  activeEditableElements.forEach((editableEl) => {
    editableEl.blur();
    editableEl.contentEditable = false;
  });

  if (wysiwygToolbar) {
    wysiwygToolbar.classList.add("disabled");
  }
  store.selectedElement = null;
  store.selectedElementData = null;

  const bgColorBtn = document.querySelector(
    '#selected-element-toolbar button[title="Background Color"]',
  );
  if (bgColorBtn) bgColorBtn.style.backgroundColor = "";

  const borderBtn = document.querySelector(
    '#selected-element-toolbar button[title="Border"]',
  );
  if (borderBtn) borderBtn.style.border = "";

  const boxShadowBtn = document.querySelector(
    '#selected-element-toolbar button[title="Box Shadow"]',
  );
  if (boxShadowBtn) boxShadowBtn.style.border = "";

  // Clear table cell edit indicators from all tables
  document.querySelectorAll("table").forEach((table) => {
    const allCells = table.querySelectorAll("th, td");
    allCells.forEach((cell) => {
      cell.style.outline = "";
      cell.contentEditable = "false";
    });
  });
}

function _syncSlideBgColorIcon(backgroundColor) {
  const slideBgColorOption = document.querySelector(
    '[data-type="change-background-color"]',
  );
  if (!slideBgColorOption) return;

  const icon = slideBgColorOption.querySelector(".img-container i");
  if (icon) {
    icon.style.border = `5px solid ${backgroundColor}`;
  }
}

function _renderSlideElement(el, isInteractivePlayback, gridContainer) {
  // Consider this an interactive playback render when we're not in the
  // editor or template editor modes. That covers slideshow and interactive
  // playback contexts where we shouldn't show editor-only indicators.
  if (
    queryParams.mode !== "edit" &&
    queryParams.mode !== "template_editor" &&
    queryParams.mode !== "suborg_templates"
  ) {
    isInteractivePlayback = true;
  }

  // Check if element already exists *within this specific gridContainer*
  const elExists = gridContainer.querySelector("#el-" + el.id);
  if (elExists) {
    return;
  }

  const container = document.createElement("div");
  container.classList.add("slide-element", el.type);
  if (el.isPersistent) {
    container.classList.add("is-persistent");
  }
  container.id = "el-" + el.id;
  container.style.gridColumnStart = el.gridX + 1;
  container.style.gridColumnEnd = `span ${el.gridWidth}`;
  container.style.gridRowStart = el.gridY + 1;
  container.style.gridRowEnd = `span ${el.gridHeight}`;

  container.addEventListener("click", () => {
    document.querySelectorAll(".popover").forEach((popover) => {
      popover.style.display = "none";
    });
  });

  // If element blocks selection, mark visually and disable pointer events
  if (el.isSelectionBlocked) {
    container.classList.add("is-selection-blocked");
    // Prevent clicks and interactions that would select/edit the element
    container.style.pointerEvents = "none";
  }

  // Add is-locked class if element is locked
  if (el.isLocked) {
    container.classList.add("is-locked");
  }

  if (el.rotation) {
    _renderRotate(container, el);
  }

  if (el.mirror) {
    _renderMirror(container, el);
  }

  if (el.scale) {
    _renderScale(container, el);
  }

  if (el.opacity) {
    _renderOpacity(container, el);
  }
  if (el.rounded || el.borderRadius) {
    _renderBorderRadius(container, el);
  }

  if (el.backgroundColor) {
    _renderBackgroundColor(container, el);
  }
  if (el.border || el.borderData) {
    _renderBorder(container, el);
  }
  if (el.boxShadow || el.boxShadowData) {
    _renderBoxShadow(container, el);
  }

  if (el.blur) {
    _renderBlur(container, el);
  }

  if (el.zIndex) {
    _renderZIndex(container, el);
  }

  if (el.left || el.top) {
    _renderOffset(container, el);
  }

  if (el.padding) {
    _renderPadding(container, el);
  }

  // Handle element visibility (default to visible if property is undefined)
  if (el.isHidden === true) {
    container.style.visibility = "hidden";
  } else {
    container.style.visibility = "visible";
  }

  const resizer = document.createElement("div");
  resizer.classList.add("resize-handle");
  container.appendChild(resizer);

  if (
    queryParams.mode === "edit" ||
    queryParams.mode === "template_editor" ||
    queryParams.mode === "suborg_templates"
  ) {
    if (!el.isSelectionBlocked) {
      container.addEventListener("click", (ev) => {
        // Check if we're clicking within a contentEditable element that's already in edit mode
        const clickedEditableElement = ev.target.closest(
          '[contenteditable="true"]',
        );

        // If clicking within an already-editable element, don't trigger selection
        if (
          clickedEditableElement &&
          clickedEditableElement.isContentEditable
        ) {
          return; // Let the text editing happen naturally
        }

        ev.stopPropagation();
        selectElement(container, el);
      });
      makeDraggable(container, el);
      makeResizable(container, el);
    } else {
      // Visual only; don't attach interactive handlers
      container.style.cursor = "default";
    }
  }

  if (store.slideshowMode === "interactive" && queryParams.mode !== "edit") {
    if (typeof el.goToSlideIndex === "number") {
      container.style.cursor = "pointer";
      container.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (store.slides[el.goToSlideIndex]) {
          store.currentSlideIndex = el.goToSlideIndex;
          loadSlide(store.slides[el.goToSlideIndex]);

          updateSlideSelector();
        }
      });
    }
  }

  if (el.type === "textbox") {
    _renderTextbox(el, container, isInteractivePlayback);
  } else if (el.type === "embed-website") {
    _renderEmbedWebsite(el, container);
  } else if (el.type === "image") {
    _renderImage(el, container);
  } else if (el.type === "iframe") {
    _renderIframe(el, container);
  } else if (el.type === "video") {
    _renderVideo(el, container);
  } else if (el.type === "shape") {
    _renderShape(el, container);
  } else if (el.type === "box") {
    _renderBox(el, container);
  } else if (el.type === "html") {
    _renderHtmlElement(el, container);
  } else if (el.type === "table") {
    _renderTable(el, container);
  } else if (el.type === "list") {
    _renderList(el, container, isInteractivePlayback);
  } else if (el.type === "placeholder") {
    _renderPlaceholder(el, container);
  }

  gridContainer.appendChild(container);

  // Now that container is in the DOM, set up the resize handle as a sibling
  // to avoid it being clipped by border-radius
  const resizerHandle = container.querySelector(".resize-handle");
  if (resizerHandle && container.parentNode) {
    // Remove from container and re-add as sibling
    resizerHandle.remove();
    resizerHandle.style.cssText = `
      display: none;
      position: absolute;
      width: 15px;
      height: 15px;
      background: #696969;
      cursor: se-resize;
      user-select: none;
      z-index: 9999;
      pointer-events: auto;
    `;

    // Position the resizer at the bottom-right corner of the container
    const updateResizerPosition = () => {
      resizerHandle.style.left =
        container.offsetLeft + container.offsetWidth - 15 + "px";
      resizerHandle.style.top =
        container.offsetTop + container.offsetHeight - 15 + "px";
    };

    // Insert resizer as sibling, not child, so it won't be clipped by border-radius
    container.parentNode.insertBefore(resizerHandle, container.nextSibling);
    updateResizerPosition();

    // Store reference and update function on container
    container._resizeHandle = resizerHandle;
    container._updateResizerPosition = updateResizerPosition;

    // Add mutation observer to track position/size changes
    const resizerObserver = new MutationObserver(() => {
      updateResizerPosition();
    });
    resizerObserver.observe(container, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    container._resizerObserver = resizerObserver;
  }
}
