# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
# app/serializers.py


from django.contrib.auth.hashers import check_password
from django.contrib.auth.models import User
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Q
from django.utils import timezone
from datetime import datetime, timedelta
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from app.models import (
    # Organisation & membership
    Organisation,
    OrganisationAPIAccess,
    SubOrganisation,
    Branch,
    OrganisationMembership,
    UserExtended,
    # Category & Tag
    Category,
    Tag,
    # Slideshow & Playlist
    Slideshow,
    SlideshowPlaylist,
    SlideshowPlaylistItem,
    # Wayfinding
    Wayfinding,
    # Display & Scheduling
    DisplayWebsite,
    DisplayWebsiteGroup,
    ScheduledContent,
    RecurringScheduledContent,
    # Documents
    Document,
    SlideTemplate,
    BranchURLCollectionItem,
    CustomColor,
    CustomFont,
    RegisteredSlideTypes,
)

###############################################################################
# Generic helpers
###############################################################################


# Can be used to ensure correct role permissons.
# Be careful - if org_admin or suborg_admin changes in the model, this wont work
def has_sufficient_roles(
    user: User, roles: list[str] = ["org_admin", "suborg_admin"]
) -> bool:
    membership = OrganisationMembership.objects.filter(user=user).first()
    if not membership or membership.role not in roles:
        # raise PermissionDenied("You are not allowed to create tags.")
        return False
    return True


def make_aware_if_needed(dt):
    """Make a datetime object timezone-aware if it's naive."""
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


###############################################################################
# Organisation / SubOrganisation / Branch
###############################################################################


class OrganisationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organisation
        fields = ["id", "name"]


class OrganisationAPIAccessSerializer(serializers.ModelSerializer):
    organisation = OrganisationSerializer(read_only=True)
    organisation_id = serializers.PrimaryKeyRelatedField(
        source="organisation", queryset=Organisation.objects.all(), write_only=True
    )

    class Meta:
        model = OrganisationAPIAccess
        fields = [
            "id",
            "organisation",
            "organisation_id",
            "api_name",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class BranchURLCollectionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = BranchURLCollectionItem
        fields = ["id", "branch", "url"]


class SubOrganisationSerializer(serializers.ModelSerializer):

    organisation = serializers.StringRelatedField(read_only=True)
    organisation_id = serializers.PrimaryKeyRelatedField(
        source="organisation", queryset=Organisation.objects.all(), write_only=True
    )

    class Meta:
        model = SubOrganisation
        fields = ["id", "name", "organisation", "organisation_id"]


class BranchSerializer(serializers.ModelSerializer):
    """
    Basic serializer for Branch objects.
    """

    suborganisation = SubOrganisationSerializer(read_only=True)
    suborganisation_id = serializers.PrimaryKeyRelatedField(
        source="suborganisation",
        queryset=SubOrganisation.objects.all(),
        write_only=True,
    )

    class Meta:
        model = Branch
        fields = ["id", "name", "suborganisation", "suborganisation_id"]


###############################################################################
# Category & Tag
###############################################################################


class CategorySerializer(serializers.ModelSerializer):
    organisation = OrganisationSerializer(read_only=True)
    organisation_id = serializers.PrimaryKeyRelatedField(
        source="organisation",
        queryset=Organisation.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = Category
        fields = ["id", "name", "organisation", "organisation_id"]

    def to_representation(self, instance):
        """Customize the output representation"""
        ret = super().to_representation(instance)
        # For simple responses, we might want to exclude the nested organisation
        if "organisation" in ret and self.context.get("simple_response", False):
            ret.pop("organisation")
        return ret


class TagSerializer(serializers.ModelSerializer):
    organisation = OrganisationSerializer(read_only=True)
    organisation_id = serializers.PrimaryKeyRelatedField(
        source="organisation",
        queryset=Organisation.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = Tag
        fields = ["id", "name", "organisation", "organisation_id"]

    def to_representation(self, instance):
        """Customize the output representation"""
        ret = super().to_representation(instance)
        # For simple responses, we might want to exclude the nested organisation
        if "organisation" in ret and self.context.get("simple_response", False):
            ret.pop("organisation")
        return ret


###############################################################################
# Slideshow
###############################################################################


class SlideshowSerializer(serializers.ModelSerializer):
    """
    Updated to include:
      - category (FK) via category/category_id
      - tags (M2M) via tags/tag_ids
      - mode field
    """

    # Read-only nested representation
    category = CategorySerializer(read_only=True)
    tags = TagSerializer(many=True, read_only=True)

    # Write-only IDs
    category_id = serializers.PrimaryKeyRelatedField(
        source="category",
        queryset=Category.objects.all(),
        write_only=True,
        allow_null=True,
        required=False,
    )
    tag_ids = serializers.PrimaryKeyRelatedField(
        source="tags",
        queryset=Tag.objects.all(),
        many=True,
        write_only=True,
        required=False,
    )

    class Meta:
        model = Slideshow
        fields = [
            "id",
            "name",
            "category",  # nested read
            "category_id",  # write
            "tags",  # nested read
            "tag_ids",  # write
            "mode",
            "branch",
            "created_by",
            "previewWidth",
            "previewHeight",
            "isCustomDimensions",
            "slideshow_data",
            "aspect_ratio",  # read-only calculated property
        ]
        # If you want to prevent branch or created_by from changing:
        read_only_fields = ("branch", "created_by", "aspect_ratio")

    def to_representation(self, instance):
        """
        Example of conditionally excluding slideshow_data.
        """
        ret = super().to_representation(instance)
        include_slideshow_data = self.context.get("include_slideshow_data", True)
        if not include_slideshow_data:
            ret.pop("slideshow_data", None)
        return ret


###############################################################################
# Wayfinding
###############################################################################


class WayfindingSerializer(serializers.ModelSerializer):
    """
    Serializer for Wayfinding objects, following the same pattern as Slideshow.
    """

    class Meta:
        model = Wayfinding
        fields = [
            "id",
            "name",
            "branch",
            "created_by",
            "wayfinding_data",
            "updated_at",
        ]
        # Prevent branch or created_by from changing:
        read_only_fields = ("branch", "created_by", "updated_at")

    def to_representation(self, instance):
        """
        Example of conditionally excluding wayfinding_data.
        """
        ret = super().to_representation(instance)
        include_wayfinding_data = self.context.get("include_wayfinding_data", True)
        if not include_wayfinding_data:
            ret.pop("wayfinding_data", None)
        return ret


###############################################################################
# Playlist & Playlist Items
###############################################################################


class SlideshowPlaylistItemSerializer(serializers.ModelSerializer):
    slideshow = serializers.PrimaryKeyRelatedField(
        queryset=Slideshow.objects.all(), write_only=True
    )
    slideshow_detail = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SlideshowPlaylistItem
        fields = (
            "id",
            "slideshow",
            "slideshow_detail",
            "position",
            "slideshow_playlist",
        )

    def get_slideshow_detail(self, obj):
        return SlideshowSerializer(obj.slideshow, context=self.context).data

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        # Merge detail into "slideshow"
        rep["slideshow"] = rep.pop("slideshow_detail")
        return rep


class SlideshowPlaylistSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField()

    class Meta:
        model = SlideshowPlaylist
        fields = "__all__"
        read_only_fields = ("branch",)

    def get_items(self, obj):
        include_slides = self.context.get("include_slides", False)
        items_qs = obj.items.order_by("position")
        return SlideshowPlaylistItemSerializer(
            items_qs, many=True, context=self.context
        ).data


###############################################################################
# Display Website / DisplayWebsiteGroup
###############################################################################


class DisplayWebsiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = DisplayWebsite
        fields = "__all__"
        read_only_fields = ("branch",)


class DisplayWebsiteGroupSerializer(serializers.ModelSerializer):
    default_slideshow = SlideshowSerializer(read_only=True)
    default_slideshow_id = serializers.PrimaryKeyRelatedField(
        queryset=Slideshow.objects.all(),
        source="default_slideshow",
        write_only=True,
        allow_null=True,
        required=False,
    )
    default_playlist = SlideshowPlaylistSerializer(read_only=True)
    default_playlist_id = serializers.PrimaryKeyRelatedField(
        queryset=SlideshowPlaylist.objects.all(),
        source="default_playlist",
        write_only=True,
        allow_null=True,
        required=False,
    )

    class Meta:
        model = DisplayWebsiteGroup
        fields = "__all__"
        read_only_fields = ("branch",)

    def validate(self, data):
        # Update scenario: instance exists.
        if self.instance:
            current_slideshow = self.instance.default_slideshow
            current_playlist = self.instance.default_playlist

            new_slideshow = data.get("default_slideshow", current_slideshow)
            new_playlist = data.get("default_playlist", current_playlist)

            # If only one field is explicitly provided and is non-null, clear the other
            if (
                "default_slideshow" in data
                and data["default_slideshow"] is not None
                and "default_playlist" not in data
            ):
                data["default_playlist"] = None
                new_playlist = None
            elif (
                "default_playlist" in data
                and data["default_playlist"] is not None
                and "default_slideshow" not in data
            ):
                data["default_slideshow"] = None
                new_slideshow = None

            if (new_slideshow is None and new_playlist is None) or (
                new_slideshow is not None and new_playlist is not None
            ):
                raise serializers.ValidationError(
                    "Exactly one of default_slideshow or default_playlist must be set."
                )
            return data

        # Creation scenario
        new_slideshow = data.get("default_slideshow")
        new_playlist = data.get("default_playlist")
        if (new_slideshow is None and new_playlist is None) or (
            new_slideshow is not None and new_playlist is not None
        ):
            raise serializers.ValidationError(
                "Exactly one of default_slideshow or default_playlist must be set."
            )
        return data


###############################################################################
# Scheduled Content
###############################################################################


class ScheduledContentSerializer(serializers.ModelSerializer):
    slideshow = SlideshowSerializer(read_only=True)
    slideshow_id = serializers.PrimaryKeyRelatedField(
        queryset=ScheduledContent._meta.get_field(
            "slideshow"
        ).related_model.objects.all(),
        source="slideshow",
        write_only=True,
        allow_null=True,
        required=False,
    )
    playlist = SlideshowPlaylistSerializer(read_only=True)
    playlist_id = serializers.PrimaryKeyRelatedField(
        queryset=ScheduledContent._meta.get_field(
            "playlist"
        ).related_model.objects.all(),
        source="playlist",
        write_only=True,
        allow_null=True,
        required=False,
    )

    class Meta:
        model = ScheduledContent
        fields = "__all__"

    def validate(self, data):
        from datetime import datetime, timedelta

        # Validate that exactly one of slideshow or playlist is set.
        if self.instance:
            slideshow = data.get("slideshow", self.instance.slideshow)
            playlist = data.get("playlist", self.instance.playlist)
        else:
            slideshow = data.get("slideshow")
            playlist = data.get("playlist")

        if (slideshow is None and playlist is None) or (
            slideshow is not None and playlist is not None
        ):
            raise serializers.ValidationError(
                "Exactly one of slideshow or playlist must be set."
            )

        # Retrieve start_time, end_time, and group from incoming data (or instance if updating).
        start_time = data.get(
            "start_time", self.instance.start_time if self.instance else None
        )
        end_time = data.get(
            "end_time", self.instance.end_time if self.instance else None
        )
        group = data.get(
            "display_website_group",
            self.instance.display_website_group if self.instance else None,
        )
        combine_with_default = data.get(
            "combine_with_default",
            self.instance.combine_with_default if self.instance else True,
        )

        if start_time and end_time and group:
            # Ensure datetimes are aware for correct comparison
            start_time = make_aware_if_needed(start_time)
            end_time = make_aware_if_needed(end_time)

            # Rule 1: Check for any existing override content in the same slot.
            # This prevents adding ANY content (override or not) if an override is already there.

            # Check for overlapping scheduled content that is an override
            existing_override_scheduled = ScheduledContent.objects.filter(
                display_website_group=group,
                start_time__lt=end_time,
                end_time__gt=start_time,
                combine_with_default=False,
            )
            if self.instance:
                existing_override_scheduled = existing_override_scheduled.exclude(
                    pk=self.instance.pk
                )

            if existing_override_scheduled.exists():
                conflict = existing_override_scheduled.first()
                content_name = conflict.slideshow or conflict.playlist
                raise serializers.ValidationError(
                    f"Cannot schedule content as an override is already present: '{content_name}'."
                )

            # Check for overlapping recurring content that is an override
            active_recurring_qs = RecurringScheduledContent.objects.filter(
                display_website_group=group,
                active_from__lte=end_time.date(),
                combine_with_default=False,
            ).filter(
                Q(active_until__isnull=True) | Q(active_until__gte=start_time.date())
            )

            current_date = start_time.date()
            while current_date <= end_time.date():
                conflicts = active_recurring_qs.filter(weekday=current_date.weekday())
                for recurring in conflicts:
                    recurring_start = make_aware_if_needed(
                        datetime.combine(current_date, recurring.start_time)
                    )
                    recurring_end = make_aware_if_needed(
                        datetime.combine(current_date, recurring.end_time)
                    )
                    if recurring_start < end_time and recurring_end > start_time:
                        content_name = recurring.slideshow or recurring.playlist
                        raise serializers.ValidationError(
                            f"Cannot schedule content as a recurring override is already present: '{content_name}'."
                        )
                current_date += timedelta(days=1)

            # Rule 2: If the new content is an override, check it doesn't conflict with ANYTHING.
            if not combine_with_default:
                # Check for any overlapping scheduled content
                all_overlapping_scheduled = ScheduledContent.objects.filter(
                    display_website_group=group,
                    start_time__lt=end_time,
                    end_time__gt=start_time,
                )
                if self.instance:
                    all_overlapping_scheduled = all_overlapping_scheduled.exclude(
                        pk=self.instance.pk
                    )

                if all_overlapping_scheduled.exists():
                    conflict = all_overlapping_scheduled.first()
                    content_name = conflict.slideshow or conflict.playlist
                    raise serializers.ValidationError(
                        f"Cannot schedule an override as other content is already present: '{content_name}'."
                    )

                # Check for any overlapping recurring content
                all_active_recurring_qs = RecurringScheduledContent.objects.filter(
                    display_website_group=group,
                    active_from__lte=end_time.date(),
                ).filter(
                    Q(active_until__isnull=True)
                    | Q(active_until__gte=start_time.date())
                )

                current_date = start_time.date()
                while current_date <= end_time.date():
                    conflicts = all_active_recurring_qs.filter(
                        weekday=current_date.weekday()
                    )
                    for recurring in conflicts:
                        recurring_start = make_aware_if_needed(
                            datetime.combine(current_date, recurring.start_time)
                        )
                        recurring_end = make_aware_if_needed(
                            datetime.combine(current_date, recurring.end_time)
                        )
                        if recurring_start < end_time and recurring_end > start_time:
                            content_name = recurring.slideshow or recurring.playlist
                            raise serializers.ValidationError(
                                f"Cannot schedule an override as other recurring content is already present: '{content_name}'."
                            )
                    current_date += timedelta(days=1)

        return data


class RecurringScheduledContentSerializer(serializers.ModelSerializer):
    slideshow = SlideshowSerializer(read_only=True)
    slideshow_id = serializers.PrimaryKeyRelatedField(
        queryset=RecurringScheduledContent._meta.get_field(
            "slideshow"
        ).related_model.objects.all(),
        source="slideshow",
        write_only=True,
        allow_null=True,
        required=False,
    )
    playlist = SlideshowPlaylistSerializer(read_only=True)
    playlist_id = serializers.PrimaryKeyRelatedField(
        queryset=RecurringScheduledContent._meta.get_field(
            "playlist"
        ).related_model.objects.all(),
        source="playlist",
        write_only=True,
        allow_null=True,
        required=False,
    )
    weekday_display = serializers.CharField(
        source="get_weekday_display_name", read_only=True
    )

    class Meta:
        model = RecurringScheduledContent
        fields = "__all__"

    def validate(self, data):
        # Validate that exactly one of slideshow or playlist is set.
        if self.instance:
            slideshow = data.get("slideshow", self.instance.slideshow)
            playlist = data.get("playlist", self.instance.playlist)
        else:
            slideshow = data.get("slideshow")
            playlist = data.get("playlist")

        if (slideshow is None and playlist is None) or (
            slideshow is not None and playlist is not None
        ):
            raise serializers.ValidationError(
                "Exactly one of slideshow or playlist must be set."
            )

        # Additional validation for recurring content
        weekday = data.get("weekday")
        start_time = data.get("start_time")
        end_time = data.get("end_time")
        group = data.get("display_website_group")
        active_from = data.get("active_from")
        active_until = data.get("active_until")
        combine_with_default = data.get("combine_with_default", True)

        if weekday is not None and start_time and end_time and group and active_from:
            # Rule 1: Check for any existing override content in the same slot.
            # This prevents adding ANY content (override or not) if an override is already there.

            # Check for existing override recurring content
            existing_override_recurring = (
                RecurringScheduledContent.objects.filter(
                    display_website_group=group,
                    weekday=weekday,
                    start_time__lt=end_time,
                    end_time__gt=start_time,
                    combine_with_default=False,
                )
                .filter(
                    active_from__lte=(
                        active_until
                        or (datetime.now().date() + timedelta(days=365 * 5))
                    )
                )
                .filter(Q(active_until__isnull=True) | Q(active_until__gte=active_from))
            )
            if self.instance:
                existing_override_recurring = existing_override_recurring.exclude(
                    pk=self.instance.pk
                )

            if existing_override_recurring.exists():
                conflict = existing_override_recurring.first()
                content_name = conflict.slideshow or conflict.playlist
                raise serializers.ValidationError(
                    f"Cannot schedule content as a recurring override is already present: '{content_name}'."
                )

            # Check for existing override scheduled content
            # We need to check every day in the recurring event's range
            current_date = active_from
            end_date = active_until or (
                current_date + timedelta(days=365 * 5)
            )  # Check 5 years into future if no end date

            while current_date <= end_date:
                if current_date.weekday() == weekday:
                    day_start = make_aware_if_needed(
                        datetime.combine(current_date, start_time)
                    )
                    day_end = make_aware_if_needed(
                        datetime.combine(current_date, end_time)
                    )

                    conflicts = ScheduledContent.objects.filter(
                        display_website_group=group,
                        start_time__lt=day_end,
                        end_time__gt=day_start,
                        combine_with_default=False,
                    )
                    if conflicts.exists():
                        conflict = conflicts.first()
                        content_name = conflict.slideshow or conflict.playlist
                        raise serializers.ValidationError(
                            f"Cannot schedule content as an override is already present: '{content_name}' on {current_date.strftime('%Y-%m-%d')}."
                        )
                current_date += timedelta(days=1)

            # Rule 2: If the new content is an override, check it doesn't conflict with ANYTHING.
            if not combine_with_default:
                # Check for any overlapping recurring content
                all_overlapping_recurring = (
                    RecurringScheduledContent.objects.filter(
                        display_website_group=group,
                        weekday=weekday,
                        start_time__lt=end_time,
                        end_time__gt=start_time,
                    )
                    .filter(
                        active_from__lte=(
                            active_until
                            or (datetime.now().date() + timedelta(days=365 * 5))
                        )
                    )
                    .filter(
                        Q(active_until__isnull=True) | Q(active_until__gte=active_from)
                    )
                )
                if self.instance:
                    all_overlapping_recurring = all_overlapping_recurring.exclude(
                        pk=self.instance.pk
                    )

                if all_overlapping_recurring.exists():
                    conflict = all_overlapping_recurring.first()
                    content_name = conflict.slideshow or conflict.playlist
                    raise serializers.ValidationError(
                        f"Cannot schedule an override as other recurring content is already present: '{content_name}'."
                    )

                # Check for any overlapping scheduled content
                current_date = active_from
                while current_date <= end_date:
                    if current_date.weekday() == weekday:
                        day_start = make_aware_if_needed(
                            datetime.combine(current_date, start_time)
                        )
                        day_end = make_aware_if_needed(
                            datetime.combine(current_date, end_time)
                        )

                        conflicts = ScheduledContent.objects.filter(
                            display_website_group=group,
                            start_time__lt=day_end,
                            end_time__gt=day_start,
                        )
                        if conflicts.exists():
                            conflict = conflicts.first()
                            content_name = conflict.slideshow or conflict.playlist
                            raise serializers.ValidationError(
                                f"Cannot schedule an override as other content is already present: '{content_name}' on {current_date.strftime('%Y-%m-%d')}."
                            )
                    current_date += timedelta(days=1)

        return data


###############################################################################
# Document
###############################################################################


class DocumentSerializer(serializers.ModelSerializer):
    tags = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    is_owned_by_branch = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = "__all__"
        read_only_fields = ("branch", "uploaded_at")

    def get_file_url(self, obj):
        request = self.context.get("request")
        from django.conf import settings as _dj_settings
        from urllib.parse import urljoin as _urljoin

        # If MEDIA_URL is an absolute public URL (e.g. MINIO_PUBLIC_URL), use it
        # to construct the public-facing URL. This avoids returning internal
        # presigned URLs from the storage backend.
        media_url = getattr(_dj_settings, "MEDIA_URL", "")
        if media_url and media_url.startswith("http"):
            # obj.file.name is the path inside the bucket (e.g. 'uploads/589.jpg')
            try:
                return _urljoin(media_url, obj.file.name)
            except Exception:
                pass

        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url or ""

    def get_is_owned_by_branch(self, obj):
        branch = self.context.get("branch")
        return obj.branch_id == branch.id if branch else False

    def get_tags(self, obj):
        return list(obj.tags.values_list("name", flat=True))

    def get_category(self, obj):
        return obj.category.id if obj.category else None


###############################################################################
# Membership & User
###############################################################################


class OrganisationMembershipSerializer(serializers.ModelSerializer):
    """
    Reflects the membership structure:
      - org_admin -> organisation only
      - suborg_admin -> organisation + suborganisation
      - branch_admin -> organisation + suborganisation + branch
      - employee -> depends on your rules
    """

    class Meta:
        model = OrganisationMembership
        fields = ["id", "user", "organisation", "suborganisation", "branch", "role"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        return super().validate(attrs)


class UserSerializer(serializers.ModelSerializer):
    """
    Shows basic user info (omits password).
    """

    class Meta:
        model = User
        fields = ["id", "username", "email"]


class CreateUserSerializer(serializers.ModelSerializer):
    """
    Allows creation of a user (includes password).
    """

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]
        extra_kwargs = {"password": {"write_only": True}}

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email"),
            password=validated_data["password"],
        )
        return user


class UpdateUserSerializer(serializers.ModelSerializer):
    """
    Allows updating the underlying Django User & UserExtended fields.
    """

    username = serializers.CharField(source="user.username")
    email = serializers.EmailField(source="user.email")
    first_name = serializers.CharField(source="user.first_name")
    last_name = serializers.CharField(source="user.last_name")

    class Meta:
        model = UserExtended
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "language_preference",
        ]

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        language_preference = validated_data.get(
            "language_preference", instance.language_preference
        )
        instance.update_user_info(user_data, language_preference)
        return instance


class ChangePasswordSerializer(serializers.Serializer):
    """
    For changing a user's password.
    """

    old_password = serializers.CharField(write_only=True, required=True)
    new_password = serializers.CharField(write_only=True, required=True)
    confirm_password = serializers.CharField(write_only=True, required=True)

    def validate(self, data):
        user = self.context["request"].user
        if not check_password(data["old_password"], user.password):
            raise serializers.ValidationError(
                {"old_password": "Old password is incorrect."}
            )
        if data["new_password"] != data["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "New passwords do not match."}
            )
        return data

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save()
        return user


class ShowUsernameAndEmailSerializer(serializers.ModelSerializer):
    """
    Simple read-only serializer for a user's username + email.
    """

    username = serializers.CharField(source="username", read_only=True)
    email = serializers.EmailField(source="email", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email"]
        read_only_fields = ("username", "email")

    def to_representation(self, user_obj):
        if user_obj.id:
            return {"username": user_obj.username, "email": user_obj.email}


class ShowAllUserInfoSerializer(ShowUsernameAndEmailSerializer):
    """
    Extended read-only serializer with first/last name + language preference.
    """

    username = serializers.CharField(source="user.username", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    language_preference = serializers.CharField(
        source="language_preference", read_only=True
    )

    class Meta:
        model = UserExtended
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "language_preference",
        ]
        read_only_fields = (
            "username",
            "first_name",
            "last_name",
            "email",
            "language_preference",
        )

    def to_representation(self, user_obj):
        if user_obj.id:
            return {
                "id": user_obj.id,
                "username": user_obj.user.username,
                "first_name": user_obj.user.first_name,
                "last_name": user_obj.user.last_name,
                "email": user_obj.user.email,
                "language_preference": user_obj.language_preference,
            }


###############################################################################
# UserMembershipDetailSerializer
###############################################################################


class SubOrganisationWithRoleSerializer(serializers.ModelSerializer):
    user_role = serializers.SerializerMethodField()
    organisation_name = serializers.SerializerMethodField()
    branches = serializers.SerializerMethodField()  # dynamic

    class Meta:
        model = SubOrganisation
        fields = [
            "id",
            "name",
            "organisation",
            "organisation_name",
            "user_role",
            "branches",
        ]

    def get_user_role(self, suborg):
        org_admin_org_ids = self.context.get("org_admin_org_ids", set())
        suborg_roles = self.context.get("suborg_roles", {})
        if suborg.organisation_id in org_admin_org_ids:
            return "org_admin"
        return suborg_roles.get(suborg.id, None)

    def get_organisation_name(self, suborg):
        return suborg.organisation.name

    def get_branches(self, suborg):
        request = self.context.get("request")
        if not request:
            # fallback: return all branches if request is missing
            branches = suborg.branches.all()
        else:
            user_role = self.get_user_role(suborg)
            if user_role in ["org_admin", "suborg_admin"]:
                branches = suborg.branches.all()
            else:
                # For employees, filter branches by membership
                branches = suborg.branches.filter(memberships__user=request.user)
        return BranchSerializer(branches, many=True, context=self.context).data


###############################################################################
# UserMembershipDetailSerializer
###############################################################################


class UserMembershipDetailSerializer(serializers.ModelSerializer):
    """
    Shows an OrganisationMembership record with human-readable org/suborg/branch names.
    """

    organisation_name = serializers.SerializerMethodField()
    suborganisation_name = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()

    class Meta:
        model = OrganisationMembership
        fields = [
            "id",
            "role",
            "organisation",
            "suborganisation",
            "branch",
            "organisation_name",
            "suborganisation_name",
            "branch_name",
        ]

    def get_organisation_name(self, obj):
        return obj.organisation.name if obj.organisation else None

    def get_suborganisation_name(self, obj):
        return obj.suborganisation.name if obj.suborganisation else None

    def get_branch_name(self, obj):
        return obj.branch.name if obj.branch else None


class SlideTemplateSerializer(serializers.ModelSerializer):
    """
    Serializer for the SlideTemplate model.
    - Includes read-only nested Category, Tag, Organisation, and SubOrganisation.
    - Allows writing by specifying `category_id`, `tag_ids`, `organisation_id`, `suborganisation_id`, and `parent_template_id`.
    """

    category = CategorySerializer(read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    organisation = OrganisationSerializer(read_only=True)
    suborganisation = SubOrganisationSerializer(read_only=True)
    parent_template = serializers.SerializerMethodField()

    category_id = serializers.PrimaryKeyRelatedField(
        source="category",
        queryset=Category.objects.all(),
        write_only=True,
        allow_null=True,
        required=False,
    )
    tag_ids = serializers.PrimaryKeyRelatedField(
        source="tags",
        queryset=Tag.objects.all(),
        many=True,
        write_only=True,
        required=False,
    )
    organisation_id = serializers.PrimaryKeyRelatedField(
        source="organisation",
        queryset=Organisation.objects.all(),
        write_only=True,
    )
    suborganisation_id = serializers.PrimaryKeyRelatedField(
        source="suborganisation",
        queryset=SubOrganisation.objects.all(),
        write_only=True,
        allow_null=True,
        required=False,
    )
    parent_template_id = serializers.PrimaryKeyRelatedField(
        source="parent_template",
        queryset=SlideTemplate.objects.all(),
        write_only=True,
        allow_null=True,
        required=False,
    )

    def get_parent_template(self, obj):
        if obj.parent_template:
            return {
                "id": obj.parent_template.id,
                "name": obj.parent_template.name,
            }
        return None

    class Meta:
        model = SlideTemplate
        fields = [
            "id",
            "name",
            "slideData",
            "category",
            "tags",
            "organisation",
            "suborganisation",
            "parent_template",
            "category_id",
            "tag_ids",
            "organisation_id",
            "suborganisation_id",
            "parent_template_id",
            "aspect_ratio",
        ]

    def create(self, validated_data):
        """
        Custom create to handle the M2M tags correctly.
        """
        tags = validated_data.pop("tags", [])
        instance = super().create(validated_data)
        instance.tags.set(tags)
        return instance

    def update(self, instance, validated_data):
        """
        Custom update to handle the M2M tags correctly.
        """
        tags = validated_data.pop("tags", None)
        updated_instance = super().update(instance, validated_data)
        if tags is not None:
            updated_instance.tags.set(tags)
        return updated_instance


###############################################################################
# Custom Color Serializer
###############################################################################


class CustomColorSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomColor
        fields = ["id", "name", "hexValue", "type", "organisation"]
        read_only_fields = [
            "id",
            "organisation",
        ]  # Organisation is set based on user context


###############################################################################
# Custom Font Serializer
###############################################################################


class CustomFontSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomFont
        fields = ["id", "name", "font_url", "organisation"]
        read_only_fields = ["id", "organisation"]


###############################################################################
# Registered Slide Types Serializer
###############################################################################


class RegisteredSlideTypesSerializer(serializers.ModelSerializer):
    class Meta:
        model = RegisteredSlideTypes
        fields = [
            "id",
            "slide_type_id",
            "name",
            "description",
            "organisation",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "organisation", "created_at", "updated_at"]


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    This serializer extends the default Simple JWT serializer to allow
    authentication using either the username or email address.
    """

    @classmethod
    def get_token(cls, user):
        return super().get_token(user)

    def validate(self, attrs):
        # We'll use the 'username' field to hold either the username or email
        identifier = attrs.get(self.username_field)

        try:
            # Check if the identifier is an email address
            user = User.objects.get(email=identifier)
            # If a user is found by email, set the username field in attrs
            # to the actual username for the parent validation.
            attrs[self.username_field] = user.get_username()
        except ObjectDoesNotExist:
            # If no user is found by email, the parent serializer will handle
            # validation based on the original username field.
            pass
        except User.MultipleObjectsReturned:
            # Handle case where multiple users have the same email if needed
            pass

        # Call the parent class's validate method to handle the rest of the
        # authentication logic (e.g., password validation).
        return super().validate(attrs)
