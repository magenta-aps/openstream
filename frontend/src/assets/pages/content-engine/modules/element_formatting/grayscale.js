// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { showToast } from "../../../../utils/utils.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { gettext } from "../../../../utils/locales.js";

function showGrayscalePopover(button, callback) {
  const popover = document.createElement("div");
  popover.className = "grayscale-popover popover";
  popover.style.position = "absolute";
  popover.style.zIndex = "10000";
  popover.style.padding = "10px";
  popover.style.background = "#fff";
  popover.style.border = "1px solid #ccc";
  popover.style.borderRadius = "4px";
  popover.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
  popover.style.width = "220px";

  const label = document.createElement("label");
  label.textContent = gettext("Grayscale (%):");
  label.style.display = "block";
  label.style.fontSize = "12px";
  popover.appendChild(label);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "1";
  slider.value = window.selectedElementForUpdate?.element?.grayscale || 0;
  slider.style.width = "100%";
  popover.appendChild(slider);

  const valueDisplay = document.createElement("div");
  valueDisplay.style.fontSize = "12px";
  valueDisplay.style.marginTop = "6px";
  valueDisplay.textContent = `${slider.value}%`;
  popover.appendChild(valueDisplay);

  slider.addEventListener("input", () => {
    valueDisplay.textContent = `${slider.value}%`;
    callback(parseInt(slider.value, 10));
  });

  const rect = button.getBoundingClientRect();
  document.body.appendChild(popover);

  // Smart positioning to avoid overflow
  const popoverRect = popover.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  let top = rect.bottom + window.scrollY;
  let left = rect.left + window.scrollX;

  // Check if popover would overflow at the bottom
  if (rect.bottom + popoverRect.height > viewportHeight) {
    // Position above the button instead
    top = rect.top + window.scrollY - popoverRect.height - 5;
  }

  // Check if popover would overflow on the right
  if (rect.left + popoverRect.width > viewportWidth) {
    // Align to the right edge of the button
    left = rect.right + window.scrollX - popoverRect.width;
  }

  // Ensure popover doesn't go off the left edge
  if (left < 0) {
    left = 10; // Small margin from edge
  }

  // Ensure popover doesn't go above the top
  if (top < window.scrollY) {
    top = window.scrollY + 10; // Small margin from top
  }

  popover.style.top = top + "px";
  popover.style.left = left + "px";

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

export function initGrayscale() {
  const grayscaleBtn = document.getElementById("grayscaleBtn");
  if (grayscaleBtn) {
    grayscaleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".popover").forEach((popover) => {
        popover.style.display = "none";
      });
      if (!store.selectedElement) {
        showToast(gettext("Please select an element first!"), "Info");
        return;
      }
      pushCurrentSlideState();
      showGrayscalePopover(grayscaleBtn, (grayscalePercent) => {
        // Apply CSS filter while preserving other filters
        const prevFilter =
          store.selectedElement.style.getPropertyValue("filter") || "";
        // Remove any existing grayscale() from prevFilter
        const newFilter = prevFilter.replace(/grayscale\([^)]*\)/g, "").trim();
        const filterWithGrayscale =
          `${newFilter} grayscale(${grayscalePercent}%)`.trim();
        store.selectedElement.style.setProperty(
          "filter",
          filterWithGrayscale,
          "important",
        );
        store.selectedElementData.grayscale = grayscalePercent;
      });
    });
  }
}

export function _renderGrayscale(container, el) {
  if (typeof el.grayscale === "number" && el.grayscale > 0) {
    const prevFilter = container.style.getPropertyValue("filter") || "";
    const newFilter = prevFilter.replace(/grayscale\([^)]*\)/g, "").trim();
    container.style.setProperty(
      "filter",
      `${newFilter} grayscale(${el.grayscale}%)`.trim(),
      "important",
    );
  }
}
