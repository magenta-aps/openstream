// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { loadSlide } from "./renderSlide.js";
import { disposeAllTiptapEditors } from "../elements/tiptapTextbox.js";

export function pushCurrentSlideState() {
  if (store.currentSlideIndex < 0) return;
  const slide = store.slides[store.currentSlideIndex];
  if (!slide.undoStack) slide.undoStack = [];
  if (!slide.redoStack) slide.redoStack = [];
  const snapshot = JSON.parse(JSON.stringify(slide.elements));
  slide.undoStack.push(snapshot);
  if (slide.undoStack.length > 50) {
    slide.undoStack.shift();
  }
  slide.redoStack = [];
}

export function doUndo() {
  if (store.currentSlideIndex < 0) return;
  const slide = store.slides[store.currentSlideIndex];
  if (!slide.undoStack || slide.undoStack.length === 0) return;
  if (!slide.redoStack) slide.redoStack = [];

  disposeAllTiptapEditors(false);

  const currentSnapshot = JSON.parse(JSON.stringify(slide.elements));
  slide.redoStack.push(currentSnapshot);

  slide.elements = slide.undoStack.pop();

  loadSlide(slide, undefined, undefined, true);

  store.selectedElement = null;
  store.selectedElementData = null;
  window.selectedElementForUpdate = null;
}

export function doRedo() {
  if (store.currentSlideIndex < 0) return;
  const slide = store.slides[store.currentSlideIndex];
  if (!slide.redoStack || slide.redoStack.length === 0) return;
  if (!slide.undoStack) slide.undoStack = [];

  disposeAllTiptapEditors(false);

  const currentSnapshot = JSON.parse(JSON.stringify(slide.elements));
  slide.undoStack.push(currentSnapshot);

  slide.elements = slide.redoStack.pop();

  loadSlide(slide, undefined, undefined, true);

  store.selectedElement = null;
  store.selectedElementData = null;
  window.selectedElementForUpdate = null;
}

export function initUndoRedo() {
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");

  if (!undoBtn || !redoBtn) return;

  undoBtn.addEventListener("click", doUndo);
  redoBtn.addEventListener("click", doRedo);

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, [contenteditable]")) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      if (e.shiftKey) {
        doRedo();
      } else {
        doUndo();
      }
      e.preventDefault();
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      doRedo();
      e.preventDefault();
    }
  });
}
