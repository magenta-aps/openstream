# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0043_customcolor_customfont_position"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="customcolor",
            options={"ordering": ["organisation", "position", "name"]},
        ),
        migrations.AlterModelOptions(
            name="customfont",
            options={
                "ordering": ["organisation", "position", "name"],
                "verbose_name": "Custom Font",
                "verbose_name_plural": "Custom Fonts",
            },
        ),
    ]
