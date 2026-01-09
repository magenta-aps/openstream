# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
import logging
from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from app.models import (
    Organisation,
    OrganisationMembership,
    SubOrganisation,
    Branch,
)
from app.serializers import (
    OrganisationSerializer,
    SubOrganisationSerializer,
    BranchSerializer,
    SubOrganisationWithRoleSerializer,
)

logger = logging.getLogger(__name__)

from app.permissions import (
    get_suborg_from_request,
    user_can_manage_suborg,
    user_can_access_branch,
    user_is_super_admin,
    user_is_admin_in_org,
    get_organisation_from_identifier,
    CanAccessBranch,
)


class OrganisationAPIView(APIView):
    """
    API view for listing organisations.
    - GET: Returns a list of all organisations with their id and name
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Returns a list of all organisations with their id and name.
        Super admins can see all organisations.
        Regular users see only organisations they belong to.
        """
        if user_is_super_admin(request.user):
            # Super admin can see all organisations
            organisations = Organisation.objects.all().order_by("name")
        else:
            # Regular users see only organisations they belong to
            user_org_ids = (
                OrganisationMembership.objects.filter(user=request.user)
                .values_list("organisation_id", flat=True)
                .distinct()
            )

            organisations = Organisation.objects.filter(id__in=user_org_ids).order_by(
                "name"
            )

        serializer = OrganisationSerializer(organisations, many=True)
        return Response(serializer.data, status=200)


class OrganisationNameAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, identifier):
        org = get_organisation_from_identifier(identifier)
        if not org:
            raise Http404("Organization not found.")

        if not (
            user_is_super_admin(request.user)
            or OrganisationMembership.objects.filter(
                user=request.user, organisation=org
            ).exists()
        ):
            return Response({"detail": "Not allowed."}, status=403)

        return Response({"name": org.name}, status=200)


class SubOrganisationListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Lists suborgs in a given organisation if the user is org_admin or suborg_admin.
        Expects ?org_id=<ORG_IDENTIFIER> (numeric id or organisation URI name)
        """
        org_identifier = request.query_params.get("org_id")
        if not org_identifier:
            return Response(
                {"error": "Please provide an 'org_id' query parameter."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
            return Response(
                {"error": f"Organisation '{org_identifier}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        is_org_admin_or_super = (
            user_is_super_admin(request.user)
            or OrganisationMembership.objects.filter(
                user=request.user, organisation=organisation, role="org_admin"
            ).exists()
        )

        if is_org_admin_or_super:
            suborgs = SubOrganisation.objects.filter(organisation=organisation)
        else:
            suborgs = SubOrganisation.objects.filter(
                organisation=organisation,
                memberships__user=request.user,
                memberships__role="suborg_admin",
            ).distinct()

        serializer = SubOrganisationSerializer(suborgs, many=True)
        return Response(serializer.data, status=200)

    def post(self, request):
        """
        Creates a new suborg in the given org. Must be org_admin.
        """
        data = request.data.copy()

        org_identifier = data.get("organisation_id")
        if org_identifier is not None:
            organisation = get_organisation_from_identifier(org_identifier)
            if not organisation:
                return Response(
                    {
                        "organisation_id": [
                            "Organisation not found for the supplied identifier."
                        ]
                    },
                    status=400,
                )
            data["organisation_id"] = organisation.id

        serializer = SubOrganisationSerializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        org_obj = serializer.validated_data["organisation"]

        # Check permissions using helper function
        if not user_is_admin_in_org(request.user, org_obj):
            return Response(
                {
                    "error": "You must be org_admin for this organisation or super_admin."
                },
                status=403,
            )

        new_suborg = serializer.save()
        return Response(SubOrganisationSerializer(new_suborg).data, status=201)


class SubOrganisationDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        suborg = get_object_or_404(SubOrganisation, pk=pk)
        if not user_can_manage_suborg(request.user, suborg):
            return Response({"error": "Not allowed."}, status=403)
        serializer = SubOrganisationSerializer(suborg)
        return Response(serializer.data, status=200)

    def patch(self, request, pk):
        suborg = get_object_or_404(SubOrganisation, pk=pk)
        if not user_can_manage_suborg(request.user, suborg):
            return Response({"error": "Not allowed."}, status=403)

        serializer = SubOrganisationSerializer(suborg, data=request.data, partial=True)
        if serializer.is_valid():
            if "organisation" in serializer.validated_data:
                return Response({"error": "Cannot change organisation."}, status=400)

            updated = serializer.save()
            return Response(SubOrganisationSerializer(updated).data, status=200)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        suborg = get_object_or_404(SubOrganisation, pk=pk)
        is_authorized = (
            user_is_super_admin(request.user)
            or OrganisationMembership.objects.filter(
                user=request.user, organisation=suborg.organisation, role="org_admin"
            ).exists()
        )
        if not is_authorized:
            return Response(
                {
                    "error": "You must be org_admin or super_admin to delete this suborg."
                },
                status=403,
            )
        suborg.delete()
        return Response(status=204)


class SubOrganisationNameAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        suborg = get_object_or_404(SubOrganisation, pk=pk)

        # Check if user can access this suborg
        if user_is_super_admin(request.user):
            return Response({"name": suborg.name}, status=200)

        if OrganisationMembership.objects.filter(
            user=request.user, organisation=suborg.organisation
        ).exists():
            return Response({"name": suborg.name}, status=200)

        return Response({"detail": "Not allowed."}, status=403)


class BranchListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Lists branches.
        - If ?branch_id is provided: Lists all branches in the organisation of that branch, provided the user has access to the initial branch.
        - If ?suborg_id is provided: Lists branches for that suborg, provided the user has access to the suborg.
        """
        branch_id = request.query_params.get("branch_id")
        suborg_id = request.query_params.get("suborg_id")

        if branch_id:
            try:
                initial_branch = get_object_or_404(Branch, id=branch_id)
                if not user_can_access_branch(request.user, initial_branch):
                    return Response(
                        {"detail": "User cannot access the specified branch."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                organisation = initial_branch.suborganisation.organisation
                branches = Branch.objects.filter(
                    suborganisation__organisation=organisation
                ).order_by("name")
                serializer = BranchSerializer(branches, many=True)
                return Response(serializer.data, status=status.HTTP_200_OK)
            except Http404:
                return Response(
                    {"detail": "Branch not found."}, status=status.HTTP_404_NOT_FOUND
                )
            except Exception as e:
                logger.error(f"Error fetching branches by branch_id: {e}")
                return Response(
                    {"detail": "An error occurred."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        elif suborg_id:
            try:
                suborg = get_object_or_404(SubOrganisation, id=suborg_id)
                if not user_can_manage_suborg(request.user, suborg):
                    if not OrganisationMembership.objects.filter(
                        user=request.user, suborganisation=suborg
                    ).exists():
                        if not OrganisationMembership.objects.filter(
                            user=request.user,
                            organisation=suborg.organisation,
                            role="org_admin",
                        ).exists():
                            return Response(
                                {
                                    "detail": "User cannot access this sub-organisation's branches."
                                },
                                status=status.HTTP_403_FORBIDDEN,
                            )

                branches = Branch.objects.filter(suborganisation=suborg).order_by(
                    "name"
                )
                serializer = BranchSerializer(branches, many=True)
                return Response(serializer.data, status=status.HTTP_200_OK)
            except Http404:
                return Response(
                    {"detail": "SubOrganisation not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            except Exception as e:
                logger.error(f"Error fetching branches by suborg_id: {e}")
                return Response(
                    {"detail": "An error occurred."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
        else:
            return Response(
                {"detail": "Either branch_id or suborg_id must be provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def post(self, request):
        """
        Creates a new branch under the specified suborg.
        Must be org_admin or suborg_admin for that suborg.
        """
        try:
            suborg = get_suborg_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        data = request.data.copy()
        data["suborganisation_id"] = suborg.id
        serializer = BranchSerializer(data=data)
        if serializer.is_valid():
            new_branch = serializer.save()
            return Response(BranchSerializer(new_branch).data, status=201)
        return Response(serializer.errors, status=400)


class BranchDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        branch = get_object_or_404(Branch, pk=pk)
        if not user_can_manage_suborg(request.user, branch.suborganisation):
            return Response({"error": "Not allowed."}, status=403)
        serializer = BranchSerializer(branch)
        return Response(serializer.data, status=200)

    def patch(self, request, pk):
        branch = get_object_or_404(Branch, pk=pk)
        if not user_can_manage_suborg(request.user, branch.suborganisation):
            return Response({"error": "Not allowed."}, status=403)

        data = request.data.copy()
        if "suborganisation_id" in data:
            return Response(
                {"error": "Cannot move branch to another suborg."}, status=400
            )

        serializer = BranchSerializer(branch, data=data, partial=True)
        if serializer.is_valid():
            updated = serializer.save()
            return Response(BranchSerializer(updated).data, status=200)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        branch = get_object_or_404(Branch, pk=pk)
        if not user_can_manage_suborg(request.user, branch.suborganisation):
            return Response({"error": "Not allowed."}, status=403)
        branch.delete()
        return Response(status=204)


class BranchNameAPIView(APIView):
    permission_classes = [IsAuthenticated, CanAccessBranch]

    def get(self, request, pk):
        branch = get_object_or_404(Branch, pk=pk)
        # Permission class has already validated access
        return Response({"name": branch.name}, status=200)


class UserSuborganisationsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        """
        Deletes the branch with the given pk if the user is authorized.
        """
        try:
            branch = Branch.objects.get(pk=pk)
        except Branch.DoesNotExist:
            return Response({"detail": "Branch not found."}, status=404)

        # Verify that the request's suborg matches the branch's suborganisation.
        try:
            suborg = get_suborg_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        if branch.suborganisation != suborg:
            return Response(
                {"detail": "Not authorized to delete this branch."}, status=403
            )

        branch.delete()
        return Response(status=204)

    def get(self, request):
        """
        Lists suborgs where the user has membership or is org_admin of the parent org.
        Also returns user_role for each suborg.
        """
        # If user is super_admin, return all suborganisations
        if user_is_super_admin(request.user):
            suborganisations = SubOrganisation.objects.all()
            # For super_admin, we'll treat them as having org_admin role everywhere
            org_admin_org_ids = set(Organisation.objects.values_list("id", flat=True))
        else:
            suborganisations = SubOrganisation.objects.filter(
                Q(
                    organisation__memberships__user=request.user,
                    organisation__memberships__role="org_admin",
                )
                | Q(memberships__user=request.user)
            ).distinct()

            org_admin_org_ids = set(
                OrganisationMembership.objects.filter(
                    user=request.user, role="org_admin"
                ).values_list("organisation_id", flat=True)
            )

        suborg_ids = suborganisations.values_list("id", flat=True)
        suborg_memberships = OrganisationMembership.objects.filter(
            user=request.user, suborganisation__in=suborg_ids
        ).values_list("suborganisation_id", "role")
        suborg_roles = {sid: role for sid, role in suborg_memberships}

        # Example: If you want to include each suborg’s branches, you can do:
        # suborganisations = suborganisations.prefetch_related('branches')

        # Then in your serializer, you can add a 'branches' field (nested).
        # For simplicity, let's skip that. But you can do it if needed.
        serializer = SubOrganisationWithRoleSerializer(
            suborganisations,
            many=True,
            context={
                "request": request,
                "org_admin_org_ids": org_admin_org_ids,
                "suborg_roles": suborg_roles,
            },
        )
        return Response(serializer.data)
