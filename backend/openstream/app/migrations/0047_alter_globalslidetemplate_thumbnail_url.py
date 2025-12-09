# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0046_globalslidetemplate"),
    ]

    operations = [
        migrations.AlterField(
            model_name="globalslidetemplate",
            name="thumbnail_url",
            field=models.TextField(
                blank=True,
                null=True,
                help_text="Base64 encoded data URL representing the template thumbnail",
            ),
        ),
    ]
