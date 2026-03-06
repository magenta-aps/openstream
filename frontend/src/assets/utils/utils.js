// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import MiniSearch from "minisearch";
import * as bootstrap from "bootstrap";
import { BASE_URL } from "./constants";
import { gettext } from "./locales";

const urlSearchParams = new URLSearchParams(window.location.search);

export const queryParams = {};
for (const [key, value] of urlSearchParams.entries()) {
  queryParams[key] = value;
}

export const token = localStorage.getItem("accessToken");

export const parentOrgID = window.ORG_NAME || "";

export const selectedSubOrgID = window.SUB_ORG || "";

export const selectedBranchID = window.BRANCH || "";

export const myUserId = localStorage.getItem("myUserId") || "";

export async function validateToken() {
  if (queryParams.mode !== "slideshow-player") {
    if (
      !localStorage.getItem("accessToken") &&
      queryParams.mode !== "slideshow-player"
    ) {
      alert("No token found in localStorage");
      signOut();
      return false;
    }

    try {
      const response = await fetch(`${BASE_URL}/api/token/validate/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (!response.ok) {
        console.error("Token validation failed:", response.status);
        if (queryParams.mode !== "slideshow-player") {
          alert("Token validation failed, signing out");
          signOut();
        }
        return false;
      }

      const data = await response.json();
      return data.valid;
    } catch (error) {
      console.error("Error validating token:", error);
      if (queryParams.mode !== "slideshow-player") {
        alert("Token validation error, signing out");
        signOut();
      }
      return false;
    }
  }
}

export function showToast(message, type = "Info") {
  // Define type-specific properties
  const toastTypes = {
    Success: {
      bg: "bg-success text-white",
      icon: "check_circle",
      title: "Success",
    },
    Info: { bg: "bg-info text-white", icon: "info", title: "Info" },
    Error: { bg: "bg-danger text-white", icon: "error", title: "Error" },
    Warning: { bg: "bg-warning text-dark", icon: "warning", title: "Warning" },
  };

  // 1. Find or create the toast container
  const containerId = "toast-container-main";
  let toastContainer = document.getElementById(containerId);
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = containerId;
    toastContainer.className =
      "toast-container position-fixed bottom-0 end-0 p-3";
    document.body.appendChild(toastContainer);
  }

  // 2. Create the toast element dynamically
  const toastEl = document.createElement("div");
  toastEl.className = "toast";
  toastEl.setAttribute("role", "alert");
  toastEl.setAttribute("aria-live", "assertive");
  toastEl.setAttribute("aria-atomic", "true");

  const { bg, icon, title } = toastTypes[type] || toastTypes["Info"];

  // Note: For translations, you would need a different mechanism
  // than Django's template tags here. This example uses plain text.
  toastEl.innerHTML = `
    <div class="toast-header ${bg}">
      <span class="material-symbols-outlined me-2">${icon}</span>
      <strong class="me-auto">${title}</strong>
      <small>Just now</small>
      <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
    <div class="toast-body">
      ${message}
    </div>
  `;

  // 3. Append the new toast to the container
  toastContainer.appendChild(toastEl);

  // 4. Initialize and show the toast
  const toast = new bootstrap.Toast(toastEl);

  // 5. Add an event listener to remove the element after it's hidden
  toastEl.addEventListener("hidden.bs.toast", () => {
    toastEl.remove(); // This is the "destroy" step
  });

  toast.show();
}

export async function signOut() {
  // Fetch signout-tokens
  const signout_params = new URLSearchParams({ "org": window.ORG_NAME })
  const signout_api_resp = await fetch(`${BASE_URL}/auth/signout/api?${signout_params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
    },
  });

  const resp_data = await signout_api_resp.json()

  // Remove local storage
  localStorage.removeItem("accessToken");

  // API should actually never be set for a logged in user, but we remove it just in case it's there
  localStorage.removeItem("apiKey");

  localStorage.removeItem("parentOrgID");
  localStorage.removeItem("parentOrgName");
  localStorage.removeItem("screenId");
  localStorage.removeItem("selectedBranchID");
  localStorage.removeItem("selectedBranchName");
  localStorage.removeItem("selectedSubOrgID");
  localStorage.removeItem("selectedSubOrgName");
  localStorage.removeItem("username");

  const redirectUrl = new URL(
    resp_data.redirect_url,
    window.location.origin,
  );
  window.location.href = redirectUrl.toString();
}

export function initSignOutButton() {
  const signOutBtn = document.getElementById("sign-out-btn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", signOut);
  }
}

export function createMiniSearchInstance(fields, options = {}) {
  const {
    idField = "id",
    extractField = MiniSearch.getDefault("extractField"),
  } = options;

  return new MiniSearch({
    fields, // Searchable fields
    idField, // Field to return on successful search matches
    extractField,
    searchOptions: {
      fuzzy: 0.2,
      prefix: true, // More generous searches
    },
  });
}

/**
 * Searches items in a dataset using MiniSearch
 * @param {string} query - The search query
 * @param {Array<Object>} dataset - The dataset to search
 * @param {MiniSearch} miniSearcher - The MiniSearch instance
 * @returns {Array<Object>} - The search results
 */
export function searchItems(query, dataset, miniSearcher) {
  if (!miniSearcher) {
    console.error(
      "You must provide a miniSearch instance suitable for the dataset you're querying",
    );
    return dataset;
  } else if (!dataset || dataset.length === 0) {
    console.error("Trying to search on an empty dataset");
    return [];
  }
  if (query) {
    const results = miniSearcher.search(query);
    // In case the id field is different from the default, compare against that field instead
    const idField = miniSearcher._options.idField || "id";
    // Return the matching items as an array
    const matches = results.map((result) =>
      dataset.find((item) => item[idField] === result.id),
    );
    if (matches.includes(undefined)) {
      console.error(
        "There was an error matching the search results with the provided data set. Returning the original dataset instead",
      );
      return dataset;
    } else {
      return matches;
    }
  } else {
    return dataset;
  }
}

const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function autoHyphenate(text) {
  if (text === undefined || text === null) {
    return "";
  }

  const stringValue = typeof text === "string" ? text : String(text);
  const SOFT_HYPHEN = "\u00AD";
  const hyphenated = stringValue.split("").join(SOFT_HYPHEN);

  return hyphenated.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

export async function genericFetch(
  fetchPath,
  method,
  body,
  headers = { Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
) {
  method = method?.toUpperCase();
  // If the body is formdata we shouldn't touch the content header
  if (
    ["POST", "PUT", "PATCH"].includes(method) &&
    !(body instanceof FormData)
  ) {
    headers["Content-Type"] = "application/json";
  }
  if (body && typeof body !== "string" && !(body instanceof FormData)) {
    body = JSON.stringify(body);
  }

  const result = await fetch(`${fetchPath}`, {
    method,
    headers,
    body,
  });

  if (result.status === 204 || result.status === 205) {
    // No content to parse
    return null;
  }

  const contentType = result.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!result.ok) {
    if (isJson) {
      const errorData = await result.json();
      errorData.status = result.status;
      throw { ...errorData, status: result.status };
    } else {
      throw result;
    }
  }

  if (isJson) {
    const text = await result.text();
    if (!text) return null; // Empty body
    try {
      const data = JSON.parse(text);
      return data;
    } catch (err) {
      console.warn("Failed to parse JSON:", text, err);
      throw new Error(gettext("Invalid JSON response"));
    }
  }

  return result;
}

let cachedSuborganisationsPromise = null;

async function fetchUserSuborganisationsWithRoles() {
  if (!localStorage.getItem("accessToken")) {
    return [];
  }
  if (!cachedSuborganisationsPromise) {
    cachedSuborganisationsPromise = genericFetch(
      `${BASE_URL}/api/user/suborganisations/`,
      "GET",
    ).catch((err) => {
      cachedSuborganisationsPromise = null;
      throw err;
    });
  }
  return cachedSuborganisationsPromise;
}

export async function updateUserLanguagePreference() {
  if (!localStorage.getItem("accessToken")) {
    return;
  }

  try {
    const response = await fetch(`${BASE_URL}/api/user-language-preference/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      },
    });

    if (response.ok) {
      const data = await response.json();

      if (data && data.language_preference) {
        const serverLang = data.language_preference;
        const currentLangInStorage = localStorage.getItem("userLanguage");
        const currentCookieLang = document.cookie
          .split("; ")
          .find((row) => row.startsWith("django_language="))
          ?.split("=")[1];

        if (
          serverLang !== currentLangInStorage ||
          serverLang !== currentCookieLang
        ) {
          localStorage.setItem("userLanguage", serverLang);
          document.cookie = `django_language=${serverLang};path=/;max-age=31536000;SameSite=Lax`;
          window.location.reload();
        }
      }
    } else {
      console.error(
        "Failed to fetch user language preference:",
        response.status,
      );
    }
  } catch (error) {
    console.error("Error fetching user language preference:", error);
  }
}

export async function fetchUserLanguageFromBackend() {
  if (!localStorage.getItem("accessToken")) {
    return null;
  }

  try {
    const response = await fetch(`${BASE_URL}/api/user-language-preference/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem("userLanguage", data.language_preference);
    } else {
      console.error(
        "Failed to fetch user language preference:",
        response.status,
      );
      return null;
    }
  } catch (error) {
    console.error("Error fetching user language preference:", error);
    return null;
  }
}

export function makeActiveInNav(href) {
  const target = href;
  const link = document.querySelector(`.nav-link[href="${target}"]`);
  if (link) {
    link.classList.add("active");
    if (link.parentElement) link.parentElement.classList.add("active");
  }
}

export function updateNavbarUsername() {
  const navbarUsername = document.getElementById("navbar-username");
  if (navbarUsername) {
    navbarUsername.innerText = localStorage.getItem("username");
  }
}

export async function updateNavbarBranchName() {
  const branchNameEl = document.getElementById("branch-name");
  if (branchNameEl) {
    let branchName = await getBranchName(selectedBranchID);
    if (!branchName) branchName = "";
    if (branchName === "Global") {
      branchName = gettext("Global Settings");
    }
    branchNameEl.innerText = branchName;
  }
}

export function promptDelete(
  name,
  callBack,
  redirectModalReject,
  redirectModalConfirm,
) {
  let deleteModalEl = document.querySelector("#deleteConfirmModal");
  if (!deleteModalEl) {
    // Dynamically insert a modal if it's not already found. This way the function can be used anywhere
    document.querySelector("#main-container")?.insertAdjacentHTML(
      "beforeend",
      `
            <div class="modal fade"
                 id="deleteConfirmModal"
                 tabIndex="-1"
                 aria-labelledby="deleteConfirmModalLabel"
                 aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="deleteConfirmModalLabel">${gettext("Confirm Delete")}</h5>
                            <button type="button"
                                    class="btn-close"
                                    data-bs-dismiss="modal"
                                    aria-label="${gettext("Close")}"></button>
                        </div>
                        <div class="modal-body"></div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="material-symbols-outlined">cancel</i> ${gettext("Cancel")}
                            </button>
                            <button type="button" class="btn btn-danger" id="deleteConfirmButton">
                                <i class="material-symbols-outlined">delete</i> ${gettext("Delete")}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `,
    );

    deleteModalEl = document.querySelector("#deleteConfirmModal");
    if (!deleteModalEl)
      return console.error(
        "Unable to insert the delete modal. #main-content not found",
      );
  } else {
    deleteModalEl = cloneAndReplaceNode(deleteModalEl); // clean any previous events
  }

  // This function takes care of hiding and reshowing the previous modal, if its provided
  if (redirectModalReject) {
    redirectModalReject.hide();
    // Clean up any previous handlers to avoid multiple triggers
    removeLocalEvent();
    deleteModalEl._reopenListener = () => {
      redirectModalReject.show();
    };
    deleteModalEl.addEventListener(
      "hidden.bs.modal",
      deleteModalEl._reopenListener,
    );
  }
  const deleteConfirmButton = document.getElementById("deleteConfirmButton");
  const bsDeleteModal = bootstrap.Modal.getOrCreateInstance(deleteModalEl);
  const confirmButton = cloneAndReplaceNode(deleteConfirmButton);
  confirmButton.addEventListener("click", async () => {
    if (redirectModalReject) {
      removeLocalEvent();
    }

    bsDeleteModal.hide();
    await callBack();

    if (redirectModalConfirm) {
      redirectModalConfirm.show();
    }
  });

  deleteModalEl.querySelector(".modal-body").innerHTML =
    `${gettext("Are you sure you want to delete")} <strong>${name}</strong>? ${gettext("This action cannot be undone.")}`;
  bsDeleteModal.show();

  function removeLocalEvent() {
    deleteModalEl.removeEventListener(
      "hidden.bs.modal",
      deleteModalEl._reopenListener,
    );
  }
}

export function cloneAndReplaceNode(oldNode) {
  const newNode = oldNode.cloneNode(true);
  oldNode.replaceWith(newNode);
  return newNode;
}

export function createPageSelector(pageData, updateFunc) {
  const wrapper = document.createElement("div");
  // p-1 border border-primary-subtle rounded - Border classes. Kinda looks better without
  wrapper.className = "d-flex justify-content-between align-items-center mt-2";
  wrapper.innerHTML = `
     <div>
      <small class="text-muted">
        ${(pageData.current_page - 1) * pageData.items_per_page + 1}–
        ${Math.min(pageData.current_page * pageData.items_per_page, pageData.count)}
        ${gettext("of")} ${pageData.count} ${gettext("files")}
      </small>
    </div>
    <nav aria-label="Page navigation">
      <ul class="pagination mb-0">
        <li class="page-item ${pageData.previous ? "" : "disabled"}">
          <button class="page-link" data-value="1">«</button>
        </li>
        <li class="page-item ${pageData.previous ? "" : "disabled"}" id="pagePreNums">
          <button class="page-link" data-value="${pageData.current_page - 1}">‹</button>
        </li>
        <li class="page-item ${pageData.next ? "" : "disabled"}">
          <button class="page-link" data-value="${pageData.current_page + 1}">›</button>
        </li>
        <li class="page-item ${pageData.next ? "" : "disabled"}">
          <button class="page-link" data-value="${pageData.num_pages}">»</button>
        </li>
      </ul>
    </nav>
    `;

  const beforePageNumsElem = wrapper.querySelector("#pagePreNums");
  // Dynamically render up to the previous and next 2 pages as numbered buttons
  for (let i = pageData.current_page + 2; i > pageData.current_page - 2; i--) {
    if (i < 1 || i > pageData.num_pages) continue;
    beforePageNumsElem.insertAdjacentHTML(
      "afterend",
      `
    <li class="page-item">
      <button class="page-link ${i === pageData.current_page ? "active" : ""}" data-value="${i}">
          ${i}
      </button>
    </li>
    `,
    );
  }

  wrapper.querySelectorAll("button").forEach((btn) => {
    const value = btn.dataset.value;

    if (value != pageData.current_page) {
      btn.addEventListener("click", () => {
        updateFunc(btn.dataset.value);
      });
    }
  });
  return wrapper;
}

export function addTagToDisplay(container, tag, callBack) {
  if (!container) {
    console.error("No tag container provided");
    return false;
  }

  // Check if container has the selected-tags-container class for new styling
  const isStreamlined = container.classList.contains("selected-tags-container");

  if (isStreamlined) {
    // Create new styled tag badge
    const tagBadge = document.createElement("div");
    tagBadge.classList.add(
      "border",
      "border-light-gray",
      "d-inline-flex",
      "gap-2",
      "align-items-center",
      "rounded",
      "p-1",
    );
    tagBadge.innerHTML = `
      ${tag}
      <button type="button" class="btn p-0" data-id="${tag}">
        <span class="material-symbols-outlined">close</span>
      </button>
    `;
    tagBadge
      .querySelector("button")
      .addEventListener("click", () => callBack(tag));
    container.appendChild(tagBadge);
  } else {
    // Original styling for backwards compatibility
    const tagWrapper = document.createElement("div");
    tagWrapper.classList.add("alert", "alert-info", "fw-bold", "m-1");
    tagWrapper.innerHTML = `${tag}<button type="button" data-id="${tag}" class="btn btn-sm btn-secondary mx-3 material-symbols-outlined">delete</button>`;
    tagWrapper
      .querySelector("button")
      .addEventListener("click", () => callBack(tag));
    container.appendChild(tagWrapper);
  }
}

export function createCheckboxDropdown(
  container,
  buttonText,
  options,
  checkAll = false,
) {
  // Options should be an array of objects with a "value" key and an optional "display" key
  // If no "display" key is provided, the "value" value will be used both as a display and internal input value attribute
  // Display can be replaced with a "name" attribute and "value" can be replaced with "id"

  // Create original dropdown for backwards compatibility
  createOriginalDropdown(container, buttonText, options, checkAll);
}

function createOriginalDropdown(container, buttonText, options, checkAll) {
  const wrapper = document.createElement("div");
  wrapper.className = "dropdown";
  wrapper.innerHTML = `
    <button class="form-select py-2 fs-5 rounded text-black w-100 d-flex justify-content-between align-items-center" type="button" data-bs-toggle="dropdown" aria-expanded="false">
    ${buttonText}
    </button>
    <ul class="dropdown-menu p-2" id="extensionDropdown" style="max-height: 500px; overflow-y: auto;">
     <li class="border-bottom">
      <label class="form-check">
        <input id="toggleAll"  class="form-check-input" type="checkbox"  ${checkAll ? "checked" : ""}  value="all">
        <span class="form-check-label fw-bold">${gettext("Select all")}</span>
      </label>
    </li>
</ul>`;
  const ul = wrapper.querySelector("ul");
  options.forEach((entry) => {
    ul.insertAdjacentHTML(
      "beforeend",
      `
        <li>
      <label class="form-check">
        <input class="form-check-input extension-checkbox" type="checkbox" ${checkAll ? "checked" : ""} value="${entry.value ?? entry.id}">
        <span class="form-check-label">${entry.display ?? entry.name ?? entry.value ?? entry.id}</span>
      </label>
    </li>
    `,
    );
  });
  // Prevent the dropdown from closing if a label is clicked rather than the checkbox
  ul.addEventListener("click", (e) => e.stopPropagation());
  const checkBoxes = wrapper.querySelectorAll(".extension-checkbox");
  const toggleAll = wrapper.querySelector("#toggleAll");
  toggleAll.addEventListener("input", () =>
    checkBoxes.forEach((box) => (box.checked = toggleAll.checked)),
  );

  container.innerHTML = "";
  container.appendChild(wrapper);
}

export function getSelectedExtensions(container) {
  const nodes = container.querySelectorAll(".extension-checkbox");
  return [...nodes]
    .filter((cb) => cb.checked)
    .map((cb) => String(cb.value).trim().toLowerCase());
}

export function capitalizeStartLetters(string) {
  return string
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function debounce(func, delay = 500) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

export function addDebounceEventListenerToElements(nodes, func) {
  nodes.forEach((entry) => entry.addEventListener("input", () => func()));
}

export function setupDeleteConfirmation(
  inputId,
  buttonId,
  errorId,
  textToTypeId,
  confirmationText,
  onConfirm,
) {
  const inputEl = document.getElementById(inputId);
  const confirmBtn = document.getElementById(buttonId);
  const errorEl = document.getElementById(errorId);
  const textToTypeEl = document.getElementById(textToTypeId);

  if (!inputEl || !confirmBtn || !errorEl || !textToTypeEl) {
    console.error("setupDeleteConfirmation: One or more elements not found", {
      inputId,
      buttonId,
      errorId,
      textToTypeId,
    });
    return;
  }

  // Set the confirmation text
  textToTypeEl.textContent = confirmationText;

  // Reset form state
  inputEl.value = "";
  inputEl.classList.remove("is-valid", "is-invalid");
  errorEl.classList.add("d-none");
  confirmBtn.disabled = true;

  // Validation function
  function validateInput() {
    const userInput = inputEl.value.trim();
    const isValid = userInput === confirmationText;

    if (userInput.length === 0) {
      inputEl.classList.remove("is-valid", "is-invalid");
      errorEl.classList.add("d-none");
    } else if (isValid) {
      inputEl.classList.remove("is-invalid");
      inputEl.classList.add("is-valid");
      errorEl.classList.add("d-none");
    } else {
      inputEl.classList.remove("is-valid");
      inputEl.classList.add("is-invalid");
      errorEl.classList.remove("d-none");
    }

    confirmBtn.disabled = !isValid;
  }

  // Add event listener
  inputEl.addEventListener("input", validateInput);

  // Auto-focus the input
  setTimeout(() => inputEl.focus(), 200);

  // Return a cleanup function
  return function cleanup() {
    inputEl.removeEventListener("input", validateInput);
  };
}

export async function updateTagSearchSuggestions(
  query,
  suggestionContainer,
  inputField,
  callBack,
) {
  if (!query) {
    suggestionContainer.classList.add("d-none");
    return;
  }
  const searchResults = await genericFetch(
    `/api/tags/list/?search_query=${query}`,
  );
  // const suggestions = document.getElementById("tagSuggestions");

  suggestionContainer.innerHTML = "";

  if (searchResults.length === 0) {
    suggestionContainer.classList.add("d-none");
    return;
  }

  // Add new suggestions
  searchResults.forEach((tag) => {
    const li = document.createElement("li");
    li.textContent = tag.name;
    li.className = "list-group-item list-group-item-action bg-light";
    li.style.cursor = "pointer";
    li.addEventListener("click", () => {
      inputField.value = tag.name;
      suggestionContainer.classList.add("d-none");
      callBack();
    });
    suggestionContainer.appendChild(li);
  });

  suggestionContainer.classList.remove("d-none");
}

// Ensure these functions are defined and return the correct values (or null/undefined)
// function getOrgId() { return 'org_123'; }
// function getSuborgId() { return 'sub_789'; }

export function getOrgId() {
  return parentOrgID;
}

export function getBranchId() {
  return selectedBranchID;
}

export function getSuborgId() {
  return selectedSubOrgID;
}

/**
 * Fetches organisation/suborg/branch name by id and returns the name string or null
 */
const orgNameCache = new Map();

export async function getOrgName(id) {
  const identifier = id || window.ORG_NAME;
  if (!identifier) {
    return null;
  }

  if (orgNameCache.has(identifier)) {
    return orgNameCache.get(identifier);
  }

  const encoded = encodeURIComponent(identifier);

  try {
    const result = await genericFetch(
      `${BASE_URL}/api/organisations/${encoded}/name/`,
      "GET",
    );
    const resolvedName = result?.name ?? null;
    orgNameCache.set(identifier, resolvedName);
    return resolvedName;
  } catch (error) {
    console.error("Failed to fetch organisation name", error);
    orgNameCache.set(identifier, null);
    return null;
  }
}

export async function getSubOrgName(id) {
  if (!id) return null;
  try {
    const res = await genericFetch(
      `${BASE_URL}/api/suborganisations/${id}/name/`,
      "GET",
    );
    return res?.name ?? null;
  } catch (err) {
    console.error("getSuborgName error:", err);
    return null;
  }
}

export async function getBranchName(id) {
  if (!id) return null;
  try {
    const res = await genericFetch(
      `${BASE_URL}/api/branches/${id}/name/`,
      "GET",
    );
    return res?.name ?? null;
  } catch (err) {
    console.error("getBranchName error:", err);
    return null;
  }
}


export function initCollapseLeftSidebarBtn() {
  const collapseBtn = document.getElementById("collapse-left-sidebar-btn");
  const sidebar = document.getElementById("sidebar");
  const pageTitle = document.querySelector(".page-title");
  const sidebarContent = document.getElementById("sidebar-content");
  const goBackBtn = document.getElementById("goBackBtn");

  if (collapseBtn && sidebar) {
    collapseBtn.addEventListener("click", () => {
      if (sidebar) {
        sidebar?.classList.toggle("collapsed")
      }

      if (pageTitle) {
        pageTitle?.classList.toggle("d-none");
      }

      if (sidebarContent) {
        sidebarContent?.classList.toggle("d-none");
      }

      if (goBackBtn) {
        goBackBtn?.classList.toggle("d-none");
      }

      if (collapseBtn.innerHTML.includes("chevron_left")) {
        collapseBtn.innerHTML = `<span class="material-symbols-outlined">chevron_right</span>`;
      } else {
        collapseBtn.innerHTML = `<span class="material-symbols-outlined">chevron_left</span>`;
      }
    });
  }
}

export function createUrl(path, includeSubOrg = false, includeBranch = false) {
  const orgName = window.ORG_NAME;

  if (!orgName) {
    return path;
  }

  const [rawPath = "", rawQuery = ""] = String(path ?? "").split("?");
  const normalizedPath = rawPath.replace(/^\/+/, "");
  const hasTrailingSlash = normalizedPath.endsWith("/");
  const encodedSegments = normalizedPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));

  const query = rawQuery ? `?${rawQuery}` : "";
  const trailingSlash = hasTrailingSlash ? "/" : "";

  let url = `/${encodeURIComponent(orgName)}`;

  if (includeSubOrg && window.SUB_ORG) {
    url += `/suborg/${encodeURIComponent(window.SUB_ORG)}`;
  }

  if (includeBranch && window.BRANCH) {
    url += `/branch/${encodeURIComponent(window.BRANCH)}`;
  }

  if (encodedSegments.length) {
    url += `/${encodedSegments.join("/")}`;
  }

  return `${url}${trailingSlash}${query}`;
}

export function initOrgUrlRouting() {
  const { ORG_NAME: ORG, SUB_ORG, BRANCH, location } = window;
  if (!ORG) return;

  const process = (a) => {
    // 1. Validation: Check existence, ignore attribute, same origin, http(s) only
    if (!a.href || a.hasAttribute("noSlug") || a.origin !== location.origin || !a.protocol.startsWith("http")) return;

    const linksToHideInProd = [
      "/emergency-slideshows",
      "/manage-wayfinding-systems",
      "/template-store"
    ];
    // Hide specific links in production environment only
    if (window.location.hostname === "openstream.dk") {
      if (linksToHideInProd.some((hiddenPath) => a.pathname.includes(hiddenPath))) {
        a.classList.add("d-none");
        return;
      }
    }

    const path = a.pathname;
    const segments = path.split("/").filter(Boolean);

    // 2. Filter: Skip if starts with Org, @, assets, or static
    if (!segments[0] || new RegExp(`^(${ORG}|@|assets|static)$`, "i").test(segments[0])) return;

    // 3. Logic: Check dataset override -> fallback to global var + path check
    const shouldInclude = (key, globalVal, slug) => {
      const override = a.dataset[key];
      if (override === "false") return false;
      // If override is true, we just need the global val. Else check global val AND ensure slug isn't already in path
      return !!globalVal && (override === "true" || !segments.some(s => s.toLowerCase() === slug));
    };

    // 4. Update HREF (Assuming createUrl is globally available per your original code)
    a.href = createUrl(
      path.replace(/^\/+/, "") + a.search,
      shouldInclude("includeSuborg", SUB_ORG, "suborg"),
      shouldInclude("includeBranch", BRANCH, "branch")
    ) + a.hash;
  };

  // 5. Execution & Observation
  const run = (node) => (node.nodeName === "A" ? [node] : node.querySelectorAll?.("a") || []).forEach(process);

  run(document); // Initial run

  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(run)))
    .observe(document.body, { childList: true, subtree: true });
}

export function shouldUseApiKeyInSlideTypeIframe() {
  const parentParams = new URLSearchParams(window.parent.location.search);
  const mode = parentParams.get('mode');
  if (mode === 'slideshow-player') {
    console.log("Using API key for slide type iframe in slideshowplayer mode");
    return true;
  }
  else {
    console.log("using token in editor mode");
    return false;
  }
}