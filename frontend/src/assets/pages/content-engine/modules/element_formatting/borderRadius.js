// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { showToast } from "../../../../utils/utils.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { gettext } from "../../../../utils/locales.js";

function showBorderRadiusPopover(button, currentRadiusData, callback) {
  let popover = document.createElement("div");
  popover.className = "border-radius-popover popover";
  popover.style.position = "absolute";
  popover.style.zIndex = "10000";
  popover.style.padding = "15px";
  popover.style.minWidth = "250px";
  popover.style.background = "#fff";
  popover.style.border = "1px solid #ccc";
  popover.style.borderRadius = "4px";
  popover.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";

  // Title
  let title = document.createElement("h6");
  title.textContent = gettext("Border Radius");
  title.style.marginBottom = "15px";
  popover.appendChild(title);

  // Parse current border radius data
  let currentRadiusValue = 0; // default
  let allCorners = true;
  let topLeft = false;
  let topRight = false;
  let bottomRight = false;
  let bottomLeft = false;

  if (currentRadiusData) {
    currentRadiusValue = currentRadiusData.radius || 0;
    if (currentRadiusData.corners) {
      const corners = currentRadiusData.corners;
      allCorners = corners.all;
      topLeft = corners.topLeft;
      topRight = corners.topRight;
      bottomRight = corners.bottomRight;
      bottomLeft = corners.bottomLeft;
    }
  }

  // Radius slider
  let sliderContainer = document.createElement("div");
  sliderContainer.style.marginBottom = "15px";

  let sliderLabel = document.createElement("label");
  sliderLabel.textContent = gettext("Radius: ");
  sliderLabel.style.display = "block";
  sliderLabel.style.marginBottom = "5px";

  let sliderWrapper = document.createElement("div");
  sliderWrapper.style.display = "flex";
  sliderWrapper.style.alignItems = "center";
  sliderWrapper.style.gap = "10px";

  let radiusSlider = document.createElement("input");
  radiusSlider.type = "range";
  radiusSlider.min = "0";
  radiusSlider.max = "100";
  radiusSlider.value = currentRadiusValue;
  radiusSlider.className = "form-range";
  radiusSlider.style.flex = "1";

  let radiusValue = document.createElement("input");
  radiusValue.type = "number";
  radiusValue.min = "0";
  radiusValue.max = "100";
  radiusValue.value = currentRadiusValue;
  radiusValue.className = "form-control";
  radiusValue.style.width = "70px";

  // Create checkboxElements object early
  const checkboxElements = {};
  
  // Helper to apply border radius in real-time
  const applyBorderRadiusRealtime = () => {
    if (!store.selectedElement) return;
    let radius = parseInt(radiusValue.value, 10);
    if (isNaN(radius) || radius < 0) return;
    
    // Check if checkboxes are initialized yet
    if (!checkboxElements.topLeft) return;
    
    const corners = {
      all: allCornersCheckbox.checked,
      topLeft: allCornersCheckbox.checked || checkboxElements.topLeft.checked,
      topRight: allCornersCheckbox.checked || checkboxElements.topRight.checked,
      bottomRight: allCornersCheckbox.checked || checkboxElements.bottomRight.checked,
      bottomLeft: allCornersCheckbox.checked || checkboxElements.bottomLeft.checked,
    };
    
    applyBorderRadiusToElement(store.selectedElement, radius, corners);
    
    // Update the data store so changes are saved
    store.selectedElementData.borderRadius = radius;
    store.selectedElementData.borderRadiusCorners = corners;
    
    // Update button indicator
    const borderRadiusBtn = document.getElementById("selected-element-border-radius");
    if (borderRadiusBtn && radius > 0) {
      borderRadiusBtn.style.border = "3px solid #007bff";
    }
  };

  // Sync slider and input
  radiusSlider.addEventListener("input", () => {
    radiusValue.value = radiusSlider.value;
    applyBorderRadiusRealtime();
  });
  radiusValue.addEventListener("input", () => {
    let val = parseInt(radiusValue.value);
    if (!isNaN(val)) {
      radiusSlider.value = Math.min(100, Math.max(0, val));
      applyBorderRadiusRealtime();
    }
  });

  sliderWrapper.appendChild(radiusSlider);
  sliderWrapper.appendChild(radiusValue);
  sliderContainer.appendChild(sliderLabel);
  sliderContainer.appendChild(sliderWrapper);
  popover.appendChild(sliderContainer);

  // Corner selection
  let cornerTitle = document.createElement("label");
  cornerTitle.textContent = gettext("Apply to corners:");
  cornerTitle.style.display = "block";
  cornerTitle.style.marginBottom = "10px";
  cornerTitle.style.fontWeight = "bold";
  popover.appendChild(cornerTitle);

  let cornerOptions = document.createElement("div");
  cornerOptions.style.marginBottom = "15px";

  // All corners checkbox
  let allCornersLabel = document.createElement("label");
  allCornersLabel.style.display = "block";
  allCornersLabel.style.marginBottom = "5px";
  let allCornersCheckbox = document.createElement("input");
  allCornersCheckbox.type = "checkbox";
  allCornersCheckbox.checked = allCorners;
  allCornersCheckbox.style.marginRight = "5px";
  allCornersLabel.appendChild(allCornersCheckbox);
  allCornersLabel.appendChild(document.createTextNode(gettext("All corners")));
  cornerOptions.appendChild(allCornersLabel);

  // Individual corner checkboxes
  let individualCornersDiv = document.createElement("div");
  individualCornersDiv.style.marginLeft = "20px";
  individualCornersDiv.style.display = allCorners ? "none" : "block";

  const cornerCheckboxes = [
    { label: "Top Left", checked: topLeft, key: "topLeft" },
    { label: "Top Right", checked: topRight, key: "topRight" },
    { label: "Bottom Right", checked: bottomRight, key: "bottomRight" },
    { label: "Bottom Left", checked: bottomLeft, key: "bottomLeft" },
  ];

  cornerCheckboxes.forEach((corner) => {
    let label = document.createElement("label");
    label.style.display = "block";
    label.style.marginBottom = "5px";
    let checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = corner.checked;
    checkbox.style.marginRight = "5px";
    checkbox.disabled = allCornersCheckbox.checked;
    checkboxElements[corner.key] = checkbox;
    
    // Add real-time update listener
    checkbox.addEventListener("change", applyBorderRadiusRealtime);
    
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(gettext(corner.label)));
    individualCornersDiv.appendChild(label);
  });

  cornerOptions.appendChild(individualCornersDiv);
  popover.appendChild(cornerOptions);

  // Toggle individual corners when "all corners" is checked
  allCornersCheckbox.addEventListener("change", () => {
    const isAllChecked = allCornersCheckbox.checked;
    individualCornersDiv.style.display = isAllChecked ? "none" : "block";
    Object.values(checkboxElements).forEach((cb) => {
      cb.disabled = isAllChecked;
    });
    applyBorderRadiusRealtime();
  });

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
    let radius = parseInt(radiusValue.value, 10);
    if (isNaN(radius) || radius <= 0) {
      callback(null);
    } else {
      const corners = {
        all: allCornersCheckbox.checked,
        topLeft: allCornersCheckbox.checked || checkboxElements.topLeft.checked,
        topRight:
          allCornersCheckbox.checked || checkboxElements.topRight.checked,
        bottomRight:
          allCornersCheckbox.checked || checkboxElements.bottomRight.checked,
        bottomLeft:
          allCornersCheckbox.checked || checkboxElements.bottomLeft.checked,
      };
      callback({
        radius: radius,
        corners: corners,
      });
    }
    if (document.body.contains(popover)) {
      document.body.removeChild(popover);
    }
  });
  buttonsDiv.appendChild(applyBtn);

  popover.appendChild(buttonsDiv);

  // Position popover
  const rect = button.getBoundingClientRect();
  const popoverWidth = 280;
  let left = rect.left;
  if (rect.left + popoverWidth > window.innerWidth) {
    left = window.innerWidth - popoverWidth - 10;
  }
  popover.style.left = left + "px";
  popover.style.top = rect.bottom + window.scrollY + "px";

  document.body.appendChild(popover);

  const removePopover = (e) => {
    if (!popover.contains(e.target)) {
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

function applyBorderRadiusToElement(element, radius, corners) {
  if (corners.all) {
    element.style.borderRadius = `${radius}px`;
  } else {
    element.style.borderTopLeftRadius = corners.topLeft ? `${radius}px` : "0";
    element.style.borderTopRightRadius = corners.topRight ? `${radius}px` : "0";
    element.style.borderBottomRightRadius = corners.bottomRight
      ? `${radius}px`
      : "0";
    element.style.borderBottomLeftRadius = corners.bottomLeft
      ? `${radius}px`
      : "0";
  }
}

export function initBorderRadius() {
  const borderRadiusBtn = document.getElementById("selected-element-border-radius");
  if (!borderRadiusBtn) {
    console.error("Border radius button not found in DOM");
    return;
  }
  
  borderRadiusBtn.addEventListener("click", (e) => {
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

      // Get current border radius data from the store
      let currentRadiusData = null;
      if (store.selectedElementData?.borderRadius && store.selectedElementData?.borderRadiusCorners) {
        currentRadiusData = {
          radius: store.selectedElementData.borderRadius,
          corners: store.selectedElementData.borderRadiusCorners,
        };
      }

      showBorderRadiusPopover(
        borderRadiusBtn,
        currentRadiusData,
        (radiusData) => {
          if (radiusData === null) {
            // Remove border radius
            store.selectedElement.style.borderRadius = "";
            store.selectedElement.style.borderTopLeftRadius = "";
            store.selectedElement.style.borderTopRightRadius = "";
            store.selectedElement.style.borderBottomRightRadius = "";
            store.selectedElement.style.borderBottomLeftRadius = "";
            store.selectedElementData.borderRadius = null;
            store.selectedElementData.borderRadiusCorners = null;
            if (borderRadiusBtn) {
              borderRadiusBtn.style.border = "";
            }
          } else {
            // Apply border radius
            applyBorderRadiusToElement(
              store.selectedElement,
              radiusData.radius,
              radiusData.corners,
            );
            store.selectedElementData.borderRadius = radiusData.radius;
            store.selectedElementData.borderRadiusCorners = radiusData.corners;
            if (borderRadiusBtn) {
              borderRadiusBtn.style.border = "3px solid #007bff";
            }
          }
        },
      );
  });
}

// Helper function for the render engine
export function _renderBorderRadius(container, el) {
  if (el.borderRadius && el.borderRadiusCorners) {
    applyBorderRadiusToElement(container, el.borderRadius, el.borderRadiusCorners);
  } else if (el.rounded) {
    // Legacy support for old "rounded" property (Bootstrap rounded class)
    container.classList.add("rounded");
  }
}
