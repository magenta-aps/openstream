// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
import { BASE_URL } from "../../utils/constants";
import { queryParams, shouldUseApiKeyInSlideTypeIframe } from "../../utils/utils";

// Parse config from query parameters
const config = {
  location_name: queryParams.location_name || "",
};

const baseUrl = queryParams.baseUrl || BASE_URL;

// Authentication setup
const token = localStorage.getItem("accessToken");
const apiKey = localStorage.getItem("apiKey");

const headers = { "Content-Type": "application/json" };
if (shouldUseApiKeyInSlideTypeIframe() && apiKey) {
  headers["X-API-KEY"] = apiKey;
} else if (token) {
  headers["Authorization"] = `Bearer ${token}`;
}

// Initialize the slide
async function initializeSlide() {
  try {
    // Set up header
    setupHeader();

    // Fetch and display lessons
    await fetchAndDisplayLessons();

    // Refresh data every 5 minutes
    setInterval(
      async () => {
        await fetchAndDisplayLessons();
      },
      5 * 60 * 1000,
    );
  } catch (error) {
    console.error("Error initializing slide:", error);
    displayError("Failed to load schedule data");
  }
}

function setupHeader() {
  const locationNameElement = document.getElementById("location_name");
  if (locationNameElement) {
    locationNameElement.textContent = config.location_name;
  }

  const dateHeader = document.getElementById("formatted-date-header");
  if (dateHeader) {
    const currentDate = new Date();
    const dayNames = [
      "SØNDAG",
      "MANDAG",
      "TIRSDAG",
      "ONSDAG",
      "TORSDAG",
      "FREDAG",
      "LØRDAG",
    ];

    const day = String(currentDate.getDate()).padStart(2, "0");
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const year = String(currentDate.getFullYear()).slice(-2);
    const formattedDate = `${dayNames[currentDate.getDay()]} ${day}-${month}-${year}`;

    dateHeader.textContent = formattedDate;
  }
}

async function fetchAndDisplayLessons() {
  try {
    const response = await fetch(
      `${baseUrl}/api/speedadmin?school_name=${encodeURIComponent(config.location_name)}`,
      { method: "GET", headers },
    );

    if (!response.ok) {
      console.error(
        "Failed to fetch lessons:",
        response.status,
        response.statusText,
      );
      displayError("Failed to fetch schedule data");
      return;
    }

    const data = await response.json();
    displayLessonsTable(data);
  } catch (error) {
    console.error("Error fetching lessons:", error);
    displayError("Error loading schedule");
  }
}

function displayLessonsTable(schoolData) {
  const tableContainer = document.getElementById("table-entries");
  const table = document.getElementById("activity-table");
  const description = document.getElementById("table-description");

  if (!tableContainer || !table || !description) return;

  // Clear existing content
  tableContainer.innerHTML = "";

  if (schoolData && schoolData.length > 0) {
    // Show table and update description
    table.style.display = "table";
    description.innerHTML = `Dagsoversigt for ${config.location_name}`;

    // Populate table rows
    schoolData.forEach((lesson) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${lesson.courseName || ""} - ${lesson.title || ""}</td>
        <td>${lesson.room || ""}</td>
        <td>${lesson.displayStartTime || ""}</td>
        <td>${lesson.displayEndTime || ""}</td>
        <td>${lesson.teachers || ""}</td>
      `;
      tableContainer.appendChild(row);
    });
  } else {
    // Hide table and show empty state
    table.style.display = "none";
    description.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-outlined">event_busy</span>
        <div>Ingen begivenheder i dag</div>
      </div>
    `;
  }
}

function displayError(message) {
  const description = document.getElementById("table-description");
  const table = document.getElementById("activity-table");

  if (table) table.style.display = "none";

  if (description) {
    description.innerHTML = `
      <div class="error-state">
        <span class="material-symbols-outlined">error</span>
        <div>Fejl: ${message}</div>
      </div>
    `;
  }
}

// Initialize the slide when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  initializeSlide();
});
