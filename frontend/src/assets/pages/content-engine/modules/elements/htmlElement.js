// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
// htmlElement.js
// Handles creation, editing and rendering of custom HTML elements that are “sandboxed”
// inside iframes.  Uses Monaco (if present) but gracefully falls     originSlideIndex: store.currentSlideIndex, // Track which slide this element was created on
 
// if Monaco failed to load.

/*********************************
 *  DEPENDENCIES & UTILITIES     *
 *********************************/
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { loadSlide } from "../core/renderSlide.js";
import { selectElement } from "../core/elementSelector.js";
import { getNewZIndex } from "../utils/domUtils.js";
import { queryParams, showToast } from "../../../../utils/utils.js";
import { GridUtils } from "../config/gridConfig.js";
import * as bootstrap from "bootstrap";
import loader from "@monaco-editor/loader";

// ――― Re‑usable debouncer — single instance for the whole module ―――
function debounce(fn, delay = 300) {
  let handle;
  return (...args) => {
    clearTimeout(handle);
    handle = setTimeout(() => fn.apply(null, args), delay);
  };
}

/*********************************
 *  MONACO LOADER (singleton)    *
 *********************************/
// Using @monaco-editor/loader for modern ES6 imports with Vite
let _monacoPromise = null;
function loadMonaco() {
  if (_monacoPromise) return _monacoPromise; // already in flight / done

  _monacoPromise = loader
    .init()
    .then((monaco) => {
      return monaco;
    })
    .catch((err) => {
      console.error("Monaco failed to load:", err);
      return undefined; // fallback to textareas
    });

  return _monacoPromise;
}

/*********************************
 *  MODULE‑LEVEL STATE           *
 *********************************/
let htmlEditor, cssEditor, jsEditor; // Monaco IEditor instances (or undefined)
let pendingElementData = null; // Used to remember data while loader is pending

/*********************************
 *  LIVE PREVIEW HELPERS         *
 *********************************/
function generateHtmlContent(html, css, js) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${css}</style>
</head>
<body>
${html}
<script>${js}</script>
</body>
</html>`;
}

function updateHtmlPreview() {
  const htmlCode = htmlEditor
    ? htmlEditor.getValue()
    : document.getElementById("htmlElementHtmlCode").value;
  const cssCode = cssEditor
    ? cssEditor.getValue()
    : document.getElementById("htmlElementCssCode").value;
  const jsCode = jsEditor
    ? jsEditor.getValue()
    : document.getElementById("htmlElementJsCode").value;

  const previewContainer = document.getElementById("htmlElementPreview");
  if (!previewContainer) return;

  let iframe = previewContainer.querySelector("iframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    Object.assign(iframe.style, {
      width: "100%",
      height: "100%",
      border: "none",
    });
    previewContainer.appendChild(iframe);
  }
  iframe.srcdoc = generateHtmlContent(htmlCode, cssCode, jsCode);
}

const debouncedPreview = debounce(updateHtmlPreview, 1000);

/*********************************
 *  EDITOR INITIALISATION        *
 *********************************/
function createEditors(monaco) {
  // If the modal DOM is not there yet, try once more shortly
  if (!document.getElementById("htmlElementHtmlCode")) {
    setTimeout(() => createEditors(monaco), 50);
    return;
  }

  // Guard against double creation
  if (htmlEditor || cssEditor || jsEditor) return;

  if (!monaco) {
    // Monaco failed – leave the original <textarea>s in place
    return;
  }

  const opts = { theme: "vs-light", automaticLayout: true };
  htmlEditor = monaco.editor.create(
    document.getElementById("htmlElementHtmlCode"),
    { ...opts, language: "html" },
  );
  cssEditor = monaco.editor.create(
    document.getElementById("htmlElementCssCode"),
    { ...opts, language: "css" },
  );
  jsEditor = monaco.editor.create(
    document.getElementById("htmlElementJsCode"),
    { ...opts, language: "javascript" },
  );

  // Initial values
  if (pendingElementData) {
    htmlEditor.setValue(pendingElementData.html || "");
    cssEditor.setValue(pendingElementData.css || "");
    jsEditor.setValue(pendingElementData.js || "");
  } else {
    htmlEditor.setValue(
      '<div class="example">\n  <h2>Hello World</h2>\n  <p>This is an example HTML element.</p>\n</div>',
    );
    cssEditor.setValue(
      ".example {\n  padding: 20px;\n  background-color: #f0f0f0;\n  border-radius: 8px;\n  font-family: Arial, sans-serif;\n}\n\nh2 {\n  color: #0078d7;\n}",
    );
    jsEditor.setValue("// Add your JavaScript code here");
  }

  // Wire preview updates
  htmlEditor.onDidChangeModelContent(debouncedPreview);
  cssEditor.onDidChangeModelContent(debouncedPreview);
  jsEditor.onDidChangeModelContent(debouncedPreview);

  // Initial preview
  updateHtmlPreview();
}

function initMonacoEditors() {
  // If the editors are already created, just update their content and preview.
  if (htmlEditor) {
    if (pendingElementData) {
      htmlEditor.setValue(pendingElementData.html || "");
      cssEditor.setValue(pendingElementData.css || "");
      jsEditor.setValue(pendingElementData.js || "");
    } else {
      // Reset to default content for a new element
      htmlEditor.setValue(
        '<div class="example">\n  <h2>Hello World</h2>\n  <p>This is an example HTML element.</p>\n</div>',
      );
      cssEditor.setValue(
        ".example {\n  padding: 20px;\n  background-color: #f0f0f0;\n  border-radius: 8px;\n  font-family: Arial, sans-serif;\n}\n\nh2 {\n  color: #0078d7;\n}",
      );
      jsEditor.setValue("// Add your JavaScript code here");
    }
    updateHtmlPreview();
    return;
  }

  // Editors not created yet. Load Monaco then create them.
  loadMonaco()
    .then((monaco) => createEditors(monaco)) // Pass monaco instance to createEditors
    .catch((err) => {
      console.error("Monaco failed to load:", err);
      // If Monaco fails, we still need to populate the textareas
      const htmlCode = document.getElementById("htmlElementHtmlCode");
      const cssCode = document.getElementById("htmlElementCssCode");
      const jsCode = document.getElementById("htmlElementJsCode");

      if (htmlCode && cssCode && jsCode) {
        if (pendingElementData) {
          htmlCode.value = pendingElementData.html || "";
          cssCode.value = pendingElementData.css || "";
          jsCode.value = pendingElementData.js || "";
        } else {
          htmlCode.value =
            '<div class="example">\n  <h2>Hello World</h2>\n  <p>This is an example HTML element.</p>\n</div>';
          cssCode.value =
            ".example {\n  padding: 20px;\n  background-color: #f0f0f0;\n  border-radius: 8px;\n  font-family: Arial, sans-serif;\n}\n\nh2 {\n  color: #0078d7;\n}";
          jsCode.value = "// Add your JavaScript code here";
        }
        updateHtmlPreview(); // Also update preview for the fallback
      }
    });
}

/*********************************
 *  MODAL OPEN / SAVE            *
 *********************************/
function openHtmlElementModal(elementData = null) {
  pendingElementData = elementData; // cache for when Monaco is ready
  const modalEl = document.getElementById("htmlElementModal");
  if (!modalEl) return;

  initMonacoEditors();

  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);

  // Replace (clone) the save button to remove old listeners
  const oldSave = document.getElementById("saveHtmlElementBtn");
  if (oldSave) {
    const newSave = oldSave.cloneNode(true);
    oldSave.parentNode.replaceChild(newSave, oldSave);
    newSave.addEventListener("click", () => saveHtmlElement(elementData));
  }

  bsModal.show();
  // Small delay to make sure preview works even if Monaco fallback is used
  setTimeout(updateHtmlPreview, 100);
}

function saveHtmlElement(existingElement = null) {
  const htmlCode = htmlEditor
    ? htmlEditor.getValue()
    : document.getElementById("htmlElementHtmlCode").value;
  if (!htmlCode.trim()) {
    showToast("HTML content cannot be empty!", "Warning");
    return;
  }
  const cssCode = cssEditor
    ? cssEditor.getValue()
    : document.getElementById("htmlElementCssCode").value;
  const jsCode = jsEditor
    ? jsEditor.getValue()
    : document.getElementById("htmlElementJsCode").value;

  const combinedHtml = generateHtmlContent(htmlCode, cssCode, jsCode);

  pushCurrentSlideState(); // for undo/redo

  if (existingElement) {
    Object.assign(existingElement, {
      html: htmlCode,
      css: cssCode,
      js: jsCode,
      content: combinedHtml,
    });

    const dom = document.getElementById(`el-${existingElement.id}`);
    dom?.querySelector("iframe")?.setAttribute("srcdoc", combinedHtml);
  } else {
    if (store.currentSlideIndex < 0) {
      showToast("Please select a slide first!", "Info");
      return;
    }

    const newElement = {
      id: store.elementIdCounter++,
      type: "html",
      html: htmlCode,
      css: cssCode,
      js: jsCode,
      content: combinedHtml,
      gridX: GridUtils.getCenteredPosition(100, 100).x,
      gridY: GridUtils.getCenteredPosition(100, 100).y,
      gridWidth: 100,
      gridHeight: 100,
      zIndex: getNewZIndex(),
      originSlideIndex: store.currentSlideIndex, // Track which slide this element was created on
      isLocked: false, // Initialize lock state
      isHidden: false, // Initialize visibility state
    };

    const slide = store.slides[store.currentSlideIndex];
    slide.elements.push(newElement);
    loadSlide(slide);

    const newDom = document.getElementById(`el-${newElement.id}`);
    if (newDom) selectElement(newDom, newElement);
  }

  bootstrap.Modal.getInstance(
    document.getElementById("htmlElementModal"),
  )?.hide();
}

/*********************************
 *  TOOLBAR & RENDERING          *
 *********************************/
function initHtmlElementToolbar() {
  const container = document.querySelector(".selected-element-options");
  if (!container || container.querySelector(".html-element-toolbar")) return;

  const toolbar = document.createElement("div");
  toolbar.className =
    "html-element-toolbar element-type-toolbar d-none w-100 justify-content-start align-items-center";

  const title = document.createElement("span");
  title.className =
    "bg-secondary text-white d-inline-flex align-items-center justify-content-center p-2 ps-2 pe-3";
  title.style.clipPath =
    "polygon(0 0, calc(100% - 10px) 0, 100% 100%, 0% 100%)";
  title.style.height = "100%";
  title.textContent = "HTML Element";

  const editBtn = document.createElement("button");
  editBtn.id = "edit-html-element-btn";
  editBtn.className =
    "btn btn-primary d-flex align-items-center py-1 gap-2 border border-dark rounded mx-3";
  editBtn.innerHTML =
    '<span style="font-size: 1.1em;" class="material-symbols-outlined">code</span> Edit HTML';

  editBtn.addEventListener("click", () => {
    if (window.selectedElementForUpdate?.element?.type === "html") {
      openHtmlElementModal(window.selectedElementForUpdate.element);
    }
  });

  toolbar.append(title, editBtn);
  container.appendChild(toolbar);
}

function _renderHtmlElement(el, container) {
  // `container` is the wrapper element from `_renderSlideElement`.
  // It already has id, classes, grid styles, and a resizer.
  // This function populates it with content specific to an HTML element.
  Object.assign(container.style, {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    position: "relative",
  });

  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, {
    width: "100%",
    height: "100%",
    border: "none",
  });
  iframe.srcdoc = el.content;
  if (queryParams.mode === "edit") iframe.style.pointerEvents = "none";

  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "absolute",
    inset: 0,
    background: "transparent",
    zIndex: 1,
  });

  // Prepend the iframe and overlay to the container. The resizer is already
  // added by the generic `_renderSlideElement` function.
  container.prepend(iframe, overlay);
}

function initHtmlElement() {
  initHtmlElementToolbar();

  // Auto‑preview for <textarea> fallback
  ["htmlElementHtmlCode", "htmlElementCssCode", "htmlElementJsCode"].forEach(
    (id) => {
      const el = document.getElementById(id);
      el?.addEventListener("input", debouncedPreview);
    },
  );

  const option = document.getElementById("add-html-element");

  option.addEventListener("click", () => {
    if (store.currentSlideIndex === -1) {
      showToast("Please select a slide first!", "Info");
    } else {
      openHtmlElementModal();
    }
  });
}

/*********************************
 *  DOMContentLoaded bootstrap   *
 *********************************/
document.addEventListener("DOMContentLoaded", () => {
  // Edit‑button in toolbar (created server‑side).  The dynamic one in initHtmlElementToolbar
  // covers the runtime case, but the static one needs wiring too.
  const staticEditBtn = document.getElementById("edit-html-element-btn");
  staticEditBtn?.addEventListener("click", () => {
    if (window.selectedElementForUpdate?.element?.type === "html") {
      openHtmlElementModal(window.selectedElementForUpdate.element);
    }
  });

  initMonacoEditors(); // just in case modal is already in DOM at page load
});

/*********************************
 *  PUBLIC EXPORTS               *
 *********************************/
export { _renderHtmlElement, initHtmlElement, openHtmlElementModal };
