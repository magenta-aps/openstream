// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
import { BASE_URL } from "../../utils/constants";
import { queryParams } from "../../utils/utils";

// Parse config from query parameters
const config = {
  location: queryParams.location || "",
  sub_locations: queryParams.sub_locations
    ? queryParams.sub_locations.split(",")
    : [],
};

// Continuous scroll options from query params
const continuousScroll =
  queryParams.continuous_scroll === "1" ||
  String(queryParams.continuous_scroll).toLowerCase() === "true";
const scrollSpeed = Number(queryParams.scroll_speed) || 100; // pixels per second

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
let currentPageIndex = 0;
let totalPages = 0;
let bookingPages = [];

// Carousel sizing state (declared at module scope)
let bookingsPerPage = 6;
window.winkasBookingEntryHeight = window.winkasBookingEntryHeight || 120;

// Fetch location data and bookings
async function initializeSlide() {
  try {
    // Set up date header like KMD slide
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
  const bookingCarousel = document.getElementById("booking-carousel");

  if (!bookingCarousel) return;

  // Update location title
  if (locationTitle && locationBookings.location_name) {
    locationTitle.textContent = locationBookings.location_name;
  }

  // Clear existing content and intervals
  if (window.winkasCarouselInterval) {
    clearInterval(window.winkasCarouselInterval);
    window.winkasCarouselInterval = null;
  }
  bookingCarousel.innerHTML = "";

  if (
    !locationBookings ||
    !locationBookings.bookings ||
    locationBookings.bookings.length === 0
  ) {
    bookingCarousel.innerHTML = `
      <div class="booking-page">
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

  // Calculate bookings per page based on available space
  calculateBookingsPerPage(bookings);

  const totalPagesLocal = Math.ceil(bookings.length / bookingsPerPage);

  // Create carousel pages
  for (let page = 0; page < totalPagesLocal; page++) {
    const pageDiv = document.createElement("div");
    pageDiv.className = "booking-page";

    const startIndex = page * bookingsPerPage;
    const endIndex = Math.min(startIndex + bookingsPerPage, bookings.length);

    for (let i = startIndex; i < endIndex; i++) {
      const booking = bookings[i];
      const bookingDiv = createBookingElement(
        booking,
        locationBookings.location_name,
      );
      pageDiv.appendChild(bookingDiv);
    }

    bookingCarousel.appendChild(pageDiv);
  }

  // Start carousel rotation if multiple pages
  if (continuousScroll) {
    startContinuousScroll();
  } else if (totalPagesLocal > 1) {
    startCarousel(bookings.length);
  }
}

function clearExistingAnimations() {
  if (window.winkasCarouselInterval) {
    clearInterval(window.winkasCarouselInterval);
    window.winkasCarouselInterval = null;
  }
  if (window.winkasContinuousRAF) {
    cancelAnimationFrame(window.winkasContinuousRAF);
    window.winkasContinuousRAF = null;
  }
}

function startContinuousScroll() {
  // Ensure previous animations cleared
  clearExistingAnimations();

  const carousel = document.querySelector("#booking-carousel");
  const bookingBody = document.getElementById("booking-body");
  if (!carousel || !bookingBody) return;

  // Build a single column list of booking entries (flatten pages)
  const entries = Array.from(carousel.querySelectorAll(".booking-entry"));
  if (entries.length === 0) return;

  // Create wrapper and content containers
  carousel.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "booking-list-wrapper";
  wrapper.style.willChange = "transform";
  wrapper.style.position = "relative";
  wrapper.style.display = "block";

  const list = document.createElement("div");
  list.className = "booking-list";
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.rowGap = "8px";

  // Move existing entries into the list (they were created as children of page divs)
  entries.forEach((entry) => {
    // ensure entry has block display
    entry.style.display = "block";
    entry.style.width = "100%";
    list.appendChild(entry);
  });

  // Append two copies for seamless looping
  wrapper.appendChild(list);
  const clone = list.cloneNode(true);
  wrapper.appendChild(clone);

  // Ensure carousel has overflow hidden and fixed height
  carousel.style.overflow = "hidden";
  carousel.appendChild(wrapper);

  // Measure the height of one list
  // Force reflow
  const originalHeight = list.offsetHeight;
  if (originalHeight === 0) return; // nothing to scroll

  let translateY = 0;
  let lastTs = null;

  function step(ts) {
    if (!lastTs) lastTs = ts;
    const dt = (ts - lastTs) / 1000; // seconds
    lastTs = ts;

    // Move up at scrollSpeed pixels per second
    translateY -= scrollSpeed * dt;

    // When we've scrolled past the first list, wrap back
    if (Math.abs(translateY) >= originalHeight) {
      translateY += originalHeight;
    }

    wrapper.style.transform = `translateY(${translateY}px)`;

    window.winkasContinuousRAF = requestAnimationFrame(step);
  }

  window.winkasContinuousRAF = requestAnimationFrame(step);
}

// Parse WinKAS timestamp formats into JS Date objects.
// Supported inputs:
// - JavaScript Date -> returned as-is
// - numeric unix timestamp (seconds or ms)
// - ISO date string (if parseable by Date)
// - WinKAS format: "DD-MM-YYYY HH:MM:SS" -> parsed to local Date
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

  // Parse and format times (support WinKAS format 'DD-MM-YYYY HH:MM:SS')
  const startTime = parseWinKASDate(bookingData.start);
  const endTime = parseWinKASDate(bookingData.stop);

  const timeFormatter = new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const dateFormatter = new Intl.DateTimeFormat("da-DK", {
    weekday: "short",
    day: "numeric",
    month: "short",
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

  const safeFormatDate = (d) => {
    if (!d || !isFinite(d.getTime())) {
      console.warn(
        "Invalid date encountered while formatting date:",
        d,
        bookingData.start,
        bookingData.stop,
      );
      return "Unknown date";
    }
    return dateFormatter.format(d);
  };

  const startTimeStr = safeFormatTime(startTime);
  const endTimeStr = safeFormatTime(endTime);
  const dateStr = safeFormatDate(startTime);

  // Determine status (if dates missing, show upcoming)
  const now = new Date();
  let statusClass = "upcoming";
  let statusText = "Upcoming";

  if (startTime && endTime) {
    if (now >= startTime && now <= endTime) {
      statusClass = "ongoing";
      statusText = "Ongoing";
    } else if (now > endTime) {
      statusClass = "completed";
      statusText = "Completed";
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

function calculateBookingsPerPage(bookings) {
  if (bookings.length === 0) {
    bookingsPerPage = 6;
    return;
  }

  const bookingBody = document.getElementById("booking-body");
  if (!bookingBody) return;

  const availableHeight = bookingBody.clientHeight - 32; // Account for padding

  // Create a temporary container to measure booking height
  const tempContainer = document.createElement("div");
  tempContainer.style.cssText = `
    position: absolute;
    top: -9999px;
    left: -9999px;
    width: ${bookingBody.clientWidth}px;
    visibility: hidden;
  `;
  document.body.appendChild(tempContainer);

  let maxHeight = 0;

  // Measure a few sample bookings to get average height
  const samplesToMeasure = Math.min(3, bookings.length);
  for (let i = 0; i < samplesToMeasure; i++) {
    const tempBooking = createBookingElement(bookings[i]);
    tempContainer.appendChild(tempBooking);

    const height = tempBooking.offsetHeight + 8; // Add gap
    maxHeight = Math.max(maxHeight, height);

    tempContainer.removeChild(tempBooking);
  }

  document.body.removeChild(tempContainer);

  if (maxHeight > 0) {
    window.winkasBookingEntryHeight = maxHeight;
    bookingsPerPage = Math.floor(
      availableHeight / window.winkasBookingEntryHeight,
    );
    bookingsPerPage = Math.max(1, bookingsPerPage);
  }
}

function startCarousel(totalBookings) {
  if (window.winkasCarouselInterval) {
    clearInterval(window.winkasCarouselInterval);
  }

  if (totalBookings <= bookingsPerPage) {
    return;
  }

  const totalPagesLocal = Math.ceil(totalBookings / bookingsPerPage);
  let currentIndex = 0;

  const carousel = document.querySelector("#booking-carousel");
  window.winkasCarouselInterval = setInterval(() => {
    currentIndex = (currentIndex + 1) % totalPagesLocal;
    const translateY = -currentIndex * 100;
    if (carousel) {
      carousel.style.transform = `translateY(${translateY}%)`;
    }
  }, 6000);
}

function rotatePage() {
  if (totalPages <= 1) return;

  const currentPage = document.querySelector(
    '.booking-page:not([style*="display: none"])',
  );
  if (currentPage) {
    currentPage.style.display = "none";
  }

  currentPageIndex = (currentPageIndex + 1) % totalPages;

  const nextPage = document.querySelectorAll(".booking-page")[currentPageIndex];
  if (nextPage) {
    nextPage.style.display = "flex";
  }
}

function updateCurrentTime() {
  const timeElement = document.getElementById("current-time");
  if (!timeElement) return;

  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const dateFormatter = new Intl.DateTimeFormat("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  timeElement.innerHTML = `
    <div class="current-time">${timeFormatter.format(now)}</div>
    <div class="current-date">${dateFormatter.format(now)}</div>
  `;
}

function displayError(message) {
  const carousel = document.getElementById("booking-carousel");
  if (!carousel) return;

  carousel.innerHTML = `
    <div class="booking-page">
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
