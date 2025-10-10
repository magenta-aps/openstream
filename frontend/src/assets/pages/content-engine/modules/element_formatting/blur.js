// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { showToast } from "../../../../utils/utils.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { gettext } from "../../../../utils/locales.js";

function showBlurPopover(button, callback) {
  const popover = document.createElement("div");
  popover.className = "blur-popover popover";
  popover.style.position = "absolute";
  popover.style.zIndex = "10000";
  popover.style.padding = "10px";
  popover.style.background = "#fff";
  popover.style.border = "1px solid #ccc";
  popover.style.borderRadius = "4px";
  popover.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
  popover.style.width = "220px";

  const label = document.createElement("label");
  label.textContent = gettext("Blur (px):");
  label.style.display = "block";
  label.style.fontSize = "12px";
  popover.appendChild(label);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "50";
  slider.step = "1";
  slider.value = window.selectedElementForUpdate?.element?.blur || 0;
  slider.style.width = "100%";
  popover.appendChild(slider);

  const valueDisplay = document.createElement("div");
  valueDisplay.style.fontSize = "12px";
  valueDisplay.style.marginTop = "6px";
  valueDisplay.textContent = `${slider.value}px`;
  popover.appendChild(valueDisplay);

  slider.addEventListener("input", () => {
    valueDisplay.textContent = `${slider.value}px`;
    callback(parseInt(slider.value, 10));
  });

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

export function initBlur() {
  const blurBtn = document.getElementById("blurBtn");
  if (blurBtn) {
    blurBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".popover").forEach((popover) => {
        popover.style.display = "none";
      });
      if (!store.selectedElement) {
        showToast(gettext("Please select an element first!"), "Info");
        return;
      }
      pushCurrentSlideState();
      showBlurPopover(blurBtn, (blurPx) => {
        // Apply CSS filter while preserving other filters
        const prevFilter =
          store.selectedElement.style.getPropertyValue("filter") || "";
        // Remove any existing blur() from prevFilter
        const newFilter = prevFilter.replace(/blur\([^)]*\)/g, "").trim();
        const filterWithBlur = `${newFilter} blur(${blurPx}px)`.trim();
        store.selectedElement.style.setProperty(
          "filter",
          filterWithBlur,
          "important",
        );
        store.selectedElementData.blur = blurPx;
      });
    });
  }
}

export function _renderBlur(container, el) {
  if (typeof el.blur === "number" && el.blur > 0) {
    const prevFilter = container.style.getPropertyValue("filter") || "";
    const newFilter = prevFilter.replace(/blur\([^)]*\)/g, "").trim();
    container.style.setProperty(
      "filter",
      `${newFilter} blur(${el.blur}px)`.trim(),
      "important",
    );
  }
}
