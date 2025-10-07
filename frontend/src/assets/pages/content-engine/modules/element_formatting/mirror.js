// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { showToast } from "../../../../utils/utils.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { gettext } from "../../../../utils/locales.js";

function showMirrorPopover(button, callback, initialMirror) {
  const popover = document.createElement("div");

  popover.className = "mirror-popover popover";
  popover.style.position = "absolute";
  popover.style.zIndex = "10000";
  popover.style.padding = "15px";
  popover.style.background = "#fff";
  popover.style.border = "1px solid #ccc";
  popover.style.borderRadius = "4px";
  popover.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
  popover.style.minWidth = "200px";

  // Create container for buttons
  const buttonContainer = document.createElement("div");
  buttonContainer.style.display = "flex";
  buttonContainer.style.flexDirection = "column";
  buttonContainer.style.gap = "10px";

  // Horizontal flip button
  const horizontalBtn = document.createElement("button");
  horizontalBtn.className = "btn btn-sm btn-outline-primary";
  horizontalBtn.innerHTML = '<i class="material-symbols-outlined">flip</i> Flip Horizontally';
  horizontalBtn.style.display = "flex";
  horizontalBtn.style.alignItems = "center";
  horizontalBtn.style.gap = "8px";

  // Vertical flip button
  const verticalBtn = document.createElement("button");
  verticalBtn.className = "btn btn-sm btn-outline-primary";
  verticalBtn.innerHTML = '<i class="material-symbols-outlined" style="transform: rotate(90deg);">flip</i> Flip Vertically';
  verticalBtn.style.display = "flex";
  verticalBtn.style.alignItems = "center";
  verticalBtn.style.gap = "8px";

  // Reset button
  const resetBtn = document.createElement("button");
  resetBtn.className = "btn btn-sm btn-outline-secondary";
  resetBtn.innerHTML = '<i class="material-symbols-outlined">refresh</i> Reset';
  resetBtn.style.display = "flex";
  resetBtn.style.alignItems = "center";
  resetBtn.style.gap = "8px";

  // Update button states based on current mirror values
  function updateButtonStates(mirror) {
    horizontalBtn.className = mirror.horizontal ? 
      "btn btn-sm btn-primary" : "btn btn-sm btn-outline-primary";
    verticalBtn.className = mirror.vertical ? 
      "btn btn-sm btn-primary" : "btn btn-sm btn-outline-primary";
  }

  updateButtonStates(initialMirror);

  buttonContainer.appendChild(horizontalBtn);
  buttonContainer.appendChild(verticalBtn);
  buttonContainer.appendChild(resetBtn);
  popover.appendChild(buttonContainer);

  const rect = button.getBoundingClientRect();
  popover.style.top = rect.bottom + window.scrollY + "px";
  popover.style.left = rect.left + window.scrollX + "px";

  document.body.appendChild(popover);

  horizontalBtn.addEventListener("click", () => {
    const newMirror = {
      horizontal: !initialMirror.horizontal,
      vertical: initialMirror.vertical
    };
    initialMirror = newMirror;
    updateButtonStates(newMirror);
    callback(newMirror);
    pushCurrentSlideState();
  });

  verticalBtn.addEventListener("click", () => {
    const newMirror = {
      horizontal: initialMirror.horizontal,
      vertical: !initialMirror.vertical
    };
    initialMirror = newMirror;
    updateButtonStates(newMirror);
    callback(newMirror);
    pushCurrentSlideState();
  });

  resetBtn.addEventListener("click", () => {
    const newMirror = { horizontal: false, vertical: false };
    initialMirror = newMirror;
    updateButtonStates(newMirror);
    callback(newMirror);
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

const mirrorBtn = document.querySelector("#mirror-btn");

export function initMirror() {
  mirrorBtn.addEventListener("click", (e) => {
    document.querySelectorAll(".popover").forEach((popover) => {
      popover.style.display = "none";
    });
    e.stopPropagation();
    if (!store.selectedElement) {
      showToast(gettext("Please select an element first!"), "Info");
      return;
    }

    let initialMirror = { horizontal: false, vertical: false };
    if (
      store.selectedElementData &&
      typeof store.selectedElementData.mirror !== "undefined"
    ) {
      initialMirror = { ...store.selectedElementData.mirror };
    }

    showMirrorPopover(
      mirrorBtn,
      (mirror) => {
        store.selectedElementData.mirror = mirror;
        applyMirrorTransform(store.selectedElement, mirror);
      },
      initialMirror,
    );
  });
}

function applyMirrorTransform(element, mirror) {
  let scaleX = mirror.horizontal ? -1 : 1;
  let scaleY = mirror.vertical ? -1 : 1;
  
  // Get existing transforms
  let existingTransform = element.style.transform || "";
  
  // Remove any existing scale transforms
  existingTransform = existingTransform.replace(/scale[XY]?\([^)]*\)/g, "").trim();
  
  // Add new scale transform
  const newScale = `scale(${scaleX}, ${scaleY})`;
  
  if (existingTransform) {
    element.style.transform = `${existingTransform} ${newScale}`;
  } else {
    element.style.transform = newScale;
  }
}

// Helper function for the render engine to apply the styling
export function _renderMirror(container, el) {
  if (el.mirror) {
    const scaleX = el.mirror.horizontal ? -1 : 1;
    const scaleY = el.mirror.vertical ? -1 : 1;
    
    // Get existing transform from container
    let existingTransform = container.style.transform || "";
    
    // Remove any existing scale transforms
    existingTransform = existingTransform.replace(/scale[XY]?\([^)]*\)/g, "").trim();
    
    // Add new scale transform
    const newScale = `scale(${scaleX}, ${scaleY})`;
    
    if (existingTransform) {
      container.style.transform = `${existingTransform} ${newScale}`;
    } else {
      container.style.transform = newScale;
    }
  }
}
