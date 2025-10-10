// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { queryParams } from "../../../../utils/utils.js";
import { gettext } from "../../../../utils/locales.js";
import { showToast } from "../../../../utils/utils.js";

export function initLockElement() {
  const lockButton = document.getElementById("lock-element-btn");
  if (lockButton) {
    // Show/hide and allow toggling depending on selection; handler toggles lock in any mode
    lockButton.addEventListener("click", () => {
      if (store.selectedElementData) {
        toggleElementLock();
      }
    });
  }
}

function toggleElementLock() {
  if (!store.selectedElementData) return;
  // Prevent toggling when template enforces settings and we're outside template editor
  if (
    queryParams.mode !== "template_editor" &&
    store.selectedElementData.preventSettingsChanges
  ) {
    try {
      showToast(
        gettext("This element's settings are enforced by the template."),
        "Info",
      );
    } catch (err) {}
    return;
  }

  pushCurrentSlideState();

  const isLocked = store.selectedElementData.isLocked;
  store.selectedElementData.isLocked = !isLocked;

  // Update visual feedback
  const lockButton = document.getElementById("lock-element-btn");
  updateLockButtonState(lockButton, !isLocked);

  // Update element class for styling (keep for hover effect)
  if (store.selectedElement) {
    if (!isLocked) {
      store.selectedElement.classList.add("is-locked");
    } else {
      store.selectedElement.classList.remove("is-locked");
    }
  }
}

function updateLockButtonState(button, isLocked) {
  if (!button) return;

  const icon = button.querySelector(".material-symbols-outlined");
  if (isLocked) {
    button.classList.remove("btn-secondary");
    button.classList.add("btn-primary");
    icon.textContent = "lock";
    button.setAttribute(
      "data-bs-title",
      gettext("Unlock element movement and resizing"),
    );
  } else {
    button.classList.remove("btn-primary");
    button.classList.add("btn-secondary");
    icon.textContent = "lock_open";
    button.setAttribute(
      "data-bs-title",
      gettext(
        "Lock element to prevent movement and resizing when template is used",
      ),
    );
  }
}

function addLockIndicator(element) {
  // Remove existing indicator if present
  removeLockIndicator(element);

  const lockIndicator = document.createElement("div");
  lockIndicator.classList.add("lock-indicator", "element-indicator");
  lockIndicator.innerHTML = '<i class="material-symbols-outlined">lock</i>';
  // Position lock to the right by default; if a persistent (pin) indicator
  // exists we shift it left so it sits to the left of the pin.
  // Prefer placing inside the indicators wrapper for consistent layout
  try {
    // Only show lock indicators in editor/template modes (not during playback)
    if (queryParams.mode !== "edit" && queryParams.mode !== "template_editor") {
      return;
    }

    // Respect per-slide override if present, otherwise use global flag
    const slide =
      store && Array.isArray(store.slides)
        ? store.slides[store.currentSlideIndex]
        : null;
    const show =
      slide && typeof slide.showElementIndicators !== "undefined"
        ? slide.showElementIndicators
        : typeof window !== "undefined" &&
            window.store &&
            typeof window.store.showElementIndicators !== "undefined"
          ? window.store.showElementIndicators
          : true;
    const wrapper = element.querySelector(".element-indicators-wrapper");
    if (wrapper) {
      // rely on CSS for visuals; only adjust wrapper visibility from here
      wrapper.appendChild(lockIndicator);
      if (!show) wrapper.style.visibility = "hidden";
    } else {
      // Fallback: position absolutely but still use class-based visuals
      lockIndicator.style.position = "absolute";
      lockIndicator.style.top = "8px";
      lockIndicator.style.right = "8px";
      element.appendChild(lockIndicator);
    }
  } catch (err) {
    // On any error, append as fallback
    element.appendChild(lockIndicator);
  }
}

function removeLockIndicator(element) {
  const existingIndicator = element.querySelector(".lock-indicator");
  if (existingIndicator) {
    existingIndicator.remove();
  }
}

export function updateLockButtonForSelectedElement() {
  const lockButton = document.getElementById("lock-element-btn");
  if (!lockButton) return;
  if (store.selectedElementData) {
    const isLocked = store.selectedElementData.isLocked || false;
    updateLockButtonState(lockButton, isLocked);
    lockButton.style.display = "flex";
    // Make interactive in any mode; if you want non-interactive in non-template mode,
    // we can change this to pointerEvents = 'none' when queryParams.mode !== 'template_editor'
    lockButton.style.pointerEvents = "auto";
    lockButton.style.opacity = "1";
  } else {
    lockButton.style.display = "none";
  }
}

export function isElementLocked(elementData) {
  return elementData && elementData.isLocked === true;
}

// Function to add lock indicators to all locked elements when rendering
export function addLockIndicatorsToElements() {
  // Lock indicators removed - toolbar indication is sufficient
  return;
}
