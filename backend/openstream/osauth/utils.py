# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
import base64
from collections import defaultdict

from django.conf import settings
from osauth.keycloak import UserInfo, kc_adm_client_from_settings
from app.models import OrganisationMembership, User
import xml.etree.ElementTree as ET


def kc_user_info_2_local_user(kc_user: UserInfo) -> User:
    local_user, was_created = User.objects.get_or_create(
        username=kc_user.preferred_username,
        defaults={
            "email": kc_user.email,
            "first_name": kc_user.given_name if kc_user.given_name else "",
            "last_name": kc_user.family_name if kc_user.family_name else "",
        },
    )

    return local_user


def get_openstream_role_db_vars(role: str) -> tuple[str, str]:
    if role not in settings.OSAUTH_KC_USER_ATTRS_TO_ORG_MEMBERSHIP:
        raise Exception(f"invalid openstream role: {role}")

    match (role):
        case settings.OSAUTH_KC_USER_ATTR_ORG_ADMIN:
            return "organisation_id", "org_admin"
        case settings.OSAUTH_KC_USER_ATTR_SUBORG_ADMIN:
            return "suborganisation_id", "suborg_admin"
        case settings.OSAUTH_KC_USER_ATTR_BRANCH_ADMIN:
            return "branch_id", "suborg_admin"
        case settings.OSAUTH_KC_USER_ATTR_ORG_EMPLOYEE:
            return "organisation_id", "employee"

    raise NotImplementedError(f'OpenStream role "{role}" not implemented')


def sync_kc_user_org_memberships(kc_user: UserInfo, os_user: User):
    # Fetch all current memberships once
    current_org_memberships = list(OrganisationMembership.objects.filter(user=os_user))
    current_roles_by_role = {}

    # Organize existing memberships by role for O(1) lookups later
    for m in current_org_memberships:
        current_roles_by_role.setdefault(m.role, []).append(m)

    # --- Realm Roles Sync ---
    kc_realm_roles = set(getattr(kc_user.realm_access, "roles", []))
    for os_role in settings.OSAUTH_KC_REALM_ROLES_TO_ORG_MEMBERSHIP:
        existing = current_roles_by_role.get(os_role, [])
        has_role_in_kc = os_role in kc_realm_roles

        if existing and not has_role_in_kc:
            OrganisationMembership.objects.filter(
                id__in=[e.id for e in existing]
            ).delete()
        elif not existing and has_role_in_kc:
            OrganisationMembership.objects.create(user=os_user, role=os_role)

    # --- User Attribute Roles Sync ---
    for os_role in settings.OSAUTH_KC_USER_ATTRS_TO_ORG_MEMBERSHIP:
        role_existing = current_roles_by_role.get(os_role, [])
        kc_user_role_value: str | None = getattr(kc_user, os_role, None)

        if kc_user_role_value is None:
            if role_existing:
                OrganisationMembership.objects.filter(
                    id__in=[e.id for e in role_existing]
                ).delete()
            continue

        kc_user_attr_org_memberships = set(kc_user_role_value.split(","))
        os_role_db_id_field, os_role_db_role_name = get_openstream_role_db_vars(os_role)

        # Build lookup for existing memberships by ID field
        existing_by_id = {
            getattr(e, os_role_db_id_field): e
            for e in role_existing
            if getattr(e, os_role_db_id_field, None)
        }

        # Determine sets of IDs to delete and create
        existing_ids = set(existing_by_id.keys())
        ids_to_delete = existing_ids - kc_user_attr_org_memberships
        ids_to_add = kc_user_attr_org_memberships - existing_ids

        if ids_to_delete:
            OrganisationMembership.objects.filter(
                id__in=[existing_by_id[eid].id for eid in ids_to_delete]
            ).delete()

        if ids_to_add:
            OrganisationMembership.objects.bulk_create(
                [
                    OrganisationMembership(
                        user=os_user,
                        role=os_role_db_role_name,
                        **{os_role_db_id_field: eid},
                    )
                    for eid in ids_to_add
                ]
            )


def sync_kc_user_info_sso_privilige_list(user_info: UserInfo):
    privilege_list = parse_kc_sso_privilege_list(user_info.sso_privilege_list)

    # Sign in to keycloak as ADMIN
    kc_adm_client = kc_adm_client_from_settings()
    kc_adm_token = kc_adm_client.auth(
        username=settings.KEYCLOAK_ADMIN_USERNAME,
        password=settings.KEYCLOAK_ADMIN_PASSWORD,
    )
    kc_user = kc_adm_client.get_realm_user(
        kc_adm_token, settings.KEYCLOAK_REALM, user_info.sub
    )

    # Update user attributes
    kc_user.attributes.org_admin = (
        [privilege_list[settings.OSAUTH_KC_USER_ATTR_ORG_ADMIN]]
        if settings.OSAUTH_KC_USER_ATTR_ORG_ADMIN in privilege_list
        else []
    )
    kc_user.attributes.suborg_admin = (
        [privilege_list[settings.OSAUTH_KC_USER_ATTR_SUBORG_ADMIN]]
        if settings.OSAUTH_KC_USER_ATTR_SUBORG_ADMIN in privilege_list
        else []
    )
    kc_user.attributes.branch_admin = (
        [privilege_list[settings.OSAUTH_KC_USER_ATTR_BRANCH_ADMIN]]
        if settings.OSAUTH_KC_USER_ATTR_BRANCH_ADMIN in privilege_list
        else []
    )
    kc_user.attributes.employee = (
        [privilege_list[settings.OSAUTH_KC_USER_ATTR_ORG_EMPLOYEE]]
        if settings.OSAUTH_KC_USER_ATTR_ORG_EMPLOYEE in privilege_list
        else []
    )

    kc_adm_client.update_realm_user(
        kc_adm_token,
        settings.KEYCLOAK_REALM,
        user_info.sub,
        kc_user,
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
