// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import Sortable from "sortablejs";
import "./style.scss";
import * as bootstrap from "bootstrap";
import {
  makeActiveInNav,
  updateNavbarBranchName,
  token,
  selectedBranchID,
  showToast,
  autoHyphenate,
  queryParams,
  updateNavbarUsername,
  setupDeleteConfirmation,
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

makeActiveInNav("/slideshow-playlists");
updateNavbarBranchName();
updateNavbarUsername();

// static/js_and_css/pages/slideshow_playlist/slideshow-playlists.js

let currentSlideshowPlaylistId = null;
let currentSlideshowPlaylist = null; // Store the full playlist object
let playlistToRenameId = null;
let initialSelectedPlaylistId = null;

async function fetchSlideshowPlaylists() {
  try {
    const response = await fetch(
      `${BASE_URL}/api/slideshow-playlists/?branch_id=${selectedBranchID}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (response.ok) {
      renderSlideshowPlaylists(await response.json());
    } else {
      showToast(gettext("Failed to fetch slideshow playlists."), "Error");
    }
  } catch (error) {
    showToast(gettext("Network error occurred, ") + error, "Error");
  }
}

function renderSlideshowPlaylists(slideshowPlaylists) {
  const list = document.getElementById("slideshow-playlist-list");
  list.innerHTML = "";

  slideshowPlaylists.forEach((pl) => {
    const item = document.createElement("div");
    item.className =
      "d-flex justify-content-between align-items-center p-2 rounded playlist-item";

    // expose id for easy lookup when auto-selecting from URL
    item.dataset.id = pl.id;

    item.style.cursor = "pointer";

    // select + edit on row click
    item.addEventListener("click", () => {
      makeElementActive(item);
      editSlideshowPlaylist(pl);
    });

    // name and aspect ratio container
    const contentContainer = document.createElement("div");
    contentContainer.style.maxWidth = "75%";

    const nameSpan = document.createElement("div");
    nameSpan.innerHTML = autoHyphenate(pl.name);
    nameSpan.style.wordBreak = "break-all";
    nameSpan.style.hyphens = "auto";
    nameSpan.style.fontWeight = "500";

    const aspectRatioSpan = document.createElement("small");
    aspectRatioSpan.textContent = pl.aspect_ratio || "16:9";
    aspectRatioSpan.className = "text-muted";
    aspectRatioSpan.style.fontSize = "0.75rem";

    contentContainer.appendChild(nameSpan);
    contentContainer.appendChild(aspectRatioSpan);

    // rename btn
    const renameBtn = document.createElement("button");
    renameBtn.className = "btn btn-sm me-2";
    renameBtn.innerHTML = `<i class="material-symbols-outlined">edit</i>`;
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openRenamePlaylistModal(e, pl.id, pl.name);
    });

    // delete btn
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-sm btn-secondary";
    deleteBtn.innerHTML = `<i class="material-symbols-outlined fs-extra-large">delete_forever</i>`;
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSlideshowPlaylist(pl.id, pl.name);
    });

    const nameDiv = document.createElement("div");
    nameDiv.className = "d-flex justify-content-start align-items-center";
    nameDiv.style.maxWidth = "80%";
    nameDiv.append(contentContainer, renameBtn);
    item.append(nameDiv, deleteBtn);

    if (pl.id === currentSlideshowPlaylistId) {
      item.classList.add("active");
    }

    list.appendChild(item);
  });

  // If the page was opened with a playlist_id query param, try to auto-select it
  if (!currentSlideshowPlaylistId && initialSelectedPlaylistId) {
    const targetPlaylist = slideshowPlaylists.find(pl => pl.id == initialSelectedPlaylistId);
    if (targetPlaylist) {
      const targetEl = list.querySelector(
        `.playlist-item[data-id="${initialSelectedPlaylistId}"]`,
      );
      if (targetEl) {
        makeElementActive(targetEl);
        editSlideshowPlaylist(targetPlaylist);
        // consumed
        initialSelectedPlaylistId = null;
        return;
      }
    }
  }

  // ——— auto-select first playlist if nothing is selected yet ———
  if (!currentSlideshowPlaylistId && slideshowPlaylists.length > 0) {
    const firstPl = slideshowPlaylists[0];
    const firstItem = list.querySelector(".playlist-item");
    makeElementActive(firstItem);
    editSlideshowPlaylist(firstPl);
  }
}

function openAddPlaylistModal() {
  const form = document.getElementById("add-playlist-form");
  form.reset();
  form.classList.remove("was-validated");
  new bootstrap.Modal(document.getElementById("addPlaylistModal")).show();
}

async function submitAddPlaylist() {
  const form = document.getElementById("add-playlist-form");
  const input = document.getElementById("new-playlist-name");
  const aspectRatioSelect = document.getElementById("playlist-aspect-ratio");

  if (!form.checkValidity()) {
    form.classList.add("was-validated");
    return;
  }
  const name = input.value.trim();
  const aspectRatio = aspectRatioSelect.value;
  
  if (!name)
    return showToast(gettext("Playlist name cannot be empty."), "Warning");
  if (!aspectRatio)
    return showToast(gettext("Please select an aspect ratio."), "Warning");

  try {
    const res = await fetch(
      `${BASE_URL}/api/slideshow-playlists/?branch_id=${selectedBranchID}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, aspect_ratio: aspectRatio }),
      },
    );
    if (!res.ok) {
      const err = await res.json();
      return showToast(
        err.detail || gettext("Failed to create playlist."),
        "Error",
      );
    }
    const newPl = await res.json();
    showToast(gettext("Playlist created!"), "Success");
    bootstrap.Modal.getInstance(
      document.getElementById("addPlaylistModal"),
    ).hide();

    currentSlideshowPlaylistId = newPl.id;

    await fetchSlideshowPlaylists();
    editSlideshowPlaylist(newPl);
  } catch {
    showToast(gettext("An unexpected error occurred."), "Error");
  }
}

function renameActivePlaylist() {
  if (!currentSlideshowPlaylistId) {
    return showToast(gettext("Please select a playlist first."), "Warning");
  }
  // Set up rename modal for the currently active playlist
  playlistToRenameId = currentSlideshowPlaylistId;
  const currentName = document.getElementById(
    "slideshow-playlist-name",
  ).textContent;
  const form = document.getElementById("rename-playlist-form");
  const input = document.getElementById("rename-playlist-name");

  input.value = currentName;
  form.classList.remove("was-validated");
  new bootstrap.Modal(document.getElementById("renamePlaylistModal")).show();
}

document
  .getElementById("rename-active-playlist-btn")
  .addEventListener("click", renameActivePlaylist);

function openRenamePlaylistModal(event, playlistId, currentName) {
  event.stopPropagation();
  playlistToRenameId = playlistId;
  const form = document.getElementById("rename-playlist-form");
  document.getElementById("rename-playlist-name").value = currentName;
  form.classList.remove("was-validated");
  new bootstrap.Modal(document.getElementById("renamePlaylistModal")).show();
}

async function submitRenamePlaylist() {
  const form = document.getElementById("rename-playlist-form");
  const input = document.getElementById("rename-playlist-name");

  if (!form.checkValidity()) {
    form.classList.add("was-validated");
    return;
  }
  const name = input.value.trim();
  if (!name)
    return showToast(gettext("Playlist name cannot be empty."), "Warning");

  try {
    const res = await fetch(
      `${BASE_URL}/api/slideshow-playlists/${playlistToRenameId}/?branch_id=${selectedBranchID}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      },
    );
    if (!res.ok) {
      const err = await res.json();
      return showToast(
        err.detail || gettext("Failed to rename playlist."),
        "Error",
      );
    }
    showToast(gettext("Renamed!"), "Success");
    bootstrap.Modal.getInstance(
      document.getElementById("renamePlaylistModal"),
    ).hide();
    await fetchSlideshowPlaylists();
    if (currentSlideshowPlaylistId === playlistToRenameId) {
      document.getElementById("slideshow-playlist-name").textContent = name;
    }
  } catch {
    showToast(gettext("An unexpected error occurred."), "Error");
  }
}

function deleteSlideshowPlaylist(playlistId, playlistName) {
  openDeletePlaylistModal(playlistId, playlistName);
}

window.openDeletePlaylistModal = (id, name) => {
  const playlistIdToDelete = id;
  document.getElementById("playlistToDeleteName").textContent = name;

  // Set up confirmation text for typing validation
  const requiredText = `Delete playlist ${name}`;

  // Use the utility function for delete confirmation setup
  setupDeleteConfirmation(
    "deletePlaylistInput",
    "confirmDeletePlaylistButton",
    "deletePlaylistError",
    "deletePlaylistTextToType",
    requiredText,
  );

  // Store playlist info
  document.getElementById("deletePlaylistId").value = id;
  document.getElementById("deletePlaylistName").value = name;

  const deleteModal = new bootstrap.Modal(
    document.getElementById("deletePlaylistModal"),
  );
  deleteModal.show();
};

function editSlideshowPlaylist(playlist) {
  // Handle both old (id, name) and new (playlist object) parameter formats
  if (typeof playlist === 'number' || typeof playlist === 'string') {
    currentSlideshowPlaylistId = playlist;
    currentSlideshowPlaylist = null; // Fallback - we don't have the full object
    document.getElementById("slideshow-playlist-name").textContent = arguments[1] || 'Unknown';
  } else {
    currentSlideshowPlaylistId = playlist.id;
    currentSlideshowPlaylist = playlist;
    document.getElementById("slideshow-playlist-name").textContent = playlist.name;
    
    // Update aspect ratio display
    const aspectRatioDisplay = document.getElementById("playlist-aspect-ratio-display");
    if (aspectRatioDisplay) {
      aspectRatioDisplay.textContent = playlist.aspect_ratio || "16:9";
    }
  }

  document.getElementById("playlist-selected-view").classList.remove("d-none");
  document.getElementById("no-playlist-selected-view").classList.add("d-none");

  document
    .getElementById("no-selection")
    .classList.replace("d-block", "d-none");
  document
    .getElementById("edit-section")
    .classList.replace("d-none", "d-block");
  fetchSlideshowPlaylistItems();

  // Persist selection in the URL so direct links can open this playlist
  setPlaylistQueryParam(currentSlideshowPlaylistId);
}

function hideEditSection() {
  currentSlideshowPlaylistId = null;
  document.getElementById("slideshow-playlist-name").textContent = "";

  document.getElementById("playlist-selected-view").classList.add("d-none");
  document
    .getElementById("no-playlist-selected-view")
    .classList.remove("d-none");

  document
    .getElementById("edit-section")
    .classList.replace("d-block", "d-none");
  document
    .getElementById("no-selection")
    .classList.replace("d-none", "d-block");

  // Clear query param when nothing is selected
  setPlaylistQueryParam(null);
}

function setPlaylistQueryParam(id) {
  try {
    const url = new URL(window.location.href);
    if (id == null || id === "" || id === undefined) {
      url.searchParams.delete("playlist_id");
    } else {
      url.searchParams.set("playlist_id", String(id));
    }
    window.history.replaceState({}, "", url.toString());
  } catch (e) {
    // ignore (older browsers) — not critical
  }
}

async function fetchSlideshowPlaylistItems() {
  if (!currentSlideshowPlaylistId) return;
  try {
    const res = await fetch(
      `${BASE_URL}/api/slideshow-playlist-items/?playlist_id=${currentSlideshowPlaylistId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error();

    renderSlideshowPlaylistItems(await res.json());
  } catch (error) {
    console.error("Failed to fetch playlist items:", error);
    showToast(gettext("Failed to fetch playlist items."), "Error");
  }
}

function renderSlideshowPlaylistItems(items) {
  const tbody = document.querySelector("#slideshow-playlist-table tbody");
  tbody.innerHTML = "";

  items.forEach(({ slideshow, position, id }) => {
    const row = document.createElement("tr");
    row.dataset.id = id;

    // 1) drag‐handle cell
    const dragTd = document.createElement("td");
    const dragIcon = document.createElement("i");
    dragIcon.className = "material-symbols-outlined";
    dragIcon.style.color = "var(--gray)";
    dragIcon.textContent = "drag_indicator";
    dragTd.appendChild(dragIcon);

    // 2) name cell
    const nameTd = document.createElement("td");
    nameTd.className = "fs-medium";
    nameTd.innerHTML = autoHyphenate(slideshow.name);

    // 3) position cell
    const posTd = document.createElement("td");
    posTd.className = "fs-medium";
    posTd.textContent = position;

    // 4) actions cell
    const actTd = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-secondary btn-sm";
    delBtn.innerHTML =
      '<i class="material-symbols-outlined fs-extra-large">close</i> ' +
      gettext("Delete");
    delBtn.addEventListener("click", () => deleteSlideshowPlaylistItem(id));
    actTd.appendChild(delBtn);

    row.append(dragTd, nameTd, posTd, actTd);
    tbody.appendChild(row);
  });

  // ← now the whole row is draggable again
  new Sortable(tbody, {
    animation: 150,
    onEnd: updatePositions,
  });
}

async function updatePositions() {
  const rows = document.querySelectorAll("#slideshow-playlist-table tbody tr");
  const updates = Array.from(rows).map((r, i) => ({
    id: r.dataset.id,
    position: i + 1,
  }));
  try {
    await Promise.all(updates.map(updatePosition));
    await fetchSlideshowPlaylistItems();
    showToast(gettext("Positions updated successfully."), "Success");
  } catch {
    showToast(gettext("Failed to update positions."), "Error");
  }
}

async function updatePosition({ id, position }) {
  const res = await fetch(
    `${BASE_URL}/api/slideshow-playlist-items/${id}/?branch_id=${selectedBranchID}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ position }),
    },
  );
  if (!res.ok) throw new Error();
}

function deleteSlideshowPlaylistItem(itemId) {
  if (
    confirm(
      gettext("Are you sure you want to delete this item from the playlist?"),
    )
  ) {
    (async () => {
      try {
        const res = await fetch(
          `${BASE_URL}/api/slideshow-playlist-items/${itemId}/?branch_id=${selectedBranchID}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!res.ok) throw new Error();
        showToast(gettext("Item deleted successfully."), "Success");
        await fetchSlideshowPlaylistItems();
      } catch {
        showToast(gettext("Failed to delete item."), "Error");
      }
    })();
  }
}

async function fetchSlideshows() {
  try {
    const res = await fetch(
      `${BASE_URL}/api/manage_content/?branch_id=${selectedBranchID}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    populateSlideshowSelect(
      data.filter((s) => s.mode.toLowerCase() !== "interactive"),
    );
  } catch {
    showToast(gettext("Failed to fetch slideshows"), "Error");
  }
}

function populateSlideshowSelect(slideshows) {
  const select = document.getElementById("slideshow-select");
  select.innerHTML = "";

  // Get aspect ratio indicator elements
  const playlistAspectRatioInfo = document.getElementById("playlist-aspect-ratio-info");
  const modalPlaylistAspectRatio = document.getElementById("modal-playlist-aspect-ratio");
  const slideshowAspectRatioIndicator = document.getElementById("slideshow-aspect-ratio-indicator");
  const slideshowAspectRatioValue = document.getElementById("slideshow-aspect-ratio-value");

  // Show playlist aspect ratio info if available
  if (currentSlideshowPlaylist && currentSlideshowPlaylist.aspect_ratio) {
    modalPlaylistAspectRatio.textContent = currentSlideshowPlaylist.aspect_ratio;
    playlistAspectRatioInfo.style.display = "block";
    
    slideshowAspectRatioValue.textContent = currentSlideshowPlaylist.aspect_ratio;
    slideshowAspectRatioIndicator.style.display = "block";
  } else {
    playlistAspectRatioInfo.style.display = "none";
    slideshowAspectRatioIndicator.style.display = "none";
  }

  // Filter slideshows by current playlist's aspect ratio
  let filteredSlideshows = slideshows;
  if (currentSlideshowPlaylist && currentSlideshowPlaylist.aspect_ratio) {
    filteredSlideshows = slideshows.filter(s => s.aspect_ratio === currentSlideshowPlaylist.aspect_ratio);
  }

  if (filteredSlideshows.length === 0) {
    const noMatchOption = document.createElement("option");
    noMatchOption.value = "";
    noMatchOption.disabled = true;
    noMatchOption.selected = true;
    noMatchOption.textContent = currentSlideshowPlaylist 
      ? gettext(`No slideshows available with aspect ratio ${currentSlideshowPlaylist.aspect_ratio}`)
      : gettext("No slideshows available");
    select.appendChild(noMatchOption);
    return;
  }

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.disabled = true;
  defaultOption.selected = true;
  defaultOption.textContent = gettext("Select a slideshow");
  select.appendChild(defaultOption);

  filteredSlideshows.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.name} (${s.aspect_ratio})`;
    select.appendChild(opt);
  });
}

async function saveSelectedSlideshow() {
  const slideshowId = document.getElementById("slideshow-select").value;
  if (!currentSlideshowPlaylistId) return;
  try {
    const res = await fetch(
      `${BASE_URL}/api/slideshow-playlist-items/?branch_id=${selectedBranchID}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slideshow: slideshowId,
          slideshow_playlist: currentSlideshowPlaylistId,
        }),
      },
    );
    if (!res.ok) throw new Error();
    showToast(gettext("Slideshow added to playlist."), "Success");
    bootstrap.Modal.getInstance(document.getElementById("addModal")).hide();
    await fetchSlideshowPlaylistItems();
  } catch {
    showToast(gettext("Failed to add slideshow."), "Error");
  }
}

function makeElementActive(el) {
  document
    .querySelectorAll(".playlist-item")
    .forEach((i) => i.classList.remove("active"));
  el.classList.add("active");
}

// ——— All event listener wiring ———
document.addEventListener("DOMContentLoaded", () => {
  // capture playlist_id from query params so we can auto-select
  try {
    const url = new URL(window.location.href);
    const pid = url.searchParams.get("playlist_id");
    if (pid) initialSelectedPlaylistId = String(pid);
  } catch (e) {
    initialSelectedPlaylistId = null;
  }

  fetchSlideshowPlaylists();
  document
    .querySelector('a[href="/slideshow-playlists"]')
    .classList.add("active");

  document
    .getElementById("open-add-playlist-btn")
    .addEventListener("click", openAddPlaylistModal);
  document
    .getElementById("submit-add-playlist-btn")
    .addEventListener("click", submitAddPlaylist);
  document
    .getElementById("submit-rename-playlist-btn")
    .addEventListener("click", submitRenamePlaylist);
  document
    .getElementById("save-slideshow-btn")
    .addEventListener("click", saveSelectedSlideshow);

  document
    .getElementById("add-playlist-form")
    .addEventListener("submit", (e) => e.preventDefault());
  document
    .getElementById("rename-playlist-form")
    .addEventListener("submit", (e) => e.preventDefault());

  document.getElementById("addModal").addEventListener("show.bs.modal", (e) => {
    if (!currentSlideshowPlaylistId) {
      e.preventDefault();
      showToast(gettext("Please select a playlist first."), "Warning");
    } else {
      fetchSlideshows();
    }
  });

  if (queryParams.createPlaylist === "true") {
    openAddPlaylistModal();
  }

  // Delete playlist confirmation
  document
    .getElementById("confirmDeletePlaylistButton")
    .addEventListener("click", async () => {
      const playlistId = document.getElementById("deletePlaylistId").value;
      if (!playlistId) return;

      try {
        const res = await fetch(
          `${BASE_URL}/api/slideshow-playlists/${playlistId}/?branch_id=${selectedBranchID}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!res.ok) throw new Error();
        showToast("Deleted.", "Success");
        bootstrap.Modal.getInstance(
          document.getElementById("deletePlaylistModal"),
        ).hide();
        if (currentSlideshowPlaylistId === playlistId) hideEditSection();
        await fetchSlideshowPlaylists();
      } catch {
        showToast(gettext("Failed to delete playlist."), "Error");
      }
    });
});
