# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
import logging
import os
import uuid

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.validators import MinLengthValidator, MinValueValidator
from django.db import models, transaction
from django.utils import timezone
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _

from .utils import (
    calculate_aspect_ratio,
    create_hashed_filename,
    generate_content_hash,
)

logger = logging.getLogger(__name__)

###############################################################################
# Users
###############################################################################


class UserExtended(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    language_preference = models.CharField(max_length=255, default="en")

    def __str__(self):
        return self.user.username

    def update_user_info(self, user_data, language_preference=None):
        with transaction.atomic():
            self.user.username = user_data.get("username", self.user.username)
            self.user.email = user_data.get("email", self.user.email)
            self.user.first_name = user_data.get("first_name", self.user.first_name)
            self.user.last_name = user_data.get("last_name", self.user.last_name)
            self.user.save()

            if language_preference is not None:
                self.language_preference = language_preference

            self.save()


###############################################################################
# Organisation
###############################################################################


class Organisation(models.Model):
    name = models.CharField(max_length=255, unique=True)
    uri_name = models.SlugField(max_length=255, unique=True)

    def __str__(self):
        return self.name

    def _generate_unique_uri_name(self, base_slug):
        """Create a slug based on the supplied base and keep it unique."""
        candidate = base_slug
        suffix = 2

        while (
            Organisation.objects.exclude(pk=self.pk).filter(uri_name=candidate).exists()
        ):
            candidate = f"{base_slug}-{suffix}"
            suffix += 1

        return candidate

    def save(self, *args, **kwargs):
        """Ensure the URI-safe name exists, defaulting to a slug of the display name."""
        slug_input = self.uri_name or self.name
        desired_slug = slugify(slug_input or "")

        if not desired_slug:
            desired_slug = f"organisation-{uuid.uuid4().hex[:8]}"

        self.uri_name = self._generate_unique_uri_name(desired_slug)

        super().save(*args, **kwargs)


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


class OrganisationMembership(models.Model):
    class Role(models.TextChoices):
        SUPER_ADMIN = "super_admin", _("Super Admin")
        ORG_ADMIN = "org_admin", _("Organisation Admin")
        ORG_USER = "org_user", _("Organisation User")
        SUBORG_ADMIN = "suborg_admin", _("Suborganisation Admin")
        BRANCH_ADMIN = "branch_admin", _("Branch Admin")
        EMPLOYEE = "employee", _("Employee")

    user = models.ForeignKey(
        User, related_name="organisation_memberships", on_delete=models.CASCADE
    )
    organisation = models.ForeignKey(
        Organisation,
        related_name="memberships",
        on_delete=models.CASCADE,
        null=True,
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
    role = models.CharField(max_length=20, choices=Role.choices)

    class Meta:
        unique_together = ("user", "organisation", "suborganisation", "branch")

    def clean(self):
        # Validation logic broken down into readable steps
        self._validate_super_admin()
        self._validate_hierarchy_consistency()
        self._validate_role_requirements()
        super().clean()

    def _validate_super_admin(self):
        """Super Admin cannot have suborg/branch; others must have organisation."""
        if self.role == self.Role.SUPER_ADMIN:
            if self.suborganisation or self.branch:
                raise ValidationError("Super Admin must not have suborg or branch.")
        elif self.organisation is None:
            raise ValidationError(
                f"{self.get_role_display()} must specify an organisation."
            )

    def _validate_hierarchy_consistency(self):
        """Ensure Branch belongs to the Suborganisation."""
        if self.branch and (
            not self.suborganisation
            or self.branch.suborganisation != self.suborganisation
        ):
            raise ValidationError(
                "Branch must belong to the specified suborganisation."
            )

    def _validate_role_requirements(self):
        """Ensure specific roles have specific hierarchy fields set."""
        if self.role == self.Role.ORG_ADMIN:
            if self.suborganisation or self.branch:
                raise ValidationError("Org Admin cannot specify suborg or branch.")

        elif self.role == self.Role.SUBORG_ADMIN:
            if not self.suborganisation or self.branch:
                raise ValidationError(
                    "Suborg Admin must specify suborganisation but no branch."
                )

        elif self.role == self.Role.BRANCH_ADMIN:
            if not self.suborganisation or not self.branch:
                raise ValidationError(
                    "Branch Admin must specify suborganisation and branch."
                )

        elif self.role == self.Role.EMPLOYEE:
            if not self.suborganisation or not self.branch:
                raise ValidationError(
                    "Employee must specify both suborganisation and branch."
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        if self.role == self.Role.SUPER_ADMIN:
            return f"[SUPER ADMIN] {self.user.username}"
        return f"[{self.get_role_display().upper()}] {self.user.username}"


###############################################################################
# Content
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
    preview_width = models.IntegerField(validators=[MinValueValidator(1)], default=1920)
    preview_height = models.IntegerField(
        validators=[MinValueValidator(1)], default=1080
    )
    is_custom_dimensions = models.BooleanField(default=True)
    slideshow_data = models.JSONField(default=dict, blank=True, null=True)
    is_legacy = models.BooleanField(
        default=False,
        help_text="Set to True for older manage_content that must stay on the fixed 200x200 grid",
    )
    # Track when this slideshow was last edited (auto-updated on save)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def aspect_ratio(self):
        """Calculate and return the aspect ratio based on preview_width and preview_height."""
        return calculate_aspect_ratio(self.preview_width, self.preview_height)


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
    slide_data = models.JSONField(default=dict, blank=True, null=True)
    is_legacy = models.BooleanField(
        default=False,
        help_text="Legacy templates stay on the fixed 200x200 grid instead of per-pixel cells",
    )
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

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class GlobalSlideTemplate(models.Model):
    """Org-less template managed centrally by the application team."""

    name = models.CharField(max_length=255)
    slide_data = models.JSONField(default=dict, blank=True, null=True)
    thumbnail_url = models.TextField(
        blank=True,
        null=True,
        help_text="Base64 encoded data URL representing the template thumbnail",
    )
    preview_width = models.IntegerField(validators=[MinValueValidator(1)], default=1920)
    preview_height = models.IntegerField(
        validators=[MinValueValidator(1)], default=1080
    )
    aspect_ratio = models.CharField(
        max_length=10,
        default="16:9",
        help_text='The aspect ratio for this template, e.g. "16:9", "4:3", "9:16"',
    )
    is_legacy = models.BooleanField(
        default=False,
        help_text="Legacy templates stay on the fixed 200x200 grid instead of per-pixel cells",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


###############################################################################
# Playlist
###############################################################################


class AspectRatioValidatorMixin:
    """Mixin to validate aspect ratio compatibility."""

    def validate_aspect_ratio_match(
        self, source_ratio, target_ratio, error_message=None
    ):
        if source_ratio != target_ratio:
            if not error_message:
                error_message = _(
                    f"Aspect ratio ({source_ratio}) does not match target aspect ratio ({target_ratio})."
                )
            raise ValidationError(error_message)


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


class SlideshowPlaylistItem(AspectRatioValidatorMixin, models.Model):
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
            self.validate_aspect_ratio_match(
                self.slideshow.aspect_ratio,
                self.slideshow_playlist.aspect_ratio,
                _(
                    f"Slideshow aspect ratio ({self.slideshow.aspect_ratio}) does not match playlist aspect ratio ({self.slideshow_playlist.aspect_ratio}). Only slideshows with matching aspect ratios can be added to this playlist."
                ),
            )

        super().clean()

    def save(self, *args, **kwargs):
        # Call full_clean to ensure our custom validation is run.
        self.full_clean()

        with transaction.atomic():
            # If no position is specified, automatically set the next available position.
            if self.position is None:
                # Lock the playlist to prevent concurrent additions
                _ = SlideshowPlaylist.objects.select_for_update().get(
                    pk=self.slideshow_playlist_id
                )
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
# Screens
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


class DisplayWebsiteGroup(AspectRatioValidatorMixin, models.Model):
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
            self.validate_aspect_ratio_match(
                self.default_slideshow.aspect_ratio,
                self.aspect_ratio,
                f"Default slideshow aspect ratio ({self.default_slideshow.aspect_ratio}) does not match group aspect ratio ({self.aspect_ratio}).",
            )

        if self.default_playlist:
            self.validate_aspect_ratio_match(
                self.default_playlist.aspect_ratio,
                self.aspect_ratio,
                f"Default playlist aspect ratio ({self.default_playlist.aspect_ratio}) does not match group aspect ratio ({self.aspect_ratio}).",
            )

    def save(self, *args, **kwargs):
        self.clean()  # Validate before saving
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class DisplayWebsite(AspectRatioValidatorMixin, models.Model):
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
        if self.display_website_group:
            self.validate_aspect_ratio_match(
                self.aspect_ratio,
                self.display_website_group.aspect_ratio,
                f"Display aspect ratio ({self.aspect_ratio}) does not match group aspect ratio ({self.display_website_group.aspect_ratio}). Only displays with matching aspect ratios can be added to this group.",
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


###############################################################################
# Scheduling
###############################################################################


class ContentValidationMixin:
    """Mixin to validate content selection and aspect ratios."""

    def clean_content_and_ratios(self):
        # 1. Validate exactly one content source
        if (self.slideshow is None and self.playlist is None) or (
            self.slideshow is not None and self.playlist is not None
        ):
            raise ValidationError("Exactly one of slideshow or playlist must be set.")

        # 2. Validate Aspect Ratios
        if self.display_website_group:
            group_ratio = self.display_website_group.aspect_ratio

            if self.slideshow and self.slideshow.aspect_ratio != group_ratio:
                raise ValidationError(
                    f"Slideshow aspect ratio ({self.slideshow.aspect_ratio}) "
                    f"does not match group ({group_ratio})."
                )

            if self.playlist and self.playlist.aspect_ratio != group_ratio:
                raise ValidationError(
                    f"Playlist aspect ratio ({self.playlist.aspect_ratio}) "
                    f"does not match group ({group_ratio})."
                )


class ScheduledContent(ContentValidationMixin, models.Model):
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
        from .services import validate_scheduled_content

        # 1. Run Shared Validation (Content Source & Aspect Ratios)
        self.clean_content_and_ratios()

        # 2. Run ScheduledContent Specific Validation
        if self.start_time is None or self.end_time is None:
            raise ValidationError(
                "Start and End times are required when scheduling content."
            )

        validate_scheduled_content(
            self.start_time,
            self.end_time,
            self.display_website_group,
            self.combine_with_default,
            instance_id=self.pk,
        )

        super().clean()

    def save(self, *args, **kwargs):
        self.full_clean()  # Validate before saving
        super().save(*args, **kwargs)

    def __str__(self):
        content = self.slideshow if self.slideshow is not None else self.playlist
        return f"Scheduled Content for {content}"


class RecurringScheduledContent(ContentValidationMixin, models.Model):
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
        from .services import validate_recurring_content

        # 1. Run Shared Validation (Content Source & Aspect Ratios)
        self.clean_content_and_ratios()

        # 2. Run RecurringContent Specific Validation
        if self.start_time >= self.end_time:
            raise ValidationError("Start time must be before end time.")

        if self.active_until and self.active_from > self.active_until:
            raise ValidationError("Active from date must be before active until date.")

        validate_recurring_content(
            self.weekday,
            self.start_time,
            self.end_time,
            self.active_from,
            self.active_until,
            self.display_website_group,
            self.combine_with_default,
            instance_id=self.pk,
        )

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
# Documents
###############################################################################


class DocumentCategory(models.Model):
    """Document-specific category that mirrors frontend documents view."""

    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


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

    class ProcessingStatus(models.TextChoices):
        PENDING = "PENDING", _("Pending")
        PROCESSING = "PROCESSING", _("Processing")
        COMPLETED = "COMPLETED", _("Completed")
        FAILED = "FAILED", _("Failed")

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
    processing_status = models.CharField(
        max_length=20,
        choices=ProcessingStatus.choices,
        default=ProcessingStatus.COMPLETED,
        help_text=_("Status of background processing (e.g. PDF conversion)."),
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
        # 1. Validation and Setup
        ext = self.clean()  # Returns extension, raises ValidationError if invalid
        detected_type = self.VALID_EXTENSIONS[ext]
        self.file_type = detected_type

        # 2. Skip processing if this is an update and file hasn't changed
        if self.pk:
            try:
                orig = Document.objects.get(pk=self.pk)
                if orig.file == self.file:
                    # Keep original type if exists, else update it
                    self.file_type = orig.file_type or detected_type
                    return super().save(*args, **kwargs)
            except Document.DoesNotExist:
                pass  # Proceed as new object

        # 3. Handle PDF Conversion (Special Case)
        # Note: This logic replaces the original PDF with the PNG thumbnail.
        if detected_type == self.FileType.PDF:
            # Just hash the PDF so it has a unique name
            content_hash = generate_content_hash(self.file)
            if content_hash:
                self.file.name = create_hashed_filename(self.file.name, content_hash)

            # Set status to PENDING for PDFs
            self.processing_status = self.ProcessingStatus.PENDING

        # 4. Handle Video and Generic Files (Hashing only)
        # We group MP4, WEBM, and 'Other' logic as they just need hashing
        else:
            content_hash = generate_content_hash(self.file)
            if content_hash:
                self.file.name = create_hashed_filename(self.file.name, content_hash)

            # Non-PDFs are completed immediately
            self.processing_status = self.ProcessingStatus.COMPLETED

        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # Delete the file from storage
        if self.file:
            self.file.delete(save=False)
        super().delete(*args, **kwargs)


###############################################################################
# Assets
###############################################################################


class CustomColor(models.Model):
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    hex_value = models.CharField(max_length=7)  # e.g., '#RRGGBB'
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
        return f"{self.organisation.name} - {self.type}: {self.name} ({self.hex_value})"

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.position in (None, 0) and self.organisation_id:
                # Lock the organisation
                _ = Organisation.objects.select_for_update().get(
                    pk=self.organisation_id
                )
                max_position = (
                    CustomColor.objects.filter(organisation=self.organisation)
                    .exclude(pk=self.pk)
                    .aggregate(models.Max("position"))["position__max"]
                    or 0
                )
                self.position = max_position + 1
            super().save(*args, **kwargs)


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
        with transaction.atomic():
            if self.position in (None, 0) and self.organisation_id:
                # Lock the organisation
                _ = Organisation.objects.select_for_update().get(
                    pk=self.organisation_id
                )
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
# Auth
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


###############################################################################
# Integrations
###############################################################################


class OrganisationAPIAccess(models.Model):
    class ApiService(models.TextChoices):
        WINKAS = "winkas", "WinKAS"
        KMD = "kmd", "KMD"
        SPEEDADMIN = "speedadmin", "SpeedAdmin"

    organisation = models.ForeignKey(
        Organisation, on_delete=models.CASCADE, related_name="api_access"
    )
    api_name = models.CharField(
        max_length=20,
        choices=ApiService.choices,
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


class RegisteredSlideTypes(models.Model):
    """
    Represents registered slide types for an organisation.
    Each slide type is identified by a choice that matches
    the frontend slide type system.
    """

    class SlideType(models.IntegerChoices):
        DDB_EVENTS_API = 1, "DDB Events API"
        NEWSFEED_IMAGE = 3, "Newsfeed with Image"
        DREAMBROKER = 4, "Dreambroker"
        NEWSTICKER = 5, "Newsticker"
        SPEED_ADMIN = 6, "Speed Admin"
        CLOCK = 7, "Clock"
        DR_STREAMS = 8, "DR Streams"
        KMD_FORENING = 9, "KMD Foreningsportalen"
        FRONTDESK = 10, "Frontdesk LTK Borgerservice"
        WINKAS = 11, "WinKAS"

    organisation = models.ForeignKey(
        Organisation, on_delete=models.CASCADE, related_name="registered_slide_types"
    )

    slide_type_id = models.IntegerField(
        choices=SlideType.choices,
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
