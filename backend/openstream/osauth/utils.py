# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

import base64
import xml.etree.ElementTree as ET
from collections import defaultdict

from django.conf import settings
from osauth.keycloak import UserInfo, kc_adm_client_from_settings
from app.models import Organisation, OrganisationMembership, User


def kc_user_info_2_local_user(kc_user: UserInfo) -> User:
    return User.objects.get_or_create(
        username=kc_user.preferred_username,
        defaults={
            "email": kc_user.email,
            "first_name": kc_user.given_name if kc_user.given_name else "",
            "last_name": kc_user.family_name if kc_user.family_name else "",
        },
    )


def get_openstream_role_db_vars(role: str) -> tuple[str, str]:
    if role not in settings.OSAUTH_KC_USER_ATTRS_TO_ORG_MEMBERSHIP:
        raise Exception(f"invalid openstream role: {role}")

    match (role):
        case settings.OSAUTH_ORG_MEMBERSHIP_ORG_ADMIN:
            return "organisation_id", "org_admin"
        case settings.OSAUTH_ORG_MEMBERSHIP_SUBORG_ADMIN:
            return "suborganisation_id", "suborg_admin"
        case settings.OSAUTH_ORG_MEMBERSHIP_BRANCH_ADMIN:
            return "branch_id", "branch_admin"
        case settings.OSAUTH_ORG_MEMBERSHIP_EMPLOYEE:
            return "branch_id", "employee"

    raise NotImplementedError(f'OpenStream role "{role}" not implemented')


def sync_keycloak_sso_org_memberships(
    organisation: Organisation, user: User, user_info: UserInfo
):
    privilege_list = parse_kc_sso_privilege_list(user_info.sso_privilege_list)

    # Sync "org_admin"-role
    if settings.OSAUTH_ORG_MEMBERSHIP_ORG_ADMIN in privilege_list:
        org_admin_membership, was_created = (
            OrganisationMembership.objects.get_or_create(
                user=user,
                organisation=organisation,
                role=settings.OSAUTH_ORG_MEMBERSHIP_ORG_ADMIN,
            )
        )

    # Sync "org_user"-role
    if settings.OSAUTH_ORG_MEMBERSHIP_ORG_USER in privilege_list:
        org_user_membership, was_created = OrganisationMembership.objects.get_or_create(
            user=user,
            organisation=organisation,
            role=settings.OSAUTH_ORG_MEMBERSHIP_ORG_USER,
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
