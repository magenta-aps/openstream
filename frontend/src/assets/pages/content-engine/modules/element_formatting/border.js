// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { showToast } from "../../../../utils/utils.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { showColorPalette } from "../utils/colorUtils.js";
import { gettext } from "../../../../utils/locales.js";

function showBorderPopover(button, currentBorderData, callback) {
  let popover = document.createElement("div");
  popover.className = "border-popover popover";
  popover.style.padding = "15px";
  popover.style.minWidth = "280px";

  // Title
  let title = document.createElement("h6");
  title.textContent = gettext("Border Settings");
  title.style.marginBottom = "15px";
  popover.appendChild(title);

  // Parse current border data
  let currentThickness = currentBorderData?.thickness || 1;
  let currentColor = currentBorderData?.color || "#000000";
  let currentSides = currentBorderData?.sides || {
    top: true,
    right: true,
    bottom: true,
    left: true,
  };

  let selectedColor = currentColor;

  // Thickness slider
  let thicknessContainer = document.createElement("div");
  thicknessContainer.style.marginBottom = "15px";

  let thicknessLabel = document.createElement("label");
  thicknessLabel.textContent = gettext("Thickness: ");
  thicknessLabel.style.display = "block";
  thicknessLabel.style.marginBottom = "5px";

  let thicknessWrapper = document.createElement("div");
  thicknessWrapper.style.display = "flex";
  thicknessWrapper.style.alignItems = "center";
  thicknessWrapper.style.gap = "10px";

  let thicknessSlider = document.createElement("input");
  thicknessSlider.type = "range";
  thicknessSlider.min = "1";
  thicknessSlider.max = "60";
  thicknessSlider.value = currentThickness;
  thicknessSlider.className = "form-range";
  thicknessSlider.style.flex = "1";

  let thicknessValue = document.createElement("input");
  thicknessValue.type = "number";
  thicknessValue.min = "1";
  thicknessValue.max = "60";
  thicknessValue.value = currentThickness;
  thicknessValue.className = "form-control";
  thicknessValue.style.width = "70px";

  thicknessWrapper.appendChild(thicknessSlider);
  thicknessWrapper.appendChild(thicknessValue);
  thicknessContainer.appendChild(thicknessLabel);
  thicknessContainer.appendChild(thicknessWrapper);
  popover.appendChild(thicknessContainer);

  // Create checkboxElements object early so it can be referenced
  const checkboxElements = {};

  // Helper to apply border in real-time (defined early so it can be used by all event listeners)
  const applyBorderRealtime = () => {
    if (!store.selectedElement) return;
    let thickness = parseInt(thicknessValue.value, 10);
    if (isNaN(thickness) || thickness <= 0) return;

    // Check if checkboxes are initialized yet
    if (!checkboxElements.top) return;

    const sides = {
      top: checkboxElements.top.checked,
      right: checkboxElements.right.checked,
      bottom: checkboxElements.bottom.checked,
      left: checkboxElements.left.checked,
    };

    applyBorderToElement(
      store.selectedElement,
      thickness,
      selectedColor,
      sides,
    );

    // Update the data store so changes are saved
    store.selectedElementData.borderData = {
      thickness: thickness,
      color: selectedColor,
      sides: sides,
    };
    store.selectedElementData.border = true;

    // Update button indicator
    const selectedElementBorder = document.getElementById(
      "selected-element-border",
    );
    if (selectedElementBorder) {
      selectedElementBorder.style.border = `3px solid ${selectedColor}`;
    }
  };

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
      }),
    };

    showColorPalette(
      fakeButton,
      (color) => {
        if (color) {
          selectedColor = color;
          colorSwatch.style.backgroundColor = color;
          colorText.textContent = color;
          applyBorderRealtime();
        }
      },
      { zIndex: "1070" },
    );
  });

  colorContainer.appendChild(colorLabel);
  colorContainer.appendChild(colorButton);
  popover.appendChild(colorContainer);

  // Side selection
  let sideTitle = document.createElement("label");
  sideTitle.textContent = gettext("Apply to sides:");
  sideTitle.style.display = "block";
  sideTitle.style.marginBottom = "10px";
  sideTitle.style.fontWeight = "bold";
  popover.appendChild(sideTitle);

  let sideOptions = document.createElement("div");
  sideOptions.style.marginBottom = "15px";

  // Individual side checkboxes (all shown, all checked by default)
  const sideCheckboxes = [
    { label: gettext("Top"), checked: currentSides.top, key: "top" },
    { label: gettext("Right"), checked: currentSides.right, key: "right" },
    { label: gettext("Bottom"), checked: currentSides.bottom, key: "bottom" },
    { label: gettext("Left"), checked: currentSides.left, key: "left" },
  ];

  sideCheckboxes.forEach((side) => {
    let label = document.createElement("label");
    label.style.display = "block";
    label.style.marginBottom = "5px";
    let checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = side.checked;
    checkbox.style.marginRight = "5px";
    checkboxElements[side.key] = checkbox;

    // Add real-time update listener
    checkbox.addEventListener("change", applyBorderRealtime);

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(gettext(side.label)));
    sideOptions.appendChild(label);
  });

  popover.appendChild(sideOptions);

  // Now add event listeners for thickness sliders (after checkboxElements are defined)
  thicknessSlider.addEventListener("input", () => {
    thicknessValue.value = thicknessSlider.value;
    applyBorderRealtime();
  });
  thicknessValue.addEventListener("input", () => {
    let val = parseInt(thicknessValue.value);
    if (!isNaN(val)) {
      thicknessSlider.value = Math.min(60, Math.max(1, val));
      applyBorderRealtime();
    }
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
    let thickness = parseInt(thicknessValue.value, 10);
    if (isNaN(thickness) || thickness <= 0) {
      callback(null);
    } else {
      const sides = {
        top: checkboxElements.top.checked,
        right: checkboxElements.right.checked,
        bottom: checkboxElements.bottom.checked,
        left: checkboxElements.left.checked,
      };
      callback({
        thickness: thickness,
        color: selectedColor,
        sides: sides,
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
  const popoverWidth = 300;
  let left = rect.left;
  if (rect.left + popoverWidth > window.innerWidth) {
    left = window.innerWidth - popoverWidth - 10;
  }
  popover.style.left = left + "px";
  popover.style.top = rect.bottom + window.scrollY + "px";

  document.body.appendChild(popover);

  const removePopover = (e) => {
    if (
      !popover.contains(e.target) &&
      !e.target.closest(".custom-color-palette")
    ) {
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

function applyBorderToElement(element, thickness, color, sides) {
  const borderValue = `${thickness}px solid ${color}`;

  // Clear any existing shorthand border
  element.style.border = "";

  // Apply to individual sides
  element.style.borderTop = sides.top ? borderValue : "";
  element.style.borderRight = sides.right ? borderValue : "";
  element.style.borderBottom = sides.bottom ? borderValue : "";
  element.style.borderLeft = sides.left ? borderValue : "";
}

export function initSelectedElementBorder() {
  const selectedElementBorder = document.getElementById(
    "selected-element-border",
  );
  if (selectedElementBorder) {
    selectedElementBorder.addEventListener("click", () => {
      document.querySelectorAll(".popover").forEach((popover) => {
        popover.style.display = "none";
      });
      if (!store.selectedElement) {
        showToast(gettext("Please select an element first!"), "Info");
        return;
      }

      // Push state before making any changes (for undo/redo)
      pushCurrentSlideState();

      // Get current border data
      let currentBorderData = null;
      if (store.selectedElementData?.borderData) {
        currentBorderData = store.selectedElementData.borderData;
        // Migrate old data structure if it has 'all' property
        if (currentBorderData.sides && "all" in currentBorderData.sides) {
          if (currentBorderData.sides.all) {
            currentBorderData.sides = {
              top: true,
              right: true,
              bottom: true,
              left: true,
            };
          }
        }
      } else {
        // Try to parse from existing style
        let currentBorder = store.selectedElement.style.border;
        if (currentBorder) {
          let parts = currentBorder.split(" ");
          if (parts.length >= 3) {
            currentBorderData = {
              thickness: parseInt(parts[0]) || 1,
              color: parts[2],
              sides: { top: true, right: true, bottom: true, left: true },
            };
          }
        }
      }

      showBorderPopover(
        selectedElementBorder,
        currentBorderData,
        (borderData) => {
          if (borderData === null) {
            // Remove border
            store.selectedElement.style.border = "";
            store.selectedElement.style.borderTop = "";
            store.selectedElement.style.borderRight = "";
            store.selectedElement.style.borderBottom = "";
            store.selectedElement.style.borderLeft = "";
            store.selectedElementData.border = false;
            store.selectedElementData.borderData = null;
            if (selectedElementBorder) {
              selectedElementBorder.style.border = "";
            }
          } else {
            // Apply border
            applyBorderToElement(
              store.selectedElement,
              borderData.thickness,
              borderData.color,
              borderData.sides,
            );
            store.selectedElementData.borderData = borderData;
            store.selectedElementData.border = true;
            if (selectedElementBorder) {
              selectedElementBorder.style.border = `3px solid ${borderData.color}`;
            }
          }
        },
      );
    });
  }
}

// Helper function for the render engine to the styling
export function _renderBorder(container, el) {
  if (el.borderData) {
    applyBorderToElement(
      container,
      el.borderData.thickness,
      el.borderData.color,
      el.borderData.sides,
    );
  } else if (el.border && typeof el.border === "string") {
    // Legacy support for old border format
    container.style.border = el.border;
  }
}
