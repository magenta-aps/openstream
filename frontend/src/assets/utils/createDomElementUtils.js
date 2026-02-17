// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { gettext } from "./locales";

export function addChip(chipContainerElement, chipText, removeCallBack) {
  // Basic validation to ensure we have a valid container element and chip text
  if (!chipContainerElement || !(chipContainerElement instanceof Element) || !chipText) {
      console.error("Invalid or missing elements for chip element creation.");
      return;
  }

    const chip = document.createElement('span');
    chip.className = "d-flex align-items-center gap-1 p-1 border rounded bg-secondary-accent-hover chip-btn";
    // TO DO - style chip and add possibility to choose size (figma)

    // TO DO clear the chiptext for whitespace and limit the length, so it doesn't break the dropdown design - maybe add "..." if it's too long?
    chip.innerText = chipText;

    // Add the "x" icon to the chip
    const icon = document.createElement("i");
    icon.className = "material-symbols-outlined";
    icon.style.fontSize = "16px";
    icon.textContent = "close";
    chip.innerHTML += " " + icon.outerHTML;

    chip.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent the click from bubbling up to parent element

      chipContainerElement.removeChild(chip);
      if (removeCallBack && typeof removeCallBack === "function") {
        removeCallBack();
      }
    });
 
    chipContainerElement.appendChild(chip);
}

// TO DO - Vi forventer dataList er en liste (array) af objekter, hvor hvert objekt har en 'id' og 'name' property - Lav types til dette??
/**
 * Main Entry Point
 */
export function initializeMultiSelectDropdown(dataList, dropdownBtnId, dropdownMenuId) {
  // Get the main elements of the dropdown
  const toggle = document.getElementById(dropdownBtnId);
  const menu = document.getElementById(dropdownMenuId);

  const elements = {
    toggle: toggle,
    dropdownText: toggle?.querySelector(".selected-values-text"),
    menu: menu,
    checkboxContainer: menu?.querySelector(".dropdownCheckboxesContainer")
  };

  // Basic validation to ensure we have the necessary elements to work with
  if (!elements.toggle || !elements.checkboxContainer || !elements.dropdownText || !elements.menu) {
    console.error("Multi select dropdown elements not found");
    return;
  }

  // Render the checkboxes from the data list content
  renderCheckboxes(dataList, elements.checkboxContainer);

  // Setup Toggle/Close Logic
  setupDropdownLogic(elements);

  // Setup checkbox listeners
  setupMultiSelectDropdownListeners(elements);
}

/**
 * Handles logic of opening/closing the dropdown
 */
function setupDropdownLogic({ toggle, menu }) {
  const handleOutsideClick = (e) => {
    if (!toggle.contains(e.target) && !menu.contains(e.target)) {
      close();
    }
  };

  const close = () => {
    menu.classList.replace("show", "hide");
    toggle.setAttribute("aria-expanded", "false");
    
    const arrowIcon = toggle.querySelector("#arrowIcon");
    if (arrowIcon) {
      arrowIcon.textContent = "expand_more";
    }

    document.removeEventListener("click", handleOutsideClick);
  };

  const open = () => {
    menu.classList.replace("hide", "show");
    toggle.setAttribute("aria-expanded", "true");
  
    const arrowIcon = toggle.querySelector("#arrowIcon");
    if (arrowIcon) {
      arrowIcon.textContent = "expand_less";
    }

    setTimeout(() => document.addEventListener("click", handleOutsideClick), 0);
  };

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.contains("show") ? close() : open();
  });
}

/**
 * Handles creating the checkbox elements
 */
function renderCheckboxes(dataList, container) {
  container.innerHTML = "";

  const fragment = document.createDocumentFragment();

  dataList.forEach(item => {
    const div = document.createElement("div");
    div.className = "form-check mb-1";
    div.innerHTML = `
      <input type="checkbox" class="form-check-input multi-select-checkbox" 
             id="checkboxValue_${item.id}" value="${item.name}" data-value-id="${item.id}">
      <label class="form-check-label ms-2" for="checkboxValue_${item.id}">
        ${item.name}
      </label>
    `;
    fragment.appendChild(div);
  });

  container.appendChild(fragment);
}

// Function to setup the event listeners for the checkboxes in the multi select dropdown
function setupMultiSelectDropdownListeners(elements) {
  const allCheckboxes = elements.checkboxContainer.querySelectorAll(".multi-select-checkbox");
  const selectAllCheckbox = elements.menu.querySelector("#selectAllValues");

  // Setup the select-all checkbox
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", (e) => {
      allCheckboxes.forEach((checkbox) => {
        checkbox.checked = e.target.checked;
      });
      updateValuesDropdownState(elements.dropdownText);
    });
  }

  // Setup individual checkboxes
  allCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      updateValuesDropdownState(elements.dropdownText);
    });
  });
}

// Update the dropdown state based on selections
function updateValuesDropdownState(dropdownTextElement) {
  const allCheckboxes = document.querySelectorAll(".multi-select-checkbox"); // TO DO - change to more specific selector to avoid conflicts if multiple dropdowns on the same page
  const selectAllValues = document.getElementById("selectAllValues"); // TO DO - change to custom id, so multiple dropdowns can be used on the same page without conflicts
  const countElement = document.querySelector(".values-count"); // TO DO - change to more specific selector to avoid conflicts if multiple dropdowns on the same page
  const textContainerWidth = dropdownTextElement ? dropdownTextElement.offsetWidth : 0;

  // Get selected values
  const selectedValues = Array.from(allCheckboxes).filter((cb) => cb.checked);

  // Update select all checkbox
  if (selectAllValues) {
    const allSelected = allCheckboxes.length > 0 && selectedValues.length === allCheckboxes.length;

    if (selectAllValues.checked !== allSelected) {
      selectAllValues.checked = allSelected;
    }
  }

  // Update count element
  if (countElement) {
    countElement.textContent = selectedValues.length + " " + gettext("selected");
  }

  // Update dropdown text
  if (dropdownTextElement) {
    let count = selectedValues.length;

    if (count === 0) {
      dropdownTextElement.textContent = gettext("Select values..."); // ### TO DO - tekst skal være customizable
    } else {
      dropdownTextElement.textContent = ""; // Clear text container
      let fittedAll = true;

      for (let i= 0; i < selectedValues.length; i++) {
        const label = document.querySelector(`label[for="${selectedValues[i].id}"]`);
        const valueText = label ? label.textContent : "";
        addChip(dropdownTextElement, valueText, () => {
          const checkbox = document.querySelector(`input[id="${selectedValues[i].id}"]`);
          if (checkbox) {
            checkbox.checked = false;
            updateValuesDropdownState(dropdownTextElement); // Update state to reflect changes
          }
        });

        // Check if this chip caused an overflow
        if (dropdownTextElement.scrollWidth > textContainerWidth) {
            dropdownTextElement.removeChild(dropdownTextElement.lastChild); // Remove the one that broke it
            fittedAll = false;
            count = selectedValues.length - i;
            break;
        }
      }

      // Add the "+X more" label if needed
      if (!fittedAll) {
          const moreLabel = document.createElement('span');
          moreLabel.textContent = `+ ${count} ` + gettext("more") + "...";
          moreLabel.style.whiteSpace = 'nowrap';
          dropdownTextElement.appendChild(moreLabel);

          // Final check: if the label itself caused an overflow, 
          // remove another chip to make space
          while (dropdownTextElement.scrollWidth > textContainerWidth && dropdownTextElement.children.length > 1) {
              dropdownTextElement.removeChild(dropdownTextElement.children[dropdownTextElement.children.length - 2]);
              count++;
              moreLabel.textContent = `+ ${count} ` + gettext("more") + "...";
          }
      }
    }
  }
}