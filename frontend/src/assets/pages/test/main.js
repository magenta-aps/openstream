// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

import "./style.scss";
import { addChip, initializeMultiSelectDropdown } from "../../utils/createDomElementUtils";
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

const testList = [{"id": 1,"name": "Test Tag 1"}, {"id": 2, "name": "Test Tag 2"}, {"id": 3, "name": "Test Tag 3"}, {"id": 4, "name": "Test Tag 4"}, {"id": 5, "name": "Test Tag 5"}, {"id": 6, "name": "Test Tag 6"}, {"id": 7, "name": "Test Tag 7"}, {"id": 8, "name": "Test Tag 8"}, {"id": 9, "name": "Test Tag 9"}, {"id": 10, "name": "Test Tag 10"}];

document.addEventListener("DOMContentLoaded", async function () {
    await fetchTags();
    initializeMultiSelectDropdown(testList, "multiSelectDropdownToggle", "multiSelectDropdownMenu");

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
    "#dropdownCheckboxesContainer input[type='checkbox']",
  );

  tagCheckboxes.forEach((cb) => {
    if (cb.checked) {
      tag_ids.push(parseInt(cb.dataset.valueId, 10));
    }
  });
  console.log("Selected tag IDs:", tag_ids);
});
