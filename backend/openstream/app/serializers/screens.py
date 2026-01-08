# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
"""Serializers for screen-related objects."""

from rest_framework import serializers

from app.models import (
    DisplayWebsite,
    DisplayWebsiteGroup,
    Slideshow,
    SlideshowPlaylist,
    Wayfinding,
)

from .content import SlideshowPlaylistSerializer, SlideshowSerializer


class WayfindingSerializer(serializers.ModelSerializer):
    """Serializer for Wayfinding objects, mirroring slideshow behaviour."""

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
        read_only_fields = ("branch", "created_by", "updated_at")

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        include_wayfinding_data = self.context.get("include_wayfinding_data", True)
        if not include_wayfinding_data:
            ret.pop("wayfinding_data", None)
        return ret


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
        if self.instance:
            current_slideshow = self.instance.default_slideshow
            current_playlist = self.instance.default_playlist

            new_slideshow = data.get("default_slideshow", current_slideshow)
            new_playlist = data.get("default_playlist", current_playlist)

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

        new_slideshow = data.get("default_slideshow")
        new_playlist = data.get("default_playlist")
        if (new_slideshow is None and new_playlist is None) or (
            new_slideshow is not None and new_playlist is not None
        ):
            raise serializers.ValidationError(
                "Exactly one of default_slideshow or default_playlist must be set."
            )
        return data
