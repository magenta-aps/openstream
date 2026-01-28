// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { loadSlide, updateSlideElement } from "./renderSlide.js";
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

  function showChanges() {
    const latestState = slide.undoStack[slide.undoStack.length - 1];
    const prevElementIds = new Set(currentSnapshot.map(el => el.id));
    const newElementIds = new Set(latestState.map(el => el.id));

    console.log("Removed Elements:");
    prevElementIds.forEach(id => {
      if (!newElementIds.has(id)) {
        console.log(`- Element with ID ${id} was removed.`);
        document.getElementById("el-" + id)?.remove();
      }
    });

    console.log("Added Elements:");
    latestState.forEach(newEl => {
      if (!prevElementIds.has(newEl.id)) {
        console.log(`- Element with ID ${newEl.id} was added.`);
        updateSlideElement(newEl);
      }
    });

    console.log("Modified Elements:");
    latestState.forEach(newEl => {
      const prevEl = currentSnapshot.find(el => el.id === newEl.id);
      // If it existed before and the data has changed
      if (prevEl && JSON.stringify(prevEl) !== JSON.stringify(newEl)) {
        console.log(`- Element with ID ${newEl.id} was modified.`);
        updateSlideElement(newEl);
      }
    });
  }

  showChanges();

  slide.redoStack.push(currentSnapshot);

  slide.elements = slide.undoStack.pop();

  console.log("After undo, slide.elements:", JSON.parse(JSON.stringify(slide.elements)));
}

export function doRedo() {
  console.log("Redo invoked");

  if (store.currentSlideIndex < 0) return;
  const slide = store.slides[store.currentSlideIndex];
  if (!slide.redoStack || slide.redoStack.length === 0) return;
  if (!slide.undoStack) slide.undoStack = [];

  // 1. Clean up active editors before swapping state
  disposeAllTiptapEditors(false);

  const currentSnapshot = JSON.parse(JSON.stringify(slide.elements));
  const nextState = slide.redoStack.pop();

  // 2. Diffing logic to update the DOM without a full reload
  function showChanges() {
    const prevElementIds = new Set(currentSnapshot.map(el => el.id));
    const nextElementIds = new Set(nextState.map(el => el.id));

    console.log("Redo - Removed Elements:");
    prevElementIds.forEach(id => {
      if (!nextElementIds.has(id)) {
        console.log(`- Element with ID ${id} was removed.`);
        document.getElementById("el-" + id)?.remove();
      }
    });

    console.log("Redo - Added Elements:");
    nextState.forEach(nextEl => {
      if (!prevElementIds.has(nextEl.id)) {
        console.log(`- Element with ID ${nextEl.id} was added.`);
        updateSlideElement(nextEl);
      }
    });

    console.log("Redo - Modified Elements:");
    nextState.forEach(nextEl => {
      const prevEl = currentSnapshot.find(el => el.id === nextEl.id);
      if (prevEl && JSON.stringify(prevEl) !== JSON.stringify(nextEl)) {
        console.log(`- Element with ID ${nextEl.id} was modified.`);
        updateSlideElement(nextEl);
      }
    });
  }

  showChanges();

  // 3. Update the stacks and the store
  slide.undoStack.push(currentSnapshot);
  slide.elements = nextState;

  console.log("After redo, slide.elements:", JSON.parse(JSON.stringify(slide.elements)));
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
