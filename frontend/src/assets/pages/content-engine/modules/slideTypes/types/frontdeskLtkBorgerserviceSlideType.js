// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * frontdeskLtkBorgerserviceSlideType.js
 * Frontdesk LTK Borgerservice queue display slide type definition
 ************************************************************/

import { BASE_URL } from "../../../../../utils/constants.js";
import { translateHTML } from "../../../../../utils/locales.js";
import { SlideTypeUtils } from "../slideTypeRegistry.js";
import * as bootstrap from "bootstrap";

export const FrontdeskLtkBorgerserviceSlideType = {
  name: "Frontdesk LTK Borgerservice",
  description: "Display live frontdesk queue for LTK Borgerservice",
  categoryId: 1,

  ...SlideTypeUtils.getDefaultSlideSettings(),

  _apiKey: null,

  async fetchApiKey() {
    if (this._apiKey) return this._apiKey;

    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(
        `${BASE_URL}/api/frontdesk_ltk_borgerservice_api_key`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch API key: ${response.statusText}`);
      }

      const data = await response.json();
      this._apiKey = data.apiKey;
      return this._apiKey;
    } catch (error) {
      console.error("Error fetching API key:", error);
      return null;
    }
  },

  getDefaultConfig(existingConfig = {}) {
    // This integration doesn't have configurable options
    const config = existingConfig || {};
    return {};
  },

  async generateForm(existingConfig = null) {
    try {
      // Try to fetch the API key to verify it's available
      const apiKey = await this.fetchApiKey();
      if (!apiKey) {
        return SlideTypeUtils.getErrorTemplate(
          "Could not retrieve Frontdesk API key. Please contact your administrator.",
          "Frontdesk LTK Borgerservice",
        );
      }

      return await SlideTypeUtils.loadFormTemplateWithCallback(
        "/slide-types/frontdesk-ltk-borgerservice-form",
        "Frontdesk LTK Borgerservice Form",
        () => {
          translateHTML(); // Translate after loading template
          this.setupFormEventListeners();
        },
      );
    } catch (error) {
      console.error(
        "Error generating Frontdesk LTK Borgerservice form:",
        error,
      );
      return SlideTypeUtils.getErrorTemplate(
        `Could not initialize Frontdesk LTK Borgerservice form: ${error.message}`,
        "Frontdesk LTK Borgerservice Form",
      );
    }
  },

  setupFormEventListeners() {
    // Attach handler to the centralized Generate Slide button in the modal
    // This avoids duplicate buttons and ensures the modal flow is used.
    const generateBtn = document.getElementById("generateSlideBtn");
    if (!generateBtn) {
      // Modal/button may not be rendered yet; retry shortly
      setTimeout(() => this.setupFormEventListeners(), 100);
      return;
    }

    // If listeners were previously registered, remove them first so we don't
    // accumulate multiple handlers across repeated form renders.
    if (this.eventListenerCleanup && Array.isArray(this.eventListenerCleanup)) {
      try {
        this.eventListenerCleanup.forEach((cleanup) => cleanup());
      } catch (e) {
        // ignore
      }
    }
    // Store cleanup functions
    this.eventListenerCleanup = [];

    const addQueueHandler = async (evt) => {
      // prevent the modal's central generate handler from running after we
      // handle the frontdesk embed. This avoids duplicate flows and errors
      // like "window.selectedElementForUpdate.querySelector is not a function".
      if (evt) {
        try {
          // stop other listeners on the same element
          typeof evt.stopImmediatePropagation === "function" &&
            evt.stopImmediatePropagation();
          // stop the event from bubbling to the modal's delegated handler
          typeof evt.stopPropagation === "function" && evt.stopPropagation();
          evt.preventDefault && evt.preventDefault();
        } catch (e) {
          // ignore
        }
      }

      try {
        const apiKey = await this.fetchApiKey();
        if (!apiKey) {
          console.error(
            "Could not retrieve API key for Frontdesk LTK Borgerservice",
          );
          // close the modal anyway so the user isn't left with a duplicate flow
          this._hideModal();
          return;
        }

        const url = `https://clientdevicebrowser.frontdesksuite.com/ltk?clientIdentifier=${apiKey}`;

        // Use the global embed website function to add the element (best-effort)
        try {
          if (window.addEmbedWebsiteElementToSlide) {
            window.addEmbedWebsiteElementToSlide(url);
          } else {
            console.error(
              "addEmbedWebsiteElementToSlide function not available",
            );
          }
        } catch (err) {
          console.error("addEmbedWebsiteElementToSlide threw:", err);
        }

        // Close any modal that might be open regardless of success to avoid
        // leaving the modal open or running the modal's generate flow.
        // Attempt to hide the modal via a robust helper that falls back
        // to direct DOM cleanup if the Bootstrap instance isn't reachable.
        this._hideModal();
      } catch (error) {
        // Log, but do not alert — user prefers no popup; close modal to finish flow.
        console.error("Error adding frontdesk queue display:", error);
        this._hideModal();
      }
    };

    // Keep a direct reference so cleanup can remove this specific handler
    this._addQueueHandler = addQueueHandler;
    generateBtn.addEventListener("click", this._addQueueHandler);
    this.eventListenerCleanup.push(() =>
      generateBtn.removeEventListener("click", this._addQueueHandler),
    );
  },

  cleanupFormEventListeners() {
    // Call any registered cleanup functions
    if (this.eventListenerCleanup) {
      try {
        this.eventListenerCleanup.forEach((cleanup) => cleanup());
      } catch (e) {
        // ignore
      }
      this.eventListenerCleanup = null;
    }

    // Also attempt to remove the stored handler reference directly if present
    try {
      const generateBtn = document.getElementById("generateSlideBtn");
      if (generateBtn && this._addQueueHandler) {
        generateBtn.removeEventListener("click", this._addQueueHandler);
      }
    } catch (e) {
      // ignore
    }
    this._addQueueHandler = null;
    this._apiKey = null;
  },

  // Hide the currently open modal. Tries to use Bootstrap's Modal instance
  // if available, otherwise falls back to manual DOM cleanup so the modal
  // reliably closes in environments where the bootstrap module instance
  // isn't reachable from this file's scope.
  _hideModal() {
    try {
      console.debug("[Frontdesk] _hideModal() called");
      // Try Bootstrap path first (may reference global bootstrap)
      if (bootstrap && bootstrap.Modal && bootstrap.Modal.getOrCreateInstance) {
        const modalEl =
          document.querySelector(".modal.show") ||
          document.getElementById("frontendSlideTypeModal");
        console.debug("[Frontdesk] bootstrap path - modalEl:", modalEl);
        if (modalEl) {
          const inst = bootstrap.Modal.getOrCreateInstance(modalEl);
          console.debug("[Frontdesk] bootstrap instance:", inst);
          if (inst && typeof inst.hide === "function") {
            console.debug("[Frontdesk] calling bootstrap.hide()");
            inst.hide();
            return;
          }
        }
      }
    } catch (e) {
      console.debug("[Frontdesk] bootstrap hide failed:", e);
      // ignore and fall back to DOM cleanup
    }

    console.debug("[Frontdesk] falling back to DOM cleanup");
    // Fallback: remove show/display/backdrop and reset body class
    const modalEl =
      document.querySelector(".modal.show") ||
      document.getElementById("frontendSlideTypeModal");
    console.debug("[Frontdesk] DOM modalEl:", modalEl);
    if (modalEl) {
      modalEl.classList.remove("show");
      modalEl.style.display = "none";
      modalEl.setAttribute("aria-hidden", "true");
    }
    try {
      document.body.classList.remove("modal-open");
    } catch (e) {
      // ignore
    }
    document.querySelectorAll(".modal-backdrop").forEach((b) => b.remove());
  },

  async generateSlide(config) {
    // This integration creates embed website elements instead of custom slides
    // So this method shouldn't be called, but we'll provide a fallback
    const apiKey = await this.fetchApiKey();
    if (!apiKey) {
      return SlideTypeUtils.getErrorTemplate(
        "Could not retrieve API key for Frontdesk LTK Borgerservice",
        "Frontdesk LTK Borgerservice",
      );
    }

    const url = `https://clientdevicebrowser.frontdesksuite.com/ltk?clientIdentifier=${apiKey}`;
    return SlideTypeUtils.generateSlideUrl(
      "about:blank",
      { url },
      "Frontdesk LTK Borgerservice",
    );
  },

  extractFormData() {
    // No form data to extract for this integration
    return {};
  },

  validateSlide() {
    // No validation needed - the API key fetch handles the validation
    return true;
  },

  generateSlideData() {
    // This integration creates embed website elements, not slide data
    const defaults = SlideTypeUtils.getDefaultSlideSettings();

    return {
      gridWidth: defaults.gridWidth,
      gridHeight: defaults.gridHeight,
      gridX: defaults.gridX,
      gridY: defaults.gridY,
      backgroundColor: defaults.backgroundColor,
      slideTypeId: 10,
      config: {},
      integrationName: "Frontdesk LTK Borgerservice",
    };
  },
};
