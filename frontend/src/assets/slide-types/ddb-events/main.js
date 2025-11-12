// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
import { BASE_URL } from "../../utils/constants";
import { queryParams } from "../../utils/utils";
import QRCode from "qrcode";

// Parse config from query parameters
const parsedLibraries = (() => {
  const primary = queryParams.libraries || queryParams.branches;
  if (primary) {
    return primary
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  const fallback = queryParams.library;
  return fallback ? [fallback.trim()] : [];
})();

const parsedCategories = (() => {
  if (queryParams.categories) {
    return queryParams.categories
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  const fallback = queryParams.category;
  return fallback ? [fallback.trim()] : [];
})();

const config = {
  kommune: queryParams.kommune || "",
  libraries: parsedLibraries,
  library: parsedLibraries[0] || queryParams.library || "",
  categories: parsedCategories,
  category: parsedCategories[0] || queryParams.category || "",
  days: queryParams.days || "7",
  layout: queryParams.layout || "vertical",
  showSubtitle: queryParams.showSubtitle === "true",
  showDescription: queryParams.showDescription === "true",
  showQr: queryParams.showQr === "true",
  showDateTime: queryParams.showDateTime !== "false",
  showLocation: queryParams.showLocation !== "false",
  showTitle: queryParams.showTitle !== "false",
  slideDuration: parseInt(queryParams.slideDuration) || 10,
};

document
  .getElementById("eventsCarousel")
  .setAttribute("data-bs-interval", config.slideDuration * 1000);

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

// Fetch events based on config
async function fetchEvents() {
  try {
    const params = new URLSearchParams();
    if (config.kommune) params.set("kommune", config.kommune);
    if (config.days !== undefined && config.days !== null) {
      params.set("days", config.days);
    }

    if (config.libraries.length > 0) {
      const normalizedLibraries = config.libraries
        .map((library) => library.toLowerCase().trim())
        .filter((library) => library.length > 0);
      const libraryList = normalizedLibraries.join(",");
      params.set("libraries", libraryList);
      // Retain backward compatibility with earlier API versions.
      params.set("branches", libraryList);
      if (normalizedLibraries.length > 0) {
        params.set("library", normalizedLibraries[0]);
      }
    } else if (config.library) {
      const normalizedLibrary = config.library.toLowerCase().trim();
      params.set("library", normalizedLibrary);
      params.set("branches", normalizedLibrary);
    }

    if (config.categories.length > 0) {
      const normalizedCategories = config.categories
        .map((category) => category.toLowerCase().trim())
        .filter((category) => category.length > 0);
      if (normalizedCategories.length > 0) {
        const categoryList = normalizedCategories.join(",");
        params.set("categories", categoryList);
        params.set("category", normalizedCategories[0]);
      }
    } else if (config.category) {
      params.set("category", config.category.toLowerCase().trim());
    }

    const response = await fetch(
      `${baseUrl}/api/ddb/events?${params.toString()}`,
      { method: "GET", headers },
    );

    if (!response.ok) {
      console.error(
        "Failed to fetch events:",
        response.status,
        response.statusText,
      );
      return;
    }

    const data = await response.json();
    displayEventsInCarousel(data);
  } catch (error) {
    console.error("Error fetching events:", error);
  }
}

function displayEventsInCarousel(events) {
  const carouselInner = document.getElementById("carouselInner");
  carouselInner.innerHTML = "";

  const selectedLibrarySet = new Set(
    (config.libraries || [])
      .map((library) => library.toLowerCase().trim())
      .filter((library) => library.length > 0),
  );
  const selectedCategorySet = new Set(
    (config.categories || [])
      .map((category) => category.toLowerCase().trim())
      .filter((category) => category.length > 0),
  );

  if (events.length === 0) {
    carouselInner.innerHTML = `
      <div class="carousel-item active">
        <div class="d-flex justify-content-center align-items-center" style="height: 100vh; color:#333;">
          No events found
        </div>
      </div>`;
    return;
  }

  events.forEach((event, index) => {
    const isActive = index === 0 ? "active" : "";
    const imageUrl = event.image?.url || "https://via.placeholder.com/800x400";
    const title = event.title || "Untitled Event";
    const subtitle = event.subtitle || "";
    const titleMarkup = config.showTitle
      ? `<div class="event-title">${title}</div>`
      : "";
    const description = config.showSubtitle ? subtitle : "";
    const startDate = new Date(event.date_time?.start);
    // Format date without year: "1. januar kl. 12:00"
    const formattedStart =
      startDate instanceof Date && !isNaN(startDate)
        ? startDate.toLocaleDateString("da-DK", {
            day: "numeric",
            month: "long",
          }) +
          " kl. " +
          startDate.toLocaleTimeString("da-DK", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";

    const dateInfo = config.showDateTime ? formattedStart : "";

    let branches = "";
    if (Array.isArray(event.branches) && event.branches.length > 0) {
      const filteredBranches =
        selectedLibrarySet.size > 0
          ? event.branches.filter((branch) =>
              selectedLibrarySet.has(String(branch).toLowerCase()),
            )
          : event.branches;
      branches = filteredBranches.join(", ");
    }

    // Show general location (e.g. library/branch) and the specific sub-location if available
    const generalLocation = branches;
    const subLocation = event.address
      ? event.address.location || event.address.street || ""
      : "";
    const locationDisplay = !config.showLocation
      ? ""
      : generalLocation && subLocation
      ? ` &nbsp;|&nbsp; ${generalLocation}`
      : generalLocation || subLocation;
    const locationMarkup = locationDisplay
      ? `<span class="event-location">${locationDisplay}</span>`
      : "";
    const categories = Array.isArray(event.categories)
      ? event.categories
      : event.categories
      ? [event.categories]
      : [];
    const filteredCategories =
      selectedCategorySet.size > 0
        ? categories.filter((category) =>
            selectedCategorySet.has(String(category).toLowerCase()),
          )
        : categories;
    const body = config.showDescription ? event.body : "";

    const qrValue = event.url || "";

    let carouselItemMarkup = "";

    if (config.layout === "vertical") {
      carouselItemMarkup = `
        <div class="carousel-item vertical ${isActive}" style="--slide-bg: url('${imageUrl}')">
          <div class="col-image" style="height: calc(100vh - 15rem);">
            <img src="${imageUrl}" alt="${title}" class="p-1">
          </div>
          <div class="vertical-layout-bottom">
            <div class="vertical-layout-text">
              ${titleMarkup}
              <div class="event-description">${description}</div>
              <div class="event-meta">
                ${dateInfo ? `<span class="event-date">${dateInfo}</span>` : ""}
                ${locationMarkup}
               
              </div>
              <div class="event-address"></div>
              <div class="event-body">${body}</div>
            </div>
            ${config.showQr ? `<div class="vertical-layout-qr"><div id="qrcode-${index}"></div></div>` : ``}
          </div>
        </div>
      `;
    } else {
      carouselItemMarkup = `
        <div class="carousel-item ${isActive}" style="--slide-bg: url('${imageUrl}')">
          <div class="row g-0">
            <div class="col-6 col-image h-100">
              <img src="${imageUrl}" alt="${title}">
            </div>
            <div class="col-6 col-info">
              ${titleMarkup}
              <div class="event-description">${description}</div>
              <div class="event-meta">
                ${dateInfo ? `<span class="event-date">${dateInfo}</span>` : ""}
                ${locationMarkup}
                
              </div>
              ${config.showQr ? `<div class="event-qr"><div id="qrcode-${index}"></div></div>` : ``}
              <div class="event-body">${body}</div>
            </div>
          </div>
        </div>
      `;
    }

    carouselInner.insertAdjacentHTML("beforeend", carouselItemMarkup);

    if (config.showQr && qrValue) {
      setTimeout(() => {
        const qrContainer = document.getElementById(`qrcode-${index}`);
        if (qrContainer) {
          // Generate QR code with transparent background using npm qrcode package
          QRCode.toCanvas(
            qrValue,
            {
              width: 180,
              margin: 1,
              color: {
                dark: "#000000",
                light: "#00000000", // Transparent background (RGBA)
              },
            },
            function (error, canvas) {
              if (error) {
                console.error("QR code generation error:", error);
                return;
              }
              // Clear container and append the canvas
              qrContainer.innerHTML = "";
              qrContainer.appendChild(canvas);
            },
          );
        }
      }, 0);
    }
  });
}

// Initialize the slide when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  fetchEvents();
});
