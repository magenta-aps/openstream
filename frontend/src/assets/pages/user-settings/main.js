// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";

import { fetchUserLangugage, translateHTML } from "../../utils/locales";
import {
  validateToken,
  makeActiveInNav,
  updateNavbarUsername,
  showToast,
  genericFetch,
  initSignOutButton,
  initOrgQueryParams,
} from "../../utils/utils";
import * as bootstrap from "bootstrap";
import { BASE_URL } from "../../utils/constants";
import { gettext } from "../../utils/locales";

document.addEventListener("DOMContentLoaded", async () => {
  validateToken();
  initSignOutButton();
  makeActiveInNav("user-settings");
  updateNavbarUsername();
  fetchUserLangugage();
  translateHTML();
  initOrgQueryParams();

  const userForm = document.getElementById("user-form");
  const passwordForm = document.getElementById("password-form");
  const goBackBtn = document.getElementById("go-back-btn");

  // Go Back button functionality
  goBackBtn.addEventListener("click", function (event) {
    event.preventDefault();
    const previousPage = document.referrer || "/";
    window.location.href = previousPage;
  });

  async function fetchUserInfo() {
    try {
      const userData = await genericFetch(`${BASE_URL}/api/user/allinfo/`);
      document.getElementById("user_setting_username").value =
        userData.username;
      document.getElementById("email").value = userData.email;
      document.getElementById("first_name").value = userData.first_name;
      document.getElementById("last_name").value = userData.last_name;
      document.getElementById("language_preference").value =
        userData.language_preference;
    } catch (error) {
      console.error(gettext("Error fetching user data:"), error);
      showToast(
        gettext("An error occurred while fetching user data."),
        "danger",
      );
    }
  }

  await fetchUserInfo();

  userForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const formData = {
      username: document.getElementById("user_setting_username").value,
      email: document.getElementById("email").value,
      first_name: document.getElementById("first_name").value,
      last_name: document.getElementById("last_name").value,
      language_preference: document.getElementById("language_preference").value,
    };

    // Validate required fields
    if (
      !formData.username ||
      !formData.email ||
      !formData.first_name ||
      !formData.last_name
    ) {
      showToast(
        gettext(
          "Please fill in all required fields (Username, Email, First Name, Last Name).",
        ),
        "danger",
      );
      return;
    }

    try {
      await genericFetch(`${BASE_URL}/api/user/update/`, "PATCH", formData);
      showToast(gettext("User information updated successfully!"), "success");
      localStorage.setItem("username", formData.username);
      localStorage.setItem("userLanguage", formData.language_preference);
      // Update the username in the UI if it's displayed in the header
      const usernameElement = document.getElementById("username");
      if (usernameElement) {
        usernameElement.textContent = formData.username;
      }
      window.location.reload();
    } catch (error) {
      console.error(gettext("Error updating user info:"), error);
      showToast(
        gettext("An error occurred while updating user information."),
        "danger",
      );
    }
  });

  passwordForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const formData = {
      old_password: document.getElementById("old_password").value,
      new_password: document.getElementById("new_password").value,
      confirm_password: document.getElementById("confirm_password").value,
    };

    if (formData.new_password !== formData.confirm_password) {
      showToast(gettext("New passwords do not match."), "danger");
      return;
    }

    try {
      await genericFetch(
        `${BASE_URL}/api/user/change-password/`,
        "POST",
        formData,
      );
      showToast(gettext("Password changed successfully!"), "success");
      passwordForm.reset();
    } catch (error) {
      console.error(gettext("Error changing password:"), error);
      showToast(
        gettext("An error occurred while changing password."),
        "danger",
      );
    }
  });
});
