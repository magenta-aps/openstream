# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0051_rename_islegacy_slidetemplate_is_legacy"),
    ]

    operations = [
        migrations.AddField(
            model_name="document",
            name="processing_status",
            field=models.CharField(
                choices=[
                    ("PENDING", "Pending"),
                    ("PROCESSING", "Processing"),
                    ("COMPLETED", "Completed"),
                    ("FAILED", "Failed"),
                ],
                default="COMPLETED",
                help_text="Status of background processing (e.g. PDF conversion).",
                max_length=20,
            ),
        ),
    ]
