# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
import logging
from django.conf import settings
from django.contrib.auth.models import User
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from app.models import (
    UserExtended,
    OrganisationMembership,
)
from app.serializers import (
    UpdateUserSerializer,
    UserSerializer,
    ShowUsernameAndEmailSerializer,
    ShowAllUserInfoSerializer,
    UserMembershipDetailSerializer,
    OrganisationMembershipSerializer,
)

logger = logging.getLogger(__name__)

from app.permissions import (
    get_organisation_from_identifier,
    user_is_super_admin,
)


class CreateUserAPIView(APIView):
    """
    Creates a basic Django user + associated UserExtended.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        username = request.data.get("username")
        email = request.data.get("email")
        password = request.data.get("password")
        first_name = request.data.get("first_name", "")
        last_name = request.data.get("last_name", "")
        language_preference = request.data.get("language_preference", "en")

        if not username or not email or not password:
            return Response(
                {"error": "username, email, and password required."}, status=400
            )

        if User.objects.filter(username=username).exists():
            return Response({"error": "Username already taken."}, status=400)

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
        )
        UserExtended.objects.create(user=user, language_preference=language_preference)
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "language_preference": language_preference,
            },
            status=201,
        )


class UpdateUserAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        ue = get_object_or_404(UserExtended, user=request.user)
        ser = UpdateUserSerializer(ue, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        updated = ser.save()
        return Response(UpdateUserSerializer(updated).data, status=200)


class UserDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        target_user = get_object_or_404(User, pk=pk)

        if target_user == request.user:
            return Response(
                {"error": "You cannot remove yourself from organizations."}, status=403
            )

        # Super admins can delete users from any organization
        if user_is_super_admin(request.user):
            # Get all organizations where the target user has memberships
            admin_orgs = OrganisationMembership.objects.filter(
                user=target_user
            ).values_list("organisation_id", flat=True)
        else:
            # Get the orgs where the request.user is org_admin
            admin_orgs = OrganisationMembership.objects.filter(
                user=request.user, role="org_admin"
            ).values_list("organisation_id", flat=True)

        if not admin_orgs:
            if user_is_super_admin(request.user):
                error_msg = "No organizations found for the target user."
            else:
                error_msg = "You must be org_admin in at least one organization to perform this action."
            return Response(
                {"error": error_msg},
                status=403,
            )

        # Remove memberships for target_user in the appropriate organizations
        memberships_to_remove = OrganisationMembership.objects.filter(
            user=target_user, organisation_id__in=admin_orgs
        )

        if not memberships_to_remove.exists():
            if user_is_super_admin(request.user):
                error_msg = (
                    f"User {target_user.username} is not a member of any organizations."
                )
            else:
                error_msg = f"User {target_user.username} is not a member of any organizations where you are admin."
            return Response(
                {"error": error_msg},
                status=403,
            )

        memberships_to_remove.delete()

        if user_is_super_admin(request.user):
            message = "User removed from all organizations."
        else:
            message = "User removed from organizations where you are admin."

        return Response(
            {"message": message},
            status=200,
        )


class ShowUsernameAndEmailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ser = ShowUsernameAndEmailSerializer(request.user)
        return Response(ser.data, status=200)


class ShowAllUserInfoView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ue, created = UserExtended.objects.get_or_create(user=request.user)
        if created:
            # Optionally log that a UserExtended record was created on-the-fly
            logger.info(
                f"UserExtended record created for user {request.user.username} in ShowAllUserInfoView"
            )
        ser = ShowAllUserInfoSerializer(ue)
        return Response(ser.data, status=200)


class OrganisationUsersListAPIView(ListAPIView):
    """
    Lists all users in a given org.
    GET /api/organisations/<org_identifier>/users/
    """

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        org_identifier = self.kwargs["org_identifier"]
        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
            raise Http404("Organisation not found.")

        # Ensure request.user is at least suborg_admin, org_admin in that org, or super_admin
        # For simplicity, let's say org_admin or super_admin can see all
        # or suborg_admin can see all users in the same org if we want that logic
        is_authorized = (
            user_is_super_admin(self.request.user)
            or OrganisationMembership.objects.filter(
                user=self.request.user, organisation=organisation, role="org_admin"
            ).exists()
        )
        if not is_authorized:
            # If you want suborg_admin to see the same, do a bigger check
            # For now, we only let org_admin see. So if not org_admin => empty
            return User.objects.none()

        return User.objects.filter(
            organisation_memberships__organisation=organisation
        ).distinct()


class MembershipAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Get memberships for a specific user.
        Requires ?user=<user_id> parameter.

        Authorization:
        - Super admins can query any user's memberships
        - Org admins can query memberships for users in their organizations
        - Regular users can only query their own memberships
        """
        user_id = request.query_params.get("user")
        if not user_id:
            return Response(
                {"detail": "user parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Convert user_id to int for comparison
        try:
            target_user_id = int(user_id)
        except ValueError:
            return Response(
                {"detail": "Invalid user_id format."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check authorization
        if user_is_super_admin(request.user):
            # Super admins can query any user's memberships
            memberships = OrganisationMembership.objects.filter(user_id=target_user_id)
        elif request.user.id == target_user_id:
            # Users can always query their own memberships
            memberships = OrganisationMembership.objects.filter(user_id=target_user_id)
        else:
            # Check if requesting user is org_admin in any of the target user's organizations
            target_user_org_ids = OrganisationMembership.objects.filter(
                user_id=target_user_id
            ).values_list("organisation_id", flat=True)

            requesting_user_admin_org_ids = OrganisationMembership.objects.filter(
                user=request.user, role="org_admin"
            ).values_list("organisation_id", flat=True)

            # Check if there's any overlap
            common_orgs = set(target_user_org_ids) & set(requesting_user_admin_org_ids)

            if not common_orgs:
                return Response(
                    {"detail": "Not authorized to view this user's memberships."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            # Only return memberships in organizations where the requesting user is org_admin
            memberships = OrganisationMembership.objects.filter(
                user_id=target_user_id, organisation_id__in=common_orgs
            )

        ser = UserMembershipDetailSerializer(memberships, many=True)
        return Response(ser.data, status=200)

    def post(self, request):
        data = request.data.copy()
        # Allow passing organisation as an identifier (id, uri_name, or name)
        org_input = data.get("organisation")
        if org_input is not None:
            # If a nested dict with 'id' was provided, prefer that
            if isinstance(org_input, dict) and "id" in org_input:
                data["organisation"] = org_input.get("id")
            else:
                org_obj = get_organisation_from_identifier(org_input)
                if not org_obj:
                    return Response({"error": "Organisation not found"}, status=400)
                data["organisation"] = org_obj.id

        ser = OrganisationMembershipSerializer(data=data)
        ser.is_valid(raise_exception=True)

        org_id = ser.validated_data["organisation"].id
        suborg = ser.validated_data.get("suborganisation", None)
        branch = ser.validated_data.get("branch", None)
        role = ser.validated_data["role"]

        if not self._can_manage_membership(request.user, org_id, suborg, branch, role):
            return Response({"detail": "Not allowed to create membership."}, status=403)

        new_mship = ser.save()
        return Response(OrganisationMembershipSerializer(new_mship).data, status=201)

    def patch(self, request, pk):
        mship = get_object_or_404(OrganisationMembership, pk=pk)
        data = request.data.copy()
        # If organisation provided in patch, allow identifier forms
        if "organisation" in data:
            org_input = data.get("organisation")
            if isinstance(org_input, dict) and "id" in org_input:
                data["organisation"] = org_input.get("id")
            else:
                org_obj = get_organisation_from_identifier(org_input)
                if not org_obj:
                    return Response({"error": "Organisation not found"}, status=400)
                data["organisation"] = org_obj.id

        ser = OrganisationMembershipSerializer(mship, data=data, partial=True)
        ser.is_valid(raise_exception=True)

        org_id = ser.validated_data.get("organisation", mship.organisation).id
        suborg = ser.validated_data.get("suborganisation", mship.suborganisation)
        branch = ser.validated_data.get("branch", mship.branch)
        role = ser.validated_data.get("role", mship.role)

        if not self._can_manage_membership(request.user, org_id, suborg, branch, role):
            return Response({"detail": "Not allowed to modify membership."}, status=403)

        updated = ser.save()
        return Response(OrganisationMembershipSerializer(updated).data, status=200)

    def _can_manage_membership(self, acting_user, org_id, suborg, branch, role):
        # If acting_user is super_admin => can manage any membership anywhere
        if user_is_super_admin(acting_user):
            return True

        # If acting_user is org_admin for org_id => can manage any membership in that org
        is_org_admin = OrganisationMembership.objects.filter(
            user=acting_user, organisation_id=org_id, role="org_admin"
        ).exists()
        if is_org_admin:
            # also ensure suborg/branch belongs to the same org
            if suborg and suborg.organisation_id != org_id:
                return False
            if branch and branch.suborganisation.organisation_id != org_id:
                return False
            return True

        # If suborg_admin => can manage suborg/branch memberships
        if suborg:
            is_suborg_admin = OrganisationMembership.objects.filter(
                user=acting_user, suborganisation=suborg, role="suborg_admin"
            ).exists()
            if is_suborg_admin:
                # ensure branch (if any) belongs to suborg
                if branch and branch.suborganisation_id != suborg.id:
                    return False
                return True

        return False


class MembershipDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        mship = get_object_or_404(OrganisationMembership, pk=pk)
        # If you want the same checks as above:
        # i.e. _can_manage_membership(acting_user, mship.org, mship.suborg, etc.)
        # For brevity, let's allow super_admin, org_admin of that org or suborg_admin of that suborg:

        # super_admin can delete any membership
        if user_is_super_admin(request.user):
            mship.delete()
            return Response(status=204)

        if (
            mship.organisation
            and OrganisationMembership.objects.filter(
                user=request.user, organisation=mship.organisation, role="org_admin"
            ).exists()
        ):
            mship.delete()
            return Response(status=204)

        if (
            mship.suborganisation
            and OrganisationMembership.objects.filter(
                user=request.user,
                suborganisation=mship.suborganisation,
                role="suborg_admin",
            ).exists()
        ):
            mship.delete()
            return Response(status=204)

        return Response({"detail": "Not allowed."}, status=403)


class UserLanguagePreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user_extended = UserExtended.objects.get(user=request.user)
            return Response({"language_preference": user_extended.language_preference})
        except UserExtended.DoesNotExist:
            # Create a UserExtended record for this user with a default language
            user_extended = UserExtended.objects.create(
                user=request.user, language_preference="en"  # Default language
            )
            return Response({"language_preference": user_extended.language_preference})

    def post(self, request):
        user_extended = get_object_or_404(UserExtended, user=request.user)
        language_code = request.data.get("language_preference")

        if not language_code:
            return Response(
                {"error": "Language preference is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate if the language code is supported by Django
        supported_languages = [lang_code for lang_code, lang_name in settings.LANGUAGES]
        if language_code not in supported_languages:
            return Response(
                {"error": f"Unsupported language code: {language_code}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_extended.language_preference = language_code
        user_extended.save()
        return Response(
            {
                "message": "Language preference updated successfully.",
                "language_preference": language_code,
            },
            status=status.HTTP_200_OK,
        )
