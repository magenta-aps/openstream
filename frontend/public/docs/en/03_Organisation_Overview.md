# 3. Organization overview

In this chapter, the organization overview page will be introduced. This page is sent to the user after login if they are an organization or sub-organization administrator, or if they are associated with more than one branch as an employee.

The organization overview page provides an overview of all affiliated sub-organizations and branches. The page adapts dynamically based on your user role and the associated rights.

## 3.1 Employee view

As an **employee**, the overview of the branches you are associated with is displayed. To access a specific branch, simply click **Select**.

![View for an employee with access to two branches](/docs/docs_images/en/employee_en_select_sub_org.png)

## 3.2 Sub-organization administrator view

As a **sub-organization administrator**, you have full access to all branches within your sub-organization as well as the option to create sub-organization templates. Your administrative rights include:
* Changing the name of the sub-organization.
* Creation of new branches.
* Changing the names of branches.
* Deletion of existing branches.
* Creation of sub-organization templates.

![View for an sub-organization administrator](/docs/docs_images/en/suborg_admin_en_select_sub_org.png)

## 3.3 Organization administrator view

As an **organization administrator**, you have the highest access rights and can see and manage all sub-organizations and branches. You have the same rights as a sub-organization administrator for all sub-organizations and can also create and delete the sub-organizations themselves.

![Visning for en organisationsadministrator](/docs/docs_images/en/org_admin_en_select_sub_org.png)

### 3.3.1 User administration

A key feature for organization administrators is the ability to manage the system's users. Here we introduce the options available for user administration:

#### 3.3.1.1 Manage Existing Users

To edit rights for existing users, click on **Manage Users** and select **Manage Existing Users**.

![Button to manage existing users](/docs/docs_images/en/manage_existing_users_en.png)

This opens an administration panel where you can see a complete overview of all users in the organization.

![Panel for managing existing users](/docs/docs_images/en/manage_existing_users_modal_en.png)

In this panel, you can perform the following actions:

* **Assign a new role**: Under the "Add New Suborg Membership" section, select the appropriate sub-organization and role. For the role **Employee**, you must also specify a branch. Click the **+** icon to add the new role.
* **Remove a role**: Select the user from the side menu to see their current roles. Click **Remove Access** next to the role you wish to remove.
<!-- Dette er udkommenteret, da fjernelse af brugere ikke er færdig udviklet endnu -->
<!-- * **Remove a user permanently**: To remove a user completely from the organization, select the user and click **Remove from organization**. Alternatively, a user will be removed from the organization if all their roles and accesses are manually removed. -->