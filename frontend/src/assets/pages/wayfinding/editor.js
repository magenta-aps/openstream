// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import initWayfindingCore from "./wayfinding-core.js";
import { POI_TYPES, getPoiTypeByName } from "./poiTypes.js";
import {
  parseAndValidate as _parseAndValidateFallback,
  exportState as _exportStateFallback,
} from "./data-manager.js";
import { BASE_URL } from "../../utils/constants.js";
import { genericFetch, token, selectedBranchID } from "../../utils/utils.js";
import { gettext } from "../../utils/locales.js";

document.addEventListener("DOMContentLoaded", () => {
  const mapContainer = document.getElementById("map-container");
  const pointsContainer = document.getElementById("points-container");
  const svgOverlay = document.getElementById("svg-overlay");
  const overlayWrapper = document.getElementById("overlay-wrapper");
  const mapImage = document.getElementById("map-image");
  const toast = document.getElementById("toast-notification");

  const addPoiBtn = document.getElementById("add-poi-btn");
  const addScreenBtn = document.getElementById("add-screen-btn");
  const drawPathBtn = document.getElementById("draw-path-btn");

  const addFloorBtn = document.getElementById("add-floor-btn");

  const screensList = document.getElementById("screens-list");
  const poisList = document.getElementById("pois-list");
  const floorsList = document.getElementById("floors-list");
  const tasksList = document.getElementById("tasks-list");

  let editorMode = null,
    points = [],
    paths = [],
    floors = [],
    currentFloorId = null;
  let pathCounter = 1,
    floorCounter = 1,
    modalCallback = null;
  let currentDrawingPath = null,
    currentPathElement = null;
  let renderer = null;
  let hideAllPaths, setPathVisibility, togglePath, showOnlyPath;
  let parseAndValidate, exportState;
  let showSaveModal, hideSaveModal, showLoadModal, hideLoadModal;
  // fallback to direct imports to avoid undefined errors before core initializes
  parseAndValidate = _parseAndValidateFallback;
  exportState = _exportStateFallback;

  // Get wayfinding system ID from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const wayfindingSystemId = urlParams.get("id");

  if (!wayfindingSystemId) {
    alert(
      "No wayfinding system ID provided. Please access this page from the wayfinding management interface.",
    );
    window.location.href = "/manage-wayfinding-systems";
    return;
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Auto-save functionality with debouncing to avoid excessive saves
  const autoSave = debounce(async () => {
    const indicator = document.getElementById("auto-save-indicator");
    try {
      if (indicator) {
        indicator.style.opacity = "1";
      }
      await saveWayfindingData(false); // Don't show success toast for auto-save

      // Show success indicator briefly
      if (indicator) {
        indicator.textContent = "Saved!";
        indicator.classList.remove("bg-green-500");
        indicator.classList.add("bg-blue-500");
        setTimeout(() => {
          indicator.style.opacity = "0";
          setTimeout(() => {
            indicator.textContent = "Auto-saving...";
            indicator.classList.remove("bg-blue-500");
            indicator.classList.add("bg-green-500");
          }, 300);
        }, 1000);
      }
    } catch (error) {
      console.error("Auto-save failed:", error);
      // Show error indicator
      if (indicator) {
        indicator.textContent = "Save failed";
        indicator.classList.remove("bg-green-500");
        indicator.classList.add("bg-red-500");
        setTimeout(() => {
          indicator.style.opacity = "0";
          setTimeout(() => {
            indicator.textContent = "Auto-saving...";
            indicator.classList.remove("bg-red-500");
            indicator.classList.add("bg-green-500");
          }, 300);
        }, 2000);
      }
    }
  }, 2000); // Wait 2 seconds after last change before saving

  function updateOverlayDimensions() {
    if (renderer && typeof renderer.updateOverlayDimensions === "function") {
      renderer.updateOverlayDimensions();
      return;
    }
    const containerWidth = mapContainer.offsetWidth;
    const containerHeight = mapContainer.offsetHeight;
    const imageNaturalWidth = mapImage.naturalWidth;
    const imageNaturalHeight = mapImage.naturalHeight;

    if (
      !containerWidth ||
      !containerHeight ||
      !imageNaturalWidth ||
      !imageNaturalHeight
    ) {
      return;
    }

    const containerRatio = containerWidth / containerHeight;
    const imageRatio = imageNaturalWidth / imageNaturalHeight;

    let overlayWidth, overlayHeight, overlayTop, overlayLeft;

    if (containerRatio > imageRatio) {
      overlayHeight = containerHeight;
      overlayWidth = containerHeight * imageRatio;
      overlayTop = 0;
      overlayLeft = (containerWidth - overlayWidth) / 2;
    } else {
      overlayWidth = containerWidth;
      overlayHeight = containerWidth / imageRatio;
      overlayLeft = 0;
      overlayTop = (containerHeight - overlayHeight) / 2;
    }

    overlayWrapper.style.width = `${overlayWidth}px`;
    overlayWrapper.style.height = `${overlayHeight}px`;
    overlayWrapper.style.top = `${overlayTop}px`;
    overlayWrapper.style.left = `${overlayLeft}px`;
  }

  async function loadWayfindingData() {
    try {
      const data = await genericFetch(
        `${BASE_URL}/api/wayfinding/${wayfindingSystemId}/?branch_id=${selectedBranchID}`,
        "GET",
        null,
        {
          Authorization: `Bearer ${token}`,
        },
      );

      if (data && data.wayfinding_data) {
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


        // Load the data into the editor state
        floors = Array.isArray(wayfindingData.floors)
          ? wayfindingData.floors
          : [];
        points = Array.isArray(wayfindingData.points)
          ? wayfindingData.points
          : [];
        paths = Array.isArray(wayfindingData.paths) ? wayfindingData.paths : [];
        currentFloorId = wayfindingData.currentFloorId || floors[0]?.id || null;

        // Update counters to avoid ID collisions
        const extractMaxNumericSuffix = (items, prefix) => {
          let max = 0;
          (items || []).forEach((it) => {
            if (!it || !it.id) return;
            const m = it.id.match(new RegExp(`^${prefix}-(\\d+)$`));
            if (m) max = Math.max(max, parseInt(m[1], 10));
          });
          return max;
        };

        const maxFloor = extractMaxNumericSuffix(floors, "floor");
        const maxPath = extractMaxNumericSuffix(paths, "path");
        const fileFloorCounter = wayfindingData.counters?.floorCounter || 1;
        const filePathCounter = wayfindingData.counters?.pathCounter || 1;

        floorCounter = Math.max(fileFloorCounter, maxFloor + 1);
        pathCounter = Math.max(filePathCounter, maxPath + 1);

        // Set document title and navbar to include wayfinding system name
        if (data.name) {
          document.title = `${data.name} - Wayfinding Editor`;
          const wayfindingSystemNameEl = document.getElementById(
            "wayfinding-system-name",
          );
          if (wayfindingSystemNameEl) {
            wayfindingSystemNameEl.textContent = data.name;
          }
        } else {
          // Fallback if no name is provided
          const wayfindingSystemNameEl = document.getElementById(
            "wayfinding-system-name",
          );
          if (wayfindingSystemNameEl) {
            wayfindingSystemNameEl.textContent = "Unnamed System";
          }
        }
      }

      // If no floors exist, create a default one
      if (floors.length === 0) {
        const initialFloor = {
          id: `floor-${floorCounter++}`,
          name: "Floor 1",
          imageUrl:
            "https://static.vecteezy.com/system/resources/previews/026/161/126/non_2x/house-plan-simple-flat-icon-illustration-on-white-background-vector.jpg",
        };
        floors.push(initialFloor);
        currentFloorId = initialFloor.id;
      }
    } catch (error) {
      console.error("Error loading wayfinding data:", error);
      let errorMessage = "Unknown error";
      if (error && typeof error === "object") {
        errorMessage = error.detail || error.message || JSON.stringify(error);
      } else if (typeof error === "string") {
        errorMessage = error;
      }
      showToast("Failed to load wayfinding data: " + errorMessage);

      // Update wayfinding system name to show error state
      const wayfindingSystemNameEl = document.getElementById(
        "wayfinding-system-name",
      );
      if (wayfindingSystemNameEl) {
        wayfindingSystemNameEl.textContent = "Error loading system";
      }

      // Create default floor on error
      const initialFloor = {
        id: `floor-${floorCounter++}`,
        name: "Floor 1",
        imageUrl:
          "https://static.vecteezy.com/system/resources/previews/026/161/126/non_2x/house-plan-simple-flat-icon-illustration-on-white-background-vector.jpg",
      };
      floors.push(initialFloor);
      currentFloorId = initialFloor.id;
    }
  }

  async function saveWayfindingData(showSuccessToast = true) {
    try {

      // Pass the current state to exportState
      const currentState = {
        floors,
        points,
        paths,
        currentFloorId,
        pathCounter,
        floorCounter,
      };

      const exportedData = exportState(currentState);

      await genericFetch(
        `${BASE_URL}/api/wayfinding/${wayfindingSystemId}/`,
        "PATCH",
        {
          wayfinding_data: exportedData,
          branch_id: selectedBranchID,
        },
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      );

      if (showSuccessToast) {
        showToast("Wayfinding system saved successfully!");
      }
    } catch (error) {
      console.error("Error saving wayfinding system:", error);
      let errorMessage = "Unknown error";
      if (error && typeof error === "object") {
        errorMessage = error.detail || error.message || JSON.stringify(error);
      } else if (typeof error === "string") {
        errorMessage = error;
      }
      if (showSuccessToast) {
        showToast("Failed to save wayfinding system: " + errorMessage);
      }
      throw error; // Re-throw for auto-save error handling
    }
  }
  async function initialize() {
    // Load wayfinding data from database first
    await loadWayfindingData();
    // initialize shared core renderer with DOM refs and state accessor
    const core = initWayfindingCore({
      mapContainer,
      pointsContainer,
      svgOverlay,
      overlayWrapper,
      mapImage,
      getState: () => ({
        floors,
        points,
        paths,
        currentFloorId,
        currentDrawingPath,
        currentPathElement,
        counters: { pathCounter, floorCounter },
      }),
      onPointClick: (pointData, ev) => {
        if (editorMode === "path") handlePathPointClick(pointData);
      },
    });
    // expose renderer helpers used throughout this file
    renderer = core.renderer;
    // rebind path manager helpers
    hideAllPaths = core.hideAllPaths;
    setPathVisibility = core.setPathVisibility;
    togglePath = core.togglePath;
    showOnlyPath = core.showOnlyPath;
    // rebind data helpers
    parseAndValidate = core.parseAndValidate;
    exportState = core.exportState;
    // rebind modal helpers
    showSaveModal = core.showSaveModal;
    hideSaveModal = core.hideSaveModal;
    showLoadModal = core.showLoadModal;
    hideLoadModal = core.hideLoadModal;
    // attach core modal handlers and provide onLoad callback to update editor state
    core.attachModalHandlers({
      onLoad: (data) => {
        // adopt loaded state (be defensive about missing arrays)
        floors = Array.isArray(data.floors) ? data.floors : [];
        points = Array.isArray(data.points) ? data.points : [];
        paths = Array.isArray(data.paths) ? data.paths : [];
        currentFloorId = data.currentFloorId || floors[0]?.id || null;

        // compute safe next counters from existing IDs to avoid collisions
        const extractMaxNumericSuffix = (items, prefix) => {
          let max = 0;
          (items || []).forEach((it) => {
            if (!it || !it.id) return;
            const m = it.id.match(new RegExp(`^${prefix}-(\\d+)$`));
            if (m) max = Math.max(max, parseInt(m[1], 10));
          });
          return max;
        };

        const maxFloor = extractMaxNumericSuffix(floors, "floor");
        const maxPath = extractMaxNumericSuffix(paths, "path");

        // prefer the counters embedded in the file, but ensure they are greater than any existing id number
        const fileFloorCounter = data.counters?.floorCounter || 1;
        const filePathCounter = data.counters?.pathCounter || 1;

        floorCounter = Math.max(fileFloorCounter, maxFloor + 1);
        pathCounter = Math.max(filePathCounter, maxPath + 1);

        renderAll();
        autoSave(); // Auto-save after loading data from file
      },
    });

    // wire navbar Back button to navigate to wayfinding management
    const backToManagementBtn = document.getElementById(
      "back-to-management-btn",
    );
    if (backToManagementBtn) {
      backToManagementBtn.addEventListener("click", () => {
        window.location.href = "/manage-wayfinding-systems";
      });
    }

    renderAll();
  }

  function renderAll() {
    renderFloorsSidebar();
    renderRightSidebars();
    renderTaskList();
    renderMapContent();
    updateActiveFloorView();
  }

  function renderFloorsSidebar() {
    floorsList.innerHTML = "";
    floors.forEach((floor) => {
      const card = document.createElement("div");
      card.className = "floor-card";
      card.dataset.floorId = floor.id;
      card.innerHTML = `
                        <div class="flex justify-between items-center">
                            <input type="text" value="${floor.name}" data-floor-id="${floor.id}" class="floor-name-input w-full font-semibold text-gray-700 bg-transparent border-0 p-0 focus:ring-0">
                            <span class="material-symbols-outlined delete-floor-btn text-gray-400 hover:text-red-600 cursor-pointer icon-btn" data-floor-id="${floor.id}">delete</span>
                        </div>
                        <input type="text" value="${floor.imageUrl}" data-floor-id="${floor.id}" class="floor-url-input text-xs text-gray-500 w-full mt-1 bg-gray-100 p-1 rounded">
                        <img src="${floor.imageUrl}" class="floor-card-thumb" onerror="this.src='https://placehold.co/200x100/f87171/ffffff?text=Invalid+Image'">`;
      floorsList.appendChild(card);
    });
    updateActiveFloorView();
  }

  function renderRightSidebars() {
    screensList.innerHTML = "";
    poisList.innerHTML = "";
    let hasScreens = false,
      hasPois = false;
    floors.forEach((floor) => {
      const screenPointsOnFloor = points.filter(
        (p) => p.type === "screen" && p.floorId === floor.id,
      );
      const poiPointsOnFloor = points.filter(
        (p) => p.type === "poi" && p.floorId === floor.id,
      );
      if (screenPointsOnFloor.length > 0) {
        hasScreens = true;
        screensList.appendChild(createFloorSection(floor, screenPointsOnFloor));
      }
      if (poiPointsOnFloor.length > 0) {
        hasPois = true;
        poisList.appendChild(createFloorSection(floor, poiPointsOnFloor));
      }
    });
    if (!hasScreens)
      screensList.innerHTML =
        '<li class="text-gray-500">No screens added yet.</li>';
    if (!hasPois)
      poisList.innerHTML = '<li class="text-gray-500">No POIs added yet.</li>';
  }

  function createFloorSection(floor, pointsOnFloor) {
    const li = document.createElement("li");
    let listHTML = `<ul class="floor-group-list">`;
    if (pointsOnFloor[0].type === "screen") {
      pointsOnFloor.forEach((screen) => {
        const screenPaths = paths.filter((path) => path.fromId === screen.id);
        let pathListHTML =
          screenPaths.length > 0 ? `<ul class="path-list collapsed">` : "";
        const allPathsVisible =
          screenPaths.length > 0 && screenPaths.every((path) => path.visible);
        screenPaths.forEach((path) => {
          const toPoint = points.find((p) => p.id === path.toId);
          let toPointIconName = getIconName(toPoint);
          const isChecked = path.visible ? "checked" : "";
          pathListHTML += `
                                <li class="flex items-center justify-between text-sm">
                                    <div class="flex items-center">
                                        <input type="checkbox" ${isChecked} class="mr-2 path-toggle" data-path-id="${path.id}"> 
                                        <span class="material-symbols-outlined text-blue-500 text-base mr-1">${toPointIconName}</span>
                                        <span class="font-semibold mr-2">${toPoint.label.substring(1)}</span>
                                        ${toPoint.name}
                                    </div>
                                    <span class="material-symbols-outlined delete-path-btn text-gray-400 hover:text-red-600 cursor-pointer icon-btn" data-path-id="${path.id}">delete</span>
                                </li>`;
        });
        if (screenPaths.length > 0) pathListHTML += "</ul>";
        listHTML += `
                            <li>
                                <div class="flex justify-between items-center">
                                    <div class="flex items-center gap-2">
                                        <span class="material-symbols-outlined screen-toggle text-gray-500" data-screen-id="${screen.id}">chevron_right</span>
                                        <span class="material-symbols-outlined text-red-500">tv</span>
                                        <span class="font-semibold">${screen.label.substring(1)}</span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="material-symbols-outlined delete-point-btn text-gray-400 hover:text-red-600 cursor-pointer icon-btn" data-point-id="${screen.id}">delete</span>
                                    </div>
                                </div>
                                ${pathListHTML}
                            </li>`;
      });
    } else {
      pointsOnFloor.forEach((poi) => {
        let iconName = getIconName(poi);
        const typeLabel =
          poi.poiType !== "Normal"
            ? ` <span class="text-xs text-gray-500">(${poi.poiType})</span>`
            : "";
        listHTML += `
                            <li class="flex justify-between items-center">
                                <div class="flex items-center gap-2">
                                    <span class="material-symbols-outlined text-blue-500">${iconName}</span>
                                    <span class="font-semibold">${poi.label.substring(1)}</span>
                                    <span>${poi.name}${typeLabel}</span>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="material-symbols-outlined edit-point-btn text-gray-400 hover:text-blue-600 cursor-pointer icon-btn" data-point-id="${poi.id}">edit</span>
                                    <span class="material-symbols-outlined delete-point-btn text-gray-400 hover:text-red-600 cursor-pointer icon-btn" data-point-id="${poi.id}">delete</span>
                                </div>
                            </li>`;
      });
    }
    listHTML += "</ul>";
    li.innerHTML = `<div class="font-semibold bg-gray-50 -mx-2 px-2 py-1"><span>${floor.name}</span></div>${listHTML}`;
    return li;
  }

  function renderTaskList() {
    tasksList.innerHTML = "";
    const missingPaths = [];
    const allScreens = points.filter((p) => p.type === "screen");
    // All POIs are considered required for the task list
    const relevantPois = points.filter((p) => p.type === "poi");

    allScreens.forEach((screen) => {
      relevantPois.forEach((poi) => {
        const pathExists = paths.some(
          (path) => path.fromId === screen.id && path.toId === poi.id,
        );
        if (!pathExists) {
          missingPaths.push({ screen, poi });
        }
      });
    });

    if (missingPaths.length === 0) {
      tasksList.innerHTML = `<li class="text-green-600">Setup Complete! All screens have paths to all required POIs.</li>`;
    } else {
      missingPaths.forEach((task) => {
        const li = document.createElement("li");
        const poiIconName = getIconName(task.poi);

        const screenIconHtml = `<div class="flex items-center gap-1"><span class="material-symbols-outlined text-red-500 text-base">tv</span><span class="font-semibold">${task.screen.label.substring(1)}</span></div>`;
        const poiIconHtml = `<div class="flex items-center gap-1"><span class="material-symbols-outlined text-blue-500 text-base">${poiIconName}</span><span class="font-semibold">${task.poi.label.substring(1)}</span></div>`;

        li.innerHTML = `<div class="flex items-center gap-2 text-sm flex-wrap">${screenIconHtml} missing path to ${poiIconHtml} <span>(${task.poi.name})</span></div>`;
        tasksList.appendChild(li);
      });
    }
  }

  // delegating icon name lookup to renderer when available
  function getIconName(pointData) {
    if (renderer && typeof renderer.getIconName === "function")
      return renderer.getIconName(pointData);
    if (pointData.type === "screen") return "tv";
    const meta = getPoiTypeByName(pointData.poiType);
    return meta?.icon || "location_pin";
  }

  function renderMapContent() {
    if (renderer && typeof renderer.renderMapContent === "function") {
      renderer.renderMapContent();
    }
  }

  function updateActiveFloorView() {
    document
      .querySelectorAll(".floor-card")
      .forEach((card) =>
        card.classList.toggle(
          "active",
          card.dataset.floorId === currentFloorId,
        ),
      );
  }

  // createPointElement and createPathElement are now in renderer

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
  }

  function setMode(newMode) {
    if (editorMode === "path" && newMode !== "path") {
      if (currentDrawingPath) cancelPathDrawing();
      drawPathBtn.classList.remove("ring-4", "ring-green-300");
    }
    editorMode = newMode;
    mapContainer.classList.remove("drawing-mode");
    // Use a map to simplify button and color selection
    const modes = {
      poi: { btn: addPoiBtn, color: "blue" },
      screen: { btn: addScreenBtn, color: "red" },
      path: { btn: drawPathBtn, color: "green" },
    };
    // Reset all buttons
    Object.values(modes).forEach((mode) =>
      mode.btn.classList.remove("ring-4", `ring-${mode.color}-300`),
    );

    if (newMode) {
      const { btn, color } = modes[newMode];
      btn.classList.add("ring-4", `ring-${color}-300`);
      if (newMode === "path") {
        mapContainer.classList.add("drawing-mode");
        // Hide all paths when entering path mode
        paths.forEach((p) => (p.visible = false));
        renderMapContent();
        showToast(
          "Click a start point, then click for bends, and click a destination.",
        );
      } else {
        showToast(
          `Click on the map to add a ${newMode === "poi" ? "   est" : "Screen location"}.`,
        );
      }
    }
  }

  function addPoint(x, y, type) {
    if (type === "poi") {
      showCustomPrompt("Enter POI Name", true, (poiName, poiType) => {
        if (!poiName) {
          showToast("POI creation cancelled.");
          return;
        }
        // generate unique poi id based on existing points
        const existingMaxPoi = points
          .filter((p) => p.type === "poi")
          .reduce(
            (m, pt) => Math.max(m, parseInt((pt.id || "").split("-")[1]) || 0),
            0,
          );
        let candidateNum = Math.max(existingMaxPoi + 1, 1);
        let poiId = `poi-${candidateNum}`;
        while (points.some((p) => p.id === poiId)) {
          candidateNum += 1;
          poiId = `poi-${candidateNum}`;
        }
        const poiNumber = candidateNum;
        points.push({
          type: "poi",
          x,
          y,
          floorId: currentFloorId,
          id: poiId,
          label: `P${poiNumber}`,
          name: poiName,
          poiType,
        });
        renderAll();
        autoSave(); // Auto-save after adding POI
      });
    } else {
      // generate unique screen id based on existing points
      const existingMaxScreen = points
        .filter((p) => p.type === "screen")
        .reduce(
          (m, pt) => Math.max(m, parseInt((pt.id || "").split("-")[1]) || 0),
          0,
        );
      let candidateNum = Math.max(existingMaxScreen + 1, 1);
      let screenId = `screen-${candidateNum}`;
      while (points.some((p) => p.id === screenId)) {
        candidateNum += 1;
        screenId = `screen-${candidateNum}`;
      }
      const screenNumber = candidateNum;
      points.push({
        type: "screen",
        x,
        y,
        floorId: currentFloorId,
        id: screenId,
        label: `S${screenNumber}`,
        name: `Screen ${screenNumber}`,
      });
      renderAll();
      autoSave(); // Auto-save after adding screen
    }
  }

  // showImageField: optional boolean to show the image URL input (for floor creation)
  function showCustomPrompt(title, showType, callback, showImageField = false) {
    document.getElementById("prompt-title").textContent = title;
    const typeContainer = document.getElementById("prompt-type-container");
    typeContainer.style.display = showType ? "block" : "none";
    if (showType) {
      const select = document.getElementById("prompt-type-select");
      // populate from POI_TYPES
      select.innerHTML = POI_TYPES.map(
        (t) => `<option value="${t.name}">${t.name}</option>`,
      ).join("");
    }
    document.getElementById("prompt-input").value = "";
    const imgContainer = document.getElementById("prompt-image-container");
    const imgInput = document.getElementById("prompt-image-url");
    if (showImageField) {
      imgContainer.style.display = "block";
      imgInput.value = "";
    } else {
      imgContainer.style.display = "none";
      imgInput.value = "";
    }
    document.getElementById("custom-prompt-overlay").classList.add("visible");
    document.getElementById("prompt-input").focus();
    modalCallback = callback;
  }

  function hideCustomPrompt(wasCancelled = false) {
    document
      .getElementById("custom-prompt-overlay")
      .classList.remove("visible");
    if (wasCancelled && modalCallback) modalCallback(null, null);
    modalCallback = null;
  }

  // save/load modal UI are provided by the shared core and bound during initialize()

  function handlePathPointClick(clickedPointData) {
    if (!currentDrawingPath) {
      if (clickedPointData.type !== "screen") {
        showToast("Paths must start from a Screen point.");
        return;
      }
      // Hide all other paths when starting a new path
      hideAllPaths(paths);
      renderMapContent();
      // Slightly enlarge the clicked start point to indicate selection, but keep it subtle
      clickedPointData.element.style.transform =
        "translate(-50%, -50%) scale(1.15)";
      currentDrawingPath = {
        fromId: clickedPointData.id,
        toId: null,
        visible: true,
        segments: [
          {
            floorId: currentFloorId,
            points: [{ x: clickedPointData.x, y: clickedPointData.y }],
          },
        ],
      };
      currentPathElement = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "polyline",
      );
      currentPathElement.setAttribute("class", "path-line path-line-preview");
      currentPathElement.setAttribute(
        "points",
        `${clickedPointData.x},${clickedPointData.y}`,
      );
      svgOverlay.appendChild(currentPathElement);
      mapContainer.addEventListener("mousemove", onPathDrawMouseMove);
      showToast(
        `Start point selected. Click for bends or click a destination.`,
      );
    } else {
      const currentSegment = currentDrawingPath.segments.slice(-1)[0];
      currentSegment.points.push({
        x: clickedPointData.x,
        y: clickedPointData.y,
      });
      if (clickedPointData.type === "poi") {
        const poiTypeMeta = getPoiTypeByName(clickedPointData.poiType);
        if (poiTypeMeta && poiTypeMeta.canChangeFloor) {
          showContinuePathModal(clickedPointData);
        } else {
          // treat as terminal POI
          finishPathDrawing(clickedPointData.id);
        }
      }
    }
  }

  function finishPathDrawing(toId) {
    currentDrawingPath.toId = toId;
    // Hide all other paths when finishing
    hideAllPaths(paths);
    const existingPathIndex = paths.findIndex(
      (p) =>
        p.fromId === currentDrawingPath.fromId &&
        p.toId === currentDrawingPath.toId,
    );
    if (existingPathIndex > -1) {
      currentDrawingPath.id = paths[existingPathIndex].id;
      paths[existingPathIndex] = currentDrawingPath;
      showToast("Path updated!");
    } else {
      // generate a unique path id (in case loaded data used higher numbers)
      let candidatePathId;
      do {
        candidatePathId = `path-${pathCounter}`;
        pathCounter += 1;
      } while (paths.some((p) => p.id === candidatePathId));
      currentDrawingPath.id = candidatePathId;
      paths.push(currentDrawingPath);
      showToast("Path created!");
    }
    if (currentPathElement && currentPathElement.remove)
      currentPathElement.remove();
    // Ensure the continue/connector modal is closed after finishing the path
    const pathContinueOverlay = document.getElementById(
      "path-continue-overlay",
    );
    if (pathContinueOverlay) pathContinueOverlay.classList.remove("visible");
    // capture the originating screen id before we reset the drawing state
    const originatingScreenId = currentDrawingPath?.fromId;
    resetPathDrawingState();
    renderAll();
    autoSave(); // Auto-save after creating/updating path

    // Auto-expand the screen's path list for the originating screen
    if (originatingScreenId) {
      setTimeout(() => {
        const screenToggle = document.querySelector(
          `.screen-toggle[data-screen-id="${originatingScreenId}"]`,
        );
        if (screenToggle) {
          const pathList = screenToggle
            .closest("li")
            .querySelector(".path-list");
          if (pathList && pathList.classList.contains("collapsed")) {
            pathList.classList.remove("collapsed");
            screenToggle.classList.add("expanded");
          }
        }
      }, 0);
    }
  }

  function showContinuePathModal(originPoint) {
    const listEl = document.getElementById("path-continue-list");
    listEl.innerHTML = "";

    // Add option to end path here
    const endHereItem = document.createElement("div");
    endHereItem.className =
      "p-2 hover:bg-gray-100 rounded cursor-pointer font-semibold text-green-600";
    endHereItem.textContent = "✓ End path here";
    endHereItem.onclick = () => finishPathDrawing(originPoint.id);
    listEl.appendChild(endHereItem);

    // Add separator
    const separator = document.createElement("hr");
    separator.className = "my-2";
    listEl.appendChild(separator);

    floors.forEach((floor) => {
      const connectorPoints = points.filter(
        (p) =>
          p.floorId === floor.id &&
          p.id !== originPoint.id &&
          getPoiTypeByName(p.poiType)?.canChangeFloor,
      );
      if (connectorPoints.length > 0) {
        const floorHeader = document.createElement("h4");
        floorHeader.className = "font-semibold text-gray-800 mt-2";
        floorHeader.textContent = floor.name;
        listEl.appendChild(floorHeader);
        connectorPoints.forEach((point) => {
          const item = document.createElement("div");
          item.className = "p-2 hover:bg-gray-100 rounded cursor-pointer";
          item.textContent = `[${point.poiType}] ${point.name}`;
          item.onclick = () => continuePathAt(point);
          listEl.appendChild(item);
        });
      }
    });
    document.getElementById("path-continue-overlay").classList.add("visible");
  }

  function continuePathAt(destinationPoint) {
    // Close continue modal
    const pathContinueOverlay = document.getElementById(
      "path-continue-overlay",
    );
    if (pathContinueOverlay) pathContinueOverlay.classList.remove("visible");
    currentFloorId = destinationPoint.floorId;
    currentDrawingPath.segments.push({
      floorId: currentFloorId,
      points: [{ x: destinationPoint.x, y: destinationPoint.y }],
    });
    showToast(
      `Continuing path on ${floors.find((f) => f.id === currentFloorId).name}.`,
    );
    renderAll();
  }

  function onPathDrawMouseMove(e) {
    if (!currentPathElement) return;
    const rect = overlayWrapper.getBoundingClientRect();

    const clientX = Math.max(rect.left, Math.min(e.clientX, rect.right));
    const clientY = Math.max(rect.top, Math.min(e.clientY, rect.bottom));

    const mouseX = ((clientX - rect.left) / rect.width) * 100;
    const mouseY = ((clientY - rect.top) / rect.height) * 100;
    const currentSegment = currentDrawingPath.segments.slice(-1)[0];
    const pointsString = currentSegment.points
      .map((p) => `${p.x},${p.y}`)
      .join(" ");
    currentPathElement.setAttribute(
      "points",
      `${pointsString} ${mouseX},${mouseY}`,
    );
  }

  function cancelPathDrawing() {
    if (currentPathElement) currentPathElement.remove();
    resetPathDrawingState();
    showToast("Path drawing cancelled.");
  }

  function resetPathDrawingState() {
    if (currentDrawingPath) {
      const startPoint = points.find((p) => p.id === currentDrawingPath.fromId);
      if (startPoint && startPoint.element) {
        startPoint.element.style.transform = "translate(-50%, -50%) scale(1)";
      }
    }
    mapContainer.removeEventListener("mousemove", onPathDrawMouseMove);
    currentDrawingPath = null;
    currentPathElement = null;
  }

  function deleteFloor(floorId) {
    const pointsOnFloor = points
      .filter((p) => p.floorId === floorId)
      .map((p) => p.id);
    points = points.filter((p) => p.floorId !== floorId);
    paths = paths.filter(
      (path) =>
        !pointsOnFloor.includes(path.fromId) &&
        !pointsOnFloor.includes(path.toId),
    );
    floors = floors.filter((f) => f.id !== floorId);

    if (currentFloorId === floorId) {
      currentFloorId = floors.length > 0 ? floors[0].id : null;
    }
    showToast("Floor deleted.");
    renderAll();
    autoSave(); // Auto-save after deleting floor
  }

  function renumberPoints() {
    const poiPoints = points
      .filter((p) => p.type === "poi")
      .sort(
        (a, b) => parseInt(a.id.split("-")[1]) - parseInt(b.id.split("-")[1]),
      );
    const screenPoints = points
      .filter((p) => p.type === "screen")
      .sort(
        (a, b) => parseInt(a.id.split("-")[1]) - parseInt(b.id.split("-")[1]),
      );

    // Renumber POIs
    poiPoints.forEach((point, index) => {
      const newId = `poi-${index + 1}`;
      const newLabel = `P${index + 1}`;
      const oldId = point.id;
      point.id = newId;
      point.label = newLabel;
      // Update paths
      paths.forEach((path) => {
        if (path.toId === oldId) {
          path.toId = newId;
        }
      });
    });

    // Renumber Screens
    screenPoints.forEach((point, index) => {
      const newId = `screen-${index + 1}`;
      const newLabel = `S${index + 1}`;
      const oldId = point.id;
      point.id = newId;
      point.label = newLabel;
      // Update paths
      paths.forEach((path) => {
        if (path.fromId === oldId) {
          path.fromId = newId;
        }
      });
    });
  }

  function deletePoint(pointId) {
    const pointToDelete = points.find((p) => p.id === pointId);
    if (!pointToDelete) return;

    points = points.filter((p) => p.id !== pointId);

    if (pointToDelete.type === "screen") {
      paths = paths.filter((p) => p.fromId !== pointId);
    } else if (pointToDelete.type === "poi") {
      paths = paths.filter((p) => p.toId !== pointId);
    }
    renumberPoints();
    showToast(`${pointToDelete.type === "poi" ? "POI" : "Screen"} deleted.`);
    renderAll();
    autoSave(); // Auto-save after deleting point
  }

  function deletePath(pathId) {
    paths = paths.filter((p) => p.id !== pathId);
    showToast("Path deleted.");
    renderAll();
    autoSave(); // Auto-save after deleting path
  }

  function editPoint(pointId) {
    const pointToEdit = points.find((p) => p.id === pointId);
    if (!pointToEdit) return;

    const isPoi = pointToEdit.type === "poi";
    showCustomPrompt(
      `Edit ${isPoi ? "POI" : "Screen"} Name`,
      isPoi,
      (newName, newType) => {
        if (!newName) {
          showToast("Edit cancelled.");
          return;
        }
        pointToEdit.name = newName;
        if (isPoi) pointToEdit.poiType = newType;
        showToast("Point updated.");
        renderAll();
        autoSave(); // Auto-save after editing point
      },
    );

    document.getElementById("prompt-input").value = pointToEdit.name;
    if (isPoi) {
      document.getElementById("prompt-type-select").value = pointToEdit.poiType;
    }
  }

  addPoiBtn.addEventListener("click", () => setMode("poi"));
  addScreenBtn.addEventListener("click", () => setMode("screen"));
  drawPathBtn.addEventListener("click", () =>
    setMode(editorMode === "path" ? null : "path"),
  );

  // Save and Load buttons (wired during initialize after core modal helpers are bound)

  addFloorBtn.addEventListener("click", () => {
    // Show modal with image URL field for floor creation
    showCustomPrompt(
      "Enter New Floor Name",
      false,
      (floorName, _, imageUrl) => {
        if (!floorName) {
          showToast("Floor creation cancelled.");
          return;
        }
        const defaultImage =
          "https://placehold.co/1600x900/e0e7ff/4338ca?text=New+Floor";
        // Ensure generated id is unique even if counters or loaded data conflict
        let candidate;
        do {
          candidate = `floor-${floorCounter}`;
          floorCounter += 1;
        } while (floors.some((f) => f.id === candidate));
        const newFloor = {
          id: candidate,
          name: floorName,
          imageUrl: imageUrl && imageUrl.length > 0 ? imageUrl : defaultImage,
        };
        floors.push(newFloor);
        currentFloorId = newFloor.id;
        renderAll();
        autoSave(); // Auto-save after adding floor
      },
      true,
    );
  });

  mapContainer.addEventListener("click", (e) => {
    if (!editorMode) return;
    const rect = mapContainer.getBoundingClientRect();
    const overlayRect = overlayWrapper.getBoundingClientRect();

    if (
      e.clientX < overlayRect.left ||
      e.clientX > overlayRect.right ||
      e.clientY < overlayRect.top ||
      e.clientY > overlayRect.bottom
    ) {
      return;
    }

    const percentX = ((e.clientX - overlayRect.left) / overlayRect.width) * 100;
    const percentY = ((e.clientY - overlayRect.top) / overlayRect.height) * 100;

    if (editorMode === "path" && currentDrawingPath) {
      const currentSegment = currentDrawingPath.segments.slice(-1)[0];
      currentSegment.points.push({ x: percentX, y: percentY });
      showToast("Bend point added.");
      return;
    }
    if (editorMode === "poi" || editorMode === "screen") {
      addPoint(percentX, percentY, editorMode);
    }
  });

  // Add escape key handler to cancel path drawing
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && editorMode === "path" && currentDrawingPath) {
      cancelPathDrawing();
    }
  });

  document
    .getElementById("prompt-confirm-btn")
    .addEventListener("click", () => {
      const inputEl = document.getElementById("prompt-input");
      const inputValueRaw = inputEl ? inputEl.value : "";
      const inputValue = inputValueRaw ? inputValueRaw.trim() : "";
      const typeValue = document.getElementById("prompt-type-select").value;
      const imageValue = document
        .getElementById("prompt-image-url")
        .value.trim();

      const typeContainer = document.getElementById("prompt-type-container");
      const imgContainer = document.getElementById("prompt-image-container");
      const showType = typeContainer && typeContainer.style.display !== "none";
      const showImage = imgContainer && imgContainer.style.display !== "none";

      // If name left blank and type selector is shown (POI), default to the selected POI type
      let nameToUse = inputValue;
      if (!nameToUse && showType) nameToUse = typeValue;

      if (modalCallback) {
        if (showImage) {
          // floor creation: (floorName, _, imageUrl)
          modalCallback(nameToUse, typeValue, imageValue);
        } else {
          modalCallback(nameToUse, typeValue);
        }
      }

      hideCustomPrompt();
    });
  document
    .getElementById("prompt-cancel-btn")
    .addEventListener("click", () => hideCustomPrompt(true));
  document
    .getElementById("custom-prompt-overlay")
    .addEventListener("click", (e) => {
      if (e.target.id === "custom-prompt-overlay") hideCustomPrompt(true);
    });
  document.getElementById("prompt-input").addEventListener("keyup", (e) => {
    if (e.key === "Enter")
      document.getElementById("prompt-confirm-btn").click();
  });
  document
    .getElementById("path-continue-cancel-btn")
    .addEventListener("click", () => {
      document
        .getElementById("path-continue-overlay")
        .classList.remove("visible");
      cancelPathDrawing();
    });

  // Save/load modal UI handled by the shared core (attachModalHandlers was called during initialize)

  document.body.addEventListener("click", (e) => {
    if (e.target.matches(".floor-name-input, .floor-url-input")) return;

    const floorCard = e.target.closest(".floor-card");
    if (floorCard) {
      currentFloorId = floorCard.dataset.floorId;
      renderAll();
      autoSave(); // Auto-save after changing current floor
    }

    if (e.target.matches(".path-toggle")) {
      const newVal = togglePath(paths, e.target.dataset.pathId);
      if (typeof newVal !== "boolean") return;
      e.target.checked = newVal;
      renderMapContent();
      autoSave(); // Auto-save after toggling path visibility
    }

    // Handle screen toggle (expand/collapse paths)
    if (e.target.matches(".screen-toggle")) {
      const screenId = e.target.dataset.screenId;
      const pathList = e.target.closest("li").querySelector(".path-list");
      if (pathList) {
        pathList.classList.toggle("collapsed");
        e.target.classList.toggle("expanded");
      }
    }

    const deletePointBtn = e.target.closest(".delete-point-btn");
    if (deletePointBtn) {
      deletePoint(deletePointBtn.dataset.pointId);
      return;
    }

    const editPointBtn = e.target.closest(".edit-point-btn");
    if (editPointBtn) {
      editPoint(editPointBtn.dataset.pointId);
      return;
    }

    const deletePathBtn = e.target.closest(".delete-path-btn");
    if (deletePathBtn) {
      deletePath(deletePathBtn.dataset.pathId);
      return;
    }

    const deleteFloorBtn = e.target.closest(".delete-floor-btn");
    if (deleteFloorBtn) {
      deleteFloor(deleteFloorBtn.dataset.floorId);
      return;
    }
  });

  document.body.addEventListener("change", (e) => {
    const floorId = e.target.dataset.floorId;
    if (!floorId) return;
    const floor = floors.find((f) => f.id === floorId);
    if (!floor) return;
    if (e.target.matches(".floor-name-input")) {
      floor.name = e.target.value;
      renderRightSidebars();
      autoSave(); // Auto-save after changing floor name
    }
    if (e.target.matches(".floor-url-input")) {
      floor.imageUrl = e.target.value;
      renderFloorsSidebar();
      if (floor.id === currentFloorId) {
        mapImage.src = floor.imageUrl;
      }
      autoSave(); // Auto-save after changing floor URL
    }

    // (Show All checkbox removed for screens)
  });

  // Initialize SortableJS for smoother floor dragging
  new Sortable(floorsList, {
    animation: 150,
    ghostClass: "floor-card-ghost",
    chosenClass: "floor-card-chosen",
    dragClass: "floor-card-dragging",
    onEnd: function (evt) {
      const draggedFloorIndex = evt.oldIndex;
      const targetFloorIndex = evt.newIndex;

      if (draggedFloorIndex !== targetFloorIndex) {
        const [draggedItem] = floors.splice(draggedFloorIndex, 1);
        floors.splice(targetFloorIndex, 0, draggedItem);
        renderAll();
        autoSave(); // Auto-save after reordering floors
      }
    },
  });

  mapImage.addEventListener("load", updateOverlayDimensions);
  window.addEventListener("resize", debounce(updateOverlayDimensions, 100));

  initialize();
});
