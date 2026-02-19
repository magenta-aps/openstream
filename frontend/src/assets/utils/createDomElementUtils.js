// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { gettext } from "./locales";

/**
 * @description Creates a chip element and adds it to a specified container with the given text and a callback for when the chip is removed.
 * @param {Element} chipContainerElement 
 * @param {*} chipText 
 * @param {*} removeCallBack 
 * @returns 
 */
export function addChip(chipContainerElement, chipText, removeCallBack) {
  // Basic validation to ensure we have a valid container element and chip text
  // To do fjerne tjek af element type når vi har types på plads
  if (!chipContainerElement || !(chipContainerElement instanceof Element) || !chipText) {
      console.error("Invalid or missing elements for chip element creation.");
      return;
  }

  const chip = document.createElement('span');
  chip.className = "d-flex text-nowrap align-items-center justify-content-between gap-1 py-1 px-2 border rounded-4 bg-secondary-accent text-secondary-hover fs-7";

  const trimmedChipText = chipText.trim();
  chip.innerText = trimmedChipText;
  chip.setAttribute("title", trimmedChipText); // Show full text on hover

  // Add the "x" icon to the chip
  const icon = document.createElement("i");
  icon.className = "material-symbols-outlined text-dark-gray";
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
    console.error("Multi select dropdown elements not found. Please check the provided IDs and HTML structure.");
    return;
  }

  // Render the checkboxes from the data list content
  renderCheckboxes(dataList, elements.checkboxContainer, dropdownBtnId);

  // Setup Toggle/Close Logic
  setupDropdownLogic(elements);

  // Setup checkbox listeners
  setupMultiSelectDropdownListeners(elements);
}

/**
 * Handles logic of opening/closing the dropdown
 */
function setupDropdownLogic({ toggle, menu }) {
  // to do - Fix it, so it closes if user clikcs on another dropdown
  const handleOutsideClick = (e) => {
    if (!toggle.contains(e.target) && !menu.contains(e.target)) {
      close();
    }
  };

  const close = () => {
    menu.classList.replace("show", "hide");
    toggle.setAttribute("aria-expanded", "false");
    
    const arrowIcon = toggle.querySelector(".arrowIcon");
    if (arrowIcon) {
      arrowIcon.textContent = "expand_more";
    }

    document.removeEventListener("click", handleOutsideClick);
  };

  const open = () => {
    menu.classList.replace("hide", "show");
    toggle.setAttribute("aria-expanded", "true");
  
    const arrowIcon = toggle.querySelector(".arrowIcon");
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
function renderCheckboxes(dataList, container, dropdownBtnId) {
  container.innerHTML = "";

  const fragment = document.createDocumentFragment();

  dataList.forEach(item => {
    const div = document.createElement("div");
    div.className = "form-check";
    div.innerHTML = `
      <input type="checkbox" class="form-check-input multi-select-checkbox" 
             id="${dropdownBtnId}_${item.id}" value="${item.name}" data-value-id="${item.id}">
      <label class="form-check-label" for="${dropdownBtnId}_${item.id}">
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
  const selectAllCheckbox = elements.menu.querySelector(".selectAllValues");

  // Setup the select-all checkbox
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", (e) => {
      allCheckboxes.forEach((checkbox) => {
        checkbox.checked = e.target.checked;
      });
      updateValuesDropdownState(elements);
    });
  }

  // Setup individual checkboxes
  allCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      updateValuesDropdownState(elements);
    });
  });
}

// Update the dropdown state based on selections
function updateValuesDropdownState(elements) {
  const allCheckboxes = elements.checkboxContainer.querySelectorAll(".multi-select-checkbox");
  const selectAllValues = elements.menu.querySelector(".selectAllValues");
  const countElement = elements.menu.querySelector(".values-count");
  const textContainer = elements.dropdownText;
  const textContainerWidth = textContainer ? textContainer.offsetWidth : 0;

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
  if (textContainer) {
    let count = selectedValues.length;

    if (count === 0) {
      textContainer.textContent = gettext("Select values..."); // ### TO DO - tekst skal være customizable
    } else {
      textContainer.textContent = ""; // Clear text container
      let fittedAll = true;

      for (let i= 0; i < selectedValues.length; i++) {
        const label = document.querySelector(`label[for="${selectedValues[i].id}"]`);
        const valueText = label ? label.textContent : "";
        addChip(textContainer, valueText, () => {
          const checkbox = document.querySelector(`input[id="${selectedValues[i].id}"]`);
          if (checkbox) {
            checkbox.checked = false;
            updateValuesDropdownState(elements); // Update state to reflect changes
          }
        });

        // Check if this chip caused an overflow
        if (textContainer.scrollWidth > textContainerWidth) {
            textContainer.removeChild(textContainer.lastChild); // Remove the one that broke it
            fittedAll = false;
            count = selectedValues.length - i;
            break;
        }
      }

      // Add the "+X more" label if needed
      if (!fittedAll) {
          const moreLabel = document.createElement('span');
          moreLabel.className = "text-nowrap text-darker-gray fs-7";
          moreLabel.textContent = `+ ${count} ` + gettext("more") + "...";
          // moreLabel.style.whiteSpace = 'nowrap';
          textContainer.appendChild(moreLabel);

          // Final check: if the label itself caused an overflow, 
          // remove another chip to make space
          while (textContainer.scrollWidth > textContainerWidth && textContainer.children.length > 1) {
              textContainer.removeChild(textContainer.children[textContainer.children.length - 2]);
              count++;
              moreLabel.textContent = `+ ${count} ` + gettext("more") + "...";
          }
      }
    }
  }
}