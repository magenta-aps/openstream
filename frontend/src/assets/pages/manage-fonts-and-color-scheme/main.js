// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
import { translateHTML, fetchUserLangugage } from "../../utils/locales";
import {
  validateToken,
  makeActiveInNav,
  updateNavbarUsername,
  updateNavbarBranchName,
  initSignOutButton,
  initOrgQueryParams,
} from "../../utils/utils";
import initializeManageColorScheme from "./modules/color-scheme/manage-color-scheme.js";
import initializeManageFonts from "./modules/fonts/manage-fonts.js";

// Initialize on page load
document.addEventListener("DOMContentLoaded", async () => {
  initSignOutButton();
  await fetchUserLangugage();
  translateHTML();
  makeActiveInNav("/manage-fonts-and-color-scheme");
  await validateToken();
  updateNavbarBranchName();
  updateNavbarUsername();

  // Initialize color scheme management
  initializeManageColorScheme();

  // Initialize fonts management
  initializeManageFonts();
  initOrgQueryParams();
});
