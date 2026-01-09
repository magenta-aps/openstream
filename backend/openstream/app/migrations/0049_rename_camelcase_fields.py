# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        (
            "app",
            "0048_merge_0046_alter_organisationmembership_role_0047_alter_globalslidetemplate_thumbnail_url",
        ),
    ]

    operations = [
        migrations.RenameField(
            model_name="slideshow",
            old_name="previewWidth",
            new_name="preview_width",
        ),
        migrations.RenameField(
            model_name="slideshow",
            old_name="previewHeight",
            new_name="preview_height",
        ),
        migrations.RenameField(
            model_name="slideshow",
            old_name="isCustomDimensions",
            new_name="is_custom_dimensions",
        ),
        migrations.RenameField(
            model_name="slideshow",
            old_name="isLegacy",
            new_name="is_legacy",
        ),
        migrations.RenameField(
            model_name="customcolor",
            old_name="hexValue",
            new_name="hex_value",
        ),
        migrations.RenameField(
            model_name="slidetemplate",
            old_name="slideData",
            new_name="slide_data",
        ),
    ]
