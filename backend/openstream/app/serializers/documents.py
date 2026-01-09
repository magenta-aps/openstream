# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
"""Serializers for document objects."""

from rest_framework import serializers

from app.models import Document


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

        media_url = getattr(_dj_settings, "MEDIA_URL", "")
        if media_url and media_url.startswith("http"):
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
