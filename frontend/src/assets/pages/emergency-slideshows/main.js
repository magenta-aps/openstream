/* SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk> */
/* SPDX-License-Identifier: AGPL-3.0-only */
import * as bootstrap from "bootstrap";
import "./style.scss";
import {
    translateHTML,
    fetchUserLangugage,
    gettext,
} from "../../utils/locales";
import {
    autoHyphenate,
    genericFetch,
    initOrgUrlRouting,
    initSignOutButton,
    makeActiveInNav,
    parentOrgID,
    createUrl,
    selectedBranchID,
    showToast,
    updateNavbarBranchName,
    updateNavbarUsername,
} from "../../utils/utils";
import { BASE_URL } from "../../utils/constants";
import {
    DEFAULT_ASPECT_RATIO,
    DISPLAYABLE_ASPECT_RATIOS,
    getResolutionForAspectRatio,
} from "../../utils/availableAspectRatios";

const state = {
    slideshows: [],
    filteredSlideshows: [],
    groups: [],
    filteredGroups: [],
    emergencies: [],
    categories: [],
    tags: [],
    selectedGroupIds: new Set(),
    selectedSlideshowId: null,
    isSubmitting: false,
    selectedCreationAspectRatio: DEFAULT_ASPECT_RATIO,
    isCreatingSlideshow: false,
    lastCreatedSlideshowId: null,
};

const elements = {};

document.addEventListener("DOMContentLoaded", async () => {
    initOrgUrlRouting();
    initSignOutButton();
    updateNavbarUsername();
    updateNavbarBranchName();

    await fetchUserLangugage();
    translateHTML();
    makeActiveInNav("/emergency-slideshows");

    cacheElements();
    bindEventListeners();
    await bootstrapData();
});

function cacheElements() {
    elements.slideshowListContainer = document.getElementById("slideshow-list");
    elements.slideshowList = document.getElementById("slideshow-list-items");
    elements.slideshowLoadingText = document.getElementById("slideshow-loading-text");
    elements.slideshowSearch = document.getElementById("slideshow-search");
    elements.clearSlideshowFilter = document.getElementById("clear-slideshow-filter");
    elements.activateButton = document.getElementById("activate-emergency-btn");
    elements.feedback = document.getElementById("emergency-feedback");
    elements.groupsListContainer = document.getElementById("display-groups-list");
    elements.groupsList = document.getElementById("groups-list-items");
    elements.groupsSearch = document.getElementById("group-search");
    elements.groupsLoadingText = document.getElementById("groups-loading-text");
    elements.selectAllGroups = document.getElementById("select-all-groups");
    elements.clearAllGroups = document.getElementById("clear-all-groups");
    elements.emergencyList = document.getElementById("active-emergencies-list");
    elements.emergencyEmptyState = document.getElementById("active-emergencies-empty");
    elements.refreshSlideshows = document.getElementById("refresh-slideshows");
    elements.refreshEmergencies = document.getElementById("refresh-emergencies");
    elements.createSlideshowButton = document.getElementById("create-emergency-slideshow");
    elements.createModalEl = document.getElementById("createEmergencyModal");
    elements.createForm = document.getElementById("createEmergencyForm");
    elements.createNameInput = document.getElementById("createEmergencyName");
    elements.createCategorySelect = document.getElementById("createEmergencyCategory");
    elements.createTagsSelect = document.getElementById("createEmergencyTags");
    elements.createAspectRatioSelect = document.getElementById("createEmergencyAspectRatio");
    elements.createFormFeedback = document.getElementById("create-emergency-feedback");
    elements.createSubmitButton = document.getElementById("create-emergency-submit");
    elements.createSubmitSpinner = document.getElementById("create-emergency-spinner");
    if (elements.createModalEl) {
        elements.createModal = new bootstrap.Modal(elements.createModalEl);
    }
    elements.createdModalEl = document.getElementById(
        "emergencySlideshowCreatedModal",
    );
    if (elements.createdModalEl) {
        elements.createdModal = new bootstrap.Modal(elements.createdModalEl);
    }
    elements.createdSlideshowName = document.getElementById(
        "createdEmergencySlideshowName",
    );
    elements.openCreatedSlideshowButton = document.getElementById(
        "openEmergencySlideshowBtn",
    );
}

function bindEventListeners() {
    elements.slideshowList?.addEventListener("click", handleSlideshowListClick);
    elements.slideshowSearch?.addEventListener("input", handleSlideshowSearch);
    elements.clearSlideshowFilter?.addEventListener("click", () => {
        elements.slideshowSearch.value = "";
        handleSlideshowSearch();
    });
    elements.groupsSearch?.addEventListener("input", handleGroupSearch);
    elements.selectAllGroups?.addEventListener("click", (event) => {
        event.preventDefault();
        selectAllGroups();
    });
    elements.clearAllGroups?.addEventListener("click", (event) => {
        event.preventDefault();
        state.selectedGroupIds.clear();
        renderGroups();
    });
    elements.activateButton?.addEventListener("click", handleActivationSubmit);
    elements.refreshSlideshows?.addEventListener("click", async (event) => {
        event.preventDefault();
        await loadSlideshows(true);
    });
    elements.refreshEmergencies?.addEventListener("click", async (event) => {
        event.preventDefault();
        await loadEmergencies(true);
    });
    elements.emergencyList?.addEventListener("click", handleEmergencyActionClick);
    elements.createSlideshowButton?.addEventListener(
        "click",
        openCreateEmergencyModal,
    );
    elements.createForm?.addEventListener(
        "submit",
        handleCreateEmergencySubmit,
    );
    elements.createAspectRatioSelect?.addEventListener("change", (event) => {
        state.selectedCreationAspectRatio =
            event.target.value || DEFAULT_ASPECT_RATIO;
    });
    elements.openCreatedSlideshowButton?.addEventListener("click", () => {
        const slideshowId = parseInt(
            elements.openCreatedSlideshowButton?.dataset.slideshowId || "",
            10,
        );
        if (!Number.isNaN(slideshowId)) {
            openSlideshowEditor(slideshowId);
        }
    });
}

async function bootstrapData() {
    try {
        await Promise.all([loadSlideshows(), loadReferenceData()]);
        await loadGroups();
        await loadEmergencies();
    } catch (error) {
        console.error("Failed to initialize emergency slideshows page", error);
        showToast(extractErrorMessage(error), gettext("Error"));
    }
}

async function loadSlideshows(showToastOnSuccess = false) {
    if (!elements.slideshowList) {
        return;
    }
    showSlideshowsLoadingState(true);

    try {
        const result =
            (await genericFetch(
                `${BASE_URL}/api/manage_content/?includeSlideshowData=false&branch_id=${selectedBranchID}`,
                "GET",
            )) ?? [];
        state.slideshows = result.filter(
            (slideshow) =>
                slideshow.mode !== "interactive" &&
                Boolean(slideshow.is_emergency_slideshow),
        );
        state.filteredSlideshows = [...state.slideshows];
        syncSelectedSlideshow();
        renderSlideshows();
        if (showToastOnSuccess) {
            showToast(gettext("Slideshows refreshed"), gettext("Success"));
        }
    } catch (error) {
        console.error("Could not load slideshows", error);
        elements.slideshowList.innerHTML = `<p class="text-danger text-center my-4">${escapeHtml(
            extractErrorMessage(error),
        )}</p>`;
        state.selectedSlideshowId = null;
        showToast(extractErrorMessage(error), gettext("Error"));
    } finally {
        showSlideshowsLoadingState(false);
    }
}

async function loadGroups(showToastOnSuccess = false) {
    if (!elements.groupsList) {
        return;
    }
    showGroupsLoadingState(true);
    try {
        const result =
            (await genericFetch(
                `${BASE_URL}/api/display-website-groups/?branch_id=${selectedBranchID}`,
                "GET",
            )) ?? [];
        state.groups = result;
        state.filteredGroups = [...state.groups];
        renderGroups();
        if (showToastOnSuccess) {
            showToast(gettext("Display groups refreshed"), gettext("Success"));
        }
    } catch (error) {
        console.error("Could not load groups", error);
        elements.groupsList.innerHTML = `<p class="text-danger text-center my-4">${extractErrorMessage(
            error,
        )}</p>`;
        showToast(extractErrorMessage(error), gettext("Error"));
    } finally {
        showGroupsLoadingState(false);
    }
}

async function loadEmergencies(showToastOnSuccess = false) {
    if (!elements.emergencyList) {
        return;
    }

    if (!state.groups.length) {
        state.emergencies = [];
        renderEmergencies();
        return;
    }

    try {
        const groupIds = state.groups.map((group) => group.id);
        const params = new URLSearchParams();
        params.set("ids", groupIds.join(","));
        const result =
            (await genericFetch(
                `${BASE_URL}/api/emergency-slideshows/?${params.toString()}`,
                "GET",
            )) ?? [];
        state.emergencies = result;
        renderEmergencies();
        if (showToastOnSuccess) {
            showToast(gettext("Emergency list refreshed"), gettext("Success"));
        }
    } catch (error) {
        console.error("Could not load emergencies", error);
        elements.emergencyList.innerHTML = `<p class="text-danger text-center">${extractErrorMessage(
            error,
        )}</p>`;
        state.emergencies = [];
        toggleEmergencyEmptyState();
        showToast(extractErrorMessage(error), gettext("Error"));
    }
}

async function loadReferenceData() {
    if (!elements.createForm) {
        return;
    }
    try {
        const [categories = [], tags = []] = await Promise.all([
            genericFetch(
                `${BASE_URL}/api/categories/?organisation_id=${parentOrgID}`,
                "GET",
            ),
            genericFetch(
                `${BASE_URL}/api/tags/?organisation_id=${parentOrgID}`,
                "GET",
            ),
        ]);
        state.categories = Array.isArray(categories) ? categories : [];
        state.tags = Array.isArray(tags) ? tags : [];
        hydrateCreationFormOptions();
    } catch (error) {
        console.error("Could not load emergency creation metadata", error);
    }
}

function hydrateCreationFormOptions() {
    populateCategoryOptions();
    populateTagOptions();
    populateAspectRatioOptions();
}

function populateCategoryOptions() {
    if (!elements.createCategorySelect) {
        return;
    }
    elements.createCategorySelect.innerHTML = "";
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = gettext("(No Category)");
    elements.createCategorySelect.appendChild(noneOption);

    state.categories.forEach((category) => {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = category.name;
        elements.createCategorySelect.appendChild(option);
    });
}

function populateTagOptions() {
    if (!elements.createTagsSelect) {
        return;
    }
    elements.createTagsSelect.innerHTML = "";
    state.tags.forEach((tag) => {
        const option = document.createElement("option");
        option.value = tag.id;
        option.textContent = tag.name;
        elements.createTagsSelect.appendChild(option);
    });
}

function populateAspectRatioOptions() {
    if (!elements.createAspectRatioSelect) {
        return;
    }
    elements.createAspectRatioSelect.innerHTML = "";
    DISPLAYABLE_ASPECT_RATIOS.forEach((ratio) => {
        const option = document.createElement("option");
        option.value = ratio.value;
        option.textContent = ratio.label;
        if (ratio.value === state.selectedCreationAspectRatio) {
            option.selected = true;
        }
        elements.createAspectRatioSelect.appendChild(option);
    });
}

function openCreateEmergencyModal() {
    if (!elements.createModal) {
        return;
    }
    if (!state.categories.length || !state.tags.length) {
        loadReferenceData();
    }
    resetCreateForm();
    hydrateCreationFormOptions();
    elements.createModal.show();
}

function resetCreateForm() {
    state.selectedCreationAspectRatio = DEFAULT_ASPECT_RATIO;
    if (elements.createNameInput) {
        elements.createNameInput.value = "";
    }
    if (elements.createCategorySelect) {
        elements.createCategorySelect.value = "";
    }
    if (elements.createTagsSelect) {
        Array.from(elements.createTagsSelect.options).forEach((option) => {
            option.selected = false;
        });
    }
    if (elements.createAspectRatioSelect) {
        elements.createAspectRatioSelect.value = DEFAULT_ASPECT_RATIO;
    }
    hideCreateFormFeedback();
}

async function handleCreateEmergencySubmit(event) {
    event.preventDefault();
    if (state.isCreatingSlideshow) {
        return;
    }

    const name = elements.createNameInput?.value?.trim();
    if (!name) {
        showCreateFormFeedback(gettext("Please provide a slideshow name."));
        return;
    }

    const categoryValue = elements.createCategorySelect?.value;
    const categoryId = categoryValue ? parseInt(categoryValue, 10) : null;
    const tagIds = getSelectedTagIds();
    const aspectRatio =
        elements.createAspectRatioSelect?.value ||
        state.selectedCreationAspectRatio ||
        DEFAULT_ASPECT_RATIO;
    const { width, height } = getResolutionForAspectRatio(aspectRatio);

    const payload = {
        name,
        mode: "slideshow",
        preview_width: width,
        preview_height: height,
        is_emergency_slideshow: true,
    };

    if (categoryId) {
        payload.category_id = categoryId;
    }
    if (tagIds.length) {
        payload.tag_ids = tagIds;
    }

    hideCreateFormFeedback();
    setCreateSubmitting(true);
    try {
        const newSlideshow = await genericFetch(
            `${BASE_URL}/api/manage_content/?includeSlideshowData=false&branch_id=${selectedBranchID}`,
            "POST",
            payload,
        );
        showToast(gettext("Emergency slideshow created"), gettext("Success"));
        await loadSlideshows();
        if (newSlideshow?.id) {
            setSelectedSlideshow(newSlideshow.id);
        } else {
            syncSelectedSlideshow();
            renderSlideshows();
        }
        elements.createModal?.hide();
        if (newSlideshow?.id) {
            showEmergencyCreatedModal(newSlideshow);
        }
    } catch (error) {
        console.error("Failed to create emergency slideshow", error);
        showCreateFormFeedback(extractErrorMessage(error));
    } finally {
        setCreateSubmitting(false);
    }
}

function getSelectedTagIds() {
    if (!elements.createTagsSelect) {
        return [];
    }
    return Array.from(elements.createTagsSelect.selectedOptions || [])
        .map((option) => parseInt(option.value, 10))
        .filter((id) => !Number.isNaN(id));
}

function showCreateFormFeedback(message) {
    if (!elements.createFormFeedback) {
        return;
    }
    elements.createFormFeedback.textContent = message;
    elements.createFormFeedback.classList.remove("d-none");
}

function hideCreateFormFeedback() {
    elements.createFormFeedback?.classList.add("d-none");
}

function setCreateSubmitting(isSubmitting) {
    state.isCreatingSlideshow = isSubmitting;
    if (elements.createSubmitButton) {
        elements.createSubmitButton.disabled = isSubmitting;
    }
    elements.createSubmitSpinner?.classList.toggle("d-none", !isSubmitting);
}

function openSlideshowEditor(slideshowId) {
    if (!slideshowId) {
        return;
    }
    const url = createUrl(`/edit-content?id=${slideshowId}&mode=edit`, true, true);
    window.location.href = url;
}

function showEmergencyCreatedModal(slideshow) {
    if (!slideshow?.id) {
        return;
    }
    state.lastCreatedSlideshowId = slideshow.id;
    if (!elements.createdModal) {
        openSlideshowEditor(slideshow.id);
        return;
    }
    if (elements.createdSlideshowName) {
        elements.createdSlideshowName.textContent =
            slideshow.name || gettext("Untitled slideshow");
    }
    if (elements.openCreatedSlideshowButton) {
        elements.openCreatedSlideshowButton.dataset.slideshowId =
            slideshow.id;
    }
    elements.createdModal.show();
}

function renderSlideshows() {
    if (!elements.slideshowList) {
        return;
    }
    elements.slideshowList.innerHTML = "";
    elements.slideshowList.classList.add("slideshow-table");

    if (!state.filteredSlideshows.length) {
        elements.slideshowList.innerHTML = `<p class="text-muted text-center my-4">${gettext(
            "No slideshows match your search",
        )}</p>`;
        return;
    }



    state.filteredSlideshows.forEach((slideshow) => {
        const wrapper = document.createElement("div");
        wrapper.className = "slideshow-card-wrapper";

        const card = document.createElement("div");
        card.className = "slideshow-card border rounded-3 p-3 w-100";
        card.dataset.slideshowId = slideshow.id;
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        if (slideshow.id === state.selectedSlideshowId) {
            card.classList.add("is-selected");
        }

        const content = document.createElement("div");
        content.className = "slideshow-card-content";

        const textWrapper = document.createElement("div");
        textWrapper.className = "slideshow-card-text";
        textWrapper.innerHTML = `
            <span class="slideshow-card-name h6 mb-0">${autoHyphenate(
                slideshow?.name || gettext("Untitled slideshow"),
            )}</span>
        `;

        const metaWrapper = document.createElement("div");
        metaWrapper.className = "slideshow-card-meta";

        const ratioBadge = document.createElement("span");
        ratioBadge.className = "badge text-bg-light slideshow-card-ratio";
        ratioBadge.textContent = formatAspectRatio(slideshow) || gettext("No ratio");

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "btn btn-outline-primary btn-sm slideshow-card-edit ms-2";
        editButton.innerHTML = `
            <span class="material-symbols-outlined align-middle me-1" aria-hidden="true">edit</span>
            ${gettext("Edit")}
        `;
        editButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openSlideshowEditor(slideshow.id);
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "btn btn-outline-danger btn-sm slideshow-card-delete ms-2";
        deleteButton.innerHTML = `<span class="material-symbols-outlined align-middle me-1" aria-hidden="true">delete</span>${gettext("Delete")}`;
        deleteButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            deleteSlideshow(slideshow.id, deleteButton);
        });

        metaWrapper.appendChild(ratioBadge);
        metaWrapper.appendChild(editButton);
        metaWrapper.appendChild(deleteButton);

        content.appendChild(textWrapper);
        content.appendChild(metaWrapper);
        card.appendChild(content);

        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedSlideshow(slideshow.id);
            }
        });

        wrapper.appendChild(card);
        elements.slideshowList.appendChild(wrapper);
    });
}

function renderGroups() {
    if (!elements.groupsList) {
        return;
    }
    elements.groupsList.innerHTML = "";
    elements.groupsList.classList.add("groups-table");

    if (!state.filteredGroups.length) {
        elements.groupsList.innerHTML = `<p class="text-muted text-center my-4">${gettext(
            "No groups match your search",
        )}</p>`;
        return;
    }

    const header = document.createElement("div");
    header.className = "groups-table-header";
    header.innerHTML = `
        <span>${gettext("Group")}</span>
        <span class="text-end">${gettext("Aspect Ratio")}</span>
    `;
    elements.groupsList.appendChild(header);

    state.filteredGroups.forEach((group) => {
        const row = document.createElement("label");
        row.className = "groups-table-row border rounded-2 bg-body";
        row.dataset.groupId = group.id;

        const checkboxWrapper = document.createElement("span");
        checkboxWrapper.className = "groups-table-checkbox";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "form-check-input";
        input.checked = state.selectedGroupIds.has(group.id);

        checkboxWrapper.appendChild(input);

        const nameSpan = document.createElement("span");
        nameSpan.className = "fw-semibold text-truncate";
        const groupName = group?.name || gettext("Untitled group");
        nameSpan.innerHTML = autoHyphenate(groupName);
        nameSpan.title = groupName;

        const ratioSpan = document.createElement("span");
        ratioSpan.className = "badge text-bg-light text-uppercase text-end";
        ratioSpan.textContent = group.aspect_ratio || gettext("Default");

        const updateRowState = () => {
            row.classList.toggle("is-selected", input.checked);
        };

        updateRowState();

        input.addEventListener("change", () => {
            toggleGroupSelection(group.id, input.checked);
            updateRowState();
        });

        row.appendChild(checkboxWrapper);
        row.appendChild(nameSpan);
        row.appendChild(ratioSpan);

        elements.groupsList.appendChild(row);
    });
}

function renderEmergencies() {
    if (!elements.emergencyList) {
        return;
    }
    elements.emergencyList.innerHTML = "";

    if (!state.emergencies.length) {
        toggleEmergencyEmptyState(true);
        return;
    }

    toggleEmergencyEmptyState(false);

    const tableWrapper = document.createElement("div");
    tableWrapper.className = "table-responsive";

    const table = document.createElement("table");
    table.className = "table table-hover align-middle mb-0";

    const thead = document.createElement("thead");
    thead.innerHTML = `
        <tr>
            <th scope="col">${gettext("Slideshow")}</th>
            <th scope="col">${gettext("Groups")}</th>
            <th scope="col">${gettext("Status")}</th>
            <th scope="col" class="text-end">${gettext("Actions")}</th>
        </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    state.emergencies.forEach((emergency) => {
        const row = document.createElement("tr");

        const slideshowCell = document.createElement("td");
        slideshowCell.innerHTML = `
            <span class="fw-semibold">${autoHyphenate(
                emergency.slideshow?.name || gettext("Untitled slideshow"),
            )}</span>
        `;

        const groupsCell = document.createElement("td");
        const groupsWrapper = document.createElement("div");
        groupsWrapper.className = "emergency-table-groups";
        if (emergency.display_website_groups?.length) {
            emergency.display_website_groups.forEach((group) => {
                const badge = document.createElement("span");
                badge.className = "badge text-bg-light border";
                const groupName = group?.name || gettext("Untitled group");
                badge.innerHTML = autoHyphenate(groupName);
                badge.title = groupName;
                groupsWrapper.appendChild(badge);
            });
        } else {
            const emptyGroup = document.createElement("span");
            emptyGroup.className = "text-muted";
            emptyGroup.textContent = gettext("No groups selected");
            groupsWrapper.appendChild(emptyGroup);
        }
        groupsCell.appendChild(groupsWrapper);

        const statusCell = document.createElement("td");
        statusCell.className = "text-uppercase";
        const statusBadge = document.createElement("span");
        statusBadge.className = `badge ${
            emergency.is_active ? "text-bg-danger" : "text-bg-secondary"
        }`;
        statusBadge.textContent = emergency.is_active
            ? gettext("Active")
            : gettext("Inactive");
        statusCell.appendChild(statusBadge);

        const actionsCell = document.createElement("td");
        actionsCell.className = "text-end";
        const actionsWrapper = document.createElement("div");
        actionsWrapper.className = "d-inline-flex flex-wrap gap-2 justify-content-end";

        const toggleButton = document.createElement("button");
        toggleButton.className = `btn btn-sm ${
            emergency.is_active ? "btn-outline-secondary" : "btn-outline-success"
        }`;
        toggleButton.dataset.emergencyAction = "toggle";
        toggleButton.dataset.emergencyId = emergency.id;
        toggleButton.dataset.targetState = emergency.is_active ? "false" : "true";
        toggleButton.innerHTML = emergency.is_active
            ? `<span class="material-symbols-outlined align-middle me-1">notifications_off</span>${gettext("Deactivate")}`
            : `<span class="material-symbols-outlined align-middle me-1">notifications_active</span>${gettext("Activate")}`;

        const deleteButton = document.createElement("button");
        deleteButton.className = "btn btn-sm btn-outline-danger";
        deleteButton.dataset.emergencyAction = "delete";
        deleteButton.dataset.emergencyId = emergency.id;
        deleteButton.innerHTML = `<span class="material-symbols-outlined align-middle me-1">delete</span>${gettext("Delete")}`;

        const changeButton = document.createElement("button");
        changeButton.className = "btn btn-sm btn-outline-primary";
        changeButton.dataset.emergencyAction = "change";
        changeButton.dataset.emergencyId = emergency.id;
        changeButton.innerHTML = `<span class="material-symbols-outlined align-middle me-1">swap_horiz</span>${gettext("Change")}`;

        actionsWrapper.appendChild(toggleButton);
        actionsWrapper.appendChild(changeButton);
        actionsWrapper.appendChild(deleteButton);
        actionsCell.appendChild(actionsWrapper);

        row.appendChild(slideshowCell);
        row.appendChild(groupsCell);
        row.appendChild(statusCell);
        row.appendChild(actionsCell);

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    elements.emergencyList.appendChild(tableWrapper);
}

function formatAspectRatio(slideshow = {}) {
    if (slideshow.aspect_ratio) {
        return slideshow.aspect_ratio;
    }
    return "";
}

function handleSlideshowSearch() {
    const query = elements.slideshowSearch?.value?.trim().toLowerCase() || "";
    if (!query) {
        state.filteredSlideshows = [...state.slideshows];
    } else {
        state.filteredSlideshows = state.slideshows.filter((slideshow) =>
            [slideshow.name, slideshow.aspect_ratio]
                .filter(Boolean)
                .some((value) => value.toString().toLowerCase().includes(query)),
        );
    }
    syncSelectedSlideshow();
    renderSlideshows();
}

function handleGroupSearch() {
    const query = elements.groupsSearch?.value?.trim().toLowerCase() || "";
    if (!query) {
        state.filteredGroups = [...state.groups];
    } else {
        state.filteredGroups = state.groups.filter((group) =>
            [group.name, group.aspect_ratio]
                .filter(Boolean)
                .some((value) => value.toString().toLowerCase().includes(query)),
        );
    }
    renderGroups();
}

function selectAllGroups() {
    state.filteredGroups.forEach((group) => {
        state.selectedGroupIds.add(group.id);
    });
    renderGroups();
}

function toggleGroupSelection(groupId, isChecked) {
    if (isChecked) {
        state.selectedGroupIds.add(groupId);
    } else {
        state.selectedGroupIds.delete(groupId);
    }
}

function showGroupsLoadingState(isLoading) {
    if (!elements.groupsLoadingText || !elements.groupsList) {
        return;
    }
    elements.groupsLoadingText.classList.toggle("d-none", !isLoading);
    elements.groupsList.classList.toggle("d-none", isLoading);
    if (isLoading) {
        elements.groupsList.innerHTML = "";
    }
}

function showSlideshowsLoadingState(isLoading) {
    if (!elements.slideshowLoadingText || !elements.slideshowList) {
        return;
    }
    elements.slideshowLoadingText.classList.toggle("d-none", !isLoading);
    elements.slideshowList.classList.toggle("d-none", isLoading);
    if (isLoading) {
        elements.slideshowList.innerHTML = "";
    }
}

function toggleEmergencyEmptyState(forceEmpty = null) {
    const isEmpty = forceEmpty ?? state.emergencies.length === 0;
    elements.emergencyEmptyState?.classList.toggle("d-none", !isEmpty);
    elements.emergencyList?.classList.toggle("d-none", isEmpty);
}

async function handleActivationSubmit() {
    if (state.isSubmitting) {
        return;
    }
    const slideshowId = state.selectedSlideshowId;
    const groupIds = Array.from(state.selectedGroupIds);

    if (!slideshowId) {
        showFeedback(gettext("Please select a slideshow."));
        return;
    }
    if (!groupIds.length) {
        showFeedback(gettext("Please select at least one display group."));
        return;
    }

    hideFeedback();
    state.isSubmitting = true;
    elements.activateButton?.classList.add("disabled");

    try {
        const payload = {
            slideshow_id: slideshowId,
            display_website_group_ids: groupIds,
            is_active: true,
        };
        await genericFetch(
            `${BASE_URL}/api/emergency-slideshows/`,
            "POST",
            payload,
        );
        showToast(gettext("Emergency slideshow activated"), gettext("Success"));
        state.selectedGroupIds.clear();
        renderGroups();
        await loadEmergencies();
    } catch (error) {
        console.error("Failed to activate emergency slideshow", error);
        showFeedback(extractErrorMessage(error));
    } finally {
        state.isSubmitting = false;
        elements.activateButton?.classList.remove("disabled");
    }
}

function handleEmergencyActionClick(event) {
    const actionButton = event.target.closest("[data-emergency-action]");
    if (!actionButton) {
        return;
    }
    const emergencyId = parseInt(actionButton.dataset.emergencyId, 10);
    if (Number.isNaN(emergencyId)) {
        return;
    }

    const action = actionButton.dataset.emergencyAction;
    if (action === "toggle") {
        const targetState = actionButton.dataset.targetState === "true";
        toggleEmergencyState(emergencyId, targetState, actionButton);
    }
    if (action === "delete") {
        deleteEmergency(emergencyId, actionButton);
    }
    if (action === "change") {
        openChangeSlideshowModal(emergencyId, actionButton);
    }
}

function _buildChangeModal() {
    const existing = document.getElementById("changeEmergencySlideshowModal");
    if (existing) return existing;

    const modalWrap = document.createElement("div");
    modalWrap.id = "changeEmergencySlideshowModal";
    modalWrap.className = "modal fade";
    modalWrap.tabIndex = -1;
        modalWrap.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${gettext("Change slideshow")}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">${gettext("Select slideshow")}</label>
                                <select class="form-select" id="changeEmergencySlideshowSelect"></select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">${gettext("Select display groups")}</label>
                                <select class="form-select" id="changeEmergencyGroupsSelect" multiple size="8"></select>
                                <div class="form-text">${gettext("All selected groups must belong to the same branch.")}</div>
                            </div>
                            <div id="change-emergency-feedback" class="text-danger d-none"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${gettext("Cancel")}</button>
                            <button type="button" class="btn btn-primary" id="changeEmergencySubmit">${gettext("Save")}</button>
                        </div>
                    </div>
                </div>
        `;
    document.body.appendChild(modalWrap);
    return modalWrap;
}

function openChangeSlideshowModal(emergencyId, triggerButton) {
    const modalEl = _buildChangeModal();
    const bsModal = new bootstrap.Modal(modalEl);
    const select = modalEl.querySelector("#changeEmergencySlideshowSelect");
    const groupsSelect = modalEl.querySelector("#changeEmergencyGroupsSelect");
    const feedback = modalEl.querySelector("#change-emergency-feedback");
    const submit = modalEl.querySelector("#changeEmergencySubmit");

    // populate slideshow options
    select.innerHTML = "";
    const current = state.emergencies.find((e) => e.id === emergencyId)?.slideshow?.id;
    state.slideshows.forEach((ss) => {
        const opt = document.createElement("option");
        opt.value = ss.id;
        opt.textContent = ss.name || gettext("Untitled slideshow");
        if (ss.id === current) opt.selected = true;
        select.appendChild(opt);
    });

    // populate groups multi-select
    groupsSelect.innerHTML = "";
    const currentGroupIds = (state.emergencies.find((e) => e.id === emergencyId)?.display_website_groups || []).map((g) => g.id);
    state.groups.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = g.name || gettext("Untitled group");
        if (currentGroupIds.includes(g.id)) opt.selected = true;
        groupsSelect.appendChild(opt);
    });

    feedback.classList.add("d-none");

    const onSubmit = async () => {
        const val = select.value;
        const slideshowId = val ? parseInt(val, 10) : null;
        const selectedGroupIds = Array.from(groupsSelect.selectedOptions || []).map((o) => parseInt(o.value, 10)).filter((n) => !Number.isNaN(n));
        if (!selectedGroupIds.length) {
            feedback.textContent = gettext("Please select at least one display group.");
            feedback.classList.remove("d-none");
            return;
        }

        submit.disabled = true;
        try {
            await genericFetch(
                `${BASE_URL}/api/emergency-slideshows/${emergencyId}/`,
                "PATCH",
                { slideshow_id: slideshowId, display_website_group_ids: selectedGroupIds },
            );
            showToast(gettext("Emergency slideshow updated"), gettext("Success"));
            bsModal.hide();
            await loadEmergencies();
        } catch (err) {
            console.error("Failed to change emergency slideshow", err);
            feedback.textContent = extractErrorMessage(err);
            feedback.classList.remove("d-none");
        } finally {
            submit.disabled = false;
        }
    };

    submit.onclick = onSubmit;

    bsModal.show();
}

async function toggleEmergencyState(emergencyId, nextState, button) {
    button?.classList.add("disabled");
    try {
        await genericFetch(
            `${BASE_URL}/api/emergency-slideshows/${emergencyId}/`,
            "PATCH",
            { is_active: nextState },
        );
        showToast(
            nextState
                ? gettext("Emergency slideshow activated")
                : gettext("Emergency slideshow deactivated"),
            gettext("Success"),
        );
        await loadEmergencies();
    } catch (error) {
        console.error("Failed to toggle emergency slideshow", error);
        showToast(extractErrorMessage(error), gettext("Error"));
    } finally {
        button?.classList.remove("disabled");
    }
}

async function deleteEmergency(emergencyId, button) {
    if (!window.confirm(gettext("Remove this emergency slideshow?"))) {
        return;
    }
    button?.classList.add("disabled");
    try {
        await genericFetch(
            `${BASE_URL}/api/emergency-slideshows/${emergencyId}/`,
            "DELETE",
        );
        showToast(gettext("Emergency slideshow removed"), gettext("Success"));
        await loadEmergencies();
    } catch (error) {
        console.error("Failed to delete emergency slideshow", error);
        showToast(extractErrorMessage(error), gettext("Error"));
    } finally {
        button?.classList.remove("disabled");
    }
}

async function deleteSlideshow(slideshowId, button) {
    if (!window.confirm(gettext("Delete this slideshow?"))) {
        return;
    }
    button?.classList.add("disabled");
    try {
        await genericFetch(
            `${BASE_URL}/api/manage_content/${slideshowId}/?branch_id=${selectedBranchID}`,
            "DELETE",
        );
        showToast(gettext("Slideshow removed"), gettext("Success"));
        await loadSlideshows();
    } catch (error) {
        console.error("Failed to delete slideshow", error);
        showToast(extractErrorMessage(error), gettext("Error"));
    } finally {
        button?.classList.remove("disabled");
    }
}

function showFeedback(message) {
    if (!elements.feedback) {
        return;
    }
    elements.feedback.textContent = message || gettext("An unknown error occurred.");
    elements.feedback.classList.remove("d-none");
}

function hideFeedback() {
    elements.feedback?.classList.add("d-none");
}

function extractErrorMessage(error) {
    if (!error) {
        return gettext("Unexpected error");
    }
    if (typeof error === "string") {
        return error;
    }
    if (error.detail) {
        return error.detail;
    }
    if (error.message) {
        return error.message;
    }
    return gettext("Unexpected error");
}

function escapeHtml(text) {
    if (!text) {
        return "";
    }
    return text.replace(/[&<>"']/g, (char) => {
        const map = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        };
        return map[char] || char;
    });
}

function handleSlideshowListClick(event) {
    const card = event.target.closest("[data-slideshow-id]");
    if (!card) {
        return;
    }
    const slideshowId = parseInt(card.dataset.slideshowId, 10);
    if (Number.isNaN(slideshowId)) {
        return;
    }
    setSelectedSlideshow(slideshowId);
}

function setSelectedSlideshow(slideshowId) {
    if (state.selectedSlideshowId === slideshowId) {
        return;
    }
    state.selectedSlideshowId = slideshowId;
    renderSlideshows();
}

function syncSelectedSlideshow() {
    if (!state.filteredSlideshows.length) {
        state.selectedSlideshowId = null;
        return;
    }
    const stillVisible = state.filteredSlideshows.some(
        (slideshow) => slideshow.id === state.selectedSlideshowId,
    );
    if (!stillVisible) {
        state.selectedSlideshowId = state.filteredSlideshows[0].id;
    }
}
