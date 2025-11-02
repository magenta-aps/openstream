// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

import { BASE_URL } from "./constants.js";
import { genericFetch, parentOrgID } from "./utils.js";

const defaultSettings = {
  bold: true,
  italic: true,
  underline: true,
  fontWeight: true,
};

const FEATURE_TO_API_FIELD = {
  bold: "allow_bold",
  italic: "allow_italic",
  underline: "allow_underline",
  fontWeight: "allow_font_weight",
};

let cachedSettings = { ...defaultSettings };
let inFlightFetch = null;

function mapResponseToSettings(response) {
  if (!response || typeof response !== "object") {
    return { ...defaultSettings };
  }

  return {
    bold:
      typeof response.allow_bold === "boolean"
        ? response.allow_bold
        : defaultSettings.bold,
    italic:
      typeof response.allow_italic === "boolean"
        ? response.allow_italic
        : defaultSettings.italic,
    underline:
      typeof response.allow_underline === "boolean"
        ? response.allow_underline
        : defaultSettings.underline,
    fontWeight:
      typeof response.allow_font_weight === "boolean"
        ? response.allow_font_weight
        : defaultSettings.fontWeight,
  };
}

function mapPartialToApi(partial = {}) {
  const payload = {};
  Object.entries(partial).forEach(([key, value]) => {
    const apiField = FEATURE_TO_API_FIELD[key];
    if (apiField !== undefined) {
      payload[apiField] = Boolean(value);
    }
  });
  return payload;
}

export function getTextFormattingSettings() {
  return { ...cachedSettings };
}

export function isTextFormattingFeatureEnabled(featureKey) {
  if (!featureKey) return true;
  const normalizedKey = String(featureKey).toLowerCase();
  switch (normalizedKey) {
    case "bold":
      return !!cachedSettings.bold;
    case "italic":
      return !!cachedSettings.italic;
    case "underline":
      return !!cachedSettings.underline;
    case "fontweight":
    case "font_weight":
      return !!cachedSettings.fontWeight;
    default:
      return true;
  }
}

export async function fetchTextFormattingSettings(options = {}) {
  const { force = false, organisationId, silent = true } = options;

  if (inFlightFetch && !force) {
    return inFlightFetch;
  }

  inFlightFetch = (async () => {
    const orgId = organisationId || parentOrgID || null;
    if (!orgId) {
      cachedSettings = { ...defaultSettings };
      return getTextFormattingSettings();
    }

    const url = `${BASE_URL}/api/text-formatting-settings/?organisation_id=${orgId}`;

    try {
      const response = await genericFetch(url, "GET");
      cachedSettings = mapResponseToSettings(response);
      return getTextFormattingSettings();
    } catch (error) {
      console.error("Failed to fetch text formatting settings:", error);
      cachedSettings = { ...defaultSettings };
      if (!silent) {
        throw error;
      }
      return getTextFormattingSettings();
    }
  })();

  try {
    return await inFlightFetch;
  } finally {
    inFlightFetch = null;
  }
}

export async function updateTextFormattingSettings(partial, options = {}) {
  const orgId = options.organisationId || parentOrgID || null;
  if (!orgId) {
    throw new Error(
      "Organisation ID is required to update text formatting settings.",
    );
  }

  const payload = mapPartialToApi(partial);
  if (Object.keys(payload).length === 0) {
    return getTextFormattingSettings();
  }

  const url = `${BASE_URL}/api/text-formatting-settings/?organisation_id=${orgId}`;
  const response = await genericFetch(url, "PATCH", payload);
  cachedSettings = mapResponseToSettings(response);
  return getTextFormattingSettings();
}

export function setLocalTextFormattingSettings(partial = {}) {
  cachedSettings = { ...cachedSettings, ...partial };
  return getTextFormattingSettings();
}

export const TEXT_FORMATTING_FEATURES = Object.freeze({
  BOLD: "bold",
  ITALIC: "italic",
  UNDERLINE: "underline",
  FONT_WEIGHT: "fontWeight",
});
