// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";

export function alignMediaElement(hAlign, vAlign) {
  let mediaEl = null;
  const dataObj = store.selectedElementData;
  if (window.selectedElementForUpdate.element.type === "video")
    mediaEl = window.selectedElementForUpdate.container.querySelector("video");
  else if (window.selectedElementForUpdate.element.type === "image")
    mediaEl = window.selectedElementForUpdate.container.querySelector("img");

  // Ensure hAlign and vAlign have default values if not provided
  // This can happen if only one alignment direction is changed.
  // We'll get the current alignment and infer the missing part.
  const currentObjectPosition = dataObj.objectPosition || "center center";
  const parts = currentObjectPosition.split(" ");
  let currentHAlign = parts[0];
  let currentVAlign = parts[1];

  if (hAlign === null && vAlign === null) {
    // This case should ideally not happen if called from event listeners of new radio groups
    return;
  }

  if (hAlign !== null) {
    currentHAlign = hAlign;
  }
  if (vAlign !== null) {
    currentVAlign = vAlign;
  }

  pushCurrentSlideState();
  const newObjectPosition = `${currentHAlign} ${currentVAlign}`;
  mediaEl.style.objectPosition = newObjectPosition;
  dataObj.objectPosition = newObjectPosition;
}

export function initMediaAlignment() {
  const imgHRadioBtns = document.querySelectorAll('input[name="imageHAlign"]');
  const imgVRadioBtns = document.querySelectorAll('input[name="imageVAlign"]');
  const videoHRadioBtns = document.querySelectorAll(
    'input[name="videoHAlign"]',
  );
  const videoVRadioBtns = document.querySelectorAll(
    'input[name="videoVAlign"]',
  );

  imgHRadioBtns.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      alignMediaElement(event.target.value, null); // Pass null for vAlign
    });
  });

  imgVRadioBtns.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      alignMediaElement(null, event.target.value); // Pass null for hAlign
    });
  });

  videoHRadioBtns.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      alignMediaElement(event.target.value, null); // Pass null for vAlign
    });
  });

  videoVRadioBtns.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      alignMediaElement(null, event.target.value); // Pass null for hAlign
    });
  });
}

export function setupMediaAlignmentRadioButtons() {
  let hAlignBtns = null;
  let vAlignBtns = null;

  if (window.selectedElementForUpdate.element.type === "video") {
    hAlignBtns = document.querySelectorAll('input[name="videoHAlign"]');
    vAlignBtns = document.querySelectorAll('input[name="videoVAlign"]');
  } else if (window.selectedElementForUpdate.element.type === "image") {
    hAlignBtns = document.querySelectorAll('input[name="imageHAlign"]');
    vAlignBtns = document.querySelectorAll('input[name="imageVAlign"]');
  }

  const currentAlign =
    window.selectedElementForUpdate.element.objectPosition || "center center";
  const parts = currentAlign.split(" ");
  const currentHAlign = parts[0];
  const currentVAlign = parts[1];

  if (hAlignBtns) {
    hAlignBtns.forEach((radio) => {
      radio.checked = radio.value === currentHAlign;
    });
  }

  if (vAlignBtns) {
    vAlignBtns.forEach((radio) => {
      radio.checked = radio.value === currentVAlign;
    });
  }
}

export function setupMuteButtons() {
  let volumeBtns = null;

   if (window.selectedElementForUpdate.element.type === "video") {
    volumeBtns = document.querySelectorAll('input[name="videoVolume"]');
  }

  volumeBtns.forEach((radio) => {
    if (
      radio.value === window.selectedElementForUpdate.element.muted.toString()
    ) {
      radio.checked = true;
    }
  });
}

export function initMuteButtons() {
  const videoVolumeButtons = document.querySelectorAll(
    'input[name="videoVolume"]',
  );

  function setElementVolumeState(value) {
    if (value === "true") value = true;
    if (value === "false") value = false;
    // Capture undo snapshot before applying the change
    pushCurrentSlideState();

    window.selectedElementForUpdate.element.muted = value;

    // If this element has a media DOM node, update its muted state immediately
    try {
      const container = window.selectedElementForUpdate.container;
      if (container) {
        const media = container.querySelector("video, audio");
        if (media) media.muted = value;
      }
    } catch (e) {
      // Defensive: don't break UI on unexpected structure
      console.warn("Failed to update media muted state in DOM:", e);
    }
  }


  videoVolumeButtons.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      setElementVolumeState(event.target.value);
    });
  });
}