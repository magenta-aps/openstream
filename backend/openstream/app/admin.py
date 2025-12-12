# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import User

from app.models import (
    Organisation,
    OrganisationAPIAccess,
    SubOrganisation,
    Branch,
    OrganisationMembership,
    UserExtended,
    Category,
    Tag,
    Slideshow,
    SlideshowPlaylist,
    SlideshowPlaylistItem,
    Wayfinding,
    DisplayWebsite,
    DisplayWebsiteGroup,
    ScheduledContent,
    RecurringScheduledContent,
    Document,
    SlideTemplate,
    GlobalSlideTemplate,
    BranchURLCollectionItem,
    CustomColor,
    CustomFont,
    SlideshowPlayerAPIKey,
    RegisteredSlideTypes,
)


class UserExtendedInline(admin.StackedInline):
    model = UserExtended
    can_delete = False
    verbose_name_plural = "User Extended"


@admin.register(BranchURLCollectionItem)
class BranchURLCollectionItemAdmin(admin.ModelAdmin):
    list_display = ("branch", "url")


@admin.register(UserExtended)
class UserExtendedAdmin(admin.ModelAdmin):
    list_display = ("user", "language_preference")


@admin.register(SlideTemplate)
class SlideTemplateAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "organisation", "category")
    list_filter = ("organisation", "category", "tags")
    search_fields = ("name",)
    filter_horizontal = ("tags",)


@admin.register(GlobalSlideTemplate)
class GlobalSlideTemplateAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "aspect_ratio", "isLegacy", "updated_at")
    list_filter = ("aspect_ratio", "isLegacy")
    search_fields = ("name",)


# Extend the built-in UserAdmin to show the inline
class CustomUserAdmin(UserAdmin):
    inlines = [UserExtendedInline]


# Unregister the default User admin and re-register with our custom admin
admin.site.unregister(User)
admin.site.register(User, CustomUserAdmin)


###############################################################################
# Category & Tag Admin
###############################################################################


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)


###############################################################################
# Organisation / SubOrganisation / Branch
###############################################################################


@admin.register(Organisation)
class OrganisationAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)


@admin.register(OrganisationAPIAccess)
class OrganisationAPIAccessAdmin(admin.ModelAdmin):
    list_display = ("organisation", "api_name", "is_active", "created_at", "updated_at")
    list_filter = ("api_name", "is_active", "created_at")
    search_fields = ("organisation__name",)
    readonly_fields = ("created_at", "updated_at")

    fieldsets = (
        (None, {"fields": ("organisation", "api_name", "is_active")}),
        (
            "Timestamps",
            {"fields": ("created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )


@admin.register(SubOrganisation)
class SubOrganisationAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "organisation")
    search_fields = ("name",)
    list_filter = ("organisation",)


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "suborganisation")
    search_fields = ("name",)
    list_filter = ("suborganisation",)


@admin.register(OrganisationMembership)
class OrganisationMembershipAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "organisation", "suborganisation", "branch", "role")
    list_filter = ("role", "organisation", "suborganisation", "branch")
    search_fields = ("user__username", "user__email")


###############################################################################
# Slideshow & Playlist
###############################################################################


@admin.register(Slideshow)
class SlideshowAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "category",
        "mode",
        "branch",
        "created_by",
        "previewWidth",
        "previewHeight",
        "updated_at",
    )
    list_filter = ("branch", "category", "mode", "tags")
    search_fields = ("name",)
    filter_horizontal = ("tags",)


@admin.register(SlideshowPlaylist)
class SlideshowPlaylistAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "branch", "created_by")
    list_filter = ("branch",)
    search_fields = ("name",)


@admin.register(SlideshowPlaylistItem)
class SlideshowPlaylistItemAdmin(admin.ModelAdmin):
    list_display = ("id", "slideshow_playlist", "slideshow", "position")
    list_filter = ("slideshow_playlist",)
    search_fields = ("slideshow_playlist__name", "slideshow__name")


@admin.register(Wayfinding)
class WayfindingAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "branch",
        "created_by",
        "updated_at",
    )
    list_filter = ("branch",)
    search_fields = ("name",)


###############################################################################
# Display & Scheduling
###############################################################################


@admin.register(DisplayWebsite)
class DisplayWebsiteAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "branch", "get_suborganisation", "get_organisation")
    list_filter = (
        "branch__suborganisation__organisation",
        "branch__suborganisation",
        "branch",
    )
    search_fields = (
        "name",
        "branch__name",
        "branch__suborganisation__name",
        "branch__suborganisation__organisation__name",
    )

    def get_suborganisation(self, obj):
        if obj.branch:
            return obj.branch.suborganisation
        return None

    get_suborganisation.short_description = "Sub-organisation"
    get_suborganisation.admin_order_field = "branch__suborganisation"

    def get_organisation(self, obj):
        if obj.branch and obj.branch.suborganisation:
            return obj.branch.suborganisation.organisation
        return None

    get_organisation.short_description = "Organisation"
    get_organisation.admin_order_field = "branch__suborganisation__organisation"


@admin.register(DisplayWebsiteGroup)
class DisplayWebsiteGroupAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "branch", "default_content_display")
    list_filter = ("branch",)
    search_fields = ("name",)

    def default_content_display(self, obj):
        """
        Returns a string describing which default content is set.
        """
        if obj.default_slideshow:
            return f"Slideshow: {obj.default_slideshow.name}"
        elif obj.default_playlist:
            return f"Playlist: {obj.default_playlist.name}"
        return "None"

    default_content_display.short_description = "Default Content"


@admin.register(ScheduledContent)
class ScheduledContentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "display_website_group",
        "scheduled_content_display",
        "start_time",
        "end_time",
    )
    list_filter = ("display_website_group", "start_time", "end_time")
    search_fields = ("display_website_group__name",)

    def scheduled_content_display(self, obj):
        """
        Returns a string describing which scheduled content is set.
        """
        if obj.slideshow:
            return f"Slideshow: {obj.slideshow.name}"
        elif obj.playlist:
            return f"Playlist: {obj.playlist.name}"
        return "None"

    scheduled_content_display.short_description = "Scheduled Content"


@admin.register(RecurringScheduledContent)
class RecurringScheduledContentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "display_website_group",
        "recurring_content_display",
        "weekday_display_name",
        "start_time",
        "end_time",
        "active_from",
        "active_until",
    )
    list_filter = ("display_website_group", "weekday", "active_from", "active_until")
    search_fields = ("display_website_group__name",)

    def recurring_content_display(self, obj):
        """
        Returns a string describing which recurring content is set.
        """
        if obj.slideshow:
            return f"Slideshow: {obj.slideshow.name}"
        elif obj.playlist:
            return f"Playlist: {obj.playlist.name}"
        return "None"

    recurring_content_display.short_description = "Recurring Content"

    def weekday_display_name(self, obj):
        return obj.get_weekday_display_name()

    weekday_display_name.short_description = "Weekday"


###############################################################################
# Documents
###############################################################################


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "branch", "uploaded_at")
    list_filter = ("branch", "uploaded_at")
    search_fields = ("title",)


###############################################################################
# Custom Colors Admin
###############################################################################


@admin.register(CustomColor)
class CustomColorAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "hexValue", "type", "organisation")
    list_filter = ("organisation", "type")
    search_fields = ("name", "hexValue", "organisation__name")
    ordering = ("organisation", "type", "name")


###############################################################################
# Custom Fonts Admin
###############################################################################


@admin.register(CustomFont)
class CustomFontAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "font_url",
        "organisation",
    )
    list_filter = ("organisation",)
    search_fields = ("name", "organisation__name")
    ordering = ("organisation", "name")


###############################################################################
# API Keys
###############################################################################


@admin.register(SlideshowPlayerAPIKey)
class SlideshowPlayerAPIKeyAdmin(admin.ModelAdmin):
    list_display = ("id", "branch", "key", "is_active", "created_at")
    list_filter = ("is_active", "branch")
    search_fields = ("branch__name", "key")


###############################################################################
# Registered Slide Types Admin
###############################################################################


@admin.register(RegisteredSlideTypes)
class RegisteredSlideTypesAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "organisation",
        "slide_type_id",
        "get_slide_type_name",
        "created_at",
    )
    list_filter = ("organisation", "slide_type_id", "created_at")
    search_fields = ("organisation__name",)
    ordering = ("organisation", "slide_type_id")
    readonly_fields = ("created_at", "updated_at", "name")

    fields = ("organisation", "slide_type_id")

    def get_slide_type_name(self, obj):
        """Display the human-readable name of the slide type"""
        return obj.get_slide_type_id_display()

    get_slide_type_name.short_description = "Slide Type Name"
