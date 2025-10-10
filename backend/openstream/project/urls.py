# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

from django.contrib import admin
from django.urls import path, include, re_path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from osauth.views import SSOAuthCodeView, SignInView, WhoAmIView

# DRF API Views
from app.views import (
    CustomTokenObtainPairView,
    # Using the unified CategoryAPIView instead of the separate views
    LatestEditedSlideshowsAPIView,
    LatestEditedPlaylistsAPIView,
    OrganisationAPIView,
    RegisteredSlideTypesAPIView,
    CategoryAPIView,
    TagListCreateAPIView,
    TagDetailAPIView,
    # Removed SlideAPIView, SlideTemplateAPIView
    SlideshowCRUDView,
    SlideshowPlaylistAPIView,
    SlideshowPlaylistItemAPIView,
    WayfindingCRUDView,
    DisplayWebsiteAPIView,
    DisplayWebsiteGroupAPIView,
    ScheduledContentAPIView,
    RecurringScheduledContentAPIView,
    GetActiveContentAPIView,
    BranchActiveContentAPIView,
    BranchUpcomingContentAPIView,
    DocumentFileView,
    DocumentFileTokenView,
    DocumentAPIView,
    MembershipAPIView,
    MembershipDetailAPIView,
    UserSuborganisationsAPIView,
    CreateUserAPIView,
    OrganisationUsersListAPIView,
    UserDetailAPIView,
    SubOrganisationListCreateAPIView,
    SubOrganisationDetailAPIView,
    ShowAllUserInfoView,
    ShowUsernameAndEmailView,
    UpdateUserAPIView,
    ChangePasswordAPIView,
    BranchListCreateAPIView,
    BranchDetailAPIView,
    BranchAPIKeyView,
    SlideTemplateAPIView,
    SuborgTemplateAPIView,
    FrontdeskAPIKey,
    BranchURLCollectionItemAPIView,
    DocumentListView,
    TagListAPIView,
    ValidateTokenView,
    CustomColorAPIView,
    CustomFontAPIView,
    UserLanguagePreferenceView,
    SendLoginEmailView,
    ResetPasswordView,
    ConfirmPasswordResetView,
    RegisterScreenAPIView,
    CreateScreenAPIView,
    CheckScreenGroupAPIView,
    GetUsernameFromTokenView,
    UserAPIKeyView,
    # Converted from Django Ninja APIs
    DDBProxyAPIView,
    DDBEventOptionsAPIView,
    DDBEventAPIView,
    RSSToJSONAPIView,
    WeatherAPIView,
    WeatherLocationsAPIView,
    SpeedAdminDataAPIView,
    SpeedAdminSchoolsAPIView,
    WinKASLocationsAPIView,
    WinKASBookingsAPIView,
    KMDDataAPIView,
    KMDLocationsAPIView,
)
from sso.views import sso_login, sso_callback


urlpatterns = [
    # Root path - backend API only, no frontend views
    ###############################################################################
    # DRF API Endpoints: Categories & Tags
    ###############################################################################
    path(
        "api/categories/",
        CategoryAPIView.as_view(),
        name="category-list-create",
    ),
    path(
        "api/categories/<int:pk>/",
        CategoryAPIView.as_view(),
        name="category-detail",
    ),
    path("api/tags/", TagListCreateAPIView.as_view(), name="tag-list-create"),
    path("api/tags/list/", TagListAPIView.as_view(), name="tag-list"),
    path("api/tags/<int:pk>/", TagDetailAPIView.as_view(), name="tag-detail"),
    ###############################################################################
    # DRF API Endpoints: Slideshows
    ###############################################################################
    path("api/manage_content/", SlideshowCRUDView.as_view(), name="slideshow_crud"),
    path(
        "api/manage_content/<int:pk>/",
        SlideshowCRUDView.as_view(),
        name="slideshow_detail_crud",
    ),
    ###############################################################################
    # DRF API Endpoints: Wayfinding
    ###############################################################################
    path("api/wayfinding/", WayfindingCRUDView.as_view(), name="wayfinding_crud"),
    path(
        "api/wayfinding/<int:pk>/",
        WayfindingCRUDView.as_view(),
        name="wayfinding_detail_crud",
    ),
    ###############################################################################
    # DRF API Endpoints: Playlists and Playlist Items
    ###############################################################################
    path(
        "api/slideshow-playlists/",
        SlideshowPlaylistAPIView.as_view(),
        name="slideshow_sequences_crud",
    ),
    path(
        "api/slideshow-playlists/<int:pk>/",
        SlideshowPlaylistAPIView.as_view(),
        name="slideshow_sequence_detail_crud",
    ),
    path(
        "api/slideshow-playlist-items/",
        SlideshowPlaylistItemAPIView.as_view(),
        name="slideshow_sequence_items_crud",
    ),
    path(
        "api/slideshow-playlist-items/<int:pk>/",
        SlideshowPlaylistItemAPIView.as_view(),
        name="slideshow_sequence_item_detail_crud",
    ),
    ###############################################################################
    # DRF API Endpoints: Display Websites & Groups
    ###############################################################################
    path(
        "api/display-websites/",
        DisplayWebsiteAPIView.as_view(),
        name="display_website_crud",
    ),
    path(
        "api/display-websites/<int:pk>/",
        DisplayWebsiteAPIView.as_view(),
        name="display_website_detail_crud",
    ),
    path(
        "api/display-website-groups/",
        DisplayWebsiteGroupAPIView.as_view(),
        name="display_website_groups_crud",
    ),
    path(
        "api/display-website-groups/<int:pk>/",
        DisplayWebsiteGroupAPIView.as_view(),
        name="display_website_groups_crud",
    ),
    ###############################################################################
    # DRF API Endpoints: Scheduled Content
    ###############################################################################
    path(
        "api/scheduled-contents/",
        ScheduledContentAPIView.as_view(),
        name="scheduled_contents_crud",
    ),
    path(
        "api/scheduled-contents/<int:pk>/",
        ScheduledContentAPIView.as_view(),
        name="scheduled_contents_crud_detail",
    ),
    ###############################################################################
    # DRF API Endpoints: Recurring Scheduled Content
    ###############################################################################
    path(
        "api/recurring-scheduled-contents/",
        RecurringScheduledContentAPIView.as_view(),
        name="recurring_scheduled_contents_crud",
    ),
    path(
        "api/recurring-scheduled-contents/<int:pk>/",
        RecurringScheduledContentAPIView.as_view(),
        name="recurring_scheduled_contents_crud_detail",
    ),
    ###############################################################################
    # DRF API Endpoints: Documents
    ###############################################################################
    path("api/documents/", DocumentAPIView.as_view(), name="document-api"),
    path("api/documents/list/", DocumentListView.as_view(), name="document-api"),
    path(
        "api/documents/<int:document_id>",
        DocumentAPIView.as_view(),
        name="document-api",
    ),
    path("api/documents/images/", DocumentAPIView.as_view(), name="document-images"),
    path(
        "api/documents/file-token/<int:document_id>/",
        DocumentFileTokenView.as_view(),
        name="document-file-token",
    ),
    path(
        "api/documents/file/<int:document_id>/",
        DocumentFileView.as_view(),
        name="document-file",
    ),
    ###############################################################################
    # DRF API Endpoints: Memberships, Users & Suborganisations
    ###############################################################################
    # Organisations
    path("api/organisations/", OrganisationAPIView.as_view(), name="organisation_list"),
    path(
        "api/organisations/slide-types/",
        RegisteredSlideTypesAPIView.as_view(),
        name="organisation_slide_types",
    ),
    # Memberships
    path(
        "api/memberships/", MembershipAPIView.as_view(), name="membership_list_create"
    ),
    path(
        "api/memberships/<int:pk>/",
        MembershipDetailAPIView.as_view(),
        name="membership_detail",
    ),
    # Users
    path("api/users/", CreateUserAPIView.as_view(), name="create_user"),
    path(
        "api/organisations/<int:org_id>/users/",
        OrganisationUsersListAPIView.as_view(),
        name="org_users",
    ),
    path("api/users/<int:pk>/", UserDetailAPIView.as_view(), name="user_detail"),
    # User Info
    path("api/user/allinfo/", ShowAllUserInfoView.as_view(), name="user_all_details"),
    path("api/user/info/", ShowUsernameAndEmailView.as_view(), name="user_detail"),
    path("api/user/update/", UpdateUserAPIView.as_view(), name="update_user_detail"),
    path(
        "api/user/change-password/",
        ChangePasswordAPIView.as_view(),
        name="change-password",
    ),
    path(
        "api/user-language-preference/",
        UserLanguagePreferenceView.as_view(),
        name="user_language_preference",
    ),
    # Suborganisations
    path(
        "api/suborganisations/",
        SubOrganisationListCreateAPIView.as_view(),
        name="suborg_list_create",
    ),
    path(
        "api/suborganisations/<int:pk>/",
        SubOrganisationDetailAPIView.as_view(),
        name="suborg_detail",
    ),
    # Additional user-related endpoints
    path(
        "api/user/suborganisations/",
        UserSuborganisationsAPIView.as_view(),
        name="user_suborganisations",
    ),
    ###############################################################################
    # DRF API Endpoints: Authentication & API Keys
    ###############################################################################
    path("api/token/validate/", ValidateTokenView.as_view(), name="token_validate"),
    path("api/get-user-api-key/", UserAPIKeyView.as_view(), name="get_user_apikey"),
    path("api/get-username/", GetUsernameFromTokenView.as_view(), name="get-username"),
    path("api/token/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/branch-api-key", BranchAPIKeyView.as_view(), name="branch_api_key"),
    ###############################################################################
    # DRF API Endpoints: Active Content
    ###############################################################################
    path(
        "api/display-website/get-active-content",
        GetActiveContentAPIView.as_view(),
        name="get_active_content",
    ),
    path(
        "api/branch/get-active-content/",
        BranchActiveContentAPIView.as_view(),
        name="branch_get_active_content",
    ),
    path(
        "api/branch/get-upcoming-content/",
        BranchUpcomingContentAPIView.as_view(),
        name="branch_get_upcoming_content",
    ),
    # Latest edited slideshows & playlists for dashboard
    path(
        "api/branch/latest-edited-slideshows/",
        LatestEditedSlideshowsAPIView.as_view(),
        name="branch_latest_edited_slideshows",
    ),
    path(
        "api/branch/latest-edited-playlists/",
        LatestEditedPlaylistsAPIView.as_view(),
        name="branch_latest_edited_playlists",
    ),
    ###############################################################################
    # Django Admin
    ###############################################################################
    path("admin/", admin.site.urls),
    path("__reload__/", include("django_browser_reload.urls")),
    ###############################################################################
    # Screen Registration API
    ###############################################################################
    path(
        "api/register-screen/",
        RegisterScreenAPIView.as_view(),
        name="register_screen_api",
    ),
    path("api/create-screen/", CreateScreenAPIView.as_view(), name="create_screen_api"),
    path(
        "api/check-screen-group/",
        CheckScreenGroupAPIView.as_view(),
        name="check_screen_group_api",
    ),
    path(
        "api/branches/", BranchListCreateAPIView.as_view(), name="branches_list_create"
    ),
    path("api/branches/<int:pk>/", BranchDetailAPIView.as_view(), name="branch_detail"),
    path(
        "api/slide-templates/",
        SlideTemplateAPIView.as_view(),
        name="slide_templates_list_create",
    ),
    path(
        "api/slide-templates/<int:pk>/",
        SlideTemplateAPIView.as_view(),
        name="slide_templates_detail",
    ),
    path(
        "api/suborg-templates/",
        SuborgTemplateAPIView.as_view(),
        name="suborg_templates_list_create",
    ),
    path(
        "api/suborg-templates/<int:pk>/",
        SuborgTemplateAPIView.as_view(),
        name="suborg_templates_detail",
    ),
    path(
        "api/frontdesk_ltk_borgerservice_api_key",
        FrontdeskAPIKey.as_view(),
        name="frontdesk_api_key",
    ),
    path(
        "api/branch-url-items/",
        BranchURLCollectionItemAPIView.as_view(),
        name="branch_url_items_list_create",
    ),
    path(
        "api/branch-url-items/<int:pk>/",
        BranchURLCollectionItemAPIView.as_view(),
        name="branch_url_item_detail_crud",
    ),
    ###############################################################################
    # DRF API Endpoints: Custom Colors
    ###############################################################################
    path(
        "api/custom-colors/",
        CustomColorAPIView.as_view(),
        name="custom_colors_list",
    ),
    path(
        "api/custom-colors/<int:pk>/",
        CustomColorAPIView.as_view(),
        name="custom_colors_detail",
    ),
    ###############################################################################
    # DRF API Endpoints: Custom Fonts
    ###############################################################################
    path(
        "api/fonts/",
        CustomFontAPIView.as_view(),
        name="fonts_list_create",
    ),
    path(
        "api/fonts/<int:pk>/",
        CustomFontAPIView.as_view(),
        name="font_detail_crud",
    ),
    path(
        "api/user-language-preference/",
        UserLanguagePreferenceView.as_view(),
        name="user_language_preference",
    ),
    ###############################################################################
    # DRF API Endpoints: Email
    ###############################################################################
    path(
        "api/send-login-email/",
        SendLoginEmailView.as_view(),
        name="send_login_email",
    ),
    path(
        "api/reset-password/",
        ResetPasswordView.as_view(),
        name="reset_password",
    ),
    path(
        "api/confirm-password-reset/",
        ConfirmPasswordResetView.as_view(),
        name="confirm_password_reset",
    ),
    ###############################################################################
    # Converted Ninja API Endpoints
    ###############################################################################
    # DDB (Danish Digital Library) API endpoints
    path("api/ddb/proxy/", DDBProxyAPIView.as_view(), name="ddb_proxy"),
    path("api/ddb/options/", DDBEventOptionsAPIView.as_view(), name="ddb_options"),
    path("api/ddb/events/", DDBEventAPIView.as_view(), name="ddb_events"),
    # RSS Proxy API endpoints
    path("api/rss/rss-to-json/", RSSToJSONAPIView.as_view(), name="rss_to_json"),
    path("api/rss/weather/", WeatherAPIView.as_view(), name="weather_data"),
    path(
        "api/rss/weather/locations/",
        WeatherLocationsAPIView.as_view(),
        name="weather_locations",
    ),
    # SpeedAdmin API endpoints
    path("api/speedadmin/", SpeedAdminDataAPIView.as_view(), name="speedadmin_data"),
    path(
        "api/speedadmin/schools/",
        SpeedAdminSchoolsAPIView.as_view(),
        name="speedadmin_schools",
    ),
    # WinKAS API endpoints
    path(
        "api/winkas/locations/",
        WinKASLocationsAPIView.as_view(),
        name="winkas_locations",
    ),
    path(
        "api/winkas/bookings/", WinKASBookingsAPIView.as_view(), name="winkas_bookings"
    ),
    # KMD API endpoints
    path("api/kmd/", KMDDataAPIView.as_view(), name="kmd_data"),
    path("api/kmd/locations/", KMDLocationsAPIView.as_view(), name="kmd_locations"),
    ###############################################################################
    # Authentication endpoints
    ###############################################################################
    path("auth/signin/", SignInView.as_view(), name="osauth_signin"),
    path("auth/whoami/", WhoAmIView.as_view(), name="osauth_whoami"),
    path("auth/sso/code/", SSOAuthCodeView.as_view(), name="osauth_sso_code"),
]
