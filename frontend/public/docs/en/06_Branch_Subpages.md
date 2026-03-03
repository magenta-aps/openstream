# 4. Branch Subpages
In this chapter, all the subpages available under a branch will be introduced and explained. If you are only associated with one branch, you will automatically be sent here when you log in. If you have access to several branches, you can see how to select a specific branch here: [Employee view](#03_Organisation_Overview#31-employee-view).

## 4.1 Navigation menu
After selecting a branch, the navigation menu will change. Now the navigation menu will show a button on the right that shows which branch you have selected. This button can be clicked to change branches. In addition to that, there will be the following menu items:

* **Dashboard:** An overview page of what is going on in the branch right now
* **Content:** This page is an overview page of created content. From here you can open, create and delete content.
* **Playlists:** A page where you can put together slideshows for playlists.
* **Manage Screens:** On this page you can connect screens to the system and assign them content, as well as a calendar system where you can schedule content.
* **Documentation:** *(This page)* Documentation page.

![Branch Navigation Menu](/docs/docs_images/en/branch_navbar_en.png)

## 4.2 Dashboard
This first page that is displayed after opening a branch is the dashboard. On this page, you can see the most recently edited content and playlists, and have a quick access. Along with this, there is an overview of what content is playing on the screens right now and what is planned next.

![Afdelings Navigationsmenu](/docs/docs_images/en/dashboard_en.png)

## 4.3 Content
This page displays an overview of created content and allows you to create, edit, duplicate or delete content.

### 4.3.1 Find existing content
You can search for content by name, mode *(slideshow or interactive)*, aspect ratio *(eg 16:9 or 4:3)*, tags or category. In addition, you can filter by categories and mode in the left side panel. 

![Find Existing Content](/docs/docs_images/en/find_existing_content_en.png)

### 4.3.2 Edit existing content
![Edit existing content](/docs/docs_images/en/edit_existing_content_en.png)

#### 4.3.2.1 Edit metadata
To change metadata (eg name, category or tags) click the pencil icon next to the field you want to edit. The changes are saved when you confirm the edit.

#### 4.3.2.2 Open content
Click "Open" under Actions to open the content in the editor. The editor is explained in the section [Edit Content.](#05_Edit_Content)

#### 4.3.2.3 Duplicate Content
Click "Duplicate" to make a copy. The new copy is given the same name as the original with "(Copy)" appended.

#### 4.3.2.4 Delete Content
Click "Delete" under Actions and confirm to remove the content. Note: If the content is already assigned to screens, they will become empty when the content is deleted.

### 4.3.3 Create Content
Click "Add Content" on the top right to create new content.

![Add content](/docs/docs_images/en/add_content_en.png)

After clicking, a dialog opens with several settings. These settings are explained below:

##### Name content
Enter the name of the content in the "Name" text field.

##### Select mode
Choose between two modes: "Slideshow" and "Interactive". The mode is selected in a dropdown and cannot be changed after creation.

**Slideshow:** In this mode, you build a slideshow with slides, where you insert content, choose order and specify display time for each slide.
<!-- To do - Tilføj denne linje, når afsnittet eksisterer: "See the slideshow section for details." -->

**Interactive:** In this mode you create interactive pages, e.g. for touch screens. Elements can be configured as buttons that navigate between pages.
<!-- To do - Tilføj denne linje, når afsnittet eksisterer: "See the interactive content section for details." -->

##### Aspect ratio
Select the aspect ratio in which the content should be displayed (e.g. 16:9 for wide format or 9:16 for portrait format). Content must be created with a view to the aspect ratio of the screen(s) that will display the content.

##### Save
Click "Create Content" when you're done. After creation, you get the option to either go directly to the editor or stay on the overview page.

## 4.4 Playlist
![Playlist view](/docs/docs_images/en/playlists_en.png)

This page is used to create and manage playlists consisting of slideshows.
The purpose is to gather multiple slideshows in a sequence, which can then be assigned to screens or scheduled in schedules.

**Layout and main features**
- The left sidebar displays all created playlists in a list. The "Add Playlist" button at the top opens a modal for creating a new playlist.
- When a playlist is selected, the main area displays the name of the selected playlist and two actions: "Rename Playlist" and "Add content to Playlist".
- If no playlist is selected, a guiding text "No Playlist selected. Please add or select a playlist" is displayed in the main area.

**Editing section**
- When a playlist is selected, you can view and edit the slideshow sequence in a table format. The table displays each row with its progress (slideshow), position, and a column for actions (e.g. remove or move).
- Order can be changed using drag-and-drop in the table — allowing you to adjust the position of each slideshow in the playlist.

## 4.5 Manage screens
![Manage screens](/docs/docs_images/en/manage_displays_en.png)

The "Manage Displays" page is divided into a sidebar on the left and a calendar on the right. The sidebar is used to create and maintain display groups and displays, while the calendar displays scheduled content for the groups you select.

**Terms**
- A *group* gathers one or more displays that are to display the same content and share the same aspect ratio. You control default content, scheduled playbacks, and metadata at the group level.

- A *display* is the physical client that is registered in OpenStream. The display is associated with a specific aspect ratio, and it is the user's responsibility to enter the correct aspect ratio in OpenStream when the display is registered.
- After a display has been registered, it must be associated with a group in order to display content.

### 4.5.1 Sidebar: Groups and Displays
#### 4.5.1.1 Add Display Group
Click **Add Display Group** to create a new display group. In the dialog, you select the name, aspect ratio, and default content. When you click the pencil button in the list of displays, a dialog box opens where you can rename, change format, or adjust default content.

![Add group button](/docs/docs_images/en/add_group_btn_en.png)
![Add group dialog](/docs/docs_images/en/add_group_en.png)

#### 4.5.1.2 Register Screen
Select **Register Screen** to open the registration dialog and copy either the registration URL or API key for external tools like OS2BorgerPC.

![Add screen button](/docs/docs_images/en/register_screen_en.png)
![Add Screen](/docs/docs_images/en/screen_registration_dialog_en.png)

After a screen has been registered, it will automatically appear at the bottom of the left side menu in "Inactive Displays". To give the screen some content, simply drag it into a screen group that has content associated with it.

![Inactive Screens](/docs/docs_images/en/inactive_screen_en.png)

### 4.5.2 Default content for groups
- Each group has default content that plays when there are no planned deviations. Choose between individual slideshows/interactive content or a complete slideshow playlist.
- Edit the default content for a group by clicking the pencil icon next to the group.

![Default content](/docs/docs_images/en/edit_group_en.png)

### 4.5.3 Schedule content in the calendar
- The calendar fills the main area and shows all scheduled playbacks for the selected groups.
- Use **Add Scheduled Content** or drag your mouse over the calendar for one-time events on specific dates and times. Choose whether the content should replace the default content or play in combination.
![Scheduled Content Button](/docs/docs_images/en/add_scheduled_content_btn_en.png)
![Scheduled Content](/docs/docs_images/en/add_scheduled_content_modal_en.png)

- Use **Add Recurring Content** for recurring scheduling, e.g. every Monday 10:00-12:00. Existing events can be edited or deleted via the corresponding ones by clicking on them in the calendar. Recurring events can be added in combination mode or overwrite mode.
- It is possible to combine multiple items in the calendar at the same time.
![Recurring Content Button](/docs/docs_images/en/recurring_content_en.png)
![Recurring Content](/docs/docs_images/en/recurring_content_modal_en.png)

### 4.5.4 Maintaining Displays
- Select the same aspect ratio on the display and in the group, otherwise the program will block the operation.
- If a display needs to change aspect ratio, remove it from its current group and add it back to "Inactive Displays". When the display is inactive, you can change its aspect ratio.