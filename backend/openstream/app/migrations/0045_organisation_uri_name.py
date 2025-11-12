# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from django.db import migrations, models


def _populate_uri_name(apps, schema_editor):
    Organisation = apps.get_model("app", "Organisation")
    from django.utils.text import slugify

    for organisation in Organisation.objects.all().order_by("id"):
        base_slug = slugify(organisation.name or "")
        if not base_slug:
            base_slug = f"organisation-{organisation.pk}"

        candidate = base_slug
        suffix = 2

        while (
            Organisation.objects.exclude(pk=organisation.pk)
            .filter(uri_name=candidate)
            .exists()
        ):
            candidate = f"{base_slug}-{suffix}"
            suffix += 1

        Organisation.objects.filter(pk=organisation.pk).update(uri_name=candidate)


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0044_alter_customcolor_options_alter_customfont_options"),
    ]

    operations = [
        migrations.AddField(
            model_name="organisation",
            name="uri_name",
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.RunPython(_populate_uri_name, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="organisation",
            name="uri_name",
            field=models.SlugField(max_length=255, unique=True),
        ),
    ]
