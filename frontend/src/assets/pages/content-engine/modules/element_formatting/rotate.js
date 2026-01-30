// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { showToast } from "../../../../utils/utils.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";

function showRotatePopover(button, callback, initialRotation) {
  const popover = document.createElement("div");

  popover.className = "rotate-popover popover";
  popover.style.position = "absolute";
  popover.style.zIndex = "10000";
  popover.style.padding = "10px";
  popover.style.background = "#fff";
  popover.style.border = "1px solid #ccc";
  popover.style.borderRadius = "4px";
  popover.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "-180";
  slider.max = "180";
  slider.step = "1";
  slider.value = initialRotation.toString(); // set to current rotation
  slider.style.width = "200px";
  popover.appendChild(slider);

  const manualInput = document.createElement("input");
  manualInput.type = "number";
  manualInput.min = "-180";
  manualInput.max = "180";
  manualInput.step = "1";
  manualInput.value = slider.value;
  manualInput.style.width = "60px";
  manualInput.style.marginLeft = "10px";
  popover.appendChild(manualInput);

  const rect = button.getBoundingClientRect();
  popover.style.top = rect.bottom + window.scrollY + "px";
  popover.style.left = rect.left + window.scrollX + "px";

  document.body.appendChild(popover);

  slider.addEventListener("input", () => {
    const degree = parseFloat(slider.value);
    manualInput.value = degree;
    callback(degree);
  });

  manualInput.addEventListener("input", () => {
    let degree = parseFloat(manualInput.value);
    if (isNaN(degree)) {
      degree = 0;
    }
    if (degree < -180) degree = -180;
    if (degree > 180) degree = 180;
    slider.value = degree;
    callback(degree);
  });

  slider.addEventListener("pointerdown", () => {
    pushCurrentSlideState();
  });
  manualInput.addEventListener("focus", () => {
    pushCurrentSlideState();
  });

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

const rotateBtn = document.querySelector("#rotate-btn");

export function initRotate() {
  rotateBtn.addEventListener("click", (e) => {
    document.querySelectorAll(".popover").forEach((popover) => {
      popover.style.display = "none";
    });
    e.stopPropagation();
    if (!store.selectedElement) {
      showToast(gettext("Please select an element first!"), "Info");
      return;
    }

    let initialRotation = 0;
    if (
      store.selectedElementData &&
      typeof store.selectedElementData.rotation !== "undefined"
    ) {
      initialRotation = store.selectedElementData.rotation;
    } else if (store.selectedElement.style.rotate) {
      initialRotation = parseFloat(store.selectedElement.style.rotate) || 0;
    }

    showRotatePopover(
      rotateBtn,
      (degree) => {
        store.selectedElementData.rotation = degree;
        store.selectedElement.style.rotate = `${degree}deg`;
      },
      initialRotation,
    );
  });
}

// Helper function for the render engine to the styling
export function _renderRotate(container, el) {
  container.style.rotate = `${el.rotation}deg `;
}
