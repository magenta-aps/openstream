// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
//import VanillaMarquee from 'vanilla-marquee';
import { BASE_URL } from "../../utils/constants";
import { queryParams } from "../../utils/utils";


import InfiniteMarquee from 'vanilla-infinite-marquee';

// Parse config from query parameters
const config = {
  location: queryParams.location || "",
  sub_locations: queryParams.sub_locations
    ? queryParams.sub_locations.split(",")
    : [],
};

// Marquee options from query params
const scrollSpeed = Number(queryParams.scroll_speed)

const speeds = {
  1: 25000,
  2: 22500,
  3: 20000,
  4: 17500,
  5: 15000,
  6: 12500,
  7: 10000,
  8: 7500,
  9: 5000,
  10: 2500,
}


const baseUrl = queryParams.baseUrl || BASE_URL;

// Authentication setup
const token = localStorage.getItem("accessToken");
const apiKey = localStorage.getItem("apiKey");

const headers = { "Content-Type": "application/json" };
if (apiKey) {
  headers["X-API-KEY"] = apiKey;
} else if (token) {
  headers["Authorization"] = `Bearer ${token}`;
}

let locationData = {};

// Fetch location data and bookings
async function initializeSlide() {
  try {
    // Set up date header
    updateDateHeader();

    // Fetch location data to get location name
    await fetchLocationData();

    // Fetch and display bookings
    await fetchAndDisplayBookings();
  } catch (error) {
    console.error("Error initializing slide:", error);
    displayError("Failed to load booking data");
  }
}

function updateDateHeader() {
  const header = document.querySelector("#formatted-date-header");
  if (!header) return;

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

  header.textContent = formattedDate;
}

async function fetchLocationData() {
  try {
    const response = await fetch(`${baseUrl}/api/winkas/locations`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch location data: ${response.statusText}`);
    }

    locationData = await response.json();

    console.log("locationData:", locationData);

    // Update location title
    const locationTitle = document.getElementById("location-title");
    if (locationTitle && locationData[config.location]) {
      locationTitle.textContent = locationData[config.location].location_name;
    }
  } catch (error) {
    console.error("Error fetching location data:", error);
    throw error;
  }
}

async function fetchAndDisplayBookings() {
  try {
    const subLocationsParam = config.sub_locations.join(",");
    const response = await fetch(
      `${baseUrl}/api/winkas/bookings?location=${config.location}&sub_locations=${subLocationsParam}`,
      { method: "GET", headers },
    );

    if (!response.ok) {
      console.error(
        "Failed to fetch bookings:",
        response.status,
        response.statusText,
      );
      displayError("Failed to fetch booking data");
      return;
    }

    const data = await response.json();
    console.log("Fetched bookings data:", data);
    displayBookingsInCarousel(data);

  } catch (error) {
    console.error("Error fetching bookings:", error);
    displayError("Error loading bookings");
  }
}

function displayBookingsInCarousel(locationBookings) {
  const locationTitle = document.getElementById("location-title");
  const bookingBody = document.getElementById("booking-body");

  if (!bookingBody) return;

  // Update location title
  if (locationTitle && locationBookings.location_name) {
    locationTitle.textContent = locationBookings.location_name;
  }

  // Clear existing content
  bookingBody.innerHTML = "";

  if (
    !locationBookings ||
    !locationBookings.bookings ||
    locationBookings.bookings.length === 0
  ) {
    // Show no bookings message inside a .booking-list to maintain layout
    bookingBody.innerHTML = `
      <div class="booking-list">
        <div class="no-bookings-message">
          <span class="material-symbols-outlined">event_busy</span>
          <h3>No bookings scheduled</h3>
          <p>There are currently no bookings for the selected locations.</p>
        </div>
      </div>
    `;
    return;
  }

  const bookings = locationBookings.bookings;

  // --- Marquee-only Logic ---

  // 1. Create the single list element for vanilla-marquee
  const list = document.createElement("div");
  list.className = "booking-list";

  // 2. Loop through ALL bookings and append them to the single list
  bookings.forEach((booking) => {
    const bookingDiv = createBookingElement(
      booking,
      locationBookings.location_name,
    );
    list.appendChild(bookingDiv);
  });

  // 3. Add the single list to the body container
  bookingBody.appendChild(list);

  new InfiniteMarquee({
    element: '#booking-body',
    speed: speeds[scrollSpeed],
    direction: 'top',
    duplicateCount: 10,
    on: {
      beforeInit: () => {
        console.log('Not Yet Initialized');
      },

      afterInit: () => {
        console.log('Initialized');
      }
    }
  });
}


// Parse WinKAS timestamp formats into JS Date objects.
function parseWinKASDate(input) {
  if (!input && input !== 0) return null;
  if (input instanceof Date) return input;

  // numeric timestamp
  if (typeof input === "number" && isFinite(input)) {
    // treat as seconds if small
    const ms = input > 1e12 ? input : input * 1000;
    const d = new Date(ms);
    return isFinite(d.getTime()) ? d : null;
  }

  if (typeof input === "string") {
    // try native parse (ISO etc.)
    const isoTry = new Date(input);
    if (isFinite(isoTry.getTime())) return isoTry;

    // match DD-MM-YYYY HH:MM:SS (WinKAS)
    const m = input
      .trim()
      .match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const [, dd, mm, yyyy, hh, min, sec] = m;
      const d = new Date(
        parseInt(yyyy, 10),
        parseInt(mm, 10) - 1,
        parseInt(dd, 10),
        parseInt(hh, 10),
        parseInt(min, 10),
        parseInt(sec || "0", 10),
      );
      return isFinite(d.getTime()) ? d : null;
    }
  }

  return null;
}

function createBookingElement(booking, fallbackLocationName = "") {
  // booking expected shape: { sub_location, sub_location_id, booking_data: { subject, start, stop, booked_by } }
  const bookingData = booking.booking_data || booking;
  const locationName =
    booking.sub_location || booking.location_name || fallbackLocationName || "";

  // Parse and format times
  const startTime = parseWinKASDate(bookingData.start);
  const endTime = parseWinKASDate(bookingData.stop);

  const timeFormatter = new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Helper to safely format a date or return a fallback
  const safeFormatTime = (d) => {
    if (!d || !isFinite(d.getTime())) {
      console.warn(
        "Invalid date encountered while formatting time:",
        d,
        bookingData.start,
        bookingData.stop,
      );
      return "--:--";
    }
    return timeFormatter.format(d);
  };

  const startTimeStr = safeFormatTime(startTime);
  const endTimeStr = safeFormatTime(endTime);

  // Determine status
  const now = new Date();
  let statusClass = "upcoming";
  if (startTime && endTime) {
    if (now >= startTime && now <= endTime) {
      statusClass = "ongoing";
    } else if (now > endTime) {
      statusClass = "completed";
    }
  }

  const bookingElement = document.createElement("div");
  bookingElement.className = `booking-entry ${statusClass}`;

  bookingElement.innerHTML = `
    <div class="booking-details">
      <div class="time-column">
        <div class="start-time">${startTimeStr}</div>
        <div class="time-divider"></div>
        <div class="end-time">${endTimeStr}</div>
      </div>
      <div class="booking-info">
        <div class="booking-title">${bookingData.subject || "Untitled Booking"}</div>
        <div class="booking-location"><strong>Lokale:</strong> ${locationName || "Ikke angivet"}</div>
        ${bookingData.booked_by ? `<div class="booking-organizer"><strong>Arrangør:</strong> ${bookingData.booked_by}</div>` : ""}
      </div>
    </div>
  `;

  return bookingElement;
}

function displayError(message) {
  const bookingBody = document.getElementById("booking-body");
  if (!bookingBody) return;

  bookingBody.innerHTML = `
    <div class="booking-list">
      <div class="error-message">
        <span class="material-symbols-outlined">error</span>
        <h3>Error</h3>
        <p>${message}</p>
      </div>
    </div>
  `;
}

// Initialize the slide when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  initializeSlide();
});