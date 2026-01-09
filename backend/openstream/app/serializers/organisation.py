# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
"""Serializers for organisation hierarchy objects."""

from rest_framework import serializers

from app.models import Branch, BranchURLCollectionItem, Organisation, SubOrganisation


class OrganisationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organisation
        fields = ["id", "name", "uri_name"]
        read_only_fields = ["uri_name"]


class BranchURLCollectionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = BranchURLCollectionItem
        fields = ["id", "branch", "url"]


class SubOrganisationSerializer(serializers.ModelSerializer):
    organisation = serializers.StringRelatedField(read_only=True)
    organisation_id = serializers.PrimaryKeyRelatedField(
        source="organisation", queryset=Organisation.objects.all(), write_only=True
    )
    organisation_uri_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SubOrganisation
        fields = [
            "id",
            "name",
            "organisation",
            "organisation_id",
            "organisation_uri_name",
        ]

    def get_organisation_uri_name(self, obj):
        return obj.organisation.uri_name if obj.organisation_id else None


class BranchSerializer(serializers.ModelSerializer):
    """Basic serializer for Branch objects."""

    suborganisation = SubOrganisationSerializer(read_only=True)
    suborganisation_id = serializers.PrimaryKeyRelatedField(
        source="suborganisation",
        queryset=SubOrganisation.objects.all(),
        write_only=True,
    )

    class Meta:
        model = Branch
        fields = ["id", "name", "suborganisation", "suborganisation_id"]
