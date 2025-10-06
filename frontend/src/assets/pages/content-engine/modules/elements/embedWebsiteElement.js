// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { loadSlide } from "../core/renderSlide.js";
import { selectElement } from "../core/elementSelector.js";
import { getNewZIndex } from "../utils/domUtils.js";
import {
  token,
  selectedBranchID,
  queryParams,
  showToast,
} from "../../../../utils/utils.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";
import * as bootstrap from "bootstrap";

const embedWebsiteOption = document.querySelector(
  '[data-type="embed-website"]',
);

if (embedWebsiteOption) {
  embedWebsiteOption.addEventListener("click", async () => {
    if (store.currentSlideIndex === -1) {
      showToast(gettext("Please select a slide first!"), "Info");
      return;
    }

    // IMPORTANT: Clear any existing update state when opening modal for NEW element creation
    window.selectedElementForUpdate = null;

    // Clear the input field for new element creation
    const urlInput = document.getElementById("embedWebsiteUrl");
    if (urlInput) {
      urlInput.value = "";
    }

    // Make sure branchWebsites is defined
    window.branchWebsites = [];

    async function fetchBranchWebsites() {
      const response = await fetch(
        `${BASE_URL}/api/branch-url-items?branch_id=${selectedBranchID}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        const errTxt = await response.text();
        throw new Error(`Failed. Status: ${response.status}: ${errTxt}`);
      }

      const data = await response.json();
      window.branchWebsites = data; // Store for existence checks

      // Container for the list title & items
      const websiteListContainer = document.createElement("div");

      // Create a Bootstrap list group
      const listGroup = document.createElement("ul");
      listGroup.classList.add("list-group");
      websiteListContainer.appendChild(listGroup);

      data.forEach((urlObj) => {
        const listItem = document.createElement("li");
        listItem.classList.add(
          "list-group-item",
          "d-flex",
          "justify-content-between",
          "align-items-center",
        );

        // Left section: embed-on-click
        const linkBtn = document.createElement("button");
        linkBtn.classList.add("btn", "btn-link", "p-0", "text-start");
        linkBtn.textContent = urlObj.url;
        linkBtn.addEventListener("click", () => {
          // Embed and close modal
          addEmbedWebsiteElementToSlide(urlObj.url);
          const modalEl = document.getElementById("embedWebsiteModal");
          bootstrap.Modal.getInstance(modalEl).hide();
        });

        // Delete button
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = gettext("Delete");
        deleteBtn.classList.add("btn", "btn-danger", "btn-sm");

        // Inline confirmation container, hidden by default
        const confirmContainer = document.createElement("div");
        confirmContainer.classList.add("d-none", "ms-2");
        confirmContainer.innerHTML = `
      <span class="me-2">${gettext("Are you sure you want to remove the website from the list?")}</span>
      <button class="btn btn-outline-danger btn-sm me-2">${gettext("Yes")}</button>
      <button class="btn btn-outline-secondary btn-sm">${gettext("No")}</button>
    `;

        // We’ll use these references for clarity:
        const yesBtn = confirmContainer.querySelector(".btn-outline-danger");
        const noBtn = confirmContainer.querySelector(".btn-outline-secondary");

        // Clicking 'Delete' toggles the confirmation
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          confirmContainer.classList.toggle("d-none");
          deleteBtn.classList.toggle("d-none");
        });

        // If user clicks 'No', simply hide the confirmation
        noBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteBtn.classList.toggle("d-none");
          confirmContainer.classList.toggle("d-none");
        });

        // If user clicks 'Yes', we perform the DELETE call
        yesBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            const deleteRes = await fetch(
              `${BASE_URL}/api/branch-url-items/${urlObj.id}/?branch_id=${selectedBranchID}`,
              {
                method: "DELETE",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
              },
            );

            if (!deleteRes.ok) {
              const errTxt = await deleteRes.text();
              throw new Error(
                `Failed to delete. Status: ${deleteRes.status}: ${errTxt}`,
              );
            }

            // Remove from DOM
            listItem.remove();
            // Remove from in-memory array
            window.branchWebsites = window.branchWebsites.filter(
              (item) => item.id !== urlObj.id,
            );
          } catch (err) {
            console.error(err);
            showToast(err.message, "Error");
          }
        });

        // Put it all together
        // A container for the link + delete button + optional confirmation
        const contentWrapper = document.createElement("div");
        contentWrapper.classList.add(
          "d-flex",
          "align-items-center",
          "w-100",
          "justify-content-between",
        );

        const leftCol = document.createElement("div");
        leftCol.appendChild(linkBtn);

        const rightCol = document.createElement("div");
        rightCol.classList.add("d-flex", "align-items-center");
        rightCol.appendChild(deleteBtn);
        rightCol.appendChild(confirmContainer);

        contentWrapper.appendChild(leftCol);
        contentWrapper.appendChild(rightCol);

        listItem.appendChild(contentWrapper);
        listGroup.appendChild(listItem);
      });

      // Clear old content & insert new
      const selectorEl = document.querySelector("#websiteSelector");
      selectorEl.innerHTML = "";
      selectorEl.appendChild(websiteListContainer);
    }

    await fetchBranchWebsites();

    // Show the modal
    const embedWebsiteModal = new bootstrap.Modal(
      document.getElementById("embedWebsiteModal"),
    );
    embedWebsiteModal.show();
  });
}

function addEmbedWebsiteElementToSlide(url) {
  // This function should ONLY create new elements
  if (store.currentSlideIndex === -1) {
    showToast(gettext("Please select a slide first!"), "Info");
    return;
  }

  pushCurrentSlideState();
  const newEmbedWebsite = {
    id: store.elementIdCounter++,
    type: "embed-website",
    url: url,
    gridX: 100,
    gridY: 0,
    gridWidth: 100,
    gridHeight: 200,
    border: false,
    backgroundColor: "transparent",
    zIndex: getNewZIndex(),
    muted: true,
    originSlideIndex: store.currentSlideIndex, // Track which slide this element was created on
    isLocked: false, // Initialize lock state
    isHidden: false, // Initialize visibility state
  };
  store.slides[store.currentSlideIndex].elements.push(newEmbedWebsite);
  loadSlide(store.slides[store.currentSlideIndex], undefined, undefined, true);
  selectElement(
    document.getElementById("el-" + newEmbedWebsite.id),
    newEmbedWebsite,
  );
}

function updateExistingEmbedWebsiteElement(url) {
  // This function should ONLY update existing elements
  if (
    !window.selectedElementForUpdate ||
    !window.selectedElementForUpdate.element ||
    window.selectedElementForUpdate.element.type !== "embed-website"
  ) {
    showToast(
      gettext("No embed website element selected for update!"),
      "Warning",
    );
    return;
  }

  pushCurrentSlideState();

  // Store the element ID before updating
  const elementId = window.selectedElementForUpdate.element.id;

  // Update the URL in the data
  window.selectedElementForUpdate.element.url = url;

  // Try to update the DOM directly so the change is visible immediately
  const containerEl = document.getElementById("el-" + elementId);
  if (containerEl) {
    // Update any existing webview inside the element
    const webviewEl = containerEl.querySelector("webview");
    if (webviewEl) {
      try {
        webviewEl.src = url;
      } catch (e) {
        // setting src might throw in some environments, but continue
        console.error("Failed to set webview src:", e);
      }

      // Update the placeholder text inside the webview (used in editor mode)
      try {
        webviewEl.innerHTML = `
    <div id="electron-placeholder" class="d-flex justify-content-center align-items-center w-100 h-100 text-white text-center position-relative bg-dark border border-secondary" style="border-width: 10px !important;">
        <!-- Faint background icon -->
        <span class="material-symbols-outlined position-absolute top-50 start-50 translate-middle text-primary" style="font-size: 30rem; opacity: 0.15; pointer-events: none;">
          language
        </span>
        <!-- Foreground message -->
        <div class="bg-dark p-4 rounded shadow-lg">
          <p class="fs-3 m-0">
  ${gettext("When using the native version of OpenStream (as the actual digital signage screens should), this website will be shown:")}<br><br>
</p> <p class="fs-2 fw-bold m-0">${url.split("?")[0]}</p>

     <p class="fs-3 m-0"><br>
  ${gettext("If you wish to preview embedded websites in the editor, you need to install the desktop version of OpenStream. Please read the documentation for more information.")}
</p> 
        </div>
  </div>
  `;
      } catch (e) {
        // Some environments disallow writing innerHTML to the webview — ignore silently
        console.warn("Could not update webview innerHTML:", e);
      }

      // Update mute state if possible
      const webMuted =
        typeof window.selectedElementForUpdate.element.muted !== "undefined"
          ? window.selectedElementForUpdate.element.muted
          : true;
      const shouldMute = queryParams.mode === "edit" || webMuted;
      if (typeof webviewEl.setAudioMuted === "function") {
        try {
          webviewEl.setAudioMuted(shouldMute);
        } catch (e) {
          console.warn("setAudioMuted failed:", e);
        }
      } else {
        // fallback: set muted attribute
        try {
          if (shouldMute) webviewEl.setAttribute("muted", "");
          else webviewEl.removeAttribute("muted");
        } catch (e) {
          // ignore
        }
      }
    }
  }

  // Re-select the element to maintain selection and update toolbar
  const updatedElement = document.getElementById("el-" + elementId);
  if (updatedElement) {
    // Find the updated element data from the store
    const updatedElementData = store.slides[
      store.currentSlideIndex
    ].elements.find((el) => el.id === elementId);
    if (updatedElementData) {
      selectElement(updatedElement, updatedElementData);

      // Manually update the toolbar input to show the new URL
      const toolbarInput = document.getElementById("change-website-input");
      if (toolbarInput) {
        toolbarInput.value = url;
      }
    }
  }
}

async function addWebsiteToList(url) {
  const response = await fetch(
    `${BASE_URL}/api/branch-url-items/?branch_id=${selectedBranchID}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url: url.url, branch: selectedBranchID }),
    },
  );

  if (!response.ok) {
    const errTxt = await response.text();
    throw new Error(`Failed. Status: ${response.status}: ${errTxt}`);
  }
}

// Helper function used by the rendering engine in renderSlide.js
export function _renderEmbedWebsite(el, container) {
  const webviewEl = document.createElement("webview");
  webviewEl.src = el.url;
  webviewEl.style.width = "100%";
  webviewEl.style.height = "100%";
  webviewEl.style.border = "none";
  webviewEl.style.pointerEvents = "none";
  webviewEl.innerHTML = `
    <div id="electron-placeholder" class="d-flex justify-content-center align-items-center w-100 h-100 text-white text-center position-relative bg-dark border border-secondary" style="border-width: 10px !important;">
        <!-- Faint background icon -->
        <span class="material-symbols-outlined position-absolute top-50 start-50 translate-middle text-primary" style="font-size: 30rem; opacity: 0.15; pointer-events: none;">
          language
        </span>
        <!-- Foreground message -->
        <div class="bg-dark p-4 rounded shadow-lg">
          <p class="fs-3 m-0">
  ${gettext("When using the native version of OpenStream (as the actual digital signage screens should), this website will be shown:")}<br><br>
</p> <p class="fs-2 fw-bold m-0">${el.url.split("?")[0]}</p>

     <p class="fs-3 m-0"><br>
  ${gettext("If you wish to preview embedded websites in the editor, you need to install the desktop version of OpenStream. Please read the documentation for more information.")}
</p> 
        </div>
  </div>
  `;

  // Use el.muted if provided, otherwise default to true.
  const webMuted = typeof el.muted !== "undefined" ? el.muted : true;
  // Always mute if in edit mode, otherwise use webMuted
  const shouldMute = queryParams.mode === "edit" || webMuted;

  webviewEl.addEventListener("dom-ready", () => {
    webviewEl.setAudioMuted(shouldMute);
  });

  container.appendChild(webviewEl);
}

export function initMute() {
  // Mute logic if needed
}

export function initEmbedWebsite() {
  // Make functions globally accessible
  window.addEmbedWebsiteElementToSlide = addEmbedWebsiteElementToSlide;
  window.updateExistingEmbedWebsiteElement = updateExistingEmbedWebsiteElement;

  // Volume control radio buttons
  const radioButtons = document.querySelectorAll('input[name="websiteVolume"]');
  radioButtons.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      if (
        window.selectedElementForUpdate &&
        window.selectedElementForUpdate.element
      ) {
        pushCurrentSlideState();
        window.selectedElementForUpdate.element.muted =
          event.target.value === "true";
        loadSlide(store.slides[store.currentSlideIndex]);
      }
    });
  });

  // "Save/Embed" button - ALWAYS creates a NEW element
  const saveBtn = document.getElementById("saveEmbedWebsiteBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      let url = document.getElementById("embedWebsiteUrl").value.trim();
      if (!url) {
        showToast(gettext("Please enter a URL."), "Warning");
        return;
      }

      // Add https:// if no protocol is specified
      if (!url.match(/^https?:\/\//i)) {
        url = "https://" + url;
      }

      // If URL is not in branchWebsites, add it to the list
      if (!window.branchWebsites.some((item) => item.url === url)) {
        try {
          await addWebsiteToList({ url });
          window.branchWebsites.push({ url });
        } catch (error) {
          console.error("Error adding website to list:", error);
          document.getElementById("embedWebsiteUrl").style.borderColor = "red";
          embedWebsiteUrlError.textContent = gettext("Invalid URL");
          return;
        }
      }

      addEmbedWebsiteElementToSlide(url);
      document.getElementById("embedWebsiteUrl").style.borderColor = "";
      embedWebsiteUrlError.textContent = "";

      // Close the modal
      const modal = bootstrap.Modal.getInstance(
        document.getElementById("embedWebsiteModal"),
      );
      if (modal) {
        modal.hide();
      }
    });
  }

  function isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (err) {
      return false;
    }
  }

  // "Update" button in toolbar - ONLY updates existing elements
  const updateBtn = document.getElementById("update-change-website-btn");
  if (updateBtn) {
    updateBtn.addEventListener("click", async () => {
      let url = document.getElementById("change-website-input").value.trim();
      if (!url) {
        showToast(gettext("Please enter a URL."), "Warning");
        return;
      }

      // Add https:// if no protocol is specified
      if (!url.match(/^https?:\/\//i)) {
        url = "https://" + url;
      }

      // Check if we have a selected element for update
      if (
        !window.selectedElementForUpdate ||
        !window.selectedElementForUpdate.element ||
        window.selectedElementForUpdate.element.type !== "embed-website"
      ) {
        showToast(
          gettext("Please select an embed website element to update first!"),
          "Warning",
        );
        return;
      }

      // If URL is not in branchWebsites, add it to the list
      if (
        !window.branchWebsites ||
        !window.branchWebsites.some((item) => item.url === url)
      ) {
        try {
          if (isValidUrl(url) === false) {
            showToast(gettext("Please enter a valid URL."), "Warning");
            return;
          }

          await addWebsiteToList({ url });
          if (!window.branchWebsites) window.branchWebsites = [];
          window.branchWebsites.push({ url });
        } catch (error) {
          console.error("Error adding website to list:", error);
          // Continue anyway - we can still update the element
        }
      }

      // Update the existing element
      updateExistingEmbedWebsiteElement(url);

      // Clear the input after successful update
      document.getElementById("change-website-input").value = "";
      showToast(gettext("Website URL updated successfully!"), "Success");
    });
  }
}
