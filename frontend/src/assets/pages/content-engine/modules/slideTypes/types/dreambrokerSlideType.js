// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * dreambrokerSlideType.js
 * Dreambroker Video slide type definition
 ************************************************************/

import { SlideTypeUtils } from "../slideTypeRegistry.js";

export const DreambrokerSlideType = {
  name: "Dreambroker",
  description: "Video player for Dreambroker video content",
  categoryId: 2, // Video category

  ...SlideTypeUtils.getDefaultSlideSettings(),

  getDefaultConfig(existingConfig = {}) {
    const config = existingConfig || {};
    return {
      userInputUrl: config.userInputUrl || "",
      muted: config.muted !== false, // Default to muted
    };
  },

  async generateForm(existingConfig = null) {
    try {
      const config = this.getDefaultConfig(existingConfig);

      return await SlideTypeUtils.loadFormTemplateWithCallback(
        "/slide-types/dreambroker-form",
        "Dreambroker Form",
        () => {
          this.populateFormData(config);
          this.setupFormEventListeners();
        },
      );
    } catch (error) {
      console.error("Error generating Dreambroker form:", error);
      return SlideTypeUtils.getErrorTemplate(
        `Could not initialize Dreambroker form: ${error.message}`,
        "Dreambroker Form",
      );
    }
  },

  populateFormData(config) {
    // Set URL input
    this.setElementValue("dreambroker-video-url", config.userInputUrl);

    // Set mute checkbox
    this.setElementChecked("mute-checkbox", config.muted);
  },

  setElementValue(selector, value) {
    const element =
      document.getElementById(selector) || document.querySelector(selector);
    if (element) element.value = value;
  },

  setElementChecked(selector, checked) {
    const element =
      document.getElementById(selector) || document.querySelector(selector);
    if (element) element.checked = checked;
  },

  /**
   * Extracts the direct video URL from the simpler Dreambroker URL.
   * For example, converts:
   *   https://dreambroker.com/channel/v0fmvsex/3hhn4c7v
   * into:
   *   https://dreambroker.com/channel/v0fmvsex/3hhn4c7v/get/normal.mp4
   */
  extractVideoLink(url) {
    try {
      const parsedUrl = new URL(url);
      const parts = parsedUrl.pathname.split("/"); // ["", "channel", "v0fmvsex", "3hhn4c7v"]
      if (parts.length < 4 || parts[1] !== "channel") return null;

      const channelId = parts[2];
      const videoId = parts[3];

      return `https://dreambroker.com/channel/${channelId}/${videoId}/get/normal.mp4`;
    } catch {
      return null;
    }
  },

  setupFormEventListeners() {
    // No specific event listeners needed for this slide type
    // but keeping the structure for consistency
  },

  cleanupFormEventListeners() {
    // No cleanup needed for this slide type
  },

  async generateSlide(config) {
    const videoLink = this.extractVideoLink(config.userInputUrl);

    if (!videoLink) {
      throw new Error("Invalid Dreambroker URL provided");
    }

    const params = {
      video_url: videoLink,
      muted: config.muted ? "true" : "false",
      userInputUrl: config.userInputUrl, // Keep original URL for editing
    };

    return SlideTypeUtils.generateSlideUrl(
      "/slide-types/dreambroker",
      params,
      "Dreambroker",
    );
  },

  extractFormData() {
    const getElementValue = (id) => document.getElementById(id)?.value || "";
    const getElementChecked = (id) =>
      document.getElementById(id)?.checked || false;

    return {
      userInputUrl: getElementValue("dreambroker-video-url"),
      muted: getElementChecked("mute-checkbox"),
    };
  },

  validateSlide() {
    const data = this.extractFormData();

    // Validate that a URL is provided
    if (!data.userInputUrl || data.userInputUrl.trim() === "") {
      alert("Please provide a Dreambroker video URL.");
      return false;
    }

    // Validate that the URL is a valid Dreambroker URL
    const videoLink = this.extractVideoLink(data.userInputUrl);
    if (!videoLink) {
      alert(
        "Invalid Dreambroker URL provided. Please use a valid Dreambroker channel URL.",
      );
      return false;
    }

    return true;
  },

  generateSlideData() {
    const config = this.extractFormData();

    return {
      gridWidth: 100,
      gridHeight: 100,
      gridX: 50,
      gridY: 50,
      backgroundColor: "transparent",
      slideTypeId: 4,
      config: config,
      integrationName: "Dreambroker Video",
    };
  },
};
