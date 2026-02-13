// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { gettext } from "./locales";

export function addChip(chipContainerElement, chipText, deleteCallBack) {
    // const chipContainer = document.getElementById(containerId);
    if (!chipContainerElement) return;
    console.log("Adding chip with text", chipText, "to container element", chipContainerElement);

    const chip = document.createElement('button');
    chip.className = "d-flex align-items-center gap-1 p-1 border rounded bg-secondary-accent-hover";
    // fs-small
    chip.innerText = chipText;

    // tilføj kryds for at slette chippen
    // const deleteIcon = document.createElement('span');
    // deleteIcon.className = "material-icons";

    // add event listener for delete action = deleteCallBack
    // - callback bliver kaldt, der bestemmer hvad der skal ske med værdien (givet af initializeMultiSelectDropdown)
    // - den skal fjernes fra dropdown (removechild)

    
    chipContainerElement.appendChild(chip);
}

// Funktion til initialisering af multi select dropdown
// #OBS# - Vi forventer dataList er en liste (array) af objekter, hvor hvert objekt har en 'id' og 'name' property - Lav types til dette??
export function initializeMultiSelectDropdown(dataList, multiselectDropdownMenuId, multiSelectDropdownTextId) {
    console.log("Initializing multi select dropdown with data:", dataList);
    const multiSelectCheckboxContainer = document.getElementById(multiselectDropdownMenuId);
    multiSelectCheckboxContainer.innerHTML = ""; // Clear existing content
    multiSelectCheckboxContainer.className = "multiSelectDropDownContainer"; // Add class for styling

    // Create checkboxes for each item in dataList
    dataList.forEach(item => {
        const div = document.createElement("div");
        div.className = "form-check mb-1";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "form-check-input multi-select-checkbox";
        input.id = `checkboxValue_${item.id}`;
        input.value = item.name;
        input.dataset.valueId = item.id; // Store the ID in a data attribute for later use

        const label = document.createElement("label");
        label.className = "form-check-label ms-2";
        label.htmlFor = input.id;
        label.textContent = item.name;

        div.appendChild(input);
        div.appendChild(label);

        multiSelectCheckboxContainer.appendChild(div);
    });

    setupMultiSelectDropdownListeners(multiSelectDropdownTextId);
    // når en checkbox er checked:
    //      - Skal der tilføjes en chip med den valgte værdi til dropdownen (brug addChip)
    //              - deleteCallBack skal gives til addChip => callback skal modtages (hvad skal der ske, når værdien ikke er valgt længere)
    
    // når en checkbox er unchecked:
    //      - Der skal fjernes chip for den fravalgte værdi fra dropdownen (brug deleteCallBack i addChip)

    // der skal laves en vælg alle checkbox, der kan tjekke alle checkboxes i dropdownen og tilføje chips for alle valgte værdier
    // når den er unchecked, skal den fjerne alle chips og unchecke alle checkboxes
}

// hvad sker der ved checked:
// 1. chechboxen bliver checked
// 2. der bliver tilføjet en chip for den valgte værdi (addChip)

// hvad sker der ved unchecked:
// 1. checkboxen bliver unchecked
// 2. chip for den fravalgte værdi bliver fjernet fra dropdownen (brug deleteCallBack i addChip)

// Setup the event listeners for the multi select dropdown
function setupMultiSelectDropdownListeners(multiSelectDropdownTextId) {
  const valueCheckboxes = document.querySelectorAll(".multi-select-checkbox");
  const selectAllValues = document.getElementById("selectAllValues");
  const multiSelectDropdownMenu = document.getElementById("multiSelectDropdownMenu");

  // Prevent dropdown from closing when clicking inside
  if (multiSelectDropdownMenu) {
    multiSelectDropdownMenu.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // Setup the select-all checkbox
  if (selectAllValues) {
    // Remove any existing listeners to prevent duplicates
    selectAllValues.replaceWith(selectAllValues.cloneNode(true));
    const newSelectAllValues = document.getElementById("selectAllValues");

    newSelectAllValues.addEventListener("change", (e) => {
      const currentCheckboxes = document.querySelectorAll(".multi-select-checkbox");
      currentCheckboxes.forEach((checkbox) => {
        checkbox.checked = e.target.checked;
      });
      updateValuesDropdownState(multiSelectDropdownTextId);
    });
  }

  // Setup individual checkboxes
  valueCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      updateValuesDropdownState(multiSelectDropdownTextId);
    });
  });
}

// Update the dropdown state based on selections
function updateValuesDropdownState(multiSelectDropdownTextId) {
  const valueCheckboxes = document.querySelectorAll(".multi-select-checkbox"); // ### TO DO - change to custom class/id, so multiple dropdowns can be used on the same page without conflicts
  const selectAllValues = document.getElementById("selectAllValues"); // #### TO DO - change to custom id, so multiple dropdowns can be used on the same page without conflicts
  const multiSelectDropdownText = document.getElementById(multiSelectDropdownTextId);
  const textContainerWidth = multiSelectDropdownText ? multiSelectDropdownText.offsetWidth : 0;

  // Get selected values
  const selectedValues = Array.from(valueCheckboxes).filter((cb) => cb.checked);

  // Update select all checkbox
  if (selectAllValues) {
    const allSelected = valueCheckboxes.length > 0 && selectedValues.length === valueCheckboxes.length;

    if (selectAllValues.checked !== allSelected) {
      selectAllValues.checked = allSelected;
    }
  }

  // Update dropdown text
  if (multiSelectDropdownText) {
    let count = selectedValues.length;

    if (count === 0) {
      multiSelectDropdownText.textContent = gettext("Select values..."); // ### TO DO - tekst skal være customizable
    } else {
      multiSelectDropdownText.textContent = ""; // Clear text container
      let fittedAll = true;

      for (let i= 0; i < selectedValues.length; i++) {
        const label = document.querySelector(`label[for="${selectedValues[i].id}"]`);
        const valueText = label ? label.textContent : "";
        addChip(multiSelectDropdownText, valueText);

        // Check if this chip caused an overflow
        if (multiSelectDropdownText.scrollWidth > textContainerWidth) {
            multiSelectDropdownText.removeChild(multiSelectDropdownText.lastChild); // Remove the one that broke it
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
          multiSelectDropdownText.appendChild(moreLabel);

          // Final check: if the label itself caused an overflow, 
          // remove another chip to make space
          while (multiSelectDropdownText.scrollWidth > textContainerWidth && multiSelectDropdownText.children.length > 1) {
              multiSelectDropdownText.removeChild(multiSelectDropdownText.children[multiSelectDropdownText.children.length - 2]);
              count++;
              moreLabel.textContent = `+ ${count} ` + gettext("more") + "...";
          }
      }
    }
  }
}