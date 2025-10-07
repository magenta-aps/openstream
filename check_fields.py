# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

from app.models import SlideTemplate
print("Model fields:", [f.name for f in SlideTemplate._meta.fields])
print("Has aspect_ratio field:", hasattr(SlideTemplate, 'aspect_ratio'))
print("Has accepted_aspect_ratios field:", hasattr(SlideTemplate, 'accepted_aspect_ratios'))
