/* SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk> */

/* SPDX-License-Identifier: AGPL-3.0-only */
import { createUrl } from "../../utils/utils";

const queryParams = new URLSearchParams(window.location.search)
const username = queryParams.get("username")
const access_token = queryParams.get("access")
const refresh_token = queryParams.get("refresh")

if (!username || !access_token || !refresh_token) {
    const redirectUrl = new URL(
        `${window.location.origin}/${window.ORG_NAME}`,
        window.location.origin
    );

    window.location.href = redirectUrl.toString()
}

localStorage.setItem("accessToken", access_token);
localStorage.setItem("username", username);

window.location.href = createUrl("select-organisation");