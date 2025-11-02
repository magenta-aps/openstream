# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0041_alter_branch_unique_together"),
    ]

    operations = [
        migrations.CreateModel(
            name="TextFormattingSettings",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("allow_bold", models.BooleanField(default=True)),
                ("allow_italic", models.BooleanField(default=True)),
                ("allow_underline", models.BooleanField(default=True)),
                ("allow_font_weight", models.BooleanField(default=True)),
                (
                    "organisation",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="text_formatting_settings",
                        to="app.organisation",
                    ),
                ),
            ],
        ),
    ]
