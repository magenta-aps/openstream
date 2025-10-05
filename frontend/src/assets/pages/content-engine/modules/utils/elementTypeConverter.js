// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { loadSlide } from "../core/renderSlide.js";
import { selectElement } from "../core/elementSelector.js";
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { getNewZIndex } from "./domUtils.js";
import { getDefaultFont } from "./fontUtils.js";
import { displayMediaModal } from "../modals/mediaModal.js";
import { BASE_URL } from "../../../../utils/constants.js";
import {
  token,
  selectedBranchID,
  parentOrgID,
  queryParams,
} from "../../../../utils/utils.js";
import { gettext } from "../../../../utils/locales.js";

/**
 * Default element configurations for each type
 */
function getElementDefaults() {
  const defaultFont = getDefaultFont();

  return {
    textbox: {
      type: "textbox",
      text: `<span><span 
               data-font-size-key="12"
               data-font-family="${defaultFont}"
               style="font-size: 1.5rem; font-family: '${defaultFont}'; line-height: 1.2;"
             >
             Double click to edit text
             </span>
             </span>`,
      border: false,
      backgroundColor: "transparent",
      fontFamily: defaultFont,
      fontSize: "12",
      lineHeight: "1.2",
      textColor: "#000000",
      fontWeight: "normal",
      textDecoration: "none",
      textAlign: "left",
    },

    image: {
      type: "image",
      content: null, // Will need to be set by user after conversion
      backgroundColor: "transparent",
      sizingMode: "scaled",
      objectPosition: "center center",
    },

    video: {
      type: "video",
      content: null, // Will need to be set by user after conversion
      backgroundColor: "transparent",
      muted: true,
      objectPosition: "center center",
    },

    table: {
      type: "table",
      rows: 3,
      cols: 3,
      data: [
        ["Header 1", "Header 2", "Header 3"],
        ["Row 1 Col 1", "Row 1 Col 2", "Row 1 Col 3"],
        ["Row 2 Col 1", "Row 2 Col 2", "Row 2 Col 3"],
      ],
      striped: true,
      bordered: true,
      cellSizing: "even",
      headerFontSize: 2.3,
      rowFontSize: 1.7,
      headerFontFamily: defaultFont,
      rowFontFamily: defaultFont,
      useBgColor: true,
      tableBgColor: "#ffffff",
      fontColor: "#212529",
      stripedColor: "#f8f9fa",
      stripedFontColor: "#212529",
      borderColor: "#dee2e6",
      borderThickness: 1,
    },

    list: {
      type: "list",
      listType: "disc",
      items: [
        { text: "First list item", indent: 0 },
        { text: "Second list item", indent: 0 },
        { text: "Third list item", indent: 0 },
      ],
      fontSize: 1.5,
      fontFamily: defaultFont,
      fontColor: "#212529",
      lineHeight: 1.4,
      itemSpacing: 0.5,
    },

    shape: {
      type: "shape",
      shape: "right-arrow",
      backgroundColor: "transparent",
      fill: "#000000",
      stroke: "#000000",
      fitMode: "scale",
      strokeWidth: 10,
      alignment: { h: "center", v: "middle" },
    },

    html: {
      type: "html",
      html: '<div class="example">\n  <h2>Hello World</h2>\n  <p>This is an example HTML element.</p>\n</div>',
      css: ".example {\n  padding: 20px;\n  background-color: #f0f0f0;\n  border-radius: 8px;\n  font-family: Arial, sans-serif;\n}\n\nh2 {\n  color: #0078d7;\n}",
      js: "// Add your JavaScript code here",
      content: "", // Will be generated from html/css/js
    },

    "embed-website": {
      type: "embed-website",
      url: "https://example.com",
      border: false,
      backgroundColor: "transparent",
      muted: true,
    },

    "dynamic-element": {
      isDynamic: true,
      type: "iframe",
      content: "",
      backgroundColor: "transparent",
    },

    iframe: {
      type: "iframe",
      content: "",
      backgroundColor: "transparent",
      isDynamic: true,
    },

    placeholder: {
      type: "placeholder",
      backgroundColor: "#f0f0f0",
      border: true,
      borderColor: "#cccccc",
      borderWidth: 2,
      borderStyle: "dashed",
    },
  };
}

/**
 * Properties to preserve when converting elements
 */
const preservedProperties = [
  "gridX",
  "gridY",
  "gridWidth",
  "gridHeight",
  "zIndex",
  "rotation",
  "scale",
  "opacity",
  "rounded",
  "border",
  "borderColor",
  "borderWidth",
  "borderStyle",
  "backgroundColor",
  "boxShadow",
  "left",
  "top",
  "padding",
  "originSlideIndex",
  "isPersistent",
  "isLocked",
  "isSelectionBlocked",
  "isAlwaysOnTop",
  "preventSettingsChanges",
  "goToSlideIndex",
];

/**
 * Convert an element to a different type while preserving size and position
 * @param {Object} sourceElement - The element to convert
 * @param {string} targetType - The type to convert to
 * @returns {Object} - The new element with converted type
 */
export function convertElementType(sourceElement, targetType) {
  if (!sourceElement || !targetType) {
    throw new Error("Source element and target type are required");
  }

  if (sourceElement.type === targetType) {
    return sourceElement; // No conversion needed
  }

  const elementDefaults = getElementDefaults();

  if (!elementDefaults[targetType]) {
    throw new Error(`Unsupported target type: ${targetType}`);
  }

  // Create new element with default properties for the target type
  const newElement = {
    ...elementDefaults[targetType],
    id: store.elementIdCounter++,
    zIndex: getNewZIndex(),
    originSlideIndex: store.currentSlideIndex,
  };

  // Preserve size, position and other important properties
  // This includes all element settings like isLocked, isPersistent, preventSettingsChanges, etc.
  preservedProperties.forEach((prop) => {
    if (sourceElement.hasOwnProperty(prop)) {
      newElement[prop] = sourceElement[prop];
    }
  });

  // Special handling for HTML elements to combine content
  if (targetType === "html") {
    newElement.content = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>${newElement.css}</style>
      </head>
      <body>
        ${newElement.html}
        <script>${newElement.js}</script>
      </body>
      </html>
    `.trim();
  }

  return newElement;
}

/**
 * Replace an element in the current slide with a converted version
 * @param {Object} sourceElement - The element to replace
 * @param {string} targetType - The type to convert to
 */
export function replaceElementWithType(sourceElement, targetType) {
  if (store.currentSlideIndex < 0 || !store.slides[store.currentSlideIndex]) {
    throw new Error("No active slide");
  }

  pushCurrentSlideState();

  const slide = store.slides[store.currentSlideIndex];
  const elementIndex = slide.elements.findIndex(
    (el) => el.id === sourceElement.id,
  );

  if (elementIndex === -1) {
    throw new Error("Source element not found in current slide");
  }

  // Convert the element first
  const newElement = convertElementType(sourceElement, targetType);

  // Replace in the slide
  slide.elements[elementIndex] = newElement;

  // For dynamic content, don't remove the DOM element since it can be updated in place
  if (targetType === "dynamic-element") {
    // Force complete reload to ensure proper DOM cleanup
    loadSlide(slide, undefined, false, true);

    // Select the new element
    const newElementDom = document.getElementById("el-" + newElement.id);
    if (newElementDom) {
      selectElement(newElementDom, newElement);
    }

    // Handle dynamic content selection (doesn't require DOM removal)
    handleMediaSelection(newElement, targetType);
  } else if (requiresMediaSelection(targetType)) {
    // For image/video, we need to wait until after modal completion to remove DOM
    // Store the conversion info for later use
    window.pendingElementConversion = {
      oldElementId: sourceElement.id,
      newElement: newElement,
      targetType: targetType,
    };

    // Handle media selection (will complete the conversion after selection)
    handleMediaSelection(newElement, targetType);
  } else {
    // For other element types, we can safely remove DOM immediately
    const oldElementDom = document.getElementById("el-" + sourceElement.id);
    if (oldElementDom) {
      oldElementDom.remove();
    }

    // Force complete reload to ensure proper DOM cleanup
    loadSlide(slide, undefined, false, true);

    // Select the new element
    const newElementDom = document.getElementById("el-" + newElement.id);
    if (newElementDom) {
      selectElement(newElementDom, newElement);
    }
  }

  return newElement;
}

/**
 * Get available element types for conversion
 * @returns {Array} - Array of available element types with display names
 */
export function getAvailableElementTypes() {
  return [
    { type: "textbox", name: "Textbox", icon: "text_fields" },
    { type: "image", name: "Image", icon: "image" },
    { type: "video", name: "Video", icon: "videocam" },
    { type: "table", name: "Table", icon: "table" },
    { type: "list", name: "List", icon: "format_list_bulleted" },
    { type: "shape", name: "Shape", icon: "interests" },
    { type: "html", name: "HTML Element", icon: "code" },
    { type: "embed-website", name: "Embed Website", icon: "language" },
    { type: "dynamic-element", name: "Dynamic Content", icon: "dynamic_feed" },
    // Note: placeholder is not included here as it should only be available for creation, not conversion
  ];
}

/**
 * Get all element types including placeholder (used internally)
 */
export function getAllElementTypes() {
  return [
    { type: "textbox", name: "Textbox", icon: "text_fields" },
    { type: "image", name: "Image", icon: "image" },
    { type: "video", name: "Video", icon: "videocam" },
    { type: "table", name: "Table", icon: "table" },
    { type: "list", name: "List", icon: "format_list_bulleted" },
    { type: "shape", name: "Shape", icon: "interests" },
    { type: "html", name: "HTML Element", icon: "code" },
    { type: "embed-website", name: "Embed Website", icon: "language" },
    { type: "dynamic-element", name: "Dynamic Content", icon: "dynamic_feed" },
    { type: "placeholder", name: "Placeholder", icon: "crop_free" },
  ];
}

/**
 * Check if conversion between two types is supported
 * @param {string} sourceType - The source element type
 * @param {string} targetType - The target element type
 * @returns {boolean} - Whether conversion is supported
 */
export function isConversionSupported(sourceType, targetType) {
  const elementDefaults = getElementDefaults();
  return (
    elementDefaults.hasOwnProperty(sourceType) &&
    elementDefaults.hasOwnProperty(targetType) &&
    sourceType !== targetType
  );
}

/**
 * Check if an element type requires media content selection after conversion
 * @param {string} elementType - The element type to check
 * @returns {boolean} - Whether the element type requires media selection
 */
export function requiresMediaSelection(elementType) {
  return ["image", "video", "dynamic-element"].includes(elementType);
}

/**
 * Handle media selection for elements that need it after conversion
 * @param {Object} element - The converted element
 * @param {string} elementType - The element type
 */
function handleMediaSelection(element, elementType) {
  // Set up the global update context
  window.selectedElementForUpdate = {
    element: element,
    container: document.getElementById("el-" + element.id),
  };

  if (elementType === "image") {
    // Import callback and extensions from imageElement
    const imageExtensionsList = ["png", "jpeg", "jpg", "svg", "pdf", "webp"];

    // Create a callback that updates the element
    const updateImageCallback = (imageId) => {
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element &&
        window.selectedElementForUpdate.element.id === element.id
      ) {
        pushCurrentSlideState();
        window.selectedElementForUpdate.element.content = imageId;

        // Complete the conversion process
        if (window.pendingElementConversion) {
          const oldElementDom = document.getElementById(
            "el-" + window.pendingElementConversion.oldElementId,
          );
          if (oldElementDom) {
            oldElementDom.remove();
          }

          // Force complete reload to ensure proper DOM cleanup
          loadSlide(
            store.slides[store.currentSlideIndex],
            undefined,
            false,
            true,
          );

          // Select the new element
          const newElementDom = document.getElementById("el-" + element.id);
          if (newElementDom) {
            selectElement(newElementDom, element);
          }

          // Clear pending conversion
          window.pendingElementConversion = null;
        }

        // Update the image source
        const img =
          window.selectedElementForUpdate.container.querySelector("img");
        if (img) {
          fetch(
            `${BASE_URL}/api/documents/file-token/${imageId}/?branch_id=${selectedBranchID}&organisation_id=${parentOrgID}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          )
            .then((resp) => resp.json())
            .then((data) => {
              img.src = data.file_url;
            })
            .catch((err) => console.error("Failed to load image:", err));
        }

        window.selectedElementForUpdate = null;
      }
    };

    displayMediaModal(
      1,
      updateImageCallback,
      { file_types: imageExtensionsList },
      gettext("Image"),
    );
  } else if (elementType === "video") {
    // Import callback and extensions from videoElement
    const videoExtensionsList = ["mp4", "webm", "gif"];

    // Create a callback that updates the element
    const updateVideoCallback = (videoId) => {
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element &&
        window.selectedElementForUpdate.element.id === element.id
      ) {
        pushCurrentSlideState();
        window.selectedElementForUpdate.element.content = videoId;

        // Complete the conversion process (same as image)
        if (window.pendingElementConversion) {
          const oldElementDom = document.getElementById(
            "el-" + window.pendingElementConversion.oldElementId,
          );
          if (oldElementDom) {
            oldElementDom.remove();
          }

          // Force complete reload to ensure proper DOM cleanup and render new element
          loadSlide(
            store.slides[store.currentSlideIndex],
            undefined,
            false,
            true,
          );

          // Select the new element
          const newElementDom = document.getElementById("el-" + element.id);
          if (newElementDom) {
            selectElement(newElementDom, element);
          }

          // Clear pending conversion
          window.pendingElementConversion = null;
        }

        // Refresh the container reference to the newly rendered element
        const refreshedContainer = document.getElementById("el-" + element.id);
        if (refreshedContainer) {
          window.selectedElementForUpdate.container = refreshedContainer;
        }

        // Update the video source
        const video =
          window.selectedElementForUpdate.container &&
          window.selectedElementForUpdate.container.querySelector("video");
        if (video) {
          fetch(
            `${BASE_URL}/api/documents/file-token/${videoId}/?branch_id=${selectedBranchID}&id=${queryParams.displayWebsiteId}&organisation_id=${parentOrgID}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          )
            .then((resp) => resp.json())
            .then((data) => {
              if (data.file_url) {
                // Clear existing sources
                while (video.firstChild) {
                  video.removeChild(video.firstChild);
                }

                // Create new source element
                const sourceElement = document.createElement("source");
                sourceElement.src = data.file_url;
                sourceElement.type = data.file_type
                  ? `video/${String(data.file_type).toLowerCase()}`
                  : "video/mp4";

                video.appendChild(sourceElement);
                video.load();

                // Ensure video plays after loading
                video.addEventListener(
                  "loadeddata",
                  () => {
                    video
                      .play()
                      .catch((e) => console.warn("Video play failed:", e));
                  },
                  { once: true },
                );
              }
            })
            .catch((err) => console.error("Failed to load video:", err));
        }

        window.selectedElementForUpdate = null;
      }
    };

    displayMediaModal(
      1,
      updateVideoCallback,
      { file_types: videoExtensionsList },
      gettext("Video"),
    );
  } else if (elementType === "dynamic-element") {
    // Set up the global state like the change-dynamic-content-btn does
    import("../slideTypes/frontendSlideTypeModal.js")
      .then(({ showFrontendSlideTypeModal }) => {
        store.dynamicContentUpdateMode = true;
        window.selectedElementForUpdate = document.getElementById(
          "el-" + element.id,
        );

        // Make sure the store has the updated element data
        store.selectedElementData = element;

        // Pass the element data to showFrontendSlideTypeModal (like in iframeElement.js)
        if (element?.isDynamic && element?.slideTypeId) {
          showFrontendSlideTypeModal(element);
        } else {
          // For new dynamic elements, show the selection
          showFrontendSlideTypeModal();
        }
      })
      .catch((err) => {
        console.error("Failed to load dynamic content modal:", err);
        window.selectedElementForUpdate = null;
      });
  }
}

/**
 * Get helpful message for elements that need additional setup after conversion
 * @param {string} elementType - The element type
 * @returns {string|null} - A helpful message or null if no message needed
 */
export function getPostConversionMessage(elementType) {
  switch (elementType) {
    case "image":
      return 'Right-click the element and select "Change Image" to set the image content.';
    case "video":
      return 'Right-click the element and select "Change Video" to set the video content.';
    case "embed-website":
      return "Right-click the element to edit the website URL.";
    case "html":
      return "Right-click the element to edit the HTML, CSS, and JavaScript code.";
    case "dynamic-element":
      return "The dynamic content selection modal will open automatically to configure this element.";
    default:
      return null;
  }
}
