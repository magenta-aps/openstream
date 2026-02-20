// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

import "./style.scss";
import { addChip, initializeMultiSelectDropdown } from "../../utils/multiSelectDropdownUtils";
import {
  parentOrgID,
  genericFetch,
} from "../../utils/utils";
import {
  translateHTML,
  fetchUserLangugage,
  gettext,
} from "../../utils/locales";
import { BASE_URL } from "../../utils/constants";


// Initialize translations
(async () => {
    await fetchUserLangugage();
    translateHTML();
})();

let tagsList = [];
async function fetchTags() {
  tagsList = await genericFetch(
    `${BASE_URL}/api/tags/?organisation_id=${parentOrgID}`,
  );
}

const testList = [
  {"id": 1,"name": "Test 1.1"},
  {"id": 2, "name": "Test 1.2"},
  {"id": 3, "name": "Test 1.3"},
  {"id": 4, "name": "Test 1.4"},
  {"id": 5, "name": "Test 1.5"},
  {"id": 6, "name": "Test 1.6"},
  {"id": 7, "name": "Test 1.7"},
];


const testList2 = [
  {"id": 8,"name": "Test 2.1"},
  {"id": 9, "name": "Test 2.2"},
  {"id": 10, "name": "Test 2.3"},
  {"id": 11, "name": "Test 2.4"},
  {"id": 12, "name": "Test 2.5"},
  {"id": 13, "name": "Test 2.6"},
  {"id": 14, "name": "Test 2.7"},
];

document.addEventListener("DOMContentLoaded", async function () {
    await fetchTags();
    initializeMultiSelectDropdown(testList, "btntest1", "menutest1");
    initializeMultiSelectDropdown(testList2, "btntest2", "menutest2");

    const chipContainer = document.getElementById("chipContainer");
    addChip(chipContainer, "Test Chip", () => {
        console.log("Chip deleted");
    });
});


// ## How to get the selected values from the multi select dropdown ##
document.querySelector("#form_test").addEventListener("submit", function (e) {
  e.preventDefault();
  const tag_ids = [];
  const tagCheckboxes = document.querySelectorAll(
    ".dropdownCheckboxesContainer input[type='checkbox']",
  );

  tagCheckboxes.forEach((cb) => {
    if (cb.checked) {
      tag_ids.push(parseInt(cb.dataset.valueId, 10));
    }
  });
  console.log("Selected tag IDs:", tag_ids);
});
