// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

import { gettext } from "./locales";

export const ORIENTATION = {
  LANDSCAPE: "landscape",
  PORTRAIT: "portrait",
  SQUARE: "square",
};

const ORIENTATION_LABEL = {
  [ORIENTATION.LANDSCAPE]: "Landscape",
  [ORIENTATION.PORTRAIT]: "Portrait",
  [ORIENTATION.SQUARE]: "Square",
};

const SMALL_MENU_PREVIEW_MAX_DIMENSION = 160;
const MEDIUM_MENU_PREVIEW_MAX_DIMENSION = 240;

function calculatePreviewDimensions(width, height, maxDimension) {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) {
    return { width: maxDimension, height: maxDimension };
  }

  if (width >= height) {
    const scaledHeight = Math.round((height / width) * maxDimension);
    return { width: maxDimension, height: Math.max(scaledHeight, 1) };
  }

  const scaledWidth = Math.round((width / height) * maxDimension);
  return { width: Math.max(scaledWidth, 1), height: maxDimension };
}

function buildLabel(ratioValue, orientation, noteKey) {
  const orientationKey = ORIENTATION_LABEL[orientation] || "";
  const orientationText = orientationKey ? gettext(orientationKey) : "";
  const noteText = noteKey ? gettext(noteKey) : "";
  const suffix = noteText ? ` - ${noteText}` : "";
  return `${ratioValue} (${orientationText}${suffix})`;
}

function invertRatioString(value) {
  if (!value || typeof value !== "string") {
    return value;
  }

  const parts = value.split(":").map((part) => part.trim());
  if (parts.length !== 2) {
    return value;
  }

  return `${parts[1]}:${parts[0]}`;
}

const BASE_ASPECT_RATIOS = [
  {
    value: "16:9",
    width: 1920,
    height: 1080,
    note: "Most Common",
    inUI: true,
    isDefault: true,
  },
  {
    value: "4:3",
    width: 1024,
    height: 768,
    note: "Common on old monitors",
    inUI: true,
  },
  {
    value: "21:9",
    width: 3440,
    height: 1440,
    note: "Ultrawide",
    inUI: true,
  },
  {
    value: "1.85:1",
    width: 1998,
    height: 1080,
    note: "Cinema",
    inUI: true,
  },
  {
    value: "2.39:1",
    width: 2048,
    height: 858,
    note: "Ultra Widescreen",
    inUI: true,
  },
];

function createDefinitionsForBase(baseRatio) {
  const {
    value,
    width,
    height,
    note = "",
    inUI = true,
    isDefault = false,
    allowPortrait = true,
  } = baseRatio;

  const isSquare = Math.round(width) === Math.round(height);
  const definitions = [];

  const landscapeSmallPreview = calculatePreviewDimensions(
    width,
    height,
    SMALL_MENU_PREVIEW_MAX_DIMENSION,
  );
  const landscapeMediumPreview = calculatePreviewDimensions(
    width,
    height,
    MEDIUM_MENU_PREVIEW_MAX_DIMENSION,
  );

  definitions.push({
    value,
    width,
    height,
    orientation: isSquare ? ORIENTATION.SQUARE : ORIENTATION.LANDSCAPE,
    noteKey: note,
    get note() {
      return this.noteKey ? gettext(this.noteKey) : "";
    },
    get label() {
      return buildLabel(
        this.value,
        this.orientation,
        this.noteKey,
      );
    },
    inUI,
    isDefault,
    smallMenuPreviewWidth: landscapeSmallPreview.width,
    smallMenuPreviewHeight: landscapeSmallPreview.height,
    mediumMenuPreviewWidth: landscapeMediumPreview.width,
    mediumMenuPreviewHeight: landscapeMediumPreview.height,
  });

  if (!isSquare && allowPortrait) {
    const swappedWidth = height;
    const swappedHeight = width;
    const portraitValue = invertRatioString(value);
    const portraitSmallPreview = calculatePreviewDimensions(
      swappedWidth,
      swappedHeight,
      SMALL_MENU_PREVIEW_MAX_DIMENSION,
    );
    const portraitMediumPreview = calculatePreviewDimensions(
      swappedWidth,
      swappedHeight,
      MEDIUM_MENU_PREVIEW_MAX_DIMENSION,
    );

    definitions.push({
      value: portraitValue,
      width: swappedWidth,
      height: swappedHeight,
      orientation: ORIENTATION.PORTRAIT,
      noteKey: note,
      get note() {
        return this.noteKey ? gettext(this.noteKey) : "";
      },
      get label() {
        return buildLabel(
          this.value,
          this.orientation,
          this.noteKey,
        );
      },
      inUI,
      isDefault: false,
      smallMenuPreviewWidth: portraitSmallPreview.width,
      smallMenuPreviewHeight: portraitSmallPreview.height,
      mediumMenuPreviewWidth: portraitMediumPreview.width,
      mediumMenuPreviewHeight: portraitMediumPreview.height,
    });
  }

  return definitions;
}

export const AVAILABLE_ASPECT_RATIOS = BASE_ASPECT_RATIOS.flatMap(
  createDefinitionsForBase,
);

const ratioValueToDefinition = new Map(
  AVAILABLE_ASPECT_RATIOS.map((ratio) => [ratio.value, ratio]),
);

const defaultRatioDefinition =
  AVAILABLE_ASPECT_RATIOS.find((ratio) => ratio.isDefault) ||
  AVAILABLE_ASPECT_RATIOS[0];

export const DEFAULT_ASPECT_RATIO = defaultRatioDefinition.value;

export const DISPLAYABLE_ASPECT_RATIOS = AVAILABLE_ASPECT_RATIOS.filter(
  (ratio) => ratio.inUI,
);

export function getAspectRatioDefinition(value) {
  return ratioValueToDefinition.get(value) || null;
}

export function getResolutionForAspectRatio(value) {
  const definition = ratioValueToDefinition.get(value) || defaultRatioDefinition;
  return { width: definition.width, height: definition.height };
}

export function findAspectRatioValueByDimensions(width, height) {
  const exactMatch = AVAILABLE_ASPECT_RATIOS.find(
    (ratio) => ratio.width === width && ratio.height === height,
  );
  if (exactMatch) {
    return exactMatch.value;
  }

  const divisor = greatestCommonDivisor(width, height);
  if (divisor === 0) {
    return `${width}:${height}`;
  }
  const reducedWidth = Math.round(width / divisor);
  const reducedHeight = Math.round(height / divisor);
  return `${reducedWidth}:${reducedHeight}`;
}

export function getAspectRatiosByOrientation(orientation) {
  return DISPLAYABLE_ASPECT_RATIOS.filter(
    (ratio) => ratio.orientation === orientation,
  );
}

export function isAspectRatioSupported(value) {
  return ratioValueToDefinition.has(value);
}

function greatestCommonDivisor(a, b) {
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  if (absA === 0) {
    return absB;
  }
  if (absB === 0) {
    return absA;
  }
  let x = absA;
  let y = absB;
  while (y !== 0) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x;
}
