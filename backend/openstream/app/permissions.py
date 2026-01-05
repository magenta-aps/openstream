# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from app.models import (
    Organisation,
    SubOrganisation,
    Branch,
    OrganisationMembership,
    OrganisationAPIAccess,
)


def user_is_super_admin(user):
    """Check if user has super_admin role"""
    return OrganisationMembership.objects.filter(user=user, role="super_admin").exists()


def user_is_org_admin(user):
    return OrganisationMembership.objects.filter(user=user, role="org_admin").exists()


def user_is_org_admin_or_super_admin(user):
    """Check if user is either org_admin or super_admin"""
    return OrganisationMembership.objects.filter(
        user=user, role__in=["org_admin", "super_admin"]
    ).exists()


def get_org_from_user(user):
    membership = OrganisationMembership.objects.filter(user=user).first()
    if membership:
        return membership.organisation
    return None


def user_is_admin_in_org(user, org):
    """Check if user is org_admin in specific org OR super_admin"""
    if user_is_super_admin(user):
        return True
    return OrganisationMembership.objects.filter(
        user=user, organisation=org, role="org_admin"
    ).exists()


def user_can_manage_suborg(user, suborg):
    """
    Returns True if 'user' is org_admin for suborg's organisation,
    suborg_admin for that suborg, or super_admin, else False.
    """
    # super_admin can manage everything
    if user_is_super_admin(user):
        return True

    if OrganisationMembership.objects.filter(
        user=user, organisation=suborg.organisation, role="org_admin"
    ).exists():
        return True

    if OrganisationMembership.objects.filter(
        user=user, suborganisation=suborg, role="suborg_admin"
    ).exists():
        return True

    return False


def get_suborg_from_request(request):
    """
    Checks for 'suborg_id' in request.data or request.query_params,
    then verifies user is either org_admin of that org, suborg_admin
    for that specific suborg, or super_admin.
    """
    suborg_id = request.data.get("suborg_id") or request.query_params.get("suborg_id")
    if not suborg_id:
        raise ValueError("suborg_id is required.")

    suborg = get_object_or_404(SubOrganisation, id=suborg_id)

    # super_admin can access everything
    if user_is_super_admin(request.user):
        return suborg

    # org_admin check
    if OrganisationMembership.objects.filter(
        user=request.user, organisation=suborg.organisation, role="org_admin"
    ).exists():
        return suborg

    # suborg_admin check
    if OrganisationMembership.objects.filter(
        user=request.user, suborganisation=suborg, role="suborg_admin"
    ).exists():
        return suborg

    raise ValueError(
        f"User '{request.user.username}' is not org_admin, suborg_admin, or super_admin "
        f"for suborg_id={suborg_id}."
    )


def user_can_access_branch(user, branch):
    """
    Returns True if user is org_admin of the parent org, suborg_admin of the parent suborg,
    branch_admin/employee on that branch, or super_admin.
    """
    # super_admin can access everything
    if user_is_super_admin(user):
        return True

    # org_admin
    if OrganisationMembership.objects.filter(
        user=user, organisation=branch.suborganisation.organisation, role="org_admin"
    ).exists():
        return True

    # suborg_admin
    if OrganisationMembership.objects.filter(
        user=user, suborganisation=branch.suborganisation, role="suborg_admin"
    ).exists():
        return True

    # branch_admin or employee
    if OrganisationMembership.objects.filter(user=user, branch=branch).exists():
        return True

    return False


def get_branch_from_request(request):
    """
    Checks for 'branch_id' in request.data or request.query_params,
    then verifies the user is org_admin of the branch's org, or
    suborg_admin of the branch's suborg, or branch_admin / employee
    for that exact branch, or super_admin.
    """
    branch_id = request.data.get("branch_id") or request.query_params.get("branch_id")
    if not branch_id:
        raise ValueError("branch_id is required.")

    branch = get_object_or_404(Branch, id=branch_id)

    # super_admin can access everything
    if user_is_super_admin(request.user):
        return branch

    # org_admin
    if OrganisationMembership.objects.filter(
        user=request.user,
        organisation=branch.suborganisation.organisation,
        role="org_admin",
    ).exists():
        return branch

    # suborg_admin
    if OrganisationMembership.objects.filter(
        user=request.user, suborganisation=branch.suborganisation, role="suborg_admin"
    ).exists():
        return branch

    # branch_admin or employee for that branch
    if OrganisationMembership.objects.filter(user=request.user, branch=branch).exists():
        return branch

    raise ValueError(
        f"User '{request.user.username}' does not have permission to access branch_id={branch_id}."
    )


def check_api_access(user, api_name):
    """
    Check if user's organisation has access to the specified API.
    Returns True if access is granted, False otherwise.

    Args:
        user: The user making the request
        api_name: The API name to check (e.g., 'winkas', 'kmd', 'speedadmin')

    Returns:
        bool: True if access is granted, False otherwise
    """
    # Super admin always has access
    if user_is_super_admin(user):
        return True

    # Get user's organisation
    org = get_org_from_user(user)
    if not org:
        return False

    # Check if organisation has active access to the API
    return OrganisationAPIAccess.objects.filter(
        organisation=org, api_name=api_name, is_active=True
    ).exists()


def get_organisation_from_identifier(identifier):
    """Resolve an organisation by numeric id, URI name, or legacy display name."""
    if identifier is None:
        return None

    if isinstance(identifier, Organisation):
        return identifier

    # Normalise to string for downstream checks
    value = str(identifier).strip()
    if not value:
        return None

    if value.isdigit():
        try:
            return Organisation.objects.get(pk=int(value))
        except Organisation.DoesNotExist:
            return None

    slug_candidate = slugify(value)
    slug_lookups = []

    if slug_candidate:
        slug_lookups.append({"uri_name": slug_candidate})

    # Legacy casing support for already-normalised slugs
    slug_lookups.append({"uri_name": value.lower()})
    # Final fallback to the human readable name (case-insensitive)
    slug_lookups.append({"name__iexact": value})

    for lookup in slug_lookups:
        try:
            return Organisation.objects.get(**lookup)
        except Organisation.DoesNotExist:
            continue

    return None


def user_belongs_to_organisation(user, organisation):
    """
    Returns True if the user has any membership (org_admin, suborg_admin,
    branch_admin, employee, etc.) in the given organisation, or is super_admin.
    """
    # Super admin has access to all organisations
    if user_is_super_admin(user):
        return True

    return OrganisationMembership.objects.filter(
        user=user, organisation=organisation
    ).exists()
