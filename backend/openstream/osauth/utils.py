# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

import base64
from typing import Any, Dict, List
import xml.etree.ElementTree as ET
from collections import defaultdict

from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken
from osauth.models import KeycloakSession
from osauth.keycloak import TokenResponse, UserInfo
from app.models import Organisation, OrganisationMembership, User, ROLE_CHOICES


def kc_user_info_2_local_user(kc_user: UserInfo) -> User:
    return User.objects.get_or_create(
        username=kc_user.preferred_username,
        defaults={
            "email": kc_user.email,
            "first_name": kc_user.given_name if kc_user.given_name else "",
            "last_name": kc_user.family_name if kc_user.family_name else "",
        },
    )


def sync_keycloak_realm_roles_org_memberships(
    organisation: Organisation, user: User, realm_roles: List[str]
) -> tuple[List[OrganisationMembership], List[OrganisationMembership]]:
    # Only allow syncing roles that are valid local role keys (protect against
    # long or unrelated Keycloak role names which may exceed DB field lengths).
    valid_roles = {r[0] for r in ROLE_CHOICES}
    filtered_roles = [r for r in realm_roles if r in valid_roles]

    memberships = [
        OrganisationMembership.objects.get_or_create(
            user=user, organisation=organisation, role=role
        )
        for role in filtered_roles
    ]
    new = [m for m, created in memberships if created]
    existing = [m for m, created in memberships if not created]
    return new, existing


def sync_keycloak_privilege_list_org_memberships(
    organisation: Organisation,
    user: User,
    privilege_list: Dict[Any, str],
):
    return sync_keycloak_realm_roles_org_memberships(
        organisation,
        user,
        [
            role
            for role in (
                settings.OSAUTH_ORG_MEMBERSHIP_ORG_ADMIN,
                settings.OSAUTH_ORG_MEMBERSHIP_ORG_USER,
            )
            if role in privilege_list
        ],
    )


def parse_kc_sso_privilege_list(privilege_list: str):
    privilege_list_xml = base64.b64decode(privilege_list)
    xml_root = ET.fromstring(privilege_list_xml)
    xml_privileges = xml_root.findall(".//Privilege")

    privilege_dict = defaultdict(list)
    for priv in xml_privileges:
        url = priv.text.strip()
        parts = url.split("/")
        role = parts[-2]
        value = parts[-1]
        privilege_dict[role].append(value)

    return {k: ",".join(v) for k, v in privilege_dict.items()}


def configure_keycloak_session(django_user: User, keycloak_token: TokenResponse):
    # Generate django-rest-framework tokens
    refresh = RefreshToken.for_user(django_user)
    access = str(refresh.access_token)

    # Cleanup user keycloak sessions & create a new one
    KeycloakSession.objects.filter(user=django_user).delete()

    # Create signin-session in DB
    db_keycloak_session = KeycloakSession.objects.create(
        user=django_user,
        access_token=keycloak_token.access_token,
        refresh_token=keycloak_token.refresh_token,
        id_token=keycloak_token.id_token,
    )

    # Redirect back to the frontend
    redirect_params = {
        "username": django_user.username,
        "access": access,
        "refresh": refresh,
    }

    return redirect_params
