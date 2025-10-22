// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "bootstrap";
import "./style.scss";
import {
  translateHTML,
  gettext,
  fetchUserLangugage,
} from "../../utils/locales";

await fetchUserLanguageFromBackend();
await fetchUserLangugage();
translateHTML();

import { BASE_URL } from "../../utils/constants";
import {
  fetchUserLanguageFromBackend,
  initSignOutButton,
} from "../../utils/utils";
// Get DOM elements
const errorMessage = document.getElementById("error-message");
const errorText = document.getElementById("error-text");
const organisationsList = document.getElementById("organisations-list");
const emptyState = document.getElementById("empty-state");
const usernameDisplay = document.getElementById("username-display");
const signOutBtn = document.getElementById("sign-out-btn");

// Get token from localStorage
const token = localStorage.getItem("accessToken");

// Check if user is authenticated
if (!token) {
  window.location.href = "/sign-in";
  throw new Error("No access token found");
}

// Sign out functionality
signOutBtn.addEventListener("click", () => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("username");
  localStorage.removeItem("myUserId");
  window.location.href = "/sign-in";
});

// Fetch user info
async function fetchUserInfo() {
  try {
    const response = await fetch(`${BASE_URL}/api/user/info/`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const userData = await response.json();
      usernameDisplay.textContent = userData.username || "User";
    }
  } catch (error) {
    console.error("Error fetching user info:", error);
  }
}

// Fetch organizations
async function fetchOrganisations() {
  try {
    const response = await fetch(`${BASE_URL}/api/organisations/`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid
        localStorage.removeItem("accessToken");
        window.location.href = "/";
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const organisations = await response.json();
    displayOrganisations(organisations);
  } catch (error) {
    console.error("Error fetching organisations:", error);
    showError(error.message);
  }
}

// Display organizations
function displayOrganisations(organisations) {
  if (!organisations || organisations.length === 0) {
    showEmptyState();
    return;
  }

  // If user has only one organization, redirect directly to it
  if (organisations.length === 1) {
    selectOrganisation(organisations[0]);
    return;
  }

  organisationsList.innerHTML = "";

  organisations.forEach((org) => {
    const orgCard = createOrganisationCard(org);
    organisationsList.appendChild(orgCard);
  });
}

// Create organization card
function createOrganisationCard(org) {
  const card = document.createElement("div");
  card.className = "card organisation-card mb-2";
  card.style.cursor = "pointer";

  card.innerHTML = `
                    <div class="card-body d-flex align-items-center">
                        <div class="organisation-icon me-3">
                            <span class="material-symbols-outlined">business</span>
                        </div>
                        <div class="flex-grow-1">
                            <div class="organisation-name fw-bold fs-3">${escapeHtml(
                              org.name,
                            )}</div>
                            <div class="organisation-id">ID: ${org.id}</div>
                        </div>
                        <div>
                            <span class="material-symbols-outlined text-muted">arrow_forward_ios</span>
                        </div>
                    </div>
                `;

  // Add click handler
  card.addEventListener("click", () => selectOrganisation(org));

  return card;
}

// Select organization
function selectOrganisation(org) {
  // Redirect to sub-organization selection
  window.location.href = "/select-sub-org?orgId=" + org.id;
}

function showError(message) {
  errorText.textContent = message;
  errorMessage.style.display = "block";
  organisationsList.style.display = "none";
  emptyState.style.display = "none";
}

function showEmptyState() {
  emptyState.style.display = "block";
  organisationsList.style.display = "none";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Initialize the page
async function init() {
  await fetchUserInfo();
  await fetchOrganisations();
}

// Start the application
init();
