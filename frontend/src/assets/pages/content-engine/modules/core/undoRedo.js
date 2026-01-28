// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { loadSlide, updateSlideElement } from "./renderSlide.js";
import { disposeAllTiptapEditors } from "../elements/tiptapTextbox.js";

export function pushCurrentSlideState(elementId = null) {

  console.log(elementId)

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

  console.log("Before undo, slide.elements:", JSON.parse(JSON.stringify(slide.elements)));

  function showChanges(){
    const prevElementIds = new Set(currentSnapshot.map(el => el.id));
    const newElementIds = new Set(slide.undoStack[slide.undoStack.length - 1].map(el => el.id));
    
    console.log("Removed Elements:");
    prevElementIds.forEach(id => {
      if (!newElementIds.has(id)) {
        console.log(`- Element with ID ${id} was removed.`);
        document.getElementById("el-"+id)?.remove();
      }
    });
  
    console.log("Added Elements:");
    newElementIds.forEach(id => {
      if (!prevElementIds.has(id)) {
        console.log(`- Element with ID ${id} was added.`);
        const newEl = slide.undoStack[slide.undoStack.length - 1].find(el => el.id === id);
        updateSlideElement(newEl);
      }
    });

    console.log("Modified Elements:");
    slide.undoStack[slide.undoStack.length - 1].forEach(newEl => {
      const prevEl = currentSnapshot.find(el => el.id === newEl.id);
      if (prevEl && JSON.stringify(prevEl) !== JSON.stringify(newEl)) {
        console.log(`- Element with ID ${newEl.id} was modified.`);
      }
      const modifiedEl = document.getElementById("el-"+newEl.id);
      if(modifiedEl){
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
