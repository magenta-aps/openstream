// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
// shapeElement.js
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { loadSlide } from "../core/renderSlide.js";
import { selectElement } from "../core/elementSelector.js";
import { getNewZIndex } from "../utils/domUtils.js";
import { showColorPalette } from "../utils/colorUtils.js";
import { GridUtils } from "../config/gridConfig.js";
import { gettext } from "../../../../utils/locales.js";
import * as bootstrap from "bootstrap";
/**
 * Define all available shapes in one place.
 * Each key corresponds to a shape name, and the value is a function that returns
 * the inner SVG element string when provided with the common attributes.
 */
const shapeMap = {
  circle: (attrs) => `<circle cx="50" cy="50" r="50" ${attrs}/>`,
  square: (attrs) => `<rect x="0" y="0" width="100" height="100" ${attrs}/>`,
  triangle: (attrs) => `<polygon points="50,5 95,95 5,95" ${attrs}/>`,
  "right-triangle": (attrs) => `<polygon points="5,5 95,50 5,95" ${attrs}/>`,
  "right-arrow": (attrs) =>
    `<polygon points="10,35 65,35 65,15 95,50 65,85 65,65 10,65" ${attrs}/>`,
  "left-arrow": (attrs) =>
    `<polygon points="90,35 35,35 35,15 5,50 35,85 35,65 90,65" ${attrs}/>`,
  "up-arrow": (attrs) =>
    `<polygon points="35,90 35,35 15,35 50,5 85,35 65,35 65,90" ${attrs}/>`,
  "down-arrow": (attrs) =>
    `<polygon points="35,10 35,65 15,65 50,95 85,65 65,65 65,10" ${attrs}/>`,
  diamond: (attrs) => `<polygon points="50,5 95,50 50,95 5,50" ${attrs}/>`,
  pentagon: (attrs) =>
    `<polygon points="50,5 95,38 78,95 22,95 5,38" ${attrs}/>`,
  hexagon: (attrs) =>
    `<polygon points="30,10 70,10 90,50 70,90 30,90 10,50" ${attrs}/>`,
  star: (attrs) =>
    `<polygon points="50,5 61,38 98,38 68,62 79,95 50,75 21,95 32,62 2,38 39,38" ${attrs}/>`,
  heart: (attrs) =>
    `<path d="M50,30 C35,10 10,15 10,40 C10,60 30,80 50,95 C70,80 90,60 90,40 C90,15 65,10 50,30 Z" ${attrs}/>`,
  plus: (attrs) =>
    `<path d="M40,5 L60,5 L60,40 L95,40 L95,60 L60,60 L60,95 L40,95 L40,60 L5,60 L5,40 L40,40 Z" ${attrs}/>`,

  // New shapes
  ellipse: (attrs) => `<ellipse cx="50" cy="50" rx="50" ry="30" ${attrs}/>`,
  parallelogram: (attrs) =>
    `<polygon points="20,0 100,0 80,100 0,100" ${attrs}/>`,
  trapezoid: (attrs) => `<polygon points="20,0 80,0 100,100 0,100" ${attrs}/>`,
  semicircle: (attrs) =>
    `<path d="M0,50 A50,50 0 0,1 100,50 L100,100 L0,100 Z" ${attrs}/>`,
  octagon: (attrs) =>
    `<polygon points="30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30" ${attrs}/>`,
  cloud: (attrs) =>
    `<path d="M20,60 Q10,40 20,20 Q35,5 50,20 Q65,5 80,20 Q90,40 80,60 Q95,75 80,90 Q65,95 50,90 Q35,95 20,90 Q10,75 20,60 Z" ${attrs}/>`,
  "half-triangle": (attrs) => `<polygon points="0,100 100,100 100,0" ${attrs}/>`,
};

/**
 * Returns the inline SVG string for the given shape.
 *
 * Parameters:
 *  - shape: a string key corresponding to a shape in the shapeMap.
 *  - fill: fill color.
 *  - stroke: stroke (outline) color.
 *  - fitMode: "scale" (default) maintains aspect ratio using preserveAspectRatio="xMidYMid meet";
 *             "stretch" forces the SVG to fill the container with preserveAspectRatio="none".
 *  - alignment: an object { h: "left" | "center" | "right", v: "top" | "middle" | "bottom" } used when fitMode is "scale".
 *  - strokeWidth: numeric stroke width.
 *
 * When the stroke becomes thicker, the shape is wrapped in a transform that translates and scales it so that the stroke does not overflow.
 */
function getShapeSVG(
  shape,
  fill,
  stroke,
  fitMode = "scale", // "scale" (default) or "stretch"
  alignment = { h: "center", v: "middle" },
  strokeWidth = 10,
  nonScalingStroke = true, // new parameter; default true for slide rendering
  useOutline = true, // new parameter to control outline visibility
) {
  // Calculate margin and scale to accommodate the stroke.
  const margin = strokeWidth / 2;
  const scale = (100 - strokeWidth) / 100;

  // Compute preserveAspectRatio based on fitMode and alignment.
  let preserveValue = "";
  if (fitMode === "stretch") {
    preserveValue = "none";
  } else {
    let xAlign;
    switch (alignment.h) {
      case "left":
        xAlign = "xMin";
        break;
      case "right":
        xAlign = "xMax";
        break;
      default:
        xAlign = "xMid";
    }
    let yAlign;
    switch (alignment.v) {
      case "top":
        yAlign = "YMin";
        break;
      case "bottom":
        yAlign = "YMax";
        break;
      default:
        yAlign = "YMid";
    }
    preserveValue = `${xAlign}${yAlign} meet`;
  }

  // Conditionally include the non-scaling stroke attribute.
  const vectorEffect = nonScalingStroke
    ? 'vector-effect="non-scaling-stroke"'
    : "";

  // Prepare common SVG attributes.
  const strokeAttributes = useOutline 
    ? `stroke="${stroke}" stroke-width="${strokeWidth}" ${vectorEffect}`
    : `stroke="none" stroke-width="0"`;
  const commonAttributes = `fill="${fill}" ${strokeAttributes}`;

  // Select the shape SVG from the shapeMap or fallback to square.
  const key = shape.toLowerCase();
  let shapeElement = "";
  if (shapeMap[key]) {
    shapeElement = shapeMap[key](commonAttributes);
  } else {
    console.warn(`Unknown shape: "${shape}". Defaulting to square.`);
    shapeElement = shapeMap["square"](commonAttributes);
  }

  // Wrap the shape in a transform to keep the stroke inside bounds, but only when not stretching.
  if (fitMode !== "stretch") {
    shapeElement = `<g transform="translate(${margin}, ${margin}) scale(${scale})">
      ${shapeElement}
  </g>`;
  }

  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"
                   style="width:100%; height:100%; display:block; overflow:hidden;" preserveAspectRatio="${preserveValue}">
                ${shapeElement}
              </svg>`;
}

/**
 * Adds a new shape element to the current slide.
 * Defaults to a right-arrow with preset properties.
 */
function addShapeElement() {
  if (store.currentSlideIndex < 0) return;
  pushCurrentSlideState();

  const defaultFill = "#000000";
  const defaultStroke = "#000000";

  const newShape = {
    id: store.elementIdCounter++,
    type: "shape",
    shape: "right-arrow", // default shape
    gridX: GridUtils.getCenteredPosition(100, 100).x,
    gridY: GridUtils.getCenteredPosition(100, 100).y,
    gridWidth: 100,
    gridHeight: 100,
    backgroundColor: "transparent",
    fill: defaultFill,
    stroke: defaultStroke,
    useOutline: true, // Toggle for outline visibility
    fitMode: "scale",
    strokeWidth: 10,
    alignment: { h: "center", v: "middle" },
    zIndex: getNewZIndex(),
    originSlideIndex: store.currentSlideIndex, // Track which slide this element was created on
    isLocked: false, // Initialize lock state
    isHidden: false, // Initialize visibility state
  };

  store.slides[store.currentSlideIndex].elements.push(newShape);
  loadSlide(store.slides[store.currentSlideIndex]);
  const newElDom = document.getElementById("el-" + newShape.id);
  selectElement(newElDom, newShape);
}

/**
 * Renders a shape element on the slide.
 */
export function _renderShape(el, container) {
  // `container` is the wrapper element from `_renderSlideElement`.
  // It already has id, classes, grid styles, and a resizer.
  // This function populates it with content specific to a shape element.
  container.style.width = "100%";
  container.style.height = "100%";

  const svgContainer = document.createElement("div");
  svgContainer.style.width = "100%";
  svgContainer.style.height = "100%";
  svgContainer.classList.add("shape-svg-container");
  svgContainer.innerHTML = getShapeSVG(
    el.shape,
    el.fill,
    el.stroke,
    el.fitMode,
    el.alignment,
    el.strokeWidth,
    true, // nonScalingStroke
    el.useOutline,
  );

  // Prepend the svg container. The resizer is already
  // added by the generic `_renderSlideElement` function.
  container.prepend(svgContainer);
}

/**
 * Initializes the shape element functionality, including setting up the toolbar and the popover.
 */
export function initShape() {
  // Hook up the "Add Shape" button.
  const shapeTopOption = document.querySelector('[data-type="shapes"]');
  if (shapeTopOption) {
    shapeTopOption.addEventListener("click", addShapeElement);
  }
  // Setup the shape toolbar by wiring the existing HBS structure.
  const shapeToolbar = document.querySelector(".shape-element-toolbar");
  if (shapeToolbar) {
    // ensure consistent styling
    shapeToolbar.classList.remove(
      "bg-light",
      "rounded",
      "shadow-sm",
      "justify-content-space-between",
    );
    shapeToolbar.classList.add("element-type-toolbar");

    // Find elements created by the HBS template
    const shapeTypePopoverBtn = shapeToolbar.querySelector("#shape-change-btn");
    const popoverContentHolder = shapeToolbar.querySelector(
      "[data-shape-popover-content]",
    );
    const fillBtn = shapeToolbar.querySelector("#shape-fill-btn");
    const outlineBtn = shapeToolbar.querySelector("#shape-outline-btn");
    const outlineToggleBtn = shapeToolbar.querySelector("#shape-outline-toggle-btn");
    // The radio partial renders an <input id="..."> and a <label for="...">.
    // Query the label by its for-attribute so we still find the associated label
    // after switching to the `base/form/radio` partial which doesn't add label IDs.
    const scaleLabel = shapeToolbar.querySelector(
      'label[for="shape-size-scale"]',
    );
    const stretchLabel = shapeToolbar.querySelector(
      'label[for="shape-size-stretch"]',
    );

    // Build popover content with shape buttons
    const shapeTypeContent = document.createElement("div");
    shapeTypeContent.classList.add("d-flex", "gap-2", "flex-wrap", "p-2");
    const shapeTypes = Object.keys(shapeMap);
    shapeTypes.forEach((shapeType) => {
      const btn = document.createElement("button");
      btn.classList.add(
        "btn",
        "btn-outline-secondary",
        "btn-sm",
        "shape-type-btn",
      );
      btn.style.width = "35px";
      btn.style.height = "35px";
      btn.style.padding = "5px";
      btn.style.overflow = "hidden";
      btn.style.boxSizing = "border-box";
      // Use a non-scaling-stroke preview for toolbar buttons so they look consistent
      btn.innerHTML = getShapeSVG(
        shapeType,
        "#000000",
        "#000000",
        "scale",
        { h: "center", v: "middle" },
        10,
        false,
      );
      btn.title = shapeType;
      // expose the shape type for delegated handling
      btn.dataset.shapeType = shapeType;
      shapeTypeContent.appendChild(btn);
    });

    if (shapeTypePopoverBtn) {
      // Ensure the popover content is ready
      new bootstrap.Popover(shapeTypePopoverBtn, {
        content: shapeTypeContent,
        html: true,
        placement: "bottom",
        trigger: "click",
        container: "body",
      });
    }

    // Delegated click handler for shape type buttons in the popover
    document.addEventListener("click", (e) => {
      const clicked = e.target.closest(".shape-type-btn");
      if (!clicked) return;
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element.type === "shape"
      ) {
        pushCurrentSlideState();
        const elementData = window.selectedElementForUpdate.element;
        const shapeType = clicked.dataset.shapeType;
        elementData.shape = shapeType;
        const elementDom = window.selectedElementForUpdate.container;
        const svgContainer = elementDom.querySelector(".shape-svg-container");
        if (svgContainer) {
          svgContainer.innerHTML = getShapeSVG(
            elementData.shape,
            elementData.fill,
            elementData.stroke,
            elementData.fitMode,
            elementData.alignment,
            elementData.strokeWidth,
            true, // nonScalingStroke
            elementData.useOutline,
          );
        }
        const popover = bootstrap.Popover.getInstance(shapeTypePopoverBtn);
        if (popover) {
          popover.hide();
        }
      }
    });

    // Fill color
    if (fillBtn) {
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element.fill
      ) {
        fillBtn.style.border = `3px solid ${window.selectedElementForUpdate.element.fill}`;
      }
      fillBtn.addEventListener("click", () => {
        if (
          window.selectedElementForUpdate &&
          window.selectedElementForUpdate.element.type === "shape"
        ) {
          showColorPalette(fillBtn, (chosenColor) => {
            if (chosenColor) {
              pushCurrentSlideState();
              const elementData = window.selectedElementForUpdate.element;
              elementData.fill = chosenColor;
              fillBtn.style.border = `3px solid ${chosenColor}`;
              const elementDom = window.selectedElementForUpdate.container;
              const svgContainer = elementDom.querySelector(
                ".shape-svg-container",
              );
              if (svgContainer) {
                svgContainer.innerHTML = getShapeSVG(
                  elementData.shape,
                  elementData.fill,
                  elementData.stroke,
                  elementData.fitMode,
                  elementData.alignment,
                  elementData.strokeWidth,
                  true, // nonScalingStroke
                  elementData.useOutline,
                );
              }
            }
          });
        }
      });
    }

    // Outline color
    if (outlineBtn) {
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element.stroke
      ) {
        outlineBtn.style.border = `3px solid ${window.selectedElementForUpdate.element.stroke}`;
      }
      outlineBtn.addEventListener("click", () => {
        if (
          window.selectedElementForUpdate &&
          window.selectedElementForUpdate.element.type === "shape"
        ) {
          showColorPalette(outlineBtn, (chosenColor) => {
            if (chosenColor) {
              pushCurrentSlideState();
              const elementData = window.selectedElementForUpdate.element;
              elementData.stroke = chosenColor;
              outlineBtn.style.border = `3px solid ${chosenColor}`;
              const elementDom = window.selectedElementForUpdate.container;
              const svgContainer = elementDom.querySelector(
                ".shape-svg-container",
              );
              if (svgContainer) {
                svgContainer.innerHTML = getShapeSVG(
                  elementData.shape,
                  elementData.fill,
                  elementData.stroke,
                  elementData.fitMode,
                  elementData.alignment,
                  elementData.strokeWidth,
                  true, // nonScalingStroke
                  elementData.useOutline,
                );
              }
            }
          });
        }
      });
    }

    // Outline toggle
    if (outlineToggleBtn) {
      // Initialize toggle state
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element.useOutline !== undefined
      ) {
        const isOutlineEnabled = window.selectedElementForUpdate.element.useOutline;
        outlineToggleBtn.classList.toggle("active", isOutlineEnabled);
        outlineToggleBtn.innerHTML = isOutlineEnabled ? 
          '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>';
      }
      
      outlineToggleBtn.addEventListener("click", () => {
        if (
          window.selectedElementForUpdate &&
          window.selectedElementForUpdate.element.type === "shape"
        ) {
          pushCurrentSlideState();
          const elementData = window.selectedElementForUpdate.element;
          elementData.useOutline = !elementData.useOutline;
          
          // Update button appearance
          outlineToggleBtn.classList.toggle("active", elementData.useOutline);
          outlineToggleBtn.innerHTML = elementData.useOutline ? 
            '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>';
          
          // Update the shape rendering
          const elementDom = window.selectedElementForUpdate.container;
          const svgContainer = elementDom.querySelector(".shape-svg-container");
          if (svgContainer) {
            svgContainer.innerHTML = getShapeSVG(
              elementData.shape,
              elementData.fill,
              elementData.stroke,
              elementData.fitMode,
              elementData.alignment,
              elementData.strokeWidth,
              true, // nonScalingStroke
              elementData.useOutline,
            );
          }
        }
      });
    }

    // Sizing radios
    if (scaleLabel && stretchLabel) {
      // Scope the radio inputs to the toolbar to avoid global collisions
      const scaleRadio =
        shapeToolbar.querySelector("#shape-size-scale") ||
        document.getElementById("shape-size-scale");
      const stretchRadio =
        shapeToolbar.querySelector("#shape-size-stretch") ||
        document.getElementById("shape-size-stretch");
      if (!scaleRadio || !stretchRadio) {
        // Radios not present; nothing to wire
        return;
      }

      // initialize state
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element.fitMode === "stretch"
      ) {
        stretchRadio.checked = true;
        stretchLabel.classList.add("active");
      } else {
        scaleRadio.checked = true;
        scaleLabel.classList.add("active");
      }

      scaleRadio.addEventListener("change", () => {
        if (
          scaleRadio.checked &&
          window.selectedElementForUpdate &&
          window.selectedElementForUpdate.element.type === "shape"
        ) {
          pushCurrentSlideState();
          const elementData = window.selectedElementForUpdate.element;
          elementData.fitMode = "scale";
          const elementDom = window.selectedElementForUpdate.container;
          const svgContainer = elementDom.querySelector(".shape-svg-container");
          if (svgContainer) {
            svgContainer.innerHTML = getShapeSVG(
              elementData.shape,
              elementData.fill,
              elementData.stroke,
              elementData.fitMode,
              elementData.alignment,
              elementData.strokeWidth,
              true, // nonScalingStroke
              elementData.useOutline,
            );
          }
          scaleLabel.classList.add("active");
          stretchLabel.classList.remove("active");
        }
      });

      stretchRadio.addEventListener("change", () => {
        if (
          stretchRadio.checked &&
          window.selectedElementForUpdate &&
          window.selectedElementForUpdate.element.type === "shape"
        ) {
          pushCurrentSlideState();
          const elementData = window.selectedElementForUpdate.element;
          elementData.fitMode = "stretch";
          const elementDom = window.selectedElementForUpdate.container;
          const svgContainer = elementDom.querySelector(".shape-svg-container");
          if (svgContainer) {
            svgContainer.innerHTML = getShapeSVG(
              elementData.shape,
              elementData.fill,
              elementData.stroke,
              elementData.fitMode,
              elementData.alignment,
              elementData.strokeWidth,
              true, // nonScalingStroke
              elementData.useOutline,
            );
          }
          stretchLabel.classList.add("active");
          scaleLabel.classList.remove("active");
        }
      });
    }
  }
}
