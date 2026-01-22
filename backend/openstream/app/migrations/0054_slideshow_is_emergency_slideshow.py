# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0053_emergencyslideshow"),
    ]

    operations = [
        migrations.AddField(
            model_name="slideshow",
            name="is_emergency_slideshow",
            field=models.BooleanField(blank=True, default=False, null=True),
        ),
    ]
