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
import {
  subscribeToPersistedStateChanges,
  suspendPersistedStateNotifications,
} from "./persistedStateObserver.js";
import { syncGridToCurrentSlide } from "../config/gridConfig.js";

const AUTOSAVE_DEBOUNCE_MS = 1500;
let autosaveDebounceHandle = null;
let unsubscribeFromPersistedChanges = null;
let activeSlideshowId = null;
let lastSavedSnapshot = null;
let pendingSnapshot = null;
let dirtySinceLastSave = false;
let saveInFlight = false;

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
    const resumePersistedNotifications = suspendPersistedStateNotifications();
    try {
      const data = await resp.json();
      const isLegacySlideshow = Boolean(data.isLegacy);
      store.activeSlideshowIsLegacy = isLegacySlideshow;
      store.legacyGridEnabled = isLegacySlideshow;
      store.slideshowMode = data.mode;
      document.querySelector("#contentEngineTitle").innerHTML = autoHyphenate(
        data.name,
      );

      // Set preview dimensions if they exist in the data (regardless of slides)
      if (data.previewHeight && data.previewWidth) {
        store.emulatedWidth = data.previewWidth;
        store.emulatedHeight = data.previewHeight;
      }
      syncGridToCurrentSlide();

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
                const doc = parser.parseFromString(
                  element.content,
                  "text/html",
                );
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
          syncGridToCurrentSlide();
          loadSlide(store.slides[store.currentSlideIndex]);
        }
        scaleAllSlides();
      } else {
        // Instead of creating a blank slide, open the add slide modal
        // so users can choose to add a blank slide or use a template
        store.slides.length = 0;
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

        syncGridToCurrentSlide();
        // Open the add slide modal
        setTimeout(() => {
          openAddSlideModal();
        }, 100); // Small delay to ensure DOM is ready
      }

      updateSlideSelector();
    } finally {
      resumePersistedNotifications();
    }
  } catch (err) {
    console.error("Error fetching slideshow data:", err);
    showToast(`Failed to load slideshow: ${err.message}`, "Error");
  }
}

export function initAutoSave(slideshowId) {
  tearDownSlideshowAutoSave();
  activeSlideshowId = slideshowId;
  lastSavedSnapshot = captureSlideshowSnapshot();
  pendingSnapshot = lastSavedSnapshot;
  showSavingStatus("idle");

  unsubscribeFromPersistedChanges = subscribeToPersistedStateChanges(() => {
    if (!activeSlideshowId) {
      return;
    }
    scheduleSlideshowAutoSave();
  });
}

function tearDownSlideshowAutoSave() {
  if (autosaveDebounceHandle) {
    clearTimeout(autosaveDebounceHandle);
    autosaveDebounceHandle = null;
  }
  if (unsubscribeFromPersistedChanges) {
    unsubscribeFromPersistedChanges();
    unsubscribeFromPersistedChanges = null;
  }
  activeSlideshowId = null;
  pendingSnapshot = null;
  dirtySinceLastSave = false;
  saveInFlight = false;
}

function captureSlideshowSnapshot() {
  return JSON.stringify({
    slides: store.slides,
    emulatedWidth: store.emulatedWidth,
    emulatedHeight: store.emulatedHeight,
  });
}

function scheduleSlideshowAutoSave() {
  pendingSnapshot = captureSlideshowSnapshot();
  dirtySinceLastSave = pendingSnapshot !== lastSavedSnapshot;

  if (!dirtySinceLastSave) {
    return;
  }

  showSavingStatus("pending");

  if (saveInFlight) {
    return;
  }

  if (autosaveDebounceHandle) {
    clearTimeout(autosaveDebounceHandle);
  }

  autosaveDebounceHandle = window.setTimeout(() => {
    runSlideshowAutoSave();
  }, AUTOSAVE_DEBOUNCE_MS);
}

async function runSlideshowAutoSave() {
  if (!dirtySinceLastSave || !activeSlideshowId) {
    return;
  }

  if (autosaveDebounceHandle) {
    clearTimeout(autosaveDebounceHandle);
    autosaveDebounceHandle = null;
  }

  saveInFlight = true;
  const snapshotToPersist = pendingSnapshot;
  showSavingStatus("saving");

  try {
    await saveSlideshow(activeSlideshowId);
    lastSavedSnapshot = snapshotToPersist;
    store.lastSlidesStr = JSON.stringify(store.slides);
    dirtySinceLastSave = pendingSnapshot !== lastSavedSnapshot;
    showSavingStatus("success", { timestamp: new Date() });
  } catch (err) {
    dirtySinceLastSave = true;
    console.error("Auto-save failed:", err);
    showSavingStatus("error", { message: err.message });
    showToast(gettext("Auto-save error: ") + err.message, "Error");
  } finally {
    saveInFlight = false;
    if (dirtySinceLastSave) {
      scheduleSlideshowAutoSave();
    }
  }
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

export function showSavingStatus(state = "idle", details = {}) {
  const autosaveInfo = document.querySelector(".autosave-info");
  if (!autosaveInfo) return;

  autosaveInfo.setAttribute("aria-live", "polite");
  const content = document.createElement("span");
  content.className = "d-inline-flex align-items-center gap-2 small text-muted";

  const icon = document.createElement("i");
  icon.className = "material-symbols-outlined text-secondary";

  const message = document.createElement("span");

  switch (state) {
    case "pending":
      icon.textContent = "pending";
      message.textContent = gettext("Changes pending...");
      break;
    case "saving":
      icon.textContent = "sync";
      message.textContent = gettext("Saving...");
      break;
    case "success": {
      icon.textContent = "check_circle";
      const timestamp = details.timestamp instanceof Date
        ? details.timestamp
        : new Date();
      const timeStr = timestamp.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      message.textContent = `${gettext("Saved at")} ${timeStr}`;
      break;
    }
    case "error":
      icon.textContent = "error";
      if (details.message) {
        message.textContent = `${gettext("Auto-save failed")}: ${details.message}`;
      } else {
        message.textContent = gettext("Auto-save failed");
      }
      content.classList.remove("text-muted");
      content.classList.add("text-danger");
      break;
    default:
      icon.textContent = "task_alt";
      message.textContent = gettext("Up to date");
      break;
  }

  content.innerHTML = "";
  content.appendChild(icon);
  content.appendChild(message);

  autosaveInfo.innerHTML = "";
  autosaveInfo.appendChild(content);
}
