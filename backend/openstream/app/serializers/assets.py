# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
"""Serializers for theme assets like colors and fonts."""

from rest_framework import serializers

from app.models import CustomColor, CustomFont, TextFormattingSettings


class CustomColorSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomColor
        fields = ["id", "name", "hex_value", "type", "position", "organisation"]
        read_only_fields = ["id", "organisation"]

    def validate(self, data):
        """Ensure the color name is unique within the same organisation."""
        organisation = self.context.get("organisation")
        name = data.get("name")

        if organisation and name:
            color_id = self.instance.id if self.instance else None
            if (
                CustomColor.objects.filter(organisation=organisation, name=name)
                .exclude(id=color_id)
                .exists()
            ):
                raise serializers.ValidationError(
                    {
                        "message": "A color with this name already exists in this organisation."
                    }
                )

        return data


class CustomFontSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomFont
        fields = ["id", "name", "font_url", "position", "organisation"]
        read_only_fields = ["id", "organisation"]

    def validate(self, data):
        """Ensure the font name is unique within the same organisation."""
        organisation = self.context.get("organisation")
        name = data.get("name")

        if organisation and name:
            font_id = self.instance.id if self.instance else None
            if (
                CustomFont.objects.filter(organisation=organisation, name=name)
                .exclude(id=font_id)
                .exists()
            ):
                raise serializers.ValidationError(
                    {
                        "message": "A font with this name already exists in this organisation."
                    }
                )

        return data


class TextFormattingSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = TextFormattingSettings
        fields = [
            "id",
            "organisation",
            "allow_bold",
            "allow_italic",
            "allow_underline",
        ]
        read_only_fields = ["id", "organisation"]
