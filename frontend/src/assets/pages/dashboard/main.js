// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "bootstrap";
import "./style.scss";
import {
  translateHTML,
  gettext,
  fetchUserLangugage,
} from "../../utils/locales";
import { BASE_URL } from "../../utils/constants";
import {
  token,
  updateNavbarBranchName,
  updateNavbarUsername,
  makeActiveInNav,
  initSignOutButton,
  initOrgQueryParams,
  selectedBranchID,
  selectedSubOrgID,
  getSubOrgName,
  parentOrgID,
} from "../../utils/utils.js";

// Fetch branch-level active content and render into the "Afspilles nu" column
let nowPlayingState = {
  page: 1,
  pageSize: 5,
  next: null,
  previous: null,
};

async function fetchNowPlaying(
  page = nowPlayingState.page,
  pageSize = nowPlayingState.pageSize,
) {
  const branchId = selectedBranchID;
  if (!branchId) return;
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const params = new URLSearchParams({
      branch_id: branchId,
      page,
      page_size: pageSize,
    });
    const res = await fetch(
      `${BASE_URL}/api/branch/get-active-content/?${params.toString()}`,
      {
        method: "GET",
        headers,
      },
    );
    if (!res.ok) {
      console.error("Failed to fetch now playing:", res.status);
      return;
    }
    const data = await res.json();
    nowPlayingState.page = data.current_page || page;
    nowPlayingState.pageSize = data.items_per_page || pageSize;
    nowPlayingState.next = data.next;
    nowPlayingState.previous = data.previous;
    // Prefer grouped if backend provides it (new behaviour)
    if (data.grouped && Array.isArray(data.grouped)) {
      renderNowPlayingGrouped(data.grouped || []);
    } else {
      renderNowPlaying(data.results || []);
    }
  } catch (e) {
    console.error("Error fetching now playing:", e);
  }
}

function renderNowPlaying(items) {
  const container = document.getElementById("now-playing-list");
  if (!container) return;
  container.innerHTML = "";
  if (!items || items.length === 0) {
    const el = document.createElement("div");
    el.className = "dashboard-card-row";
    el.textContent = gettext("No active displays right now.");
    container.appendChild(el);
    return;
  }

  items.forEach((item, idx) => {
    const article = document.createElement("article");
    article.className = "dashboard-card-row calendar-entry";

    const left = document.createElement("div");
    left.className = "calendar-entry-left-col";

    const titleWrapper = document.createElement("div");
    titleWrapper.className = "d-flex align-items-center gap-1";

    const loc = document.createElement("span");
    loc.className = "material-symbols-outlined icon-16 text-darkest-gray";
    loc.setAttribute("aria-hidden", "true");
    loc.textContent = "location_on";

    const title = document.createElement("span");
    title.className = "dashboard-body-text strong-text";
    // Prefer slideshow title if present otherwise playlist name
    const content =
      item.slideshow || item.slideshow_playlist || item.slideshow_playlist;
    let name = "";
    if (item.slideshow && item.slideshow.name) name = item.slideshow.name;
    else if (
      item.slideshow &&
      item.slideshow_detail &&
      item.slideshow_detail.name
    )
      name = item.slideshow_detail.name;
    else if (item.slideshow_playlist && item.slideshow_playlist.name)
      name = item.slideshow_playlist.name;
    else if (item.slideshow && item.slideshow.title)
      name = item.slideshow.title;

    // Prefer the display group name provided by the API; fall back to 'All screens'
    const groupName = item.display_website_group || gettext("All screens");
    title.innerHTML = `<span class="text-darkest-gray">${groupName}:</span> ${name}`;

    titleWrapper.appendChild(loc);
    titleWrapper.appendChild(title);

    left.appendChild(titleWrapper);

    const time = document.createElement("div");
    time.innerHTML = `<span class=\"dashboard-body-text text-darkest-gray small-text\"><span class=\"material-symbols-outlined icon-16 me-1\" aria-hidden=\"true\">event</span>${new Date().toLocaleString()}</span>`;
    left.appendChild(time);

    const right = document.createElement("div");
    right.className = "calendar-entry-right-action";
    right.innerHTML = `
      <button class=\"icon-btn\" aria-label=\"${gettext("Change view")}\">\n        <span class=\"material-symbols-outlined icon-16 text-darkest-gray\" aria-hidden=\"true\">swap_horiz</span>\n      </button>`;

    article.appendChild(left);
    article.appendChild(right);
    container.appendChild(article);
  });
}

// New renderer that accepts grouped items: [{ display_website_group, items: [...] }]
function renderNowPlayingGrouped(groups) {
  const container = document.getElementById("now-playing-list");
  if (!container) return;
  container.innerHTML = "";
  if (!groups || groups.length === 0) {
    const el = document.createElement("div");
    el.className = "dashboard-card-row";
    el.textContent = gettext("No active displays right now.");
    container.appendChild(el);
    return;
  }

  groups.forEach((group) => {
    const items = group.items || [];
    // We'll show the first item's title then a '+N' badge if more exist
    const article = document.createElement("article");
    article.className = "dashboard-card-row calendar-entry";

    const left = document.createElement("div");
    left.className = "calendar-entry-left-col";

    const titleWrapper = document.createElement("div");
    titleWrapper.className = "d-flex align-items-center gap-1";

    const loc = document.createElement("span");
    loc.className = "material-symbols-outlined icon-16 text-darkest-gray";
    loc.setAttribute("aria-hidden", "true");
    loc.textContent = "location_on";

    const title = document.createElement("span");
    title.className = "dashboard-body-text strong-text";
    const first = items[0];
    let name = "";
    if (first) {
      if (first.slideshow && first.slideshow.name) name = first.slideshow.name;
      else if (first.slideshow_playlist && first.slideshow_playlist.name)
        name = first.slideshow_playlist.name;
      else if (first.slideshow_detail && first.slideshow_detail.name)
        name = first.slideshow_detail.name;
    }

    const groupName = group.display_website_group || gettext("All screens");
    title.innerHTML = `<span class=\"text-darkest-gray\">${groupName}:</span> ${name}`;

    titleWrapper.appendChild(loc);
    titleWrapper.appendChild(title);

    if (items.length > 1) {
      const moreBtn = document.createElement("button");
      moreBtn.className =
        "btn btn-sm btn-outline-secondary ms-2 now-playing-more";
      moreBtn.type = "button";
      moreBtn.setAttribute("aria-expanded", "false");
      moreBtn.textContent = `+${items.length - 1}`;

      // Create popover but append it to document.body so it's not clipped by overflow
      const pop = document.createElement("div");
      pop.className = "now-playing-popover d-none";
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-hidden", "true");
      items.slice(1).forEach((it) => {
        const row = document.createElement("div");
        row.className = "now-playing-popover-row";
        let n =
          it.slideshow?.name ||
          it.slideshow_playlist?.name ||
          it.slideshow_detail?.name ||
          gettext("Unknown content");
        row.textContent = n;
        pop.appendChild(row);
      });

      // Helper to position popover next to button and keep it on-screen
      function positionPopover(button, popEl) {
        const pad = 8; // small gap
        const rect = button.getBoundingClientRect();
        const popRect = popEl.getBoundingClientRect();
        // default: place below the button, left-aligned
        let top = rect.bottom + pad;
        let left = rect.left;

        // If it would overflow right edge, shift left
        const overflowRight = left + popRect.width - window.innerWidth;
        if (overflowRight > 0) left = Math.max(pad, left - overflowRight - pad);

        // If not enough space below, open above
        if (top + popRect.height > window.innerHeight) {
          top = rect.top - popRect.height - pad;
          if (top < pad) top = pad; // clamp
        }

        popEl.style.left = `${Math.max(pad, left)}px`;
        popEl.style.top = `${Math.max(pad, top)}px`;
      }

      // Toggle popover visibility and wiring
      let isOpen = false;
      function openPopover() {
        if (!document.body.contains(pop)) document.body.appendChild(pop);
        pop.classList.remove("d-none");
        pop.setAttribute("aria-hidden", "false");
        moreBtn.setAttribute("aria-expanded", "true");
        // briefly ensure pop has been added so getBoundingClientRect returns correct size
        requestAnimationFrame(() => positionPopover(moreBtn, pop));
        isOpen = true;
      }
      function closePopover() {
        pop.classList.add("d-none");
        pop.setAttribute("aria-hidden", "true");
        moreBtn.setAttribute("aria-expanded", "false");
        isOpen = false;
      }

      moreBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (isOpen) closePopover();
        else openPopover();
      });

      // Close on outside click
      document.addEventListener("click", (ev) => {
        if (!isOpen) return;
        if (ev.target === moreBtn || pop.contains(ev.target)) return;
        closePopover();
      });

      // Keep positioned when resizing or scrolling
      const reposition = () => {
        if (isOpen) positionPopover(moreBtn, pop);
      };
      window.addEventListener("resize", reposition);
      window.addEventListener("scroll", reposition, true); // capture scrolls from any ancestor

      // Remove popover when the group element is removed (no memory leaks)
      // Weak cleanup: when the article is removed from DOM, close pop
      const observer = new MutationObserver(() => {
        if (!document.body.contains(article) && document.body.contains(pop)) {
          closePopover();
          try {
            pop.remove();
          } catch (e) {}
          window.removeEventListener("resize", reposition);
          window.removeEventListener("scroll", reposition, true);
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      titleWrapper.appendChild(moreBtn);
      // Do not append pop to titleWrapper; it lives on document.body
    }

    left.appendChild(titleWrapper);

    const time = document.createElement("div");
    time.innerHTML = `<span class=\"dashboard-body-text text-darkest-gray small-text\"><span class=\"material-symbols-outlined icon-16 me-1\" aria-hidden=\"true\">event</span>${new Date().toLocaleString()}</span>`;
    left.appendChild(time);

    const right = document.createElement("div");
    right.className = "calendar-entry-right-action";
    right.innerHTML = `
      <button class=\"icon-btn\" aria-label=\"${gettext("Change view")}\">\n        <span class=\"material-symbols-outlined icon-16 text-darkest-gray\" aria-hidden=\"true\">swap_horiz</span>\n      </button>`;

    article.appendChild(left);
    article.appendChild(right);
    container.appendChild(article);
  });
}

// Initial load
fetchNowPlaying();

// Latest edited slideshows and playlists state
let latestSlideshowsState = { page: 1, pageSize: 20 };
let latestPlaylistsState = { page: 1, pageSize: 20 };

async function fetchLatestSlideshows() {
  const branchId = selectedBranchID;
  if (!branchId) return;
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const params = new URLSearchParams({
      branch_id: branchId,
      page: latestSlideshowsState.page,
    });
    const res = await fetch(
      `${BASE_URL}/api/branch/latest-edited-slideshows/?${params.toString()}`,
      { method: "GET", headers },
    );
    if (!res.ok) return;
    const data = await res.json();
    renderLatestSlideshows(data.results || []);
  } catch (e) {
    console.error("Error fetching latest slideshows:", e);
  }
}

async function fetchLatestPlaylists() {
  const branchId = selectedBranchID;
  if (!branchId) return;
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const params = new URLSearchParams({
      branch_id: branchId,
      page: latestPlaylistsState.page,
    });
    const res = await fetch(
      `${BASE_URL}/api/branch/latest-edited-playlists/?${params.toString()}`,
      { method: "GET", headers },
    );
    if (!res.ok) return;
    const data = await res.json();
    renderLatestPlaylists(data.results || []);
  } catch (e) {
    console.error("Error fetching latest playlists:", e);
  }
}

function renderLatestSlideshows(items) {
  const container = document
    .querySelector("#recent-content-title")
    .closest(".dashboard-card")
    .querySelector(".dashboard-card-scrollable-content");
  if (!container) return;
  container.innerHTML = "";
  if (!items || items.length === 0) {
    const el = document.createElement("div");
    el.className = "dashboard-card-row";
    el.textContent = gettext("No recently edited content.");
    container.appendChild(el);
    return;
  }

  items.forEach((it) => {
    const row = document.createElement("div");
    row.className = "dashboard-card-row w-100 border-bottom";

    const details = document.createElement("div");
    details.className = "dashboard-card-row-details";

    const span = document.createElement("span");
    span.className = "dashboard-body-text";
    const title = document.createElement("span");
    title.className = "dashboard-item-title";
    title.textContent = it.name;
    const time = document.createElement("span");
    time.className = "dashboard-item-time";
    time.innerHTML = `<span class="material-symbols-outlined me-1 icon-16" aria-hidden="true">restore</span> ${it.last_edited ? new Date(it.last_edited).toLocaleString() : ""}`;

    span.appendChild(title);
    span.appendChild(time);
    details.appendChild(span);

    const btn = document.createElement("button");
    btn.className = "btn btn-sm dashboard-btn-outline";
    btn.textContent = gettext("Open");
    btn.addEventListener("click", () => {
      // Open manage content page for this slideshow
      localStorage.setItem("selectedSlideshowID", it.id);
      window.location.href = "/edit-content?id=" + it.id + "&mode=edit&orgId=" + parentOrgID + "&subOrgId=" + selectedSubOrgID + "&branchId=" + selectedBranchID;
    });

    details.appendChild(btn);
    row.appendChild(details);
    container.appendChild(row);
  });
}

function renderLatestPlaylists(items) {
  const container = document
    .querySelector("#recent-playlists-title")
    .closest(".dashboard-card")
    .querySelector(".dashboard-card-scrollable-content");
  if (!container) return;
  container.innerHTML = "";
  if (!items || items.length === 0) {
    const el = document.createElement("div");
    el.className = "dashboard-card-row";
    el.textContent = gettext("No recently edited playlists.");
    container.appendChild(el);
    return;
  }

  items.forEach((it) => {
    const row = document.createElement("div");
    row.className = "dashboard-card-row w-100 border-bottom";

    const details = document.createElement("div");
    details.className = "dashboard-card-row-details";

    const span = document.createElement("span");
    span.className = "dashboard-body-text";
    const title = document.createElement("span");
    title.className = "dashboard-item-title";
    title.textContent = it.name;
    const time = document.createElement("span");
    time.className = "dashboard-item-time";
    time.innerHTML = `<span class="material-symbols-outlined me-1 icon-16" aria-hidden="true">restore</span> ${it.last_edited ? new Date(it.last_edited).toLocaleString() : ""}`;

    span.appendChild(title);
    span.appendChild(time);
    details.appendChild(span);

    const btn = document.createElement("button");
    btn.className = "btn btn-sm dashboard-btn-outline";
    btn.textContent = gettext("Open");
    btn.addEventListener("click", () => {
      window.location.href = "/slideshow-playlists?playlist_id=" + it.id + "&orgId=" + parentOrgID + "&subOrgId=" + selectedSubOrgID + "&branchId=" + selectedBranchID;
    });

    details.appendChild(btn);
    row.appendChild(details);
    container.appendChild(row);
  });
}

// Initial fetch for lists
fetchLatestSlideshows();
fetchLatestPlaylists();

// Upcoming (Planlagt) - show next 10 results for the branch
async function fetchUpcoming() {
  const branchId = selectedBranchID;
  if (!branchId) return;
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const params = new URLSearchParams({ branch_id: branchId });
    const res = await fetch(
      `${BASE_URL}/api/branch/get-upcoming-content/?${params.toString()}`,
      {
        method: "GET",
        headers,
      },
    );
    if (!res.ok) {
      console.error("Failed to fetch upcoming:", res.status);
      return;
    }
    const data = await res.json();
    renderUpcoming(data.results || []);
  } catch (e) {
    console.error("Error fetching upcoming:", e);
  }
}

function formatShortDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch (e) {
    return iso;
  }
}

function renderUpcoming(items) {
  const container = document.getElementById("upcoming-list");
  if (!container) return;
  container.innerHTML = "";
  if (!items || items.length === 0) {
    const el = document.createElement("div");
    el.className = "dashboard-card-row";
    el.textContent = gettext("No scheduled displays found.");
    container.appendChild(el);
    return;
  }

  items.forEach((it) => {
    const article = document.createElement("article");
    article.className = "dashboard-card-row calendar-entry";

    const left = document.createElement("div");
    left.className = "calendar-entry-left-col";

    const titleWrapper = document.createElement("div");
    titleWrapper.className = "d-flex align-items-center gap-1";

    const loc = document.createElement("span");
    loc.className = "material-symbols-outlined icon-16 text-darkest-gray";
    loc.setAttribute("aria-hidden", "true");
    loc.textContent = "location_on";

    const title = document.createElement("span");
    title.className = "dashboard-body-text strong-text";
    const group = it.group || gettext("All screens");
    const name =
      it.content?.name || it.content?.title || gettext("Unknown content");
    title.innerHTML = `<span class=\"text-darkest-gray\">${group}:</span> ${name}`;

    titleWrapper.appendChild(loc);
    titleWrapper.appendChild(title);
    left.appendChild(titleWrapper);

    const time = document.createElement("div");
    time.innerHTML = `<span class=\"dashboard-body-text text-darkest-gray small-text\"><span class=\"material-symbols-outlined icon-16 me-1\" aria-hidden=\"true\">event</span>${formatShortDate(it.start_time)}</span>`;
    left.appendChild(time);

    const right = document.createElement("div");
    right.className = "calendar-entry-right-action";
    right.innerHTML = `<span class=\"material-symbols-outlined icon-16 text-darkest-gray\" aria-hidden=\"true\">event</span>`;

    article.appendChild(left);
    article.appendChild(right);
    container.appendChild(article);
  });
}

(async () => {
  if ((await getSubOrgName(selectedSubOrgID)) === "Global") {
    window.location.href = "/manage-fonts-and-color-scheme?branchId=" + selectedBranchID + "&subOrgId=" + selectedSubOrgID + "&orgId=" + parentOrgID;
  }
})();

// Initial upcoming load
fetchUpcoming();

document.addEventListener("DOMContentLoaded", async () => {
  await fetchUserLangugage();
  translateHTML();
  updateNavbarUsername();
  updateNavbarBranchName();
  makeActiveInNav("/dashboard");
  initSignOutButton();
  initOrgQueryParams();
});
