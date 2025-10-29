// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
import VanillaMarquee from 'vanilla-marquee'; // Import vanilla-marquee
import { BASE_URL } from "../../utils/constants";
import { queryParams } from "../../utils/utils";

// Parse config from query parameters
const config = {
  showNews: queryParams.showNews === "true",
  showClock: queryParams.showClock === "true",
  showWeather: queryParams.showWeather === "true",
  selectedLocation: queryParams.selectedLocation || "",
  tickerSpeed: parseInt(queryParams.tickerSpeed) || 80, // Used by vanilla-marquee as px/sec
  fontSize: parseFloat(queryParams.fontSize) || 2,
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

document.addEventListener("DOMContentLoaded", () => {
  const clock = document.getElementById("clock");
  const newsBox = document.getElementById("news");
  const items1 = document.getElementById("news-items-1");
  const weatherEl = document.getElementById("weather");

  const rssUrl = `${baseUrl}/api/rss/rss-to-json/`;
  const weatherUrl = `${baseUrl}/api/rss/weather/`;

  // Set font size
  document.documentElement.style.setProperty(
    "--ticker-font-size",
    `${config.fontSize}rem`,
  );

  /* ---------- CLOCK ---------- */
  function tick() {
    clock.textContent = new Date().toLocaleTimeString("da-DK", {
      hour12: false,
    });
  }

  if (config.showClock) {
    clock.style.display = "block";
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- WEATHER ---------- */
  if (config.showWeather && config.selectedLocation) {
    weatherEl.style.display = "block";

    fetch(
      `${weatherUrl}?location=${encodeURIComponent(config.selectedLocation)}`,
      {
        headers: headers,
      },
    )
      .then((r) => r.json())
      .then((d) => {
        const w = d.weather;
        weatherEl.innerHTML = `${w.temperature}&deg;&nbsp;${w.precipitationText}&nbsp;${w.cloudCoverText}`;
      })
      .catch((e) => {
        console.error("Weather error:", e);
        weatherEl.textContent = "Error loading weather.";
      });
  }

  /* ---------- NEWS ---------- */
  if (config.showNews) {
    newsBox.style.display = "block";

    fetch(rssUrl, { headers: headers })
      .then((r) => r.json())
      .then((d) => {
        const frag1 = document.createDocumentFragment();
        let lastCat = "";

        d.news.forEach((feed) => {
          feed.items.forEach((item) => {
            const a = document.createElement("a");
            a.href = item.link;
            a.target = "_blank";
            a.innerHTML = `${
              lastCat !== feed.name
                ? '<span class="feed_name">' + feed.name + ":</span>"
                : ""
            } <span class="item_title">${item.title}</span> ${item.summary ? " - " + item.summary : ""}`;
            lastCat = feed.name;
            frag1.appendChild(a);
          });
        });

        items1.innerHTML = ""; // Clear "Loading news..."
        items1.appendChild(frag1);

        // Initialize vanilla-marquee
        // Use requestAnimationFrame to ensure styles are applied and widths are calculated
        requestAnimationFrame(() => {
          new VanillaMarquee(newsBox, {
            speed: config.tickerSpeed,
            recalcResize: true, // Automatically recalculate on resize
            duplicated: true, // duplicate content for continuous, non-jumpy scroll
            gap: 30, // px gap between duplicated tickers
          });
        });
        
      })
      .catch((e) => {
        console.error("RSS error:", e);
        items1.textContent = "Error loading news.";
      });
  }

  // All custom animation, setTickerSpeed, and ResizeObserver logic has been removed.
});