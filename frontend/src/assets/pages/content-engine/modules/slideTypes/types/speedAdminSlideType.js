// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
/************************************************************
 * speedAdminSlideType.js
 * Speed Admin School Schedule slide type definition
 ************************************************************/

import { BASE_URL } from "../../../../../utils/constants.js";
import { gettext, translateHTML } from "../../../../../utils/locales.js";
import { SlideTypeUtils } from "../slideTypeRegistry.js";

export const SpeedAdminSlideType = {
  name: "Speed Admin",
  description: "Display daily school schedules from Speed Admin system",
  categoryId: 1,

  ...SlideTypeUtils.getDefaultSlideSettings(),

  _schoolsData: null,

  async fetchSchoolsData() {
    if (this._schoolsData) return this._schoolsData;

    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${BASE_URL}/api/speedadmin/schools`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch schools data: ${response.statusText}`);
      }

      this._schoolsData = await response.json();
      return this._schoolsData;
    } catch (error) {
      console.error("Error fetching schools data:", error);
      return [];
    }
  },

  getDefaultConfig(existingConfig = {}) {
    const config = existingConfig || {};
    return {
      location_name: config.location_name || "",
    };
  },

  async generateForm(existingConfig = null) {
    try {
      const schoolsData = await this.fetchSchoolsData();
      this.currentSchoolsData = schoolsData;
      const config = this.getDefaultConfig(existingConfig);

      return await SlideTypeUtils.loadFormTemplateWithCallback(
        "/slide-types/speed-admin-form",
        "Speed Admin Form",
        () => {
          translateHTML(); // Translate after loading template
          this.populateFormData(config);
          this.setupFormEventListeners();
        },
      );
    } catch (error) {
      console.error("Error generating Speed Admin form:", error);
      return SlideTypeUtils.getErrorTemplate(
        `Could not initialize Speed Admin form: ${error.message}`,
        "Speed Admin Form",
      );
    }
  },

  populateFormData(config) {
    this.populateSchoolOptions(config.location_name);
  },

  populateSchoolOptions(selectedSchool) {
    const schoolSelect = document.getElementById("location_name-input");
    if (!schoolSelect || !this.currentSchoolsData) return;

    schoolSelect.innerHTML = `<option disabled selected>${gettext("Select a location...")}</option>`;

    this.currentSchoolsData.forEach((school) => {
      const option = document.createElement("option");
      option.value = school;
      option.textContent = school;
      option.selected = school === selectedSchool;
      schoolSelect.appendChild(option);
    });
  },

  setupFormEventListeners() {
    const schoolSelect = document.getElementById("location_name-input");

    if (!schoolSelect) {
      setTimeout(() => this.setupFormEventListeners(), 100);
      return;
    }

    // Store cleanup functions
    this.eventListenerCleanup = [];

    // No additional event listeners needed for this simple form
    // Just keeping the structure consistent with other slide types
  },

  cleanupFormEventListeners() {
    if (this.eventListenerCleanup) {
      this.eventListenerCleanup.forEach((cleanup) => cleanup());
      this.eventListenerCleanup = null;
    }
    this.currentSchoolsData = null;
  },

  async generateSlide(config) {
    const params = {
      location_name: config.location_name || "",
    };

    return SlideTypeUtils.generateSlideUrl(
      "/slide-types/speed-admin",
      params,
      "Speed Admin Schedule",
    );
  },

  extractFormData() {
    const schoolSelect = document.getElementById("location_name-input");

    return {
      location_name: schoolSelect?.value || "",
    };
  },

  validateSlide() {
    const data = this.extractFormData();

    // Check if school is selected
    if (!data.location_name) {
      alert("Please select a school.");
      return false;
    }

    return true;
  },

  generateSlideData() {
    const config = this.extractFormData();
    const defaults = SlideTypeUtils.getDefaultSlideSettings();

    return {
      gridWidth: defaults.gridWidth,
      gridHeight: defaults.gridHeight,
      gridX: defaults.gridX,
      gridY: defaults.gridY,
      backgroundColor: defaults.backgroundColor,
      slideTypeId: 6,
      config: config,
      integrationName: "Speed Admin",
    };
  },
};
