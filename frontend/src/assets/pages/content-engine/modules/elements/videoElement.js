// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { queryParams, showToast } from "../../../../utils/utils.js";
import { selectElement } from "../core/elementSelector.js";
import { loadSlide } from "../core/renderSlide.js";
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { getNewZIndex } from "../utils/domUtils.js";
import { displayMediaModal } from "../modals/mediaModal.js";
import { GridUtils } from "../config/gridConfig.js";
import { gettext } from "../../../../utils/locales.js";
import { videoCacheManager } from "../core/videoCacheManager.js";
const videoExtensionsList = ["mp4", "webm", "gif"];

function addVideoElementToSlide(videoId) {
  if (
    window.selectedElementForUpdate &&
    window.selectedElementForUpdate.element &&
    window.selectedElementForUpdate.element.type === "video" // Ensure we are updating a video
  ) {
    pushCurrentSlideState();
    window.selectedElementForUpdate.element.content = videoId;
    const video =
      window.selectedElementForUpdate.container.querySelector("video");
    if (video) {
      videoCacheManager.attachVideoToElement(video, videoId);
      video.addEventListener(
        "loadeddata",
        () => {
          video.play().catch((e) => console.warn("Video play failed:", e));
        },
        { once: true },
      );
    }
    window.selectedElementForUpdate = null;
  } else {
    if (store.currentSlideIndex === -1) {
      showToast(gettext("Please select a slide first!"), "Error");
      return;
    }
    pushCurrentSlideState();
    const defaultSize = GridUtils.getDefaultElementSize('medium');
    const centeredPos = GridUtils.getCenteredPosition(defaultSize.width, defaultSize.height);
    const newVideo = {
      id: store.elementIdCounter++,
      type: "video",
      content: videoId, // The ID of the selected video from the modal
      gridX: defaultSize.x ?? centeredPos.x,
      gridY: defaultSize.y ?? centeredPos.y,
      gridWidth: defaultSize.width,
      gridHeight: defaultSize.height,
      backgroundColor: "transparent",
      zIndex: getNewZIndex(),
      muted: true, // Default to muted
      objectPosition: "center center", // Default object position
      originSlideIndex: store.currentSlideIndex, // Track which slide this element was created on
      isLocked: false, // Initialize lock state
      isHidden: false, // Initialize visibility state
    };
    store.slides[store.currentSlideIndex].elements.push(newVideo);
    loadSlide(store.slides[store.currentSlideIndex]);
    selectElement(document.getElementById("el-" + newVideo.id), newVideo);
  }
}

export function initVideoElement() {
  // Define initial filters for video types
  const videoFilters = { file_types: videoExtensionsList }; // Use local list

  // Update 'Change Video' button to use the unified modal
  const changeVideoBtn = document.getElementById("change-video-btn");
  if (changeVideoBtn) {
    changeVideoBtn.addEventListener("click", () => {
      // Ensure we are actually selecting an element to update
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element.type === "video"
      ) {
        displayMediaModal(
          1,
          addVideoElementToSlide,
          videoFilters,
          gettext("Video"),
        );
      } else {
        showToast(gettext("Please select a video element first!"), "Warning");
      }
    });
  }

  // Update 'Add Video' top option to use the unified modal
  const videoOption = document.querySelector('[data-type="video"]');
  if (videoOption) {
    videoOption.addEventListener("click", () => {
      window.selectedElementForUpdate = null; // Ensure we are adding a new element

      if (store.currentSlideIndex === -1) {
        showToast(gettext("Please select a slide first!"), "Error");
        return;
      }
      // Call the unified modal, passing the video-specific callback and filters
      displayMediaModal(
        1,
        addVideoElementToSlide,
        videoFilters,
        gettext("Video"),
      );
    });
  }
}

export function _renderVideo(el, container) {
  const video = document.createElement("video");
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.objectFit = "contain";
  video.style.objectPosition = el.objectPosition || "center center";
  if (!el.objectPosition) {
    el.objectPosition = "center center";
  }
  video.autoplay = true;
  video.loop = true;
  video.controls = false;
  video.muted = el.muted !== false;

  if (el.content) {
    videoCacheManager.attachVideoToElement(video, el.content);
  } else {
    console.warn("Video element has no content ID:", el.id);
  }
  container.appendChild(video);

  if (el.muted === false) {
    if (queryParams.mode !== "edit") {
      // Delay unmuting slightly to ensure video is ready and avoid browser restrictions
      setTimeout(() => {
        video.muted = false;
        video.volume = 1.0; // Ensure volume is set
        // Attempt to play again if needed, though autoplay should handle it
        video
          .play()
          .catch((e) => console.warn("Autoplay possibly blocked:", e));
      }, 500);
    }
  }
}
