// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import * as bootstrap from "bootstrap";
import "./style.scss";
import {
  translateHTML,
  gettext,
  fetchUserLangugage,
} from "../../utils/locales";
import { showToast } from "../../utils/utils";
import { token } from "../../utils/utils";
import { myUserId } from "../../utils/utils";
import { signOut } from "../../utils/utils";
import { validateToken } from "../../utils/utils";
import { BASE_URL } from "../../utils/constants";
import { makeActiveInNav } from "../../utils/utils";
import { updateNavbarUsername } from "../../utils/utils";
import { setupDeleteConfirmation } from "../../utils/utils";

let subOrgsData = [];
let isActingUserOrgAdmin = false;
let currentSelectedUserId = null;
let isSuborgAdmin = false;

// Helper function to filter out suborg_templates branches (magic branches used for template management)
function filterVisibleBranches(branches) {
  return branches.filter((branch) => !branch.name.includes("suborg_templates"));
}

function showAddSuborgModal() {
  document.getElementById("suborgNameInput").value = "";
  const modal = new bootstrap.Modal(document.getElementById("addSuborgModal"));
  modal.show();
}

async function createSuborg(orgId, suborgName) {
  try {
    const resp = await fetch(`${BASE_URL}/api/suborganisations/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        organisation_id: orgId,
        name: suborgName,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      showToast(
        gettext("Error creating suborg: ") + JSON.stringify(err),
        "Error",
      );
      return null;
    }
    return await resp.json();
  } catch (err) {
    showToast(gettext("Error creating suborg: ") + err, "Error");
    return null;
  }
}

async function onSubmitAddSuborg() {
  const orgId = localStorage.getItem("parentOrgID");
  if (!orgId) {
    showToast(gettext("No organisation ID in localStorage!", "Error"));
    return;
  }
  const suborgName = document.getElementById("suborgNameInput").value.trim();
  if (!suborgName) {
    showToast(gettext("Please enter a suborg name."), "Warning");
    return;
  }
  const createdSuborg = await createSuborg(orgId, suborgName);
  if (createdSuborg) {
    showToast(gettext("Suborganisation created successfully!"), "Success");
    // Close the modal after successful creation
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("addSuborgModal"),
    );
    if (modal) {
      modal.hide();
    }
    fetchSubOrgs();
  }
}

function showAddBranchModalFor(suborgId) {
  document.getElementById("branchNameInput").value = "";
  document.getElementById("selectedSuborgIdForBranch").value = suborgId;
  const modal = new bootstrap.Modal(document.getElementById("addBranchModal"));
  modal.show();
}

async function createBranch(suborgId, branchName) {
  try {
    const resp = await fetch(
      `${BASE_URL}/api/branches/?suborg_id=${suborgId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: branchName,
        }),
      },
    );
    if (!resp.ok) {
      const err = await resp.json();
      showToast(
        gettext("Error creating branch: ") + JSON.stringify(err),
        "Error",
      );
      return null;
    }
    return await resp.json();
  } catch (err) {
    showToast(gettext("Error creating branch: ") + err, "Error");
    return null;
  }
}

async function onSubmitAddBranch() {
  const suborgId = document.getElementById("selectedSuborgIdForBranch").value;
  if (!suborgId) {
    showToast(gettext("No suborg selected for branch creation!"), "Error");
    return;
  }
  const branchName = document.getElementById("branchNameInput").value.trim();
  if (!branchName) {
    showToast(gettext("Please enter a branch name."), "Warning");
    return;
  }
  const createdBranch = await createBranch(suborgId, branchName);
  if (createdBranch) {
    showToast(gettext("Branch created successfully!"), "Success");
    // Close the modal after successful creation
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("addBranchModal"),
    );
    if (modal) {
      modal.hide();
    }
    fetchSubOrgs();
  }
}

async function deleteBranch(branchObj) {
  // Set up the delete branch modal
  const messageEl = document.getElementById("deleteBranchMessage");
  const textToTypeEl = document.getElementById("deleteBranchTextToType");

  // Store branch info
  document.getElementById("deleteBranchId").value = branchObj.id;
  document.getElementById("deleteBranchName").value = branchObj.name;

  // Set up modal content
  const requiredText = `${gettext("Delete branch")} ${branchObj.name}`;
  messageEl.textContent = `${gettext(
    "Are you sure you want to delete branch",
  )} '${branchObj.name}'?`;
  textToTypeEl.textContent = requiredText;

  // Use the utility function for delete confirmation setup
  setupDeleteConfirmation(
    "deleteBranchInput",
    "deleteBranchConfirmBtn",
    "deleteBranchError",
    "deleteBranchTextToType",
    requiredText,
  );

  // Show modal
  const modal = new bootstrap.Modal(
    document.getElementById("deleteBranchModal"),
  );
  modal.show();

  // Focus input after modal is shown
  setTimeout(() => document.getElementById("deleteBranchInput").focus(), 200);
}

function showAddUserModal() {
  // Reset all form fields
  document.getElementById("userRoleSelect").value = "";
  document.getElementById("newUserUsername").value = "";
  document.getElementById("userEmailInput").value = "";
  document.getElementById("userPasswordInput").value = "";
  document.getElementById("userFirstNameInput").value = "";
  document.getElementById("userLastNameInput").value = "";
  document.getElementById("userLanguageSelect").value = "en"; // Default to English

  // Hide all conditional dropdowns initially
  document.getElementById("suborgDropdownContainer").style.display = "none";
  document.getElementById("branchDropdownContainer").style.display = "none";

  // Initialize form validation state
  validateCreateUserForm();

  const modal = new bootstrap.Modal(document.getElementById("addUserModal"));
  modal.show();

  // Initialize tooltips after the modal is shown
  setTimeout(() => {
    const tooltipTriggerList = document.querySelectorAll(
      '[data-bs-toggle="tooltip"]',
    );
    const tooltipList = [...tooltipTriggerList].map(
      (tooltipTriggerEl) =>
        new bootstrap.Tooltip(tooltipTriggerEl, {
          boundary: document.body,
        }),
    );
  }, 200);

  // Populate suborg select with disabled placeholder
  const subSelect = document.getElementById("suborgSelect");
  subSelect.innerHTML = `<option disabled selected value="">-- ${gettext(
    "Select a Suborganisation",
  )} --</option>`;

  // Filter subOrgsData to only show suborgs from the current organization
  const currentOrgId = localStorage.getItem("parentOrgID");
  const filteredSubOrgs = currentOrgId
    ? subOrgsData.filter((s) => String(s.organisation) === String(currentOrgId))
    : subOrgsData;

  filteredSubOrgs.forEach((s) => {
    // Don't allow selecting "Global" suborganizations
    if (s.name !== "Global") {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      subSelect.appendChild(opt);
    }
  });

  // Reset branch select with disabled placeholder
  const branchSelect = document.getElementById("branchSelect");
  branchSelect.innerHTML = `<option disabled selected value="">-- ${gettext(
    "Select a Branch",
  )} --</option>`;
}

function onUserRoleChange(e) {
  const role = e.target.value;
  const suborgDropdown = document.getElementById("suborgDropdownContainer");
  const branchDropdown = document.getElementById("branchDropdownContainer");

  // Reset dependent dropdowns
  document.getElementById("suborgSelect").value = "";
  document.getElementById("branchSelect").innerHTML =
    `<option disabled selected value="">-- ${gettext(
      "Select a Branch",
    )} --</option>`;

  if (role === "org_admin") {
    // Organisation admin - no other dropdowns needed
    suborgDropdown.style.display = "none";
    branchDropdown.style.display = "none";
  } else if (role === "suborg_admin") {
    // Suborganisation admin - only suborg dropdown needed
    suborgDropdown.style.display = "flex";
    branchDropdown.style.display = "none";
  } else if (role === "employee") {
    // Employee - both suborg and branch dropdowns needed
    suborgDropdown.style.display = "flex";
    branchDropdown.style.display = "flex";
  } else {
    // No role selected - hide all
    suborgDropdown.style.display = "none";
    branchDropdown.style.display = "none";
  }

  // Revalidate form
  validateCreateUserForm();
}

function showManageUsersModal() {
  document.getElementById("selectedUserDetails").style.display = "none";
  document.getElementById("userListContainer").innerHTML = "";
  const modal = new bootstrap.Modal(
    document.getElementById("manageUsersModal"),
  );
  modal.show();
  const orgId = localStorage.getItem("parentOrgID");
  if (!orgId) {
    showToast(gettext("No org ID in localStorage!", "Warning"));
    return;
  }
  fetchOrgUsers(orgId);
}

async function fetchOrgUsers(orgId) {
  try {
    const resp = await fetch(`${BASE_URL}/api/organisations/${orgId}/users/`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      console.error(gettext("Failed to fetch org users:"), resp.status);
      return;
    }
    const users = await resp.json();

    // For each user, fetch their membership details
    const userPromises = users.map(async (user) => {
      const membershipResp = await fetch(
        `${BASE_URL}/api/memberships/?user=${user.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!membershipResp.ok) {
        console.error(gettext("Failed to fetch memberships for user"), user.id);
        return { ...user, role: null };
      }
      const memberships = await membershipResp.json();
      const orgMembership = memberships.find(
        (m) => String(m.organisation) === String(orgId),
      );
      return { ...user, role: orgMembership ? orgMembership.role : null };
    });

    const usersWithRoles = await Promise.all(userPromises);

    const orgAdmins = usersWithRoles.filter((u) => u.role === "org_admin");
    const normalUsers = usersWithRoles.filter((u) => u.role !== "org_admin");

    const container = document.getElementById("userListContainer");
    container.innerHTML = "";

    if (orgAdmins.length > 0) {
      const header = document.createElement("div");
      header.className = "list-group-item bg-light text-dark fw-bold";
      header.textContent = gettext("Organisation Admins");
      container.appendChild(header);
      orgAdmins.forEach((u) => {
        const item = document.createElement("button");
        item.className = "list-group-item list-group-item-action";
        item.textContent = u.username;
        item.addEventListener("click", () => {
          currentSelectedUserId = u.id;
          displayUserDetails(u);
          const items = document.querySelectorAll(
            "#userListContainer button.list-group-item-action",
          );
          items.forEach((btn) => btn.classList.remove("active"));
          item.classList.add("active");
        });
        container.appendChild(item);
      });
    }

    if (orgAdmins.length > 0 && normalUsers.length > 0) {
      const divider = document.createElement("div");
      divider.className =
        "list-group-item bg-light text-dark text-center fw-bold";
      divider.textContent = gettext("Users");
      container.appendChild(divider);
    }

    normalUsers.forEach((u) => {
      const item = document.createElement("button");
      item.className = "list-group-item list-group-item-action";
      item.textContent = u.username;
      item.addEventListener("click", () => {
        currentSelectedUserId = u.id;
        displayUserDetails(u);
        const items = document.querySelectorAll(
          "#userListContainer button.list-group-item-action",
        );
        items.forEach((btn) => btn.classList.remove("active"));
        item.classList.add("active");
      });
      container.appendChild(item);
    });
  } catch (err) {
    console.error("Error fetching org users:", err);
  }
}

function displayUserDetails(userObj) {
  document.getElementById("selectedUserDetails").style.display = "block";
  document.getElementById("detailUsername").textContent = userObj.username;
  document.getElementById("detailEmail").textContent = userObj.email;
  const addSuborgMembershipContainer = document.getElementById(
    "addSuborgMembershipContainer",
  );
  if (isActingUserOrgAdmin && String(userObj.id) === String(myUserId)) {
    addSuborgMembershipContainer.style.display = "none";
  } else {
    addSuborgMembershipContainer.style.display = "block";
    // Initialize branch dropdown based on current role
    const roleVal = document.getElementById("suborgRoleManage").value;
    const branchSelectManage = document.getElementById("branchSelectManage");
    if (roleVal === "employee") {
      branchSelectManage.style.display = "block";
      populateBranchSelectManage();
    } else {
      branchSelectManage.style.display = "none";
    }
  }
  const deleteUserBtn = document.getElementById("deleteUserBtn");
  if (isActingUserOrgAdmin && String(userObj.id) !== String(myUserId)) {
    deleteUserBtn.style.display = "inline-block";
    deleteUserBtn.onclick = () => confirmDeleteUser(userObj);
  } else {
    deleteUserBtn.style.display = "none";
    deleteUserBtn.onclick = null;
  }
  fetchUserMemberships(userObj.id);
}

async function confirmDeleteUser(userObj) {
  // Set up the delete user modal
  const messageEl = document.getElementById("deleteUserMessage");
  const textToTypeEl = document.getElementById("deleteUserTextToType");

  // Store user info
  document.getElementById("deleteUserId").value = userObj.id;
  document.getElementById("deleteUserName").value = userObj.username;

  // Set up modal content
  const requiredText = `${gettext("Remove")} ${userObj.username}`;
  messageEl.textContent = `${gettext(
    "Are you sure you want to remove user",
  )} '${userObj.username}' ${gettext("from the organization")}?`;
  textToTypeEl.textContent = requiredText;

  // Use the utility function for delete confirmation setup
  setupDeleteConfirmation(
    "deleteUserInput",
    "deleteUserConfirmBtn",
    "deleteUserError",
    "deleteUserTextToType",
    requiredText,
  );

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById("deleteUserModal"));
  modal.show();

  // Focus input after modal is shown
  setTimeout(() => document.getElementById("deleteUserInput").focus(), 200);
}

async function fetchUserMemberships(userId) {
  try {
    const resp = await fetch(`${BASE_URL}/api/memberships/?user=${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      console.error("Failed to fetch user memberships:", resp.status);
      return;
    }
    const memberships = await resp.json();
    const container = document.getElementById("membershipListContainer");
    container.innerHTML = "";
    const orgAdminMemberships = memberships.filter(
      (m) => m.role === "org_admin",
    );
    if (orgAdminMemberships.length > 0) {
      container.innerHTML = `<div class="fw-bold mt-2">${gettext(
        "Organisation Admin",
      )}</div>`;
      document.getElementById("addSuborgMembershipContainer").style.display =
        "none";
      return;
    } else {
      document.getElementById("addSuborgMembershipContainer").style.display =
        "block";
    }
    if (memberships.length > 0) {
      memberships.forEach((m) => {
        const row = document.createElement("div");
        row.className =
          "d-flex justify-content-between align-items-center mb-1 border-bottom border p-2 bg-light rounded";
        row.style.borderColor = "darkgrey";
        let displayText = "";
        displayText += m.suborganisation_name
          ? m.suborganisation_name
          : gettext("No Suborganisation");
        displayText += " - " + gettext(m.role);
        if (m.role === "employee" && m.branch_name) {
          displayText += " - " + m.branch_name;
        }
        row.innerHTML = `
          <span>${displayText}</span>
          <button class="btn btn-sm btn-warning d-flex align-items-center"><span class="material-symbols-outlined">
cancel
</span>&nbsp;${gettext("Remove Access")}</button>
        `;
        row.querySelector("button").addEventListener("click", () => {
          removeMembership(m.id, userId);
        });
        container.appendChild(row);
      });
    } else {
      const noMembershipRow = document.createElement("div");
      noMembershipRow.className = "text-muted";
      noMembershipRow.textContent = "No memberships found.";
      container.appendChild(noMembershipRow);
    }
    const subSelect = document.getElementById("suborgSelectManage");
    subSelect.innerHTML = `<option disabled selected value="">-- ${gettext(
      "Select a Suborganisation",
    )} --</option>`;

    // Filter subOrgsData to only show suborgs from the current organization
    const currentOrgId = localStorage.getItem("parentOrgID");
    const filteredSubOrgs = currentOrgId
      ? subOrgsData.filter(
          (s) => String(s.organisation) === String(currentOrgId),
        )
      : subOrgsData;

    filteredSubOrgs.forEach((s) => {
      // Allow the suborg if the user has no membership at all
      // OR if the user has an employee membership (and thus may add another branch)
      let membershipForSuborg = memberships.filter(
        (m) => String(m.suborganisation) === String(s.id),
      );
      let allowOption =
        membershipForSuborg.length === 0 ||
        membershipForSuborg.every((m) => m.role === "employee");

      // Don't allow selecting "Global" suborganizations
      if (allowOption && s.name !== "Global") {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        subSelect.appendChild(opt);
      }
    });
  } catch (error) {
    console.error(gettext("Error fetching memberships:"), error);
  }
}

async function removeMembership(membershipId, userId) {
  try {
    const resp = await fetch(`${BASE_URL}/api/memberships/${membershipId}/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      fetchUserMemberships(userId);
    } else {
      console.error(
        gettext("Failed to remove membership, status:"),
        resp.status,
      );
    }
  } catch (err) {
    console.error(gettext("Error removing membership:"), err);
  }
}

function populateBranchSelectManage() {
  const chosenSuborgId = document.getElementById("suborgSelectManage").value;
  const branchSelectManage = document.getElementById("branchSelectManage");
  branchSelectManage.innerHTML = `<option disabled selected value="">-- ${gettext(
    "Select a Branch",
  )} --</option>`;
  const suborgObj = subOrgsData.find(
    (s) => String(s.id) === String(chosenSuborgId),
  );
  if (!suborgObj || !suborgObj.branches) return;
  filterVisibleBranches(suborgObj.branches).forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.name;
    branchSelectManage.appendChild(opt);
  });
}

async function fetchSubOrgs() {
  try {
    const response = await fetch(`${BASE_URL}/api/user/suborganisations/`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      console.error(
        gettext("Failed to fetch suborganisations"),
        response.status,
      );
      return;
    }
    const data = await response.json();

    // Get the locale from the global variable set in base.html
    const locale = document.documentElement.lang;

    // 1. Sort the main array by the 'name' property
    data.sort((a, b) => a.name.localeCompare(b.name, locale));

    // 2. Sort the nested 'branches' array in each object
    data.forEach((item) => {
      if (item.branches && item.branches.length > 0) {
        item.branches.sort((a, b) => a.name.localeCompare(b.name, locale));
      }
    });

    if (data.length === 1) {
      localStorage.setItem("parentOrgID", data[0].organisation);
      localStorage.setItem("parentOrgName", data[0].organisation_name);
    }

    isActingUserOrgAdmin = data.some((d) => d.user_role === "org_admin");

    data.forEach((d) => {
      if (d.user_role === "suborg_admin") {
        isSuborgAdmin = true;
      }
    });

    let isAnyTypeOfAdmin = isActingUserOrgAdmin || isSuborgAdmin;

    if (isActingUserOrgAdmin) {
      // Only org admins can see manage users buttons and add suborg button
      document.getElementById(
        "manageUsersDropdown",
      ).parentElement.style.display = "block";
      document.getElementById("add-suborg-btn").style.display = "inline-block";
    } else {
      // Hide manage users buttons for suborg admins and other users
      document.getElementById(
        "manageUsersDropdown",
      ).parentElement.style.display = "none";
      document.getElementById("add-suborg-btn").style.display = "none";
    }
    subOrgsData = data;

    renderSuborgsAndBranches(data, isAnyTypeOfAdmin);
  } catch (error) {
    console.error(gettext("Error fetching suborganisations:"), error);
  }
}

function renderSuborgsAndBranches(suborgList, isAnyTypeOfAdmin) {
  const container = document.getElementById("suborgAccordion");
  container.innerHTML = "";

  // Remove any existing Global Settings button to prevent duplication
  const existingGlobalButton = document.querySelector(".global-settings-btn");
  if (existingGlobalButton) {
    existingGlobalButton.remove();
  }

  let nrOfSubOrgs = null;

  suborgList.forEach((suborg) => {
    nrOfSubOrgs += filterVisibleBranches(suborg.branches).length;
  });

  if (nrOfSubOrgs === 1 && !isAnyTypeOfAdmin) {
    let visibleBranches = filterVisibleBranches(suborgList[0].branches);
    let branch = visibleBranches[0];
    selectBranch(
      branch.id,
      branch.name,
      suborgList[0].id,
      suborgList[0].name,
      suborgList[0].organisation,
      suborgList[0].organisation_name,
    );
  }

  suborgList.forEach((suborg) => {
    if (
      parseInt(suborg.organisation) ===
      parseInt(localStorage.getItem("parentOrgID"))
    ) {
      if (suborg.name === "Global") {
        const selectBtn = document.createElement("button");

        selectBtn.innerHTML = `<span class="material-symbols-outlined">build_circle</span>&nbsp;${gettext("Global Settings")}`;
        selectBtn.className =
          "btn btn-tertiary btn-sm ms-2 d-flex align-items-center justify-content-center global-settings-btn";

        filterVisibleBranches(suborg.branches).forEach((branch) => {
          selectBtn.onclick = function () {
            selectBranch(
              branch.id,
              branch.name,
              suborg.id,
              suborg.name,
              suborg.organisation,
              suborg.organisation_name,
            );
          };
        });
        document.getElementById("admin-buttons").appendChild(selectBtn);
      } else {
        // Create card container for each suborganisation
        const card = document.createElement("div");
        card.className = "mb-4";

        // Card header (without "Suborg:" prefix)
        const cardHeader = document.createElement("div");
        cardHeader.className = "d-flex align-items-center mx-1 mb-3";
        const headerContent = document.createElement("h3");
        headerContent.className = "mb-0 text-secondary";
        headerContent.innerHTML = `${suborg.name}`;
        cardHeader.appendChild(headerContent);

        // Add buttons container for suborg actions
        const suborgButtonsContainer = document.createElement("div");
        suborgButtonsContainer.className = "d-flex align-items-center ms-auto";

        // Manage Templates button (for org_admin or suborg_admin)
        if (isActingUserOrgAdmin || suborg.user_role === "suborg_admin") {
          const manageTemplatesBtn = document.createElement("button");
          manageTemplatesBtn.className =
            "btn btn-sm btn-secondary me-2 d-flex align-items-center";
          manageTemplatesBtn.innerHTML = `<span class="material-symbols-outlined">note_stack</span>&nbsp;${gettext("Manage Templates")}`;
          manageTemplatesBtn.onclick = function (e) {
            e.stopPropagation();
            window.location.href = `/manage-templates?mode=suborg_templates&suborg_id=${suborg.id}`;
          };
          suborgButtonsContainer.appendChild(manageTemplatesBtn);
        }

        // Add branch button (for org_admin or suborg_admin)
        if (isActingUserOrgAdmin || suborg.user_role === "suborg_admin") {
          const addBranchBtn = document.createElement("button");
          addBranchBtn.className =
            "btn btn-sm btn-primary me-2 d-flex align-items-center";
          addBranchBtn.innerHTML = `<span class="material-symbols-outlined">add</span>&nbsp;${gettext("Add Branch")}`;
          addBranchBtn.onclick = function (e) {
            e.stopPropagation();
            showAddBranchModalFor(suborg.id);
          };
          suborgButtonsContainer.appendChild(addBranchBtn);
        }

        // Add edit button for suborgs (only for org_admin or suborg_admin)
        if (isActingUserOrgAdmin || suborg.user_role === "suborg_admin") {
          const editSuborgBtn = document.createElement("button");
          editSuborgBtn.className =
            "btn btn-sm btn-outline-secondary me-2 d-flex align-items-center";
          editSuborgBtn.innerHTML = `<span class="material-symbols-outlined">edit</span>&nbsp;${gettext(
            "Edit",
          )}`;
          editSuborgBtn.onclick = function (e) {
            e.stopPropagation();
            showEditSuborgModal(suborg.id, suborg.name);
          };
          suborgButtonsContainer.appendChild(editSuborgBtn);
        }

        // Add delete button for suborgs (only for org_admin)
        if (isActingUserOrgAdmin) {
          const deleteSuborgBtn = document.createElement("button");
          deleteSuborgBtn.className =
            "btn btn-sm btn-outline-danger d-flex align-items-center";
          deleteSuborgBtn.innerHTML = `<span class="material-symbols-outlined">delete_forever</span>&nbsp;${gettext(
            "Delete",
          )}`;
          deleteSuborgBtn.onclick = function (e) {
            e.stopPropagation();
            deleteSuborg({ id: suborg.id, name: suborg.name });
          };
          suborgButtonsContainer.appendChild(deleteSuborgBtn);
        }

        cardHeader.appendChild(suborgButtonsContainer);
        card.appendChild(cardHeader);

        // Card body with branch list
        const cardBody = document.createElement("div");
        cardBody.style.borderRadius = "8px";
        cardBody.style.boxShadow = "1px 1px 10px 5px rgba(72, 99, 115, 0.12)";
        cardBody.style.overflow = "hidden";

        const visibleBranches = filterVisibleBranches(suborg.branches || []);
        if (visibleBranches.length > 0) {
          const table = document.createElement("table");
          table.className = "table table-sm mb-0";
          table.style.border = "none";

          // Create table header
          const thead = document.createElement("thead");
          const headerRow = document.createElement("tr");

          const branchHeader = document.createElement("th");
          branchHeader.textContent = gettext("Branch");
          branchHeader.style.backgroundColor = "white";
          branchHeader.style.border = "none";
          branchHeader.style.borderBottom = "1px solid #dee2e6";
          branchHeader.style.fontWeight = "bold";
          branchHeader.style.padding = "12px 16px";
          branchHeader.style.width = "25%";
          branchHeader.style.fontSize = "1rem";

          const actionsHeader = document.createElement("th");
          actionsHeader.textContent = gettext("Actions");
          actionsHeader.style.backgroundColor = "white";
          actionsHeader.style.border = "none";
          actionsHeader.style.borderBottom = "1px solid #dee2e6";
          actionsHeader.style.fontWeight = "bold";
          actionsHeader.style.padding = "12px 16px";
          actionsHeader.style.width = "25%";
          actionsHeader.style.fontSize = "1rem";

          const fillerHeader = document.createElement("th");
          fillerHeader.style.backgroundColor = "white";
          fillerHeader.style.border = "none";
          fillerHeader.style.borderBottom = "1px solid #dee2e6";
          fillerHeader.style.width = "50%";
          fillerHeader.style.padding = "12px 16px";

          headerRow.appendChild(branchHeader);
          headerRow.appendChild(actionsHeader);
          headerRow.appendChild(fillerHeader);
          thead.appendChild(headerRow);
          table.appendChild(thead);

          // Create table body
          const tbody = document.createElement("tbody");
          visibleBranches.forEach((branch, index) => {
            const row = document.createElement("tr");

            // Branch name cell
            const branchCell = document.createElement("td");
            branchCell.innerHTML = `${branch.name}`;
            branchCell.style.backgroundColor = "white";
            branchCell.style.verticalAlign = "middle";
            branchCell.style.border = "none";
            branchCell.style.padding = "12px 16px";
            branchCell.style.width = "25%";
            branchCell.style.fontSize = "1rem";
            if (index < visibleBranches.length - 1) {
              branchCell.style.borderBottom = "1px solid #dee2e6";
            }

            // Actions cell
            const actionsCell = document.createElement("td");
            actionsCell.style.backgroundColor = "white";
            actionsCell.style.verticalAlign = "middle";
            actionsCell.style.border = "none";
            actionsCell.style.padding = "12px 16px";
            actionsCell.style.width = "25%";
            if (index < visibleBranches.length - 1) {
              actionsCell.style.borderBottom = "1px solid #dee2e6";
            }

            const actionDiv = document.createElement("div");
            actionDiv.className = "d-flex align-items-center";
            const selectBtn = document.createElement("button");
            selectBtn.className =
              "btn btn-sm btn-tertiary me-2 d-flex align-items-center justify-content-center";
            selectBtn.innerHTML = `${gettext(
              "Select",
            )}&nbsp;<span class="material-symbols-outlined">
arrow_outward
</span>`;

            selectBtn.onclick = function () {
              selectBranch(
                branch.id,
                branch.name,
                suborg.id,
                suborg.name,
                suborg.organisation,
                suborg.organisation_name,
              );
            };
            actionDiv.appendChild(selectBtn);

            // Add edit button for branches (only for org_admin or suborg_admin)
            if (isActingUserOrgAdmin || suborg.user_role === "suborg_admin") {
              const editBranchBtn = document.createElement("button");
              editBranchBtn.className =
                "btn btn-sm btn-outline-secondary me-2 d-flex align-items-center justify-content-center";
              editBranchBtn.innerHTML = `<span class="material-symbols-outlined">edit</span>&nbsp;${gettext(
                "Edit",
              )}`;
              editBranchBtn.onclick = function () {
                showEditBranchModal(branch.id, branch.name);
              };
              actionDiv.appendChild(editBranchBtn);
            }

            // Add delete button for branches (for org_admin or suborg_admin)
            if (isActingUserOrgAdmin || suborg.user_role === "suborg_admin") {
              const deleteBtn = document.createElement("button");
              deleteBtn.className =
                "btn btn-sm btn-outline-danger d-flex align-items-center justify-content-center";
              deleteBtn.innerHTML = `<span class="material-symbols-outlined">delete_forever</span>&nbsp;${gettext(
                "Delete",
              )}`;
              deleteBtn.onclick = function () {
                deleteBranch({ id: branch.id, name: branch.name });
              };
              actionDiv.appendChild(deleteBtn);
            }

            actionsCell.appendChild(actionDiv);
            row.appendChild(branchCell);
            row.appendChild(actionsCell);

            // Filler cell
            const fillerCell = document.createElement("td");
            fillerCell.style.backgroundColor = "white";
            fillerCell.style.verticalAlign = "middle";
            fillerCell.style.border = "none";
            fillerCell.style.padding = "12px 16px";
            fillerCell.style.width = "50%";
            if (index < visibleBranches.length - 1) {
              fillerCell.style.borderBottom = "1px solid #dee2e6";
            }

            row.appendChild(fillerCell);
            tbody.appendChild(row);
          });

          table.appendChild(tbody);
          cardBody.appendChild(table);
        } else {
          const noBranchMsg = document.createElement("p");
          noBranchMsg.className = "text-muted";
          noBranchMsg.textContent = gettext("No branches found.");
          cardBody.appendChild(noBranchMsg);
        }
        card.appendChild(cardBody);
        container.appendChild(card);
      }
    }
  });
}

function selectBranch(
  branchId,
  branchName,
  suborgId,
  suborgName,
  orgId,
  orgName,
) {
  localStorage.setItem("selectedBranchName", branchName);
  localStorage.setItem("selectedBranchID", branchId);
  localStorage.setItem("selectedSubOrgName", suborgName);
  localStorage.setItem("selectedSubOrgID", suborgId);
  localStorage.setItem("parentOrgID", orgId);
  localStorage.setItem("parentOrgName", orgName);
  window.location.href = "/dashboard";
}

async function createUser(
  username,
  email,
  password,
  firstName,
  lastName,
  language,
) {
  try {
    const resp = await fetch(`${BASE_URL}/api/users/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        username: username,
        email: email,
        password: password,
        first_name: firstName,
        last_name: lastName,
        language_preference: language,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      showToast(
        gettext("Error creating user: ") + JSON.stringify(err),
        "Error",
      );
      return null;
    }
    return await resp.json();
  } catch (err) {
    showToast(gettext("Error creating user: ") + err, "Error");
    return null;
  }
}

async function addMembership(membershipData) {
  try {
    const resp = await fetch(`${BASE_URL}/api/memberships/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(membershipData),
    });
    if (!resp.ok) {
      const err = await resp.json();
      showToast(
        gettext("Error creating membership: ") + JSON.stringify(err),
        "Error",
      );
      return null;
    }
    return await resp.json();
  } catch (err) {
    showToast(gettext("Error creating membership: ") + err, "Error");
    return null;
  }
}

function showEditSuborgModal(suborgId, suborgName) {
  document.getElementById("editSuborgNameInput").value = suborgName;
  document.getElementById("editSuborgId").value = suborgId;
  const modal = new bootstrap.Modal(document.getElementById("editSuborgModal"));
  modal.show();
}

async function updateSuborg(suborgId, suborgName) {
  try {
    const resp = await fetch(`${BASE_URL}/api/suborganisations/${suborgId}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: suborgName,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      showToast(
        gettext("Error updating suborg: ") + JSON.stringify(err),
        "Error",
      );
      return null;
    }
    return await resp.json();
  } catch (err) {
    showToast(gettext("Error updating suborg: ") + err, "Error");
    return null;
  }
}

async function onSubmitEditSuborg() {
  const suborgId = document.getElementById("editSuborgId").value;
  if (!suborgId) {
    showToast(gettext("No suborg ID found!"), "Error");
    return;
  }
  const suborgName = document
    .getElementById("editSuborgNameInput")
    .value.trim();
  if (!suborgName) {
    showToast(gettext("Please enter a suborg name."), "Warning");
    return;
  }
  const updatedSuborg = await updateSuborg(suborgId, suborgName);
  if (updatedSuborg) {
    showToast(gettext("Suborganisation updated successfully!"), "Success");
    // Close the modal after successful update
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("editSuborgModal"),
    );
    if (modal) {
      modal.hide();
    }
    fetchSubOrgs();
  }
}

async function deleteSuborg(suborgObj) {
  // Set up the delete suborg modal
  const messageEl = document.getElementById("deleteSuborgMessage");
  const textToTypeEl = document.getElementById("deleteSuborgTextToType");

  // Store suborg info
  document.getElementById("deleteSuborgId").value = suborgObj.id;
  document.getElementById("deleteSuborgName").value = suborgObj.name;

  // Set up modal content
  const requiredText = `${gettext("Delete suborg")} ${suborgObj.name}`;
  messageEl.textContent = `${gettext(
    "Are you sure you want to delete suborganisation",
  )} '${suborgObj.name}'?`;
  textToTypeEl.textContent = requiredText;

  // Use the utility function for delete confirmation setup
  setupDeleteConfirmation(
    "deleteSuborgInput",
    "deleteSuborgConfirmBtn",
    "deleteSuborgError",
    "deleteSuborgTextToType",
    requiredText,
  );

  // Show modal
  const modal = new bootstrap.Modal(
    document.getElementById("deleteSuborgModal"),
  );
  modal.show();

  // Focus input after modal is shown
  setTimeout(() => document.getElementById("deleteSuborgInput").focus(), 200);
}

function showEditBranchModal(branchId, branchName) {
  document.getElementById("editBranchNameInput").value = branchName;
  document.getElementById("editBranchId").value = branchId;
  const modal = new bootstrap.Modal(document.getElementById("editBranchModal"));
  modal.show();
}

async function updateBranch(branchId, branchName) {
  try {
    const resp = await fetch(`${BASE_URL}/api/branches/${branchId}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: branchName,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      showToast(
        gettext("Error updating branch: ") + JSON.stringify(err),
        "Error",
      );
      return null;
    }
    return await resp.json();
  } catch (err) {
    showToast(gettext("Error updating branch: ") + err, "Error");
    return null;
  }
}

async function onSubmitEditBranch() {
  const branchId = document.getElementById("editBranchId").value;
  if (!branchId) {
    showToast(gettext("No branch ID found!"), "Error");
    return;
  }
  const branchName = document
    .getElementById("editBranchNameInput")
    .value.trim();
  if (!branchName) {
    showToast(gettext("Please enter a branch name."), "Warning");
    return;
  }
  const updatedBranch = await updateBranch(branchId, branchName);
  if (updatedBranch) {
    showToast(gettext("Branch updated successfully!"), "Success");
    // Close the modal after successful update
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("editBranchModal"),
    );
    if (modal) {
      modal.hide();
    }
    fetchSubOrgs();
  }
}

function populateBranchSelect(suborgId) {
  const branchSelect = document.getElementById("branchSelect");
  branchSelect.innerHTML = `<option disabled selected value="">-- ${gettext(
    "Select a Branch",
  )} --</option>`;

  const suborgObj = subOrgsData.find((s) => String(s.id) === String(suborgId));
  if (!suborgObj || !suborgObj.branches) return;

  filterVisibleBranches(suborgObj.branches).forEach((branch) => {
    if (branch.name !== "Global") {
      const opt = document.createElement("option");
      opt.value = branch.id;
      opt.textContent = branch.name;
      branchSelect.appendChild(opt);
    }
  });
}

function validateCreateUserForm() {
  const role = document.getElementById("userRoleSelect").value;
  const username = document.getElementById("newUserUsername").value.trim();
  const email = document.getElementById("userEmailInput").value.trim();
  const password = document.getElementById("userPasswordInput").value.trim();
  const firstName = document.getElementById("userFirstNameInput").value.trim();
  const lastName = document.getElementById("userLastNameInput").value.trim();
  const language = document.getElementById("userLanguageSelect").value;

  let isValid = true;

  // Check basic required fields
  if (
    !role ||
    !username ||
    !email ||
    !password ||
    !firstName ||
    !lastName ||
    !language
  ) {
    isValid = false;
  }

  // Check role-specific requirements
  if (role === "suborg_admin" || role === "employee") {
    const suborgId = document.getElementById("suborgSelect").value;
    if (!suborgId) {
      isValid = false;
    }

    // For employees, also check branch selection
    if (role === "employee") {
      const branchId = document.getElementById("branchSelect").value;
      if (!branchId) {
        isValid = false;
      }
    }
  }

  const submitBtn = document.getElementById("submitAddNewUserBtn");
  submitBtn.disabled = !isValid;

  return isValid;
}

async function onSubmitAddNewUser() {
  if (!validateCreateUserForm()) {
    showToast(gettext("Please fill out all required fields."), "Warning");
    return;
  }

  const role = document.getElementById("userRoleSelect").value;
  const username = document.getElementById("newUserUsername").value.trim();
  const email = document.getElementById("userEmailInput").value.trim();
  const password = document.getElementById("userPasswordInput").value.trim();
  const firstName = document.getElementById("userFirstNameInput").value.trim();
  const lastName = document.getElementById("userLastNameInput").value.trim();
  const language = document.getElementById("userLanguageSelect").value;
  const orgId = localStorage.getItem("parentOrgID");

  if (!orgId) {
    showToast(gettext("No organisation ID in localStorage!"), "Error");
    return;
  }

  const newUser = await createUser(
    username,
    email,
    password,
    firstName,
    lastName,
    language,
  );
  if (!newUser) return;

  const membershipPayload = {
    user: newUser.id,
    organisation: orgId,
    role: role,
    suborganisation: null,
    branch: null,
  };

  if (role === "suborg_admin") {
    const suborgId = document.getElementById("suborgSelect").value;
    membershipPayload.suborganisation = suborgId;
  } else if (role === "employee") {
    const suborgId = document.getElementById("suborgSelect").value;
    const branchId = document.getElementById("branchSelect").value;
    membershipPayload.suborganisation = suborgId;
    membershipPayload.branch = branchId;
  }

  const membership = await addMembership(membershipPayload);
  if (membership) {
    showToast(gettext("User created successfully!"), "Success");
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("addUserModal"),
    );
    if (modal) {
      modal.hide();
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await fetchUserLangugage();
  translateHTML();
  makeActiveInNav("/select-sub-org");

  await validateToken();
  await fetchSubOrgs();

  updateNavbarUsername();

  document
    .getElementById("addSuborgMembershipBtn")
    .addEventListener("click", async () => {
      if (!currentSelectedUserId) {
        showToast(gettext("No user selected."));
        return;
      }
      const subId = document.getElementById("suborgSelectManage").value;
      const role = document.getElementById("suborgRoleManage").value;
      let branchId = null;
      // Require a selected suborganisation for suborg_admin and employee roles
      if ((role === "suborg_admin" || role === "employee") && !subId) {
        showToast(gettext("Please select a suborganisation for this role."), "Warning");
        return;
      }
      if (role === "employee") {
        branchId = document.getElementById("branchSelectManage").value;
        if (!branchId) {
          showToast(gettext("Please select a branch for the employee."));
          return;
        }
      }
      const orgId = localStorage.getItem("parentOrgID");
      if (!orgId) {
        showToast(gettext("No org ID in localStorage!"));
        return;
      }
      const payload = {
        user: currentSelectedUserId,
        organisation: orgId,
        role: role,
        suborganisation: subId,
      };
      if (role === "employee") {
        payload.branch = branchId;
      } else {
        payload.branch = "";
      }
      await addMembership(payload);
      fetchUserMemberships(currentSelectedUserId);
    });

  document.getElementById("suborgRoleManage").addEventListener("change", () => {
    const roleVal = document.getElementById("suborgRoleManage").value;
    const branchSelectManage = document.getElementById("branchSelectManage");
    if (roleVal === "employee") {
      branchSelectManage.style.display = "block";
      populateBranchSelectManage();
    } else {
      branchSelectManage.style.display = "none";
    }
  });

  document
    .getElementById("suborgSelectManage")
    .addEventListener("change", () => {
      const roleVal = document.getElementById("suborgRoleManage").value;
      if (roleVal === "employee") {
        populateBranchSelectManage();
      }
    });

  document.getElementById("sign-out-btn").addEventListener("click", signOut);
  document
    .getElementById("add-user-btn")
    .addEventListener("click", showAddUserModal);
  document
    .getElementById("submitAddNewUserBtn")
    .addEventListener("click", onSubmitAddNewUser);
  document
    .getElementById("manage-users-btn")
    .addEventListener("click", showManageUsersModal);
  document
    .getElementById("add-suborg-btn")
    .addEventListener("click", showAddSuborgModal);
  document
    .getElementById("submitAddSuborgBtn")
    .addEventListener("click", onSubmitAddSuborg);
  document
    .getElementById("submitAddBranchBtn")
    .addEventListener("click", onSubmitAddBranch);
  document
    .getElementById("submitEditSuborgBtn")
    .addEventListener("click", onSubmitEditSuborg);
  document
    .getElementById("submitEditBranchBtn")
    .addEventListener("click", onSubmitEditBranch);

  const formFields = [
    "newUserUsername",
    "userEmailInput",
    "userPasswordInput",
    "userFirstNameInput",
    "userLastNameInput",
    "userLanguageSelect",
    "userRoleSelect",
  ];

  formFields.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener("input", validateCreateUserForm);
      field.addEventListener("change", validateCreateUserForm);
    }
  });

  document.getElementById("navbar-username").innerText =
    localStorage.getItem("username");

  document.getElementById("org-name").innerText =
    localStorage.getItem("parentOrgName");

  if (isActingUserOrgAdmin === false) {
    document.getElementById("add-user-btn").className = "d-none";
    document.getElementById("manage-users-btn").className = "d-none";
    document.getElementById("add-suborg-btn").className = "d-none";
  }

  document
    .getElementById("userRoleSelect")
    .addEventListener("change", onUserRoleChange);

  document
    .getElementById("suborgSelect")
    .addEventListener("change", function (e) {
      const suborgId = e.target.value;
      const role = document.getElementById("userRoleSelect").value;
      if (role === "employee" && suborgId) {
        populateBranchSelect(suborgId);
      }
      validateCreateUserForm();
    });

  document
    .getElementById("branchSelect")
    .addEventListener("change", validateCreateUserForm);

  document
    .getElementById("deleteBranchConfirmBtn")
    ?.addEventListener("click", async () => {
      const branchId = document.getElementById("deleteBranchId").value;
      const branchName = document.getElementById("deleteBranchName").value;

      try {
        const resp = await fetch(`${BASE_URL}/api/branches/${branchId}/`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) {
          const err = await resp.json();
          await showToast(
            gettext("Error deleting branch: ") + JSON.stringify(err),
          );
        } else {
          await showToast(gettext("Branch deleted successfully!"));
          fetchSubOrgs();
          // Close modal
          const modal = bootstrap.Modal.getInstance(
            document.getElementById("deleteBranchModal"),
          );
          modal?.hide();
        }
      } catch (err) {
        console.error("Error deleting branch:", err);
        await showToast(gettext("Error deleting branch: ") + err);
      }
    });

  document
    .getElementById("deleteUserConfirmBtn")
    ?.addEventListener("click", async () => {
      const userId = document.getElementById("deleteUserId").value;
      const userName = document.getElementById("deleteUserName").value;

      try {
        const resp = await fetch(`${BASE_URL}/api/users/${userId}/`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) {
          const err = await resp.json();
          await showToast(
            gettext("Error removing user from organization: ") +
              JSON.stringify(err),
          );
        } else {
          await showToast(
            gettext("User removed from organization successfully!"),
          );
          const orgId = localStorage.getItem("parentOrgID");
          if (orgId) {
            fetchOrgUsers(orgId);
          }
          document.getElementById("selectedUserDetails").style.display = "none";
          // Close modal
          const modal = bootstrap.Modal.getInstance(
            document.getElementById("deleteUserModal"),
          );
          modal?.hide();
        }
      } catch (err) {
        console.error(gettext("Error deleting user:"), err);
        await showToast(gettext("Error deleting user: ") + err);
      }
    });

  document
    .getElementById("deleteSuborgConfirmBtn")
    ?.addEventListener("click", async () => {
      const suborgId = document.getElementById("deleteSuborgId").value;
      const suborgName = document.getElementById("deleteSuborgName").value;

      try {
        const resp = await fetch(
          `${BASE_URL}/api/suborganisations/${suborgId}/`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!resp.ok) {
          const err = await resp.json();
          await showToast(
            gettext("Error deleting suborg: ") + JSON.stringify(err),
          );
        } else {
          await showToast(gettext("Suborganisation deleted successfully!"));
          fetchSubOrgs();
          // Close modal
          const modal = bootstrap.Modal.getInstance(
            document.getElementById("deleteSuborgModal"),
          );
          modal?.hide();
        }
      } catch (err) {
        console.error("Error deleting suborg:", err);
        await showToast(gettext("Error deleting suborg: ") + err);
      }
    });
});
