// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import * as bootstrap from "bootstrap";
import { gettext } from "../../../../utils/locales.js";
import {
  DISPLAYABLE_ASPECT_RATIOS,
  DEFAULT_ASPECT_RATIO,
} from "../../../../utils/availableAspectRatios.js";
import { showToast } from "../../../../utils/utils.js";
import { createGlobalTemplate } from "../core/globalTemplateDataManager.js";
import { store } from "../core/slideStore.js";

let modalEl = null;
let modalInstance = null;
let nameInput = null;
let aspectRatioSelect = null;
let confirmBtn = null;
let isInitialized = false;

function ensureModalReferences() {
  if (modalEl) {
    return true;
  }
  modalEl = document.getElementById("createGlobalTemplateModal");
  if (!modalEl) {
    return false;
  }
  modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
  nameInput = document.getElementById("globalTemplateNameInput");
  aspectRatioSelect = document.getElementById(
    "globalTemplateAspectRatioSelect",
  );
  confirmBtn = document.getElementById("confirmCreateGlobalTemplateBtn");
  return true;
}

function populateAspectRatioOptions() {
  if (!aspectRatioSelect) {
    return;
  }
  aspectRatioSelect.innerHTML = "";
  DISPLAYABLE_ASPECT_RATIOS.forEach((ratio) => {
    const option = document.createElement("option");
    option.value = ratio.value;
    option.textContent = ratio.label;
    if (ratio.value === DEFAULT_ASPECT_RATIO) {
      option.selected = true;
    }
    aspectRatioSelect.appendChild(option);
  });
}

function resolveDefaultAspectRatio() {
  const activeSlide =
    store.currentSlideIndex > -1
      ? store.slides[store.currentSlideIndex]
      : null;
  const fallbackSlide = store.slides?.[0];
  return (
    activeSlide?.aspect_ratio ||
    fallbackSlide?.aspect_ratio ||
    DEFAULT_ASPECT_RATIO
  );
}

function resetModalState() {
  if (!nameInput || !aspectRatioSelect) {
    return;
  }
  nameInput.value = gettext("New Global Template");
  const preferredRatio = resolveDefaultAspectRatio();
  const optionExists = Array.from(aspectRatioSelect.options).some(
    (option) => option.value === preferredRatio,
  );
  aspectRatioSelect.value = optionExists
    ? preferredRatio
    : DEFAULT_ASPECT_RATIO;
  nameInput.classList.remove("is-invalid");
}

async function handleConfirmClick() {
  if (!confirmBtn || !nameInput || !aspectRatioSelect) {
    return;
  }

  const trimmedName = nameInput.value.trim();
  if (!trimmedName) {
    nameInput.classList.add("is-invalid");
    nameInput.focus();
    showToast(gettext("Please provide a template name."), "Warning");
    return;
  }
  nameInput.classList.remove("is-invalid");

  const selectedRatio =
    aspectRatioSelect.value || DEFAULT_ASPECT_RATIO;

  const originalLabel = confirmBtn.innerHTML;
  confirmBtn.disabled = true;
  confirmBtn.innerHTML =
    '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' +
    gettext("Creating...");

  try {
    await createGlobalTemplate({
      name: trimmedName,
      aspectRatio: selectedRatio,
    });
    modalInstance?.hide();
  } catch (err) {
    console.error("Global template creation failed", err);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = originalLabel;
  }
}

export function initGlobalTemplateCreationModal() {
  if (!ensureModalReferences()) {
    return;
  }
  if (isInitialized) {
    return;
  }

  populateAspectRatioOptions();
  modalEl.addEventListener("show.bs.modal", resetModalState);
  confirmBtn?.addEventListener("click", handleConfirmClick);
  isInitialized = true;
}

export function openGlobalTemplateCreationModal() {
  if (!ensureModalReferences()) {
    console.warn("Global template creation modal is not present in DOM.");
    return;
  }
  if (!isInitialized) {
    initGlobalTemplateCreationModal();
  }
  resetModalState();
  modalInstance?.show();
}
