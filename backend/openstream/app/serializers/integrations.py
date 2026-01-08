# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
"""Serializers for integration-related models."""

from rest_framework import serializers

from app.models import Organisation, OrganisationAPIAccess, RegisteredSlideTypes

from .organisation import OrganisationSerializer


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
