// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { loadSlide, updateSlideElement } from "./renderSlide.js";
import { disposeAllTiptapEditors, disposeEditorForElement } from "../elements/tiptapTextbox.js";

// Helper to check deep equality (simple version for POJOs)
function isDeepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function pushCurrentSlideState() {

  console.log("slide state pushed")

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

  // Capture current state for the redo stack before applying changes
  const currentSnapshot = JSON.parse(JSON.stringify(slide.elements));
  
  // Get the state we want to restore
  const targetSnapshot = slide.undoStack.pop();

  const nextElements = [];
  const currentMap = new Map(slide.elements.map(el => [el.id, el]));
  const targetMap = new Map(targetSnapshot.map(el => [el.id, el]));

  function applyChanges() {
    console.log("Undo Actions:");

    // 1. Handle Removed Elements (Present in current, missing in target)
    // We must remove these from DOM and clean up their editors if applicable
    slide.elements.forEach(el => {
      if (!targetMap.has(el.id)) {
        console.log(`- Element with ID ${el.id} was removed.`);
        document.getElementById("el-" + el.id)?.remove();
        if (el.type === 'tiptap-textbox') {
          disposeEditorForElement(el.id);
        }
      }
    });

    // 2. Handle Added, Modified, and Unchanged Elements
    targetSnapshot.forEach(targetEl => {
      const currentEl = currentMap.get(targetEl.id);

      if (currentEl) {
        // Element exists in both. Check if content changed.
        if (isDeepEqual(currentEl, targetEl)) {
          // UNCHANGED: Optimization - reuse the *current* object reference.
          // This keeps the live editor instance bound to the correct object.
          nextElements.push(currentEl);
        } else {
          // MODIFIED: Use the *target* object (snapshot data).
          // Update DOM. renderSlide will handle cleaning up the old editor and creating a new one.
          console.log(`- Element with ID ${targetEl.id} was modified.`);
          updateSlideElement(targetEl);
          nextElements.push(targetEl);
        }
      } else {
        // ADDED: Use the target object.
        // Render new element to DOM.
        console.log(`- Element with ID ${targetEl.id} was added.`);
        updateSlideElement(targetEl);
        nextElements.push(targetEl);
      }
    });
  }

  applyChanges();

  slide.redoStack.push(currentSnapshot);
  slide.elements = nextElements;

  console.log("After undo, slide.elements count:", slide.elements.length);
}

export function doRedo() {
  console.log("Redo invoked");

  if (store.currentSlideIndex < 0) return;
  const slide = store.slides[store.currentSlideIndex];
  if (!slide.redoStack || slide.redoStack.length === 0) return;
  if (!slide.undoStack) slide.undoStack = [];

  // Capture current state for the undo stack before applying changes
  const currentSnapshot = JSON.parse(JSON.stringify(slide.elements));
  
  // Get the state we want to restore
  const targetSnapshot = slide.redoStack.pop();

  const nextElements = [];
  const currentMap = new Map(slide.elements.map(el => [el.id, el]));
  const targetMap = new Map(targetSnapshot.map(el => [el.id, el]));

  function applyChanges() {
    console.log("Redo Actions:");

    // 1. Handle Removed Elements (Present in current, missing in target)
    slide.elements.forEach(el => {
      if (!targetMap.has(el.id)) {
        console.log(`- Element with ID ${el.id} was removed.`);
        document.getElementById("el-" + el.id)?.remove();
        if (el.type === 'tiptap-textbox') {
          disposeEditorForElement(el.id);
        }
      }
    });

    // 2. Handle Added, Modified, and Unchanged Elements
    targetSnapshot.forEach(targetEl => {
      const currentEl = currentMap.get(targetEl.id);

      if (currentEl) {
        if (isDeepEqual(currentEl, targetEl)) {
          // UNCHANGED: Keep current reference
          nextElements.push(currentEl);
        } else {
          // MODIFIED: Use target data, update DOM
          console.log(`- Element with ID ${targetEl.id} was modified.`);
          updateSlideElement(targetEl);
          nextElements.push(targetEl);
        }
      } else {
        // ADDED: Use target data, update DOM
        console.log(`- Element with ID ${targetEl.id} was added.`);
        updateSlideElement(targetEl);
        nextElements.push(targetEl);
      }
    });
  }

  applyChanges();

  slide.undoStack.push(currentSnapshot);
  slide.elements = nextElements;

  console.log("After redo, slide.elements count:", slide.elements.length);
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