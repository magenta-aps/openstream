// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { showToast } from "../../../../utils/utils.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { gettext } from "../../../../utils/locales.js";

const selectedElementPadding = document.getElementById(
  "selected-element-padding",
);

export function initSelectedElementPadding() {
  selectedElementPadding.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".popover").forEach((popover) => {
      popover.style.display = "none";
    });
    if (!store.selectedElement) {
      showToast(gettext("Please select an element first!"), "Info");
      return;
    }

    let existingPopover = document.getElementById("paddingPopover");
    if (existingPopover) {
      existingPopover.remove();
    }

    const popover = document.createElement("div");
    popover.className = "popover";
    popover.id = "paddingPopover";
    popover.style.position = "absolute";
    popover.style.top = e.clientY + "px";
    popover.style.left = e.clientX + "px";
    popover.style.backgroundColor = "#fff";
    popover.style.border = "1px solid #ccc";
    popover.style.padding = "10px";
    popover.style.boxShadow = "0px 2px 5px rgba(0,0,0,0.3)";
    popover.style.zIndex = "1000";

    const label = document.createElement("div");
    label.textContent = gettext("Set Padding (%)");
    label.style.marginBottom = "5px";
    popover.appendChild(label);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.style.width = "100%";

    if (window.selectedElementForUpdate.element.padding) {
      slider.value =
        parseFloat(window.selectedElementForUpdate.element.padding, 10) * 5;
    } else {
      slider.value = 0;
    }

    popover.appendChild(slider);

    const output = document.createElement("div");
    output.textContent = slider.value / 5 + "%";
    output.style.textAlign = "center";
    output.style.marginTop = "5px";
    popover.appendChild(output);

    document.body.appendChild(popover);

    slider.addEventListener("input", () => {
      const effectivePadding = slider.value / 5;
      output.textContent = effectivePadding + "%";
      store.selectedElement.style.padding = effectivePadding + "%";
      store.selectedElementData.padding = effectivePadding + "%";
    });

    slider.addEventListener("pointerdown", () => {
      pushCurrentSlideState();
    });

    setTimeout(() => {
      function handleClickOutside(ev) {
        if (
          !popover.contains(ev.target) &&
          ev.target !== selectedElementPadding
        ) {
          popover.remove();
          document.removeEventListener("click", handleClickOutside);
        }
      }

      document.addEventListener("click", handleClickOutside);
    }, 0);
  });
}

// Helper function for the render engine to the styling
export function _renderPadding(container, el) {
  container.style.padding = el.padding;
}
