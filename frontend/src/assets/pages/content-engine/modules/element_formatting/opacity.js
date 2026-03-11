// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { showToast } from "../../../../utils/utils.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { hexToRGBA } from "../utils/colorUtils.js";
import { gettext } from "../../../../utils/locales.js";

function showOpacityPopover(button, callback) {
  const popover = document.createElement("div");
  popover.className = "opacity-popover popover";
  popover.style.position = "absolute";
  popover.style.zIndex = "10000";
  popover.style.padding = "10px";
  popover.style.background = "#fff";
  popover.style.border = "1px solid #ccc";
  popover.style.borderRadius = "4px";
  popover.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
  popover.style.width = "200px";

  const bgLabel = document.createElement("label");
  bgLabel.textContent = gettext("Background Opacity:");
  bgLabel.style.display = "block";
  bgLabel.style.fontSize = "12px";
  popover.appendChild(bgLabel);

  const bgSlider = document.createElement("input");
  bgSlider.type = "range";
  bgSlider.min = "0";
  bgSlider.max = "1";
  bgSlider.step = "0.01";
  bgSlider.value =
    window.selectedElementForUpdate.element.backgroundOpacity ?? "1";
  bgSlider.style.width = "100%";
  popover.appendChild(bgSlider);

  const elLabel = document.createElement("label");
  elLabel.textContent = gettext("Element Opacity:");
  elLabel.style.display = "block";
  elLabel.style.fontSize = "12px";
  elLabel.style.marginTop = "10px";
  popover.appendChild(elLabel);

  const elSlider = document.createElement("input");
  elSlider.type = "range";
  elSlider.min = "0";
  elSlider.max = "1";
  elSlider.step = "0.01";
  elSlider.value = window.selectedElementForUpdate.element.opacity ?? "1";
  elSlider.style.width = "100%";
  popover.appendChild(elSlider);

  const updateValue = () => {
    const bgOpacity = parseFloat(bgSlider.value);
    const elementOpacity = parseFloat(elSlider.value);
    callback(bgOpacity, elementOpacity);
  };
  bgSlider.addEventListener("input", updateValue);
  elSlider.addEventListener("input", updateValue);

  const rect = button.getBoundingClientRect();
  popover.style.top = rect.bottom + window.scrollY + "px";
  popover.style.left = rect.left + window.scrollX + "px";

  document.body.appendChild(popover);

  function removePopover(e) {
    if (!popover.contains(e.target)) {
      if (document.body.contains(popover)) {
        document.body.removeChild(popover);
      }
      document.removeEventListener("click", removePopover);
    }
  }

  setTimeout(() => {
    document.addEventListener("click", removePopover);
  }, 0);
}

export function initOpacity() {
  const opacityBtn = document.getElementById("opacityBtn");
  if (opacityBtn) {
    opacityBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".popover").forEach((popover) => {
        popover.style.display = "none";
      });
      if (!store.selectedElement) {
        showToast(gettext("Please select an element first!"), "Info");
        return;
      }
      pushCurrentSlideState();
      showOpacityPopover(opacityBtn, (bgOpacity, elementOpacity) => {
        store.selectedElement.style.setProperty(
          "opacity",
          elementOpacity,
          "important",
        );
        store.selectedElementData.opacity = elementOpacity;
        // If a background color is defined, update its alpha.
        if (store.selectedElementData.backgroundColor) {
          store.selectedElement.style.backgroundColor = hexToRGBA(
            store.selectedElementData.backgroundColor,
            bgOpacity,
          );
          store.selectedElementData.backgroundOpacity = bgOpacity;
        }
      });
    });
  }
}

// Helper function for the render engine to the styling
export function _renderOpacity(container, el) {
  container.style.setProperty("opacity", el.opacity, "important");
}
