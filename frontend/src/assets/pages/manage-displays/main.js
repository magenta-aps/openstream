// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import * as bootstrap from "bootstrap";
import "./style.scss";
import {
  makeActiveInNav,
  updateNavbarBranchName,
  updateNavbarUsername,
  token,
  selectedBranchID,
  showToast,
  autoHyphenate,
  initSignOutButton,
} from "../../utils/utils";
import {
  translateHTML,
  fetchUserLangugage,
  gettext,
} from "../../utils/locales";
import Sortable from "sortablejs";

// Initialize translations
(async () => {
  await fetchUserLangugage();
  translateHTML();
})();

makeActiveInNav("/manage-displays");
updateNavbarBranchName();
updateNavbarUsername();

import { Calendar } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { BASE_URL } from "../../utils/constants";

// -------------------------
// LOCALE SETUP
// -------------------------
const calendarLocale = document.documentElement.lang || "da";

// -------------------------
// GLOBAL STATE & MODALS
// -------------------------
let groupsData = []; // Fetched from /api/display-website-groups/
let displaysData = []; // Fetched from /api/display-websites/
let scheduledEvents = []; // Fetched from /api/scheduled-contents/ (using multiple group IDs)
let recurringEvents = []; // Fetched from /api/recurring-scheduled-contents/
let slideshowPlaylists = []; // Fetched from /api/slideshow-playlists/
let slideshows = [];
let calendar = null;
let selectedGroupIds = []; // All groups are selected by default on first load
let ungroupedDisplays = [];
let currentView = "calendar"; // 'calendar' or 'list'
let draggedItem = null; // For tracking dragged display items

let addGroupModal,
  editGroupModal,
  editDisplayModal,
  addScheduledModal,
  editScheduledModal,
  addRecurringScheduledModal,
  editRecurringScheduledModal;

const combineToggleCreate = document.getElementById("combineWithDefaultToggle");
const combineToggleEdit = document.getElementById(
  "editCombineWithDefaultToggle",
);

const combineInputMappings = [
  {
    toggleInput: combineToggleCreate,
    slideDropdownId: "scheduledSlideshowSelect",
    groupDropdownId: "scheduledGroup",
    toggleWarningContainerId: "toggleWarningCreate",
  },
  {
    toggleInput: combineToggleEdit,
    slideDropdownId: "editScheduledSlideshowSelect",
    groupDropdownId: "editScheduledGroup",
    toggleWarningContainerId: "toggleWarningEdit",
  },
];

let apiKey = null;
async function fetchAPIKey() {
  try {
    // Fetch the API key from your endpoint.
    const response = await fetch(
      `${BASE_URL}/api/branch-api-key?branch_id=${selectedBranchID}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      console.error("Failed to fetch API key:", response.statusText);
      alert(gettext("Failed to fetch API key."));
      document.getElementById("copy-api-key-btn").style.display = "none";
    }

    const data = await response.json();
    apiKey = data.api_key;
  } catch (error) {
    console.error("Error fetching registration URL:", error);
    alert(gettext("Error fetching registration URL."));
  }
}

fetchAPIKey();

function showConfirmModal(message, onConfirm) {
  const confirmModalEl = document.getElementById("confirmModal");
  const confirmModal = new bootstrap.Modal(confirmModalEl);

  // Force a higher z-index on the modal element.
  confirmModalEl.style.zIndex = "2000"; // Adjust as needed

  // When the modal is shown, adjust the backdrop's z-index too.
  confirmModalEl.addEventListener(
    "shown.bs.modal",
    function () {
      const backdrops = document.getElementsByClassName("modal-backdrop");
      if (backdrops.length > 0) {
        // Set the last added backdrop to a lower z-index than our modal.
        backdrops[backdrops.length - 1].style.zIndex = "1999";
      }
    },
    { once: true },
  );

  // Set the custom message.
  document.getElementById("confirmModalMessage").textContent = message;

  // Replace previous click listeners by cloning the button.
  const oldOkButton = document.getElementById("confirmOkButton");
  const newOkButton = oldOkButton.cloneNode(true);
  oldOkButton.parentNode.replaceChild(newOkButton, oldOkButton);

  newOkButton.addEventListener("click", function () {
    onConfirm();
    confirmModal.hide();
  });

  confirmModal.show();
}

async function deleteDisplay() {
  const displayIdEl = document.getElementById("editDisplayId");
  if (!displayIdEl) {
    console.error("deleteDisplay: editDisplayId element not found");
    showToast(gettext("Internal error: missing display id."), gettext("Error"));
    return;
  }
  const displayId = displayIdEl.value;
  showConfirmModal(
    gettext("Are you sure you want to delete this display?"),
    async () => {
      try {
        const res = await fetch(
          `${BASE_URL}/api/display-websites/${displayId}/?branch_id=${selectedBranchID}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (res.ok) {
          await refreshData();
          if (editDisplayModal) {
            editDisplayModal.hide();
          }
        } else {
          console.error("Failed to delete display");
        }
      } catch (error) {
        console.error("Error deleting display:", error);
      }
    },
  );
}

// -------------------------
// UTILITY FUNCTIONS
// -------------------------
function getDistinctColor(id) {
  const hue = (id * 137) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

function validateDisplayGroupAspectRatio(displayId, targetGroupId) {
  // Find the display
  const display = displaysData.find((d) => d.id === displayId);
  if (!display) return false;

  // If moving to ungrouped (targetGroupId is null), allow it
  if (targetGroupId === null) return true;

  // Find the target group
  const targetGroup = groupsData.find((g) => g.id === targetGroupId);
  if (!targetGroup) return false;

  // Check if aspect ratios match
  const displayAspectRatio = display.aspect_ratio || "16:9";
  const groupAspectRatio = targetGroup.aspect_ratio || "16:9";

  return displayAspectRatio === groupAspectRatio;
}

function populateSlideshowPlaylistDropdown(
  dropdownId,
  selectedValue = null,
  placeholder = gettext("Please select a default slideshow playlist..."),
  aspectRatioFilter = null,
) {
  let filteredPlaylists = slideshowPlaylists;
  if (aspectRatioFilter) {
    filteredPlaylists = slideshowPlaylists.filter(
      (playlist) => playlist.aspect_ratio === aspectRatioFilter,
    );
  }
  populateDropdown(dropdownId, filteredPlaylists, placeholder, selectedValue);
}

// -------------------------
// API CALL FUNCTIONS
// -------------------------
async function loadGroups() {
  try {
    const res = await fetch(
      `${BASE_URL}/api/display-website-groups/?branch_id=${selectedBranchID}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (res.ok) {
      groupsData = await res.json();

      // On first load, select all groups by default.
      if (selectedGroupIds.length === 0) {
        selectedGroupIds = groupsData.map((g) => g.id);
      }
    } else {
      console.error("Failed to load groups:", res.statusText);
    }
  } catch (error) {
    console.error("Error loading groups:", error);
  }
}
function openAddGroupModal() {
  document.getElementById("addGroupName").value = "";

  // Check which default content type is selected.
  const defaultContentType = document.querySelector(
    'input[name="defaultContentType"]:checked',
  ).value;

  if (defaultContentType === "slideshow") {
    // Show slideshow container, hide playlist container.
    document.getElementById("addDefaultSlideshowContainer").style.display =
      "block";
    document.getElementById("addDefaultPlaylistContainer").style.display =
      "none";
    // Populate the slideshow dropdown.
    populateSlideshowsDropdown(
      "addGroupDefaultSlideshow",
      null,
      gettext("Select a default slideshow"),
      "16:9", // Default aspect ratio
    );
  } else {
    // Show playlist container, hide slideshow container.
    document.getElementById("addDefaultSlideshowContainer").style.display =
      "none";
    document.getElementById("addDefaultPlaylistContainer").style.display =
      "block";
    // Populate the playlist dropdown.
    populateSlideshowPlaylistDropdown(
      "addGroupDefaultPlaylist",
      null,
      gettext("Select a default slideshow playlist"),
      "16:9", // Default aspect ratio
    );
  }

  if (addGroupModal) {
    addGroupModal.show();
  }
}

function openEditGroupModal(groupId) {
  const group = groupsData.find((g) => g.id === groupId);
  if (!group) return;
  document.getElementById("editGroupId").value = group.id;
  document.getElementById("editGroupName").value = group.name;
  document.getElementById("editGroupAspectRatio").value =
    group.aspect_ratio || "16:9";

  // Check which default content is set
  if (group.default_slideshow) {
    // Set the radio button for slideshow
    document.getElementById("editDefaultSlideshow").checked = true;
    // Show slideshow container, hide playlist container
    document.getElementById("editDefaultSlideshowContainer").style.display =
      "block";
    document.getElementById("editDefaultPlaylistContainer").style.display =
      "none";
    // Populate the slideshow dropdown with manage_content and set the current selection
    populateSlideshowsDropdown(
      "editGroupDefaultSlideshow",
      group.default_slideshow.id,
      gettext("Select a default slideshow"),
      group.aspect_ratio || "16:9",
    );
  } else if (group.default_playlist) {
    // Set the radio button for playlist
    document.getElementById("editDefaultPlaylist").checked = true;
    // Show playlist container, hide slideshow container
    document.getElementById("editDefaultSlideshowContainer").style.display =
      "none";
    document.getElementById("editDefaultPlaylistContainer").style.display =
      "block";
    // Populate the playlist dropdown with slideshowPlaylists and set the current selection
    populateSlideshowPlaylistDropdown(
      "editGroupDefaultPlaylist",
      group.default_playlist.id,
      gettext("Select a default slideshow playlist"),
      group.aspect_ratio || "16:9",
    );
  }
  if (editGroupModal) {
    editGroupModal.show();
  }
}

async function saveGroupChanges() {
  const groupId = document.getElementById("editGroupId").value;
  const groupName = document.getElementById("editGroupName").value.trim();
  const aspectRatio = document.getElementById("editGroupAspectRatio").value;

  if (!groupName) {
    alert(gettext("Group name cannot be empty!"));
    return;
  }
  if (!aspectRatio) {
    alert(gettext("Please select an aspect ratio."));
    return;
  }

  let payload = { name: groupName, aspect_ratio: aspectRatio };

  // Check which default content type is selected
  const defaultContentType = document.querySelector(
    'input[name="editDefaultContentType"]:checked',
  ).value;
  if (defaultContentType === "slideshow") {
    const slideshowId = document.getElementById(
      "editGroupDefaultSlideshow",
    ).value;
    if (!slideshowId) {
      alert(gettext("Please select a default slideshow."));
      return;
    }
    payload.default_slideshow_id = parseInt(slideshowId);
    payload.default_playlist_id = null; // Clear playlist
  } else if (defaultContentType === "playlist") {
    const playlistId = document.getElementById(
      "editGroupDefaultPlaylist",
    ).value;
    if (!playlistId) {
      alert(gettext("Please select a default playlist."));
      return;
    }
    payload.default_playlist_id = parseInt(playlistId);
    payload.default_slideshow_id = null; // Clear slideshow
  }

  try {
    const res = await fetch(
      `${BASE_URL}/api/display-website-groups/${groupId}/?branch_id=${selectedBranchID}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
    );
    if (res.ok) {
      await refreshData();
      await refreshCalendarEvents();
      if (editGroupModal) {
        editGroupModal.hide();
      }
    } else {
      console.error("Failed to update group");
    }
  } catch (error) {
    console.error("Error updating group:", error);
  }
}

async function deleteGroup() {
  const groupId = document.getElementById("editGroupId").value;
  if (!groupId) return;

  showConfirmModal(
    gettext("Are you sure you want to delete this group?"),
    async () => {
      try {
        const res = await fetch(
          `${BASE_URL}/api/display-website-groups/${groupId}/?branch_id=${selectedBranchID}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (res.ok) {
          await refreshData();
          if (editGroupModal) {
            editGroupModal.hide();
          }
          showToast(gettext("Group deleted"), gettext("Success"));
        } else {
          let err = null;
          try {
            err = await res.json();
          } catch (e) {
            err = { status: res.status, statusText: res.statusText };
          }
          console.error("Failed to delete group", err);
          showToast(JSON.stringify(err), gettext("Error"));
        }
      } catch (error) {
        console.error("Error deleting group:", error);
        showToast(String(error), gettext("Error"));
      }
    },
  );
}

function openEditDisplayModal(groupId, displayId) {
  const copyNotification = document.getElementById("copyNotification");
  if (copyNotification) copyNotification.style.display = "none";

  const group = groupsData.find((g) => g.id === groupId);
  if (!group) {
    console.warn("openEditDisplayModal: group not found", groupId);
    return;
  }
  const display =
    group.displays && group.displays.find((d) => d.id === displayId);
  if (!display) {
    console.warn("openEditDisplayModal: display not found", displayId);
    return;
  }

  const editDisplayGroupIdEl = document.getElementById("editDisplayGroupId");
  const editDisplayIdEl = document.getElementById("editDisplayId");
  const editDisplayNameEl = document.getElementById("editDisplayName");
  const editDisplayAspectRatioEl = document.getElementById(
    "editDisplayAspectRatio",
  );
  const editDisplayUrlInputEl = document.getElementById("editDisplayUrlInput");

  if (editDisplayGroupIdEl) editDisplayGroupIdEl.value = groupId;
  if (editDisplayIdEl) editDisplayIdEl.value = displayId;
  if (editDisplayNameEl) editDisplayNameEl.value = display.name || "";
  if (editDisplayAspectRatioEl)
    editDisplayAspectRatioEl.value = display.aspect_ratio || "16:9";

  // Build URL dynamically using current domain
  const urlPath =
    "/open-screen?displayWebsiteId=" +
    display.id +
    "&apiKey=" +
    (apiKey || "") +
    "&mode=slideshow-player";
  const fullUrl = window.location.origin + urlPath;
  if (editDisplayUrlInputEl) editDisplayUrlInputEl.value = fullUrl;

  if (editDisplayModal) {
    editDisplayModal.show();
  }
}

function copyDisplayUrl() {
  const inputEl = document.getElementById("editDisplayUrlInput");
  if (!inputEl) {
    console.warn("copyDisplayUrl: editDisplayUrlInput not found");
    showToast(gettext("No URL to copy."), gettext("Error"));
    return;
  }
  const url = inputEl.value || "";
  navigator.clipboard
    .writeText(url)
    .then(() => {
      const note = document.getElementById("copyNotification");
      if (note) note.style.display = "block";
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
      showToast(gettext("Failed to copy URL."), gettext("Error"));
    });
}

// copyRegistrationUrl implemented later with aspect_ratio support and improved UX

async function saveDisplayChanges() {
  const displayIdEl = document.getElementById("editDisplayId");
  const displayNameEl = document.getElementById("editDisplayName");
  const aspectRatioEl = document.getElementById("editDisplayAspectRatio");

  if (!displayIdEl) {
    console.error("saveDisplayChanges: editDisplayId element not found");
    showToast(gettext("Internal error: missing display id."), gettext("Error"));
    return;
  }
  const displayId = displayIdEl.value;
  const displayName = displayNameEl ? displayNameEl.value.trim() : "";
  const aspectRatio = aspectRatioEl ? aspectRatioEl.value : "";

  if (!displayName) {
    alert(gettext("Display name cannot be empty!"));
    return;
  }
  if (!aspectRatio) {
    alert(gettext("Please select an aspect ratio."));
    return;
  }

  try {
    const res = await fetch(
      `${BASE_URL}/api/display-websites/${displayId}/?branch_id=${selectedBranchID}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: displayName, aspect_ratio: aspectRatio }),
      },
    );
    if (res.ok) {
      await refreshData();
      if (editDisplayModal) {
        editDisplayModal.hide();
      }
    } else {
      console.error("Failed to update display");
    }
  } catch (error) {
    console.error("Error updating display:", error);
  }
}

async function loadDisplays() {
  try {
    const res = await fetch(
      `${BASE_URL}/api/display-websites/?branch_id=${selectedBranchID}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (res.ok) {
      displaysData = await res.json();
    } else {
      console.error("Failed to load displays:", res.statusText);
    }
  } catch (error) {
    console.error("Error loading displays:", error);
  }
}

async function loadSlideshowPlaylists() {
  try {
    const res = await fetch(
      `${BASE_URL}/api/slideshow-playlists/?branch_id=${selectedBranchID}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (res.ok) {
      slideshowPlaylists = await res.json();
    } else {
      console.error("Failed to load slideshow playlists:", res.statusText);
    }
  } catch (error) {
    console.error("Error loading slideshow playlists:", error);
  }
}

/**
 * Load scheduled events from the backend for the toggled groups.
 * Uses the new "ids" parameter (a comma‑separated list).
 */
async function loadScheduledEvents() {
  if (selectedGroupIds.length === 0) {
    scheduledEvents = [];
    return;
  }
  const idsParam = selectedGroupIds.join(",");
  try {
    const res = await fetch(
      `${BASE_URL}/api/scheduled-contents/?ids=${idsParam}&branch_id=${selectedBranchID}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (res.ok) {
      scheduledEvents = await res.json();
    } else {
      console.error("Failed to load scheduled events:", res.statusText);
    }
  } catch (error) {
    console.error("Error loading scheduled events:", error);
  }
}

/**
 * Load recurring scheduled events from the backend for the toggled groups.
 */
async function loadRecurringScheduledEvents() {
  if (selectedGroupIds.length === 0) {
    recurringEvents = [];
    return;
  }
  const idsParam = selectedGroupIds.join(",");
  try {
    const res = await fetch(
      `${BASE_URL}/api/recurring-scheduled-contents/?ids=${idsParam}&branch_id=${selectedBranchID}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (res.ok) {
      recurringEvents = await res.json();
    } else {
      console.error(
        "Failed to load recurring scheduled events:",
        res.statusText,
      );
    }
  } catch (error) {
    console.error("Error loading recurring scheduled events:", error);
  }
}

async function saveNewGroup() {
  const groupName = document.getElementById("addGroupName").value.trim();
  const aspectRatio = document.getElementById("addGroupAspectRatio").value;

  if (!groupName) {
    alert(gettext("Please enter a group name."));
    return;
  }
  if (!aspectRatio) {
    alert(gettext("Please select an aspect ratio."));
    return;
  }

  // Determine selected default content type
  const contentType = document.querySelector(
    'input[name="defaultContentType"]:checked',
  ).value;
  let payload = { name: groupName, aspect_ratio: aspectRatio };
  if (contentType === "slideshow") {
    const slideshowId = document.getElementById(
      "addGroupDefaultSlideshow",
    ).value;
    if (!slideshowId) {
      alert(gettext("Please select a slideshow."));
      return;
    }
    payload.default_slideshow_id = parseInt(slideshowId);
  } else {
    const playlistId = document.getElementById("addGroupDefaultPlaylist").value;
    if (!playlistId) {
      alert(gettext("Please select a playlist."));
      return;
    }
    payload.default_playlist_id = parseInt(playlistId);
  }
  try {
    const res = await fetch(
      `${BASE_URL}/api/display-website-groups/?branch_id=${selectedBranchID}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
    );
    if (res.ok) {
      await refreshData();
      if (addGroupModal) {
        addGroupModal.hide();
      }
    } else {
      console.error("Failed to create group");
    }
  } catch (error) {
    console.error("Error creating group:", error);
  }
}

function combineGroupsAndDisplays() {
  // Assign displays to their groups.
  groupsData.forEach((group) => {
    group.displays = displaysData.filter(
      (display) => display.display_website_group === group.id,
    );
  });
  // Create a separate list for ungrouped displays.
  ungroupedDisplays = displaysData.filter(
    (display) => display.display_website_group === null,
  );
}

function renderUngroupedDisplays() {
  // If there are no ungrouped displays, exit early
  if (!ungroupedDisplays || !ungroupedDisplays.length) return;

  const groupsContainer = document.getElementById("groupsContainer");

  // Create a "group"-styled container for ungrouped displays
  const groupDiv = document.createElement("div");
  groupDiv.classList.add("group", "group-ungrouped");
  groupDiv.setAttribute("data-group-id", "null"); // so we know it's ungrouped

  // Create the group header
  const headerDiv = document.createElement("div");
  headerDiv.classList.add("group-header");

  // Left side: icon + title
  const leftDiv = document.createElement("div");
  leftDiv.classList.add("d-flex", "align-items-center");

  const warningEmoji = document.createElement("span");
  warningEmoji.classList.add("me-2", "ms-1");
  warningEmoji.style.fontSize = "1.3em";
  warningEmoji.innerHTML = '<i class="material-symbols-outlined">warning</i>';
  leftDiv.appendChild(warningEmoji);

  const titleSpan = document.createElement("span");
  titleSpan.classList.add("group-title");
  titleSpan.textContent = gettext("Inactive Displays");
  leftDiv.appendChild(titleSpan);

  headerDiv.appendChild(leftDiv);

  // Right side: just the expand/collapse icon
  const rightDiv = document.createElement("div");
  rightDiv.classList.add("d-flex", "align-items-center");

  headerDiv.appendChild(rightDiv);

  // Append the header to the main group div
  groupDiv.appendChild(headerDiv);

  // Create the container for the ungrouped display items
  const ungroupedDisplaysDiv = document.createElement("div");
  ungroupedDisplaysDiv.classList.add("group-displays");
  // By default, keep it expanded (like your current groups)
  ungroupedDisplaysDiv.style.display = "block";

  // Render each ungrouped display
  ungroupedDisplays.forEach((display) => {
    const displayDiv = document.createElement("div");
    displayDiv.classList.add("display-item");
    displayDiv.setAttribute("data-display-id", display.id);

    const dragIndicator = document.createElement("span");
    dragIndicator.classList.add("material-symbols-outlined", "me-2");
    dragIndicator.textContent = "drag_indicator";
    dragIndicator.style.color = "var(--gray)";
    displayDiv.appendChild(dragIndicator);

    const tvIcon = document.createElement("span");
    tvIcon.classList.add("material-symbols-outlined", "me-2");
    tvIcon.textContent = "tv";
    tvIcon.style.color = "var(--dark-gray)";
    displayDiv.appendChild(tvIcon);

    const displayTitle = document.createElement("span");
    displayTitle.textContent = display.name;
    displayDiv.appendChild(displayTitle);

    // Add aspect ratio badge for ungrouped display
    const displayAspectRatioBadge = document.createElement("span");
    displayAspectRatioBadge.classList.add("badge", "bg-info", "ms-2");
    displayAspectRatioBadge.style.fontSize = "0.6rem";
    displayAspectRatioBadge.textContent = display.aspect_ratio || "16:9";
    displayDiv.appendChild(displayAspectRatioBadge);

    ungroupedDisplaysDiv.appendChild(displayDiv);
  });

  groupDiv.appendChild(ungroupedDisplaysDiv);

  // Finally, append our “ungrouped group” block to the groups container
  groupsContainer.appendChild(groupDiv);

  // Make the ungrouped container sortable so displays can be dragged into real groups
  Sortable.create(ungroupedDisplaysDiv, {
    group: "shared", // Must match the same "shared" group used by real groups
    animation: 150,
    onEnd: async function (evt) {
      const movedDisplayId = parseInt(evt.item.getAttribute("data-display-id"));
      // If the user drags it into another real group
      const newGroupEl = evt.to.closest(".group");
      const newGroupId = newGroupEl
        ? parseInt(newGroupEl.getAttribute("data-group-id"))
        : null; // Or remain null if not dropped in a real group

      // Validate aspect ratio compatibility before making API call
      if (!validateDisplayGroupAspectRatio(movedDisplayId, newGroupId)) {
        const display = displaysData.find((d) => d.id === movedDisplayId);
        const targetGroup = newGroupId
          ? groupsData.find((g) => g.id === newGroupId)
          : null;

        if (targetGroup) {
          showToast(
            gettext(
              `Cannot move display "${display.name}" (${display.aspect_ratio || "16:9"}) to group "${targetGroup.name}" (${targetGroup.aspect_ratio || "16:9"}). Aspect ratios must match.`,
            ),
            "Error",
          );
        }

        // Revert the UI change by refreshing
        await refreshData();
        return;
      }

      try {
        const res = await fetch(
          `${BASE_URL}/api/display-websites/${movedDisplayId}/?branch_id=${selectedBranchID}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ display_website_group: newGroupId }),
          },
        );
        if (res.ok) {
          await refreshData();
        } else {
          console.error("Failed to update display group");
          showToast(gettext("Failed to update display group"), "Error");
          // Revert the UI change
          await refreshData();
        }
      } catch (error) {
        console.error("Error updating display group:", error);
        showToast(gettext("Error updating display group"), "Error");
        // Revert the UI change
        await refreshData();
      }
    },
  });
}

async function checkForNewDisplays() {
  try {
    // Fetch the current list of displays from the API
    const res = await fetch(
      `${BASE_URL}/api/display-websites/?branch_id=${selectedBranchID}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.ok) {
      console.error("Polling failed: Failed to load displays:", res.statusText);
      return; // Exit if the fetch failed
    }

    const fetchedDisplays = await res.json();

    // Get the IDs of displays we currently know about
    const currentDisplayIds = new Set(displaysData.map((d) => d.id));
    let newDisplaysFound = false;

    // Iterate through fetched displays and check for new ones
    fetchedDisplays.forEach((display) => {
      if (!currentDisplayIds.has(display.id)) {
        displaysData.push(display); // Add the new display to the global array
        newDisplaysFound = true;
      }
    });

    // If new displays were added, refresh the UI
    if (newDisplaysFound) {
      // Re-combine displays with groups and re-render the necessary parts
      combineGroupsAndDisplays(); // Ensure new displays are associated correctly
      renderGroups(); // Re-render the groups list
      renderUngroupedDisplays(); // Re-render the ungrouped list

      // Note: Calling refreshData() might be simpler but less efficient
      // as it refetches *all* data (groups, playlists, etc.).
      // The targeted rendering above is generally better for polling.
    }
  } catch (error) {
    console.error("Error during display polling:", error);
  }
}

// Inside the DOMContentLoaded event listener, after the initial refreshData() call

// Start polling for new displays every 10 seconds (10000 milliseconds)
setInterval(checkForNewDisplays, 10000);

async function loadSlideshows() {
  try {
    const res = await fetch(
      `${BASE_URL}/api/manage_content/?includeSlideshowData=false&branch_id=${selectedBranchID}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (res.ok) {
      slideshows = await res.json();
    } else {
      console.error("Failed to load manage_content:", res.statusText);
    }
  } catch (error) {
    console.error("Error loading manage_content:", error);
  }
}

async function copyAPIKey() {
  try {
    // Fetch the API key from your endpoint.
    const response = await fetch(
      `${BASE_URL}/api/branch-api-key?branch_id=${selectedBranchID}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      console.error("Failed to fetch API key:", response.statusText);
      alert(gettext("Failed to fetch API key."));
      document.getElementById("copy-api-key-btn").style.display = "none";
      return;
    }

    const data = await response.json();
    const apiKey = data.api_key;

    // Build the full registration URL. Adjust the base URL if needed.
    let registrationUrl = `${window.location.origin}/connect-screen?apiKey=${apiKey}`;
    const selector = document.getElementById("registrationAspectRatio");
    if (selector && selector.value) {
      registrationUrl += `&aspect_ratio=${encodeURIComponent(selector.value)}`;
    }

    // Set the URL into the modal's input.
    const regUrlInputEl = document.getElementById("registrationUrlInput");
    if (regUrlInputEl) {
      regUrlInputEl.value = registrationUrl;
    }

    // Also set the API key into the dedicated API key field (read-only)
    const regApiKeyInputEl = document.getElementById("registrationApiKeyInput");
    if (regApiKeyInputEl) {
      regApiKeyInputEl.value = apiKey || "";
    }

    // Show which branch this registration applies to (if available in localStorage)
    const branchNameEl = document.getElementById("registrationBranchName");
    try {
      const branchName = localStorage.getItem("selectedBranchName") || "";
      if (branchNameEl) branchNameEl.innerText = branchName || "(unknown)";
    } catch (e) {
      // ignore localStorage access errors
    }

    // If the user changes the aspect ratio in the modal, update the input live.
    const aspectSelector = document.getElementById("registrationAspectRatio");
    const updateRegistrationUrlInput = () => {
      const inputEl = document.getElementById("registrationUrlInput");
      if (!inputEl) return;
      let url = inputEl.value || "";
      try {
        const u = new URL(url);
        // remove any existing aspect_ratio param
        u.searchParams.delete("aspect_ratio");
        if (aspectSelector && aspectSelector.value) {
          u.searchParams.set("aspect_ratio", aspectSelector.value);
        }
        inputEl.value = u.toString();
      } catch (e) {
        // fallback: simple append/remove
        url = url.replace(/([?&])aspect_ratio=[^&]*&?/, "$1");
        url = url.replace(/[?&]$/, "");
        if (aspectSelector && aspectSelector.value) {
          url +=
            (url.includes("?") ? "&" : "?") +
            `aspect_ratio=${encodeURIComponent(aspectSelector.value)}`;
        }
        inputEl.value = url;
      }
    };

    if (aspectSelector) {
      // Make sure we don't attach multiple listeners if modal opened repeatedly
      aspectSelector.removeEventListener("change", updateRegistrationUrlInput);
      aspectSelector.addEventListener("change", updateRegistrationUrlInput);
    }

    // Show the modal.
    if (registrationUrlModal) {
      registrationUrlModal.show();
    }
  } catch (error) {
    console.error("Error fetching registration URL:", error);
    alert(gettext("Error fetching registration URL."));
  }
}

let registrationUrlModal;

function initEventListeners() {
  // Button event listeners
  document
    .getElementById("open-add-group-modal-btn")
    ?.addEventListener("click", () => {
      openAddGroupModal();
    });

  document.getElementById("deleteDisplayBtn")?.addEventListener("click", () => {
    deleteDisplay();
  });

  document
    .getElementById("saveGroupChangesBtn")
    ?.addEventListener("click", () => {
      saveGroupChanges();
    });

  document
    .getElementById("save-new-group-btn")
    ?.addEventListener("click", () => {
      saveNewGroup();
    });

  document.getElementById("copy-api-key-btn")?.addEventListener("click", () => {
    copyAPIKey();
  });

  document.getElementById("toggleExpand")?.addEventListener("click", () => {
    toggleExpandAll();
  });

  document.getElementById("toggleCheckAll")?.addEventListener("click", () => {
    toggleCheckAll();
  });

  document
    .getElementById("save-display-changes-btn")
    ?.addEventListener("click", () => {
      saveDisplayChanges();
    });

  document
    .getElementById("copy-registration-url-btn")
    ?.addEventListener("click", () => {
      copyRegistrationUrl();
    });

  // Copy API key button in registration modal
  document
    .getElementById("copy-registration-api-key-btn")
    ?.addEventListener("click", async () => {
      const inputEl = document.getElementById("registrationApiKeyInput");
      const notifId = "registrationApiKeyCopyNotification";
      if (!inputEl) {
        console.warn("registrationApiKeyInput not found");
        return;
      }
      try {
        await navigator.clipboard.writeText(inputEl.value || "");
        const notif = document.getElementById(notifId);
        if (notif) {
          notif.style.display = "inline-block";
          setTimeout(() => {
            notif.style.display = "none";
          }, 1500);
        }
      } catch (e) {
        console.error("Failed to copy API key:", e);
        alert(gettext("Failed to copy API key to clipboard."));
      }
    });

  document
    .getElementById("save-scheduled-content-btn")
    ?.addEventListener("click", async () => {
      await saveScheduledContent();
    });

  document.getElementById("copyUrlBtn")?.addEventListener("click", () => {
    copyDisplayUrl();
  });

  // Delete group button (with safety check)
  const deleteGroupBtn = document.getElementById("deleteGroupBtn");
  if (deleteGroupBtn) {
    deleteGroupBtn.addEventListener("click", () => {
      deleteGroup();
    });
  }

  // Recurring content event listeners
  document
    .getElementById("save-recurring-scheduled-content-btn")
    ?.addEventListener("click", async () => {
      await saveRecurringScheduledContent();
    });

  document
    .getElementById("updateRecurringScheduledContentBtn")
    ?.addEventListener("click", async () => {
      await updateRecurringScheduledContent();
    });

  document
    .getElementById("deleteRecurringScheduledContentBtn")
    ?.addEventListener("click", () => {
      deleteRecurringScheduledContent();
    });

  document
    .getElementById("deleteScheduledContentBtn")
    ?.addEventListener("click", () => {
      deleteScheduledContent();
    });

  document
    .getElementById("updateScheduledContentBtn")
    ?.addEventListener("click", async () => {
      await updateScheduledContent();
    });

  // Helper function to refresh edit group content dropdowns based on aspect ratio
  function refreshEditGroupContentDropdowns() {
    const aspectRatio = document.getElementById("editGroupAspectRatio").value;
    const contentType = document.querySelector(
      'input[name="editDefaultContentType"]:checked',
    )?.value;

    if (contentType === "slideshow") {
      populateSlideshowsDropdown(
        "editGroupDefaultSlideshow",
        null,
        gettext("Select a default slideshow"),
        aspectRatio,
      );
    } else if (contentType === "playlist") {
      populateSlideshowPlaylistDropdown(
        "editGroupDefaultPlaylist",
        null,
        gettext("Select a default slideshow playlist"),
        aspectRatio,
      );
    }
  }

  // Add aspect ratio change listener for edit group modal
  document
    .getElementById("editGroupAspectRatio")
    ?.addEventListener("change", refreshEditGroupContentDropdowns);

  // Add group change listeners for scheduled content
  document
    .getElementById("scheduledGroup")
    ?.addEventListener("change", refreshScheduledContentDropdowns);
  document
    .getElementById("editScheduledGroup")
    ?.addEventListener("change", refreshEditScheduledContentDropdowns);
  document
    .getElementById("recurringScheduledGroup")
    ?.addEventListener("change", refreshRecurringScheduledContentDropdowns);
  document
    .getElementById("editRecurringScheduledGroup")
    ?.addEventListener("change", refreshEditRecurringScheduledContentDropdowns);

  // Content type toggle event listeners
  document.getElementsByName("editDefaultContentType").forEach((elem) => {
    elem.addEventListener("change", function () {
      if (this.value === "slideshow") {
        document.getElementById("editDefaultSlideshowContainer").style.display =
          "block";
        document.getElementById("editDefaultPlaylistContainer").style.display =
          "none";
        refreshEditGroupContentDropdowns();
      } else {
        document.getElementById("editDefaultPlaylistContainer").style.display =
          "block";
        document.getElementById("editDefaultSlideshowContainer").style.display =
          "none";
        refreshEditGroupContentDropdowns();
      }
    });
  });

  // Helper function to refresh add group content dropdowns based on aspect ratio
  function refreshAddGroupContentDropdowns() {
    const aspectRatio = document.getElementById("addGroupAspectRatio").value;
    const contentType = document.querySelector(
      'input[name="defaultContentType"]:checked',
    )?.value;

    if (contentType === "slideshow") {
      populateSlideshowsDropdown(
        "addGroupDefaultSlideshow",
        null,
        gettext("Select a default slideshow"),
        aspectRatio,
      );
    } else if (contentType === "playlist") {
      populateSlideshowPlaylistDropdown(
        "addGroupDefaultPlaylist",
        null,
        gettext("Select a default slideshow playlist"),
        aspectRatio,
      );
    }
  }

  // Add aspect ratio change listener for add group modal
  document
    .getElementById("addGroupAspectRatio")
    ?.addEventListener("change", refreshAddGroupContentDropdowns);

  document
    .getElementById("addDefaultSlideshow")
    ?.addEventListener("change", function () {
      document.getElementById("addDefaultSlideshowContainer").style.display =
        "block";
      document.getElementById("addDefaultPlaylistContainer").style.display =
        "none";
      refreshAddGroupContentDropdowns();
    });

  document
    .getElementById("addDefaultPlaylist")
    ?.addEventListener("change", function () {
      document.getElementById("addDefaultSlideshowContainer").style.display =
        "none";
      document.getElementById("addDefaultPlaylistContainer").style.display =
        "block";
      refreshAddGroupContentDropdowns();
    });

  document.getElementsByName("scheduledContentType").forEach((elem) => {
    elem.addEventListener("change", function () {
      if (this.value === "slideshow") {
        document.getElementById("scheduledSlideshowContainer").style.display =
          "block";
        document.getElementById("scheduledPlaylistContainer").style.display =
          "none";
        refreshScheduledContentDropdowns();
      } else {
        document.getElementById("scheduledSlideshowContainer").style.display =
          "none";
        document.getElementById("scheduledPlaylistContainer").style.display =
          "block";
        refreshScheduledContentDropdowns();
      }
    });
  });

  document
    .getElementsByName("recurringScheduledContentType")
    .forEach((elem) => {
      elem.addEventListener("change", function () {
        if (this.value === "slideshow") {
          document.getElementById(
            "recurringScheduledSlideshowContainer",
          ).style.display = "block";
          document.getElementById(
            "recurringScheduledPlaylistContainer",
          ).style.display = "none";
          refreshRecurringScheduledContentDropdowns();
        } else {
          document.getElementById(
            "recurringScheduledSlideshowContainer",
          ).style.display = "none";
          document.getElementById(
            "recurringScheduledPlaylistContainer",
          ).style.display = "block";
          refreshRecurringScheduledContentDropdowns();
        }
      });
    });

  document
    .getElementsByName("editRecurringScheduledContentType")
    .forEach((elem) => {
      elem.addEventListener("change", function () {
        if (this.value === "slideshow") {
          document.getElementById(
            "editRecurringScheduledSlideshowContainer",
          ).style.display = "block";
          document.getElementById(
            "editRecurringScheduledPlaylistContainer",
          ).style.display = "none";
          refreshEditRecurringScheduledContentDropdowns();
        } else {
          document.getElementById(
            "editRecurringScheduledSlideshowContainer",
          ).style.display = "none";
          document.getElementById(
            "editRecurringScheduledPlaylistContainer",
          ).style.display = "block";
          refreshEditRecurringScheduledContentDropdowns();
        }
      });
    });

  // Combine input mappings event listeners
  combineInputMappings.forEach((entry) => {
    entry.toggleInput.addEventListener("input", (e) => {
      const slides = e.target.checked ? filteredSlideshows() : slideshows;
      populateSlidesWrapper({
        dropdownId: entry.slideDropdownId,
        slideshows: slides,
      });
    });
    document
      .getElementById(entry.groupDropdownId)
      .addEventListener("input", (e) => {
        syncDefaultToggleAndGroup();
      });
  });
}

function copyRegistrationUrl() {
  const input = document.getElementById("registrationUrlInput");
  const selector = document.getElementById("registrationAspectRatio");

  if (!input) return;

  // If user changed selector after the modal opened, update the URL.
  let url = input.value || "";
  if (selector && selector.value) {
    try {
      const u = new URL(url);
      u.searchParams.delete("aspect_ratio");
      u.searchParams.set("aspect_ratio", selector.value);
      url = u.toString();
    } catch (e) {
      // fallback: append
      url = url.replace(/([?&])aspect_ratio=[^&]*&?/, "$1");
      url = url.replace(/[?&]$/, "");
      url +=
        (url.includes("?") ? "&" : "?") +
        `aspect_ratio=${encodeURIComponent(selector.value)}`;
    }
  }

  input.value = url;

  // Programmatic copy: copy the input value to clipboard and show notification if present
  try {
    navigator.clipboard.writeText(url);
    const note = document.getElementById("registrationCopyNotification");
    if (note) {
      note.textContent = gettext("Copied!");
      note.classList.add("show");
      setTimeout(() => note.classList.remove("show"), 1200);
    }
  } catch (err) {
    // Fallback to selecting the input and using execCommand
    input.select();
    document.execCommand("copy");
  }
}

// Helper functions to refresh scheduled content dropdowns based on selected group's aspect ratio
function refreshScheduledContentDropdowns() {
  const groupId = document.getElementById("scheduledGroup")?.value;
  const slideshowSelect = document.getElementById("scheduledSlideshowSelect");
  const playlistSelect = document.getElementById("scheduledPlaylistSelect");

  // Group aspect ratio indicator
  const groupAspectRatioIndicator = document.getElementById(
    "scheduledGroupAspectRatio",
  );
  const groupAspectRatioValue = document.getElementById(
    "scheduledGroupAspectRatioValue",
  );

  // Content aspect ratio indicators
  const slideshowAspectRatioIndicator = document.getElementById(
    "scheduledSlideshowAspectRatio",
  );
  const slideshowAspectRatioValue = document.getElementById(
    "scheduledSlideshowAspectRatioValue",
  );
  const playlistAspectRatioIndicator = document.getElementById(
    "scheduledPlaylistAspectRatio",
  );
  const playlistAspectRatioValue = document.getElementById(
    "scheduledPlaylistAspectRatioValue",
  );

  if (!groupId || groupId === "") {
    // Disable content dropdowns if no group selected
    slideshowSelect.disabled = true;
    playlistSelect.disabled = true;
    slideshowSelect.innerHTML =
      '<option value="" disabled selected>Select Group First</option>';
    playlistSelect.innerHTML =
      '<option value="" disabled selected>Select Group First</option>';

    // Hide aspect ratio indicators
    groupAspectRatioIndicator.style.display = "none";
    slideshowAspectRatioIndicator.style.display = "none";
    playlistAspectRatioIndicator.style.display = "none";
    return;
  }

  // Enable content dropdowns
  slideshowSelect.disabled = false;
  playlistSelect.disabled = false;

  const group = groupsData.find((g) => g.id == groupId);
  const aspectRatio = group ? group.aspect_ratio : null;

  // Show group aspect ratio
  if (aspectRatio) {
    groupAspectRatioValue.textContent = aspectRatio;
    groupAspectRatioIndicator.style.display = "block";
  } else {
    groupAspectRatioIndicator.style.display = "none";
  }

  const contentType = document.querySelector(
    'input[name="scheduledContentType"]:checked',
  )?.value;

  if (contentType === "slideshow") {
    populateSlideshowsDropdown(
      "scheduledSlideshowSelect",
      null,
      gettext("Select a slideshow"),
      aspectRatio,
    );
    if (aspectRatio) {
      slideshowAspectRatioValue.textContent = aspectRatio;
      slideshowAspectRatioIndicator.style.display = "block";
    } else {
      slideshowAspectRatioIndicator.style.display = "none";
    }
    playlistAspectRatioIndicator.style.display = "none";
  } else if (contentType === "playlist") {
    populateSlideshowPlaylistDropdown(
      "scheduledPlaylistSelect",
      null,
      gettext("Select a slideshow playlist"),
      aspectRatio,
    );
    if (aspectRatio) {
      playlistAspectRatioValue.textContent = aspectRatio;
      playlistAspectRatioIndicator.style.display = "block";
    } else {
      playlistAspectRatioIndicator.style.display = "none";
    }
    slideshowAspectRatioIndicator.style.display = "none";
  }
}

function refreshEditScheduledContentDropdowns() {
  const groupId = document.getElementById("editScheduledGroup")?.value;
  const slideshowSelect = document.getElementById(
    "editScheduledSlideshowSelect",
  );
  const playlistSelect = document.getElementById("editScheduledPlaylistSelect");

  if (!groupId || groupId === "") {
    // Disable content dropdowns if no group selected
    slideshowSelect.disabled = true;
    playlistSelect.disabled = true;
    slideshowSelect.innerHTML =
      '<option value="" disabled selected>Select Group First</option>';
    playlistSelect.innerHTML =
      '<option value="" disabled selected>Select Group First</option>';
    return;
  }

  // Enable content dropdowns
  slideshowSelect.disabled = false;
  playlistSelect.disabled = false;

  const group = groupsData.find((g) => g.id == groupId);
  const aspectRatio = group ? group.aspect_ratio : null;
  const contentType = document.querySelector(
    'input[name="editScheduledContentType"]:checked',
  )?.value;

  if (contentType === "slideshow") {
    populateSlideshowsDropdown(
      "editScheduledSlideshowSelect",
      null,
      gettext("Select a slideshow"),
      aspectRatio,
    );
  } else if (contentType === "playlist") {
    populateSlideshowPlaylistDropdown(
      "editScheduledPlaylistSelect",
      null,
      gettext("Select a slideshow playlist"),
      aspectRatio,
    );
  }
}

function refreshRecurringScheduledContentDropdowns() {
  const groupId = document.getElementById("recurringScheduledGroup")?.value;
  const slideshowSelect = document.getElementById(
    "recurringScheduledSlideshowSelect",
  );
  const playlistSelect = document.getElementById(
    "recurringScheduledPlaylistSelect",
  );

  // Group aspect ratio indicator
  const groupAspectRatioIndicator = document.getElementById(
    "recurringScheduledGroupAspectRatio",
  );
  const groupAspectRatioValue = document.getElementById(
    "recurringScheduledGroupAspectRatioValue",
  );

  // Content aspect ratio indicators
  const slideshowAspectRatioIndicator = document.getElementById(
    "recurringScheduledSlideshowAspectRatio",
  );
  const slideshowAspectRatioValue = document.getElementById(
    "recurringScheduledSlideshowAspectRatioValue",
  );
  const playlistAspectRatioIndicator = document.getElementById(
    "recurringScheduledPlaylistAspectRatio",
  );
  const playlistAspectRatioValue = document.getElementById(
    "recurringScheduledPlaylistAspectRatioValue",
  );

  if (!groupId || groupId === "") {
    // Disable content dropdowns if no group selected
    slideshowSelect.disabled = true;
    playlistSelect.disabled = true;
    slideshowSelect.innerHTML =
      '<option value="" disabled selected>Select Group First</option>';
    playlistSelect.innerHTML =
      '<option value="" disabled selected>Select Group First</option>';

    // Hide aspect ratio indicators
    groupAspectRatioIndicator.style.display = "none";
    slideshowAspectRatioIndicator.style.display = "none";
    playlistAspectRatioIndicator.style.display = "none";
    return;
  }

  // Enable content dropdowns
  slideshowSelect.disabled = false;
  playlistSelect.disabled = false;

  const group = groupsData.find((g) => g.id == groupId);
  const aspectRatio = group ? group.aspect_ratio : null;

  // Show group aspect ratio
  if (aspectRatio) {
    groupAspectRatioValue.textContent = aspectRatio;
    groupAspectRatioIndicator.style.display = "block";
  } else {
    groupAspectRatioIndicator.style.display = "none";
  }

  const contentType = document.querySelector(
    'input[name="recurringScheduledContentType"]:checked',
  )?.value;

  if (contentType === "slideshow") {
    populateSlideshowsDropdown(
      "recurringScheduledSlideshowSelect",
      null,
      gettext("Select a slideshow"),
      aspectRatio,
    );
    if (aspectRatio) {
      slideshowAspectRatioValue.textContent = aspectRatio;
      slideshowAspectRatioIndicator.style.display = "block";
    } else {
      slideshowAspectRatioIndicator.style.display = "none";
    }
    playlistAspectRatioIndicator.style.display = "none";
  } else if (contentType === "playlist") {
    populateSlideshowPlaylistDropdown(
      "recurringScheduledPlaylistSelect",
      null,
      gettext("Select a slideshow playlist"),
      aspectRatio,
    );
    if (aspectRatio) {
      playlistAspectRatioValue.textContent = aspectRatio;
      playlistAspectRatioIndicator.style.display = "block";
    } else {
      playlistAspectRatioIndicator.style.display = "none";
    }
    slideshowAspectRatioIndicator.style.display = "none";
  }
}

function refreshEditRecurringScheduledContentDropdowns() {
  const groupId = document.getElementById("editRecurringScheduledGroup")?.value;
  const slideshowSelect = document.getElementById(
    "editRecurringScheduledSlideshowSelect",
  );
  const playlistSelect = document.getElementById(
    "editRecurringScheduledPlaylistSelect",
  );

  if (!groupId || groupId === "") {
    // Disable content dropdowns if no group selected
    slideshowSelect.disabled = true;
    playlistSelect.disabled = true;
    slideshowSelect.innerHTML =
      '<option value="" disabled selected>Select Group First</option>';
    playlistSelect.innerHTML =
      '<option value="" disabled selected>Select Group First</option>';
    return;
  }

  // Enable content dropdowns
  slideshowSelect.disabled = false;
  playlistSelect.disabled = false;

  const group = groupsData.find((g) => g.id == groupId);
  const aspectRatio = group ? group.aspect_ratio : null;
  const contentType = document.querySelector(
    'input[name="editRecurringScheduledContentType"]:checked',
  )?.value;

  if (contentType === "slideshow") {
    populateSlideshowsDropdown(
      "editRecurringScheduledSlideshowSelect",
      null,
      gettext("Select a slideshow"),
      aspectRatio,
    );
  } else if (contentType === "playlist") {
    populateSlideshowPlaylistDropdown(
      "editRecurringScheduledPlaylistSelect",
      null,
      gettext("Select a slideshow playlist"),
      aspectRatio,
    );
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  initSignOutButton();
  // Wait a bit to ensure all elements are fully rendered
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Initialize modals with safety checks
  const registrationUrlEl = document.getElementById("registrationUrlModal");
  if (registrationUrlEl) {
    registrationUrlModal = new bootstrap.Modal(registrationUrlEl);
  }

  const addGroupEl = document.getElementById("addGroupModal");
  if (addGroupEl) {
    addGroupModal = new bootstrap.Modal(addGroupEl);
  }

  const editGroupEl = document.getElementById("editGroupModal");
  if (editGroupEl) {
    editGroupModal = new bootstrap.Modal(editGroupEl);
  }

  const editDisplayEl = document.getElementById("editDisplayModal");
  if (editDisplayEl) {
    editDisplayModal = new bootstrap.Modal(editDisplayEl);
  }

  const addScheduledEl = document.getElementById("addScheduledModal");
  if (addScheduledEl) {
    addScheduledModal = new bootstrap.Modal(addScheduledEl);
  }

  const editScheduledEl = document.getElementById("editScheduledModal");
  if (editScheduledEl) {
    editScheduledModal = new bootstrap.Modal(editScheduledEl);
  }

  const addRecurringScheduledEl = document.getElementById(
    "addRecurringScheduledModal",
  );
  if (addRecurringScheduledEl) {
    addRecurringScheduledModal = new bootstrap.Modal(addRecurringScheduledEl);
  }

  const editRecurringScheduledEl = document.getElementById(
    "editRecurringScheduledModal",
  );
  if (editRecurringScheduledEl) {
    editRecurringScheduledModal = new bootstrap.Modal(editRecurringScheduledEl);
  }

  // Set minimum dates for all date inputs to prevent past dates
  setMinimumDatesForInputs();

  // Initialize all event listeners
  initEventListeners();

  // Load all data and initialize UI and calendar
  await refreshData();
  initCalendar();
});

function populateDropdown(
  dropdownId,
  items,
  placeholder,
  selectedValue = null,
) {
  const dropdown = document.getElementById(dropdownId);
  dropdown.innerHTML = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  placeholderOption.disabled = true;
  placeholderOption.selected = selectedValue == null;
  dropdown.appendChild(placeholderOption);

  // 2) group by mode IF the items have a mode. Playlists aren't categorised like this.

  if (items.length > 0) {
    if (items[0].mode) {
      const byMode = items.reduce((acc, item) => {
        if (!acc[item.mode]) acc[item.mode] = [];
        acc[item.mode].push(item);
        return acc;
      }, {});

      Object.keys(byMode).forEach((mode) => {
        // 3) for each mode, emit an optgroup
        const group = document.createElement("optgroup");
        group.label = mode;

        byMode[mode].forEach((item) => {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.name;
          // if you also want to show mode in the text, you can do:
          // option.textContent = `${item.name} (${item.mode})`;
          group.appendChild(option);
        });

        dropdown.appendChild(group);
      });
    } else {
      items.forEach((item) => {
        dropdown.insertAdjacentHTML(
          "beforeend",
          `<option value="${item.id}">${item.name}</option>`,
        );
      });
    }

    // 4) restore selection if needed
    if (selectedValue !== null) {
      dropdown.value = selectedValue;
    }
  }
}

function populateSlideshowsDropdown(
  dropdownId,
  selectedValue = null,
  placeholder = gettext("Select Content"),
  aspectRatioFilter = null,
) {
  let filteredSlideshows = slideshows;
  if (aspectRatioFilter) {
    filteredSlideshows = slideshows.filter(
      (slideshow) => slideshow.aspect_ratio === aspectRatioFilter,
    );
  }
  populateDropdown(dropdownId, filteredSlideshows, placeholder, selectedValue);
}

/**
 * Refresh all data (groups, displays, scheduled events, playlists)
 * then update the sidebar and calendar.
 */
async function refreshData() {
  await Promise.all([
    loadGroups(),
    loadDisplays(),
    loadSlideshowPlaylists(),
    loadSlideshows(),
  ]);
  combineGroupsAndDisplays();
  await Promise.all([loadScheduledEvents(), loadRecurringScheduledEvents()]);
  renderGroups();
  renderUngroupedDisplays(); // <-- Add this line to render ungrouped displays
}

// -------------------------
// RENDERING FUNCTIONS
// -------------------------
function renderGroups() {
  const groupsContainer = document.getElementById("groupsContainer");
  groupsContainer.innerHTML = "";
  groupsData.sort((a, b) => a.name.localeCompare(b.name));

  groupsData.forEach((group, index) => {
    if (!group.color) {
      group.color = getDistinctColor(group.id);
    }

    const groupDiv = document.createElement("div");
    groupDiv.classList.add("group");
    groupDiv.setAttribute("data-group-id", group.id);

    const headerDiv = document.createElement("div");
    headerDiv.classList.add("group-header");
    // Give the entire header a pointer cursor so users see it’s clickable.

    const leftDiv = document.createElement("div");
    leftDiv.classList.add("d-flex", "align-items-center");

    const checkboxDiv = document.createElement("div");
    checkboxDiv.classList.add("group-checkbox");
    checkboxDiv.style.borderColor = group.color;
    checkboxDiv.style.color = group.color;
    if (selectedGroupIds.includes(group.id)) {
      checkboxDiv.classList.add("checkbox-checked");
      checkboxDiv.classList.add("me-2");
      const chk = document.createElement("span");
      chk.classList.add("material-symbols-outlined", "checkbox-checkmark");
      chk.textContent = "check";
      checkboxDiv.appendChild(chk);
    }
    // This is our existing checkbox logic
    checkboxDiv.onclick = (e) => {
      e.stopPropagation(); // Don’t let headerDiv’s click also fire
      const gid = group.id;
      if (selectedGroupIds.includes(gid)) {
        selectedGroupIds = selectedGroupIds.filter((id) => id !== gid);
      } else {
        selectedGroupIds.push(gid);
      }
      refreshCalendarEvents();
      updateSelectAllCheckbox();

      if (checkboxDiv.classList.contains("checkbox-checked")) {
        checkboxDiv.classList.remove("checkbox-checked");
        const chk = checkboxDiv.querySelector(".checkbox-checkmark");
        if (chk) checkboxDiv.removeChild(chk);
      } else {
        checkboxDiv.classList.add("checkbox-checked");
        const span = document.createElement("span");
        span.classList.add("material-symbols-outlined", "checkbox-checkmark");
        span.textContent = "check";
        checkboxDiv.appendChild(span);
      }
    };
    leftDiv.appendChild(checkboxDiv);

    const titleSpan = document.createElement("span");
    titleSpan.classList.add("group-title");
    titleSpan.innerHTML = autoHyphenate(group.name);
    leftDiv.appendChild(titleSpan);

    // Add aspect ratio badge
    const aspectRatioBadge = document.createElement("span");
    aspectRatioBadge.classList.add("badge", "bg-secondary", "ms-2");
    aspectRatioBadge.style.fontSize = "0.65rem";
    aspectRatioBadge.textContent = group.aspect_ratio || "16:9";
    leftDiv.appendChild(aspectRatioBadge);

    const editIcon = document.createElement("span");
    editIcon.classList.add("material-symbols-outlined", "edit-icon-btn");
    editIcon.textContent = "edit";
    editIcon.onclick = (e) => {
      e.stopPropagation();
      openEditGroupModal(group.id);
    };
    leftDiv.appendChild(editIcon);

    const rightDiv = document.createElement("div");
    rightDiv.classList.add("d-flex", "align-items-center");

    const expandIcon = document.createElement("span");
    expandIcon.classList.add("expand-icon", "material-symbols-outlined");
    expandIcon.textContent = "expand_more";
    // Make sure the expand icon also shows the pointer cursor
    expandIcon.style.cursor = "pointer";

    // We still keep an explicit click on the icon itself:
    expandIcon.onclick = (e) => {
      // Prevent the header click from firing again
      e.stopPropagation();
      toggleGroup(expandIcon);
    };
    rightDiv.appendChild(expandIcon);

    headerDiv.appendChild(leftDiv);
    headerDiv.appendChild(rightDiv);
    groupDiv.appendChild(headerDiv);

    // When clicking the header (except on checkbox or edit icon), toggle expand/collapse.
    headerDiv.addEventListener("click", (e) => {
      // If click is on the checkboxDiv or the edit icon, do nothing:
      if (checkboxDiv.contains(e.target) || editIcon.contains(e.target)) {
        return;
      }
      toggleGroup(expandIcon);
    });

    const displaysDiv = document.createElement("div");
    displaysDiv.classList.add("group-displays");
    displaysDiv.style.display = "block"; // all groups expanded by default

    const subtitleSpan = document.createElement("span");
    subtitleSpan.classList.add("group-default");
    subtitleSpan.style.color = "var(--darker-gray)";
    if (group.default_slideshow) {
      subtitleSpan.innerHTML =
        gettext("Default: ") + autoHyphenate(group.default_slideshow.name);
    } else if (group.default_playlist) {
      subtitleSpan.textContent =
        gettext("Default: ") + group.default_playlist.name;
    } else {
      subtitleSpan.textContent = "";
    }

    displaysDiv.appendChild(subtitleSpan);

    group.displays.forEach((display) => {
      const displayDiv = document.createElement("div");
      displayDiv.classList.add("display-item");
      displayDiv.setAttribute("data-display-id", display.id);

      const dragIndicator = document.createElement("span");
      dragIndicator.classList.add("material-symbols-outlined", "me-2");
      dragIndicator.textContent = "drag_indicator";
      dragIndicator.style.color = "var(--gray)";
      displayDiv.appendChild(dragIndicator);

      const tvIcon = document.createElement("span");
      tvIcon.classList.add("material-symbols-outlined", "me-2");
      tvIcon.textContent = "tv";
      tvIcon.style.color = "var(--dark-gray)";
      displayDiv.appendChild(tvIcon);

      const displayTitle = document.createElement("span");
      displayTitle.textContent = display.name;
      displayDiv.appendChild(displayTitle);

      // Add aspect ratio badge for display
      const displayAspectRatioBadge = document.createElement("span");
      displayAspectRatioBadge.classList.add("badge", "bg-info", "ms-2");
      displayAspectRatioBadge.style.fontSize = "0.6rem";
      displayAspectRatioBadge.textContent = display.aspect_ratio || "16:9";
      displayDiv.appendChild(displayAspectRatioBadge);

      const displayEditIcon = document.createElement("span");
      displayEditIcon.classList.add(
        "material-symbols-outlined",
        "edit-icon-btn",
      );
      displayEditIcon.textContent = "edit";
      displayEditIcon.onclick = (e) => {
        e.stopPropagation();
        openEditDisplayModal(group.id, display.id);
      };
      displayDiv.appendChild(displayEditIcon);

      displaysDiv.appendChild(displayDiv);
    });

    groupDiv.appendChild(displaysDiv);
    groupsContainer.appendChild(groupDiv);

    // Sortable for drag-and-drop
    Sortable.create(displaysDiv, {
      group: "shared",
      animation: 150,
      onStart: function (evt) {
        draggedItem = evt.item;
      },
      onEnd: async function (evt) {
        draggedItem = null;
        if (!evt.to || !evt.from) return;
        const movedEl = evt.item;
        const newGroupEl = evt.to.closest(".group");
        const newGroupId = newGroupEl
          ? parseInt(newGroupEl.getAttribute("data-group-id"))
          : null;
        const movedDisplayId = parseInt(
          movedEl.getAttribute("data-display-id"),
        );

        // Validate aspect ratio compatibility before making API call
        if (!validateDisplayGroupAspectRatio(movedDisplayId, newGroupId)) {
          const display = displaysData.find((d) => d.id === movedDisplayId);
          const targetGroup = newGroupId
            ? groupsData.find((g) => g.id === newGroupId)
            : null;

          if (targetGroup) {
            showToast(
              gettext(
                `Cannot move display "${display.name}" (${display.aspect_ratio || "16:9"}) to group "${targetGroup.name}" (${targetGroup.aspect_ratio || "16:9"}). Aspect ratios must match.`,
              ),
              "Error",
            );
          }

          // Revert the UI change by refreshing
          await refreshData();
          return;
        }

        try {
          const res = await fetch(
            `${BASE_URL}/api/display-websites/${movedDisplayId}/?branch_id=${selectedBranchID}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ display_website_group: newGroupId }),
            },
          );
          if (res.ok) {
            await refreshData();
          } else {
            console.error("Failed to update display group");
            showToast(gettext("Failed to update display group"), "Error");
            // Revert the UI change
            await refreshData();
          }
        } catch (error) {
          console.error("Error updating display group:", error);
          showToast(gettext("Error updating display group"), "Error");
          // Revert the UI change
          await refreshData();
        }
      },
    });
  });
  updateSelectAllCheckbox();
}

function toggleGroup(iconEl) {
  const groupEl = iconEl.closest(".group");
  const displaysEl = groupEl.querySelector(".group-displays");
  if (!displaysEl) return;
  if (displaysEl.style.display === "none" || displaysEl.style.display === "") {
    displaysEl.style.display = "block";
    iconEl.textContent = "expand_less";
  } else {
    displaysEl.style.display = "none";
    iconEl.textContent = "expand_more";
  }
}

// -------------------------
// CALENDAR FUNCTIONS
// -------------------------
async function initCalendar() {
  const calendarEl = document.getElementById("calendar");

  try {
    // Use the imported Calendar class directly
    calendar = new Calendar(calendarEl, {
      plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
      initialView: "dayGridMonth",
      selectable: true,
      selectMirror: true,
      dayMaxEvents: 3,
      firstDay: 1,
      weekNumbers: true,
      weekText: gettext("Week "),
      buttonText: {
        today: gettext("Today"),
      },
      locale: calendarLocale,
      headerToolbar: {
        left: "viewSelectorButton,prev,next today",
        center: "title",
        right: "addScheduledButton,addRecurringButton",
      },
      customButtons: {
        viewSelectorButton: {
          text: "",
          click: () => {}, // We'll handle this with Bootstrap dropdown
        },
        addScheduledButton: {
          text: "",
          click: () => openAddScheduledModal(),
        },
        addRecurringButton: {
          text: "",
          click: () => openAddRecurringScheduledModal(),
        },
      },
      eventContent: function (arg) {
        const backgroundColor = "darkgrey";
        const groupColor =
          arg.event.extendedProps?.groupColor ||
          arg.event.backgroundColor ||
          "#888";

        // Check if this is a recurring event
        const isRecurring = arg.event.extendedProps?.isRecurring || false;
        const eventIcon = isRecurring
          ? '<span class="material-symbols-outlined recurring-icon text-white mx-1" style="font-size: 24px; opacity: 0.9;">autorenew</span>'
          : '<span class="material-symbols-outlined event-icon text-white mx-1" style="font-size: 24px; opacity: 0.9;">event</span>';

        // Check if this event combines with default or overrides
        const eventData = arg.event.extendedProps?.eventData;
        const combineWithDefault = eventData?.combine_with_default || false;
        const combineIcon = combineWithDefault
          ? `<span class="material-symbols-outlined combine-icon text-white" style="font-size: 24px;  opacity: 0.9;" title="${gettext(
              "Combines with default content",
            )}">stack</span>`
          : `<span class="material-symbols-outlined override-icon text-white " style="font-size: 24px; opacity: 0.9;" title="${gettext(
              "Overrides default content",
            )}">swap_horiz</span>`;

        // Split title by newline to separate group name and content
        const titleParts = arg.event.title.split("\n");
        const groupName = titleParts[0] || "";
        const contentName = titleParts[1] || "";

        // Determine if event spans multiple days
        const startDate = new Date(arg.event.start);
        const endDate = new Date(arg.event.end);
        const isSameDay = startDate.toDateString() === endDate.toDateString();

        // Format time display based on whether it's single day or multi-day
        let timeDisplay;
        if (isSameDay) {
          // Single day: show only time with colon format
          const startTime = startDate.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          const endTime = endDate.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          timeDisplay = `${startTime} — ${endTime}`;
        } else {
          // Multi-day: show date and time with numeric format (without year)
          const startTime = startDate.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          const endTime = endDate.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          timeDisplay = `${startDate.toLocaleDateString(calendarLocale, {
            month: "2-digit",
            day: "2-digit",
          })} ${startTime} — ${endDate.toLocaleDateString(calendarLocale, {
            month: "2-digit",
            day: "2-digit",
          })} ${endTime}`;
        }

        // Format the title with group on first line and content on second line
        const formattedTitle =
          groupName && contentName
            ? `
          <div style="flex: 1;" >
    <div style="font-weight: bold;line-height: 1.1; margin-bottom: 1px; background-color: ${groupColor}" class="p-1">
                  <span class="material-symbols-outlined ms-1">

</span> &nbsp; <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; max-width: calc(100% - 15px);">${groupName}</span>
                </div>
                <div class="bg-light-gray text-black p-1" style="line-height: 1.1; opacity: 0.9;">
                  <span class="material-symbols-outlined ms-1">
</span> &nbsp; <span style="max-width: calc(100% - 15px); display: inline-block;"> ${contentName}</span>
                </div>
                <div style="line-height: 1.1; background-color: rgba(0,0,0,0.3); display: flex; justify-content: space-between; align-items: center;" class="p-1">
                  <div style="display: flex; align-items: center;">
                    ${eventIcon}${combineIcon}
                  </div>
                  <div style="font-size: 13px; opacity: 0.8; max-width: calc(100% - 60px) !important; word-break: normal !important;">
                    ${timeDisplay}
                  </div>
                </div>
          </div>      `
            : `<div style="line-height: 1.2;">${arg.event.title}</div>`;

        // Add a subtle striped pattern for recurring events
        const backgroundStyle = isRecurring
          ? `background: linear-gradient(135deg, ${backgroundColor} 25%, transparent 25%, transparent 50%, ${backgroundColor} 50%, ${backgroundColor} 75%, transparent 75%, transparent), ${backgroundColor}; background-size: 8px 8px;`
          : `background-color: ${backgroundColor};`;

        // Create continuation content for non-start segments
        const continuationTitle =
          groupName && contentName
            ? `
          <div style="flex: 1;" >
    <div style="font-weight: bold;line-height: 1.1; margin-bottom: 1px; background-color: ${groupColor}" class="p-1">
</span> &nbsp; <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; max-width: calc(100% - 15px);">${groupName}</span>
                </div>
                <div style="line-height: 1.1; opacity: 0.9; color: black; background-color: lightgrey" class="p-1">
</span> &nbsp; <span style="max-width: calc(100% - 15px); display: inline-block;"> ${contentName}</span>
                </div>
                <div style="line-height: 1.1; background-color: rgba(0,0,0,0.3); display: flex; justify-content: space-between; align-items: center;" class="p-1">
                  <div style="display: flex;  align-items: center;">
                    ${eventIcon}${combineIcon}
                  </div>
                   <div style="font-size: 13px; opacity: 0.8; max-width: calc(100% - 60px) !important; word-break: normal !important;">
                    ${timeDisplay}
                  </div>
                </div>
          </div>      `
            : `<div style="line-height: 1.2;">${arg.event.title}</div>`;

        const html = `
          <div class="fc-custom-event-block" style="${backgroundStyle} color: white; border-radius: 15px; border: 1.5px solid ${
            isRecurring ? "#fff" : "white"
          }; position: relative;">
              ${
                !arg.isStart
                  ? '<span class="material-symbols-outlined arrow">arrow_forward</span>'
                  : ""
              }
              ${arg.isStart ? `${formattedTitle}` : `${continuationTitle}`}
              ${
                !arg.isEnd
                  ? '<span class="material-symbols-outlined arrow">arrow_forward</span>'
                  : ""
              }
          </div>
      `;
        return { html: html };
      },
      select: function (info) {
        openAddScheduledModal(info.startStr, info.endStr);
        calendar.unselect();
      },
      events: getFilteredEvents(),
      datesSet: function (info) {
        // Refresh events when calendar view changes (to regenerate recurring instances)
        calendar.removeAllEvents();
        calendar.addEventSource(getFilteredEvents());
      },
      eventClick: function (info) {
        const eventId = info.event.id;
        if (eventId.startsWith("recurring_")) {
          // Handle recurring event click
          const parts = eventId.split("_");
          const recurringId = parts[1];
          openEditRecurringScheduledModal(recurringId);
        } else {
          // Handle regular scheduled event click
          openEditScheduledModal(eventId);
        }
      },
    });

    calendar.render();

    const addBtn = document.querySelector(".fc-addScheduledButton-button");
    if (addBtn) {
      addBtn.innerHTML = `<span class="material-symbols-outlined">event</span>&nbsp;${gettext(
        "Add Scheduled Content",
      )}`;
      addBtn.classList.remove("fc-button-primary");
      addBtn.classList.remove("fc-button");
      addBtn.classList.add("btn", "btn-primary");
      addBtn.setAttribute("title", gettext("Add a one-time scheduled event"));
    }

    const addRecurringBtn = document.querySelector(
      ".fc-addRecurringButton-button",
    );
    if (addRecurringBtn) {
      addRecurringBtn.innerHTML = `<span class="material-symbols-outlined">autorenew</span>${gettext(
        "Add Recurring Content",
      )}`;
      addRecurringBtn.classList.remove("fc-button-primary");
      addRecurringBtn.classList.remove("fc-button");
      addRecurringBtn.classList.add("btn", "btn-secondary", "ms-2");
      addRecurringBtn.setAttribute(
        "title",
        gettext("Add a repeating weekly event"),
      );
    }

    const viewSelectorBtn = document.querySelector(
      ".fc-viewSelectorButton-button",
    );
    if (viewSelectorBtn) {
      // Create dropdown structure
      viewSelectorBtn.innerHTML = `
        <span class="material-symbols-outlined">calendar_month</span>
        ${gettext("Calendar View")}
        <span class="material-symbols-outlined ms-1">expand_more</span>
      `;
      viewSelectorBtn.classList.remove("fc-button-primary", "fc-button");
      viewSelectorBtn.classList.add(
        "btn",
        "btn-outline-secondary",
        "dropdown-toggle",
        "me-2",
      );
      viewSelectorBtn.setAttribute("data-bs-toggle", "dropdown");
      viewSelectorBtn.setAttribute("aria-expanded", "false");
      viewSelectorBtn.setAttribute("id", "viewSelectorDropdown");

      // Create dropdown menu
      const dropdownMenu = document.createElement("ul");
      dropdownMenu.className = "dropdown-menu";
      dropdownMenu.setAttribute("aria-labelledby", "viewSelectorDropdown");

      dropdownMenu.innerHTML = `
        <li><a class="dropdown-item active" href="#" data-view="calendar">
          <span class="material-symbols-outlined me-2">calendar_month</span>
          ${gettext("Calendar View")}
          <span class="material-symbols-outlined float-end">check</span>
        </a></li>
        <li><a class="dropdown-item" href="#" data-view="list">
          <span class="material-symbols-outlined me-2">view_list</span>
          ${gettext("List View")}
        </a></li>
      `;

      // Insert dropdown menu after the button
      viewSelectorBtn.parentNode.insertBefore(
        dropdownMenu,
        viewSelectorBtn.nextSibling,
      );

      // Add click handlers to dropdown items
      dropdownMenu.addEventListener("click", function (e) {
        if (e.target.closest(".dropdown-item")) {
          e.preventDefault();
          const selectedView = e.target
            .closest(".dropdown-item")
            .getAttribute("data-view");

          if (selectedView !== currentView) {
            toggleView();
          }
        }
      });
    }

    // Initialize list view container
    initListView();
  } catch (error) {
    console.error("Error initializing calendar:", error);
  }
}

function updateViewSelectorDropdown() {
  // Update calendar view dropdown
  const viewSelectorBtn = document.querySelector("#viewSelectorDropdown");
  const dropdownItems = document.querySelectorAll("[data-view]");

  if (viewSelectorBtn && dropdownItems.length > 0) {
    // Update button text and icon
    if (currentView === "calendar") {
      viewSelectorBtn.innerHTML = `
        <span class="material-symbols-outlined">calendar_month</span>
        ${gettext("Calendar View")}
        <span class="material-symbols-outlined ms-1">expand_more</span>
      `;
    } else {
      viewSelectorBtn.innerHTML = `
        <span class="material-symbols-outlined">view_list</span>
        ${gettext("List View")}
        <span class="material-symbols-outlined ms-1">expand_more</span>
      `;
    }

    // Update dropdown item states
    dropdownItems.forEach((item) => {
      const itemView = item.getAttribute("data-view");
      const checkIcon = item.querySelector(".float-end");

      if (itemView === currentView) {
        item.classList.add("active");
        if (!checkIcon) {
          const check = document.createElement("span");
          check.className = "material-symbols-outlined float-end";
          check.textContent = "check";
          item.appendChild(check);
        }
      } else {
        item.classList.remove("active");
        if (checkIcon) {
          checkIcon.remove();
        }
      }
    });
  }

  // Update list view dropdown
  const listViewSelectorBtn = document.querySelector(
    "#listViewSelectorDropdown",
  );
  const listDropdownItems = document.querySelectorAll(
    "#listViewSelectorDropdown + .dropdown-menu [data-view]",
  );

  if (listViewSelectorBtn) {
    if (currentView === "calendar") {
      listViewSelectorBtn.innerHTML = `
        <span class="material-symbols-outlined">calendar_month</span>
        ${gettext("Calendar View")}
        <span class="material-symbols-outlined ms-1">expand_more</span>
      `;
    } else {
      listViewSelectorBtn.innerHTML = `
        <span class="material-symbols-outlined">view_list</span>
        ${gettext("List View")}
        <span class="material-symbols-outlined ms-1">expand_more</span>
      `;
    }

    // Update list dropdown item states
    listDropdownItems.forEach((item) => {
      const itemView = item.getAttribute("data-view");
      const checkIcon = item.querySelector(".float-end");

      if (itemView === currentView) {
        item.classList.add("active");
        if (!checkIcon) {
          const check = document.createElement("span");
          check.className = "material-symbols-outlined float-end";
          check.textContent = "check";
          item.appendChild(check);
        }
      } else {
        item.classList.remove("active");
        if (checkIcon) {
          checkIcon.remove();
        }
      }
    });
  }
}

function toggleView() {
  const calendarContainer = document.getElementById("calendar");
  const listContainer = document.getElementById("list-view-container");

  if (currentView === "calendar") {
    // Switch to list view
    currentView = "list";
    calendarContainer.style.display = "none";
    listContainer.style.display = "block";

    renderListView();
  } else {
    // Switch to calendar view
    currentView = "calendar";
    calendarContainer.style.display = "block";
    listContainer.style.display = "none";
  }

  // Update the dropdown to reflect the current view
  updateViewSelectorDropdown();
}

function initListView() {
  // Find the container that holds the calendar
  const calendarEl = document.getElementById("calendar");
  const contentArea = calendarEl ? calendarEl.parentElement : null;

  if (!contentArea) {
    console.error("Could not find content area for list view");
    return;
  }

  // Create list view container
  const listContainer = document.createElement("div");
  listContainer.id = "list-view-container";
  listContainer.className = "list-view-container";
  listContainer.style.display = "none";

  // Add header
  const listHeader = document.createElement("div");
  listHeader.className = "list-view-header";
  listHeader.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="d-flex align-items-center">
        <div class="dropdown me-3">
          <button class="btn btn-outline-secondary dropdown-toggle" type="button" id="listViewSelectorDropdown" data-bs-toggle="dropdown" aria-expanded="false">
            <span class="material-symbols-outlined">view_list</span>
            ${gettext("List View")}
            <span class="material-symbols-outlined ms-1">expand_more</span>
          </button>
          <ul class="dropdown-menu" aria-labelledby="listViewSelectorDropdown">
            <li><a class="dropdown-item" href="#" data-view="calendar">
              <span class="material-symbols-outlined me-2">calendar_month</span>
              ${gettext("Calendar View")}
            </a></li>
            <li><a class="dropdown-item active" href="#" data-view="list">
              <span class="material-symbols-outlined me-2">view_list</span>
              ${gettext("List View")}
              <span class="material-symbols-outlined float-end">check</span>
            </a></li>
          </ul>
        </div>
        <h4 class="d-inline mb-0">${gettext("Scheduled Events")}</h4>
      </div>
      <div>
        <button class="btn btn-primary me-2" id="list-add-event-btn">
          <span class="material-symbols-outlined">add</span>
          ${gettext("Add Scheduled Content")}
        </button>
        <button class="btn btn-secondary" id="list-add-recurring-btn">
          <span class="material-symbols-outlined">autorenew</span>
          ${gettext("Add Recurring Content")}
        </button>
      </div>
    </div>
  `;

  // Add events container
  const eventsContainer = document.createElement("div");
  eventsContainer.id = "list-events-container";
  eventsContainer.className = "list-events-container";

  listContainer.appendChild(listHeader);
  listContainer.appendChild(eventsContainer);
  contentArea.appendChild(listContainer);

  // Add event listeners for buttons
  const addEventBtn = listContainer.querySelector("#list-add-event-btn");
  if (addEventBtn) {
    addEventBtn.addEventListener("click", () => openAddScheduledModal());
  }

  const addRecurringBtn = listContainer.querySelector(
    "#list-add-recurring-btn",
  );
  if (addRecurringBtn) {
    addRecurringBtn.addEventListener("click", () =>
      openAddRecurringScheduledModal(),
    );
  }

  // Add event listener for the list view selector dropdown
  const listViewDropdown = listContainer.querySelector(".dropdown-menu");
  if (listViewDropdown) {
    listViewDropdown.addEventListener("click", function (e) {
      if (e.target.closest(".dropdown-item")) {
        e.preventDefault();
        const selectedView = e.target
          .closest(".dropdown-item")
          .getAttribute("data-view");

        if (selectedView !== currentView) {
          toggleView();
        }
      }
    });
  }
}

function renderListView() {
  const eventsContainer = document.getElementById("list-events-container");
  if (!eventsContainer) return;

  // Get all events and sort them by date
  const allEvents = getFilteredEvents();
  const sortedEvents = allEvents.sort(
    (a, b) => new Date(a.start) - new Date(b.start),
  );

  // Group events by date, including multi-day events on each day they span
  const eventsByDate = {};
  sortedEvents.forEach((event) => {
    const startDate = new Date(event.start);
    const endDate = new Date(event.end);

    // Create a date for each day the event spans
    const currentDate = new Date(startDate);

    // If event spans multiple days, add it to each day
    while (currentDate <= endDate) {
      const dateKey = currentDate.toDateString();

      if (!eventsByDate[dateKey]) {
        eventsByDate[dateKey] = [];
      }

      // Create a copy of the event with information about which day we're showing
      const eventCopy = {
        ...event,
        _displayDate: new Date(currentDate),
        _isFirstDay: currentDate.toDateString() === startDate.toDateString(),
        _isLastDay: currentDate.toDateString() === endDate.toDateString(),
        _isMultiDay: startDate.toDateString() !== endDate.toDateString(),
      };

      eventsByDate[dateKey].push(eventCopy);

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
  });

  // Clear container
  eventsContainer.innerHTML = "";

  // Render events grouped by date
  const sortedDateKeys = Object.keys(eventsByDate).sort(
    (a, b) => new Date(a) - new Date(b),
  );

  sortedDateKeys.forEach((dateKey) => {
    const date = new Date(dateKey);
    const events = eventsByDate[dateKey];

    // Create date header
    const dateHeader = document.createElement("div");
    dateHeader.className = "list-date-header";
    dateHeader.innerHTML = `
      <h5 class="mb-0">${date.toLocaleDateString(calendarLocale, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })}</h5>
    `;
    eventsContainer.appendChild(dateHeader);

    // Create events for this date
    events.forEach((event) => {
      const eventElement = createListEventElement(event);
      eventsContainer.appendChild(eventElement);
    });
  });

  // Show message if no events
  if (sortedEvents.length === 0) {
    eventsContainer.innerHTML = `
      <div class="text-center text-muted py-5">
        <span class="material-symbols-outlined" style="font-size: 48px;">event_busy</span>
        <p class="mt-2">${gettext("No scheduled events found")}</p>
      </div>
    `;
  }
}

function createListEventElement(event) {
  const eventDiv = document.createElement("div");
  eventDiv.className = "list-event-item";

  const startDate = new Date(event.start);
  const endDate = new Date(event.end);
  const isRecurring = event.extendedProps?.isRecurring || false;
  const eventData = event.extendedProps?.eventData;
  const combineWithDefault = eventData?.combine_with_default || false;

  // Check if this is a multi-day event and which day we're showing
  const isMultiDay = event._isMultiDay || false;
  const isFirstDay = event._isFirstDay !== undefined ? event._isFirstDay : true;
  const isLastDay = event._isLastDay !== undefined ? event._isLastDay : true;

  // Add multi-day data attribute for CSS styling
  if (isMultiDay) {
    eventDiv.setAttribute("data-multi-day", "true");
  }

  // Format time based on multi-day status
  let timeString;
  if (isMultiDay) {
    if (isFirstDay && isLastDay) {
      // Single occurrence spanning multiple days - show full range
      const startTime = startDate.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const endTime = endDate.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      timeString = `${startDate.toLocaleDateString(calendarLocale, {
        month: "2-digit",
        day: "2-digit",
      })} ${startTime} — ${endDate.toLocaleDateString(calendarLocale, {
        month: "2-digit",
        day: "2-digit",
      })} ${endTime}`;
    } else if (isFirstDay) {
      // First day of multi-day event
      const startTime = startDate.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      timeString = `${startTime} — 23:59 (${gettext("continues")})`;
    } else if (isLastDay) {
      // Last day of multi-day event
      const endTime = endDate.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      timeString = `00:00 — ${endTime} (${gettext("ends")})`;
    } else {
      // Middle day of multi-day event
      timeString = `${gettext("All day")} (${gettext("continues")})`;
    }
  } else {
    // Single day event
    const startTime = startDate.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const endTime = endDate.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    timeString = `${startTime} — ${endTime}`;
  }

  // Split title by newline to separate group name and content
  const titleParts = event.title.split("\n");
  const groupName = titleParts[0] || "";
  const contentName = titleParts[1] || "";

  // Add visual indicator for multi-day events
  const multiDayIndicator = isMultiDay
    ? `<span class="badge bg-primary me-1">
      <span class="material-symbols-outlined">date_range</span> 
      ${
        isFirstDay
          ? gettext("Starts")
          : isLastDay
            ? gettext("Ends")
            : gettext("Continues")
      }
    </span>`
    : "";

  // Use dashed border for multi-day events
  const borderStyle = isMultiDay
    ? "border-left: 4px dashed"
    : "border-left: 4px solid";

  eventDiv.innerHTML = `
    <div class="list-event-content" style="${borderStyle} ${
      event.backgroundColor
    };">
      <div class="list-event-header">
        <div class="list-event-title">
          <span class="material-symbols-outlined me-2">tv_displays</span>
          <strong>${groupName}</strong>
        </div>
        <div class="list-event-time">${timeString}</div>
      </div>
      <div class="list-event-body">
        <div class="list-event-content-name">
          <span class="material-symbols-outlined me-2">play_circle</span>
          ${contentName}
        </div>
        <div class="list-event-badges">
          ${multiDayIndicator}
          ${
            isRecurring
              ? `<span class="badge bg-secondary me-1"><span class="material-symbols-outlined">autorenew</span> ${gettext(
                  "Recurring",
                )}</span>`
              : ""
          }
          ${
            combineWithDefault
              ? `<span class="badge bg-info"><span class="material-symbols-outlined">add</span> ${gettext(
                  "Combines",
                )}</span>`
              : `<span class="badge bg-warning"><span class="material-symbols-outlined">swap_horiz</span> ${gettext(
                  "Overrides",
                )}</span>`
          }
        </div>
      </div>
    </div>
  `;

  // Add click handler
  eventDiv.addEventListener("click", () => {
    const eventId = String(event.id || "");
    if (eventId.startsWith("recurring_")) {
      const parts = eventId.split("_");
      const recurringId = parts[1];
      openEditRecurringScheduledModal(recurringId);
    } else {
      openEditScheduledModal(eventId);
    }
  });

  return eventDiv;
}

function generateRecurringInstances(recurringEvent, startDate, endDate) {
  /**
   * Generate virtual instances of a recurring event for calendar display
   * @param {Object} recurringEvent - The recurring event definition
   * @param {Date} startDate - Start date for generating instances
   * @param {Date} endDate - End date for generating instances
   * @returns {Array} Array of virtual event instances
   */
  const instances = [];
  let currentDate = new Date(startDate);

  // Convert backend weekday (0=Monday) to JavaScript weekday (0=Sunday)
  // Backend: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  // JS: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const targetWeekday = (recurringEvent.weekday + 1) % 7;

  // Find the first occurrence of the weekday on or after start_date
  const currentWeekday = currentDate.getDay();
  let daysAhead = (targetWeekday - currentWeekday + 7) % 7;
  currentDate.setDate(currentDate.getDate() + daysAhead);

  const activeFrom = new Date(recurringEvent.active_from);
  activeFrom.setHours(0, 0, 0, 0); // Set to beginning of day for accurate comparison
  const activeUntil = recurringEvent.active_until
    ? new Date(recurringEvent.active_until)
    : null;

  while (currentDate <= endDate) {
    // Check if this date falls within the active range
    if (
      currentDate >= activeFrom &&
      (!activeUntil || currentDate <= activeUntil)
    ) {
      // Create start and end datetime for this instance
      const [startHour, startMinute] = recurringEvent.start_time
        .split(":")
        .map(Number);
      const [endHour, endMinute] = recurringEvent.end_time
        .split(":")
        .map(Number);

      const startDateTime = new Date(currentDate);
      startDateTime.setHours(startHour, startMinute, 0, 0);

      const endDateTime = new Date(currentDate);
      endDateTime.setHours(endHour, endMinute, 0, 0);

      // Find the group name for this recurring event
      const group = groupsData.find(
        (g) => g.id === recurringEvent.display_website_group,
      );
      const groupName = group?.name || gettext("Unknown Group");
      const contentTitle =
        recurringEvent.slideshow?.name ||
        recurringEvent.playlist?.name ||
        gettext("Recurring Event");

      const instance = {
        id: `recurring_${recurringEvent.id}_${
          currentDate.toISOString().split("T")[0]
        }`,
        recurring_id: recurringEvent.id,
        title: `${groupName}\n${contentTitle}`,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        display_website_group: recurringEvent.display_website_group,
        slideshow: recurringEvent.slideshow,
        playlist: recurringEvent.playlist,
        combine_with_default: recurringEvent.combine_with_default,
        description: recurringEvent.description,
        is_recurring: true,
        weekday: recurringEvent.weekday,
        weekday_display: recurringEvent.weekday_display,
      };
      instances.push(instance);
    }

    // Move to next week
    currentDate.setDate(currentDate.getDate() + 7);
  }

  return instances;
}

function getFilteredEvents() {
  // Combine regular scheduled events and dynamically generated recurring instances
  const regularEvents = scheduledEvents.map((ev) => {
    let contentTitle = gettext("Scheduled Content");
    // If a playlist is set, use its name; otherwise, if a slideshow is set, use its name.
    if (ev.playlist && ev.playlist.name) {
      contentTitle = ev.playlist.name;
    } else if (ev.slideshow && ev.slideshow.name) {
      contentTitle = ev.slideshow.name;
    }

    // Find the group name for this event
    const group = groupsData.find((g) => g.id === ev.display_website_group);
    const groupName = group?.name || gettext("Unknown Group");

    // Put group name and content title on separate lines
    const title = `${groupName}\n${contentTitle}`;

    return {
      id: ev.id,
      title: title,
      start: ev.start_time,
      end: ev.end_time,
      // Avoid using FullCalendar backgroundColor so our custom content controls visuals
      borderColor: "transparent", // Disable FullCalendar's default borders
      extendedProps: {
        isRecurring: false,
        eventData: ev,
        groupColor: group?.color || "#0000ff",
      },
    };
  });

  // Generate virtual recurring instances dynamically
  const recurringInstanceEvents = [];
  if (calendar) {
    // Get the current calendar view dates
    const calendarView = calendar.view;
    const viewStart = calendarView.activeStart;
    const viewEnd = calendarView.activeEnd;

    // Generate instances for each recurring event within the calendar viewport
    // Extend the range a bit to ensure smooth scrolling
    const extendedStart = new Date(viewStart);
    extendedStart.setDate(extendedStart.getDate() - 30); // 1 month before
    const extendedEnd = new Date(viewEnd);
    extendedEnd.setDate(extendedEnd.getDate() + 365); // 1 year after for infinite events

    recurringEvents.forEach((recurringEvent) => {
      const instances = generateRecurringInstances(
        recurringEvent,
        extendedStart,
        extendedEnd,
      );
      instances.forEach((instance) => {
        // Get the base color for the group and make it slightly different for recurring events
        const baseColor =
          groupsData.find((g) => g.id === instance.display_website_group)
            ?.color || "#00aa00";

        recurringInstanceEvents.push({
          id: instance.id,
          title: instance.title,
          start: instance.start_time,
          end: instance.end_time,
          borderColor: "transparent",
          extendedProps: {
            isRecurring: true,
            recurringId: instance.recurring_id,
            eventData: instance,
            groupColor: baseColor,
          },
        });
      });
    });
  }

  return [...regularEvents, ...recurringInstanceEvents];
}

async function refreshCalendarEvents() {
  await Promise.all([loadScheduledEvents(), loadRecurringScheduledEvents()]);
  if (!calendar) return;
  calendar.removeAllEvents();
  calendar.addEventSource(getFilteredEvents());

  // Also refresh list view if it's currently active
  if (currentView === "list") {
    renderListView();
  }
}

// -------------------------
// SCHEDULED CONTENT CRUD FUNCTIONS
// -------------------------
async function saveScheduledContent() {
  const groupId = document.getElementById("scheduledGroup").value;
  const start = document.getElementById("scheduledStart").value;
  const end = document.getElementById("scheduledEnd").value;
  const description = document
    .getElementById("scheduledDescription")
    .value.trim();
  if (!groupId || !start || !end) {
    alert(gettext("Please fill in Group, Start, and End time!"));
    return;
  }
  // Determine scheduled content type
  const scheduledType = document.querySelector(
    'input[name="scheduledContentType"]:checked',
  ).value;
  let payload = {
    start_time: start,
    end_time: end,
    display_website_group: parseInt(groupId),
    description: description,
    combine_with_default: combineToggleCreate.checked,
  };
  if (scheduledType === "slideshow") {
    const slideshowId = document.getElementById(
      "scheduledSlideshowSelect",
    ).value;
    if (!slideshowId) {
      alert(gettext("Select Content."));
      return;
    }
    payload.slideshow_id = parseInt(slideshowId);
  } else {
    const playlistId = document.getElementById("scheduledPlaylistSelect").value;
    if (!playlistId) {
      alert(gettext("Please select a playlist."));
      return;
    }
    payload.playlist_id = parseInt(playlistId);
  }
  try {
    const res = await fetch(
      `${BASE_URL}/api/scheduled-contents/?branch_id=${selectedBranchID}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
    );
    if (res.ok) {
      await refreshCalendarEvents();
      addScheduledModal.hide();
    } else {
      console.error("Failed to add scheduled content");
      const data = await res.json();
      showToast(JSON.stringify(data), gettext("Error"));
    }
  } catch (error) {
    console.error("Error adding scheduled content:", error);
    showToast(error, gettext("Error"));
  }
}

function openAddScheduledModal(startStr = "", endStr = "") {
  // Set minimum dates before opening modal
  setMinimumDatesForInputs();

  // Populate the group dropdown with placeholder.
  const groupSelect = document.getElementById("scheduledGroup");
  groupSelect.innerHTML = "";

  // Add placeholder option
  let placeholderOpt = document.createElement("option");
  placeholderOpt.value = "";
  placeholderOpt.textContent = gettext("Select Group");
  placeholderOpt.disabled = true;
  placeholderOpt.selected = true;
  groupSelect.appendChild(placeholderOpt);

  groupsData.forEach((g) => {
    let opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.aspect_ratio ? `${g.name} (${g.aspect_ratio})` : g.name;
    groupSelect.appendChild(opt);
  });

  // Determine which content type is selected by default.
  const scheduledType = document.querySelector(
    'input[name="scheduledContentType"]:checked',
  ).value;
  if (scheduledType === "slideshow") {
    document.getElementById("scheduledSlideshowContainer").style.display =
      "block";
    document.getElementById("scheduledPlaylistContainer").style.display =
      "none";
  } else {
    document.getElementById("scheduledSlideshowContainer").style.display =
      "none";
    document.getElementById("scheduledPlaylistContainer").style.display =
      "block";
  }

  // Initialize content dropdowns as disabled (they will be enabled when group is selected)
  refreshScheduledContentDropdowns();

  // Set start and end times.
  document.getElementById("scheduledStart").value = startStr
    ? startStr + "T00:00"
    : "";
  if (endStr) {
    let endDate = new Date(endStr);
    endDate.setDate(endDate.getDate() - 1);
    const yyyy = endDate.getFullYear();
    const mm = String(endDate.getMonth() + 1).padStart(2, "0");
    const dd = String(endDate.getDate()).padStart(2, "0");
    document.getElementById("scheduledEnd").value = `${yyyy}-${mm}-${dd}T23:59`;
  } else {
    document.getElementById("scheduledEnd").value = "";
  }
  document.getElementById("scheduledDescription").value = "";

  syncDefaultToggleAndGroup();
  if (addScheduledModal) {
    addScheduledModal.show();
  }
}

function formatForDatetimeLocal(dateString) {
  const date = new Date(dateString);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function openEditScheduledModal(eventId) {
  // Set minimum dates before opening modal
  setMinimumDatesForInputs();

  const event = scheduledEvents.find((e) => e.id == eventId);
  if (!event) return;

  document.getElementById("editEventId").value = event.id;
  combineToggleEdit.checked = event.combine_with_default;

  // Populate group select dropdown
  const select = document.getElementById("editScheduledGroup");
  select.innerHTML = "";
  groupsData.forEach((g) => {
    let opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.name;
    select.appendChild(opt);
  });
  select.value = event.display_website_group;

  // Determine scheduled content type based on event data.
  if (event.playlist) {
    // Set radio button for playlist and show playlist container
    document.getElementById("editScheduledPlaylistRadio").checked = true;
    document.getElementById("editScheduledSlideshowContainer").style.display =
      "none";
    document.getElementById("editScheduledPlaylistContainer").style.display =
      "block";
    // Populate playlist dropdown and set current selection
    populateSlideshowPlaylistDropdown(
      "editScheduledPlaylistSelect",
      event.playlist.id,
      "Select a slideshow playlist",
    );
  } else {
    // Set radio button for slideshow and show slideshow container
    document.getElementById("editScheduledSlideshowRadio").checked = true;
    document.getElementById("editScheduledSlideshowContainer").style.display =
      "block";
    document.getElementById("editScheduledPlaylistContainer").style.display =
      "none";
    // Populate slideshow dropdown and set current selection
    const shows = combineToggleEdit.checked ? filteredSlideshows() : slideshows;

    populateSlidesWrapper({
      dropdownId: "editScheduledSlideshowSelect",
      slideshows: shows,
      selectedValue: event.slideshow?.id || null,
    });
  }

  // Format datetime values for datetime-local inputs
  document.getElementById("editScheduledStart").value = formatForDatetimeLocal(
    event.start_time,
  );
  document.getElementById("editScheduledEnd").value = formatForDatetimeLocal(
    event.end_time,
  );
  document.getElementById("editScheduledDescription").value =
    event.description || "";

  syncDefaultToggleAndGroup();
  editScheduledModal.show();
}

async function updateScheduledContent() {
  const eventId = document.getElementById("editEventId").value;
  const groupId = document.getElementById("editScheduledGroup").value;
  const start = document.getElementById("editScheduledStart").value;
  const end = document.getElementById("editScheduledEnd").value;
  const description = document
    .getElementById("editScheduledDescription")
    .value.trim();
  if (!groupId || !start || !end) {
    alert(gettext("Please fill in Group, Start, and End time!"));
    return;
  }

  // Determine the scheduled content type based on the selected radio button.
  const scheduledType = document.querySelector(
    'input[name="editScheduledContentType"]:checked',
  ).value;
  let payload = {
    start_time: start,
    end_time: end,
    display_website_group: parseInt(groupId),
    description: description,
    combine_with_default: combineToggleEdit.checked,
  };

  if (scheduledType === "slideshow") {
    const slideshowId = document.getElementById(
      "editScheduledSlideshowSelect",
    ).value;
    if (!slideshowId) {
      alert(gettext("Select Content"));
      return;
    }
    payload.slideshow_id = parseInt(slideshowId);
    payload.playlist_id = null;
  } else {
    const playlistId = document.getElementById(
      "editScheduledPlaylistSelect",
    ).value;
    if (!playlistId) {
      alert(gettext("Please select a playlist."));
      return;
    }
    payload.playlist_id = parseInt(playlistId);
    payload.slideshow_id = null;
  }

  try {
    const res = await fetch(
      `${BASE_URL}/api/scheduled-contents/${eventId}/?branch_id=${selectedBranchID}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
    );
    if (res.ok) {
      await refreshCalendarEvents();
      editScheduledModal.hide();
    } else {
      console.error("Failed to update scheduled content");

      const errorMsg = JSON.stringify(await res.json());
      showToast(errorMsg, gettext("Error"));
    }
  } catch (error) {
    console.error("Error updating scheduled content:", error);
  }
}

document.getElementsByName("editScheduledContentType").forEach((elem) => {
  elem.addEventListener("change", function () {
    if (this.value === "slideshow") {
      document.getElementById("editScheduledSlideshowContainer").style.display =
        "block";
      document.getElementById("editScheduledPlaylistContainer").style.display =
        "none";
      populateSlideshowsDropdown(
        "editScheduledSlideshowSelect",
        null,
        gettext("Select Content"),
      );
    } else {
      document.getElementById("editScheduledSlideshowContainer").style.display =
        "none";
      document.getElementById("editScheduledPlaylistContainer").style.display =
        "block";
      populateSlideshowPlaylistDropdown(
        "editScheduledPlaylistSelect",
        null,
        gettext("Select a playlist"),
      );
    }
  });
});

async function deleteScheduledContent() {
  const eventId = document.getElementById("editEventId").value;
  showConfirmModal(
    gettext("Are you sure you want to delete this scheduled content?"),
    async () => {
      try {
        const res = await fetch(
          `${BASE_URL}/api/scheduled-contents/${eventId}/?branch_id=${selectedBranchID}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (res.ok) {
          await refreshCalendarEvents();
          editScheduledModal.hide();
        } else {
          console.error("Failed to delete scheduled content");
        }
      } catch (error) {
        console.error("Error deleting scheduled content:", error);
      }
    },
  );
}

// -------------------------
// RECURRING SCHEDULED CONTENT FUNCTIONS
// -------------------------

function openAddRecurringScheduledModal() {
  // Set minimum dates before opening modal
  setMinimumDatesForInputs();

  // Populate the group dropdown with placeholder.
  const groupSelect = document.getElementById("recurringScheduledGroup");
  groupSelect.innerHTML = "";

  // Add placeholder option
  let placeholderOpt = document.createElement("option");
  placeholderOpt.value = "";
  placeholderOpt.textContent = gettext("Select Group");
  placeholderOpt.disabled = true;
  placeholderOpt.selected = true;
  groupSelect.appendChild(placeholderOpt);

  groupsData.forEach((g) => {
    let opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.aspect_ratio ? `${g.name} (${g.aspect_ratio})` : g.name;
    groupSelect.appendChild(opt);
  });

  // Set default values
  const recurringCombineToggle = document.getElementById(
    "recurringCombineWithDefaultToggle",
  );

  // Determine which content type is selected by default.
  const recurringType = document.querySelector(
    'input[name="recurringScheduledContentType"]:checked',
  ).value;
  if (recurringType === "slideshow") {
    document.getElementById(
      "recurringScheduledSlideshowContainer",
    ).style.display = "block";
    document.getElementById(
      "recurringScheduledPlaylistContainer",
    ).style.display = "none";
  } else {
    document.getElementById(
      "recurringScheduledSlideshowContainer",
    ).style.display = "none";
    document.getElementById(
      "recurringScheduledPlaylistContainer",
    ).style.display = "block";
  }

  // Initialize content dropdowns as disabled (they will be enabled when group is selected)
  refreshRecurringScheduledContentDropdowns();

  // Clear form fields
  document.getElementById("recurringStartTime").value = "";
  document.getElementById("recurringEndTime").value = "";
  document.getElementById("recurringActiveFrom").value = new Date()
    .toISOString()
    .split("T")[0];
  document.getElementById("recurringActiveUntil").value = "";
  document.getElementById("recurringScheduledDescription").value = "";
  document.getElementById("recurringWeekday").value = "0"; // Default to Monday

  addRecurringScheduledModal.show();
}

async function saveRecurringScheduledContent() {
  const groupId = document.getElementById("recurringScheduledGroup").value;
  const weekday = document.getElementById("recurringWeekday").value;
  let startTime = document.getElementById("recurringStartTime").value;
  let endTime = document.getElementById("recurringEndTime").value;
  const activeFrom = document.getElementById("recurringActiveFrom").value;
  const activeUntil = document.getElementById("recurringActiveUntil").value;
  const description = document
    .getElementById("recurringScheduledDescription")
    .value.trim();

  // Apply default times when not set
  if (!startTime && !endTime) {
    // Both empty: default to whole day (00:00 - 23:59)
    startTime = "00:00";
    endTime = "23:59";
    // Update the form fields to show the applied defaults
    document.getElementById("recurringStartTime").value = startTime;
    document.getElementById("recurringEndTime").value = endTime;
  } else if (!startTime && endTime) {
    // Only end time set: assume start from 00:00
    startTime = "00:00";
    document.getElementById("recurringStartTime").value = startTime;
  } else if (startTime && !endTime) {
    // Only start time set: assume end at 23:59
    endTime = "23:59";
    document.getElementById("recurringEndTime").value = endTime;
  }

  if (!groupId || !activeFrom) {
    alert(gettext("Please fill in Group and Active From date!"));
    return;
  }

  // Determine scheduled content type
  const recurringType = document.querySelector(
    'input[name="recurringScheduledContentType"]:checked',
  ).value;

  let payload = {
    weekday: parseInt(weekday),
    start_time: startTime,
    end_time: endTime,
    active_from: activeFrom,
    display_website_group: parseInt(groupId),
    description: description,
    combine_with_default: document.getElementById(
      "recurringCombineWithDefaultToggle",
    ).checked,
  };

  if (activeUntil) {
    payload.active_until = activeUntil;
  }

  if (recurringType === "slideshow") {
    const slideshowId = document.getElementById(
      "recurringScheduledSlideshowSelect",
    ).value;
    if (!slideshowId) {
      alert(gettext("Select Content."));
      return;
    }
    payload.slideshow_id = parseInt(slideshowId);
  } else {
    const playlistId = document.getElementById(
      "recurringScheduledPlaylistSelect",
    ).value;
    if (!playlistId) {
      alert(gettext("Please select a playlist."));
      return;
    }
    payload.playlist_id = parseInt(playlistId);
  }

  try {
    const res = await fetch(
      `${BASE_URL}/api/recurring-scheduled-contents/?branch_id=${selectedBranchID}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
    );
    if (res.ok) {
      await refreshCalendarEvents();
      addRecurringScheduledModal.hide();
      showToast(
        gettext("Recurring event created successfully!"),
        gettext("Success"),
      );
    } else {
      console.error("Failed to add recurring scheduled content");
      const data = await res.json();
      showToast(JSON.stringify(data), gettext("Error"));
    }
  } catch (error) {
    console.error("Error adding recurring scheduled content:", error);
    showToast(error, gettext("Error"));
  }
}

function openEditRecurringScheduledModal(recurringId) {
  // Set minimum dates before opening modal
  setMinimumDatesForInputs();

  const recurring = recurringEvents.find((r) => r.id == recurringId);
  if (!recurring) return;

  document.getElementById("editRecurringEventId").value = recurring.id;
  document.getElementById("editRecurringCombineWithDefaultToggle").checked =
    recurring.combine_with_default;

  // Populate group select dropdown
  const select = document.getElementById("editRecurringScheduledGroup");
  select.innerHTML = "";
  groupsData.forEach((g) => {
    let opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.name;
    select.appendChild(opt);
  });
  select.value = recurring.display_website_group;

  // Set weekday and time values
  document.getElementById("editRecurringWeekday").value = recurring.weekday;
  document.getElementById("editRecurringStartTime").value =
    recurring.start_time;
  document.getElementById("editRecurringEndTime").value = recurring.end_time;
  document.getElementById("editRecurringActiveFrom").value =
    recurring.active_from;
  document.getElementById("editRecurringActiveUntil").value =
    recurring.active_until || "";
  document.getElementById("editRecurringScheduledDescription").value =
    recurring.description || "";

  // Determine scheduled content type based on event data
  if (recurring.playlist) {
    // Set radio button for playlist and show playlist container
    document.getElementById("editRecurringScheduledPlaylistRadio").checked =
      true;
    document.getElementById(
      "editRecurringScheduledSlideshowContainer",
    ).style.display = "none";
    document.getElementById(
      "editRecurringScheduledPlaylistContainer",
    ).style.display = "block";
    // Populate playlist dropdown and set current selection
    populateSlideshowPlaylistDropdown(
      "editRecurringScheduledPlaylistSelect",
      recurring.playlist.id,
      gettext("Select a playlist"),
    );
  } else {
    // Set radio button for slideshow and show slideshow container
    document.getElementById("editRecurringScheduledSlideshowRadio").checked =
      true;
    document.getElementById(
      "editRecurringScheduledSlideshowContainer",
    ).style.display = "block";
    document.getElementById(
      "editRecurringScheduledPlaylistContainer",
    ).style.display = "none";
    // Populate slideshow dropdown and set current selection
    const shows = document.getElementById(
      "editRecurringCombineWithDefaultToggle",
    ).checked
      ? filteredSlideshows()
      : slideshows;
    populateSlidesWrapper({
      dropdownId: "editRecurringScheduledSlideshowSelect",
      slideshows: shows,
    });
    // Set the current slideshow selection
    if (recurring.slideshow) {
      document.getElementById("editRecurringScheduledSlideshowSelect").value =
        recurring.slideshow.id;
    }
  }

  editRecurringScheduledModal.show();
}

async function updateRecurringScheduledContent() {
  const recurringId = document.getElementById("editRecurringEventId").value;
  const groupId = document.getElementById("editRecurringScheduledGroup").value;
  const weekday = document.getElementById("editRecurringWeekday").value;
  let startTime = document.getElementById("editRecurringStartTime").value;
  let endTime = document.getElementById("editRecurringEndTime").value;
  const activeFrom = document.getElementById("editRecurringActiveFrom").value;
  const activeUntil = document.getElementById("editRecurringActiveUntil").value;
  const description = document
    .getElementById("editRecurringScheduledDescription")
    .value.trim();

  // Apply default times when not set
  if (!startTime && !endTime) {
    // Both empty: default to whole day (00:00 - 23:59)
    startTime = "00:00";
    endTime = "23:59";
    // Update the form fields to show the applied defaults
    document.getElementById("editRecurringStartTime").value = startTime;
    document.getElementById("editRecurringEndTime").value = endTime;
  } else if (!startTime && endTime) {
    // Only end time set: assume start from 00:00
    startTime = "00:00";
    document.getElementById("editRecurringStartTime").value = startTime;
  } else if (startTime && !endTime) {
    // Only start time set: assume end at 23:59
    endTime = "23:59";
    document.getElementById("editRecurringEndTime").value = endTime;
  }

  if (!groupId || !activeFrom) {
    alert(gettext("Please fill in Group and Active From date!"));
    return;
  }

  // Determine the scheduled content type based on the selected radio button.
  const recurringType = document.querySelector(
    'input[name="editRecurringScheduledContentType"]:checked',
  ).value;

  let payload = {
    weekday: parseInt(weekday),
    start_time: startTime,
    end_time: endTime,
    active_from: activeFrom,
    display_website_group: parseInt(groupId),
    description: description,
    combine_with_default: document.getElementById(
      "editRecurringCombineWithDefaultToggle",
    ).checked,
  };

  if (activeUntil) {
    payload.active_until = activeUntil;
  }

  if (recurringType === "slideshow") {
    const slideshowId = document.getElementById(
      "editRecurringScheduledSlideshowSelect",
    ).value;
    if (!slideshowId) {
      alert(gettext("Select Content"));
      return;
    }
    payload.slideshow_id = parseInt(slideshowId);
    payload.playlist_id = null;
  } else {
    const playlistId = document.getElementById(
      "editRecurringScheduledPlaylistSelect",
    ).value;
    if (!playlistId) {
      alert(gettext("Please select a playlist."));
      return;
    }
    payload.playlist_id = parseInt(playlistId);
    payload.slideshow_id = null;
  }

  try {
    const res = await fetch(
      `${BASE_URL}/api/recurring-scheduled-contents/${recurringId}/?branch_id=${selectedBranchID}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
    );
    if (res.ok) {
      await refreshCalendarEvents();
      editRecurringScheduledModal.hide();
      showToast(
        gettext("Recurring event updated successfully!"),
        gettext("Success"),
      );
    } else {
      console.error("Failed to update recurring scheduled content");
      const errorMsg = JSON.stringify(await res.json());
      showToast(errorMsg, gettext("Error"));
    }
  } catch (error) {
    console.error("Error updating recurring scheduled content:", error);
  }
}

async function deleteRecurringScheduledContent() {
  const recurringId = document.getElementById("editRecurringEventId").value;
  showConfirmModal(
    gettext("Are you sure you want to delete this recurring event?"),
    async () => {
      try {
        const res = await fetch(
          `${BASE_URL}/api/recurring-scheduled-contents/${recurringId}/?branch_id=${selectedBranchID}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (res.ok) {
          await refreshCalendarEvents();
          editRecurringScheduledModal.hide();
          showToast(
            gettext("Recurring event deleted successfully!"),
            gettext("Success"),
          );
        } else {
          console.error("Failed to delete recurring scheduled content");
        }
      } catch (error) {
        console.error("Error deleting recurring scheduled content:", error);
      }
    },
  );
}

// Toggle all groups: if at least one group is collapsed, then expand them all;
// otherwise collapse all.
function toggleExpandAll() {
  const groups = document.querySelectorAll(".group");
  // Determine if there is at least one collapsed group.
  let shouldExpand = false;
  groups.forEach((group) => {
    const displaysEl = group.querySelector(".group-displays");
    if (displaysEl && window.getComputedStyle(displaysEl).display === "none") {
      shouldExpand = true;
    }
  });
  groups.forEach((group) => {
    const displaysEl = group.querySelector(".group-displays");
    const iconEl = group.querySelector(".expand-icon");
    if (displaysEl) {
      if (shouldExpand) {
        displaysEl.style.display = "block";
        if (iconEl) iconEl.textContent = "expand_less";
      } else {
        displaysEl.style.display = "none";
        if (iconEl) iconEl.textContent = "expand_more";
      }
    }
  });
}

function updateSelectAllCheckbox() {
  const master = document.getElementById("toggleCheckAll");

  // valid IDs of all real groups currently rendered
  const allIds = groupsData.map((g) => g.id);

  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedGroupIds.includes(id));

  master.checked = allSelected; // keep UI in sync
}

// Toggle the check state for all groups: if all groups are selected, then unselect them;
// otherwise select all.
function toggleCheckAll() {
  const groups = document.querySelectorAll(".group");
  if (!groups || groups.length === 0) {
    console.warn(gettext("No groups found to toggle"));
    return;
  }

  // Collect all valid group IDs from the data attribute
  const allGroupIds = [];
  groups.forEach((group) => {
    const groupIdAttr = group.getAttribute("data-group-id");
    if (groupIdAttr && groupIdAttr !== "null") {
      const groupId = parseInt(groupIdAttr);
      if (!isNaN(groupId)) {
        allGroupIds.push(groupId);
      }
    }
  });

  if (allGroupIds.length === 0) {
    console.warn(gettext("No valid group IDs found"));
    return;
  }

  // Check if every group is currently selected
  const allSelected = allGroupIds.every((id) => selectedGroupIds.includes(id));

  if (allSelected) {
    document.getElementById("toggleCheckAll").checked = false;
    // Unselect all groups
    selectedGroupIds = [];
    groups.forEach((group) => {
      const checkboxDiv = group.querySelector(".group-checkbox");
      if (checkboxDiv) {
        checkboxDiv.classList.remove("checkbox-checked");
        const checkmark = checkboxDiv.querySelector(".checkbox-checkmark");
        if (checkmark) {
          checkboxDiv.removeChild(checkmark);
        }
      }
    });
  } else {
    document.getElementById("toggleCheckAll").checked = true;
    // Select all groups
    selectedGroupIds = allGroupIds;
    groups.forEach((group) => {
      const checkboxDiv = group.querySelector(".group-checkbox");
      if (checkboxDiv && !checkboxDiv.classList.contains("checkbox-checked")) {
        checkboxDiv.classList.add("checkbox-checked");
        const span = document.createElement("span");
        span.classList.add("material-symbols-outlined", "checkbox-checkmark");
        span.textContent = "check";
        checkboxDiv.appendChild(span);
      }
    });
  }

  refreshCalendarEvents();
}

// -------------------------
// DATE VALIDATION FUNCTIONS
// -------------------------

function setMinimumDatesForInputs() {
  const today = new Date();

  // For datetime-local inputs, we need the format: YYYY-MM-DDTHH:mm
  const todayDatetime =
    today.getFullYear() +
    "-" +
    String(today.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(today.getDate()).padStart(2, "0") +
    "T" +
    String(today.getHours()).padStart(2, "0") +
    ":" +
    String(today.getMinutes()).padStart(2, "0");

  // For date inputs, we need the format: YYYY-MM-DD
  const todayDate =
    today.getFullYear() +
    "-" +
    String(today.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(today.getDate()).padStart(2, "0");

  // Set minimum datetime for regular scheduled content
  const scheduledStartInput = document.getElementById("scheduledStart");
  const scheduledEndInput = document.getElementById("scheduledEnd");
  const editScheduledStartInput = document.getElementById("editScheduledStart");
  const editScheduledEndInput = document.getElementById("editScheduledEnd");

  if (scheduledStartInput) scheduledStartInput.min = todayDatetime;
  if (scheduledEndInput) scheduledEndInput.min = todayDatetime;
  if (editScheduledStartInput) editScheduledStartInput.min = todayDatetime;
  if (editScheduledEndInput) editScheduledEndInput.min = todayDatetime;

  // Set minimum date for recurring scheduled content
  const recurringActiveFromInput = document.getElementById(
    "recurringActiveFrom",
  );
  const recurringActiveUntilInput = document.getElementById(
    "recurringActiveUntil",
  );
  const editRecurringActiveFromInput = document.getElementById(
    "editRecurringActiveFrom",
  );
  const editRecurringActiveUntilInput = document.getElementById(
    "editRecurringActiveUntil",
  );

  if (recurringActiveFromInput) recurringActiveFromInput.min = todayDate;
  if (recurringActiveUntilInput) recurringActiveUntilInput.min = todayDate;
  if (editRecurringActiveFromInput)
    editRecurringActiveFromInput.min = todayDate;
  if (editRecurringActiveUntilInput)
    editRecurringActiveUntilInput.min = todayDate;

  // Add event listeners for start/end time validation
  setupDateTimeValidation();
}

function setupDateTimeValidation() {
  // Regular scheduled content validation
  const scheduledStart = document.getElementById("scheduledStart");
  const scheduledEnd = document.getElementById("scheduledEnd");

  if (scheduledStart && scheduledEnd) {
    scheduledStart.addEventListener("change", function () {
      if (this.value) {
        scheduledEnd.min = this.value;
        if (scheduledEnd.value && scheduledEnd.value < this.value) {
          scheduledEnd.value = this.value;
        }
      }
    });
  }

  // Edit scheduled content validation
  const editScheduledStart = document.getElementById("editScheduledStart");
  const editScheduledEnd = document.getElementById("editScheduledEnd");

  if (editScheduledStart && editScheduledEnd) {
    editScheduledStart.addEventListener("change", function () {
      if (this.value) {
        editScheduledEnd.min = this.value;
        if (editScheduledEnd.value && editScheduledEnd.value < this.value) {
          editScheduledEnd.value = this.value;
        }
      }
    });
  }

  // Recurring content validation
  const recurringActiveFrom = document.getElementById("recurringActiveFrom");
  const recurringActiveUntil = document.getElementById("recurringActiveUntil");

  if (recurringActiveFrom && recurringActiveUntil) {
    recurringActiveFrom.addEventListener("change", function () {
      if (this.value) {
        recurringActiveUntil.min = this.value;
        if (
          recurringActiveUntil.value &&
          recurringActiveUntil.value < this.value
        ) {
          recurringActiveUntil.value = this.value;
        }
      }
    });
  }

  // Edit recurring content validation
  const editRecurringActiveFrom = document.getElementById(
    "editRecurringActiveFrom",
  );
  const editRecurringActiveUntil = document.getElementById(
    "editRecurringActiveUntil",
  );

  if (editRecurringActiveFrom && editRecurringActiveUntil) {
    editRecurringActiveFrom.addEventListener("change", function () {
      if (this.value) {
        editRecurringActiveUntil.min = this.value;
        if (
          editRecurringActiveUntil.value &&
          editRecurringActiveUntil.value < this.value
        ) {
          editRecurringActiveUntil.value = this.value;
        }
      }
    });
  }
}

// -------------------------
// INITIALIZATION ON DOMContentLoaded
// -------------------------

function populateSlidesWrapper(options) {
  populateDropdown(
    options.dropdownId,
    options.slideshows ?? slideshows,
    options.placeholder ?? gettext("Select Content"),
    options.selectedValue ?? null,
  );
}

function filteredSlideshows() {
  return slideshows.filter((show) => show.mode === "slideshow");
}

function syncDefaultToggleAndGroup() {
  combineInputMappings.forEach((entry) => {
    const group = groupsData.find(
      (gr) => gr.id == document.getElementById(entry.groupDropdownId).value,
    );
    const toggle = entry.toggleInput;
    const warningContainer = document.getElementById(
      entry.toggleWarningContainerId,
    );

    const isInteractive =
      group?.default_slideshow?.mode === "interactive" || false;

    toggle.disabled = isInteractive;
    if (warningContainer) {
      if (isInteractive) {
        warningContainer.innerHTML = gettext(
          "You cannot combine with default content when the group has interactive slideshow as default",
        );
      } else {
        warningContainer.innerHTML = "";
      }
    }
  });
}
