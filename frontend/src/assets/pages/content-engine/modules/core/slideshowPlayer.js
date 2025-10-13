// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { loadSlide, scaleSlide } from "./renderSlide.js";
import { updateSlideSelector } from "./slideSelector.js";
import { queryParams } from "../../../../utils/utils.js";
import { hideElementToolbars, hideResizeHandles } from "./elementSelector.js";
import { gettext } from "../../../../utils/locales.js";
import { videoCacheManager } from "./videoCacheManager.js";
import * as bootstrap from "bootstrap";
export async function playSlideshow(showInfoBox = true) {
  // Pre-cache videos for offline support
  console.log("Pre-caching videos for slideshow...");
  await videoCacheManager.preCacheVideos(store.slides);

  document.querySelectorAll(".persistent-indicator").forEach((el) => {
    el.style.visibility = "hidden";
  });

  hideResizeHandles();
  hideElementToolbars();

  // Get all elements with tooltips
  const tooltipTriggerList = [].slice.call(
    document.querySelectorAll('[data-bs-toggle="tooltip"]'),
  );

  // Loop through and hide each tooltip
  tooltipTriggerList.forEach((el) => {
    const tooltip = bootstrap.Tooltip.getInstance(el);
    if (tooltip) {
      tooltip.hide();
    }
  });

  let slideshowRunning = true;
  const previewContainer = document.querySelector(".preview-container");
  const navbar = document.querySelector("#navigation");

  // Only hide navbar if it exists (it won't exist in slideshow-player mode)
  if (navbar) {
    navbar.classList.add("d-none");
  }

  // Save the current slide index to restore it later
  const originalSlideIndex = store.currentSlideIndex;

  // Preserve original styles
  const originalStyles = {
    position: previewContainer.style.position,
    width: previewContainer.style.width,
    height: previewContainer.style.height,
    top: previewContainer.style.top,
    left: previewContainer.style.left,
  };

  // Fullscreen mode
  Object.assign(previewContainer.style, {
    position: "fixed",
    width: "100vw",
    height: "100vh",
    top: "0",
    left: "0",
    zIndex: "100",
  });
  scaleSlide(previewContainer);

  // Info box + exit promise
  let infoBox = null;
  let exitPromise;

  infoBox = document.createElement("div");
  if (!showInfoBox) infoBox.style.visibility = "hidden";
  Object.assign(infoBox.style, {
    position: "absolute",
    top: "10px",
    right: "10px",
    padding: "15px",
    background: "rgba(0,0,0,0.7)",
    color: "white",
    borderRadius: "8px",
    zIndex: "1001",
  });
  infoBox.innerHTML = `
      <button id="exitSlideshow" class="btn btn-danger">${gettext("Exit")}</button>
      <p id="slideCounter"></p>
      <p id="countdown"></p>
      <p>${gettext("Size")}: ${store.emulatedWidth}x${store.emulatedHeight}</p>
    `;
  document.body.appendChild(infoBox);

  // Create exitPromise that resolves on first click
  exitPromise = new Promise((res) => {
    const btn = document.getElementById("exitSlideshow");
    btn.addEventListener(
      "click",
      () => {
        queryParams.mode = "edit";

        loadSlide(
          store.slides[store.currentSlideIndex],
          undefined,
          undefined,
          true,
        );
        slideshowRunning = false;
        document.querySelectorAll(".persistent-indicator").forEach((el) => {
          el.style.visibility = "visible";
        });
        res();
      },
      { once: true },
    );
  });

  // Activation helper
  function isSlideActive(slide) {
    if (!slide.activationEnabled) return true;

    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentTime =
      now.getHours().toString().padStart(2, "0") +
      ":" +
      now.getMinutes().toString().padStart(2, "0");
    const currentDateString = now.toISOString().split("T")[0];

    if (slide.recurringActivation && slide.recurringActivation.enabled) {
      // Check recurring activation
      const recurring = slide.recurringActivation;

      // Check if any intervals match the current day and time
      if (!recurring.intervals || recurring.intervals.length === 0)
        return false;

      for (const interval of recurring.intervals) {
        if (
          interval.day === currentDay &&
          currentTime >= interval.startTime &&
          currentTime <= interval.endTime
        ) {
          return true;
        }
      }

      return false;
    } else {
      // Check one-time activation (existing logic)
      now.setHours(0, 0, 0, 0);
      const start = slide.activationDate
        ? new Date(slide.activationDate + "T00:00:00")
        : null;
      const end = slide.deactivationDate
        ? new Date(slide.deactivationDate + "T00:00:00")
        : null;
      if (start && now < start) return false;
      if (end && now > end) return false;

      return true;
    }
  }

  // Unified slide runner
  async function runSlides() {
    const activeSlides = store.slides
      .map((s, i) => ({ slide: s, index: i }))
      .filter(({ slide }) => isSlideActive(slide));
    const count = activeSlides.length;

    if (count === 0) {
      document.getElementById("slideCounter").innerText =
        gettext("No active slides");
      await exitPromise;
      return;
    }

    if (count === 1) {
      // Single-slide: show and wait for exit
      const { slide, index } = activeSlides[0];

      document.getElementById("slideCounter").innerText =
        gettext("Slide") + ": 1/1";
      document.getElementById("countdown").innerText = "";
      store.currentSlideIndex = index;
      loadSlide(slide, undefined, true, true);
      // Ensure slide is properly scaled after loading
      await new Promise((r) => setTimeout(r, 100));
      scaleSlide(previewContainer);
      await exitPromise;
      return;
    }

    // Multi-slide mode
    let firstRun = true;

    do {
      for (let i = 0; i < count && slideshowRunning; i++) {
        const { slide, index } = activeSlides[i];
        // Update info
        document.getElementById("slideCounter").innerText =
          gettext("Slide") + `: ${i + 1}/${count}`;
        let remaining = slide.duration;
        const countdownEl = document.getElementById("countdown");
        countdownEl.innerText = gettext("Next in") + `: ${remaining}s`;

        // Load slide first, then set up countdown
        store.currentSlideIndex = index;

        if (firstRun) {
          loadSlide(slide, undefined, true, true);
          firstRun = false;
        }

        if (!firstRun) {
          loadSlide(slide, undefined, true);
        }

        // Small delay to ensure elements are rendered, then scale
        await new Promise((r) => setTimeout(r, 100));
        scaleSlide(previewContainer);

        // Start countdown after slide is loaded and scaled
        const interval = setInterval(() => {
          remaining--;
          if (remaining >= 0)
            countdownEl.innerText = gettext("Next in") + `: ${remaining}s`;
          if (remaining <= 0) clearInterval(interval);
        }, 1000);

        await Promise.race([
          new Promise((r) => setTimeout(r, slide.duration * 1000)),
          exitPromise,
        ]);
        if (!slideshowRunning) break;
      }
      if (slideshowRunning) await new Promise((r) => setTimeout(r, 100));
    } while (slideshowRunning);
  }

  await runSlides();

  // Restore edit mode properly
  queryParams.mode = "edit";
  Object.assign(previewContainer.style, originalStyles);
  if (navbar) {
    navbar.classList.remove("d-none");
  }

  // Remove info box
  if (infoBox && document.body.contains(infoBox)) {
    document.body.removeChild(infoBox);
  }

  // Restore the original slide that was being edited before slideshow started
  store.currentSlideIndex = originalSlideIndex;

  // Restore edit mode by reloading the original slide with edit capabilities
  scaleSlide(previewContainer);
  if (store.slides[store.currentSlideIndex]) {
    loadSlide(store.slides[store.currentSlideIndex], undefined, true);
    updateSlideSelector(); // Update the slide selector to show the correct active slide
  }
}

function showInteractivePreviewFromEditor() {
  const previewContainer = document.querySelector(".preview-container");
  const navbar = document.querySelector("#navigation");

  if (navbar) {
    navbar.classList.add("d-none");
  }
  const leftSidebar = document.querySelector(".sidebar");
  if (leftSidebar) {
    leftSidebar.classList.add("d-none");
  }
  const topPanel = document.querySelector(".top-panel");
  if (topPanel) {
    topPanel.classList.add("d-none");
  }

  const originalStyles = {
    position: previewContainer.style.position,
    width: previewContainer.style.width,
    height: previewContainer.style.height,
    top: previewContainer.style.top,
    left: previewContainer.style.left,
    zIndex: previewContainer.style.zIndex,
  };

  previewContainer.style.position = "fixed";
  previewContainer.style.width = "100vw";
  previewContainer.style.height = "100vh";
  previewContainer.style.top = "0";
  previewContainer.style.left = "0";
  previewContainer.style.zIndex = "9999";

  scaleSlide(previewContainer);

  let infoBox = document.createElement("div");
  infoBox.style.position = "absolute";
  infoBox.style.top = "10px";
  infoBox.style.right = "10px";
  infoBox.style.padding = "15px";
  infoBox.style.background = "rgba(0, 0, 0, 0.7)";
  infoBox.style.color = "white";
  infoBox.style.borderRadius = "8px";
  infoBox.style.zIndex = "10000";

  infoBox.innerHTML = `
    <button id="exitInteractiveBtn" class="btn btn-danger">${gettext("Exit")}</button>
    <p>${gettext("Interactive Preview")}</p>
    <p>${gettext("Emulated Size")}: ${store.emulatedWidth} x ${store.emulatedHeight}</p>
  `;
  document.body.appendChild(infoBox);

  document
    .getElementById("exitInteractiveBtn")
    .addEventListener("click", () => {
      queryParams.mode = "edit";
      document.body.removeChild(infoBox);

      previewContainer.style.position = originalStyles.position;
      previewContainer.style.width = originalStyles.width;
      previewContainer.style.height = originalStyles.height;
      previewContainer.style.top = originalStyles.top;
      previewContainer.style.left = originalStyles.left;
      previewContainer.style.zIndex = originalStyles.zIndex;

      if (navbar) {
        navbar.classList.remove("d-none");
      }
      if (leftSidebar) {
        leftSidebar.classList.remove("d-none");
      }
      if (topPanel) {
        topPanel.classList.remove("d-none");
      }

      scaleSlide(previewContainer);

      loadSlide(
        store.slides[store.currentSlideIndex],
        undefined,
        undefined,
        true,
      );
    });

  (async () => {
    await new Promise((res) => setTimeout(res, 600));

    loadSlide(
      store.slides[store.currentSlideIndex],
      undefined,
      undefined,
      true,
    );

    await new Promise((res) => setTimeout(res, 600));
  })();
}

export function initSlideshowPlayer() {
  document.getElementById("playBtn").addEventListener("click", () => {
    // Check if there are any active slides before starting
    function isSlideActiveForPlayback(slide) {
      if (!slide.activationEnabled) return true;

      const now = new Date();
      const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const currentTime =
        now.getHours().toString().padStart(2, "0") +
        ":" +
        now.getMinutes().toString().padStart(2, "0");
      const currentDateString = now.toISOString().split("T")[0];

      if (slide.recurringActivation && slide.recurringActivation.enabled) {
        // Check recurring activation
        const recurring = slide.recurringActivation;

        // Check if any intervals match the current day and time
        if (!recurring.intervals || recurring.intervals.length === 0)
          return false;

        for (const interval of recurring.intervals) {
          if (
            interval.day === currentDay &&
            currentTime >= interval.startTime &&
            currentTime <= interval.endTime
          ) {
            return true;
          }
        }

        return false;
      } else {
        // Check one-time activation
        const tempNow = new Date();
        tempNow.setHours(0, 0, 0, 0);
        const start = slide.activationDate
          ? new Date(slide.activationDate + "T00:00:00")
          : null;
        const end = slide.deactivationDate
          ? new Date(slide.deactivationDate + "T00:00:00")
          : null;
        if (start && tempNow < start) return false;
        if (end && tempNow > end) return false;

        return true;
      }
    }

    const activeSlides = store.slides.filter((slide) =>
      isSlideActiveForPlayback(slide),
    );

    if (activeSlides.length === 0) {
      alert(
        gettext("No Active Slides") +
          "\n\n" +
          gettext(
            "There are currently no slides scheduled to play at this time. Please check your slide activation settings.",
          ),
      );
      return;
    }

    queryParams.mode = "slideshowPlayer";
    if (
      store.slideshowMode &&
      store.slideshowMode.toLowerCase() === "interactive"
    ) {
      if (store.slides.length > 0) {
        store.currentSlideIndex = 0;
        showInteractivePreviewFromEditor();
      }
    } else {
      if (store.slides.length > 0) {
        playSlideshow(true, true);
      }
    }
  });
}
