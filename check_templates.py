# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

import os
import django
import sys

sys.path.append("/home/louis/openstreamadminsite/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "project.settings")
django.setup()

from openstream.app.models import SlideTemplate, GlobalSlideTemplate
from openstream.app.serializers import (
    SlideTemplateSerializer,
    GlobalSlideTemplateSerializer,
)
import json

print("Checking SlideTemplates...")
templates = SlideTemplate.objects.all()
print(f"Found {templates.count()} SlideTemplates")

if templates.exists():
    t = templates.first()
    print(f"First template: {t.name}")
    print(f"slide_data keys: {t.slide_data.keys() if t.slide_data else 'None'}")

    serializer = SlideTemplateSerializer(t)
    print("Serialized data keys:")
    print(serializer.data.keys())
    if "slide_data" in serializer.data:
        print(
            f"Serialized slide_data keys: {serializer.data['slide_data'].keys() if serializer.data['slide_data'] else 'None'}"
        )
    else:
        print("slide_data NOT in serialized data")

print("\nChecking GlobalSlideTemplates...")
global_templates = GlobalSlideTemplate.objects.all()
print(f"Found {global_templates.count()} GlobalSlideTemplates")

if global_templates.exists():
    t = global_templates.first()
    print(f"First global template: {t.name}")
    print(f"slide_data keys: {t.slide_data.keys() if t.slide_data else 'None'}")

    serializer = GlobalSlideTemplateSerializer(t)
    print("Serialized data keys:")
    print(serializer.data.keys())
