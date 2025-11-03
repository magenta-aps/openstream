# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
import os
import uuid
import tempfile
import subprocess
import logging
from io import BytesIO
import hashlib

import fitz
from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.core.validators import MinLengthValidator, MinValueValidator
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils.translation import gettext_lazy as _
from django.utils import timezone

logger = logging.getLogger(__name__)


###############################################################################
# Utility Functions
###############################################################################


def calculate_aspect_ratio(width, height):
    """
    Calculate aspect ratio from width and height and return as a standardized string.
    Common aspect ratios are simplified to their standard format.
    """
    from math import gcd

    if not width or not height or width <= 0 or height <= 0:
        return "16:9"  # Default fallback

    # Calculate GCD to simplify the ratio
    common_divisor = gcd(int(width), int(height))
    simplified_width = int(width) // common_divisor
    simplified_height = int(height) // common_divisor

    # Map common ratios to their standard representation
    ratio_map = {
        (16, 9): "16:9",
        (4, 3): "4:3",
        (21, 9): "21:9",
        (9, 16): "9:16",
        (3, 4): "3:4",
        (9, 21): "9:21",
        (64, 27): "21:9",  # 2.37:1 mapped to 21:9
        (37, 20): "1.85:1",  # Common cinema ratio
        (239, 100): "2.39:1",  # Common widescreen ratio
        (185, 100): "1.85:1",
        (1, 1): "1:1",  # Square
    }

    # Check if this matches a common ratio
    ratio_key = (simplified_width, simplified_height)
    if ratio_key in ratio_map:
        return ratio_map[ratio_key]

    # For uncommon ratios, return the simplified form
    return f"{simplified_width}:{simplified_height}"


###############################################################################
# Organisations and Memberships
###############################################################################


class UserExtended(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    language_preference = models.CharField(max_length=255, default="en")

    def __str__(self):
        return self.user.username

    def update_user_info(self, user_data, language_preference=None):
        self.user.username = user_data.get("username", self.user.username)
        self.user.email = user_data.get("email", self.user.email)
        self.user.first_name = user_data.get("first_name", self.user.first_name)
        self.user.last_name = user_data.get("last_name", self.user.last_name)
        self.user.save()

        if language_preference is not None:
            self.language_preference = language_preference

        self.save()


class Organisation(models.Model):
    name = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.name


class OrganisationAPIAccess(models.Model):
    """
    Controls which external APIs an organisation has access to.
    Multiple objects can be created for the same organisation
    to grant access to multiple APIs.
    """

    API_CHOICES = [
        ("winkas", "WinKAS"),
        ("kmd", "KMD"),
        ("speedadmin", "SpeedAdmin"),
    ]

    organisation = models.ForeignKey(
        Organisation, on_delete=models.CASCADE, related_name="api_access"
    )
    api_name = models.CharField(
        max_length=20,
        choices=API_CHOICES,
        help_text="The external API this organisation has access to",
    )
    is_active = models.BooleanField(
        default=True, help_text="Whether this API access is currently active"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("organisation", "api_name")
        verbose_name = "Organisation API Access"
        verbose_name_plural = "Organisation API Access"

    def __str__(self):
        status = "Active" if self.is_active else "Inactive"
        return f"{self.organisation.name} - {self.get_api_name_display()} ({status})"


class SubOrganisation(models.Model):
    name = models.CharField(max_length=255)
    organisation = models.ForeignKey(
        Organisation, related_name="suborganisations", on_delete=models.CASCADE
    )

    def __str__(self):
        return f"{self.organisation.name} - {self.name}"


class Branch(models.Model):
    """
    Each SubOrganisation can have multiple Branches.
    Content (Slideshow, Playlist, etc.) is now owned at the Branch level.
    """

    name = models.CharField(max_length=255)
    suborganisation = models.ForeignKey(
        SubOrganisation, related_name="branches", on_delete=models.CASCADE
    )

    def __str__(self):
        return f"{self.suborganisation.organisation.name} / {self.suborganisation.name} / {self.name}"

    class Meta:
        # Ensure branch names are unique within the same suborganisation
        unique_together = (("suborganisation", "name"),)


class BranchURLCollectionItem(models.Model):
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name="url_collection_items",
    )
    url = models.URLField(
        max_length=255, help_text="Enter the URL of the frequently used website."
    )

    def __str__(self):
        return f"{self.branch} - {self.url}"


ROLE_CHOICES = (
    ("super_admin", "Super Admin"),
    ("org_admin", "Organisation Admin"),
    ("suborg_admin", "Suborganisation Admin"),
    ("branch_admin", "Branch Admin"),
    ("employee", "Employee"),
)


class OrganisationMembership(models.Model):
    user = models.ForeignKey(
        User, related_name="organisation_memberships", on_delete=models.CASCADE
    )
    organisation = models.ForeignKey(
        Organisation,
        related_name="memberships",
        on_delete=models.CASCADE,
        null=True,  # Allow null for super_admins
        blank=True,
    )
    suborganisation = models.ForeignKey(
        SubOrganisation,
        related_name="memberships",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    branch = models.ForeignKey(
        Branch,
        related_name="memberships",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)

    class Meta:
        unique_together = ("user", "organisation", "suborganisation", "branch")

    def clean(self):
        # Super Admin: organisation can be null, others must have it
        if self.role == "super_admin":
            if self.suborganisation or self.branch:
                raise ValidationError("super_admin must not have suborg or branch.")
        else:
            if self.organisation is None:
                raise ValidationError(f"{self.role} must specify an organisation.")

        # Branch and suborg consistency
        if self.branch and (
            not self.suborganisation
            or self.branch.suborganisation != self.suborganisation
        ):
            raise ValidationError(
                "Branch must belong to the specified suborganisation."
            )

        if self.role == "org_admin":
            if self.suborganisation or self.branch:
                raise ValidationError("org_admin cannot specify suborg or branch.")

        elif self.role == "suborg_admin":
            if not self.suborganisation or self.branch:
                raise ValidationError(
                    "suborg_admin must specify suborganisation but no branch."
                )

        elif self.role == "branch_admin":
            if not self.suborganisation or not self.branch:
                raise ValidationError(
                    "branch_admin must specify suborganisation and branch."
                )

        elif self.role == "employee":
            if not self.suborganisation or not self.branch:
                raise ValidationError(
                    "employee must specify both suborganisation and branch."
                )

        super().clean()

    def __str__(self):
        if self.role == "super_admin":
            return f"[SUPER ADMIN] {self.user.username}"
        elif self.role == "org_admin":
            return f"[ORG ADMIN] {self.user.username} for {self.organisation.name}"
        elif self.role == "suborg_admin":
            return f"[SUBORG ADMIN] {self.user.username} in {self.suborganisation}"
        elif self.role == "branch_admin":
            return f"[BRANCH ADMIN] {self.user.username} in {self.branch}"
        else:
            return f"[EMPLOYEE] {self.user.username} in {self.branch}"


###############################################################################
# Category & Tag Models
###############################################################################


class Category(models.Model):
    """
    A simple Category to be optionally assigned to a Slideshow.
    """

    name = models.CharField(max_length=100, validators=[MinLengthValidator(1)])
    organisation = models.ForeignKey(
        Organisation, on_delete=models.CASCADE, null=True, blank=True
    )

    def __str__(self):
        return self.name

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "organisation"],
                name="unique_category_name_per_organisation",
            )
        ]


class DocumentCategory(models.Model):
    """
    Much like Category, but reserved for documents
    """

    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


class Tag(models.Model):
    """
    A simple Tag to be optionally assigned to a Slideshow.
    One Slideshow can have multiple Tags.
    """

    name = models.CharField(max_length=100, validators=[MinLengthValidator(1)])
    organisation = models.ForeignKey(
        Organisation, on_delete=models.CASCADE, null=True, blank=True
    )

    def __str__(self):
        return self.name

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "organisation"], name="unique_tag_name_per_organisation"
            )
        ]


###############################################################################
# Slideshow
###############################################################################


SLIDESHOW_MODE_CHOICES = (
    ("slideshow", "Slideshow"),
    ("interactive", "Interactive"),
)


class Slideshow(models.Model):
    name = models.CharField(max_length=255)

    # Optional foreign key to Category
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="manage_content",
    )

    # Optional ManyToMany for Tags
    tags = models.ManyToManyField(
        Tag,
        blank=True,
        related_name="manage_content",
    )

    # Mode choice
    mode = models.CharField(
        max_length=20,
        choices=SLIDESHOW_MODE_CHOICES,
        default="slideshow",
    )

    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name="manage_content",
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="slideshows_created",
    )
    previewWidth = models.IntegerField(validators=[MinValueValidator(1)], default=1920)
    previewHeight = models.IntegerField(validators=[MinValueValidator(1)], default=1080)
    isCustomDimensions = models.BooleanField(default=True)
    slideshow_data = models.JSONField(default=dict, blank=True, null=True)
    # Track when this slideshow was last edited (auto-updated on save)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def aspect_ratio(self):
        """Calculate and return the aspect ratio based on previewWidth and previewHeight."""
        return calculate_aspect_ratio(self.previewWidth, self.previewHeight)


###############################################################################
# Wayfinding
###############################################################################


class Wayfinding(models.Model):
    name = models.CharField(max_length=255)

    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name="wayfinding_systems",
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="wayfinding_created",
    )
    wayfinding_data = models.JSONField(default=dict, blank=True, null=True)
    # Track when this wayfinding system was last edited (auto-updated on save)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


###############################################################################
# Playlist
###############################################################################


class SlideshowPlaylist(models.Model):
    name = models.CharField(max_length=255)
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name="playlists",
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="playlists_created",
    )
    # Track when this playlist was last edited (auto-updated on save)
    updated_at = models.DateTimeField(auto_now=True)

    # Aspect ratio for this playlist - all slideshows in this playlist must match this ratio
    aspect_ratio = models.CharField(
        max_length=10,
        default="16:9",
        help_text='The aspect ratio for this playlist, e.g. "16:9", "4:3", "9:16". All slideshows in this playlist must have the same aspect ratio.',
    )

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class SlideshowPlaylistItem(models.Model):
    slideshow_playlist = models.ForeignKey(
        SlideshowPlaylist, on_delete=models.CASCADE, related_name="items"
    )
    slideshow = models.ForeignKey(
        Slideshow, on_delete=models.CASCADE, related_name="slideshow_playlist_items"
    )
    position = models.IntegerField(
        validators=[MinValueValidator(1)], null=True, blank=True
    )

    class Meta:
        ordering = ["position"]

    def __str__(self):
        return f"{self.slideshow_playlist.name} - {self.slideshow.name} (Position: {self.position})"

    def clean(self):
        # Ensure interactive manage_content are not added to playlists.
        if self.slideshow and self.slideshow.mode == "interactive":
            raise ValidationError(
                _("Interactive manage_content cannot be added to playlists.")
            )

        # Ensure slideshow aspect ratio matches playlist aspect ratio
        if self.slideshow and self.slideshow_playlist:
            slideshow_aspect_ratio = self.slideshow.aspect_ratio
            playlist_aspect_ratio = self.slideshow_playlist.aspect_ratio
            if slideshow_aspect_ratio != playlist_aspect_ratio:
                raise ValidationError(
                    _(
                        f"Slideshow aspect ratio ({slideshow_aspect_ratio}) does not match playlist aspect ratio ({playlist_aspect_ratio}). Only slideshows with matching aspect ratios can be added to this playlist."
                    )
                )

        super().clean()

    def save(self, *args, **kwargs):
        # Call full_clean to ensure our custom validation is run.
        self.full_clean()

        # If no position is specified, automatically set the next available position.
        if self.position is None:
            max_position = (
                SlideshowPlaylistItem.objects.filter(
                    slideshow_playlist=self.slideshow_playlist
                ).aggregate(models.Max("position"))["position__max"]
                or 0
            )
            self.position = max_position + 1
        super().save(*args, **kwargs)

        # Touch the parent playlist's updated_at so changes to items are reflected
        try:
            SlideshowPlaylist.objects.filter(pk=self.slideshow_playlist_id).update(
                updated_at=timezone.now()
            )
        except Exception:
            # Don't let failures here stop normal save
            pass

    def delete(self, *args, **kwargs):
        playlist_id = self.slideshow_playlist_id
        super().delete(*args, **kwargs)
        try:
            if playlist_id:
                SlideshowPlaylist.objects.filter(pk=playlist_id).update(
                    updated_at=timezone.now()
                )
        except Exception:
            pass


###############################################################################
# Display Website / Scheduled Content
###############################################################################


class DisplayWebsiteGroup(models.Model):
    name = models.CharField(max_length=255)
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name="display_website_groups",
        null=True,
        blank=True,
    )
    default_slideshow = models.ForeignKey(
        Slideshow,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="default_slideshow_groups",
    )
    default_playlist = models.ForeignKey(
        SlideshowPlaylist,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="default_playlist_groups",
    )

    # Aspect ratio for this display group - only displays with matching aspect ratios can be added
    aspect_ratio = models.CharField(
        max_length=10,
        default="16:9",
        help_text='The aspect ratio for this display group, e.g. "16:9", "4:3", "9:16". Only displays with matching aspect ratios can be added to this group.',
    )

    def clean(self):
        # Ensure exactly one is set
        if (self.default_slideshow is None and self.default_playlist is None) or (
            self.default_slideshow is not None and self.default_playlist is not None
        ):
            raise ValidationError(
                "Exactly one of default_slideshow or default_playlist must be set."
            )

        # Validate aspect ratio compatibility with default content
        if self.default_slideshow:
            slideshow_aspect_ratio = self.default_slideshow.aspect_ratio
            if slideshow_aspect_ratio != self.aspect_ratio:
                raise ValidationError(
                    f"Default slideshow aspect ratio ({slideshow_aspect_ratio}) does not match group aspect ratio ({self.aspect_ratio})."
                )

        if self.default_playlist:
            playlist_aspect_ratio = self.default_playlist.aspect_ratio
            if playlist_aspect_ratio != self.aspect_ratio:
                raise ValidationError(
                    f"Default playlist aspect ratio ({playlist_aspect_ratio}) does not match group aspect ratio ({self.aspect_ratio})."
                )

    def save(self, *args, **kwargs):
        self.clean()  # Validate before saving
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class DisplayWebsite(models.Model):
    name = models.CharField(max_length=255)
    # Optional UID provided by external management systems to uniquely
    # identify a screen across hostname changes. Not required.
    uid = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    display_website_group = models.ForeignKey(
        DisplayWebsiteGroup,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="display_websites",
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="display_websites",
    )

    # Aspect ratio for this screen/display
    aspect_ratio = models.CharField(
        max_length=10,
        default="16:9",
        help_text='The aspect ratio for this display screen, e.g. "16:9", "4:3", "9:16"',
    )

    def clean(self):
        # Validate that the display's aspect ratio matches the group's aspect ratio
        if (
            self.display_website_group
            and self.display_website_group.aspect_ratio != self.aspect_ratio
        ):
            raise ValidationError(
                f"Display aspect ratio ({self.aspect_ratio}) does not match group aspect ratio ({self.display_website_group.aspect_ratio}). Only displays with matching aspect ratios can be added to this group."
            )
            # Ensure uid is globally unique within the same organisation
            if self.uid:
                org = None
                if getattr(self.branch, "suborganisation", None):
                    org = getattr(self.branch.suborganisation, "organisation", None)
                # If we have an organisation, search for same uid within that organisation
                if org:
                    if (
                        DisplayWebsite.objects.filter(
                            uid=self.uid, branch__suborganisation__organisation=org
                        )
                        .exclude(pk=self.pk)
                        .exists()
                    ):
                        raise ValidationError(
                            f"UID '{self.uid}' must be unique within the same organisation."
                        )
            super().clean()

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta:
        # Preserve name uniqueness within a branch. Additionally allow
        # lookups by uid within a branch. uid itself is optional so we do
        # not enforce uniqueness across null uids at the DB level here.
        unique_together = (("name", "branch"),)

    def __str__(self):
        return self.name


class ScheduledContent(models.Model):
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    combine_with_default = models.BooleanField(default=False)
    description = models.CharField(blank=True, null=True, max_length=2048)
    display_website_group = models.ForeignKey(
        DisplayWebsiteGroup, on_delete=models.CASCADE
    )
    slideshow = models.ForeignKey(
        Slideshow,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="scheduled_slideshows",
    )
    playlist = models.ForeignKey(
        SlideshowPlaylist,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="scheduled_playlists",
    )

    def clean(self):
        # Ensure start and end times are provided.
        if self.start_time is None or self.end_time is None:
            raise ValidationError(
                "Start and End times are required when scheduling content."
            )

        # Validate that exactly one of slideshow or playlist is set.
        if (self.slideshow is None and self.playlist is None) or (
            self.slideshow is not None and self.playlist is not None
        ):
            raise ValidationError("Exactly one of slideshow or playlist must be set.")

        # Validate aspect ratio compatibility with the display group
        if self.display_website_group:
            group_aspect_ratio = self.display_website_group.aspect_ratio

            if self.slideshow:
                slideshow_aspect_ratio = self.slideshow.aspect_ratio
                if slideshow_aspect_ratio != group_aspect_ratio:
                    raise ValidationError(
                        f"Slideshow aspect ratio ({slideshow_aspect_ratio}) does not match display group aspect ratio ({group_aspect_ratio})."
                    )

            if self.playlist:
                playlist_aspect_ratio = self.playlist.aspect_ratio
                if playlist_aspect_ratio != group_aspect_ratio:
                    raise ValidationError(
                        f"Playlist aspect ratio ({playlist_aspect_ratio}) does not match display group aspect ratio ({group_aspect_ratio})."
                    )

        # New validation:
        # Check if there is any scheduled content for the same group that overlaps this instance's time period
        # and that has combine_with_default=False. This prevents mixing override and combine entries.
        overlapping_override_qs = (
            ScheduledContent.objects.filter(
                display_website_group=self.display_website_group,
                combine_with_default=False,
            )
            .exclude(pk=self.pk)
            .filter(
                start_time__lt=self.end_time,
                end_time__gt=self.start_time,
            )
        )
        if overlapping_override_qs.exists():
            raise ValidationError(
                "Can't schedule overrides and combine on the same date."
            )

        super().clean()

    def save(self, *args, **kwargs):
        self.clean()  # Validate before saving
        super().save(*args, **kwargs)

    def __str__(self):
        content = self.slideshow if self.slideshow is not None else self.playlist
        return f"Scheduled Content for {content}"


class RecurringScheduledContent(models.Model):
    """
    Model for recurring scheduled content that repeats weekly on specific days
    """

    WEEKDAY_CHOICES = [
        (0, "Monday"),
        (1, "Tuesday"),
        (2, "Wednesday"),
        (3, "Thursday"),
        (4, "Friday"),
        (5, "Saturday"),
        (6, "Sunday"),
    ]

    weekday = models.IntegerField(
        choices=WEEKDAY_CHOICES, help_text="Day of the week (0=Monday, 6=Sunday)"
    )
    start_time = models.TimeField(help_text="Start time for the recurring event")
    end_time = models.TimeField(help_text="End time for the recurring event")
    combine_with_default = models.BooleanField(default=False)
    description = models.CharField(blank=True, null=True, max_length=2048)
    display_website_group = models.ForeignKey(
        DisplayWebsiteGroup, on_delete=models.CASCADE
    )
    slideshow = models.ForeignKey(
        Slideshow,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="recurring_scheduled_slideshows",
    )
    playlist = models.ForeignKey(
        SlideshowPlaylist,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="recurring_scheduled_playlists",
    )
    # Date range for when this recurring event is active
    active_from = models.DateField(
        help_text="Date from which this recurring event is active"
    )
    active_until = models.DateField(
        null=True,
        blank=True,
        help_text="Date until which this recurring event is active (leave blank for indefinite)",
    )

    def clean(self):
        # Validate that exactly one of slideshow or playlist is set.
        if (self.slideshow is None and self.playlist is None) or (
            self.slideshow is not None and self.playlist is not None
        ):
            raise ValidationError("Exactly one of slideshow or playlist must be set.")

        # Validate aspect ratio compatibility with the display group
        if self.display_website_group:
            group_aspect_ratio = self.display_website_group.aspect_ratio

            if self.slideshow:
                slideshow_aspect_ratio = self.slideshow.aspect_ratio
                if slideshow_aspect_ratio != group_aspect_ratio:
                    raise ValidationError(
                        f"Slideshow aspect ratio ({slideshow_aspect_ratio}) does not match display group aspect ratio ({group_aspect_ratio})."
                    )

            if self.playlist:
                playlist_aspect_ratio = self.playlist.aspect_ratio
                if playlist_aspect_ratio != group_aspect_ratio:
                    raise ValidationError(
                        f"Playlist aspect ratio ({playlist_aspect_ratio}) does not match display group aspect ratio ({group_aspect_ratio})."
                    )

        # Validate that start time is before end time
        if self.start_time >= self.end_time:
            raise ValidationError("Start time must be before end time.")

        # Validate active date range
        if self.active_until and self.active_from > self.active_until:
            raise ValidationError("Active from date must be before active until date.")

        super().clean()

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        content = self.slideshow if self.slideshow is not None else self.playlist
        weekday_name = dict(self.WEEKDAY_CHOICES)[self.weekday]
        return (
            f"Recurring {content} on {weekday_name} {self.start_time}-{self.end_time}"
        )

    def get_weekday_display_name(self):
        return dict(self.WEEKDAY_CHOICES)[self.weekday]


###############################################################################
# Document Model
###############################################################################


class Document(models.Model):
    class FileType(models.TextChoices):
        PDF = "pdf"
        PNG = "png"
        JPEG = "jpeg"
        SVG = "svg"
        GIF = "gif"
        MP4 = "mp4"
        WEBP = "WebP"
        WEBM = "WebM"
        OTHER = "Other"

    VALID_EXTENSIONS = {
        ".pdf": FileType.PDF,
        ".png": FileType.PNG,
        ".jpeg": FileType.JPEG,
        ".jpg": FileType.JPEG,  # Use same as jpeg
        ".svg": FileType.SVG,
        ".gif": FileType.GIF,
        ".mp4": FileType.MP4,
        ".webp": FileType.WEBP,
        ".webm": FileType.WEBM,
    }

    file_type = models.CharField(
        max_length=10, choices=FileType.choices, editable=False, default=FileType.OTHER
    )

    title = models.CharField(max_length=255)
    file = models.FileField(upload_to="uploads/")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    tags = models.ManyToManyField(Tag, blank=True)
    category = models.ForeignKey(
        Category, blank=True, null=True, on_delete=models.SET_NULL
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name="documents",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-uploaded_at"]

    def clean(self):
        # Ensure uploaded file has a valid extension
        ext = os.path.splitext(self.file.name)[1].lower()
        if ext not in self.VALID_EXTENSIONS:
            raise ValidationError({"error": f"Unsupported file type: {ext}"})
        return ext

    def save(self, *args, **kwargs):
        ext = self.clean()
        detected_type = self.VALID_EXTENSIONS[ext]

        # If this is an existing instance and the file attribute hasn't changed
        # we should skip all file-processing and storage operations. This avoids
        # unnecessary reads/writes to S3/MinIO which can mutate object ACLs.
        if self.pk:
            try:
                orig = type(self).objects.get(pk=self.pk)
                # If both original and current refer to the same storage name,
                # assume no file update was intended and just persist metadata.
                if (
                    getattr(orig, "file", None)
                    and getattr(self, "file", None)
                    and orig.file.name == self.file.name
                ):
                    # Preserve file_type if already present, else use detected
                    self.file_type = orig.file_type or detected_type
                    return super().save(*args, **kwargs)
            except type(self).DoesNotExist:
                # New object race — continue with normal save flow
                pass

        # Helper to produce a filename suffixed with a short content hash
        def _name_with_hash(filename, content_bytes):
            base, extension = os.path.splitext(filename)
            h = hashlib.sha256(content_bytes).hexdigest()[:12]
            return f"{base}-{h}{extension}"

        # If it's a PDF, convert before saving and use the converted image bytes for hashing
        if detected_type == self.FileType.PDF:
            try:
                # Read PDF bytes
                try:
                    self.file.seek(0)
                except Exception:
                    pass
                pdf_bytes = self.file.read()
            except Exception:
                pdf_bytes = b""

            # Convert first page to image
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            page = doc.load_page(0)
            pix = page.get_pixmap()
            img_bytes = BytesIO(pix.tobytes("png"))

            # Create a PNG filename based on original name with hash
            original_png_name = os.path.splitext(self.file.name)[0] + ".png"
            new_name = _name_with_hash(original_png_name, img_bytes.getvalue())
            img_bytes.seek(0)
            self.file = InMemoryUploadedFile(
                file=img_bytes,
                field_name="file",
                name=new_name,
                content_type="image/png",
                size=img_bytes.getbuffer().nbytes,
                charset=None,
            )

        # If it's a video, just save it directly (no compression) but rename to include content hash
        elif detected_type in [self.FileType.MP4, self.FileType.WEBM]:
            try:
                logger.info(f"Uploading video file directly: {self.file.name}")
                try:
                    self.file.seek(0)
                except Exception:
                    pass
                try:
                    content_bytes = self.file.read()
                    try:
                        self.file.seek(0)
                    except Exception:
                        pass
                    if content_bytes:
                        self.file.name = _name_with_hash(self.file.name, content_bytes)
                except Exception:
                    # If reading fails, proceed without renaming
                    pass

                detected_type = (
                    self.FileType.MP4
                    if detected_type == self.FileType.MP4
                    else self.FileType.WEBM
                )
                logger.info(
                    f"Video upload completed successfully for: {self.file.name}"
                )
            except Exception as e:
                logger.error(
                    f"Video upload failed for {getattr(self.file,'name',None)}: {str(e)}"
                )
                pass

        # For other file types (images, etc.) ensure we suffix the filename with its content hash
        else:
            try:
                try:
                    self.file.seek(0)
                except Exception:
                    pass
                content = self.file.read()
                try:
                    self.file.seek(0)
                except Exception:
                    pass
                if content and getattr(self.file, "name", None):
                    self.file.name = _name_with_hash(self.file.name, content)
            except Exception:
                pass

        self.file_type = detected_type

        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # Delete the file from storage
        if self.file:
            self.file.delete(save=False)
        super().delete(*args, **kwargs)


###############################################################################
# Custom Colors
###############################################################################


class CustomColor(models.Model):
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    hexValue = models.CharField(max_length=7)  # e.g., '#RRGGBB'
    type = models.CharField(
        max_length=50,
        choices=[
            ("primary", "Primary"),
            ("secondary", "Secondary"),
            ("accent", "Accent"),
            ("background", "Background"),
            ("text", "Text"),
        ],
    )
    position = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        unique_together = (
            "organisation",
            "name",
        )  # Ensure unique names within an organisation
        ordering = ["organisation", "position", "name"]

    def __str__(self):
        return f"{self.organisation.name} - {self.type}: {self.name} ({self.hexValue})"

    def save(self, *args, **kwargs):
        if self.position in (None, 0) and self.organisation_id:
            max_position = (
                CustomColor.objects.filter(organisation=self.organisation)
                .exclude(pk=self.pk)
                .aggregate(models.Max("position"))["position__max"]
                or 0
            )
            self.position = max_position + 1
        super().save(*args, **kwargs)


###############################################################################
# Custom Fonts
###############################################################################


class CustomFont(models.Model):
    """
    Represents a custom font linked to an Organisation.
    """

    organisation = models.ForeignKey(
        Organisation, on_delete=models.CASCADE, related_name="custom_fonts"
    )
    name = models.CharField(
        max_length=100, help_text=_("Name of the font (e.g., 'Roboto Slab')")
    )
    font_url = models.URLField(
        max_length=500, help_text=_("URL to the font file (e.g., WOFF2, TTF)")
    )
    position = models.PositiveIntegerField(null=True, blank=True)

    def __str__(self):
        return f"{self.name} ({self.organisation.name})"

    class Meta:
        verbose_name = _("Custom Font")
        verbose_name_plural = _("Custom Fonts")
        unique_together = (
            "organisation",
            "name",
        )  # Ensure unique font names per organisation
        ordering = ["organisation", "position", "name"]

    def save(self, *args, **kwargs):
        if self.position in (None, 0) and self.organisation_id:
            max_position = (
                CustomFont.objects.filter(organisation=self.organisation)
                .exclude(pk=self.pk)
                .aggregate(models.Max("position"))["position__max"]
                or 0
            )
            self.position = max_position + 1
        super().save(*args, **kwargs)


class TextFormattingSettings(models.Model):
    organisation = models.OneToOneField(
        Organisation,
        on_delete=models.CASCADE,
        related_name="text_formatting_settings",
    )
    allow_bold = models.BooleanField(default=True)
    allow_italic = models.BooleanField(default=True)
    allow_underline = models.BooleanField(default=True)
    allow_font_weight = models.BooleanField(default=True)

    def __str__(self):
        return f"Text formatting settings for {self.organisation.name}"


###############################################################################
# API Keys
###############################################################################


class SlideshowPlayerAPIKey(models.Model):
    branch = models.OneToOneField(
        "Branch",
        on_delete=models.CASCADE,
        related_name="api_key",
        help_text="This API key is automatically tied to the branch.",
    )
    key = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.branch} - {self.key}"


@receiver(post_save, sender=Branch)
def create_slideshow_player_api_key(sender, instance, created, **kwargs):
    if created:
        SlideshowPlayerAPIKey.objects.create(branch=instance)


# Keep parent slideshow.updated_at in sync when Slides change
@receiver(post_save)
def touch_slideshow_on_slide_save(sender, instance, created, **kwargs):
    # Only act for the Slide model
    if sender.__name__ != "Slide":
        return
    try:
        if instance.slideshow_id:
            Slideshow.objects.filter(pk=instance.slideshow_id).update(
                updated_at=timezone.now()
            )
    except Exception:
        pass


@receiver(post_save)
def touch_playlist_on_item_save(sender, instance, created, **kwargs):
    # Also ensure playlist items saved via API/update touch playlist (fallback)
    if sender.__name__ != "SlideshowPlaylistItem":
        return
    try:
        if instance.slideshow_playlist_id:
            SlideshowPlaylist.objects.filter(pk=instance.slideshow_playlist_id).update(
                updated_at=timezone.now()
            )
    except Exception:
        pass


@receiver(post_save)
def touch_slideshow_on_slide_delete(sender, instance, **kwargs):
    # Insensitive: Django's post_delete would be ideal but to avoid importing post_delete we'll
    # rely on callers using delete() which we've overridden on SlideshowPlaylistItem earlier.
    return


class SlideTemplate(models.Model):
    organisation = models.ForeignKey(
        Organisation, on_delete=models.CASCADE, related_name="slide_templates"
    )
    suborganisation = models.ForeignKey(
        SubOrganisation,
        on_delete=models.CASCADE,
        related_name="slide_templates",
        null=True,
        blank=True,
        help_text="If set, this template is only available to branches in this suborganisation",
    )
    parent_template = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="suborg_copies",
        help_text="If this is a suborg template, reference to the global template it was created from",
    )

    name = models.CharField(max_length=255)
    slideData = models.JSONField(default=dict, blank=True, null=True)
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="slide_templates",
    )
    tags = models.ManyToManyField(Tag, blank=True, related_name="slide_templates")

    aspect_ratio = models.CharField(
        max_length=10,
        default="16:9",
        help_text='The aspect ratio for this template, e.g. "16:9", "4:3", "9:16"',
    )

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class RegisteredSlideTypes(models.Model):
    """
    Represents registered slide types for an organisation.
    Each slide type is identified by a choice that matches
    the frontend slide type system.
    """

    SLIDE_TYPE_CHOICES = [
        (1, "DDB Events API"),
        (3, "Newsfeed with Image"),
        (4, "Dreambroker"),
        (5, "Newsticker"),
        (6, "Speed Admin"),
        (7, "Clock"),
        (8, "DR Streams"),
        (9, "KMD Foreningsportalen"),
        (10, "Frontdesk LTK Borgerservice"),
        (11, "WinKAS"),
    ]

    organisation = models.ForeignKey(
        Organisation, on_delete=models.CASCADE, related_name="registered_slide_types"
    )
    slide_type_id = models.IntegerField(
        choices=SLIDE_TYPE_CHOICES,
        help_text="Slide type that matches the frontend slide type system",
    )
    name = models.CharField(
        blank=True,
        null=True,
        max_length=255,
        help_text="Human-readable name for this slide type (auto-populated from choices if not provided)",
    )
    description = models.TextField(
        blank=True, null=True, help_text="Optional description of this slide type"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["slide_type_id"]
        unique_together = ["organisation", "slide_type_id"]
        verbose_name = "Registered Slide Type"
        verbose_name_plural = "Registered Slide Types"

    def save(self, *args, **kwargs):
        # Auto-populate name from choices if not provided
        if not self.name:
            self.name = self.get_slide_type_id_display()
        super().save(*args, **kwargs)

    def __str__(self):
        display_name = self.name or self.get_slide_type_id_display()
        return f"{self.organisation.name} - {display_name} (ID: {self.slide_type_id})"
