// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { showToast } from "../../../../utils/utils.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { showColorPalette } from "../utils/colorUtils.js";
import { gettext } from "../../../../utils/locales.js";

function showBoxShadowPopover(button, currentShadowData, callback) {
  let popover = document.createElement("div");
  popover.className = "box-shadow-popover popover";
  popover.style.position = "absolute";
  popover.style.zIndex = "10000";
  popover.style.padding = "15px";
  popover.style.minWidth = "280px";
  popover.style.background = "#fff";
  popover.style.border = "1px solid #ccc";
  popover.style.borderRadius = "4px";
  popover.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";

  // Title
  let title = document.createElement("h6");
  title.textContent = gettext("Box Shadow Settings");
  title.style.marginBottom = "15px";
  popover.appendChild(title);

  // Parse current shadow data or use defaults
  let horizontalOffset = currentShadowData?.horizontalOffset || 0;
  let verticalOffset = currentShadowData?.verticalOffset || 4;
  let blurRadius = currentShadowData?.blurRadius || 8;
  let spreadRadius = currentShadowData?.spreadRadius || 0;
  let shadowColor = currentShadowData?.color || "#000000";

  let selectedColor = shadowColor;

  // Helper to apply box shadow in real-time
  const applyBoxShadowRealtime = () => {
    if (!store.selectedElement) return;
    const shadowData = {
      horizontalOffset: parseInt(horizontalSlider.valueInput.value),
      verticalOffset: parseInt(verticalSlider.valueInput.value),
      blurRadius: parseInt(blurSlider.valueInput.value),
      spreadRadius: parseInt(spreadSlider.valueInput.value),
      color: selectedColor,
    };
    applyBoxShadow(store.selectedElement, shadowData);
    
    // Update the data store so changes are saved
    store.selectedElementData.boxShadowData = shadowData;
    store.selectedElementData.boxShadow = shadowData.color; // Keep for legacy compatibility
    
    // Update button indicator
    const boxShadowBtn = document.getElementById("selected-element-boxshadow");
    if (boxShadowBtn) {
      boxShadowBtn.style.border = `3px solid ${shadowData.color}`;
    }
  };

  // Helper to create slider with input
  const createSlider = (labelText, min, max, defaultValue, suffix = "px") => {
    let container = document.createElement("div");
    container.style.marginBottom = "15px";

    let label = document.createElement("label");
    label.textContent = labelText;
    label.style.display = "block";
    label.style.marginBottom = "5px";

    let wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "10px";

    let slider = document.createElement("input");
    slider.type = "range";
    slider.min = min.toString();
    slider.max = max.toString();
    slider.value = defaultValue.toString();
    slider.className = "form-range";
    slider.style.flex = "1";

    let valueInput = document.createElement("input");
    valueInput.type = "number";
    valueInput.min = min.toString();
    valueInput.max = max.toString();
    valueInput.value = defaultValue.toString();
    valueInput.className = "form-control";
    valueInput.style.width = "70px";

    // Sync slider and input with real-time updates
    slider.addEventListener("input", () => {
      valueInput.value = slider.value;
      applyBoxShadowRealtime();
    });
    valueInput.addEventListener("input", () => {
      let val = parseInt(valueInput.value);
      if (!isNaN(val)) {
        slider.value = Math.min(parseInt(max), Math.max(parseInt(min), val)).toString();
        valueInput.value = slider.value;
        applyBoxShadowRealtime();
      }
    });

    wrapper.appendChild(slider);
    wrapper.appendChild(valueInput);
    container.appendChild(label);
    container.appendChild(wrapper);

    return { container, slider, valueInput };
  };

  // Horizontal offset slider
  const horizontalSlider = createSlider(
    gettext("Horizontal Offset:"),
    -50,
    50,
    horizontalOffset,
  );
  popover.appendChild(horizontalSlider.container);

  // Vertical offset slider
  const verticalSlider = createSlider(
    gettext("Vertical Offset:"),
    -50,
    50,
    verticalOffset,
  );
  popover.appendChild(verticalSlider.container);

  // Blur radius slider
  const blurSlider = createSlider(
    gettext("Blur Radius:"),
    0,
    50,
    blurRadius,
  );
  popover.appendChild(blurSlider.container);

  // Spread radius slider
  const spreadSlider = createSlider(
    gettext("Spread Radius:"),
    -20,
    20,
    spreadRadius,
  );
  popover.appendChild(spreadSlider.container);

  // Color selector button
  let colorContainer = document.createElement("div");
  colorContainer.style.marginBottom = "15px";

  let colorLabel = document.createElement("label");
  colorLabel.textContent = gettext("Color: ");
  colorLabel.style.display = "block";
  colorLabel.style.marginBottom = "5px";

  let colorButton = document.createElement("button");
  colorButton.className = "btn btn-outline-secondary btn-sm";
  colorButton.style.width = "100%";
  colorButton.style.display = "flex";
  colorButton.style.alignItems = "center";
  colorButton.style.gap = "10px";

  let colorSwatch = document.createElement("span");
  colorSwatch.style.width = "20px";
  colorSwatch.style.height = "20px";
  colorSwatch.style.backgroundColor = selectedColor;
  colorSwatch.style.border = "1px solid #ccc";
  colorSwatch.style.display = "inline-block";

  let colorText = document.createElement("span");
  colorText.textContent = selectedColor;

  colorButton.appendChild(colorSwatch);
  colorButton.appendChild(colorText);

  colorButton.addEventListener("click", (e) => {
    e.stopPropagation();
    
    // Create a fake positioning element to the right of the popover
    const popoverRect = popover.getBoundingClientRect();
    const fakeButton = {
      getBoundingClientRect: () => ({
        top: popoverRect.top,
        bottom: popoverRect.bottom,
        left: popoverRect.right + 5, // Position to the right with 5px spacing
        right: popoverRect.right + 5,
        width: 0,
        height: popoverRect.height,
      })
    };
    
    showColorPalette(
      fakeButton,
      (color) => {
        if (color) {
          selectedColor = color;
          colorSwatch.style.backgroundColor = color;
          colorText.textContent = color;
          applyBoxShadowRealtime();
        }
      },
      { zIndex: "1070" },
    );
  });

  colorContainer.appendChild(colorLabel);
  colorContainer.appendChild(colorButton);
  popover.appendChild(colorContainer);

  // Buttons
  let buttonsDiv = document.createElement("div");
  buttonsDiv.style.display = "flex";
  buttonsDiv.style.gap = "10px";
  buttonsDiv.style.marginTop = "15px";

  let removeBtn = document.createElement("button");
  removeBtn.className = "btn btn-danger btn-sm";
  removeBtn.textContent = gettext("Remove");
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callback(null);
    if (document.body.contains(popover)) {
      document.body.removeChild(popover);
    }
  });
  buttonsDiv.appendChild(removeBtn);

  let applyBtn = document.createElement("button");
  applyBtn.className = "btn btn-primary btn-sm";
  applyBtn.textContent = gettext("Done");
  applyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Changes are applied in real-time, just save the data and close
    const shadowData = {
      horizontalOffset: parseInt(horizontalSlider.valueInput.value),
      verticalOffset: parseInt(verticalSlider.valueInput.value),
      blurRadius: parseInt(blurSlider.valueInput.value),
      spreadRadius: parseInt(spreadSlider.valueInput.value),
      color: selectedColor,
    };
    callback(shadowData);
    if (document.body.contains(popover)) {
      document.body.removeChild(popover);
    }
  });
  buttonsDiv.appendChild(applyBtn);

  popover.appendChild(buttonsDiv);

  // Position popover
  const rect = button.getBoundingClientRect();
  const popoverWidth = 300;
  let left = rect.left;
  if (rect.left + popoverWidth > window.innerWidth) {
    left = window.innerWidth - popoverWidth - 10;
  }
  popover.style.left = left + "px";
  popover.style.top = rect.bottom + window.scrollY + "px";

  document.body.appendChild(popover);

  const removePopover = (e) => {
    if (!popover.contains(e.target) && !e.target.closest(".custom-color-palette")) {
      if (document.body.contains(popover)) {
        document.body.removeChild(popover);
      }
      document.removeEventListener("click", removePopover);
    }
  };
  setTimeout(() => {
    document.addEventListener("click", removePopover);
  }, 0);
}

function applyBoxShadow(element, shadowData) {
  const shadow = `${shadowData.horizontalOffset}px ${shadowData.verticalOffset}px ${shadowData.blurRadius}px ${shadowData.spreadRadius}px ${shadowData.color}`;
  element.style.boxShadow = shadow;
}

export function initBoxShadow() {
  const boxShadowBtn = document.getElementById("selected-element-boxshadow");
  if (!boxShadowBtn) {
    console.error("Box shadow button not found in DOM");
    return;
  }

  boxShadowBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".popover").forEach((popover) => {
      popover.style.display = "none";
    });
    if (!store.selectedElement) {
      showToast(gettext("Please select an element first!"), "Info");
      return;
    }

    // Push state before making any changes (for undo/redo)
    pushCurrentSlideState();

    // Get current shadow data
    let currentShadowData = store.selectedElementData?.boxShadowData || null;

    showBoxShadowPopover(boxShadowBtn, currentShadowData, (shadowData) => {
      if (shadowData === null) {
        // Remove shadow
        store.selectedElement.style.boxShadow = "";
        store.selectedElementData.boxShadow = "";
        store.selectedElementData.boxShadowData = null;
        boxShadowBtn.style.border = "";
      } else {
        // Apply shadow
        applyBoxShadow(store.selectedElement, shadowData);
        store.selectedElementData.boxShadowData = shadowData;
        store.selectedElementData.boxShadow = shadowData.color; // Keep for legacy compatibility
        boxShadowBtn.style.border = `3px solid ${shadowData.color}`;
      }
    });
  });
}

// Helper function for the render engine to the styling
export function _renderBoxShadow(container, el) {
  if (el.boxShadowData) {
    applyBoxShadow(container, el.boxShadowData);
  } else if (el.boxShadow) {
    // Legacy support for old box shadow format
    container.style.boxShadow = `0px 4px 8px 0px ${el.boxShadow}`;
  }
}
