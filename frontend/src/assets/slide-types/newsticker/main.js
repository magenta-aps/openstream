// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
import { BASE_URL } from "../../utils/constants";
import { queryParams } from "../../utils/utils";

// Parse config from query parameters
const config = {
  showNews: queryParams.showNews === "true",
  showClock: queryParams.showClock === "true",
  showWeather: queryParams.showWeather === "true",
  selectedLocation: queryParams.selectedLocation || "",
  tickerSpeed: parseInt(queryParams.tickerSpeed) || 80,
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
  const wrapper = document.getElementById("news-wrapper");
  const items1 = document.getElementById("news-items-1");
  const items2 = document.getElementById("news-items-2");
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
        const frag2 = document.createDocumentFragment();
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
            frag2.appendChild(a.cloneNode(true));
          });
        });

        items1.innerHTML = items2.innerHTML = "";
        items1.appendChild(frag1);
        items2.appendChild(frag2);

        /* Wait one frame so #news is no longer display:none */
        requestAnimationFrame(setTickerSpeed);
      })
      .catch((e) => {
        console.error("RSS error:", e);
        items1.textContent = items2.textContent = "Error loading news.";
      });
  }

  /* ---------- SPEED & ANIMATION HANDLING ---------- */
  function setTickerSpeed() {
    const distance = items1.scrollWidth; // px the first copy is wide
    if (!distance) {
      // still zero? try again next frame
      requestAnimationFrame(setTickerSpeed);
      return;
    }
    const duration = distance / config.tickerSpeed;

    wrapper.style.setProperty("--ticker-distance", distance + "px");
    wrapper.style.setProperty("--ticker-duration", duration + "s");

    /* Restart the animation so it uses new duration */
    wrapper.style.animation = "none";
    void wrapper.offsetWidth; // reflow → flush style
    wrapper.style.animation = `scroll ${duration}s linear infinite`;
  }

  // Only set up animation if news is enabled
  if (config.showNews) {
    const ro = new ResizeObserver(setTickerSpeed);
    ro.observe(items1);
    ro.observe(items2);
    window.addEventListener("resize", setTickerSpeed);
    document.fonts?.ready.then(
      setTickerSpeed,
    ); /* handles late-loading webfonts */
  }
});
