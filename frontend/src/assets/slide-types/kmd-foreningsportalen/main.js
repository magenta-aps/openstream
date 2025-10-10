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

let carouselInterval = null;
let currentCarouselIndex = 0;
let bookingsPerPage = 6;
let bookingEntryHeight = 120;

// Initialize the slide
async function initializeSlide() {
  try {
    // Set up date header
    updateDateHeader();

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

async function fetchAndDisplayBookings() {
  try {
    const response = await fetch(`${baseUrl}/api/kmd/`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        location: config.location,
        sub_locations: config.sub_locations,
      }),
    });

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
  if (locationTitle && locationBookings.loc_name) {
    locationTitle.textContent = locationBookings.loc_name;
  }

  // Clear existing content and intervals
  if (carouselInterval) {
    clearInterval(carouselInterval);
    carouselInterval = null;
  }
  bookingCarousel.innerHTML = "";

  if (
    !locationBookings ||
    !locationBookings.data ||
    locationBookings.data.length === 0
  ) {
    bookingCarousel.innerHTML = `
      <div class="booking-page">
        <div class="no-bookings-message">
          <span class="material-symbols-outlined">event_busy</span>
          <h3>Ingen aktiviteter i dag</h3>
          <p>Der er ingen bookede aktiviteter for de valgte lokaler i dag.</p>
        </div>
      </div>
    `;
    return;
  }

  const bookings = locationBookings.data;

  // Calculate bookings per page based on available space
  calculateBookingsPerPage(bookings);

  const totalPages = Math.ceil(bookings.length / bookingsPerPage);

  // Create carousel pages
  for (let page = 0; page < totalPages; page++) {
    const pageDiv = document.createElement("div");
    pageDiv.className = "booking-page";

    const startIndex = page * bookingsPerPage;
    const endIndex = Math.min(startIndex + bookingsPerPage, bookings.length);

    for (let i = startIndex; i < endIndex; i++) {
      const booking = bookings[i];
      const bookingDiv = createBookingElement(booking);
      pageDiv.appendChild(bookingDiv);
    }

    bookingCarousel.appendChild(pageDiv);
  }

  // Start carousel rotation if multiple pages
  if (continuousScroll) {
    startContinuousScroll();
  } else if (totalPages > 1) {
    startCarousel(bookings.length);
  }
}

function clearExistingAnimations() {
  if (carouselInterval) {
    clearInterval(carouselInterval);
    carouselInterval = null;
  }
  if (window.kmdContinuousRAF) {
    cancelAnimationFrame(window.kmdContinuousRAF);
    window.kmdContinuousRAF = null;
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

  // Move existing entries into the list
  entries.forEach((entry) => {
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

    window.kmdContinuousRAF = requestAnimationFrame(step);
  }

  window.kmdContinuousRAF = requestAnimationFrame(step);
}

function createBookingElement(booking) {
  const bookingDiv = document.createElement("div");
  bookingDiv.className = "booking-entry";

  bookingDiv.innerHTML = `
    <div class="booking-details">
      <div class="time-column">
        <div class="start-time">${booking.FomKlo || ""}</div>
        <div class="time-divider"></div>
        <div class="end-time">${booking.TomKlo || ""}</div>
      </div>
      <div class="booking-info">
        <div class="booking-title">${booking.Activity || "Unavngivet aktivitet"}</div>
        <div class="booking-location">
          <strong>Lokale:</strong> ${booking.PartOfObjectName || booking.ObjectName || "Ikke angivet"}
        </div>
        <div class="booking-organizer">
          <strong>Arrangør:</strong> ${booking.CustomerName || "Ikke angivet"}
        </div>
      </div>
    </div>
  `;

  return bookingDiv;
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
    bookingEntryHeight = maxHeight;
    bookingsPerPage = Math.floor(availableHeight / bookingEntryHeight);
    bookingsPerPage = Math.max(1, bookingsPerPage);
  }
}

function startCarousel(totalBookings) {
  if (carouselInterval) {
    clearInterval(carouselInterval);
  }

  if (totalBookings <= bookingsPerPage) {
    return;
  }

  const totalPages = Math.ceil(totalBookings / bookingsPerPage);
  currentCarouselIndex = 0;

  carouselInterval = setInterval(() => {
    currentCarouselIndex = (currentCarouselIndex + 1) % totalPages;
    const carousel = document.querySelector("#booking-carousel");
    const translateY = -currentCarouselIndex * 100;
    carousel.style.transform = `translateY(${translateY}%)`;
  }, 6000);
}

function displayError(message) {
  const carousel = document.getElementById("booking-carousel");
  if (!carousel) return;

  carousel.innerHTML = `
    <div class="booking-page">
      <div class="error-message">
        <span class="material-symbols-outlined">error</span>
        <h3>Fejl</h3>
        <p>${message}</p>
      </div>
    </div>
  `;
}

// Initialize the slide when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  initializeSlide();
});
