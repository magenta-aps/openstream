// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import MiniSearch from "minisearch";
import * as bootstrap from "bootstrap";
import { BASE_URL } from "./constants";
import { gettext } from "./locales";

export const token = localStorage.getItem("accessToken");

export const parentOrgID = localStorage.getItem("parentOrgID") || "";

export const parentOrgName = localStorage.getItem("parentOrgName") || "";

export const selectedSubOrgID = localStorage.getItem("selectedSubOrgID") || "";

export const selectedSubOrgName =
  localStorage.getItem("selectedSubOrgName") || "";

export const selectedBranchID = localStorage.getItem("selectedBranchID") || "";

export const selectedBranchName =
  localStorage.getItem("selectedBranchName") || "";

export const myUserId = localStorage.getItem("myUserId") || "";

const urlSearchParams = new URLSearchParams(window.location.search);

export const queryParams = {};
for (const [key, value] of urlSearchParams.entries()) {
  queryParams[key] = value;
}

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

export function signOut() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("apiKey");
  localStorage.removeItem("parentOrgID");
  localStorage.removeItem("parentOrgName");
  localStorage.removeItem("screenId");
  localStorage.removeItem("selectedBranchID");
  localStorage.removeItem("selectedBranchName");
  localStorage.removeItem("selectedSubOrgID");
  localStorage.removeItem("selectedSubOrgName");
  localStorage.removeItem("username");
  window.location.href = "/"; // Redirect to root
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

export function autoHyphenate(text) {
  return text.split("").join("&shy;");
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

export function updateNavbarBranchName() {
  const branchNameEl = document.getElementById("branch-name");
  if (branchNameEl) {
    let branchName = localStorage.getItem("selectedBranchName");
    if (branchName === "Global") {
      branchName = "Global Settings";
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
        ${gettext("of")} ${pageData.count}
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
    tagBadge.classList.add("tag-badge");
    tagBadge.innerHTML = `
      ${tag}
      <button type="button" class="remove-tag" data-id="${tag}">
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
  checkAll = true,
) {
  // Options should be an array of objects with a "value" key and an optional "display" key
  // If no "display" key is provided, the "value" value will be used both as a display and internal input value attribute
  // Display can be replaced with a "name" attribute and "value" can be replaced with "id"
  // Check if container has streamlined-dropdown class for special styling
  const isStreamlined = container.classList.contains("streamlined-dropdown");

  if (isStreamlined) {
    // Create streamlined dropdown for media modal
    createStreamlinedDropdown(container, buttonText, options, checkAll);
  } else {
    // Create original dropdown for backwards compatibility
    createOriginalDropdown(container, buttonText, options, checkAll);
  }
}

function createStreamlinedDropdown(container, buttonText, options, checkAll) {
  const wrapper = document.createElement("div");
  wrapper.className = "dropdown w-100";

  // Count selected items for display
  const selectedCount = options.filter(
    (entry) =>
      checkAll || (entry.selected !== undefined ? entry.selected : false),
  ).length;

  const displayText =
    selectedCount > 0
      ? selectedCount === 1
        ? `${selectedCount} ${gettext("item selected")}`
        : `${selectedCount} ${gettext("items selected")}`
      : `${gettext("Select")} ${buttonText.toLowerCase()}...`;

  wrapper.innerHTML = `
    <button class="dropdown-toggle w-100" type="button" data-bs-toggle="dropdown" aria-expanded="false">
      <span class="dropdown-text">${displayText}</span>
    </button>
    <ul class="dropdown-menu">
      <li class="border-bottom">
        <label class="form-check">
          <input id="toggleAll" class="form-check-input" type="checkbox" ${checkAll ? "checked" : ""} value="all">
          <span class="form-check-label">${gettext("Select all")}</span>
        </label>
      </li>
    </ul>`;

  const ul = wrapper.querySelector("ul");
  const dropdownToggle = wrapper.querySelector(".dropdown-toggle");
  const dropdownText = wrapper.querySelector(".dropdown-text");

  options.forEach((entry) => {
    const isSelected =
      checkAll || (entry.selected !== undefined ? entry.selected : false);
    ul.insertAdjacentHTML(
      "beforeend",
      `
        <li>
          <label class="form-check">
            <input class="form-check-input extension-checkbox" type="checkbox" ${isSelected ? "checked" : ""} value="${entry.value ?? entry.id}">
            <span class="form-check-label">${entry.display ?? entry.name ?? entry.value ?? entry.id}</span>
          </label>
        </li>
      `,
    );
  });

  // Prevent the dropdown from closing when clicking inside
  ul.addEventListener("click", (e) => e.stopPropagation());

  const checkBoxes = wrapper.querySelectorAll(".extension-checkbox");
  const toggleAll = wrapper.querySelector("#toggleAll");

  // Function to update the display text
  function updateDisplayText() {
    const selectedBoxes = Array.from(checkBoxes).filter((box) => box.checked);
    const selectedCount = selectedBoxes.length;

    if (selectedCount === 0) {
      dropdownText.textContent = `${gettext("Select")} ${buttonText.toLowerCase()}...`;
    } else if (selectedCount === 1) {
      const selectedLabel =
        selectedBoxes[0].parentElement.querySelector(
          ".form-check-label",
        ).textContent;
      dropdownText.textContent = selectedLabel;
    } else if (selectedCount <= 3) {
      const selectedLabels = selectedBoxes.map(
        (box) =>
          box.parentElement.querySelector(".form-check-label").textContent,
      );
      dropdownText.textContent = selectedLabels.join(", ");
    } else {
      dropdownText.textContent = `${selectedCount} ${gettext("items selected")}`;
    }
  }

  // Toggle all functionality
  toggleAll.addEventListener("input", () => {
    checkBoxes.forEach((box) => (box.checked = toggleAll.checked));
    updateDisplayText();
  });

  // Individual checkbox functionality
  checkBoxes.forEach((box) => {
    box.addEventListener("change", () => {
      // Update toggle all state
      const allChecked = Array.from(checkBoxes).every((cb) => cb.checked);
      const noneChecked = Array.from(checkBoxes).every((cb) => !cb.checked);

      toggleAll.checked = allChecked;
      toggleAll.indeterminate = !allChecked && !noneChecked;

      updateDisplayText();
    });
  });

  // Initial display update
  updateDisplayText();

  container.innerHTML = "";
  container.appendChild(wrapper);
}

function createOriginalDropdown(container, buttonText, options, checkAll) {
  const wrapper = document.createElement("div");
  wrapper.className = "dropdown m-3";
  wrapper.innerHTML = `
    <button class="btn btn-outline-gray text-black dropdown-toggle w-100 d-flex justify-content-between align-items-center" type="button" data-bs-toggle="dropdown" aria-expanded="false">
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
