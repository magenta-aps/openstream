// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { showToast } from "../../../../utils/utils.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { gettext } from "../../../../utils/locales.js";

const selectedElementScale = document.getElementById("selected-element-scale");

export function initSelectedElementScale() {
  selectedElementScale.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".popover").forEach((popover) => {
      popover.style.display = "none";
    });

    if (!store.selectedElement) {
      showToast(gettext("Please select an element first!"), "Info");
      return;
    }

    const popover = document.createElement("div");
    popover.className = "popover";
    popover.id = "scalePopover";
    popover.style.position = "absolute";
    popover.style.top = e.clientY + "px";
    popover.style.left = e.clientX + "px";
    popover.style.backgroundColor = "#fff";
    popover.style.border = "1px solid #ccc";
    popover.style.padding = "10px";
    popover.style.boxShadow = "0px 2px 5px rgba(0,0,0,0.3)";
    popover.style.zIndex = "1000";

    const title = document.createElement("div");
    title.textContent = gettext("Scale Element");
    title.style.fontWeight = "bold";
    title.style.marginBottom = "10px";
    popover.appendChild(title);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "1";
    slider.max = "5";
    slider.step = "0.1";
    slider.value = window.selectedElementForUpdate.element.scale || "1";

    slider.style.width = "150px";
    popover.appendChild(slider);

    const output = document.createElement("div");
    output.textContent = slider.value;
    output.style.textAlign = "center";
    output.style.marginTop = "5px";
    popover.appendChild(output);

    document.body.appendChild(popover);

    slider.addEventListener("input", () => {
      const scaleValue = slider.value;
      output.textContent = scaleValue;
      store.selectedElement.style.scale = scaleValue;
      store.selectedElementData.scale = scaleValue;
    });

    slider.addEventListener("pointerdown", () => {
      pushCurrentSlideState();
    });

    setTimeout(() => {
      function handleClickOutside(ev) {
        if (
          !popover.contains(ev.target) &&
          ev.target !== selectedElementScale
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
export function _renderScale(container, el) {
  container.style.scale = el.scale;
}
