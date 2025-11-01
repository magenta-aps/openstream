// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import * as bootstrap from "bootstrap";
import "./style.scss";
import {
  makeActiveInNav,
  createMiniSearchInstance,
  queryParams,
  token,
  selectedBranchID,
  showToast,
  genericFetch,
  promptDelete,
  updateNavbarBranchName,
  updateNavbarUsername,
  initSignOutButton,
  setupDeleteConfirmation,
  initOrgQueryParams,
} from "../../utils/utils";

updateNavbarUsername();
updateNavbarBranchName();

import { BASE_URL } from "../../utils/constants";
import {
  translateHTML,
  fetchUserLangugage,
  gettext,
} from "../../utils/locales";

// Initialize translations
(async () => {
  await fetchUserLangugage();
  translateHTML();
})();

makeActiveInNav("/manage-wayfinding-systems");

// Global data
let allWayfindingSystems = [];
let sortBy = "name";
let sortDir = "asc";

const miniSearchWayfindingSystems = createMiniSearchInstance(["name"]);

let searchQuery = "";

const searchInput = document.getElementById("searchInput");
const wayfindingSystemsTableBody = document
  .getElementById("wayfinding-systems-table")
  .getElementsByTagName("tbody")[0];
const emptyListAlert = document.getElementById("emptyListAlert");

const deleteModalEl = document.getElementById("deleteWayfindingSystemModal");
const deleteModal = new bootstrap.Modal(deleteModalEl);

let wayfindingSystemIdToDelete = null;

const createWayfindingSystemButton = document.getElementById(
  "create-wayfinding-button",
);

const thName = document.getElementById("th-name");
const thCreated = document.getElementById("th-created");
const thUpdated = document.getElementById("th-updated");

const sortIndicatorName = document.getElementById("sortIndicatorName");
const sortIndicatorCreated = document.getElementById("sortIndicatorCreated");
const sortIndicatorUpdated = document.getElementById("sortIndicatorUpdated");

/* =============================================================================
   1) Initialization: fetch data, set up event listeners
============================================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  initSignOutButton();
  await fetchAllWayfindingSystems();
  applySearchFilterSort();
  initOrgQueryParams();

  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.toLowerCase();
    applySearchFilterSort();
  });

  thName.addEventListener("click", () => handleSortClick("name"));
  thCreated.addEventListener("click", () => handleSortClick("created_at"));
  thUpdated.addEventListener("click", () => handleSortClick("updated_at"));

  // Create wayfinding system modal setup
  const createWayfindingSystemModalEl = document.getElementById(
    "createWayfindingSystemModal",
  );
  const createWayfindingSystemModal = new bootstrap.Modal(
    createWayfindingSystemModalEl,
  );
  const createWayfindingSystemForm = document.getElementById(
    "createWayfindingSystemForm",
  );

  createWayfindingSystemButton.addEventListener("click", () => {
    document.getElementById("createWayfindingSystemName").value = "";
    document.getElementById("createWayfindingSystemDescription").value = "";
    createWayfindingSystemModal.show();
  });

  createWayfindingSystemForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document
      .getElementById("createWayfindingSystemName")
      .value.trim();
    const description = document
      .getElementById("createWayfindingSystemDescription")
      .value.trim();

    if (!name) {
      showToast(
        gettext("Please enter a name for the wayfinding system"),
        "error",
      );
      return;
    }

    try {
      const wayfindingData = {
        description: description || "",
        maps: [],
        points_of_interest: [],
        routes: [],
        settings: {
          default_zoom: 1,
          theme: "default",
        },
      };

      const result = await genericFetch(
        `${BASE_URL}/api/wayfinding/`,
        "POST",
        {
          name: name,
          wayfinding_data: wayfindingData,
          branch_id: selectedBranchID,
        },
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      );

      showToast(gettext("Wayfinding system created successfully"), "success");
      createWayfindingSystemModal.hide();
      await fetchAllWayfindingSystems();
      applySearchFilterSort();
    } catch (error) {
      console.error("Error creating wayfinding system:", error);
      showToast(
        gettext("Failed to create wayfinding system: ") +
          (error.detail || error.message || "Unknown error"),
        "error",
      );
    }
  });

  // Rename modal setup
  const renameWayfindingSystemModalEl = document.getElementById(
    "renameWayfindingSystemModal",
  );
  const renameWayfindingSystemModal = new bootstrap.Modal(
    renameWayfindingSystemModalEl,
  );
  const renameWayfindingSystemForm = document.getElementById(
    "renameWayfindingSystemForm",
  );

  let currentlyEditingWayfindingSystemId = null;

  window.openRenameWayfindingSystemModal = (id, currentName) => {
    currentlyEditingWayfindingSystemId = id;
    document.getElementById("renameWayfindingSystemName").value = currentName;
    renameWayfindingSystemModal.show();
  };

  renameWayfindingSystemForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const newName = document
      .getElementById("renameWayfindingSystemName")
      .value.trim();

    if (!newName) {
      showToast(gettext("Please enter a name"), "error");
      return;
    }

    try {
      const result = await genericFetch(
        `${BASE_URL}/api/wayfinding/${currentlyEditingWayfindingSystemId}/`,
        "PATCH",
        {
          name: newName,
          branch_id: selectedBranchID,
        },
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      );

      showToast(gettext("Wayfinding system renamed successfully"), "success");
      renameWayfindingSystemModal.hide();
      await fetchAllWayfindingSystems();
      applySearchFilterSort();
    } catch (error) {
      console.error("Error renaming wayfinding system:", error);
      showToast(
        gettext("Failed to rename wayfinding system: ") +
          (error.detail || error.message || "Unknown error"),
        "error",
      );
    }
  });

  // Delete confirmation
  window.openDeleteWayfindingSystemModal = (id, name) => {
    wayfindingSystemIdToDelete = id;
    document.getElementById("wayfindingSystemToDeleteName").textContent = name;

    // Set up confirmation text for typing validation
    const requiredText = `Delete wayfinding system ${name}`;

    // Use the utility function for delete confirmation setup
    setupDeleteConfirmation(
      "deleteWayfindingSystemInput",
      "confirmDeleteWayfindingSystemButton",
      "deleteWayfindingSystemError",
      "deleteWayfindingSystemTextToType",
      requiredText,
    );

    // Store wayfinding system info
    document.getElementById("deleteWayfindingSystemId").value = id;
    document.getElementById("deleteWayfindingSystemName").value = name;

    deleteModal.show();
  };

  document
    .getElementById("confirmDeleteWayfindingSystemButton")
    .addEventListener("click", async () => {
      if (!wayfindingSystemIdToDelete) return;

      try {
        const result = await genericFetch(
          `${BASE_URL}/api/wayfinding/${wayfindingSystemIdToDelete}/?branch_id=${selectedBranchID}`,
          "DELETE",
          null,
          {
            Authorization: `Bearer ${token}`,
          },
        );

        showToast(gettext("Wayfinding system deleted successfully"), "success");
        deleteModal.hide();
        await fetchAllWayfindingSystems();
        applySearchFilterSort();
      } catch (error) {
        console.error("Error deleting wayfinding system:", error);
        showToast(
          gettext("Failed to delete wayfinding system: ") +
            (error.detail || error.message || "Unknown error"),
          "error",
        );
      }
    });
});

/* =============================================================================
   2) Data Fetching
============================================================================= */
async function fetchAllWayfindingSystems() {
  try {
    const data = await genericFetch(
      `${BASE_URL}/api/wayfinding/?branch_id=${selectedBranchID}&includeWayfindingData=false`,
      "GET",
      null,
      {
        Authorization: `Bearer ${token}`,
      },
    );

    allWayfindingSystems = data || [];
    miniSearchWayfindingSystems.removeAll();
    miniSearchWayfindingSystems.addAll(allWayfindingSystems);
  } catch (error) {
    console.error("Error fetching wayfinding systems:", error);
    showToast(gettext("Failed to load wayfinding systems"), "error");
  }
}

/* =============================================================================
   3) Search, Filter, Sort Logic
============================================================================= */
function applySearchFilterSort() {
  let filtered = [...allWayfindingSystems];

  // Search
  if (searchQuery.trim()) {
    const searchResults = miniSearchWayfindingSystems.search(searchQuery);
    const searchIds = new Set(searchResults.map((result) => result.id));
    filtered = filtered.filter((system) => searchIds.has(system.id));
  }

  // Sort
  filtered.sort((a, b) => {
    let aVal, bVal;

    switch (sortBy) {
      case "name":
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case "created_at":
      case "updated_at":
        aVal = new Date(a[sortBy]);
        bVal = new Date(b[sortBy]);
        break;
      default:
        aVal = a[sortBy];
        bVal = b[sortBy];
    }

    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  renderWayfindingSystemsTable(filtered);
  updateSortIndicators();
}

function handleSortClick(column) {
  if (sortBy === column) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortBy = column;
    sortDir = "asc";
  }
  applySearchFilterSort();
}

function updateSortIndicators() {
  // Reset all indicators
  [sortIndicatorName, sortIndicatorCreated, sortIndicatorUpdated].forEach(
    (indicator) => {
      indicator.textContent = "";
    },
  );

  // Set the active indicator
  let activeIndicator;
  switch (sortBy) {
    case "name":
      activeIndicator = sortIndicatorName;
      break;
    case "created_at":
      activeIndicator = sortIndicatorCreated;
      break;
    case "updated_at":
      activeIndicator = sortIndicatorUpdated;
      break;
  }

  if (activeIndicator) {
    activeIndicator.textContent =
      sortDir === "asc" ? "arrow_upward" : "arrow_downward";
  }
}

/* =============================================================================
   4) Table Rendering
============================================================================= */
function renderWayfindingSystemsTable(wayfindingSystems) {
  wayfindingSystemsTableBody.innerHTML = "";

  if (wayfindingSystems.length === 0) {
    emptyListAlert.classList.remove("d-none");
    return;
  }

  emptyListAlert.classList.add("d-none");

  wayfindingSystems.forEach((system) => {
    const row = document.createElement("tr");

    const createdDate = new Date(system.updated_at).toLocaleDateString();
    const updatedDate = new Date(system.updated_at).toLocaleDateString();

    row.innerHTML = `
      <td class="fw-medium">${escapeHtml(system.name)}</td>
      <td class="text-muted">${createdDate}</td>
      <td class="text-muted">${updatedDate}</td>
      <td>
        <div class="btn-group" role="group">
          <button class="btn btn-outline-primary btn-sm" onclick="openWayfindingSystem(${system.id})" title="${gettext("Open Wayfinding System")}">
            <span class="material-symbols-outlined">open_in_new</span>
          </button>
          <button class="btn btn-outline-info btn-sm" onclick="getDisplayLink(${system.id})" title="${gettext("Get Display Link")}">
            <span class="material-symbols-outlined">link</span>
          </button>
          <button class="btn btn-outline-secondary btn-sm" onclick="openRenameWayfindingSystemModal(${system.id}, '${escapeHtml(system.name)}')" title="${gettext("Rename")}">
            <span class="material-symbols-outlined">edit</span>
          </button>
          <button class="btn btn-outline-danger btn-sm" onclick="openDeleteWayfindingSystemModal(${system.id}, '${escapeHtml(system.name)}')" title="${gettext("Delete")}">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </td>
    `;

    wayfindingSystemsTableBody.appendChild(row);
  });
}

// Function for opening wayfinding system editor
window.openWayfindingSystem = (id) => {
  window.location.href = `/wayfinding?id=${id}`;
};

// Function for getting display link with API key
window.getDisplayLink = async (wayfindingSystemId) => {
  try {
    // Fetch the branch API key
    const response = await genericFetch(
      `${BASE_URL}/api/branch-api-key?branch_id=${selectedBranchID}`,
      "GET",
      null,
      {
        Authorization: `Bearer ${token}`,
      },
    );

    if (response && response.api_key) {
      // Generate the user-facing URL with API key
      const displayUrl = `${window.location.origin}/wayfinding-user-faced?id=${wayfindingSystemId}&api_key=${response.api_key}`;

      // Show modal with the link
      showDisplayLinkModal(displayUrl);
    } else {
      showToast(gettext("Failed to get API key for this branch"), "error");
    }
  } catch (error) {
    console.error("Error fetching display link:", error);
    showToast(gettext("Failed to generate display link"), "error");
  }
};

// Function to show modal with display link
function showDisplayLinkModal(url) {
  // Create modal if it doesn't exist
  let modal = document.getElementById("displayLinkModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "displayLinkModal";
    modal.className = "modal fade";
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${gettext("Display Link")}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p>${gettext("Use this link to display the wayfinding system on screens/displays:")}</p>
            <div class="input-group">
              <input type="text" class="form-control" id="displayLinkInput" readonly>
              <button class="btn btn-outline-secondary" type="button" id="copyDisplayLinkBtn">
                <span class="material-symbols-outlined">content_copy</span>
                ${gettext("Copy")}
              </button>
            </div>
            <small class="text-muted mt-2 d-block">
              ${gettext("This link includes the API key and can be used directly on displays without user authentication.")}
            </small>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Set the URL and show modal
  document.getElementById("displayLinkInput").value = url;
  const bootstrapModal = new bootstrap.Modal(modal);
  bootstrapModal.show();

  // Copy functionality
  document.getElementById("copyDisplayLinkBtn").onclick = () => {
    const input = document.getElementById("displayLinkInput");
    input.select();
    input.setSelectionRange(0, 99999); // For mobile devices
    navigator.clipboard
      .writeText(input.value)
      .then(() => {
        showToast(gettext("Link copied to clipboard!"), "success");
      })
      .catch(() => {
        // Fallback for older browsers
        document.execCommand("copy");
        showToast(gettext("Link copied to clipboard!"), "success");
      });
  };
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
