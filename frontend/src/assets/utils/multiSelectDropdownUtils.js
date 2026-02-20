// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { gettext } from "./locales";

/**
 * @description Creates a chip element and adds it to a specified container with the given text and a callback for when the chip is removed.
 * @param {Element} chipContainerElement 
 * @param {String} chipText 
 * @param {Function} removeCallBack
 */
export function addChip(chipContainerElement, chipText, removeCallBack) {
  // Basic validation to ensure we have an container element and chip text
  if (!chipContainerElement || !chipText) {
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

/**
 * @description Initializes a multi-select dropdown by rendering checkboxes based on the provided data list and setting up the necessary event listeners for dropdown logic and checkbox interactions.
 * @param {Array} dataList - An array of objects representing the options for the dropdown, where each object should have at least 'id' and 'name' properties.
 * @param {String} dropdownBtnId - eg. "btntest1" - The ID of the button element that toggles the dropdown.
 * @param {String} dropdownMenuId - eg. "menutest1" - The ID of the dropdown menu element that contains the checkboxes.
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

  // Reset dropdown state
  elements.dropdownText.textContent = `(${gettext("Nothing selected")})`;
  elements.checkboxContainer.innerHTML = "";
  elements.menu.classList.add("hide");
  elements.menu.classList.remove("show");
  elements.toggle.setAttribute("aria-expanded", "false");


  // Render the checkboxes from the data list content
  renderCheckboxes(dataList, elements.checkboxContainer, dropdownBtnId);

  // Setup Toggle/Close Logic
  setupDropdownLogic(elements.toggle, elements.menu);

  // Setup checkbox listeners
  setupMultiSelectDropdownListeners(elements);
}

/**
 * @description Sets up the logic for opening and closing the multi-select dropdown, including handling clicks outside the dropdown to close it and toggling the arrow icon based on the dropdown state.
 * @param {Element} toggle
 * @param {Element} menu
 */
function setupDropdownLogic(toggle, menu) {

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

  // If the toggle button already has the dropdown logic initialized - to avoid duplicate event listeners
  if (toggle.dataset.initialized === "true") return;

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.contains("show") ? close() : open();
  });

  // Mark the toggle button as having its dropdown logic initialized
  toggle.dataset.initialized = "true";
}

/**
 * Handles creating the checkbox elements
 */
/**
 * @description Renders checkbox elements from given datalist and appends them to the specified container. Each checkbox gets a data-value-id attribute corresponding to the item's id for easier retrieval of selected values later on.
 * @param {Array} dataList
 * @param {Element} container
 * @param {string} dropdownBtnId
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

/**
 * @description Sets up event listeners for the checkboxes in the multi-select dropdown
 * @param {Object} elements - The elements object containing references to the dropdown components
 */
function setupMultiSelectDropdownListeners(elements) {
  const allCheckboxes = elements.checkboxContainer.querySelectorAll(".multi-select-checkbox");
  const selectAllCheckbox = elements.menu.querySelector(".selectAllValues");

  // to do - fix error with select-all checkbox not working
  // Check if the select-all button exist and has not been initialized once - to avoid duplicate event listeners
  if (selectAllCheckbox && selectAllCheckbox.dataset.initialized !== "true") {
    // Setup the select-all checkbox
    selectAllCheckbox.addEventListener("change", (e) => {
      // to do - remove console logs
      // console.log("running select-all checkbox listener");
      // console.log(e.target.checked);
      allCheckboxes.forEach((checkbox) => {
        checkbox.checked = e.target.checked;
        //console.log("checkbox ", checkbox.dataset.valueId, " is now ", checkbox.checked);
      });
      updateValuesDropdownState(elements);
    });

    // Mark the select-all checkbox as initialized
    selectAllCheckbox.dataset.initialized = "true";
  }

  // Setup individual checkboxes
  allCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      updateValuesDropdownState(elements);
    });
  });
}

// Update the dropdown state based on selections
/**
 * @description Updates the state of the multi-select dropdown, including the "select all" checkbox, the count of selected items, and the display of selected values as chips in the dropdown button. It also handles the logic for showing a "+X more" label when there are too many selected items to fit in the dropdown button.
 * @param {Object} elements - The elements object containing references to the dropdown components
 */
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
      textContainer.textContent = `(${gettext("Nothing selected")})`;
    } else {
      textContainer.textContent = ""; // Clear text container
      let fittedAll = true;

      for (let i= 0; i < selectedValues.length; i++) {
        const label = elements.menu.querySelector(`label[for="${selectedValues[i].id}"]`);
        const valueText = label ? label.textContent : "";
        addChip(textContainer, valueText, () => {
          const checkbox = elements.menu.querySelector(`input[id="${selectedValues[i].id}"]`);
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