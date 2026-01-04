# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0049_rename_camelcase_fields"),
    ]

    operations = [
        migrations.RenameField(
            model_name="globalslidetemplate",
            old_name="slideData",
            new_name="slide_data",
        ),
        migrations.RenameField(
            model_name="globalslidetemplate",
            old_name="previewWidth",
            new_name="preview_width",
        ),
        migrations.RenameField(
            model_name="globalslidetemplate",
            old_name="previewHeight",
            new_name="preview_height",
        ),
        migrations.RenameField(
            model_name="globalslidetemplate",
            old_name="isLegacy",
            new_name="is_legacy",
        ),
    ]
