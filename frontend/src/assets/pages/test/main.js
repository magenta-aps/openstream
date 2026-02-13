// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

import "./style.scss";
import { initializeMultiSelectDropdown } from "../../utils/createDomElementUtils";
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

const testList = [{"id": 1,"name": "Test Tag 1"}, {"id": 2, "name": "Test Tag 2"}, {"id": 3, "name": "Test Tag 3"}];

document.addEventListener("DOMContentLoaded", async function () {
    await fetchTags();
    initializeMultiSelectDropdown(testList, "dropdownCheckboxesContainer", "multiSelectDropdownText");
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
