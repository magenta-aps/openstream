// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
//import VanillaMarquee from 'vanilla-marquee';
import { BASE_URL } from "../../utils/constants";
import { queryParams } from "../../utils/utils";
import { shouldUseApiKeyInSlideTypeIframe } from "../../utils/utils";
import InfiniteMarquee from "vanilla-infinite-marquee";
import { gettext } from "../../utils/locales";

// Parse config from query parameters
const config = {
  location: queryParams.location || "",
  sub_locations: queryParams.sub_locations
    ? queryParams.sub_locations.split(",")
    : [],
  // Get skipped events from URL, default to empty string
  skipped_events: queryParams.skipped_events || "",
};

// Marquee options from query params
const scrollSpeed = Number(queryParams.scroll_speed);

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
if (shouldUseApiKeyInSlideTypeIframe() && apiKey) {
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

/**
 * Filters the list of bookings based on the skipped_events config.
 * Performs a case-insensitive match on the booking subject.
 */
function filterSkippedEvents(bookings) {
  if (!config.skipped_events || !Array.isArray(bookings)) {
    return bookings;
  }

  // Split, trim, and lowercase the skipped events list
  const skippedList = config.skipped_events
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);

  if (skippedList.length === 0) {
    return bookings;
  }

  return bookings.filter((booking) => {
    // Handle nested booking data structure used in WinKAS
    const bookingData = booking.booking_data || booking;
    const subject = (bookingData.subject || "").trim().toLowerCase();

    // If subject is in the skipped list, filter it out (return false)
    return !skippedList.includes(subject);
  });
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

    // Filter data before displaying
    if (data && data.bookings) {
      data.bookings = filterSkippedEvents(data.bookings);
    }

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
    // Show a single mock booking entry that reads "No events"
    bookingBody.innerHTML = `
      <div class="booking-list">
        <div class="booking-entry no-events">
          <div class="booking-details">
            <div class="time-column">
              <div class="start-time">&nbsp;</div>
              <div class="time-divider" style="visibility: hidden;"></div>
              <div class="end-time">&nbsp;</div>
            </div>
            <div class="booking-info">
              <div class="booking-title">${gettext("No events")}</div>
            </div>
          </div>
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

  // calculate pxPrSec before style.height is set to 100%, so scrollHeight is based on the number of bookings so we can set a proper speed. If we set the style.height first,
  // scrollHeight will be equal to the container height and speed will be way off.

  const pxPrSec = (bookingBody.scrollHeight / speeds[scrollSpeed]) * 1000;

  // Set booking body height to 100% to enable proper scrolling so Infinite-marquee can be initialized correctly.

  bookingBody.style.height = "100%";


  const headerHeight = document.getElementById("header").clientHeight;



  if (list.clientHeight > (bookingBody.clientHeight - headerHeight)) {

    // START: Added empty booking as requested
    // Add one empty booking entry to the end of the list if the marquee is running.
    // This creates a visual spacer when the list loops.
    const emptyBooking = document.createElement("div");
    emptyBooking.className = "booking-entry empty-booking-spacer"; // Use base class + new class

    // Add minimal structure to mimic a real booking's height/padding
    // using non-breaking spaces to ensure elements have height.
    emptyBooking.innerHTML = `
      <div class="booking-details">
        <div class="time-column">
          <div class="start-time">&nbsp;</div>
          <div class="time-divider" style="visibility: hidden;"></div>
          <div class="end-time">&nbsp;</div>
        </div>
        <div class="booking-info">
          <div class="booking-title">&nbsp;</div>
          <div class="booking-location">&nbsp;</div>
          <div class="booking-organizer">&nbsp;</div>
        </div>
      </div>
    `;
    list.appendChild(emptyBooking);
    // END: Added empty booking

    new InfiniteMarquee({
      element: "#booking-body",
      speed: pxPrSec,
      direction: "top",
      duplicate: 0,
      on: {
        beforeInit: () => {
        },

        afterInit: () => {
        },
      },
    });
  }
  else {
  }
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