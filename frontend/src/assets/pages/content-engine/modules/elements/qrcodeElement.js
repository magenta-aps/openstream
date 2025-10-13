// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { loadSlide } from "../core/renderSlide.js";
import { selectElement } from "../core/elementSelector.js";
import { showToast } from "../../../../utils/utils.js";
import { getNewZIndex } from "../utils/domUtils.js";
import { GridUtils } from "../config/gridConfig.js";
import { gettext } from "../../../../utils/locales.js";
import QRCode from "qrcode";
import { showColorPalette } from "../utils/colorUtils.js";

function addQRCodeElementToSlide(url = "") {
  if (store.currentSlideIndex === -1) {
    showToast(gettext("Please select a slide first!"), "Info");
    return;
  }

  pushCurrentSlideState();

  const newQRCode = {
    id: store.elementIdCounter++,
    type: "qrcode",
    content: url || "https://example.com", // Default URL
    gridX: GridUtils.getCenteredPosition(150, 150).x,
    gridY: GridUtils.getCenteredPosition(150, 150).y,
    gridWidth: 150,
    gridHeight: 150,
    backgroundColor: "transparent",
    zIndex: getNewZIndex(),
    qrOptions: {
      width: 300,
      margin: 0,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    },
    originSlideIndex: store.currentSlideIndex,
    isLocked: false,
    isHidden: false,
  };

  store.slides[store.currentSlideIndex].elements.push(newQRCode);
  loadSlide(store.slides[store.currentSlideIndex]);
  selectElement(document.getElementById("el-" + newQRCode.id), newQRCode);
}

export function initQRCodeElement() {
  initQRCodeEventListeners();
}

// Function to update toolbar inputs when a QR code element is selected
export function setupQRCodeToolbar(element) {
  const urlInput = document.getElementById("qrcode-url-input");
  const darkColorBtn = document.getElementById("qrcode-dark-btn");
  const lightColorBtn = document.getElementById("qrcode-light-btn");
  const sizeSelect = document.getElementById("qrcode-size-select");
  const marginSelect = document.getElementById("qrcode-margin-select");

  if (urlInput) {
    urlInput.value = element.content || "https://example.com";
  }

  // initialize organization color buttons with border displaying current color
  if (darkColorBtn) {
    const dark = element.qrOptions?.color?.dark || "#000000";
    darkColorBtn.style.border = `3px solid ${dark}`;
    darkColorBtn.dataset.color = dark;
  }

  if (lightColorBtn) {
    const light = element.qrOptions?.color?.light || "#FFFFFF";
    lightColorBtn.style.border = `3px solid ${light}`;
    lightColorBtn.dataset.color = light;
  }

  if (sizeSelect) {
    sizeSelect.value = element.qrOptions?.width || 300;
  }

  if (marginSelect) {
    // margin removed; always use 0
    if (marginSelect) marginSelect.value = 0;
  }
}

function initQRCodeEventListeners() {
  // Add QR Code button click handler
  document
    .querySelector('[data-type="qrcode"]')
    ?.addEventListener("click", () => {
      addQRCodeElementToSlide();
    });

  // URL input change handler
  const urlInput = document.getElementById("qrcode-url-input");
  if (urlInput) {
    urlInput.addEventListener("input", (e) => {
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element.type === "qrcode"
      ) {
        pushCurrentSlideState();
        const newUrl = e.target.value.trim();
        window.selectedElementForUpdate.element.content =
          newUrl || "https://example.com";

        // Update the QR code
        const container = window.selectedElementForUpdate.container;
        _renderQRCode(window.selectedElementForUpdate.element, container);
      }
    });
  }

  // QR Code color options
  const darkColorInput = document.getElementById("qrcode-dark-color");
  const lightColorInput = document.getElementById("qrcode-light-color");

  if (darkColorInput) {
    darkColorInput.addEventListener("change", (e) => {
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element.type === "qrcode"
      ) {
        pushCurrentSlideState();
        window.selectedElementForUpdate.element.qrOptions.color.dark =
          e.target.value;
        const container = window.selectedElementForUpdate.container;
        _renderQRCode(window.selectedElementForUpdate.element, container);
      }
    });
  }

  if (lightColorInput) {
    lightColorInput.addEventListener("change", (e) => {
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element.type === "qrcode"
      ) {
        pushCurrentSlideState();
        window.selectedElementForUpdate.element.qrOptions.color.light =
          e.target.value;
        const container = window.selectedElementForUpdate.container;
        _renderQRCode(window.selectedElementForUpdate.element, container);
      }
    });
  }

  // QR Code size options
  const sizeSelect = document.getElementById("qrcode-size-select");
  if (sizeSelect) {
    sizeSelect.addEventListener("change", (e) => {
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element.type === "qrcode"
      ) {
        pushCurrentSlideState();
        window.selectedElementForUpdate.element.qrOptions.width = parseInt(
          e.target.value,
        );
        const container = window.selectedElementForUpdate.container;
        _renderQRCode(window.selectedElementForUpdate.element, container);
      }
    });
  }

  // QR Code margin options
  const marginSelect = document.getElementById("qrcode-margin-select");
  if (marginSelect) {
    marginSelect.addEventListener("change", (e) => {
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element.type === "qrcode"
      ) {
        pushCurrentSlideState();
        window.selectedElementForUpdate.element.qrOptions.margin = parseInt(
          e.target.value,
        );
        const container = window.selectedElementForUpdate.container;
        _renderQRCode(window.selectedElementForUpdate.element, container);
      }
    });
  }

  // Wire up organization color buttons in the toolbar
  const darkBtn = document.getElementById("qrcode-dark-btn");
  const lightBtn = document.getElementById("qrcode-light-btn");

  if (darkBtn) {
    darkBtn.addEventListener("click", () => {
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element.type === "qrcode"
      ) {
        showColorPalette(darkBtn, (chosenColor) => {
          if (chosenColor) {
            pushCurrentSlideState();
            const elementData = window.selectedElementForUpdate.element;
            elementData.qrOptions.color.dark = chosenColor;
            darkBtn.style.border = `3px solid ${chosenColor}`;
            const container = window.selectedElementForUpdate.container;
            _renderQRCode(elementData, container);
          }
        });
      }
    });
  }

  if (lightBtn) {
    lightBtn.addEventListener("click", () => {
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element.type === "qrcode"
      ) {
        showColorPalette(lightBtn, (chosenColor) => {
          if (chosenColor) {
            pushCurrentSlideState();
            const elementData = window.selectedElementForUpdate.element;
            elementData.qrOptions.color.light = chosenColor;
            lightBtn.style.border = `3px solid ${chosenColor}`;
            const container = window.selectedElementForUpdate.container;
            _renderQRCode(elementData, container);
          }
        });
      }
    });
  }
}

// A simple debounce utility function
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

// Helper function used by the rendering engine in renderSlide.js
export function _renderQRCode(el, container) {
  // --- Clean up previous observers to prevent memory leaks ---
  if (container._qrResizeObserver) {
    container._qrResizeObserver.disconnect();
  }

  // Remove any existing QR code canvas or error message but keep the
  // shared resize handle (which has class "resize-handle"). Other element
  // renderers create a sibling `.resize-handle` and the core rendering
  // logic expects it to remain as a sibling, so only remove children that
  // are not the resize handle.
  Array.from(container.childNodes).forEach((child) => {
    if (!child.classList || !child.classList.contains("resize-handle")) {
      child.remove();
    }
  });

  // Create a canvas element
  const canvas = document.createElement("canvas");
  // Style the canvas to be responsive within its container
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.objectFit = "contain";
  canvas.style.display = "block";

  // Insert canvas before any resize handle element if present. Note that
  // the resize handle is moved to be a sibling by renderSlide.js, so we
  // still check for it inside the container for backward compatibility.
  const firstResizer =
    container.querySelector(".resize-handle") ||
    container.querySelector(".resizer");
  if (firstResizer) {
    container.insertBefore(canvas, firstResizer);
  } else {
    container.appendChild(canvas);
  }

  // --- Main rendering logic ---
  // Render using the smaller of container width/height so the QR always fits
  const render = (containerWidth, containerHeight) => {
    // If container is not visible, sizes can be 0. Avoid rendering.
    if (!containerWidth || !containerHeight) return;

    // Choose the limiting dimension so the QR fits inside the box
    const sizeCss = Math.min(containerWidth, containerHeight);

    // Use the limiting container dimension so the QR always fills the box
    const finalCssSize = sizeCss;

    // Handle high-DPI displays by sizing the canvas backing store
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(finalCssSize * dpr);
    canvas.height = Math.round(finalCssSize * dpr);

    // Ensure CSS size matches container area
    canvas.style.width = finalCssSize + "px";
    canvas.style.height = finalCssSize + "px";

    const qrOptions = {
      width: Math.round(finalCssSize * dpr),
      margin: el.qrOptions?.margin ?? 2,
      color: {
        dark: el.qrOptions?.color?.dark ?? "#000000",
        light: el.qrOptions?.color?.light ?? "#FFFFFF",
      },
    };

    QRCode.toCanvas(
      canvas,
      el.content || "https://example.com",
      qrOptions,
      function (error) {
        if (error) {
          console.error("QR code generation error:", error);
          canvas.style.display = "none"; // Hide the broken canvas
        } else {
          // Reset transform so the canvas draws crisply on HiDPI
          const ctx = canvas.getContext("2d");
          if (ctx && dpr !== 1) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          }
          canvas.style.display = "block";
        }
      },
    );
  };

  // --- Initial Render ---
  // Get the initial size of the container to render the first QR code
  const initialWidth = container.clientWidth;
  const initialHeight = container.clientHeight;
  render(initialWidth, initialHeight);

  // --- Debounced Re-render function ---
  // We debounce this to avoid re-rendering on every single pixel change during resize
  const debouncedRender = debounce((newWidth, newHeight) => {
    render(newWidth, newHeight);
  }, 250); // 250ms is a good balance between responsiveness and performance

  // --- Setup ResizeObserver ---
  const observer = new ResizeObserver((entries) => {
    for (let entry of entries) {
      // Prefer contentBoxSize when available (newer browsers)
      let newWidth, newHeight;
      if (entry.contentBoxSize) {
        // contentBoxSize can be an array or single object
        const box = Array.isArray(entry.contentBoxSize)
          ? entry.contentBoxSize[0]
          : entry.contentBoxSize;
        newWidth = box.inlineSize;
        newHeight = box.blockSize;
      } else if (entry.contentRect) {
        // Fallback for browsers that provide contentRect
        newWidth = entry.contentRect.width;
        newHeight = entry.contentRect.height;
      } else {
        // Last-resort: use container client sizes
        newWidth = container.clientWidth;
        newHeight = container.clientHeight;
      }

      debouncedRender(newWidth, newHeight);
    }
  });

  observer.observe(container, { box: "content-box" });

  // Store the observer on the element for future cleanup
  container._qrResizeObserver = observer;
}
