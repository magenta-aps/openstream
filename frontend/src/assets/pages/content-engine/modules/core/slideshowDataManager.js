// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { loadSlide, scaleAllSlides } from "./renderSlide.js";
import { updateSlideSelector } from "./slideSelector.js";
import {
  autoHyphenate,
  showToast,
  token,
  selectedBranchID,
} from "../../../../utils/utils.js";
import { openAddSlideModal } from "./addSlide.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";

let autosaveTimer = null;

export async function fetchSlideshow(slideshowId) {
  try {
    const resp = await fetch(
      `${BASE_URL}/api/manage_content/?id=${slideshowId}&includeSlideshowData=true&branch_id=${selectedBranchID}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!resp.ok) {
      throw new Error(
        `Failed to load slideshow (ID = ${slideshowId}). Status: ${resp.status}`,
      );
    }
    const data = await resp.json();
    store.slideshowMode = data.mode;
    document.querySelector("#contentEngineTitle").innerHTML = autoHyphenate(
      data.name,
    );



    // Set preview dimensions if they exist in the data (regardless of slides)
    if (data.previewHeight && data.previewWidth) {
      store.emulatedWidth = data.previewWidth;
      store.emulatedHeight = data.previewHeight;
    }

    if (
      data.slideshow_data &&
      data.slideshow_data.slides &&
      data.slideshow_data.slides.length > 0
    ) {
      store.slides.length = 0;
      data.slideshow_data.slides.forEach((s) => store.slides.push(s));

      store.slides.forEach((s) => {
        if (!s.undoStack) s.undoStack = [];
        if (!s.redoStack) s.redoStack = [];
      });

      store.slides.forEach((s) => {
        if (!s.undoStack) s.undoStack = [];
        if (!s.redoStack) s.redoStack = [];

        // --> ADDED: Default activation properties <--
        if (typeof s.activationEnabled === "undefined") {
          s.activationEnabled = false;
        }
        if (typeof s.activationDate === "undefined") {
          s.activationDate = null;
        }
        if (typeof s.deactivationDate === "undefined") {
          s.deactivationDate = null;
        }
      });

      for (const slide of store.slides) {
        slide.elements.forEach((element) => {
          if (element.id >= store.elementIdCounter) {
            store.elementIdCounter = element.id + 1;
          }
        });
      }

      // Restore html, css, js fields for HTML elements from the combined content
      store.slides.forEach((slide) => {
        slide.elements.forEach((element) => {
          if (element.type === "html" && element.content) {
            try {
              const parser = new DOMParser();
              const doc = parser.parseFromString(element.content, "text/html");
              element.html = doc.body.innerHTML.trim();
              const styleEl = doc.querySelector("style");
              element.css = styleEl ? styleEl.textContent : "";
              const scriptEl = doc.querySelector("script");
              element.js = scriptEl ? scriptEl.textContent : "";
            } catch (e) {
              console.error("Failed to parse HTML element content", e);
              element.html = element.html || "";
              element.css = element.css || "";
              element.js = element.js || "";
            }
          }
        });
      });

      store.lastSlidesStr = JSON.stringify(store.slides);
      store.currentSlideIndex = 0;

      if (store.currentSlideIndex > -1) {
        loadSlide(store.slides[store.currentSlideIndex]);
      }
      scaleAllSlides();
    } else {
      // Instead of creating a blank slide, open the add slide modal
      // so users can choose to add a blank slide or use a template
      store.slides = [];
      store.lastSlidesStr = JSON.stringify(store.slides);
      store.currentSlideIndex = -1;

      // Clear the preview area and show placeholder
      const previewSlide = document.querySelector(".preview-slide");
      if (previewSlide) {
        previewSlide.innerHTML =
          '<p class="text-center text-muted mt-5 no-content-placeholder">' +
          gettext("No slides available. Please add a slide to get started.") +
          "</p>";
      }

      // Open the add slide modal
      setTimeout(() => {
        openAddSlideModal();
      }, 100); // Small delay to ensure DOM is ready
    }

    updateSlideSelector();
  } catch (err) {
    console.error("Error fetching slideshow data:", err);
    showToast(`Failed to load slideshow: ${err.message}`, "Error");
  }
}

export function initAutoSave(slideshowId) {
  if (autosaveTimer) {
    clearInterval(autosaveTimer);
    autosaveTimer = null;
  }

  autosaveTimer = setInterval(() => {
    const currentStateStr = JSON.stringify(store.slides);
    if (currentStateStr !== store.lastSlidesStr) {
      // Update lastSlidesStr before saving to prevent duplicate triggers
      store.lastSlidesStr = currentStateStr;
      saveSlideshow(slideshowId)
        .then(() => {
          showSavingStatus();
        })
        .catch((err) => {
          console.error("Auto-save failed:", err);
          showToast(gettext("Auto-save error: ") + err.message, "Error");
        });
    }
  }, 500);
}

export async function saveSlideshow(slideshowId) {
  const payload = {
    ...(store.emulatedHeight && { previewHeight: store.emulatedHeight }),
    ...(store.emulatedWidth && { previewWidth: store.emulatedWidth }),
    slideshow_data: { slides: store.slides },
  };

  const url = `${BASE_URL}/api/manage_content/${slideshowId}/?branch_id=${selectedBranchID}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const errTxt = await resp.text();
    throw new Error(
      gettext("Auto-save failed. Status: ") + `${resp.status}: ${errTxt}`,
    );
  }

  const updated = await resp.json();
  return updated;
}

export function showSavingStatus() {
  const autosaveInfo = document.querySelector(".autosave-info");
  if (!autosaveInfo) return;

  autosaveInfo.innerHTML = `
    <span>
      <i class="material-symbols-outlined text-secondary me-1 saving-icon" 
         >sync</i>
      ${gettext("Saving...")}
    </span>
  `;

  setTimeout(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    autosaveInfo.innerHTML = `
      <span class="text-muted small">
        <i class="material-symbols-outlined text-secondary me-1" 
          >sync</i>
          
           <i class="material-symbols-outlined text-secondary me-1" >save</i>
         <strong>${timeStr}</strong>
      </span>
    `;
  }, 500);
}
