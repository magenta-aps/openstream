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
  fontSize: 
  color: queryParams.color,
};

const formattedDate = createFormattedDate({
  ...ctx,
});

displayEl.textContent = formattedDate;
if (ctx.color) {
  displayEl.style.color = ctx.color;
}
