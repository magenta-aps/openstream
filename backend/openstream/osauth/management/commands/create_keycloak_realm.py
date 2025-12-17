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
    help = "Create a Keycloak realm with default OpenStream roles, client, and default users."

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
            # Create the 3 default users
            self._ensure_default_users(kc_admin, token, realm)

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

    def _ensure_default_users(self, kc_admin, token, realm: str):
        """Creates the standard set of users for a new realm."""

        users_to_create = [
            # 1. Org Admin
            {
                "suffix": "org_admin",
                "role": settings.OSAUTH_ORG_MEMBERSHIP_ORG_ADMIN,
                "first_name": "Organisation",
                "last_name": "Admin",
            },
            # 2. Employee (Org User)
            {
                "suffix": "employee",
                "role": settings.OSAUTH_ORG_MEMBERSHIP_ORG_USER,
                "first_name": "Organisation",
                "last_name": "Employee",
            },
            # 3. Suborg Admin (Org User role per request)
            {
                "suffix": "suborg_admin",
                "role": settings.OSAUTH_ORG_MEMBERSHIP_ORG_USER,
                "first_name": "Sub-Organisation",
                "last_name": "Admin",
            },
        ]

        for user_conf in users_to_create:
            username = f"{realm}_{user_conf['suffix']}"
            password = username  # Password same as username

            self._create_and_assign_user(
                kc_admin,
                token,
                realm,
                username=username,
                password=password,
                role_name=user_conf["role"],
                first_name=user_conf["first_name"],
                last_name=user_conf["last_name"],
            )

    def _create_and_assign_user(
        self,
        kc_admin,
        token,
        realm: str,
        username: str,
        password: str,
        role_name: str,
        first_name: str,
        last_name: str,
    ):
        user_id = None

        user_payload = {
            "username": username,
            "enabled": True,
            "emailVerified": True,
            "firstName": first_name,
            "lastName": last_name,
            "email": f"{username}@example.com",
            "credentials": [
                {
                    "type": "password",
                    "value": password,
                    "temporary": False,
                }
            ],
        }

        # 1. Try to create user
        try:
            user_id = kc_admin.create_user(token, realm, user_payload)
            logger.info("User '%s' created", username)
        except Exception as e:
            # Fallback if user exists
            logger.info("User '%s' might exist, attempting to find...", username)
            try:
                existing_users = kc_admin.get_users(
                    token, realm, {"username": username}
                )
                if existing_users:
                    user_id = existing_users[0]["id"]
                    logger.info("User '%s' found", username)
            except AttributeError:
                logger.warning(
                    "SKIPPING USER '%s': 'get_users' method missing in client.",
                    username,
                )
                return

        if not user_id:
            logger.error("Could not obtain ID for user '%s', skipping.", username)
            return

        # 2. Get Role Representation
        role_rep = kc_admin.get_realm_role(token, realm, role_name)
        if not role_rep:
            logger.error(
                "Role '%s' not found, cannot assign to user '%s'.", role_name, username
            )
            return

        # 3. Assign Role
        try:
            kc_admin.add_realm_role_to_user(token, realm, user_id, role_rep)
            logger.info("Role '%s' assigned to user '%s'", role_name, username)
        except Exception:
            logger.info(
                "Role assignment logic finished for '%s' (might already have role).",
                username,
            )

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
