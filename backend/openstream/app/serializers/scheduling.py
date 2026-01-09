# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
"""Serializers for scheduling content."""

from rest_framework import serializers

from app.models import RecurringScheduledContent, ScheduledContent
from app.utils import make_aware_if_needed

from .content import SlideshowPlaylistSerializer, SlideshowSerializer


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
        from django.core.exceptions import ValidationError

        from app.services import validate_scheduled_content

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
            start_time = make_aware_if_needed(start_time)
            end_time = make_aware_if_needed(end_time)

            try:
                validate_scheduled_content(
                    start_time,
                    end_time,
                    group,
                    combine_with_default,
                    instance_id=self.instance.pk if self.instance else None,
                )
            except ValidationError as exc:
                raise serializers.ValidationError(exc.message) from exc

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
        from django.core.exceptions import ValidationError

        from app.services import validate_recurring_content

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

        weekday = data.get("weekday", self.instance.weekday if self.instance else None)
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
        active_from = data.get(
            "active_from", self.instance.active_from if self.instance else None
        )
        active_until = data.get(
            "active_until", self.instance.active_until if self.instance else None
        )
        combine_with_default = data.get(
            "combine_with_default",
            self.instance.combine_with_default if self.instance else True,
        )

        if weekday is not None and start_time and end_time and group and active_from:
            try:
                validate_recurring_content(
                    weekday,
                    start_time,
                    end_time,
                    active_from,
                    active_until,
                    group,
                    combine_with_default,
                    instance_id=self.instance.pk if self.instance else None,
                )
            except ValidationError as exc:
                raise serializers.ValidationError(exc.message) from exc

        return data
