# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0052_document_processing_status"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmergencySlideshow",
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
                (
                    "is_active",
                    models.BooleanField(
                        default=False,
                        help_text="Whether this emergency slideshow is currently active.",
                    ),
                ),
                (
                    "display_website_groups",
                    models.ManyToManyField(
                        help_text="Display groups affected by this emergency slideshow.",
                        related_name="emergency_slideshows",
                        to="app.displaywebsitegroup",
                    ),
                ),
                (
                    "slideshow",
                    models.ForeignKey(
                        help_text="Slideshow that overrides normal scheduling when active.",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="emergency_slideshows",
                        to="app.slideshow",
                    ),
                ),
            ],
            options={
                "verbose_name": "Emergency Slideshow",
                "verbose_name_plural": "Emergency Slideshows",
            },
        ),
    ]
