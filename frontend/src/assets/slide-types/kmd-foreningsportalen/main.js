// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
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
const scrollSpeed = Number(queryParams.scroll_speed) || 5;

const speeds = {
  1: 20,
  2: 40,
  3: 60,
  4: 80,
  5: 100,
  6: 120,
  7: 140,
  8: 160,
  9: 180,
  10: 200,
};

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
    updateDateHeader();
    await fetchLocationData();
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
    const response = await fetch(`${baseUrl}/api/kmd/locations`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch location data: ${response.statusText}`);
    }

    locationData = await response.json();

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
    // KMD backend expects a POST to /api/kmd/ with JSON body { location, sub_locations }
    const response = await fetch(`${baseUrl}/api/kmd/`, {
      method: "POST",
      headers,
      body: JSON.stringify({ location: config.location, sub_locations: config.sub_locations }),
    });

    if (!response.ok) {
      console.error("Failed to fetch bookings:", response.status, response.statusText);
      displayError("Failed to fetch booking data");
      return;
    }

    const data = await response.json();
    // KMD returns shape like { loc_name: "Facility X", data: [...], is_sub_loc: bool }
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

  // KMD returns loc_name and data
  const locName = locationBookings && (locationBookings.loc_name || locationBookings.location_name);
  const bookings = locationBookings && locationBookings.data ? locationBookings.data : [];

  if (locationTitle && locName) {
    locationTitle.textContent = locName;
  }

  bookingBody.innerHTML = "";

  if (!bookings || bookings.length === 0) {
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

  const list = document.createElement("div");
  list.className = "booking-list";

  bookings.forEach((booking) => {
    const bookingDiv = createKmdBookingElement(booking, locName);
    list.appendChild(bookingDiv);
  });

  bookingBody.appendChild(list);

  // calculate pxPrSec before style.height is set to 100%, so scrollHeight is based on the number of bookings so we can set a proper speed. If we set the style.height first, 
  // scrollHeight will be equal to the container height and speed will be way off.

  const pxPrSec = (bookingBody.scrollHeight / speeds[scrollSpeed]) * 1000;

  bookingBody.style.height = '100%';

  new InfiniteMarquee({
    element: '#booking-body',
    speed: pxPrSec,
    direction: 'top',
    duplicateCount: 10,
  });
}

// KMD time strings are like "HH:MM" (FomKlo/TomKlo). Parse them as today with given time.
function parseKmdTime(timeStr) {
  if (!timeStr) return null;
  const m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, hh, mm] = m;
  const d = new Date();
  d.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);
  return isFinite(d.getTime()) ? d : null;
}

function createKmdBookingElement(booking, fallbackLocationName = "") {
  // booking shape: { ObjectName, PartOfObjectName, Activity, CustomerName, FomKlo, TomKlo }
  const locationName = booking.ObjectName || booking.PartOfObjectName || fallbackLocationName || "";

  const startTime = parseKmdTime(booking.FomKlo || booking.Fom || booking.FomKlo);
  const endTime = parseKmdTime(booking.TomKlo || booking.Tom || booking.TomKlo);

  const timeFormatter = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit" });

  const safeFormatTime = (d) => {
    if (!d || !isFinite(d.getTime())) return "--:--";
    return timeFormatter.format(d);
  };

  const startTimeStr = safeFormatTime(startTime);
  const endTimeStr = safeFormatTime(endTime);

  const now = new Date();
  let statusClass = "upcoming";
  if (startTime && endTime) {
    if (now >= startTime && now <= endTime) statusClass = "ongoing";
    else if (now > endTime) statusClass = "completed";
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
        <div class="booking-title">${booking.Activity || booking.ActivityType || "Aktivitet"}</div>
        <div class="booking-location"><strong>Lokale:</strong> ${locationName || "Ikke angivet"}</div>
        ${booking.CustomerName ? `<div class="booking-organizer"><strong>Arrangør:</strong> ${booking.CustomerName}</div>` : ""}
      </div>
    </div>
  `;

  return bookingElement;
}

function parseWinKASDate(input) {
  if (!input && input !== 0) return null;
  if (input instanceof Date) return input;

  if (typeof input === "number" && isFinite(input)) {
    const ms = input > 1e12 ? input : input * 1000;
    const d = new Date(ms);
    return isFinite(d.getTime()) ? d : null;
  }

  if (typeof input === "string") {
    const isoTry = new Date(input);
    if (isFinite(isoTry.getTime())) return isoTry;

    const m = input.trim().match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
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
  const bookingData = booking.booking_data || booking;
  const locationName = booking.sub_location || booking.location_name || fallbackLocationName || "";

  const startTime = parseWinKASDate(bookingData.start);
  const endTime = parseWinKASDate(bookingData.stop);

  const timeFormatter = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit" });

  const safeFormatTime = (d) => {
    if (!d || !isFinite(d.getTime())) return "--:--";
    return timeFormatter.format(d);
  };

  const startTimeStr = safeFormatTime(startTime);
  const endTimeStr = safeFormatTime(endTime);

  const now = new Date();
  let statusClass = "upcoming";
  if (startTime && endTime) {
    if (now >= startTime && now <= endTime) statusClass = "ongoing";
    else if (now > endTime) statusClass = "completed";
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

document.addEventListener("DOMContentLoaded", function () {
  initializeSlide();
});
