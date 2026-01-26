// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { showToast } from "../../../../utils/utils.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { gettext } from "../../../../utils/locales.js";

const selectedElementOffset = document.getElementById(
  "selected-element-offset",
);

export function initSelectedElementOffset() {
  selectedElementOffset.addEventListener("click", (e) => {
    document.querySelectorAll(".popover").forEach((popover) => {
      popover.style.display = "none";
    });
    e.stopPropagation();
    if (!store.selectedElement) {
      showToast(gettext("Please select an element first!"), "Info");
      return;
    }

    store.selectedElement.style.position = "relative";

    const popover = document.createElement("div");
    popover.className = "popover";
    popover.id = "offsetPopover";
    popover.style.position = "absolute";
    popover.style.top = e.clientY + "px";
    popover.style.left = e.clientX + "px";
    popover.style.backgroundColor = "#fff";
    popover.style.border = "1px solid #ccc";
    popover.style.padding = "10px";
    popover.style.boxShadow = "0px 2px 5px rgba(0,0,0,0.3)";
    popover.style.zIndex = "1000";

    const title = document.createElement("div");
    title.textContent = gettext("Set Offset (%)");
    title.style.fontWeight = "bold";
    title.style.marginBottom = "10px";
    popover.appendChild(title);

    const horizontalContainer = document.createElement("div");
    horizontalContainer.style.marginBottom = "8px";

    const hLabel = document.createElement("label");
    hLabel.textContent = gettext("Horizontal: ");
    hLabel.style.marginRight = "5px";
    horizontalContainer.appendChild(hLabel);

    const hSlider = document.createElement("input");
    hSlider.type = "range";
    hSlider.min = "-100";
    hSlider.max = "100";
    hSlider.step = "1";
    hSlider.style.width = "120px";
    if (window.selectedElementForUpdate.element.left) {
      hSlider.value = window.selectedElementForUpdate.element.left.replace(
        "%",
        "",
      );
    } else hSlider.value = "0";

    horizontalContainer.appendChild(hSlider);

    const hInput = document.createElement("input");
    hInput.type = "number";
    hInput.min = "-100";
    hInput.max = "100";
    hInput.step = "1";
    hInput.value = hSlider.value;
    hInput.style.width = "60px";
    hInput.style.marginLeft = "5px";
    hInput.style.marginRight = "5px";
    horizontalContainer.appendChild(hInput);

    const hOutput = document.createElement("span");
    hOutput.textContent = "%";
    hOutput.style.marginLeft = "2px";
    horizontalContainer.appendChild(hOutput);

    popover.appendChild(horizontalContainer);

    const verticalContainer = document.createElement("div");
    verticalContainer.style.marginBottom = "8px";

    const vLabel = document.createElement("label");
    vLabel.textContent = gettext("Vertical: ");
    vLabel.style.marginRight = "5px";
    verticalContainer.appendChild(vLabel);

    const vSlider = document.createElement("input");
    vSlider.type = "range";
    vSlider.min = "-100";
    vSlider.max = "100";
    vSlider.step = "1";
    vSlider.style.width = "120px";

    if (window.selectedElementForUpdate.element.top) {
      vSlider.value = window.selectedElementForUpdate.element.top.replace(
        "%",
        "",
      );
    } else {
      vSlider.value = 0;
    }
    verticalContainer.appendChild(vSlider);

    const vInput = document.createElement("input");
    vInput.type = "number";
    vInput.min = "-100";
    vInput.max = "100";
    vInput.step = "1";
    vInput.value = vSlider.value;
    vInput.style.width = "60px";
    vInput.style.marginLeft = "5px";
    vInput.style.marginRight = "5px";
    verticalContainer.appendChild(vInput);

    const vOutput = document.createElement("span");
    vOutput.textContent = "%";
    vOutput.style.marginLeft = "2px";
    verticalContainer.appendChild(vOutput);

    popover.appendChild(verticalContainer);

    document.body.appendChild(popover);

    hSlider.addEventListener("input", () => {
      const val = hSlider.value;
      hInput.value = val;
      pushCurrentSlideState();
      store.selectedElement.style.left = val + "%";
      store.selectedElementData.left = val + "%";
    });

    hInput.addEventListener("input", () => {
      const val = Math.max(-100, Math.min(100, parseInt(hInput.value) || 0));
      hInput.value = val;
      hSlider.value = val;
      pushCurrentSlideState();
      store.selectedElement.style.left = val + "%";
      store.selectedElementData.left = val + "%";
    });

    vSlider.addEventListener("input", () => {
      const val = vSlider.value;
      vInput.value = val;
      pushCurrentSlideState();
      store.selectedElement.style.top = val + "%";
      store.selectedElementData.top = val + "%";
    });

    vInput.addEventListener("input", () => {
      const val = Math.max(-100, Math.min(100, parseInt(vInput.value) || 0));
      vInput.value = val;
      vSlider.value = val;
      pushCurrentSlideState();
      store.selectedElement.style.top = val + "%";
      store.selectedElementData.top = val + "%";
    });

    setTimeout(() => {
      function handleClickOutside(ev) {
        if (
          !popover.contains(ev.target) &&
          ev.target !== selectedElementOffset
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
export function _renderOffset(container, el) {
  container.style.position = "relative";
  if (el.left) {
    container.style.left = el.left;
  }
  if (el.top) {
    container.style.top = el.top;
  }
}
