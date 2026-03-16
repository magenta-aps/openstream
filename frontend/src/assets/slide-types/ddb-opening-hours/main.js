// SPDX-FileCopyrightText: 2026 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

import "./style.scss";
import { queryParams } from "../../utils/utils";

/**
 * @typedef {Object} Context
 * @property {string} baseURL
 * @property {string} branchID
 * @property {string} days
 * @property {string} dateHeaderFontSize
 * @property {string} listElementFontSize
 */

/** @type {Context} */
const ctx = {
  baseURL: queryParams.baseURL,
  branchID: queryParams.branchID,
  days: queryParams.days,
  dateHeaderFontSize: queryParams.dateHeaderFontSize,
  listElementFontSize: queryParams.listElementFontSize,
};

/**
 * @typedef {Object} DomCtx
 * @property {HTMLElement} DomCtx.openingHoursList
 */

/**
 *
 * @returns {DomCtx}
 */
function initDomCtx() {
  /** @type {DomCtx} */
  const domCtxPrimitive = {
    openingHoursList: null,
  };

  return {
    get openingHoursList() {
      if (!domCtxPrimitive.openingHoursList) {
        domCtxPrimitive.openingHoursList =
          document.getElementById("opening-hours-list");
      }

      return domCtxPrimitive.openingHoursList;
    },
  };
}
/** @type {DomCtx} */
const domCtx = initDomCtx();

// dom initialization
(async function init() {
  const [openingHours, isOk] = await fetchOpeningHours();
  if (!isOk) {
    console.error("Failed retrieve opening hours");
    return;
  }

  const openingHoursListEl = domCtx.openingHoursList;
  openingHours.entries().forEach(([date, openingHours]) => {
    // used to apply gap between dates
    const dateWrapperEl = document.createElement("div");

    const dateTitleWrapperEl = document.createElement("div");
    dateTitleWrapperEl.classList.add("opening-hour-title-wrapper");

    const dateTitleEl = document.createElement("span");
    dateTitleEl.style.fontSize = `${ctx.dateHeaderFontSize}px`;
    dateTitleEl.classList.add("opening-hour-date");

    const formattedDate = new Intl.DateTimeFormat("da-dk", {
      weekday: "long",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(date))
      .map((part) => {
        let value = part.value;
        // capitalize weekdays
        if (part.type === "weekday") {
          value = `${value[0].toUpperCase()}${value.substring(1)}:`;
        } else if (part.type === "day") {
          value = `d. ${value}`;
        }

        return value;
      })
      .join("");
    dateTitleEl.textContent = formattedDate;

    const dividerEl = document.createElement("div");
    dividerEl.classList.add("opening-hour-divider");

    dateTitleWrapperEl.appendChild(dateTitleEl);

    dateWrapperEl.appendChild(dateTitleWrapperEl);
    dateWrapperEl.appendChild(dividerEl);

    const openingHoursWrapper = document.createElement("div");
    openingHours.forEach((openingHourCategory) => {
      const openingHourContainerEl = document.createElement("div");

      openingHourContainerEl.classList.add("opening-hour-container");

      const openingHourNameEl = document.createElement("span");
      openingHourNameEl.classList.add("opening-hour-name");
      openingHourNameEl.style.fontSize = `${ctx.listElementFontSize}px`;
      openingHourNameEl.textContent = openingHourCategory.categoryTitle;

      const openingHourFromToEl = document.createElement("span");
      openingHourFromToEl.style.fontSize = `${ctx.listElementFontSize}px`;
      openingHourFromToEl.textContent = `${openingHourCategory.startTime}-${openingHourCategory.endTime}`;

      openingHourContainerEl.appendChild(openingHourNameEl);
      openingHourContainerEl.appendChild(openingHourFromToEl);

      openingHoursWrapper.appendChild(openingHourContainerEl);
    });

    dateWrapperEl.appendChild(openingHoursWrapper);
    openingHoursListEl.appendChild(dateWrapperEl);
  });
})();

/**
 * @typedef {Map<string, {categoryTitle: string, startTime: string, endTime: string}[]>} OpeningHoursMap
 */

/**
 *
 * @returns {Promise<[OpeningHoursMap, boolean]>}
 */
async function fetchOpeningHours() {
  const from = new Date();
  from.setUTCHours(0, 0);
  const to = new Date();
  to.setDate(from.getDate() + Number(ctx.days) - 1); // subtract 1 as if days is set to one, we assume the user means just that one day
  to.setUTCHours(23, 59);

  try {
    const response = await fetch(
      new URL(
        `${ctx.baseURL}/opening_hours?_format=json&branch_id=${ctx.branchID}&from_date=${from.toISOString()}&to_date=${to.toISOString()}`,
      ),
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      return [null, false];
    }

    // some data from the type has been omitted, due to not being relevant or inconsistent
    /** @type {Array<{branch_id: number, category: { title: string, color: string}, date: string, start_time: string, end_time: string, id: number, }>} */
    const data = await response.json();

    /** @type {OpeningHoursMap} */
    const openingHoursMap = new Map();
    data.forEach((openingHour) => {
      const date = openingHour.date;
      if (!openingHoursMap.has(date)) {
        openingHoursMap.set(date, []);
      }

      const openingHours = openingHoursMap.get(date);
      openingHours.push({
        categoryTitle: openingHour.category.title,
        startTime: openingHour.start_time,
        endTime: openingHour.end_time,
      });
    });

    return [openingHoursMap, true];
  } catch {
    console.error("Failed to fetch opening hours");
    return [null, false];
  }
}
