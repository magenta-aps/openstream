# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

import os
from logging import getLogger

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from osauth.keycloak import KeycloakError, kc_adm_client_from_settings

logger = getLogger("django.management.cmd")


def _default_frontend_origin() -> str:
    return (
        os.environ.get("KEYCLOAK_REALM_FRONTEND_ORIGIN")
        or settings.FRONTEND_HOST
        or "http://localhost:5173"
    )


def _default_backend_base_url() -> str:
    return (
        os.environ.get("KEYCLOAK_REALM_BACKEND_BASE_URL")
        or os.environ.get("BACKEND_BASE_URL")
        or "http://localhost:8000"
    )


class Command(BaseCommand):
    help = "Create a Keycloak realm with default OpenStream roles and client."

    def add_arguments(self, parser):
        parser.add_argument("realm", type=str, help="Name of the realm to create.")
        parser.add_argument(
            "--frontend-origin",
            default=_default_frontend_origin(),
            help="Frontend origin used for redirect URIs (default: settings/front env).",
        )
        parser.add_argument(
            "--backend-base-url",
            default=_default_backend_base_url(),
            help="Backend base URL used for redirect URIs (default: env BACKEND_BASE_URL or http://localhost:8000).",
        )

    def handle(self, *args, **options):
        realm = options["realm"].strip()
        if not realm:
            raise CommandError("Realm name cannot be empty.")

        frontend_origin = options["frontend_origin"].rstrip("/")
        backend_base_url = options["backend_base_url"].rstrip("/")

        logger.info("Creating Keycloak realm '%s'", realm)

        kc_admin = kc_adm_client_from_settings()

        try:
            token = kc_admin.auth(
                username=settings.KEYCLOAK_ADMIN_USERNAME,
                password=settings.KEYCLOAK_ADMIN_PASSWORD,
            )
        except KeycloakError as exc:
            raise CommandError(
                f"Failed to authenticate against Keycloak admin API: {exc}"
            ) from exc

        try:
            if kc_admin.realm_exists(token, realm):
                self.stdout.write(
                    self.style.WARNING(
                        f"Realm '{realm}' already exists - nothing to create."
                    )
                )
                return

            self._create_realm(kc_admin, token, realm)
            self._ensure_roles(kc_admin, token, realm)
            self._ensure_openstream_client(
                kc_admin,
                token,
                realm,
                frontend_origin=frontend_origin,
                backend_base_url=backend_base_url,
            )
        except KeycloakError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(self.style.SUCCESS(f"Realm '{realm}' created."))

    def _create_realm(self, kc_admin, token, realm: str):
        kc_admin.create_realm(
            token,
            {
                "realm": realm,
                "displayName": realm,
                "displayNameHtml": realm,
                "enabled": True,
                "loginWithEmailAllowed": True,
                "registrationAllowed": False,
            },
        )
        logger.info("Realm '%s' created", realm)

    def _ensure_roles(self, kc_admin, token, realm: str):
        roles = [
            {
                "name": settings.OSAUTH_ORG_MEMBERSHIP_ORG_ADMIN,
                "description": "Organisation administrator",
            },
            {
                "name": settings.OSAUTH_ORG_MEMBERSHIP_ORG_USER,
                "description": "Organisation user",
            },
        ]

        for role in roles:
            if kc_admin.realm_role_exists(token, realm, role["name"]):
                logger.info("Role '%s' already present", role["name"])
                continue

            kc_admin.create_realm_role(token, realm, role)
            logger.info("Role '%s' created", role["name"])

    def _ensure_openstream_client(
        self,
        kc_admin,
        token,
        realm: str,
        frontend_origin: str,
        backend_base_url: str,
    ):
        client_id = "openstream-api"
        if kc_admin.client_exists(token, realm, client_id):
            logger.info("Client '%s' already present", client_id)
            return

        client_config = {
            "clientId": client_id,
            "name": "OpenStream API",
            "rootUrl": backend_base_url,
            "adminUrl": backend_base_url,
            "baseUrl": backend_base_url,
            "enabled": True,
            "protocol": "openid-connect",
            "publicClient": True,
            "standardFlowEnabled": True,
            "directAccessGrantsEnabled": False,
            "implicitFlowEnabled": False,
            "serviceAccountsEnabled": False,
            "frontchannelLogout": False,
            "redirectUris": [
                f"{frontend_origin}/*",
                f"{backend_base_url}/*",
            ],
            "webOrigins": ["/*"],
            "attributes": {
                "post.logout.redirect.uris": "+",
                "realm_client": "false",
                "oidc.ciba.grant.enabled": "false",
                "backchannel.logout.session.required": "true",
                "backchannel.logout.revoke.offline.tokens": "false",
            },
            "defaultClientScopes": [
                "web-origins",
                "acr",
                "roles",
                "profile",
                "basic",
                "email",
            ],
            "optionalClientScopes": [
                "address",
                "phone",
                "offline_access",
                "organization",
                "microprofile-jwt",
            ],
            "fullScopeAllowed": True,
        }

        kc_admin.create_client(token, realm, client_config)
        logger.info("Client '%s' created", client_id)
