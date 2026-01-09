# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0050_rename_globalslidetemplate_fields"),
    ]

    operations = [
        migrations.RenameField(
            model_name="slidetemplate",
            old_name="isLegacy",
            new_name="is_legacy",
        ),
    ]
