// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
import { BASE_URL } from "../../utils/constants";

const params = new URLSearchParams({ "org": window.ORG_NAME })
const redirectUrl = new URL(
  `${BASE_URL}/auth/signin/?` + params.toString(),
  window.location.origin
);

window.location.href = redirectUrl.toString()
