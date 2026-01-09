# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
"""Serializers for content objects such as categories, slideshows, and playlists."""

import base64
import binascii

from rest_framework import serializers

from app.models import (
    Category,
    GlobalSlideTemplate,
    Organisation,
    SlideTemplate,
    Slideshow,
    SlideshowPlaylist,
    SlideshowPlaylistItem,
    SubOrganisation,
    Tag,
)

from .organisation import OrganisationSerializer, SubOrganisationSerializer


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
        validators = [
            serializers.UniqueTogetherValidator(
                queryset=Category.objects.all(),
                fields=["name", "organisation"],
                message="A category with this name already exists in your organisation.",
            )
        ]

    def to_representation(self, instance):
        """Customize the output representation."""
        ret = super().to_representation(instance)
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
        validators = [
            serializers.UniqueTogetherValidator(
                queryset=Tag.objects.all(),
                fields=["name", "organisation"],
                message="A tag with this name already exists in your organisation.",
            )
        ]

    def to_representation(self, instance):
        """Customize the output representation."""
        ret = super().to_representation(instance)
        if "organisation" in ret and self.context.get("simple_response", False):
            ret.pop("organisation")
        return ret


class SlideshowSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    tags = TagSerializer(many=True, read_only=True)
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
            "category",
            "category_id",
            "tags",
            "tag_ids",
            "mode",
            "branch",
            "created_by",
            "preview_width",
            "preview_height",
            "is_custom_dimensions",
            "slideshow_data",
            "is_legacy",
            "aspect_ratio",
        ]
        read_only_fields = ("branch", "created_by", "aspect_ratio")

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        include_slideshow_data = self.context.get("include_slideshow_data", True)
        if not include_slideshow_data:
            ret.pop("slideshow_data", None)
        return ret


class SlideTemplateSerializer(serializers.ModelSerializer):
    """Serializer for SlideTemplate with nested read-only relationships."""

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

    class Meta:
        model = SlideTemplate
        fields = [
            "id",
            "name",
            "slide_data",
            "is_legacy",
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

    def get_parent_template(self, obj):
        if obj.parent_template:
            return {"id": obj.parent_template.id, "name": obj.parent_template.name}
        return None

    def create(self, validated_data):
        tags = validated_data.pop("tags", [])
        instance = super().create(validated_data)
        instance.tags.set(tags)
        return instance

    def update(self, instance, validated_data):
        tags = validated_data.pop("tags", None)
        updated_instance = super().update(instance, validated_data)
        if tags is not None:
            updated_instance.tags.set(tags)
        return updated_instance


class GlobalSlideTemplateSerializer(serializers.ModelSerializer):
    MAX_THUMBNAIL_BYTES = 1_000_000  # 1 MB decoded payload limit

    thumbnail_url = serializers.CharField(
        allow_blank=True, allow_null=True, required=False
    )

    class Meta:
        model = GlobalSlideTemplate
        fields = [
            "id",
            "name",
            "slide_data",
            "thumbnail_url",
            "preview_width",
            "preview_height",
            "aspect_ratio",
            "is_legacy",
            "created_at",
            "updated_at",
        ]

    def validate_thumbnail_url(self, value):
        if value in (None, ""):
            return None

        if value.startswith("data:"):
            header, _, b64_data = value.partition(",")
            if not b64_data:
                raise serializers.ValidationError("Invalid data URL: missing payload.")

            if "image" not in header:
                raise serializers.ValidationError(
                    "Only image data URLs are supported for thumbnails."
                )

            try:
                decoded = base64.b64decode(b64_data, validate=True)
            except (binascii.Error, ValueError) as exc:
                raise serializers.ValidationError(
                    "Thumbnail data URL is not valid base64."
                ) from exc

            if len(decoded) > self.MAX_THUMBNAIL_BYTES:
                raise serializers.ValidationError(
                    "Thumbnail image exceeds the 1 MB limit."
                )

            return value

        return value


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
