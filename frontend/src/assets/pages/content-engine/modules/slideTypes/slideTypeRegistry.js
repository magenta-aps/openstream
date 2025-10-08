// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * slideTypeRegistry.js
 * Simple frontend slide type system
 ************************************************************/

import { BASE_URL } from "../../../../utils/constants.js";
import {
  token,
  queryParams,
  selectedBranchID,
} from "../../../../utils/utils.js";

const allowedSlideTypes = [];

try {
  // Build headers based on authentication mode
  const headers = {
    "Content-Type": "application/json",
  };

  // Check if we're in slideshow-player mode and have an API key
  if (queryParams.mode === "slideshow-player" && queryParams.apiKey) {
    headers["X-API-KEY"] = queryParams.apiKey;
  } else if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    console.error("No authentication method available for slide types");
    throw new Error("No authentication method available");
  }

  // Build URL based on authentication mode
  let url;
  if (queryParams.mode === "slideshow-player" && queryParams.apiKey) {
    // For API key authentication, no org_id needed - it's derived from the branch
    url = `${BASE_URL}/api/organisations/slide-types/`;
    if (selectedBranchID) {
      url += `?branch_id=${selectedBranchID}`;
    }
  } else {
    // For user authentication, org_id is required
    url = `${BASE_URL}/api/organisations/slide-types/?org_id=${localStorage.getItem("parentOrgID")}`;
  }

  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  if (res.ok) {
    const data = await res.json();
    data.forEach((slideType) => {
      allowedSlideTypes.push(slideType.slide_type_id);
    });
    console.log("Allowed slide types:", allowedSlideTypes);
  } else {
    console.error("Failed to fetch slide types:", res.statusText);
  }
} catch (error) {
  console.error("Error fetching slide types:", error);
}

// Base utility functions for slide types
export const SlideTypeUtils = {
  // Helper to load Handlebars form templates
  async loadFormTemplate(templatePath, errorContext = "Form") {
    try {
      const templateResponse = await fetch(templatePath);

      if (!templateResponse.ok) {
        throw new Error(
          `Failed to fetch form template: ${templateResponse.statusText}`,
        );
      }

      return await templateResponse.text();
    } catch (error) {
      console.error(`Error loading ${errorContext} template:`, error);
      return this.getErrorTemplate(
        `Could not load ${errorContext.toLowerCase()} template: ${error.message}`,
        errorContext,
      );
    }
  },

  // Helper to load template and setup form population with a callback
  async loadFormTemplateWithCallback(
    templatePath,
    errorContext,
    populateCallback,
    delay = 100,
  ) {
    try {
      const formHtml = await this.loadFormTemplate(templatePath, errorContext);

      // Schedule the population callback to run after DOM is ready
      if (populateCallback && typeof populateCallback === "function") {
        setTimeout(populateCallback, delay);
      }

      return formHtml;
    } catch (error) {
      console.error(`Error setting up ${errorContext}:`, error);
      return this.getErrorTemplate(
        `Could not setup ${errorContext.toLowerCase()}: ${error.message}`,
        errorContext,
      );
    }
  },

  // Centralized error template
  getErrorTemplate(errorMessage, slideTypeName = "Slide") {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${slideTypeName} - Error</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0; 
              background-color: #f8f9fa;
            }
            .error-container {
              text-align: center;
              padding: 2rem;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              max-width: 400px;
            }
            .error-title {
              color: #dc3545;
              margin-bottom: 1rem;
            }
            .error-message {
              color: #6c757d;
            }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h2 class="error-title">Template Loading Error</h2>
            <p class="error-message">${errorMessage}</p>
          </div>
        </body>
      </html>
    `;
  },

  // Generate slide URL with error fallback
  generateSlideUrl(templatePath, params = {}, slideTypeName = "Slide") {
    try {
      const urlParams = new URLSearchParams(params);

      const templateUrl = `${templatePath}?${urlParams.toString()}`;

      return templateUrl;
    } catch (error) {
      console.error(`Error generating ${slideTypeName} slide URL:`, error);
      return `data:text/html,${encodeURIComponent(this.getErrorTemplate(error.message, slideTypeName))}`;
    }
  },

  // Common form validation helper
  validateRequired(fields, fieldLabels) {
    for (const [fieldName, value] of Object.entries(fields)) {
      if (!value || value.toString().trim() === "") {
        const label = fieldLabels[fieldName] || fieldName;
        alert(`Please provide a ${label}.`);
        return false;
      }
    }
    return true;
  },

  // Helper to set up event listeners with cleanup
  setupEventListener(elementId, event, handler, context) {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`Element with ID '${elementId}' not found`);
      return null;
    }

    // Store bound handler for cleanup
    const boundHandler = handler.bind(context);
    element.addEventListener(event, boundHandler);

    return {
      element,
      handler: boundHandler,
      cleanup: () => element.removeEventListener(event, boundHandler),
    };
  },

  // Common defaults for slide types
  getDefaultSlideSettings() {
    return {
      gridWidth: 150,
      gridHeight: 150,
      gridX: 25,
      gridY: 25,
      backgroundColor: "transparent",
    };
  },
};

class SlideTypeRegistry {
  constructor() {
    this.slideTypes = new Map();
    this.categories = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    // Define categories
    this.registerCategory(1, {
      name: "API & RSS",
      materialIcon: "event",
    });

    this.registerCategory(2, {
      name: "Video",
      materialIcon: "movie",
    });

    this.registerCategory(3, {
      name: "Newsfeed",
      materialIcon: "article",
    });

    this.registerCategory(4, {
      name: "Widgets",
      materialIcon: "widgets",
    });

    this.registerCategory(5, {
      name: "DR News Feed",
      materialIcon: "news",
    });

    // Load slide types
    await this.loadSlideTypes();

    this.initialized = true;
  }

  registerCategory(id, categoryData) {
    this.categories.set(id, {
      id,
      ...categoryData,
      slideTypes: [],
    });
  }

  registerSlideType(id, slideTypeData) {
    this.slideTypes.set(id, {
      id,
      ...slideTypeData,
    });

    // Add to category
    const category = this.categories.get(slideTypeData.categoryId);
    if (category) {
      category.slideTypes.push({
        id,
        ...slideTypeData,
      });
    }
  }

  getCategories() {
    return Array.from(this.categories.values());
  }

  getAllowedSlideTypes() {
    return allowedSlideTypes;
  }

  getSlideType(id) {
    return this.slideTypes.get(id);
  }

  async generateForm(slideTypeId, existingConfig = null) {
    const slideType = this.slideTypes.get(slideTypeId);
    if (!slideType) {
      throw new Error(`Slide type ${slideTypeId} not found`);
    }

    return await slideType.generateForm(existingConfig);
  }

  async generateSlide(slideTypeId, config) {
    const slideType = this.slideTypes.get(slideTypeId);
    if (!slideType) {
      throw new Error(`Slide type ${slideTypeId} not found`);
    }

    return await slideType.generateSlide(config);
  }

  extractFormData(slideTypeId) {
    const slideType = this.slideTypes.get(slideTypeId);
    if (!slideType) return {};

    return slideType.extractFormData();
  }

  validateSlide(slideTypeId) {
    const slideType = this.slideTypes.get(slideTypeId);
    if (!slideType) return false;

    return slideType.validateSlide();
  }

  generateSlideData(slideTypeId) {
    const slideType = this.slideTypes.get(slideTypeId);
    if (!slideType) return null;

    return slideType.generateSlideData();
  }

  // Cleanup method for slide types that need it
  cleanupSlideType(slideTypeId) {
    const slideType = this.slideTypes.get(slideTypeId);
    if (
      slideType &&
      typeof slideType.cleanupFormEventListeners === "function"
    ) {
      slideType.cleanupFormEventListeners();
    }
  }

  async loadSlideTypes() {
    // Import and register slide types from their own files
    await this.loadSlideTypesFromFiles();
  }

  async loadSlideTypesFromFiles() {
    try {
      // Import DDB Events API slide type
      const { DdbEventsApiSlideType } = await import(
        "./types/ddbEventsApiSlideType.js"
      );
      this.registerSlideType(1, DdbEventsApiSlideType);

      // Import Newsfeed with Image slide type
      const { NewsfeedWithImageSlideType } = await import(
        "./types/newsfeedWithImageSlideType.js"
      );
      this.registerSlideType(3, NewsfeedWithImageSlideType);

      // Import Dreambroker slide type
      const { DreambrokerSlideType } = await import(
        "./types/dreambrokerSlideType.js"
      );
      this.registerSlideType(4, DreambrokerSlideType);

      // Import Newsticker slide type
      const { NewstickerSlideType } = await import(
        "./types/newstickerSlideType.js"
      );
      this.registerSlideType(5, NewstickerSlideType);

      // Import Clock slide type
      const { ClockSlideType } = await import("./types/clockSlideType.js");
      this.registerSlideType(7, ClockSlideType);

      // Import DR Streams slide type
      const { DrStreamsSlideType } = await import(
        "./types/drStreamsSlideType.js"
      );
      this.registerSlideType(8, DrStreamsSlideType);

      // Import WinKAS slide type
      const { WinkasSlideType } = await import("./types/winkasSlideType.js");
      this.registerSlideType(11, WinkasSlideType);

      // Import KMD Foreningsportalen slide type
      const { KmdForeningsportalenSlideType } = await import(
        "./types/kmdForeningsportalenSlideType.js"
      );
      this.registerSlideType(9, KmdForeningsportalenSlideType);

      // Import Speed Admin slide type
      const { SpeedAdminSlideType } = await import(
        "./types/speedAdminSlideType.js"
      );
      this.registerSlideType(6, SpeedAdminSlideType);

      // Import Frontdesk LTK Borgerservice slide type
      const { FrontdeskLtkBorgerserviceSlideType } = await import(
        "./types/frontdeskLtkBorgerserviceSlideType.js"
      );
      this.registerSlideType(10, FrontdeskLtkBorgerserviceSlideType);
    } catch (error) {
      console.warn("Some slide types could not be loaded:", error);
    }
  }
}

// Create singleton instance
export const slideTypeRegistry = new SlideTypeRegistry();
