import "./style.scss";

import { BASE_URL } from "../../utils/constants";
import { gettext } from "../../utils/locales";
import {
  genericFetch,
  queryParams,
  shouldUseApiKeyInSlideTypeIframe,
} from "../../utils/utils";

/**
 * @typedef {Object} Context
 * @property {string} baseURL
 * @property {string} branchID
 * @property {string} libraryName
 * @property {string} days
 */

/** @type {Context} */
const ctx = {
  baseURL: queryParams.baseURL,
  branchID: queryParams.branchID,
  libraryName: queryParams.libraryName,
  days: queryParams.days,
};
console.log(ctx);

/**
 * @typedef {Object} ElementContext
 * @property {HTMLElement} ElementContext._openingHoursList
 * @property {HTMLElement} ElementContext.openingHoursList
 */

/** @type {ElementContext} */
const domCtx = {
  _openingHoursList: null,
  get openingHoursList() {
    if (!this._openingHoursList) {
      this._openingHoursList = document.getElementById("opening-hours-list");
    }
    return this._openingHoursList;
  },
};

// dom initialization
(function init() {
  const openingHours = [
    {
      date: new Date(),
      types: [
        {
          name: "selvbetjening",
          startTime: "10:00",
          endTime: "1700",
        },
        {
          name: "betjening",
          startTime: "10:00",
          endTime: "1700",
        },
      ],
    },
  ];

  const openingHoursListEl = domCtx.openingHoursList;
  openingHours.forEach((openingHours) => {
    const dateEl = document.createElement("span");
    dateEl.classList.add("opening-hour-date");
    dateEl.textContent = new Intl.DateTimeFormat("da-dk", {
      weekday: "long",
      month: "2-digit",
      day: "2-digit",
    }).format(openingHours.date);

    const dividerEl = document.createElement("hr");

    openingHoursListEl.appendChild(dateEl);
    openingHoursListEl.appendChild(dividerEl);

    const openingHoursWrapper = document.createElement("div");
    openingHours.types.forEach((openingHourType) => {
      const openingHourContainerEl = document.createElement("div");
      openingHourContainerEl.classList.add("opening-hour-container");

      const openingHourNameEl = document.createElement("span");
      openingHourNameEl.textContent = openingHourType.name;

      const openingHourFromToEl = document.createElement("span");
      openingHourFromToEl.textContent = `${openingHourType.startTime}-${openingHourType.endTime}`;

      openingHourContainerEl.appendChild(openingHourNameEl);
      openingHourContainerEl.appendChild(openingHourFromToEl);

      openingHoursWrapper.appendChild(openingHourContainerEl);
    });

    openingHoursListEl.appendChild(openingHoursWrapper);
  });
})();

function fetchOpeningHours() {
  const openingHours = genericFetch(
    `${ctx.baseURL}/opening-hours?_format=json&branch_id=${ctx.branchID}&from_date=&to_date`,
    "GET",
  );
}
