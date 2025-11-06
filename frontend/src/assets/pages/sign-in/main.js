// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import * as bootstrap from "bootstrap";
import "./style.scss";
import {
  translateHTML,
  gettext,
  fetchUserLangugage,
} from "../../utils/locales";
import { BASE_URL } from "../../utils/constants";
import { createUrl, initSignOutButton } from "../../utils/utils";

await fetchUserLangugage();

translateHTML();

function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== "") {
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === name + "=") {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

document
  .getElementById("signinForm")
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const csrfToken = getCookie("csrftoken");

    try {
      const response = await fetch(`${BASE_URL}/api/token/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({ username, password }),
      });

      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await response.json(); // Parse as JSON if response is okay
      } else {
        const errorText = await response.text(); // Read as text if not JSON
        throw new Error(gettext("Unexpected response format: ") + errorText);
      }

      if (!response.ok) {
        throw new Error(
          gettext("Login failed: ") + (data.detail || response.statusText),
        );
      }

      localStorage.setItem("accessToken", data.access);
      localStorage.setItem("username", username);

      window.location.href = createUrl("select-organisation");
    } catch (error) {
      document.getElementById("message").innerText = error.message;
    }
  });

async function checkIfSignedIn() {
  if (localStorage.getItem("accessToken")) {
    const response = await fetch(`${BASE_URL}/api/token/validate/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      },
    });

    if (response.ok) {
      // Token is valid, redirect to select-organisation
      window.location.href = createUrl("select-organisation");
    }
  }
}

checkIfSignedIn();

// Password Reset Modal Functionality
document
  .getElementById("resetPasswordForm")
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = document.getElementById("resetEmail").value;
    const csrfToken = getCookie("csrftoken");
    const resetBtn = document.getElementById("resetPasswordBtn");
    const resetSpinner = document.getElementById("resetSpinner");
    const resetMessage = document.getElementById("resetMessage");

    // Show loading state
    resetBtn.disabled = true;
    resetSpinner.classList.remove("d-none");
    resetMessage.innerText = "";

    try {
      const response = await fetch(`${BASE_URL}/api/reset-password/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({ email }),
      });

      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const errorText = await response.text();
        throw new Error(gettext("Unexpected response format: ") + errorText);
      }

      if (response.ok) {
        resetMessage.innerHTML = `<div class="alert alert-success">${data.message}</div>`;
        // Clear the form
        document.getElementById("resetEmail").value = "";
        // Auto-close modal after 3 seconds
        setTimeout(() => {
          const modal = bootstrap.Modal.getInstance(
            document.getElementById("resetPasswordModal"),
          );
          modal.hide();
          resetMessage.innerHTML = "";
        }, 3000);
      } else {
        throw new Error(data.error || gettext("Password reset failed"));
      }
    } catch (error) {
      resetMessage.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
    } finally {
      // Hide loading state
      resetBtn.disabled = false;
      resetSpinner.classList.add("d-none");
    }
  });

// Clear reset modal messages when modal is hidden
document
  .getElementById("resetPasswordModal")
  .addEventListener("hidden.bs.modal", function () {
    document.getElementById("resetMessage").innerHTML = "";
    document.getElementById("resetEmail").value = "";
  });

initSignOutButton();
