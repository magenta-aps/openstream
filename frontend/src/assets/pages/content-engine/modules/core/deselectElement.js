// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "./slideStore.js";
import { deselectElement } from "./elementSelector.js";

export function initDeselectElement() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && store.selectedElement) {
      const activeElement = document.activeElement;

      // Handle text box edit mode specially
      if (activeElement && activeElement.isContentEditable) {
        // Exit edit mode by blurring the element, but keep it selected
        activeElement.blur();
        activeElement.contentEditable = false;
        return;
      }

      // Don't deselect if user is typing in regular input fields
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA")
      ) {
        return;
      }

      // Deselect the element
      deselectElement();
    }
  });
}
