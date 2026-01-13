// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { BASE_URL } from "../../utils/constants";
import { queryParams, shouldUseApiKeyInSlideTypeIframe } from "../../utils/utils";

// Parse config from query parameters
const config = {
  textColor: queryParams.textColor || "#ffffff",
  backgroundColor: queryParams.backgroundColor || "#000000",
  includeClock: queryParams.includeClock === "true",
  includeWeather: queryParams.includeWeather === "true",
  titleFontSize: parseFloat(queryParams.titleFontSize) || 2.5,
  descriptionFontSize: parseFloat(queryParams.descriptionFontSize) || 1.25,
  categoryFontSize: parseFloat(queryParams.categoryFontSize) || 0.875,
  clockFontSize: parseFloat(queryParams.clockFontSize) || 1.75,
  weatherFontSize: parseFloat(queryParams.weatherFontSize) || 1.25,
  storyDuration: parseInt(queryParams.storyDuration) || 10,
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

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const clockElement = document.getElementById("clock");
  const weatherElement = document.getElementById("weather");
  const carouselElement = document.getElementById("carouselExample");
  const newsTickerBox = document.getElementById("newsTickerBox");

  // --- APPLY CONFIGURATIONS ---
  document.body.style.backgroundColor = config.backgroundColor;
  carouselElement.style.backgroundColor = config.backgroundColor;
  newsTickerBox.style.backgroundColor = config.backgroundColor;
  newsTickerBox.style.color = config.textColor;

  // Set carousel interval
  carouselElement.setAttribute("data-bs-interval", config.storyDuration * 1000);

  // ----- Weather API (Open Meteo for Copenhagen) -----
  if (config.includeWeather) {
    const weatherApiUrl =
      "https://api.open-meteo.com/v1/forecast?latitude=55.6759&longitude=12.5655&current=temperature_2m,precipitation,cloud_cover,relative_humidity_2m&models=dmi_seamless";

    // Helper functions to transform numeric values into descriptive text
    function getPrecipitationText(precip) {
      if (precip < 0.1) return "Ingen regn";
      if (precip < 1) return "Let regn";
      if (precip < 5) return "Regn";
      if (precip < 10) return "Kraftig regn";
      return "Meget kraftig regn";
    }

    function getCloudCoverText(cloudCover) {
      if (cloudCover < 10) return "Klar himmel";
      if (cloudCover < 50) return "Let skyet";
      if (cloudCover < 80) return "Skyet";
      return "Overskyet";
    }

    fetch(weatherApiUrl)
      .then((response) => response.json())
      .then((data) => {
        const current = data.current;
        const temperature = current.temperature_2m;
        const precipitation = current.precipitation;
        const cloudCover = current.cloud_cover;

        const precipitationText = getPrecipitationText(precipitation);
        const cloudCoverText = getCloudCoverText(cloudCover);

        weatherElement.style.display = "block";
        weatherElement.innerHTML = `${temperature}&deg;C | ${precipitationText} | ${cloudCoverText}`;
        weatherElement.style.fontSize = `${config.weatherFontSize}rem`;
      })
      .catch((error) => {
        console.error("Error fetching weather data:", error);
        weatherElement.textContent = "Error loading weather.";
        weatherElement.style.display = "block";
        weatherElement.style.fontSize = `${config.weatherFontSize}rem`;
      });
  }

  // -------- FETCH AND POPULATE NEWS FROM MULTIPLE FEEDS --------
  const rssProxyAndParser = `${baseUrl}/api/rss/rss-to-json/`;

  fetch(rssProxyAndParser, {
    method: "GET",
    headers: headers,
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        console.error("Error loading feed:", data.error);
        return;
      }

      let slides = "";
      const combinedItems = data.news.flatMap((newsCategory) =>
        newsCategory.items.map((item) => ({
          category: newsCategory.name,
          title: item.title,
          description: item.summary || "",
          link: item.link,
          image: item.image || "",
        })),
      );

      combinedItems.forEach((newsItem, index) => {
        const activeClass = index === 0 ? " active" : "";
        // Always show news items, with or without images
        if (newsItem.image) {
          slides += `
            <div class="carousel-item${activeClass}">
              <div class="content-wrapper">
                <div class="text-content" style="color: ${config.textColor}; background-color: ${config.backgroundColor};">
                  <div class="dr-logo"></div>
                  <span class="category-badge" style="font-size: ${config.categoryFontSize}rem;">${newsItem.category}</span>
                  <h4 class="news-title" style="font-size: ${config.titleFontSize}rem;">${newsItem.title}</h4>
                  <p class="news-description" style="font-size: ${config.descriptionFontSize}rem;">${newsItem.description}</p>
                </div>
                <div class="image-container">
                  <img src="${newsItem.image}" alt="News Image">
                </div>
              </div>
            </div>
          `;
        } else {
          // Show text-only slides when no image is available
          slides += `
            <div class="carousel-item${activeClass}">
              <div class="content-wrapper">
                <div class="text-content" style="color: ${config.textColor}; background-color: ${config.backgroundColor}; flex: 1 1 100%;">
                  <div class="dr-logo"></div>
                  <span class="category-badge" style="font-size: ${config.categoryFontSize}rem;">${newsItem.category}</span>
                  <h4 class="news-title" style="font-size: ${config.titleFontSize}rem;">${newsItem.title}</h4>
                  <p class="news-description" style="font-size: ${config.descriptionFontSize}rem;">${newsItem.description}</p>
                </div>
              </div>
            </div>
          `;
        }
      });

      document.getElementById("carousel-inner").innerHTML = slides;
    })
    .catch((error) => {
      console.error("Error in fetching data:", error);
      // Show error message in carousel
      document.getElementById("carousel-inner").innerHTML = `
        <div class="carousel-item active">
          <div class="content-wrapper">
            <div class="text-content" style="color: ${config.textColor}; background-color: ${config.backgroundColor};">
              <h4 class="news-title">Error Loading News</h4>
              <p class="news-description">Unable to fetch news content. Please check your connection.</p>
            </div>
          </div>
        </div>
      `;
    });

  // -------- UPDATE CLOCK --------
  if (config.includeClock) {
    function updateClock() {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      clockElement.textContent = `${hours}:${minutes}:${seconds}`;
    }
    clockElement.style.display = "block";
    updateClock();
    setInterval(updateClock, 1000);
    clockElement.style.fontSize = `${config.clockFontSize}rem`;
  }
});
