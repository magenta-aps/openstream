// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "./style.scss";
import {
  translateHTML,
  fetchUserLangugage,
  gettext,
} from "../../utils/locales";
import {
  queryParams,
  selectedSubOrgID,
  parentOrgID,
  updateNavbarBranchName,
  updateNavbarUsername,
  makeActiveInNav,
  initSignOutButton,
  initOrgQueryParams,
} from "../../utils/utils.js";
import { getCurrentAspectRatio } from "./modules/core/addSlide.js";
import { initAddSlide } from "./modules/core/addSlide.js";
import { initContextMenu } from "./modules/core/contextMenu.js";
import { initDeleteElement } from "./modules/core/deleteElement.js";
import { initDeselectElement } from "./modules/core/deselectElement.js";
import { initDuplicateElement } from "./modules/core/duplicateElement.js";
import {
  initSlideshowPlayerMode,
  scaleAllSlides,
} from "./modules/core/renderSlide.js";
import {
  fetchSlideshow,
  initAutoSave,
} from "./modules/core/slideshowDataManager.js";
import { initTemplateEditor } from "./modules/core/templateDataManager.js";
import { initUndoRedo } from "./modules/core/undoRedo.js";
import { initVirtualPreviewResolution } from "./modules/core/virutalPreviewResolution.js";
import "./modules/core/keyboardShortcuts.js";
import { initSelectedElementBackgroundColor } from "./modules/element_formatting/backgroundColor.js";
import { initSelectedElementBorder } from "./modules/element_formatting/border.js";
import { initBorderRadius } from "./modules/element_formatting/borderRadius.js";
import { initBoxShadow } from "./modules/element_formatting/boxShadow.js";
import { initBlur } from "./modules/element_formatting/blur.js";
import { initGrayscale } from "./modules/element_formatting/grayscale.js";
import { initSelectedElementOffset } from "./modules/element_formatting/offset.js";
import { initOpacity } from "./modules/element_formatting/opacity.js";
import { initSelectedElementPadding } from "./modules/element_formatting/padding.js";
import { initRotate } from "./modules/element_formatting/rotate.js";
import { initMirror } from "./modules/element_formatting/mirror.js";
import { initSelectedElementScale } from "./modules/element_formatting/scale.js";
import { initPersistElement } from "./modules/element_formatting/persistElement.js";
import { initLockElement } from "./modules/element_formatting/lockElement.js";
import { initEmbedWebsite } from "./modules/elements/embedWebsiteElement.js";
import { initHtmlElement } from "./modules/elements/htmlElement.js";
import { addIframe, initIframe } from "./modules/elements/iframeElement.js";
import { initImageElement } from "./modules/elements/imageElement.js";
import { initShape } from "./modules/elements/shapeElement.js";
import { initBoxElement } from "./modules/elements/boxElement.js";
import { initTableElement } from "./modules/elements/tableElement.js";
import { initListElement } from "./modules/elements/listElement.js";
import { initTextbox } from "./modules/elements/textbox.js";
import { initVideoElement } from "./modules/elements/videoElement.js";
import { initPlaceholderElement } from "./modules/elements/placeholderElement.js";
import { initQRCodeElement } from "./modules/elements/qrcodeElement.js";
import { openSaveAsTemplateModal } from "./modules/modals/templatesModal.js";
import {
  initActivationModal,
  openActivationModal,
} from "./modules/modals/activationModal.js";
import {
  initMediaAlignment,
  initMuteButtons,
} from "./modules/utils/mediaElementUtils.js";
import { initSlideshowPlayer } from "./modules/core/slideshowPlayer.js";
import { exitPlayerMode } from "./modules/core/playerMode.js";
import { store } from "./modules/core/slideStore.js";
import {
  fetchAndInitializeFonts,
  waitForFontsReady,
} from "./modules/utils/fontUtils.js";
import { syncGridConfigWithCSS } from "./modules/config/gridConfig.js";
import { initStatusBar } from "./modules/utils/statusBar.js";
import initSlideElementsSidebar from "./modules/core/slideElementsSidebar.js";
import { initZoomController } from "./modules/utils/zoomController.js";
import * as bootstrap from "bootstrap";

await fetchAndInitializeFonts();
(async () => {
  await fetchUserLangugage();
  translateHTML();
})();

updateNavbarUsername();
updateNavbarBranchName();

// Sync grid configuration with CSS custom properties
syncGridConfigWithCSS();

// Initialize status bar
initStatusBar();

// Initialize zoom controller
initZoomController();

const initCommonEditorFeatures = () => {
  initTextbox();
  initUndoRedo();
  initDeleteElement();
  initDeselectElement();
  initImageElement();
  initVideoElement();
  initEmbedWebsite();
  initSelectedElementBackgroundColor();
  initSelectedElementBorder();
  initBorderRadius();
  initOpacity();
  initBoxShadow();
  initBlur();
  initGrayscale();
  initRotate();
  initMirror();
  initDuplicateElement();
  initVirtualPreviewResolution();
  initSelectedElementPadding();
  initSelectedElementOffset();
  initSelectedElementScale();
  initContextMenu();
  initIframe();
  initMediaAlignment();
  initMuteButtons();
  initShape();
  initBoxElement();
  initHtmlElement();
  initTableElement();
  initListElement();
  // Only initialize activation modal if the modal element exists
  if (document.getElementById("slideActivationModal")) {
    initActivationModal();
  }
  initPersistElement();
  initLockElement();
  initPlaceholderElement();
  initQRCodeElement();
};

if (queryParams.mode === "edit") {
  const button = document.querySelector("#aspect-ratio-container button");
  const aspectRatioSeparator = document.getElementById(
    "aspect-ratio-separator",
  );

  if (button) {
    button.remove();
  }

  if (aspectRatioSeparator) {
    aspectRatioSeparator.remove();
  }

  makeActiveInNav("/manage-content");
  initSlideshowPlayer();
  const navbar = document.getElementById("navbar");
  if (navbar) {
    navbar.style.display = "block";
  }
  // Ensure any player-mode is exited and editor chrome restored
  try {
    exitPlayerMode();
  } catch (e) {
    console.warn("exitPlayerMode failed or no player state:", e);
  }
  await fetchSlideshow(queryParams.id)
    .then(() => {
      initAutoSave(queryParams.id);
    })
    .catch((err) => console.error(err));
  initAddSlide();
  // init slide elements sidebar UI
  initSlideElementsSidebar();
  initCommonEditorFeatures();
}

if (queryParams.mode === "template_editor") {
  makeActiveInNav("/manage-templates?mode=template_editor");
  const navbar = document.getElementById("navbar");
  if (navbar) {
    navbar.style.display = "block";
  }
  try {
    exitPlayerMode();
  } catch (e) {
    console.warn("exitPlayerMode failed or no player state:", e);
  }
  //document.getElementById("change-slideshow-btn").classList.add("d-none");
  const orgId = selectedSubOrgID || parentOrgID;

  if (orgId) {
    await initTemplateEditor(orgId).catch((err) =>
      console.error(gettext("Error initializing template editor page:"), err),
    );
    initCommonEditorFeatures();
    // init slide elements sidebar UI
    initSlideElementsSidebar();
    const playBtn = document.getElementById("playBtn");
    if (playBtn) {
      playBtn.style.display = "none";
      playBtn.className = "d-none";
    }

    const addSlideBtn = document.getElementById("addSlideBtn");
    if (addSlideBtn) {
      addSlideBtn.style.display = "none";
    }
    const elementLinkDropdown = document.getElementById("elementLinkDropdown");
    if (elementLinkDropdown) {
      elementLinkDropdown.style.display = "none";
    }

    const addTemplateBtn = document.createElement("div");
    addTemplateBtn.innerHTML = `<button class="btn btn-primary" id="addTemplateBtn">${gettext(
      "+ Add Template",
    )}</button>`;

    addTemplateBtn.addEventListener("click", () => {
      openSaveAsTemplateModal(null, true);
    });

    const sectionButtons = document.querySelector(".section-buttons");
    if (sectionButtons) {
      sectionButtons.appendChild(addTemplateBtn);
    }
    const addSlideBtnToRemove = document.querySelector("#addSlideBtn");
    if (addSlideBtnToRemove) {
      addSlideBtnToRemove.remove();
    }
  } else {
    console.error(
      gettext(
        "Organisation ID (selectedSubOrgID or parentOrgID) not found. Cannot initialize template editor.",
      ),
    );
    const previewContainer =
      document.querySelector(".preview-column .preview-container") ||
      document.querySelector(".preview-container");
    if (previewContainer) {
      previewContainer.innerHTML = `<p class="text-danger text-center mt-5">${gettext(
        "Error: Organisation ID is missing. Cannot load template editor.",
      )}</p>`;
    }
  }
}

if (queryParams.mode === "suborg_templates") {
  makeActiveInNav("/select-sub-org");
  document.getElementById("slideshow-mode-text").innerText = gettext(
    "Suborganisation Templates",
  );
  const navbar = document.getElementById("navbar");
  if (navbar) {
    navbar.style.display = "block";
  }
  try {
    exitPlayerMode();
  } catch (e) {
    console.warn("exitPlayerMode failed or no player state:", e);
  }

  // Customize navbar for suborg templates - hide most nav links
  const navLinks = document.querySelectorAll(".navbar-nav .nav-link");
  navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    if (!href.includes("manage-templates") && !href.includes("documentation")) {
      link.parentElement.style.display = "none";
    }
  });

  const suborgId = queryParams.suborgId;

  if (suborgId) {
    // Fetch and display suborg name
    const { BASE_URL } = await import("../../utils/constants.js");
    const { token } = await import("../../utils/utils.js");

    try {
      const response = await fetch(
        `${BASE_URL}/api/suborganisations/${suborgId}/`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.ok) {
        const suborgData = await response.json();
        // Update the branch switcher to show suborg name instead
        const branchNameEl = document.getElementById("branch-name");
        if (branchNameEl) {
          branchNameEl.innerText = suborgData.name || "SubOrg";
        }
      }
    } catch (err) {
      console.error("Error fetching suborg data:", err);
    }

    // Import and initialize suborg template editor
    const { initSuborgTemplateEditor } = await import(
      "./modules/core/suborgTemplateDataManager.js"
    );

    // Load templates first (this also handles scaling)
    await initSuborgTemplateEditor(suborgId).catch((err) =>
      console.error(gettext("Error initializing suborg template editor:"), err),
    );

    // Then initialize common editor features
    initCommonEditorFeatures();
    initSlideElementsSidebar();

    // Hide unnecessary buttons
    const playBtn = document.getElementById("playBtn");
    if (playBtn) {
      playBtn.style.display = "none";
      playBtn.className = "d-none";
    }
    const addSlideBtn = document.getElementById("addSlideBtn");
    if (addSlideBtn) {
      addSlideBtn.style.display = "none";
    }
    const elementLinkDropdown = document.getElementById("elementLinkDropdown");
    if (elementLinkDropdown) {
      elementLinkDropdown.style.display = "none";
    }

    // Add "Create Template from Global" button
    const addTemplateBtn = document.createElement("div");
    addTemplateBtn.innerHTML = `<button class="btn btn-primary" id="addSuborgTemplateBtn">${gettext(
      "+ Create Template",
    )}</button>`;

    addTemplateBtn.addEventListener("click", () => {
      // Import and open modal for selecting global template
      import("./modules/modals/suborgTemplatesModal.js").then((module) => {
        module.openCreateSuborgTemplateModal(suborgId);
      });
    });

    const sectionButtons = document.querySelector(".section-buttons");
    if (sectionButtons) {
      sectionButtons.appendChild(addTemplateBtn);
    }
    const addSlideBtnToRemove = document.querySelector("#addSlideBtn");
    if (addSlideBtnToRemove) {
      addSlideBtnToRemove.remove();
    }
  } else {
    console.error(
      gettext(
        "SubOrganisation ID is missing. Cannot initialize suborg template editor.",
      ),
    );
    const previewContainer =
      document.querySelector(".preview-column .preview-container") ||
      document.querySelector(".preview-container");
    if (previewContainer) {
      previewContainer.innerHTML = `<p class="text-danger text-center mt-5">${gettext(
        "Error: SubOrganisation ID is missing. Cannot load template editor.",
      )}</p>`;
    }
  }
}

if (queryParams.mode === "slideshow-player") {
  initSlideshowPlayerMode();
  // Font loading is now handled inside _startSlideshowPlayer to ensure better timing
}

if (
  queryParams.mode !== "template_editor" &&
  queryParams.mode !== "suborg_templates"
) {
  const sideNavLink = document.querySelector('a[href="/manage-content/"]');
  if (sideNavLink) sideNavLink.classList.add("active");
} else if (
  queryParams.mode === "template_editor" ||
  queryParams.mode === "suborg_templates"
) {
  const sideNavLink = document.querySelector(
    'a[href="/edit-slideshow/?mode=template_editor"]',
  );
  if (sideNavLink) sideNavLink.classList.add("active");
}

function generalInit() {
  window.openActivationModal = openActivationModal;

  window.addIframe = addIframe;

  const container =
    document.querySelector(".preview-column .preview-container") ||
    document.querySelector(".preview-container");

  const resizeObserver = new ResizeObserver(() => {
    scaleAllSlides();
  });

  if (container) {
    resizeObserver.observe(container);
  } else {
    console.warn(gettext("Preview container not found for ResizeObserver."));
  }

  setTimeout(() => {
    const tooltipTriggerList = document.querySelectorAll(
      '[data-bs-toggle="tooltip"]',
    );
    window.tooltipList = [...tooltipTriggerList].map(
      (tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl),
    );
  }, 2000);
  initOrgQueryParams();
}

const signOutBtn = document.getElementById("signOutBtn");
if (signOutBtn) {
  signOutBtn.addEventListener("click", signOut);
}

initSignOutButton();
generalInit();
