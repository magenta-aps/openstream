// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import initWayfindingCore from "./wayfinding-core.js";
import { BASE_URL } from "../../utils/constants.js";
import { genericFetch, token, selectedBranchID } from "../../utils/utils.js";

document.addEventListener("DOMContentLoaded", () => {
  const mapContainer = document.getElementById("map-container");
  const pointsContainer = document.getElementById("points-container");
  const svgOverlay = document.getElementById("svg-overlay");
  const overlayWrapper = document.getElementById("overlay-wrapper");
  const mapImage = document.getElementById("map-image");

  // POIs sidebar element (lookup early so render() can use it)
  const poisListEl = document.getElementById("pois-list");
  const poiTypeSelect = document.getElementById("poi-type-select");

  let floors = [];
  let points = [];
  let paths = [];
  let currentFloorId = null;
  let activeFloorIds = null; // when set to an array, renderer will show multiple floors side-by-side
  let povScreenId = null; // selected POV screen id
  let selectedPoiId = null; // persist sidebar selection across re-renders
  let searchTerm = ""; // current search term for filtering POIs
  let systemName = ""; // name of the wayfinding system

  // Get wayfinding system ID and API key from URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const wayfindingSystemId = urlParams.get("id");
  const apiKey = urlParams.get("api_key");

  if (!wayfindingSystemId) {
    alert(
      "No wayfinding system ID provided. Please access this page with an ID parameter.",
    );
    // Could redirect to a selection page or show an error
    return;
  }

  const core = initWayfindingCore({
    mapContainer,
    pointsContainer,
    svgOverlay,
    overlayWrapper,
    mapImage,
    getState: () => ({ floors, points, paths, currentFloorId, activeFloorIds }),
    // When a point on the map is clicked in user-facing mode, toggle the
    // path from the selected POV to that point. If no POV is selected,
    // center the view on the clicked point instead.
    onPointClick: (pointData, event) => {
      // reflect selection in the sidebar when a point on the map is clicked
      selectedPoiId =
        pointData && pointData.type === "poi" ? pointData.id : null;

      // If there's no POV selected, just center on the POI/screen
      if (!povScreenId) {
        currentFloorId = pointData.floorId;
        activeFloorIds = null;
        render();
        if (pointData.element) {
          pointData.element.style.transform =
            "translate(-50%, -50%) scale(1.4)";
          setTimeout(
            () =>
              (pointData.element.style.transform =
                "translate(-50%, -50%) scale(1)"),
            900,
          );
        }
        return;
      }

      // Find a path from the POV screen to the clicked point
      const pathObj = paths.find(
        (p) => p.fromId === povScreenId && p.toId === pointData.id,
      );
      if (!pathObj) {
        // No path defined: center on clicked point and notify the user
        currentFloorId = pointData.floorId;
        activeFloorIds = null;
        render();
        alert("No path defined from selected screen to this point.");
        return;
      }

      // Toggle visibility: if this path was visible, hide all; otherwise show only this path
      if (pathObj.visible) {
        core.hideAllPaths(paths);
        activeFloorIds = null;
        if (povScreenId) {
          const sp = points.find((p) => p.id === povScreenId);
          if (sp) currentFloorId = sp.floorId;
        }
      } else {
        core.showOnlyPath(paths, pathObj.id);
        // determine distinct floors involved in this path
        const segmentFloorIds = Array.from(
          new Set((pathObj.segments || []).map((s) => s.floorId)),
        );
        if (segmentFloorIds.length > 1) {
          // show floors side-by-side starting from the path's start floor on left
          activeFloorIds = segmentFloorIds;
        } else {
          activeFloorIds = null;
          const firstSegment = pathObj.segments && pathObj.segments[0];
          if (firstSegment) currentFloorId = firstSegment.floorId;
        }
        // reset inactivity timer so the path will auto-hide after inactivity
        resetInactivityTimer();
      }

      render();
    },
  });

  // Inactivity timer: after 30s without user interaction, hide any shown paths
  const INACTIVITY_MS = 30 * 1000;
  let inactivityTimer = null;
  function clearInactivityTimer() {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  }
  function resetInactivityTimer() {
    clearInactivityTimer();
    inactivityTimer = setTimeout(() => {
      // hide any paths and return view to the POV screen's floor
      core.hideAllPaths(paths);
      activeFloorIds = null;
      if (povScreenId) {
        const sp = points.find((p) => p.id === povScreenId);
        if (sp) currentFloorId = sp.floorId;
      }
      render();
    }, INACTIVITY_MS);
  }

  // Consider these DOM interactions as user activity
  ["click", "mousemove", "keydown", "touchstart"].forEach((ev) => {
    document.addEventListener(ev, () => resetInactivityTimer(), {
      passive: true,
    });
  });

  function render() {
    core.renderMapContent();
    renderSidebarLists(searchTerm);
    updateYouAreHere();
    updateSystemName();
  }

  function updateSystemName() {
    const systemNameElement = document.getElementById("system-name");
    if (systemNameElement && systemName) {
      systemNameElement.textContent = systemName;
    }
  }

  // Add search functionality
  const searchInput = document.getElementById("poi-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchTerm = e.target.value.trim();
      renderSidebarLists(searchTerm);
    });
  }
  // re-render when type filter changes
  if (poiTypeSelect) {
    poiTypeSelect.addEventListener("change", () => {
      renderSidebarLists(searchTerm);
    });
  }

  mapImage.addEventListener("load", () => core.updateOverlayDimensions());

  async function loadWayfindingData() {
    try {
      // Prepare headers based on authentication method
      const headers = {};
      let url = `${BASE_URL}/api/wayfinding/${wayfindingSystemId}/`;

      if (apiKey) {
        // Use API key authentication
        headers["X-API-KEY"] = apiKey;
        // Add branch_id if available from selectedBranchID
        if (selectedBranchID) {
          url += `?branch_id=${selectedBranchID}`;
        }
      } else {
        // Use user token authentication
        headers["Authorization"] = `Bearer ${token}`;
        url += `?branch_id=${selectedBranchID}`;
      }

      const data = await genericFetch(url, "GET", null, headers);

      if (data && data.wayfinding_data) {
        // Capture the system name from the API response
        systemName = data.name || "Interactive Map";

        let wayfindingData;

        // Parse wayfinding_data if it's a string, otherwise use as-is
        if (typeof data.wayfinding_data === "string") {
          try {
            wayfindingData = JSON.parse(data.wayfinding_data);
          } catch (e) {
            console.error("Error parsing wayfinding_data JSON:", e);
            wayfindingData = {};
          }
        } else {
          wayfindingData = data.wayfinding_data;
        }


        // Load the data into the state
        floors = Array.isArray(wayfindingData.floors)
          ? wayfindingData.floors
          : [];
        points = Array.isArray(wayfindingData.points)
          ? wayfindingData.points
          : [];
        paths = Array.isArray(wayfindingData.paths) ? wayfindingData.paths : [];
        currentFloorId = wayfindingData.currentFloorId || floors[0]?.id || null;

        // If the parsed data includes a POV screen id, use its floor as the initial view
        const providedPov =
          wayfindingData.povScreenId ||
          wayfindingData.povScreen ||
          wayfindingData.pov ||
          wayfindingData.pov_id ||
          wayfindingData.initialPOV;
        if (providedPov && points && points.find((p) => p.id === providedPov)) {
          povScreenId = providedPov;
          const sp = points.find((p) => p.id === povScreenId);
          if (sp) currentFloorId = sp.floorId;
        }

        // Ensure no paths are visible on initial open
        core.hideAllPaths(paths);
        render();

        // Check if we need to show POV selection modal
        const screenPoints = points.filter((p) => p.type === "screen");
        if (screenPoints.length > 0 && !povScreenId) {
          showPOVModal();
        }
      } else {
        console.warn("No wayfinding data found");
        // Set default system name if no data is found
        systemName = data?.name || "Interactive Map";
        // Create a default floor so the map shows something
        floors.push({ id: "floor-1", name: "Floor 1", imageUrl: "" });
        currentFloorId = floors[0].id;
        core.hideAllPaths(paths);
        render();
      }
    } catch (err) {
      console.error("Failed to load wayfinding data:", err);
      alert("Failed to load wayfinding data. Please try again.");
    }
  }

  // Load data on page load
  loadWayfindingData();

  function showPOVModal() {
    const povOverlay = document.getElementById("pov-modal-overlay");
    const povList = document.getElementById("pov-screens-list");
    const povConfirm = document.getElementById("pov-confirm-btn");
    const povClose = document.getElementById("pov-close-btn");

    if (!povOverlay || !povList || !povConfirm) {
      console.warn("POV modal elements not found");
      return;
    }

    // populate modal list of screens
    povList.innerHTML = "";
    const screenPoints = points.filter((p) => p.type === "screen");
    screenPoints.forEach((s) => {
      const li = document.createElement("li");
      li.style.padding = "0.5rem";
      li.style.cursor = "pointer";
      li.style.border = "1px solid #e5e7eb";
      li.style.borderRadius = "4px";
      li.style.marginBottom = "0.5rem";
      li.dataset.id = s.id;
      li.innerHTML = `<strong>${s.label?.substring ? s.label.substring(1) : s.id}</strong> <div class="text-sm text-gray-600">${s.name || ""}</div>`;
      li.addEventListener("click", () => {
        povList
          .querySelectorAll("li")
          .forEach((n) => (n.style.background = ""));
        li.style.background = "#dbeafe";
        povScreenId = s.id;
      });
      povList.appendChild(li);
    });

    povOverlay.style.display = "flex";

    // Add event listeners
    povClose &&
      povClose.addEventListener("click", () => {
        povOverlay.style.display = "none";
      });

    povConfirm.addEventListener("click", () => {
      povOverlay.style.display = "none";
      if (!povScreenId) {
        alert("Please select a screen to use as the POV before continuing.");
        povOverlay.style.display = "flex";
        return;
      }
      // reset multi-floor view when selecting new POV
      activeFloorIds = null;
      // center the view on the selected POV's floor
      const sp = points.find((p) => p.id === povScreenId);
      if (sp) currentFloorId = sp.floorId;
      // after selecting POV, ensure paths are hidden until user explicitly navigates
      core.hideAllPaths(paths);
      render();
      // start inactivity timer so view returns after 30s if user doesn't interact
      resetInactivityTimer();
    });
  }

  function renderSidebarLists(searchTerm = "") {
    if (!poisListEl) return;
    poisListEl.innerHTML = "";

    // ensure POI type selector contains only types used by current points
    if (poiTypeSelect) {
      // collect used types
      const used = Array.from(
        new Set(
          points
            .filter((p) => p.type === "poi" && p.poiType)
            .map((p) => p.poiType),
        ),
      );
      // sort alphabetically
      used.sort((a, b) => a.localeCompare(b));
      // preserve selection if possible
      const prev = poiTypeSelect.value || "All";
      poiTypeSelect.innerHTML =
        '<option value="All">All types</option>' +
        used.map((t) => `<option value="${t}">${t}</option>`).join("");
      if (used.includes(prev) || prev === "All") poiTypeSelect.value = prev;
    }

    // Group POIs by floor for a clearer sidebar
    if (!floors || floors.length === 0) {
      // fallback to flat list if no floors available
      const flatPoiPoints = points.filter((p) => p.type === "poi");
      if (flatPoiPoints.length === 0) {
        poisListEl.innerHTML =
          '<li class="text-gray-500">No POIs available</li>';
        return;
      }
      flatPoiPoints.forEach((poi) => {
        if (matchesSearch(poi, searchTerm)) {
          poisListEl.appendChild(createPoiListItem(poi));
        }
      });
      return;
    }

    let hasAny = false;
    const selectedType =
      poiTypeSelect && poiTypeSelect.value && poiTypeSelect.value !== "All"
        ? poiTypeSelect.value
        : null;
    floors.forEach((floor) => {
      const poisOnFloor = points.filter(
        (p) =>
          p.type === "poi" &&
          p.floorId === floor.id &&
          matchesSearch(p, searchTerm) &&
          (!selectedType || p.poiType === selectedType),
      );
      if (poisOnFloor.length === 0) return;
      hasAny = true;
      const header = document.createElement("div");
      header.className = "font-semibold bg-gray-50 -mx-2 px-2 py-1 text-sm";
      header.textContent = floor.name || "Unnamed floor";
      const containerLi = document.createElement("li");
      containerLi.appendChild(header);
      const ul = document.createElement("ul");
      ul.className = "";
      ul.style.flex = "1";
      poisOnFloor.forEach((poi) => ul.appendChild(createPoiListItem(poi)));
      containerLi.appendChild(ul);
      poisListEl.appendChild(containerLi);
    });

    if (!hasAny) {
      poisListEl.innerHTML = '<li class="text-gray-500">No POIs available</li>';
    }
  }

  function matchesSearch(poi, term) {
    if (!term) return true;
    const lowerTerm = term.toLowerCase();
    const name = (poi.name || "").toLowerCase();
    const label = (poi.label || "").toLowerCase();
    const id = (poi.id || "").toLowerCase();
    return (
      name.includes(lowerTerm) ||
      label.includes(lowerTerm) ||
      id.includes(lowerTerm)
    );
  }

  function createPoiListItem(poi) {
    const li = document.createElement("li");
    li.dataset.id = poi.id;
    // restore active class if this POI is the selected one
    if (selectedPoiId && selectedPoiId === poi.id) li.classList.add("active");
    const iconName = core.getIconName(poi);
    const poiNumber = poi.label?.substring ? poi.label.substring(1) : poi.id;
    const poiName = poi.name || poiNumber; // fallback to number if no name
    const floor = floors.find((f) => f.id === poi.floorId);
    const floorName = floor ? floor.name : "Unknown";
    li.innerHTML = `
            <div class="poi-left">
                <span class="material-symbols-outlined text-blue-500">${iconName}</span>
                <div class="poi-name">${poiName}</div>
            </div>
            <div class="poi-number">${poiNumber}</div>
        `;
    li.addEventListener("click", () => {
      // mark this POI as selected in the sidebar
      // clear previous selection
      const prev = poisListEl.querySelector("li.active");
      if (prev) prev.classList.remove("active");
      selectedPoiId = poi.id;
      li.classList.add("active");

      if (!povScreenId) {
        // no POV: center on POI
        currentFloorId = poi.floorId;
        activeFloorIds = null;
        render();
        if (poi.element) {
          poi.element.style.transform = "translate(-50%, -50%) scale(1.4)";
          setTimeout(
            () =>
              (poi.element.style.transform = "translate(-50%, -50%) scale(1)"),
            900,
          );
        }
        return;
      }

      const pathObj = paths.find(
        (p) => p.fromId === povScreenId && p.toId === poi.id,
      );
      if (!pathObj) {
        currentFloorId = poi.floorId;
        activeFloorIds = null;
        render();
        alert("No path defined from selected screen to this POI.");
        return;
      }

      core.showOnlyPath(paths, pathObj.id);
      // determine distinct floors involved in this path
      const segmentFloorIds = Array.from(
        new Set((pathObj.segments || []).map((s) => s.floorId)),
      );
      if (segmentFloorIds.length > 1) {
        // show floors side-by-side starting from the path's start floor on left
        activeFloorIds = segmentFloorIds;
      } else {
        activeFloorIds = null;
        const firstSegment = pathObj.segments && pathObj.segments[0];
        if (firstSegment) currentFloorId = firstSegment.floorId;
      }
      render();
      // start/reset inactivity timer when a path is shown so it will auto-hide
      resetInactivityTimer();
    });
    return li;
  }

  function updateYouAreHere() {
    // remove previous marker
    const existing = document.getElementById("you-are-here-marker");
    if (existing && existing.parentNode)
      existing.parentNode.removeChild(existing);
    if (!povScreenId) return;
    const screenPoint = points.find((p) => p.id === povScreenId);
    if (!screenPoint) return;
    // only show on the current single-floor view
    if (screenPoint.floorId !== currentFloorId) return;

    const marker = document.createElement("div");
    marker.id = "you-are-here-marker";
    marker.style.position = "absolute";
    marker.style.left = `${screenPoint.x}%`;
    marker.style.top = `${screenPoint.y}%`;
    // center the marker exactly on the point (previously used -100% which placed it above)
    marker.style.transform = "translate(-50%, -50%)";
    marker.style.pointerEvents = "none";
    marker.style.zIndex = "9999";
    marker.innerHTML = `<div class="flex items-center flex-col"><span class="material-symbols-outlined text-red-600" style="font-size:32px; border-radius: 50%; font-variation-settings: 'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 48;">place</span></div>`;

    // If multi-floor view is active, try to append to the corresponding mini-view's points layer
    const wrapper = document.getElementById("map-views-wrapper");
    if (wrapper) {
      const mini = wrapper.querySelector(
        `.multi-floor-container [data-floor-id="${screenPoint.floorId}"]`,
      );
      if (mini) {
        const layer = mini.querySelector(".multi-points-layer");
        if (layer) {
          // position relative to mini view: convert percent to absolute positioning inside that view
          marker.style.position = "absolute";
          layer.appendChild(marker);
          return;
        }
      }
    }

    // fallback: append into the main pointsContainer
    if (pointsContainer) pointsContainer.appendChild(marker);
  }

  // expose a render trigger if external code wants to update lists
  window.__wayfindingRender = render;
});
