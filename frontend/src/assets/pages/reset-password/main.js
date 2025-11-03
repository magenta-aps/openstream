// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
import {
  translateHTML,
  gettext,
  fetchUserLangugage,
} from "../../utils/locales";
import { BASE_URL } from "../../utils/constants";

await fetchUserLangugage();
translateHTML();

const urlParams = new URLSearchParams(window.location.search);
const resetToken = urlParams.get("token")?.trim();

const form = document.getElementById("passwordResetForm");
const messageEl = document.getElementById("statusMessage");
const submitBtn = document.getElementById("submitPasswordBtn");
const submitSpinner = document.getElementById("submitSpinner");

function showMessage(text, variant = "danger") {
  if (!messageEl) {
    console.warn("Password reset message element is missing");
    return;
  }
  if (!text) {
    messageEl.innerHTML = "";
    return;
  }
  messageEl.innerHTML = `<div class="alert alert-${variant}" role="alert">${text}</div>`;
}

function toggleLoading(isLoading, keepDisabled = false) {
  if (!submitBtn || !submitSpinner) {
    return;
  }
  if (isLoading) {
    submitBtn.disabled = true;
  } else if (!keepDisabled) {
    submitBtn.disabled = false;
  }
  submitSpinner.classList.toggle("d-none", !isLoading);
}

if (!form) {
  console.error("Password reset form is missing on the page");
}

if (!resetToken) {
  if (form) {
    [...form.querySelectorAll("input, button")].forEach((element) => {
      element.disabled = true;
    });
  }
  showMessage(
    gettext(
      "Missing or invalid password reset token. Please request a new reset link.",
    ),
  );
} else if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const newPassword = document.getElementById("newPassword")?.value.trim();
    const confirmPassword = document
      .getElementById("confirmPassword")
      ?.value.trim();

    if (!newPassword || !confirmPassword) {
      showMessage(gettext("Both password fields are required."));
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage(gettext("The passwords do not match. Please try again."));
      return;
    }

    if (newPassword.length < 8) {
      showMessage(gettext("Password must be at least 8 characters long."));
      return;
    }

    toggleLoading(true);
    showMessage("");

    let resetSucceeded = false;
    try {
      const response = await fetch(`${BASE_URL}/api/confirm-password-reset/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: resetToken, new_password: newPassword }),
      });

      const contentType = response.headers.get("content-type") || "";
      let data = null;
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const rawText = await response.text();
        throw new Error(
          gettext("Unexpected response format: ") + (rawText || response.status),
        );
      }

      if (!response.ok) {
        const errorMessage =
          data?.error ||
          data?.message ||
          gettext("Unable to reset password. Please try again.");
        throw new Error(errorMessage);
      }

      showMessage(
        gettext("Your password has been updated. Redirecting to sign in..."),
        "success",
      );
      [...form.querySelectorAll("input")].forEach((element) => {
        element.value = "";
        element.disabled = true;
      });
      resetSucceeded = true;

      setTimeout(() => {
        window.location.href = "/sign-in";
      }, 3000);
    } catch (error) {
      console.error("Password reset failed", error);
      showMessage(
        error?.message ||
          gettext("Unable to reset password. Please try again later."),
      );
    } finally {
      toggleLoading(false, resetSucceeded);
      if (resetSucceeded) {
        submitBtn.disabled = true;
      }
    }
  });
}
