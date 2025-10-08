// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * drStreamsSlideType.js
 * DR Video Streams slide type definition
 ************************************************************/

import { SlideTypeUtils } from "../slideTypeRegistry.js";

export const DrStreamsSlideType = {
  name: "DR Video Streams",
  description: "Live video streams from Danish Broadcasting Corporation",
  categoryId: 5, // DR Video Streams category

  ...SlideTypeUtils.getDefaultSlideSettings(),

  getDefaultConfig(existingConfig = {}) {
    const config = existingConfig || {};
    return {
      channel_url:
        config.channel_url ||
        "https://drlivedr1hls.akamaized.net/hls/live/2113625/drlivedr1/6.m3u8",
      mute: config.mute !== false, // Default to muted
    };
  },

  async generateForm(existingConfig = null) {
    try {
      const config = this.getDefaultConfig(existingConfig);

      return await SlideTypeUtils.loadFormTemplateWithCallback(
        "/slide-types/dr-streams-form",
        "DR Streams Form",
        () => {
          this.populateFormData(config);
          this.setupFormEventListeners();
        },
      );
    } catch (error) {
      console.error("Error generating DR Streams form:", error);
      return SlideTypeUtils.getErrorTemplate(
        `Could not initialize DR Streams form: ${error.message}`,
        "DR Streams Form",
      );
    }
  },

  populateFormData(config) {
    // Set channel selection
    this.setElementValue("choose-channel", config.channel_url);

    // Set mute toggle
    this.setElementValue("mute-toggle", config.mute ? "muted" : "sound");
  },

  setElementValue(selector, value) {
    const element =
      document.getElementById(selector) || document.querySelector(selector);
    if (element) element.value = value;
  },

  setupFormEventListeners() {
    // No specific event listeners needed for this slide type
    // but keeping the structure for consistency
  },

  cleanupFormEventListeners() {
    // No cleanup needed for this slide type
  },

  async generateSlide(config) {
    const params = {
      channel_url:
        config.channel_url ||
        "https://drlivedr1hls.akamaized.net/hls/live/2113625/drlivedr1/6.m3u8",
      mute: config.mute ? "true" : "false",
    };

    return SlideTypeUtils.generateSlideUrl(
      "/slide-types/dr-streams",
      params,
      "DR Streams",
    );
  },

  extractFormData() {
    const getElementValue = (id) => document.getElementById(id)?.value || "";

    const channelUrl = getElementValue("choose-channel");
    const muteValue = getElementValue("mute-toggle");

    return {
      channel_url: channelUrl,
      mute: muteValue === "muted",
    };
  },

  validateSlide() {
    const data = this.extractFormData();

    // Validate that a channel is selected
    if (!data.channel_url) {
      alert("Please select a DR channel.");
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
  slideTypeId: 8,
      config: config,
      integrationName: "DR Streams",
    };
  },
};
