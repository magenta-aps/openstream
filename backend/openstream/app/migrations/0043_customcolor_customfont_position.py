# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from django.db import migrations, models


def populate_positions(apps, schema_editor):
    CustomColor = apps.get_model("app", "CustomColor")
    CustomFont = apps.get_model("app", "CustomFont")

    color_org_ids = (
        CustomColor.objects.order_by()
        .values_list("organisation_id", flat=True)
        .distinct()
    )
    for org_id in color_org_ids:
        colors = list(
            CustomColor.objects.filter(organisation_id=org_id)
            .order_by("type", "name", "id")
        )
        for index, color in enumerate(colors, start=1):
            color.position = index
        if colors:
            CustomColor.objects.bulk_update(colors, ["position"])

    font_org_ids = (
        CustomFont.objects.order_by()
        .values_list("organisation_id", flat=True)
        .distinct()
    )
    for org_id in font_org_ids:
        fonts = list(
            CustomFont.objects.filter(organisation_id=org_id).order_by(
                "name", "id"
            )
        )
        for index, font in enumerate(fonts, start=1):
            font.position = index
        if fonts:
            CustomFont.objects.bulk_update(fonts, ["position"])


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0042_textformattingsettings"),
    ]

    operations = [
        migrations.AddField(
            model_name="customcolor",
            name="position",
            field=models.PositiveIntegerField(blank=True, null=True, default=0),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="customfont",
            name="position",
            field=models.PositiveIntegerField(blank=True, null=True, default=0),
            preserve_default=False,
        ),
        migrations.RunPython(populate_positions, migrations.RunPython.noop),
    ]
