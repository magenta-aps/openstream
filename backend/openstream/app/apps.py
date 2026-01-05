# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from django.apps import AppConfig


class App(AppConfig):
    name = "app"

    def ready(self):
        import app.signals
