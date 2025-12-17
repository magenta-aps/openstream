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
    help = "Create a Keycloak realm with default OpenStream roles, client, and admin user."

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
                        f"Realm '{realm}' already exists - skipping realm creation."
                    )
                )
            else:
                self._create_realm(kc_admin, token, realm)

            # Ensure components exist even if realm existed
            self._ensure_roles(kc_admin, token, realm)
            self._ensure_openstream_client(
                kc_admin,
                token,
                realm,
                frontend_origin=frontend_origin,
                backend_base_url=backend_base_url,
            )
            self._ensure_admin_user(kc_admin, token, realm)

        except KeycloakError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(self.style.SUCCESS(f"Realm '{realm}' setup complete."))

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

    def _ensure_admin_user(self, kc_admin, token, realm: str):
        username = f"{realm}_org_admin"
        password = f"{realm}_org_admin"
        admin_role_name = settings.OSAUTH_ORG_MEMBERSHIP_ORG_ADMIN
        user_id = None

        user_payload = {
            "username": username,
            "enabled": True,
            "emailVerified": True,
            "firstName": "Organisation",
            "lastName": "Admin",
            "email": f"{username}@example.com",
            "credentials": [
                {
                    "type": "password",
                    "value": password,
                    "temporary": False,
                }
            ],
        }

        # 1. Try to create user directly
        try:
            # We call the new 'create_user' method which accepts a dict
            user_id = kc_admin.create_user(token, realm, user_payload)
            logger.info("User '%s' created", username)
        except Exception as e:
            logger.info("Could not create user (might exist), attempting to find. Error: %s", e)
            
            # Now this will work because we added get_users() to keycloak.py
            existing_users = kc_admin.get_users(token, realm, {"username": username})
            if existing_users:
                user_id = existing_users[0]["id"]
                logger.info("User '%s' found", username)

        if not user_id:
            logger.error("Could not obtain ID for user '%s', cannot assign roles.", username)
            return

        # 2. Get Role Representation
        role_rep = kc_admin.get_realm_role(token, realm, admin_role_name)
        if not role_rep:
            logger.error("Role '%s' not found, cannot assign to user.", admin_role_name)
            return

        # 3. Assign Role to User
        try:
            # Note: We pass role_rep directly, add_realm_role_to_user wraps it in a list
            kc_admin.add_realm_role_to_user(token, realm, user_id, role_rep)
            logger.info("Role '%s' assigned to user '%s'", admin_role_name, username)
        except Exception as e:
            logger.info("Role assignment logic finished (User might already have role).")

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
            "protocolMappers": [
                {
                    "name": "OpenStream Realm Roles",
                    "protocol": "openid-connect",
                    "protocolMapper": "oidc-usermodel-realm-role-mapper",
                    "consentRequired": False,
                    "config": {
                        "multivalued": "true",
                        "userinfo.token.claim": "true",
                        "id.token.claim": "true",
                        "access.token.claim": "true",
                        "claim.name": "realm_access.roles",
                        "jsonType.label": "String",
                    },
                }
            ],
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