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
    initializeMultiSelectDropdown(testList, "dropdownCheckboxesContainer");
});
