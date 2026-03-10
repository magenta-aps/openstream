// SPDX-FileCopyrightText: 2026 Magenta ApS <https: //magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

import "./style.scss";
import { createFormattedDate, queryParams } from "../../utils/utils";

const displayEl = document.getElementById("date-display");

const ctx = {
  weekday: queryParams.weekday,
  day: queryParams.day,
  month: queryParams.month,
  color: queryParams.color,
  fontSize: queryParams.fontSize,
  lang: queryParams.lang,
};
console.log(ctx);

const formattedDate = createFormattedDate(ctx.lang, {
  weekday: ctx.weekday,
  day: ctx.day,
  month: ctx.month,
});

displayEl.textContent = formattedDate;
displayEl.style.color = ctx.color;
displayEl.style.fontSize = `${ctx.fontSize}px`;
