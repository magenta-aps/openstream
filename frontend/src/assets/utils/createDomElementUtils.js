// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

export function addChip(containerId, chipText, deleteCallBack, chipClass="",) {
    const chipContainer = document.getElementById(containerId);
    if (!chipContainer) return;

    const chip = document.createElement('button');
    chip.className = `${chipClass} d-flex align-items-center gap-1 p-1 border rounded bg-secondary-accent-hover`;
    // fs-small 
    chip.innerText = chipText;
    
    chipContainer.appendChild(chip);
}

// Funktion til initialisering af multi select dropdown
// #OBS# - Vi forventer dataList er en liste (array) af objekter, hvor hvert objekt har en 'id' og 'name' property - Lav types til dette??
export function initializeMultiSelectDropdown(dataList, multiselectDropdownMenuId) {
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

        const label = document.createElement("label");
        label.className = "form-check-label ms-2";
        label.htmlFor = input.id;
        label.textContent = item.name;

        div.appendChild(input);
        div.appendChild(label);

        multiSelectCheckboxContainer.appendChild(div);
    });

    setupMultiSelectDropdownListeners();
    // når en checkbox er checked:
    //      - Skal der tilføjes en chip med den valgte værdi til dropdownen (brug addChip)
    //              - deleteCallBack skal gives til addChip => callback skal modtages (hvad skal der ske, når værdien ikke er valgt længere)
    //      - Der skal kaldes en addCallBack, der bestemmer hvad der skal ske med den valgte værdi (f.eks. tilføje den til en liste over valgte værdier)
    
    // når en checkbox er unchecked:
    //      - Skal der kaldes en removeCallBack, der bestemmer hvad der skal ske med den fravalgte værdi (f.eks. fjerne den fra listen over valgte værdier)
    //      - Der skal fjernes chip for den fravalgte værdi fra dropdownen (brug deleteCallBack i addChip)

    // der skal laves en vælg alle checkbox, der kan tjekke alle checkboxes i dropdownen og tilføje chips for alle valgte værdier
    // når den er unchecked, skal den fjerne alle chips og unchecke alle checkboxes
}

// hvad sker der ved checked:
// 1. chechboxen bliver checked
// 2. der bliver tilføjet en chip for den valgte værdi (addChip)
// 3. addCallBack bliver kaldt, der bestemmer hvad der skal ske med den valgte værdi (f.eks. tilføje den til en liste over valgte værdier)

// hvad sker der ved unchecked:
// 1. checkboxen bliver unchecked
// 2. removeCallBack bliver kaldt, der bestemmer hvad der skal ske med den fravalgte værdi (f.eks. fjerne den fra listen over valgte værdier)
// 3. chip for den fravalgte værdi bliver fjernet fra dropdownen (brug deleteCallBack i addChip)

// Setup the event listeners for the multi select dropdown
function setupMultiSelectDropdownListeners() {
//   const tagCheckboxes = document.querySelectorAll(".multi-select-checkbox");
//   const selectAllTags = document.getElementById("selectAllTags");
  const multiSelectDropdownMenu = document.getElementById("multiSelectDropdownMenu");

  // Prevent dropdown from closing when clicking inside
  if (multiSelectDropdownMenu) {
    multiSelectDropdownMenu.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // Setup select all checkbox
//   if (selectAllTags) {
//     // Remove any existing listeners to prevent duplicates
//     selectAllTags.replaceWith(selectAllTags.cloneNode(true));
//     const newSelectAllTags = document.getElementById("selectAllTags");

//     newSelectAllTags.addEventListener("change", (e) => {
//       const currentTagCheckboxes = document.querySelectorAll(".tag-checkbox");
//       currentTagCheckboxes.forEach((checkbox) => {
//         checkbox.checked = e.target.checked;
//       });
//       updateTagsDropdownState();
//     });
//   }

//   // Setup individual tag checkboxes
//   tagCheckboxes.forEach((checkbox) => {
//     checkbox.addEventListener("change", () => {
//       updateTagsDropdownState();
//     });
//   });
}