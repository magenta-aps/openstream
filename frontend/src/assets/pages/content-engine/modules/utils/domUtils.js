// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";

// Helper function to get all persistent elements across all slides
export function getAllPersistentElements() {
  const persistentElements = [];
  store.slides.forEach((slide) => {
    slide.elements.forEach((element) => {
      if (element.isPersistent) {
        persistentElements.push(element);
      }
    });
  });
  return persistentElements;
}

// Helper function to get all elements that should be considered for zIndex calculation
export function getAllRelevantElements() {
  if (store.currentSlideIndex < 0) return [];

  // Get elements from current slide
  const currentSlideElements =
    store.slides[store.currentSlideIndex].elements || [];

  // Get all persistent elements from all slides
  const persistentElements = getAllPersistentElements();

  // Combine and deduplicate by element id
  const allElements = [...currentSlideElements];
  persistentElements.forEach((persistent) => {
    // Only add if not already in current slide elements
    if (!allElements.some((el) => el.id === persistent.id)) {
      allElements.push(persistent);
    }
  });

  return allElements;
}

export function getNewZIndex() {
  const allElements = getAllRelevantElements();
  if (allElements.length === 0) return 1;
  const nonAlwaysElements = allElements.filter((el) => !el.isAlwaysOnTop);
  if (nonAlwaysElements.length === 0) return 1;
  return Math.max(...nonAlwaysElements.map((el) => el.zIndex || 1)) + 1;
}
