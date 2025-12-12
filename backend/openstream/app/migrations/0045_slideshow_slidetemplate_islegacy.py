# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from django.db import migrations, models


def mark_existing_items_as_legacy(apps, schema_editor):
    Slideshow = apps.get_model("app", "Slideshow")
    SlideTemplate = apps.get_model("app", "SlideTemplate")
    Slideshow.objects.update(isLegacy=True)
    SlideTemplate.objects.update(isLegacy=True)


def unmark_all_legacy(apps, schema_editor):
    Slideshow = apps.get_model("app", "Slideshow")
    SlideTemplate = apps.get_model("app", "SlideTemplate")
    Slideshow.objects.update(isLegacy=False)
    SlideTemplate.objects.update(isLegacy=False)


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0044_alter_customcolor_options_alter_customfont_options"),
    ]

    operations = [
        migrations.AddField(
            model_name="slideshow",
            name="isLegacy",
            field=models.BooleanField(
                default=False,
                help_text="Set to True for older manage_content that must stay on the fixed 200x200 grid",
            ),
        ),
        migrations.AddField(
            model_name="slidetemplate",
            name="isLegacy",
            field=models.BooleanField(
                default=False,
                help_text="Legacy templates stay on the fixed 200x200 grid instead of per-pixel cells",
            ),
        ),
        migrations.RunPython(mark_existing_items_as_legacy, unmark_all_legacy),
    ]
