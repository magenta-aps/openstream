# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from app.models import (
    Organisation,
    SubOrganisation,
    Branch,
    OrganisationMembership,
    OrganisationAPIAccess,
    SlideshowPlayerAPIKey,
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


###############################################################################
# Helper Functions for Branch Authentication
###############################################################################


def validate_api_key_for_branch(api_key_value, branch):
    """
    Validates that an API key is active and authorized for the given branch.

    Args:
        api_key_value: The API key string from the X-API-KEY header
        branch: The Branch object to validate access for

    Returns:
        tuple: (is_valid: bool, error_response: Response or None)
    """
    if not api_key_value:
        return False, None

    key_obj = SlideshowPlayerAPIKey.objects.filter(
        key=api_key_value, is_active=True
    ).first()

    if not key_obj:
        return False, Response({"detail": "Invalid or inactive API key."}, status=403)

    if not key_obj.branch:
        return False, Response(
            {"detail": "API key must be bound to a branch."},
            status=403,
        )

    if key_obj.branch and key_obj.branch != branch:
        return False, Response(
            {"detail": "API key not valid for this branch."}, status=403
        )

    return True, None


def authenticate_for_branch(request, branch):
    """
    Authenticates a request for a specific branch using either API key or user auth.

    Args:
        request: The DRF request object
        branch: The Branch object to authenticate for

    Returns:
        Response or None: Returns an error Response if authentication fails, None if successful
    """
    api_key_value = request.headers.get("X-API-KEY")

    if api_key_value:
        is_valid, error_response = validate_api_key_for_branch(api_key_value, branch)
        if not is_valid:
            return error_response
    else:
        # User authentication
        if not request.user or not request.user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=401)
        if not user_can_access_branch(request.user, branch):
            return Response({"detail": "Not allowed."}, status=403)

    return None


def get_branch_and_authenticate(request, branch_id_param="branch_id"):
    """
    Gets a branch by ID and authenticates the request for that branch.

    Args:
        request: The DRF request object
        branch_id_param: The query parameter name for the branch ID (default: "branch_id")

    Returns:
        tuple: (branch: Branch or None, error_response: Response or None)
    """
    branch_id = request.query_params.get(branch_id_param)
    if not branch_id:
        return None, Response({"detail": f"{branch_id_param} is required."}, status=400)

    branch = get_object_or_404(Branch, id=branch_id)
    auth_error = authenticate_for_branch(request, branch)

    if auth_error:
        return None, auth_error

    return branch, None


def handle_branch_request(request_func):
    """
    Decorator to handle branch authentication in views.
    Extracts branch from request and validates access.

    Usage:
        @handle_branch_request
        def get(self, request, branch):
            # branch is already validated
            pass
    """

    def wrapper(self, request, *args, **kwargs):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)
        return request_func(self, request, branch, *args, **kwargs)

    return wrapper


###############################################################################
# Django Rest Framework Permission Classes
###############################################################################


class IsSuperAdmin(BasePermission):
    """
    Permission class that allows only super admins.
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and user_is_super_admin(request.user)
        )


class IsOrgAdmin(BasePermission):
    """
    Permission class that allows org admins for a specific organisation.
    Expects the view to provide 'get_organisation()' method or 'organisation' in view kwargs.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        # Allow super admins
        if user_is_super_admin(request.user):
            return True

        # Try to get organisation from view
        organisation = self._get_organisation(request, view)
        if not organisation:
            return False

        return OrganisationMembership.objects.filter(
            user=request.user, organisation=organisation, role="org_admin"
        ).exists()

    def _get_organisation(self, request, view):
        """Helper to extract organisation from various sources."""
        # Check if view has get_organisation method
        if hasattr(view, "get_organisation"):
            return view.get_organisation()

        # Check query params or request data for org_id/organisation_id
        org_identifier = (
            request.query_params.get("org_id")
            or request.query_params.get("organisation_id")
            or request.data.get("org_id")
            or request.data.get("organisation_id")
        )

        if org_identifier:
            return get_organisation_from_identifier(org_identifier)

        return None


class IsOrgAdminOrSuperAdmin(BasePermission):
    """
    Permission class that allows org admins or super admins for a specific organisation.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if user_is_super_admin(request.user):
            return True

        # Check if user is org_admin in any organisation
        return OrganisationMembership.objects.filter(
            user=request.user, role="org_admin"
        ).exists()


class CanManageSubOrg(BasePermission):
    """
    Permission class that checks if user can manage a specific sub-organisation.
    User must be org_admin for the parent organisation, suborg_admin for the suborg, or super_admin.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if user_is_super_admin(request.user):
            return True

        suborg = self._get_suborg(request, view)
        if not suborg:
            return False

        return user_can_manage_suborg(request.user, suborg)

    def has_object_permission(self, request, view, obj):
        """Check permission for a specific SubOrganisation object."""
        if not (request.user and request.user.is_authenticated):
            return False

        if user_is_super_admin(request.user):
            return True

        # obj should be a SubOrganisation
        if isinstance(obj, SubOrganisation):
            return user_can_manage_suborg(request.user, obj)

        # If obj has a suborganisation attribute (like Branch)
        if hasattr(obj, "suborganisation"):
            return user_can_manage_suborg(request.user, obj.suborganisation)

        return False

    def _get_suborg(self, request, view):
        """Helper to extract suborg from various sources."""
        if hasattr(view, "get_suborg"):
            return view.get_suborg()

        # Check for suborg_id in various places
        suborg_id = (
            request.query_params.get("suborg_id")
            or request.data.get("suborg_id")
            or view.kwargs.get("suborg_id")
        )

        if suborg_id:
            try:
                return SubOrganisation.objects.get(id=suborg_id)
            except SubOrganisation.DoesNotExist:
                return None

        # Check for pk if this is a detail view on SubOrganisation
        pk = view.kwargs.get("pk")
        if pk and hasattr(view, "get_object"):
            try:
                obj = view.get_object()
                if isinstance(obj, SubOrganisation):
                    return obj
            except Exception:
                pass

        return None


class CanAccessBranch(BasePermission):
    """
    Permission class that checks if user can access a specific branch.
    User must be org_admin, suborg_admin, branch_admin, employee, or super_admin.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if user_is_super_admin(request.user):
            return True

        branch = self._get_branch(request, view)
        if not branch:
            return False

        return user_can_access_branch(request.user, branch)

    def has_object_permission(self, request, view, obj):
        """Check permission for a specific Branch object."""
        if not (request.user and request.user.is_authenticated):
            return False

        if user_is_super_admin(request.user):
            return True

        # obj should be a Branch or have a branch attribute
        if isinstance(obj, Branch):
            return user_can_access_branch(request.user, obj)

        if hasattr(obj, "branch"):
            return user_can_access_branch(request.user, obj.branch)

        return False

    def _get_branch(self, request, view):
        """Helper to extract branch from various sources."""
        if hasattr(view, "get_branch"):
            return view.get_branch()

        # Check for branch_id in various places
        branch_id = (
            request.query_params.get("branch_id")
            or request.data.get("branch_id")
            or view.kwargs.get("branch_id")
        )

        if branch_id:
            try:
                return Branch.objects.get(id=branch_id)
            except Branch.DoesNotExist:
                return None

        # Check for pk if this is a detail view on Branch
        pk = view.kwargs.get("pk")
        if pk and hasattr(view, "get_object"):
            try:
                obj = view.get_object()
                if isinstance(obj, Branch):
                    return obj
                if hasattr(obj, "branch"):
                    return obj.branch
            except Exception:
                pass

        return None


class CanManageBranch(BasePermission):
    """
    Permission class that checks if user can manage a branch (higher privilege than access).
    User must be org_admin, suborg_admin for the parent suborg, or super_admin.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if user_is_super_admin(request.user):
            return True

        branch = self._get_branch(request, view)
        if not branch:
            return False

        return user_can_manage_suborg(request.user, branch.suborganisation)

    def has_object_permission(self, request, view, obj):
        """Check permission for a specific Branch object."""
        if not (request.user and request.user.is_authenticated):
            return False

        if user_is_super_admin(request.user):
            return True

        if isinstance(obj, Branch):
            return user_can_manage_suborg(request.user, obj.suborganisation)

        if hasattr(obj, "branch"):
            return user_can_manage_suborg(request.user, obj.branch.suborganisation)

        return False

    def _get_branch(self, request, view):
        """Helper to extract branch from various sources."""
        if hasattr(view, "get_branch"):
            return view.get_branch()

        branch_id = (
            request.query_params.get("branch_id")
            or request.data.get("branch_id")
            or view.kwargs.get("branch_id")
        )

        if branch_id:
            try:
                return Branch.objects.get(id=branch_id)
            except Branch.DoesNotExist:
                return None

        pk = view.kwargs.get("pk")
        if pk and hasattr(view, "get_object"):
            try:
                obj = view.get_object()
                if isinstance(obj, Branch):
                    return obj
                if hasattr(obj, "branch"):
                    return obj.branch
            except Exception:
                pass

        return None


class BelongsToOrganisation(BasePermission):
    """
    Permission class that checks if user belongs to a specific organisation.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if user_is_super_admin(request.user):
            return True

        organisation = self._get_organisation(request, view)
        if not organisation:
            return False

        return user_belongs_to_organisation(request.user, organisation)

    def _get_organisation(self, request, view):
        """Helper to extract organisation from various sources."""
        if hasattr(view, "get_organisation"):
            return view.get_organisation()

        org_identifier = (
            request.query_params.get("org_id")
            or request.query_params.get("organisation_id")
            or request.data.get("org_id")
            or request.data.get("organisation_id")
            or view.kwargs.get("identifier")
        )

        if org_identifier:
            return get_organisation_from_identifier(org_identifier)

        return None


class HasAPIKeyOrIsAuthenticated(BasePermission):
    """
    Permission class that allows access via valid API key or user authentication.
    API key is checked via X-API-KEY header.
    """

    def has_permission(self, request, view):
        # Check for API key authentication
        api_key_value = request.headers.get("X-API-KEY")
        if api_key_value:
            try:
                api_key_obj = SlideshowPlayerAPIKey.objects.get(
                    key=api_key_value, is_active=True
                )
                # Store the API key object in request for later use
                request.api_key_obj = api_key_obj
                return True
            except SlideshowPlayerAPIKey.DoesNotExist:
                pass

        # Fall back to user authentication
        return request.user and request.user.is_authenticated


class HasBranchAPIKeyOrCanAccessBranch(BasePermission):
    """
    Permission class that allows access via branch-specific API key or if user can access the branch.
    """

    def has_permission(self, request, view):
        # Check for API key authentication
        api_key_value = request.headers.get("X-API-KEY")
        if api_key_value:
            try:
                api_key_obj = SlideshowPlayerAPIKey.objects.get(
                    key=api_key_value, is_active=True
                )
                request.api_key_obj = api_key_obj

                # If API key has a branch, verify it matches the requested branch
                if hasattr(api_key_obj, "branch"):
                    branch = self._get_branch(request, view)
                    if branch and api_key_obj.branch.id != branch.id:
                        return False

                return True
            except SlideshowPlayerAPIKey.DoesNotExist:
                pass

        # Fall back to user authentication and branch access check
        if not (request.user and request.user.is_authenticated):
            return False

        if user_is_super_admin(request.user):
            return True

        branch = self._get_branch(request, view)
        if not branch:
            return False

        return user_can_access_branch(request.user, branch)

    def _get_branch(self, request, view):
        """Helper to extract branch from various sources."""
        if hasattr(view, "get_branch"):
            return view.get_branch()

        branch_id = request.query_params.get("branch_id") or request.data.get(
            "branch_id"
        )

        if branch_id:
            try:
                return Branch.objects.get(id=branch_id)
            except Branch.DoesNotExist:
                return None

        return None


class CanManageBranchAPIKey(BasePermission):
    """
    Permission class for managing branch API keys.
    User must be org_admin, suborg_admin, or super_admin for the branch.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if user_is_super_admin(request.user):
            return True

        branch = self._get_branch(request, view)
        if not branch:
            return False

        # Check if user is org_admin
        is_org_admin = OrganisationMembership.objects.filter(
            user=request.user,
            organisation=branch.suborganisation.organisation,
            role="org_admin",
        ).exists()

        # Check if user is suborg_admin
        is_suborg_admin = OrganisationMembership.objects.filter(
            user=request.user,
            suborganisation=branch.suborganisation,
            role="suborg_admin",
        ).exists()

        return is_org_admin or is_suborg_admin

    def _get_branch(self, request, view):
        """Helper to extract branch from request."""
        if hasattr(view, "get_branch"):
            return view.get_branch()

        branch_id = request.query_params.get("branch_id") or request.data.get(
            "branch_id"
        )
        if branch_id:
            try:
                return Branch.objects.get(id=branch_id)
            except Branch.DoesNotExist:
                return None

        return None
