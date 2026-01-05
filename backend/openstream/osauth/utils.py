# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

import base64
import xml.etree.ElementTree as ET
from collections import defaultdict
from typing import Any, Dict, List, Tuple

from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken

from app.models import Organisation, OrganisationMembership, User
from osauth.keycloak import TokenResponse, UserInfo
from osauth.models import KeycloakSession


def kc_user_info_to_local_user(kc_user: UserInfo) -> Tuple[User, bool]:
    """
    Get or create a local Django user based on Keycloak UserInfo.
    Returns (user, created).
    """
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
) -> Tuple[List[OrganisationMembership], List[OrganisationMembership]]:
    """
    Syncs Keycloak realm roles to local OrganisationMembership records.
    Only syncs roles that exist in the local OrganisationMembership.Role enum.
    """
    # Fix: Use the new Role enum values instead of the old ROLE_CHOICES tuple
    valid_roles = set(OrganisationMembership.Role.values)

    # Filter out any Keycloak roles that don't match our defined local roles
    filtered_roles = [r for r in realm_roles if r in valid_roles]

    memberships_result = [
        OrganisationMembership.objects.get_or_create(
            user=user, organisation=organisation, role=role
        )
        for role in filtered_roles
    ]

    new_memberships = [m for m, created in memberships_result if created]
    existing_memberships = [m for m, created in memberships_result if not created]

    return new_memberships, existing_memberships


def sync_keycloak_privilege_list_org_memberships(
    organisation: Organisation,
    user: User,
    privilege_list: Dict[Any, str],
):
    """
    Syncs memberships based on a privilege list (e.g. from SSO).
    """
    relevant_roles = [
        role
        for role in (
            settings.OSAUTH_ORG_MEMBERSHIP_ORG_ADMIN,
            settings.OSAUTH_ORG_MEMBERSHIP_ORG_USER,
        )
        if role in privilege_list
    ]

    return sync_keycloak_realm_roles_org_memberships(
        organisation,
        user,
        relevant_roles,
    )


def parse_kc_sso_privilege_list(privilege_list: str) -> Dict[str, str]:
    """
    Parses a base64 encoded XML privilege list into a dictionary.
    """
    try:
        privilege_list_xml = base64.b64decode(privilege_list)
        xml_root = ET.fromstring(privilege_list_xml)
        xml_privileges = xml_root.findall(".//Privilege")

        privilege_dict = defaultdict(list)
        for priv in xml_privileges:
            if priv.text:
                url = priv.text.strip()
                # Assuming format like .../RoleName/Value
                parts = url.split("/")
                if len(parts) >= 2:
                    role = parts[-2]
                    value = parts[-1]
                    privilege_dict[role].append(value)

        return {k: ",".join(v) for k, v in privilege_dict.items()}
    except Exception:
        # Return empty dict on parse failure to prevent crashes
        return {}


def configure_keycloak_session(
    django_user: User, keycloak_token: TokenResponse
) -> Dict[str, Any]:
    """
    Sets up the local session and generates JWT tokens for the frontend.
    """
    # Generate django-rest-framework tokens
    refresh = RefreshToken.for_user(django_user)
    access = str(refresh.access_token)

    # Cleanup old user keycloak sessions & create a new one
    # Note: Depending on requirements, you might want to keep history,
    # but strictly following your original logic, we delete old ones.
    KeycloakSession.objects.filter(user=django_user).delete()

    # Create signin-session in DB
    KeycloakSession.objects.create(
        user=django_user,
        access_token=keycloak_token.access_token,
        refresh_token=keycloak_token.refresh_token,
        id_token=keycloak_token.id_token,
    )

    # Return params needed for frontend redirect
    return {
        "username": django_user.username,
        "access": access,
        "refresh": str(refresh),
    }
