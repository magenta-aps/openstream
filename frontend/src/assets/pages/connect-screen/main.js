// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
import { BASE_URL, derivePollingServiceFromHostname } from "../../utils/constants";
import {
  translateHTML,
  fetchUserLangugage,
  gettext,
} from "../../utils/locales";
import { queryParams } from "../../utils/utils";

// Initialize translations
(async () => {
  await fetchUserLangugage();
  translateHTML();
})();

// Get API key from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const apiKey = urlParams.get("apiKey");
const aspectRatio = urlParams.get("aspect_ratio");
const uid = urlParams.get("uid");
const hostname = urlParams.get("hostname");

// DOM elements
const loadingState = document.getElementById("loading-state");
const registrationState = document.getElementById("registration-state");
const errorState = document.getElementById("error-state");
const screenIdElement = document.getElementById("screen-id");
const errorMessageElement = document.getElementById("error-message");
let screenId = queryParams.displayWebsiteId || localStorage.getItem("screenId");
/**
 * Safely parse a Response as JSON. If response body is not JSON, return
 * an object containing the raw text under __rawText so callers can handle it.
 */
async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return { __rawText: text };
  }
}

/**
 * Show error state with a specific message
 */
function showError(message) {
  loadingState.style.display = "none";
  registrationState.style.display = "none";
  errorState.style.display = "block";
  errorMessageElement.textContent = message;
}

/**
 * Show registration state with screen ID
 */
function showRegistration(screenId) {
  loadingState.style.display = "none";
  errorState.style.display = "none";
  registrationState.style.display = "block";
  screenIdElement.textContent = screenId;
  if (hostname) {
    screenIdElement.textContent = hostname;
  }
}

/**
 * Create a new screen via API
 */
async function createScreen() {
  try {
    const body = { apiKey: apiKey };
    if (aspectRatio) body.aspect_ratio = aspectRatio;
    if (uid) body.uid = uid;
    if (hostname) body.hostname = hostname;

    const response = await fetch(`${BASE_URL}/api/create-screen/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const parsed = await parseJsonSafe(response);

    if (!response.ok) {
      const raw =
        parsed && parsed.__rawText
          ? parsed.__rawText
          : JSON.stringify(parsed || {});
      console.error("Create screen failed (raw):", raw);
      const message =
        parsed && parsed.error ? parsed.error : `HTTP ${response.status}`;
      throw new Error(message);
    }

    if (parsed && parsed.__rawText) {
      // Server returned non-JSON body even though request succeeded.
      console.warn(
        "createScreen: server returned non-JSON response:",
        parsed.__rawText,
      );
      throw new Error(
        gettext("Unexpected server response when creating screen."),
      );
    }

    return parsed && parsed.screenId;
  } catch (error) {
    console.error("Error creating screen:", error);
    throw error;
  }
}

/**
 * Check if screen is assigned to a group
 */
async function checkForGroupAssignment(screenId) {
  try {
    // If uid or hostname provided, include them in the check querystring
    const checkUrl = new URL(`${BASE_URL}/api/check-screen-group/`);
    checkUrl.searchParams.set("screenId", screenId);
    checkUrl.searchParams.set("apiKey", apiKey);
    if (uid) checkUrl.searchParams.set("uid", uid);
    if (hostname) checkUrl.searchParams.set("hostname", hostname);
    const response = await fetch(checkUrl.toString(), { method: "GET" });

    if (response.ok) {
      const data = await parseJsonSafe(response);
      if (data && data.__rawText) {
        console.warn(
          "checkForGroupAssignment: server returned non-JSON response:",
          data.__rawText,
        );
        // Treat as not assigned so we show registration and continue polling
        return false;
      }

      if (data && data.groupId) {
        // Redirect to the open-screen URL when a group is assigned.
        window.location.href = `/open-screen?displayWebsiteId=${screenId}&apiKey=${apiKey}&mode=slideshow-player${hostname ? `&hostname=${hostname}` : ''}${uid ? `&uid=${uid}` : ''}`;
        return true;
      }
      return false;
    } else if (response.status === 404) {
      // Screen not found, create a new one
      const newScreenId = await createScreen();
      screenId = newScreenId;
      localStorage.setItem("screenId", newScreenId);
      showRegistration(newScreenId);
      return false;
    } else {
      const parsed = await parseJsonSafe(response);
      const raw =
        parsed && parsed.__rawText
          ? parsed.__rawText
          : JSON.stringify(parsed || {});
      console.error("checkForGroupAssignment failed (raw):", raw);
      const message =
        parsed && parsed.error ? parsed.error : `HTTP ${response.status}`;
      throw new Error(message);
    }
  } catch (error) {
    console.error("Error checking group assignment:", error);
    throw error;
  }
}

/**
 * Initialize screen registration process
 */
async function initializeScreen() {
  if (!apiKey) {
    showError(gettext("API key is required."));
    return;
  }

  try {
    // First, try to get existing screen data
    if (screenId) {
      // Check if this screen still exists and is valid
      const isAssigned = await checkForGroupAssignment(screenId);
      if (!isAssigned) {
        showRegistration(screenId);
      }
    } else {
      // No screen ID in localStorage, create a new screen
      screenId = await createScreen();
      localStorage.setItem("screenId", screenId);
      showRegistration(screenId);
    }
  } catch (error) {
    console.error("Error initializing screen:", error);
    showError(
      gettext(
        "Failed to initialize screen registration. Please check your API key and try again.",
      ),
    );
  }
}


function initLiveReload() {
  console.log("Initializing live reload via SSE");
  // 1. Point this to your Express route
  const eventSource = new EventSource(derivePollingServiceFromHostname());

  // Check connection status
  eventSource.onopen = () => {
    console.log('[sse] connection established at', new Date().toISOString());
  };

  // 2. Listen for the "custom-event" sent by channel.broadcast()
  eventSource.addEventListener('custom-event', (event) => {
    const data = JSON.parse(event.data);

    if (data.model == "DisplayWebsite") {
      console.log("DisplayWebsite change detected");
      checkForGroupAssignment(screenId);
    }
  });

  // Handle errors (like server going down)
  eventSource.onerror = (err) => {
    console.error('[sse] error', err);
  };
}

// Start the initialization process when the page loads
document.addEventListener("DOMContentLoaded", async () => {
  await initializeScreen();

  if (screenId) {
    // Set up SSE for real-time updates
    initLiveReload();

    // Backup polling every minute in case SSE fails
    setInterval(() => {
      console.log("Backup polling check");
      checkForGroupAssignment(screenId);
    }, 60000);
  }
});
