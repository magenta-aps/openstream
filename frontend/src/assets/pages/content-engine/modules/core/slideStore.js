// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
export const store = {
  slides: [],
  lastSlidesStr: JSON.stringify([]),

  currentSlideIndex: -1,
  lastSlideIndex: null,
  slideIdCounter: 1,
  elementIdCounter: 1,

  selectedElement: null,
  selectedElementData: null,

  dynamicContentUpdateMode: false,
  dynamicContentUpdateElement: null,

  emulatedWidth: null,
  emulatedHeight: null,
  currentScale: 1,
  showGrid: false,

  selectedVideoId: null,
  selectedImgId: null,

  slideshowMode: null,

  currentTemplateSlideIndex: null,
  // UI flags
  showElementIndicators: true,
  // Player-mode runtime state (set when entering fullscreen/player mode)
  playerModeState: null,
  // Resolver for slideshow exit when info box is not used
  resolveSlideshowExit: null,
};
