# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import datetime, timedelta, timezone as dt_timezone
from django.utils import timezone
import logging
import secrets
import string
import time
import json
import requests
import feedparser
import dateutil.parser
from zoneinfo import ZoneInfo
import pytz
import pandas as pd
import re
from pathlib import Path
from django.core.cache import cache

import copy

from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError, FieldError
from django.core.mail import send_mail
from django.core.paginator import Paginator
from django.core.signing import SignatureExpired, BadSignature, TimestampSigner
from django.db.models import Q, Max
from django.contrib.admin.models import LogEntry
from django.contrib.contenttypes.models import ContentType
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from app.models import (
    Organisation,
    OrganisationAPIAccess,
    OrganisationMembership,
    SubOrganisation,
    Branch,
    Slideshow,
    SlideshowPlaylist,
    SlideshowPlaylistItem,
    Wayfinding,
    DisplayWebsite,
    DisplayWebsiteGroup,
    ScheduledContent,
    RecurringScheduledContent,
    Document,
    UserExtended,
    SlideshowPlayerAPIKey,
    Category,
    Tag,
    SlideTemplate,
    BranchURLCollectionItem,
    CustomColor,
    CustomFont,
    RegisteredSlideTypes,
)
from app.serializers import (
    CustomTokenObtainPairSerializer,
    OrganisationSerializer,
    OrganisationAPIAccessSerializer,
    OrganisationMembershipSerializer,
    SubOrganisationSerializer,
    BranchSerializer,
    SlideshowSerializer,
    SlideshowPlaylistSerializer,
    SlideshowPlaylistItemSerializer,
    WayfindingSerializer,
    DisplayWebsiteSerializer,
    DisplayWebsiteGroupSerializer,
    ScheduledContentSerializer,
    RecurringScheduledContentSerializer,
    DocumentSerializer,
    UserSerializer,
    UpdateUserSerializer,
    ShowUsernameAndEmailSerializer,
    ShowAllUserInfoSerializer,
    ChangePasswordSerializer,
    SubOrganisationWithRoleSerializer,  # optional
    UserMembershipDetailSerializer,
    CategorySerializer,
    TagSerializer,
    SlideTemplateSerializer,
    BranchURLCollectionItemSerializer,  # optional
    CustomColorSerializer,
    CustomFontSerializer,
    RegisteredSlideTypesSerializer,
)
from django.conf import settings
from project.settings import FRONTDESK_API_KEY

logger = logging.getLogger(__name__)


###############################################################################
# Utility Functions
###############################################################################


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


###############################################################################
# SubOrganisation CRUD
###############################################################################


class SubOrganisationListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Lists suborgs in a given organisation if the user is org_admin or suborg_admin.
        Expects ?org_id=<ORG_ID>
        """
        org_id = request.query_params.get("org_id")
        if not org_id:
            return Response(
                {"error": "Please provide an 'org_id' query parameter."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # If user is org_admin or super_admin => see all suborgs of that org
        is_org_admin_or_super = (
            user_is_super_admin(request.user)
            or OrganisationMembership.objects.filter(
                user=request.user, organisation_id=org_id, role="org_admin"
            ).exists()
        )

        if is_org_admin_or_super:
            suborgs = SubOrganisation.objects.filter(organisation_id=org_id)
        else:
            # suborg_admin => only suborgs in which they have 'suborg_admin'
            suborgs = SubOrganisation.objects.filter(
                organisation_id=org_id,
                memberships__user=request.user,
                memberships__role="suborg_admin",
            ).distinct()

        serializer = SubOrganisationSerializer(suborgs, many=True)
        return Response(serializer.data, status=200)

    def post(self, request):
        """
        Creates a new suborg in the given org. Must be org_admin.
        """
        serializer = SubOrganisationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        org_obj = serializer.validated_data["organisation"]
        org_id = org_obj.id

        # Must be org_admin of that org or super_admin
        is_authorized = (
            user_is_super_admin(request.user)
            or OrganisationMembership.objects.filter(
                user=request.user, organisation_id=org_id, role="org_admin"
            ).exists()
        )
        if not is_authorized:
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
            # Disallow changing organisation
            if "organisation" in serializer.validated_data:
                return Response({"error": "Cannot change organisation."}, status=400)

            updated = serializer.save()
            return Response(SubOrganisationSerializer(updated).data, status=200)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        suborg = get_object_or_404(SubOrganisation, pk=pk)
        # Must be org_admin of that suborg's organisation or super_admin
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


###############################################################################
# Simple name lookup endpoints
###############################################################################


class OrganisationNameAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        org = get_object_or_404(Organisation, pk=pk)

        # Allow if user is super_admin or member of the organisation
        if not (user_is_super_admin(request.user) or OrganisationMembership.objects.filter(user=request.user, organisation=org).exists()):
            return Response({"detail": "Not allowed."}, status=403)

        return Response({"name": org.name}, status=200)


class SubOrganisationNameAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        suborg = get_object_or_404(SubOrganisation, pk=pk)

        # Allow super_admin, org_admin for parent org, or any membership tied to the suborganisation
        if user_is_super_admin(request.user):
            return Response({"name": suborg.name}, status=200)

        if OrganisationMembership.objects.filter(user=request.user, organisation=suborg.organisation, role="org_admin").exists():
            return Response({"name": suborg.name}, status=200)

        if OrganisationMembership.objects.filter(user=request.user, suborganisation=suborg).exists():
            return Response({"name": suborg.name}, status=200)

        return Response({"detail": "Not allowed."}, status=403)


class BranchNameAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        branch = get_object_or_404(Branch, pk=pk)

        # Use existing helper to determine access
        if not user_can_access_branch(request.user, branch):
            return Response({"detail": "Not allowed."}, status=403)

        return Response({"name": branch.name}, status=200)


###############################################################################
# Branch CRUD
###############################################################################


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
                # Ensure user has access to the initial branch to justify getting org branches
                if not user_can_access_branch(request.user, initial_branch):
                    return Response(
                        {"detail": "User cannot access the specified branch."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                # Fetch all branches from the same organisation
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
            # Existing logic for fetching by suborg_id
            try:
                suborg = get_object_or_404(SubOrganisation, id=suborg_id)
                # Check if user can manage the suborg (or adjust permission as needed)
                if not user_can_manage_suborg(request.user, suborg):
                    # Allow any user attached to the suborg to list branches
                    if not OrganisationMembership.objects.filter(
                        user=request.user, suborganisation=suborg
                    ).exists():
                        # Check if user is org_admin for the parent org
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


###############################################################################
# Slideshow CRUD (Branch-based)
###############################################################################


class SlideshowCRUDView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Retrieve 1 or more manage_content for a given branch_id.
        Use ?id=<slideshow_id> to fetch a single slideshow.
        Set ?includeSlideshowData=false to exclude the JSON data.
        """
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        slideshow_id = request.query_params.get("id")
        include_data = (
            request.query_params.get("includeSlideshowData", "true").lower() == "true"
        )

        context = {"include_slideshow_data": include_data}

        if slideshow_id:
            ss = get_object_or_404(Slideshow, pk=slideshow_id, branch=branch)
            ser = SlideshowSerializer(ss, context=context)
            return Response(ser.data)
        else:
            slideshows = Slideshow.objects.filter(branch=branch)
            ser = SlideshowSerializer(slideshows, many=True, context=context)
            return Response(ser.data)

    def post(self, request):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)
        print("Request data when creating new:", request.data)
        tags = request.data.get("tags")
        if tags:
            request.data["tag_ids"] = [
                tag["id"] if isinstance(tag, dict) else tag for tag in tags
            ]
        print("After 'cleaning':", request.data)
        serializer = SlideshowSerializer(data=request.data)
        if serializer.is_valid():
            slideshow = serializer.save(branch=branch, created_by=request.user)
            return Response(SlideshowSerializer(slideshow).data, status=201)
        return Response(serializer.errors, status=400)

    def patch(self, request, pk):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        slideshow = get_object_or_404(Slideshow, pk=pk, branch=branch)
        serializer = SlideshowSerializer(slideshow, data=request.data, partial=True)
        if serializer.is_valid():
            updated = serializer.save()
            return Response(SlideshowSerializer(updated).data)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        slideshow = get_object_or_404(Slideshow, pk=pk, branch=branch)
        slideshow.delete()
        return Response(status=204)


###############################################################################
# Wayfinding Endpoints
###############################################################################


class WayfindingCRUDView(APIView):
    permission_classes = []  # We handle auth manually

    def get(self, request, pk=None):
        """
        Retrieve 1 or more wayfinding objects for a given branch_id.
        Use pk in URL or ?id=<wayfinding_id> to fetch a single wayfinding object.
        Set ?includeWayfindingData=false to exclude the JSON data.

        Authentication: Supports both user authentication and X-API-KEY header.
        """
        # Check for ID in URL path first, then query parameter
        wayfinding_id = pk or request.query_params.get("id")
        include_data = (
            request.query_params.get("includeWayfindingData", "true").lower() == "true"
        )

        # --- Authentication Section ---
        api_key_value = request.headers.get("X-API-KEY")

        if api_key_value:
            # API key authentication
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key_value, is_active=True
            ).first()
            if not key_obj:
                return Response({"detail": "Invalid or inactive API key."}, status=403)

            # For API key access, get branch from the key or use branch_id param
            if key_obj.branch:
                branch = key_obj.branch
            else:
                # If API key is not branch-limited, require branch_id parameter
                branch_id = request.query_params.get("branch_id")
                if not branch_id:
                    return Response(
                        {
                            "detail": "branch_id is required when using non-branch-limited API key."
                        },
                        status=400,
                    )
                branch = get_object_or_404(Branch, id=branch_id)
        else:
            # User authentication
            if not request.user or not request.user.is_authenticated:
                return Response({"detail": "Authentication required."}, status=401)

            try:
                branch = get_branch_from_request(request)
            except ValueError as e:
                return Response({"detail": str(e)}, status=403)

        context = {"include_wayfinding_data": include_data}

        if wayfinding_id:
            wayfinding = get_object_or_404(Wayfinding, pk=wayfinding_id, branch=branch)
            ser = WayfindingSerializer(wayfinding, context=context)
            return Response(ser.data)
        else:
            wayfinding_objects = Wayfinding.objects.filter(branch=branch)
            ser = WayfindingSerializer(wayfinding_objects, many=True, context=context)
            return Response(ser.data)

    def post(self, request):
        # POST still requires user authentication
        if not request.user or not request.user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=401)

        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        serializer = WayfindingSerializer(data=request.data)
        if serializer.is_valid():
            wayfinding = serializer.save(branch=branch, created_by=request.user)
            return Response(WayfindingSerializer(wayfinding).data, status=201)
        return Response(serializer.errors, status=400)

    def patch(self, request, pk):
        # PATCH still requires user authentication
        if not request.user or not request.user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=401)

        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        wayfinding = get_object_or_404(Wayfinding, pk=pk, branch=branch)
        serializer = WayfindingSerializer(wayfinding, data=request.data, partial=True)
        if serializer.is_valid():
            updated = serializer.save()
            return Response(WayfindingSerializer(updated).data)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        # DELETE still requires user authentication
        if not request.user or not request.user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=401)

        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        wayfinding = get_object_or_404(Wayfinding, pk=pk, branch=branch)
        wayfinding.delete()
        return Response(status=204)


###############################################################################
# Slideshow Playlist Endpoints
###############################################################################


class SlideshowPlaylistAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        playlist_id = request.query_params.get("id")
        include_slides = (
            request.query_params.get("includeSlides", "false").lower() == "true"
        )
        context = {"include_slides": include_slides}

        if playlist_id:
            sp = get_object_or_404(SlideshowPlaylist, pk=playlist_id, branch=branch)
            ser = SlideshowPlaylistSerializer(sp, context=context)
            return Response(ser.data)
        else:
            playlists = SlideshowPlaylist.objects.filter(branch=branch)
            ser = SlideshowPlaylistSerializer(playlists, many=True, context=context)
            return Response(ser.data)

    def post(self, request):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        serializer = SlideshowPlaylistSerializer(data=request.data)
        if serializer.is_valid():
            sp = serializer.save(branch=branch, created_by=request.user)
            return Response(SlideshowPlaylistSerializer(sp).data, status=201)
        return Response(serializer.errors, status=400)

    def put(self, request, pk):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        sp = get_object_or_404(SlideshowPlaylist, pk=pk, branch=branch)
        serializer = SlideshowPlaylistSerializer(sp, data=request.data)
        if serializer.is_valid():
            updated = serializer.save()
            return Response(SlideshowPlaylistSerializer(updated).data)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        sp = get_object_or_404(SlideshowPlaylist, pk=pk, branch=branch)
        sp.delete()
        return Response(status=204)


class SlideshowPlaylistItemAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Retrieve items from a specific playlist by ?playlist_id=...
        """
        playlist_id = request.query_params.get("playlist_id")
        if not playlist_id:
            return Response({"detail": "playlist_id is required."}, status=400)

        items = SlideshowPlaylistItem.objects.filter(slideshow_playlist_id=playlist_id)
        if not items.exists():
            return Response([], status=200)

        # Check that user can access the underlying branch
        branch = items.first().slideshow_playlist.branch
        if not user_can_access_branch(request.user, branch):
            return Response(
                {"detail": "Not allowed to view this playlist."}, status=403
            )

        ser = SlideshowPlaylistItemSerializer(items, many=True)
        return Response(ser.data)

    def post(self, request):
        """
        Create a SlideshowPlaylistItem => must ensure slideshow + playlist belong to same branch
        and user can access that branch.
        """
        ser = SlideshowPlaylistItemSerializer(data=request.data)
        if ser.is_valid():
            sp = ser.validated_data["slideshow_playlist"]
            ss = ser.validated_data["slideshow"]
            if sp.branch != ss.branch:
                return Response(
                    {"detail": "Slideshow and playlist must be in the same branch."},
                    status=400,
                )
            if not user_can_access_branch(request.user, sp.branch):
                return Response(
                    {"detail": "Not allowed to modify this branch content."}, status=403
                )

            item = ser.save()
            return Response(SlideshowPlaylistItemSerializer(item).data, status=201)
        return Response(ser.errors, status=400)

    def put(self, request, pk):
        item = get_object_or_404(SlideshowPlaylistItem, pk=pk)
        # Must ensure user can access the item’s branch
        branch = item.slideshow_playlist.branch
        if not user_can_access_branch(request.user, branch):
            return Response({"detail": "Not allowed."}, status=403)

        ser = SlideshowPlaylistItemSerializer(item, data=request.data)
        if ser.is_valid():
            new_sp = ser.validated_data.get(
                "slideshow_playlist", item.slideshow_playlist
            )
            new_ss = ser.validated_data.get("slideshow", item.slideshow)
            if new_sp.branch != new_ss.branch:
                return Response(
                    {"detail": "Slideshow and playlist must be in the same branch."},
                    status=400,
                )
            if not user_can_access_branch(request.user, new_sp.branch):
                return Response({"detail": "Not allowed."}, status=403)

            updated = ser.save()
            return Response(SlideshowPlaylistItemSerializer(updated).data)
        return Response(ser.errors, status=400)

    def patch(self, request, pk):
        item = get_object_or_404(SlideshowPlaylistItem, pk=pk)
        branch = item.slideshow_playlist.branch
        if not user_can_access_branch(request.user, branch):
            return Response({"detail": "Not allowed."}, status=403)

        ser = SlideshowPlaylistItemSerializer(item, data=request.data, partial=True)
        if ser.is_valid():
            new_sp = ser.validated_data.get(
                "slideshow_playlist", item.slideshow_playlist
            )
            new_ss = ser.validated_data.get("slideshow", item.slideshow)
            if new_sp.branch != new_ss.branch:
                return Response(
                    {"detail": "Slideshow and playlist must be in the same branch."},
                    status=400,
                )
            if not user_can_access_branch(request.user, new_sp.branch):
                return Response({"detail": "Not allowed."}, status=403)

            updated = ser.save()
            return Response(SlideshowPlaylistItemSerializer(updated).data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        item = get_object_or_404(SlideshowPlaylistItem, pk=pk)
        branch = item.slideshow_playlist.branch
        if not user_can_access_branch(request.user, branch):
            return Response({"detail": "Not allowed."}, status=403)
        item.delete()
        return Response(status=204)


###############################################################################
# Display Website & DisplayWebsiteGroup
###############################################################################


###############################################################################
# Latest-edited endpoints
###############################################################################


class LatestEditedSlideshowsAPIView(APIView):
    """Return slideshows for a branch ordered by their latest slide.updated_at (descending).

    Query params:
      - branch_id (required)
      - page (optional, default=1)

    Returns paginated JSON with 20 items per page.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        try:
            page = int(request.query_params.get("page", 1))
        except ValueError:
            page = 1

        page_size = 20

        # Annotate slideshows with the most recent 'updated_at' from their slides
        # Use the Slideshow.updated_at field (set via auto_now) for last-edited.
        qs = Slideshow.objects.filter(branch=branch).order_by("-updated_at", "-id")

        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        # Build lightweight result set for dashboard (id, name, last_edited)
        results = []
        for ss in page_obj.object_list:
            # Prefer the durable model field `updated_at` (auto_now) as the last edited timestamp.
            last = getattr(ss, "updated_at", None) or getattr(ss, "last_edited", None)
            # If model field isn't available for some reason, try admin LogEntry as a fallback
            if not last:
                try:
                    ct = ContentType.objects.get_for_model(Slideshow)
                    le = (
                        LogEntry.objects.filter(content_type=ct, object_id=ss.id)
                        .order_by("-action_time")
                        .first()
                    )
                    if le:
                        last = le.action_time
                except Exception:
                    last = None
            results.append(
                {
                    "id": ss.id,
                    "name": ss.name,
                    "last_edited": last.isoformat() if last else None,
                }
            )

        data = {
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_obj.number,
            "items_per_page": paginator.per_page,
            "next": page_obj.next_page_number() if page_obj.has_next() else None,
            "previous": (
                page_obj.previous_page_number() if page_obj.has_previous() else None
            ),
            "results": results,
        }

        return Response(data)


class LatestEditedPlaylistsAPIView(APIView):
    """Return playlists for a branch ordered by the most recent update of slides
    referenced by items in the playlist (descending).

    Query params:
      - branch_id (required)
      - page (optional, default=1)

    Returns paginated JSON with 20 items per page.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        try:
            page = int(request.query_params.get("page", 1))
        except ValueError:
            page = 1

        page_size = 20

        # Annotate playlists with latest updated_at of slides referenced by their items
        # Use the SlideshowPlaylist.updated_at field (set via auto_now) for last-edited.
        qs = SlideshowPlaylist.objects.filter(branch=branch).order_by(
            "-updated_at", "-id"
        )

        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        results = []
        for pl in page_obj.object_list:
            # Prefer the durable model field `updated_at` (auto_now) as the last edited timestamp.
            last = getattr(pl, "updated_at", None) or getattr(pl, "last_edited", None)
            # Fallback to admin LogEntry if necessary
            if not last:
                try:
                    ct = ContentType.objects.get_for_model(SlideshowPlaylist)
                    le = (
                        LogEntry.objects.filter(content_type=ct, object_id=pl.id)
                        .order_by("-action_time")
                        .first()
                    )
                    if le:
                        last = le.action_time
                except Exception:
                    last = None
            results.append(
                {
                    "id": pl.id,
                    "name": pl.name,
                    "last_edited": last.isoformat() if last else None,
                }
            )

        data = {
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_obj.number,
            "items_per_page": paginator.per_page,
            "next": page_obj.next_page_number() if page_obj.has_next() else None,
            "previous": (
                page_obj.previous_page_number() if page_obj.has_previous() else None
            ),
            "results": results,
        }

        return Response(data)


class DisplayWebsiteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        if pk:
            dw = get_object_or_404(DisplayWebsite, pk=pk, branch=branch)
            ser = DisplayWebsiteSerializer(dw)
            return Response(ser.data)
        else:
            websites = DisplayWebsite.objects.filter(branch=branch)
            ser = DisplayWebsiteSerializer(websites, many=True)
            return Response(ser.data)

    def post(self, request):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        ser = DisplayWebsiteSerializer(data=request.data)
        if ser.is_valid():
            dw = ser.save(branch=branch)
            return Response(DisplayWebsiteSerializer(dw).data, status=201)
        return Response(ser.errors, status=400)

    def patch(self, request, pk):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        dw = get_object_or_404(DisplayWebsite, pk=pk, branch=branch)
        ser = DisplayWebsiteSerializer(dw, data=request.data, partial=True)
        if ser.is_valid():
            updated = ser.save()
            return Response(DisplayWebsiteSerializer(updated).data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        dw = get_object_or_404(DisplayWebsite, pk=pk, branch=branch)
        dw.delete()
        return Response(status=204)


class DisplayWebsiteGroupAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        if pk:
            dwg = get_object_or_404(DisplayWebsiteGroup, pk=pk, branch=branch)
            ser = DisplayWebsiteGroupSerializer(dwg)
            return Response(ser.data)
        else:
            groups = DisplayWebsiteGroup.objects.filter(branch=branch)
            ser = DisplayWebsiteGroupSerializer(groups, many=True)
            return Response(ser.data)

    def post(self, request):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        ser = DisplayWebsiteGroupSerializer(data=request.data)
        if ser.is_valid():
            dwg = ser.save(branch=branch)
            return Response(DisplayWebsiteGroupSerializer(dwg).data, status=201)
        return Response(ser.errors, status=400)

    def patch(self, request, pk):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        dwg = get_object_or_404(DisplayWebsiteGroup, pk=pk, branch=branch)
        ser = DisplayWebsiteGroupSerializer(dwg, data=request.data, partial=True)
        if ser.is_valid():
            updated = ser.save()
            return Response(DisplayWebsiteGroupSerializer(updated).data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        dwg = get_object_or_404(DisplayWebsiteGroup, pk=pk, branch=branch)
        dwg.delete()
        return Response(status=204)


###############################################################################
# Scheduled Content
###############################################################################


class ScheduledContentAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Expects ?id=<group_id> or ?ids=<comma separated group_ids>.
        Must ensure the user can access the branch for each group.
        """
        group_ids = request.query_params.get("ids")
        single_id = request.query_params.get("id")

        if not group_ids and not single_id:
            return Response(
                {"detail": "Either 'id' or 'ids' parameter is required."}, status=400
            )

        if group_ids:
            group_ids_list = [int(x) for x in group_ids.split(",") if x.strip()]
            # We'll just check the first group's branch for membership
            first_group = get_object_or_404(DisplayWebsiteGroup, pk=group_ids_list[0])
            if not user_can_access_branch(request.user, first_group.branch):
                return Response({"detail": "Not allowed."}, status=403)

            results = ScheduledContent.objects.filter(
                display_website_group__id__in=group_ids_list
            )
        else:
            # single group
            group_id = int(single_id)
            group = get_object_or_404(DisplayWebsiteGroup, pk=group_id)
            if not user_can_access_branch(request.user, group.branch):
                return Response({"detail": "Not allowed."}, status=403)

            results = ScheduledContent.objects.filter(display_website_group=group)

        ser = ScheduledContentSerializer(results, many=True)
        return Response(ser.data)

    def post(self, request):
        ser = ScheduledContentSerializer(data=request.data)
        if ser.is_valid():
            group = ser.validated_data["display_website_group"]
            if not user_can_access_branch(request.user, group.branch):
                return Response({"detail": "Not allowed."}, status=403)

            sc = ser.save()
            return Response(ScheduledContentSerializer(sc).data, status=201)
        return Response(ser.errors, status=400)

    def patch(self, request, pk):
        sc = get_object_or_404(ScheduledContent, pk=pk)
        group = sc.display_website_group
        if not user_can_access_branch(request.user, group.branch):
            return Response({"detail": "Not allowed."}, status=403)

        ser = ScheduledContentSerializer(sc, data=request.data, partial=True)
        if ser.is_valid():
            new_group = ser.validated_data.get("display_website_group", group)
            if not user_can_access_branch(request.user, new_group.branch):
                return Response({"detail": "Not allowed."}, status=403)

            updated = ser.save()
            return Response(ScheduledContentSerializer(updated).data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        sc = get_object_or_404(ScheduledContent, pk=pk)
        group = sc.display_website_group
        if not user_can_access_branch(request.user, group.branch):
            return Response({"detail": "Not allowed."}, status=403)
        sc.delete()
        return Response(status=204)


class RecurringScheduledContentAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Get recurring scheduled content for given group IDs.
        Returns the recurring event definitions - frontend will generate calendar instances.
        Expects ?ids=<comma separated group_ids> or ?id=<single_group_id>
        """
        group_ids = request.query_params.get("ids")
        single_id = request.query_params.get("id")

        if not group_ids and not single_id:
            return Response(
                {"detail": "Either 'id' or 'ids' parameter is required."}, status=400
            )

        if group_ids:
            group_ids_list = [int(x) for x in group_ids.split(",") if x.strip()]
            # Check access to the first group's branch
            first_group = get_object_or_404(DisplayWebsiteGroup, pk=group_ids_list[0])
            if not user_can_access_branch(request.user, first_group.branch):
                return Response({"detail": "Not allowed."}, status=403)

            recurring_content = RecurringScheduledContent.objects.filter(
                display_website_group__id__in=group_ids_list
            )
        else:
            # single group
            group_id = int(single_id)
            group = get_object_or_404(DisplayWebsiteGroup, pk=group_id)
            if not user_can_access_branch(request.user, group.branch):
                return Response({"detail": "Not allowed."}, status=403)

            recurring_content = RecurringScheduledContent.objects.filter(
                display_website_group=group
            )

        # Return the recurring content definitions
        # Frontend will generate calendar instances as needed
        ser = RecurringScheduledContentSerializer(recurring_content, many=True)
        return Response(ser.data)

    def post(self, request):
        """Create new recurring scheduled content"""
        ser = RecurringScheduledContentSerializer(data=request.data)
        if ser.is_valid():
            group = ser.validated_data["display_website_group"]
            if not user_can_access_branch(request.user, group.branch):
                return Response({"detail": "Not allowed."}, status=403)

            recurring_content = ser.save()
            return Response(
                RecurringScheduledContentSerializer(recurring_content).data, status=201
            )
        return Response(ser.errors, status=400)

    def patch(self, request, pk):
        """Update recurring scheduled content"""
        recurring_content = get_object_or_404(RecurringScheduledContent, pk=pk)
        group = recurring_content.display_website_group
        if not user_can_access_branch(request.user, group.branch):
            return Response({"detail": "Not allowed."}, status=403)

        ser = RecurringScheduledContentSerializer(
            recurring_content, data=request.data, partial=True
        )
        if ser.is_valid():
            new_group = ser.validated_data.get("display_website_group", group)
            if not user_can_access_branch(request.user, new_group.branch):
                return Response({"detail": "Not allowed."}, status=403)

            updated = ser.save()
            return Response(RecurringScheduledContentSerializer(updated).data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        """Delete recurring scheduled content"""
        recurring_content = get_object_or_404(RecurringScheduledContent, pk=pk)
        group = recurring_content.display_website_group
        if not user_can_access_branch(request.user, group.branch):
            return Response({"detail": "Not allowed."}, status=403)
        recurring_content.delete()
        return Response(status=204)


###############################################################################
# Active Content
###############################################################################


class BranchAPIKeyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)

        # Check that the user is either an org admin, suborg admin for this branch, or super_admin
        is_super_admin = user_is_super_admin(request.user)

        is_org_admin = OrganisationMembership.objects.filter(
            user=request.user,
            organisation=branch.suborganisation.organisation,
            role="org_admin",
        ).exists()

        is_suborg_admin = OrganisationMembership.objects.filter(
            user=request.user,
            suborganisation=branch.suborganisation,
            role="suborg_admin",
        ).exists()

        if not (is_super_admin or is_org_admin or is_suborg_admin):
            return Response(
                {"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN
            )

        # Access the API key directly via the branch's one-to-one relation
        try:
            api_key_obj = branch.api_key
        except SlideshowPlayerAPIKey.DoesNotExist:
            return Response(
                {"detail": "No API key found for this branch."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "branch_id": branch.id,
                "api_key": str(api_key_obj.key),
                "is_active": api_key_obj.is_active,
            },
            status=status.HTTP_200_OK,
        )


class GetActiveContentAPIView(APIView):
    permission_classes = []  # We handle both user & API-key auth ourselves

    def wrap_slideshow_as_playlist_item(self, slideshow_data, position=0):
        """
        Wrap a serialized slideshow (dict) as a playlist-style item.
        This ensures standalone slideshow content uses the same format as playlist items.
        """
        return {
            "id": slideshow_data.get("id"),
            "position": position,  # Adjust as needed
            "slideshow_playlist": 1,
            "slideshow": slideshow_data,
        }

    def serialize_content(self, content, content_type):
        """
        Serialize content using the appropriate serializer.
        """
        if content_type == "slideshow":
            return SlideshowSerializer(
                content, context={"include_slideshow_data": True}
            )
        elif content_type == "playlist":
            return SlideshowPlaylistSerializer(
                content, context={"include_slides": True}
            )
        return None

    def get_playlist_items(self, content, content_type):
        """
        Return a list of playlist entry items from the content.
        - For playlists, the serializer is assumed to return a dict with an "items" key.
        - For manage_content, we wrap the entire slideshow data into a single playlist item.
        """
        serializer = self.serialize_content(content, content_type)
        data = serializer.data
        if content_type == "playlist":
            return data.get("items", [])
        elif content_type == "slideshow":
            return [self.wrap_slideshow_as_playlist_item(data)]
        return []

    def get(self, request):
        # --- Authentication Section ---
        display_website_id = request.query_params.get("id")
        if not display_website_id:
            return Response({"detail": "Display website ID is required."}, status=400)

        dw = get_object_or_404(DisplayWebsite, id=display_website_id)

        # 1) Check for API key auth if provided.
        api_key_value = request.headers.get("X-API-KEY")
        if api_key_value:
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key_value, is_active=True
            ).first()
            if not key_obj:
                return Response({"detail": "Invalid or inactive API key."}, status=403)
            # If branch-limited, verify branch match.
            if key_obj.branch and key_obj.branch != dw.branch:
                return Response(
                    {"detail": "API key not valid for this branch."}, status=403
                )
        else:
            # 2) Otherwise, use user-based authentication.
            if not request.user or not request.user.is_authenticated:
                return Response({"detail": "Authentication required."}, status=401)
            if not user_can_access_branch(request.user, dw.branch):
                return Response({"detail": "Not allowed."}, status=403)

        # Retrieve the display website group.
        dwg = dw.display_website_group
        if not dwg:
            return Response({"detail": "No display_website_group found."}, status=404)

        now = datetime.now()
        current_weekday = now.weekday()
        current_time = now.time()
        current_date = now.date()

        # --- Query all scheduled content records active at this time ---
        scheduled_qs = ScheduledContent.objects.filter(
            display_website_group=dwg, start_time__lte=now, end_time__gte=now
        ).order_by("start_time")

        # --- Query recurring scheduled content active at this time ---
        recurring_qs = (
            RecurringScheduledContent.objects.filter(
                display_website_group=dwg,
                weekday=current_weekday,
                start_time__lte=current_time,
                end_time__gte=current_time,
                active_from__lte=current_date,
            )
            .filter(Q(active_until__isnull=True) | Q(active_until__gte=current_date))
            .order_by("start_time")
        )

        scheduled_items = []
        combine_with_default = False

        # Iterate over all scheduled content records.
        for sc in scheduled_qs:
            if sc.slideshow is not None:
                scheduled_items += self.get_playlist_items(sc.slideshow, "slideshow")
            elif sc.playlist is not None:
                scheduled_items += self.get_playlist_items(sc.playlist, "playlist")
            # If any scheduled content requires merging with default, mark the flag.
            if sc.combine_with_default:
                combine_with_default = True

        # Iterate over all recurring scheduled content records.
        for rsc in recurring_qs:
            if rsc.slideshow is not None:
                scheduled_items += self.get_playlist_items(rsc.slideshow, "slideshow")
            elif rsc.playlist is not None:
                scheduled_items += self.get_playlist_items(rsc.playlist, "playlist")
            # If any recurring content requires merging with default, mark the flag.
            if rsc.combine_with_default:
                combine_with_default = True

        def merge_items(list1, list2):
            """Merge two lists of playlist items."""
            return list1 + list2

        if scheduled_items:
            if combine_with_default:
                # Retrieve default items from both default slideshow and default playlist.
                default_items = []
                if (
                    hasattr(dwg, "default_slideshow")
                    and dwg.default_slideshow is not None
                ):
                    default_items += self.get_playlist_items(
                        dwg.default_slideshow, "slideshow"
                    )
                if (
                    hasattr(dwg, "default_playlist")
                    and dwg.default_playlist is not None
                ):
                    default_items += self.get_playlist_items(
                        dwg.default_playlist, "playlist"
                    )
                merged_items = merge_items(scheduled_items, default_items)
            else:
                merged_items = scheduled_items

            return Response({"items": merged_items}, status=200)
        else:
            # Fallback: if no scheduled content is active, use default content.
            default_items = []
            if hasattr(dwg, "default_slideshow") and dwg.default_slideshow is not None:
                default_items += self.get_playlist_items(
                    dwg.default_slideshow, "slideshow"
                )
            if hasattr(dwg, "default_playlist") and dwg.default_playlist is not None:
                default_items += self.get_playlist_items(
                    dwg.default_playlist, "playlist"
                )
            if not default_items:
                return Response({"detail": "No default content found."}, status=404)
            else:
                return Response({"items": default_items}, status=200)


class BranchActiveContentAPIView(APIView):
    """Return all currently active content for a branch (aggregated across groups), paginated.

    Query params:
      - branch_id (required)
      - page (optional, default=1)
      - page_size (optional, default=10)
    Authentication: Accepts X-API-KEY header (branch-bound) or normal user auth.
    """

    permission_classes = []  # we handle auth internally

    def get_playlist_items(self, content, content_type):
        # reuse logic from GetActiveContentAPIView
        if content_type == "slideshow":
            return [
                {
                    "id": content.id,
                    "position": 0,
                    "slideshow_playlist": 1,
                    "slideshow": SlideshowSerializer(
                        content, context={"include_slideshow_data": True}
                    ).data,
                }
            ]
        elif content_type == "playlist":
            return SlideshowPlaylistSerializer(
                content, context={"include_slides": True}
            ).data.get("items", [])
        return []

    def get(self, request):
        branch_id = request.query_params.get("branch_id")
        if not branch_id:
            return Response({"detail": "branch_id is required."}, status=400)

        branch = get_object_or_404(Branch, id=branch_id)

        # API key auth if provided
        api_key_value = request.headers.get("X-API-KEY")
        if api_key_value:
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key_value, is_active=True
            ).first()
            if not key_obj:
                return Response({"detail": "Invalid or inactive API key."}, status=403)
            if key_obj.branch and key_obj.branch != branch:
                return Response(
                    {"detail": "API key not valid for this branch."}, status=403
                )
        else:
            # user auth
            if not request.user or not request.user.is_authenticated:
                return Response({"detail": "Authentication required."}, status=401)
            if not user_can_access_branch(request.user, branch):
                return Response({"detail": "Not allowed."}, status=403)

        # Aggregate active items across all display website groups for this branch
        now = datetime.now()
        current_weekday = now.weekday()
        current_time = now.time()
        current_date = now.date()

        items = []
        grouped = []  # new: list of { display_website_group: name, items: [...] }

        groups = DisplayWebsiteGroup.objects.filter(branch=branch)
        for dwg in groups:
            # scheduled
            scheduled_qs = ScheduledContent.objects.filter(
                display_website_group=dwg, start_time__lte=now, end_time__gte=now
            ).order_by("start_time")
            # recurring
            recurring_qs = (
                RecurringScheduledContent.objects.filter(
                    display_website_group=dwg,
                    weekday=current_weekday,
                    start_time__lte=current_time,
                    end_time__gte=current_time,
                    active_from__lte=current_date,
                )
                .filter(
                    Q(active_until__isnull=True) | Q(active_until__gte=current_date)
                )
                .order_by("start_time")
            )

            scheduled_items = []
            combine_with_default = False

            for sc in scheduled_qs:
                if sc.slideshow is not None:
                    scheduled_items += self.get_playlist_items(
                        sc.slideshow, "slideshow"
                    )
                elif sc.playlist is not None:
                    scheduled_items += self.get_playlist_items(sc.playlist, "playlist")
                if sc.combine_with_default:
                    combine_with_default = True

            for rsc in recurring_qs:
                if rsc.slideshow is not None:
                    scheduled_items += self.get_playlist_items(
                        rsc.slideshow, "slideshow"
                    )
                elif rsc.playlist is not None:
                    scheduled_items += self.get_playlist_items(rsc.playlist, "playlist")
                if rsc.combine_with_default:
                    combine_with_default = True

            if scheduled_items:
                if combine_with_default:
                    default_items = []
                    if (
                        hasattr(dwg, "default_slideshow")
                        and dwg.default_slideshow is not None
                    ):
                        default_items += self.get_playlist_items(
                            dwg.default_slideshow, "slideshow"
                        )
                    if (
                        hasattr(dwg, "default_playlist")
                        and dwg.default_playlist is not None
                    ):
                        default_items += self.get_playlist_items(
                            dwg.default_playlist, "playlist"
                        )
                    merged = scheduled_items + default_items
                else:
                    merged = scheduled_items

                # Attach the display website group name to each item so callers
                # (e.g. dashboard) can show which group the item belongs to.
                for _it in merged:
                    try:
                        _it["display_website_group"] = dwg.name
                    except Exception:
                        # Be defensive: if item is not a dict, skip
                        pass

                # Add grouped entry for this display group
                grouped.append({"display_website_group": dwg.name, "items": merged})
                items += merged
            else:
                # fallback to default
                default_items = []
                if (
                    hasattr(dwg, "default_slideshow")
                    and dwg.default_slideshow is not None
                ):
                    default_items += self.get_playlist_items(
                        dwg.default_slideshow, "slideshow"
                    )
                if (
                    hasattr(dwg, "default_playlist")
                    and dwg.default_playlist is not None
                ):
                    default_items += self.get_playlist_items(
                        dwg.default_playlist, "playlist"
                    )

                for _it in default_items:
                    try:
                        _it["display_website_group"] = dwg.name
                    except Exception:
                        pass

                # Add grouped entry for this display group (defaults)
                grouped.append(
                    {"display_website_group": dwg.name, "items": default_items}
                )
                items += default_items

        # Pagination
        try:
            page = int(request.query_params.get("page", 1))
        except ValueError:
            page = 1
        try:
            page_size = int(request.query_params.get("page_size", 10))
        except ValueError:
            page_size = 10

        paginator = Paginator(items, page_size)
        page_obj = paginator.get_page(page)

        data = {
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_obj.number,
            "items_per_page": paginator.per_page,
            "next": page_obj.next_page_number() if page_obj.has_next() else None,
            "previous": (
                page_obj.previous_page_number() if page_obj.has_previous() else None
            ),
            "results": page_obj.object_list,
            # grouped by display_website_group: list of { display_website_group, items }
            "grouped": grouped,
        }

        return Response(data)


class BranchUpcomingContentAPIView(APIView):
    """Return the next upcoming scheduled and recurring content for a branch (limit 10).

    Query params:
      - branch_id (required)
    Authentication: Accepts X-API-KEY header (branch-bound) or normal user auth.
    """

    permission_classes = []

    def get_next_recurring_instance(self, rsc, now_dt):
        """Compute the next occurrence datetime for a RecurringScheduledContent after now_dt.
        Returns (start_datetime, end_datetime) or (None, None) if none within active range.
        """
        today = now_dt.date()
        start_date = max(today, rsc.active_from)
        # find the first weekday >= start_date that matches rsc.weekday
        days_ahead = (rsc.weekday - start_date.weekday() + 7) % 7
        candidate = start_date + timedelta(days=days_ahead)

        # If candidate is today and the start_time is earlier than now, skip to next week
        candidate_start_dt = datetime.combine(candidate, rsc.start_time)
        # make timezone-aware if needed
        if timezone.is_naive(candidate_start_dt):
            candidate_start_dt = timezone.make_aware(
                candidate_start_dt, timezone.get_current_timezone()
            )
        if candidate_start_dt <= now_dt:
            candidate = candidate + timedelta(days=7)
            candidate_start_dt = datetime.combine(candidate, rsc.start_time)
            if timezone.is_naive(candidate_start_dt):
                candidate_start_dt = timezone.make_aware(
                    candidate_start_dt, timezone.get_current_timezone()
                )

        # Check active_until
        if rsc.active_until and candidate > rsc.active_until:
            return (None, None)

        candidate_end_dt = datetime.combine(candidate, rsc.end_time)
        if timezone.is_naive(candidate_end_dt):
            candidate_end_dt = timezone.make_aware(
                candidate_end_dt, timezone.get_current_timezone()
            )
        return (candidate_start_dt, candidate_end_dt)

    def get(self, request):
        branch_id = request.query_params.get("branch_id")
        if not branch_id:
            return Response({"detail": "branch_id is required."}, status=400)

        branch = get_object_or_404(Branch, id=branch_id)

        # API key auth if provided
        api_key_value = request.headers.get("X-API-KEY")
        if api_key_value:
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key_value, is_active=True
            ).first()
            if not key_obj:
                return Response({"detail": "Invalid or inactive API key."}, status=403)
            if key_obj.branch and key_obj.branch != branch:
                return Response(
                    {"detail": "API key not valid for this branch."}, status=403
                )
        else:
            # user auth
            if not request.user or not request.user.is_authenticated:
                return Response({"detail": "Authentication required."}, status=401)
            if not user_can_access_branch(request.user, branch):
                return Response({"detail": "Not allowed."}, status=403)

        now_dt = timezone.now()

        # Upcoming scheduled content (start_time >= now)
        scheduled_qs = ScheduledContent.objects.filter(
            display_website_group__branch=branch, start_time__gte=now_dt
        ).order_by("start_time")

        upcoming = []

        for sc in scheduled_qs:
            entry = {
                "type": "scheduled",
                "id": sc.id,
                "group": (
                    sc.display_website_group.name if sc.display_website_group else None
                ),
                "start_time": sc.start_time.isoformat(),
                "end_time": sc.end_time.isoformat() if sc.end_time else None,
            }
            if sc.slideshow:
                entry["content"] = {
                    "type": "slideshow",
                    "id": sc.slideshow.id,
                    "name": sc.slideshow.name,
                }
            elif sc.playlist:
                entry["content"] = {
                    "type": "playlist",
                    "id": sc.playlist.id,
                    "name": sc.playlist.name,
                }
            upcoming.append(entry)

        # Recurring scheduled content: compute next instance for each recurring entry
        recurring_qs = RecurringScheduledContent.objects.filter(
            display_website_group__branch=branch,
            active_from__lte=now_dt.date(),
        ).filter(Q(active_until__isnull=True) | Q(active_until__gte=now_dt.date()))

        for rsc in recurring_qs:
            start_dt, end_dt = self.get_next_recurring_instance(rsc, now_dt)
            if start_dt is None:
                continue
            entry = {
                "type": "recurring",
                "id": rsc.id,
                "group": (
                    rsc.display_website_group.name
                    if rsc.display_website_group
                    else None
                ),
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat() if end_dt else None,
            }
            if rsc.slideshow:
                entry["content"] = {
                    "type": "slideshow",
                    "id": rsc.slideshow.id,
                    "name": rsc.slideshow.name,
                }
            elif rsc.playlist:
                entry["content"] = {
                    "type": "playlist",
                    "id": rsc.playlist.id,
                    "name": rsc.playlist.name,
                }
            upcoming.append(entry)

        # Sort all upcoming entries by start_time and limit to 10
        def parse_dt(v):
            try:
                dt = datetime.fromisoformat(v)
                # make aware if naive
                if timezone.is_naive(dt):
                    dt = timezone.make_aware(dt, timezone.get_current_timezone())
                return dt
            except Exception:
                return datetime.max

        upcoming_sorted = sorted(upcoming, key=lambda x: parse_dt(x.get("start_time")))[
            :10
        ]

        return Response({"results": upcoming_sorted}, status=200)


###############################################################################
# Document Upload & Viewing
###############################################################################


class DocumentListView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Returns a filtered and paginated list of media files
        try:
            # Use the passed branch ID to check permissions.
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        # Get the organisation from the branch.
        organisation = branch.suborganisation.organisation

        # Fetch documents across all branches in the same organisation.
        # TODO: Figure out exactly what documents users should be allowed to access. Across all in org?
        # Currently they are only allowed to select branches from their own suborg in the frontend
        # But the limitation isn't enforced here
        docs = Document.objects.filter(
            branch__suborganisation__organisation=organisation
        ).order_by("-uploaded_at")

        # (Optional) Log the branch that was passed for auditing.
        logger.info(f"Document images fetched using branch id: {branch.id}")

        # JSON body input
        data = request.data

        print(data)

        title = data.get("title")
        if title:
            docs = docs.filter(title__icontains=title)

        category_ids_input = data.get("categories")
        if (
            category_ids_input is not None and category_ids_input != ""
        ):  # Check for None or empty string
            processed_category_ids = []
            if isinstance(category_ids_input, list):
                for cat_id in category_ids_input:
                    if str(cat_id).strip():  # Ensure not empty or just whitespace
                        try:
                            processed_category_ids.append(int(cat_id))
                        except (ValueError, TypeError):
                            logger.warning(
                                f"Invalid category ID '{cat_id}' in list, skipping."
                            )
            elif isinstance(category_ids_input, (str, int)):  # Single category ID
                if str(
                    category_ids_input
                ).strip():  # Ensure not empty or just whitespace
                    try:
                        processed_category_ids.append(int(category_ids_input))
                    except (ValueError, TypeError):
                        logger.warning(
                            f"Invalid single category ID '{category_ids_input}', skipping."
                        )
            # else: Unhandled type for category_ids_input, could log if necessary

            if processed_category_ids:
                docs = docs.filter(category_id__in=processed_category_ids)

        branch_ids = data.get("branches")
        if branch_ids:
            docs = docs.filter(branch_id__in=branch_ids)

        file_types = data.get("file_types")
        if file_types:
            docs = docs.filter(file_type__in=file_types)

        tag_ids = data.get("tags")
        if tag_ids:
            docs = docs.filter(tags__id__in=tag_ids).distinct()

        # Pagination
        DEFAULT_PAGE_SIZE = 10
        MAX_PAGE_SIZE = 100

        # Validate and sanitize page_size param
        try:
            page_size = int(request.query_params.get("page_size", DEFAULT_PAGE_SIZE))
        except ValueError:
            page_size = DEFAULT_PAGE_SIZE

        if page_size < 1:
            page_size = DEFAULT_PAGE_SIZE  # Fallback for negative or zero page_size
        elif page_size > MAX_PAGE_SIZE:
            page_size = MAX_PAGE_SIZE

        # Paginate the results.
        paginator = Paginator(docs, page_size)
        page_number = request.query_params.get("page", 1)
        page_obj = paginator.get_page(page_number)
        serializer = DocumentSerializer(
            page_obj.object_list,
            many=True,
            context={"request": request, "branch": branch},
        )

        data = {
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_obj.number,
            "items_per_page": paginator.per_page,
            "next": page_obj.next_page_number() if page_obj.has_next() else None,
            "previous": (
                page_obj.previous_page_number() if page_obj.has_previous() else None
            ),
            "results": serializer.data,
        }
        return Response(data)


class DocumentAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Upload a new document to a branch.
        Expects 'title' and 'file' in request, plus branch_id in data or query.
        Category and tag_names are optional
        """
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        title = request.data.get("title")
        uploaded_file = request.FILES.get("file")
        category = request.data.get("category")
        tag_ids = request.data.getlist("tags[]") or []

        # Get organisation from the branch instead of user
        organisation = branch.suborganisation.organisation
        tags = Tag.objects.filter(id__in=tag_ids, organisation=organisation)

        if category:
            category = Category.objects.get(id=category)

        if not title or not uploaded_file:
            return Response({"error": "Title and file are required"}, status=400)

        doc = Document(
            title=title,
            file=uploaded_file,
            branch=branch,
            category=category if category else None,
        )

        try:
            doc.full_clean()
            doc.save()
            doc.tags.set(
                tags
            )  # Many to many fields can't be instantiated directly on a new object

            return Response(
                DocumentSerializer(doc, context={"request": request}).data, status=201
            )
        except ValidationError as e:
            # Handle ValidationError properly
            if hasattr(e, "message_dict") and e.message_dict:
                message = e.message_dict.get("error", ["Validation error"])[0]
            elif hasattr(e, "messages") and e.messages:
                message = e.messages[0]
            else:
                message = str(e)
            return Response({"message": message}, status=400)
        except Exception as e:
            message = str(e)
            return Response({"message": message}, status=400)

    def put(self, request, document_id):
        """
        Update an existing document.
        """
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)
        doc = get_object_or_404(Document, id=document_id)
        if branch != doc.branch:
            return Response(
                {"error": "You can only edit your own media files"}, status=401
            )

        title = request.data.get("title")
        tag_ids = request.data.getlist("tags[]") or []
        category = request.data.get("category", None)

        if category:
            category = Category.objects.get(id=category)

        if not title:
            return Response({"error": "Title is required"}, status=400)

        doc.title = title
        doc.category = category

        # Get organisation from the branch instead of user
        organisation = branch.suborganisation.organisation
        tags = Tag.objects.filter(id__in=tag_ids, organisation=organisation)
        doc.tags.set(tags)

        try:
            doc.full_clean()
            doc.save()
            return Response(DocumentSerializer(doc, context={"request": request}).data)
        except ValidationError as e:
            # Handle ValidationError properly
            if hasattr(e, "message_dict") and e.message_dict:
                message = e.message_dict.get("error", ["Validation error"])[0]
            elif hasattr(e, "messages") and e.messages:
                message = e.messages[0]
            else:
                message = str(e)
            return Response({"message": message}, status=400)
        except Exception as e:
            message = str(e)
            return Response({"message": message}, status=400)

    def delete(self, request, document_id):
        print("Request:", request)
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)
        doc = Document.objects.get(id=document_id)
        if not doc:
            return Response({"error": "Document not found"}, status=404)
        # Users can only delete their own media files
        if doc.branch == branch:
            doc.delete()
            return Response({"message": "Document deleted"}, status=204)
        else:
            return Response(
                {"error": "You can only delete your own media files"}, status=401
            )


class DocumentFileView(APIView):
    """
    Example of a 'tokened' file download if you want to allow direct access
    with a secure link.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, document_id):
        token = request.query_params.get("token")
        branch_id = request.query_params.get("branch_id")
        if not token or not branch_id:
            raise Http404("Missing token or branch_id.")

        signer = TimestampSigner()
        try:
            value = signer.unsign(token, max_age=3600)
        except (SignatureExpired, BadSignature):
            raise Http404("Invalid or expired token.")

        expected = f"{document_id}:{branch_id}"
        if value != expected:
            raise Http404("Token mismatch.")

        branch = get_object_or_404(Branch, id=branch_id)
        doc = get_object_or_404(
            Document,
            id=document_id,
            branch__suborganisation__organisation=branch.suborganisation.organisation,
        )

        try:
            response = FileResponse(
                doc.file.open("rb"), content_type="application/octet-stream"
            )
            response["Content-Disposition"] = f'inline; filename="{doc.file.name}"'
            return response
        except Exception:
            raise Http404("File not found")


class DocumentFileTokenView(APIView):
    """
    Unified endpoint:

    1) If a Bearer token is present in the Authorization header:
       - We ignore DisplayWebsite (dw) and the API key checks.
       - We simply call get_branch_from_request(...) to ensure the user
         (or whoever is making the request) can access that branch.
       - We fetch the Document from that branch's organisation and return its URL.

    2) Otherwise (no Bearer token):
       - We look for `X-API-KEY`. If present & valid => OK.
       - If no API key => we use user-based auth (request.user).
       - We require ?id=<display_website_id> in query params to identify the branch.
       - We then fetch the Document from that branch’s organisation and return its URL.

    """

    permission_classes = [AllowAny]  # Because we do our own checks below.

    def get(self, request, document_id):
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            # -------------------------------------------------------
            # (1) Bearer token path (skip DisplayWebsite logic)
            # -------------------------------------------------------
            bearer_token = auth_header[len("Bearer ") :].strip()
            if not bearer_token:
                return Response({"detail": "Empty Bearer token."}, status=400)

            try:
                branch = get_branch_from_request(request)
            except ValueError as e:
                return Response({"detail": str(e)}, status=403)

            # Fetch the document from that branch’s organisation
            doc = get_object_or_404(
                Document,
                id=document_id,
                branch__suborganisation__organisation=branch.suborganisation.organisation,
            )

            from django.conf import settings as _dj_settings
            from urllib.parse import urljoin as _urljoin

            media_url = getattr(_dj_settings, "MEDIA_URL", "")
            if media_url and media_url.startswith("http"):
                file_url = _urljoin(media_url, doc.file.name)
            else:
                file_url = request.build_absolute_uri(doc.file.url)
            return Response({"file_url": file_url}, status=200)

        else:
            # ----------------------------------------------------------
            # (2) No Bearer => check X-API-KEY or user-based auth + dw
            # ----------------------------------------------------------
            display_website_id = request.query_params.get("id")
            if not display_website_id:
                return Response(
                    {"detail": "Display website ID (param 'id') is required."},
                    status=400,
                )

            dw = get_object_or_404(DisplayWebsite, id=display_website_id)

            # 2a) Check API key
            api_key_value = request.headers.get("X-API-KEY")
            if api_key_value:
                key_obj = SlideshowPlayerAPIKey.objects.filter(
                    key=api_key_value, is_active=True
                ).first()
                if not key_obj:
                    return Response(
                        {"detail": "Invalid or inactive API key."}, status=403
                    )

                # If the key is branch-limited, ensure it matches dw.branch
                if key_obj.branch and key_obj.branch != dw.branch:
                    return Response(
                        {"detail": "API key not valid for this branch."}, status=403
                    )
            else:
                # 2b) Fallback to user-based auth
                if not request.user or not request.user.is_authenticated:
                    return Response({"detail": "Authentication required."}, status=401)

                if not user_can_access_branch(request.user, dw.branch):
                    return Response({"detail": "Not allowed."}, status=403)

            # Now fetch the Document in that organisation
            doc = get_object_or_404(
                Document,
                id=document_id,
                branch__suborganisation__organisation=dw.branch.suborganisation.organisation,
            )

            from django.conf import settings as _dj_settings
            from urllib.parse import urljoin as _urljoin

            media_url = getattr(_dj_settings, "MEDIA_URL", "")
            if media_url and media_url.startswith("http"):
                file_url = _urljoin(media_url, doc.file.name)
            else:
                file_url = request.build_absolute_uri(doc.file.url)
            return Response({"file_url": file_url}, status=200)


###############################################################################
# Token Validation
###############################################################################


class ValidateTokenView(APIView):
    """
    Validates the provided JWT token.
    Relies on IsAuthenticated permission class to handle validation.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # If the request reaches here, the token is valid because
        # IsAuthenticated permission passed.
        return Response({"detail": "Token is valid"}, status=status.HTTP_200_OK)


###############################################################################
# Organisation Management
###############################################################################


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


class RegisteredSlideTypesAPIView(APIView):
    """
    API view for fetching registered slide types for an organisation.
    - GET: Returns a list of registered slide types for the specified organisation

    Query params (for user authentication):
      - org_id (required): The organisation ID to fetch slide types for

    Query params (for API key authentication):
      - branch_id (optional): Required when using non-branch-limited API key

    Authentication: Supports both user authentication and X-API-KEY header.
    For API key authentication, organisation is derived from the branch.
    """

    permission_classes = []  # We handle both user & API-key auth ourselves

    def get(self, request):
        """
        Returns a list of registered slide types for the specified organisation.
        Supports both user authentication and API key authentication.
        """
        # --- Authentication Section ---
        api_key_value = request.headers.get("X-API-KEY")

        if api_key_value:
            # API key authentication
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key_value, is_active=True
            ).first()
            if not key_obj:
                return Response({"detail": "Invalid or inactive API key."}, status=403)

            # For API key access, get branch from the key or use branch_id param
            if key_obj.branch:
                branch = key_obj.branch
            else:
                # If API key is not branch-limited, require branch_id parameter
                branch_id = request.query_params.get("branch_id")
                if not branch_id:
                    return Response(
                        {
                            "detail": "branch_id is required when using non-branch-limited API key."
                        },
                        status=400,
                    )
                branch = get_object_or_404(Branch, id=branch_id)

            # Get organisation from the branch
            organisation = branch.suborganisation.organisation
        else:
            # User authentication
            if not request.user or not request.user.is_authenticated:
                return Response({"detail": "Authentication required."}, status=401)

            # For user authentication, org_id parameter is required
            org_id = request.query_params.get("org_id")
            if not org_id:
                return Response(
                    {"error": "org_id parameter is required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                organisation = Organisation.objects.get(id=org_id)
            except Organisation.DoesNotExist:
                return Response(
                    {"error": "Organisation not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            # Check if user belongs to this organisation or is super_admin
            if not user_is_super_admin(request.user):
                if not user_belongs_to_organisation(request.user, organisation):
                    return Response(
                        {
                            "error": "You do not have permission to access slide types for this organisation"
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

        # Fetch registered slide types for the organisation
        slide_types = RegisteredSlideTypes.objects.filter(
            organisation=organisation
        ).order_by("slide_type_id")

        serializer = RegisteredSlideTypesSerializer(slide_types, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


###############################################################################
# User Creation / Update / Membership
###############################################################################


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


class ChangePasswordAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = ChangePasswordSerializer(data=request.data, context={"request": request})
        if ser.is_valid():
            ser.save()
            update_session_auth_hash(request, request.user)
            return Response({"message": "Password updated successfully"}, status=200)
        return Response(ser.errors, status=400)


###############################################################################
# Membership Endpoints
###############################################################################


class MembershipAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_id = request.query_params.get("user")
        if user_id:
            memberships = OrganisationMembership.objects.filter(user_id=user_id)
            ser = UserMembershipDetailSerializer(memberships, many=True)
            return Response(ser.data, status=200)
        else:
            all_mships = OrganisationMembership.objects.all()
            ser = UserMembershipDetailSerializer(all_mships, many=True)
            return Response(ser.data, status=200)

    def post(self, request):
        ser = OrganisationMembershipSerializer(data=request.data)
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
        ser = OrganisationMembershipSerializer(mship, data=request.data, partial=True)
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


###############################################################################
# Organisation Users List
###############################################################################


class OrganisationUsersListAPIView(ListAPIView):
    """
    Lists all users in a given org.
    GET /api/organisations/<org_id>/users/
    """

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        org_id = self.kwargs["org_id"]
        # Ensure request.user is at least suborg_admin, org_admin in that org, or super_admin
        # For simplicity, let's say org_admin or super_admin can see all
        # or suborg_admin can see all users in the same org if we want that logic
        is_authorized = (
            user_is_super_admin(self.request.user)
            or OrganisationMembership.objects.filter(
                user=self.request.user, organisation_id=org_id, role="org_admin"
            ).exists()
        )
        if not is_authorized:
            # If you want suborg_admin to see the same, do a bigger check
            # For now, we only let org_admin see. So if not org_admin => empty
            return User.objects.none()

        return User.objects.filter(
            organisation_memberships__organisation_id=org_id
        ).distinct()


###############################################################################
# User Detail & Deletion
###############################################################################


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


###############################################################################
# Show suborgs for user (with role)
###############################################################################


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


class CategoryAPIView(APIView):
    """
    Unified API view for Categories that handles:
    - GET (list and retrieve)
    - POST (create)
    - PUT/PATCH (update)
    - DELETE (delete)

    Permissions:
    - GET: Any authenticated user who belongs to the organisation
    - POST/PUT/PATCH/DELETE: Only org_admin or super_admin users
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        """
        If pk is provided, return a single category.
        Otherwise, return all categories for the specified organisation.
        Requires ?organisation_id=<ORG_ID> parameter.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has permission to access this organization
        if not (
            user_is_super_admin(request.user)
            or user_belongs_to_organisation(request.user, organisation)
        ):
            return Response(
                {"detail": "You don't have permission to access this organization."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if pk:
            category = get_object_or_404(Category, pk=pk, organisation=organisation)
            serializer = CategorySerializer(category)
        else:
            # List all categories from the specified organisation
            categories = Category.objects.filter(organisation=organisation).order_by(
                "name"
            )
            serializer = CategorySerializer(categories, many=True)

        return Response(serializer.data, status=200)

    def post(self, request):
        """
        Create a new category. Only org_admin or super_admin users can do this.
        Requires ?organisation_id=<ORG_ID> parameter.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has admin permission for this organization
        if not (
            user_is_super_admin(request.user)
            or user_is_admin_in_org(request.user, organisation)
        ):
            return Response(
                {"detail": "Only organisation admins can create categories."},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = request.data.copy()
        serializer = CategorySerializer(data=data)
        if serializer.is_valid():
            # Assign the category to the specified organization
            new_category = serializer.save(organisation=organisation)
            return Response(CategorySerializer(new_category).data, status=201)
        return Response(serializer.errors, status=400)

    def put(self, request, pk):
        """
        Fully update a category. Only org_admin or super_admin users can do this.
        Requires ?organisation_id=<ORG_ID> parameter.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has admin permission for this organization
        if not (
            user_is_super_admin(request.user)
            or user_is_admin_in_org(request.user, organisation)
        ):
            return Response(
                {"detail": "Only organisation admins can update categories."},
                status=status.HTTP_403_FORBIDDEN,
            )

        category = get_object_or_404(Category, pk=pk, organisation=organisation)
        data = request.data.copy()
        # Prevent changing the organisation
        if "organisation" in data and data["organisation"] != category.organisation.id:
            return Response(
                {"detail": "Cannot change category's organisation."}, status=400
            )

        serializer = CategorySerializer(category, data=data)
        if serializer.is_valid():
            updated_category = serializer.save()
            return Response(CategorySerializer(updated_category).data, status=200)
        return Response(serializer.errors, status=400)

    def patch(self, request, pk):
        """
        Partially update a category. Only org_admin or super_admin users can do this.
        Requires ?organisation_id=<ORG_ID> parameter.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has admin permission for this organization
        if not (
            user_is_super_admin(request.user)
            or user_is_admin_in_org(request.user, organisation)
        ):
            return Response(
                {"detail": "Only organisation admins can update categories."},
                status=status.HTTP_403_FORBIDDEN,
            )

        category = get_object_or_404(Category, pk=pk, organisation=organisation)
        data = request.data.copy()
        # Prevent changing the organisation
        if "organisation" in data and data["organisation"] != category.organisation.id:
            return Response(
                {"detail": "Cannot change category's organisation."}, status=400
            )

        serializer = CategorySerializer(category, data=data, partial=True)
        if serializer.is_valid():
            updated_category = serializer.save()
            return Response(CategorySerializer(updated_category).data, status=200)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        """
        Delete a category. Only org_admin or super_admin users can do this.
        Requires ?organisation_id=<ORG_ID> parameter.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has admin permission for this organization
        if not (
            user_is_super_admin(request.user)
            or user_is_admin_in_org(request.user, organisation)
        ):
            return Response(
                {"detail": "Only organisation admins can delete categories."},
                status=status.HTTP_403_FORBIDDEN,
            )

        category = get_object_or_404(Category, pk=pk, organisation=organisation)
        try:
            category.delete()
            return Response(status=204)
        except Exception as e:
            return Response({"detail": f"Cannot delete category: {str(e)}"}, status=400)


class TagListCreateAPIView(APIView):
    """
    Lists all Tags or creates a new Tag.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Get all tags for the specified organisation.
        Requires ?organisation_id=<ORG_ID> parameter.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has permission to access this organization
        if not (
            user_is_super_admin(request.user)
            or user_belongs_to_organisation(request.user, organisation)
        ):
            return Response(
                {"detail": "You don't have permission to access this organization."},
                status=status.HTTP_403_FORBIDDEN,
            )

        tags = Tag.objects.filter(organisation=organisation).order_by("name")
        serializer = TagSerializer(tags, many=True)
        return Response(serializer.data, status=200)

    def post(self, request):
        """
        Create a new tag. Only org_admin or super_admin users can do this.
        Requires ?organisation_id=<ORG_ID> parameter.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has admin permission for this organization
        if not (
            user_is_super_admin(request.user)
            or user_is_admin_in_org(request.user, organisation)
        ):
            return Response(
                {"detail": "Only admins can create tags."},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = request.data.copy()
        serializer = TagSerializer(data=data)
        if serializer.is_valid():
            # Assign the tag to the specified organization
            new_tag = serializer.save(organisation=organisation)
            return Response(TagSerializer(new_tag).data, status=201)
        return Response(serializer.errors, status=400)


class TagDetailAPIView(APIView):
    """
    Retrieve, update, or delete a single Tag.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """
        Get a single tag by ID.
        Requires ?organisation_id=<ORG_ID> parameter.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has permission to access this organization
        if not (
            user_is_super_admin(request.user)
            or user_belongs_to_organisation(request.user, organisation)
        ):
            return Response(
                {"detail": "You don't have permission to access this organization."},
                status=status.HTTP_403_FORBIDDEN,
            )

        tag = get_object_or_404(Tag, pk=pk, organisation=organisation)
        ser = TagSerializer(tag)
        return Response(ser.data, status=200)

    def patch(self, request, pk):
        """
        Update a tag. Only org_admin or super_admin users can do this.
        Requires ?organisation_id=<ORG_ID> parameter.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has admin permission for this organization
        if not (
            user_is_super_admin(request.user)
            or user_is_admin_in_org(request.user, organisation)
        ):
            return Response(
                {"detail": "Only admins can edit tags in their own organisation"},
                status=status.HTTP_403_FORBIDDEN,
            )

        tag = get_object_or_404(Tag, pk=pk, organisation=organisation)
        serializer = TagSerializer(tag, data=request.data, partial=True)
        if serializer.is_valid():
            updated_tag = serializer.save()
            return Response(TagSerializer(updated_tag).data, status=200)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        """
        Delete a tag. Only org_admin or super_admin users can do this.
        Requires ?organisation_id=<ORG_ID> parameter.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has admin permission for this organization
        if not (
            user_is_super_admin(request.user)
            or user_is_admin_in_org(request.user, organisation)
        ):
            return Response(
                {"detail": "Only admins can edit tags in their own organisation"},
                status=status.HTTP_403_FORBIDDEN,
            )

        tag = get_object_or_404(Tag, pk=pk, organisation=organisation)
        try:
            tag.delete()
        except Exception as e:
            return Response(
                {"message": "Cannot delete tag because it is in use."}, status=400
            )
        return Response(status=204)


class TagListAPIView(APIView):
    """
    Retrieve, update, or delete a single Tag.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Case-insensitive partial match on tag name
        search_query = request.query_params.get("search_query", "")
        tags = Tag.objects.filter(name__icontains=search_query)[
            :10
        ]  # Limit to top 10 suggestions
        serializer = TagSerializer(tags, many=True)
        return Response(serializer.data, status=200)


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


class SlideTemplateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        """
        - If pk is provided, return that template detail (check membership).
        - Otherwise, expect ?organisation_id=... to list all templates of that org (global templates only).
        """
        if pk:
            template = get_object_or_404(SlideTemplate, pk=pk)
            if not user_belongs_to_organisation(request.user, template.organisation):
                return Response(
                    {"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN
                )
            serializer = SlideTemplateSerializer(template)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # List - only global templates (no suborganisation)
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id query param is required."}, status=400
            )

        org = get_object_or_404(Organisation, pk=org_id)
        if not user_belongs_to_organisation(request.user, org):
            return Response({"detail": "Not allowed."}, status=403)

        templates = SlideTemplate.objects.filter(
            organisation=org, suborganisation__isnull=True
        ).order_by("slideData__id")
        serializer = SlideTemplateSerializer(templates, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        """
        Creates a new SlideTemplate.
        Expects ?organisation_id=...
        The rest of the JSON (name, slideData, category_id, tag_ids) is in the request body.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id query param is required."}, status=400
            )

        org = get_object_or_404(Organisation, pk=org_id)
        if not user_is_admin_in_org(request.user, org):
            return Response({"detail": "Not allowed."}, status=403)

        # Clone the request data so we can inject the 'organisation' field
        data = request.data.copy()
        # The serializer expects 'organisation_id' or 'organisation' to be set
        data["organisation_id"] = org.id

        serializer = SlideTemplateSerializer(data=data)
        if serializer.is_valid():
            template = serializer.save()
            return Response(
                SlideTemplateSerializer(template).data, status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        """
        Partially update an existing SlideTemplate.
        Must ensure user is part of that template’s organisation.
        """
        template = get_object_or_404(SlideTemplate, pk=pk)
        if not user_is_admin_in_org(request.user, template.organisation):
            return Response({"detail": "Not allowed."}, status=403)

        # We typically disallow changing organisation on PATCH
        data = request.data.copy()
        data.pop("organisation_id", None)  # ignore if present

        serializer = SlideTemplateSerializer(template, data=data, partial=True)
        if serializer.is_valid():
            updated = serializer.save()
            return Response(SlideTemplateSerializer(updated).data, status=200)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        """
        Deletes a SlideTemplate by its primary key (pk).
        """
        template = get_object_or_404(SlideTemplate, pk=pk)

        # Ensure the user is an admin in the template's organisation
        if not user_is_admin_in_org(request.user, template.organisation):
            return Response(
                {"detail": "Not authorized to delete this template."},
                status=status.HTTP_403_FORBIDDEN,
            )

        template.delete()
        return Response(
            {"detail": "Template deleted successfully."},
            status=status.HTTP_204_NO_CONTENT,
        )


###############################################################################
# SubOrganisation Template Management
###############################################################################


class SuborgTemplateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        """
        GET /api/suborg-templates/?suborg_id=<id> - List all templates available for a suborg
          (includes global templates and suborg-specific templates)
        GET /api/suborg-templates/<pk>/ - Get details of a specific template
        """
        if pk:
            template = get_object_or_404(SlideTemplate, pk=pk)
            # Check if user can access this template
            if template.suborganisation:
                if not user_can_manage_suborg(request.user, template.suborganisation):
                    return Response(
                        {"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN
                    )
            else:
                if not user_belongs_to_organisation(
                    request.user, template.organisation
                ):
                    return Response(
                        {"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN
                    )
            serializer = SlideTemplateSerializer(template)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # List templates for a suborg
        suborg_id = request.query_params.get("suborg_id")
        if not suborg_id:
            return Response(
                {"detail": "suborg_id query param is required."}, status=400
            )

        suborg = get_object_or_404(SubOrganisation, pk=suborg_id)

        # User must be able to access this suborg
        if (
            not user_can_access_branch(request.user, suborg.branches.first())
            if suborg.branches.exists()
            else user_can_manage_suborg(request.user, suborg)
        ):
            return Response({"detail": "Not allowed."}, status=403)

        # Get global templates (no suborganisation) and suborg-specific templates
        global_templates = SlideTemplate.objects.filter(
            organisation=suborg.organisation, suborganisation__isnull=True
        )
        suborg_templates = SlideTemplate.objects.filter(suborganisation=suborg)

        templates = (global_templates | suborg_templates).distinct().order_by("name")
        serializer = SlideTemplateSerializer(templates, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        """
        Create a new suborg template based on a global template.
        Required: suborg_id, parent_template_id
        Optional: name (defaults to parent template name)
        """
        suborg_id = request.data.get("suborg_id")
        parent_template_id = request.data.get("parent_template_id")

        if not suborg_id:
            return Response(
                {"detail": "suborg_id is required."}, status=status.HTTP_400_BAD_REQUEST
            )
        if not parent_template_id:
            return Response(
                {"detail": "parent_template_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        suborg = get_object_or_404(SubOrganisation, pk=suborg_id)
        parent_template = get_object_or_404(SlideTemplate, pk=parent_template_id)

        # Check permissions - user must be suborg_admin or org_admin
        if not user_can_manage_suborg(request.user, suborg):
            return Response(
                {
                    "detail": "Not authorized to create templates for this suborganisation."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Verify parent template is a global template from the same organisation
        if parent_template.suborganisation is not None:
            return Response(
                {"detail": "Parent template must be a global template."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if parent_template.organisation != suborg.organisation:
            return Response(
                {"detail": "Parent template must belong to the same organisation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create the new suborg template
        # Note: slideData is copied as-is, including any preventSettingsChanges flags
        # from the parent template. These will be enforced in the frontend so that
        # suborg admins cannot modify settings that were locked by the global template.
        new_template_name = request.data.get("name", f"{parent_template.name} (Copy)")

        data = {
            "name": new_template_name,
            "slideData": parent_template.slideData,
            "organisation_id": suborg.organisation.id,
            "suborganisation_id": suborg.id,
            "parent_template_id": parent_template.id,
            "aspect_ratio": parent_template.aspect_ratio,
        }

        if parent_template.category:
            data["category_id"] = parent_template.category.id

        serializer = SlideTemplateSerializer(data=data)
        if serializer.is_valid():
            template = serializer.save()
            # Copy tags from parent
            template.tags.set(parent_template.tags.all())
            return Response(
                SlideTemplateSerializer(template).data, status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        """
        Update a suborg template.
        Only the suborg_admin, org_admin, or super_admin can update.
        """
        template = get_object_or_404(SlideTemplate, pk=pk)

        # Must be a suborg template
        if not template.suborganisation:
            return Response(
                {"detail": "This endpoint is only for suborg templates."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not user_can_manage_suborg(request.user, template.suborganisation):
            return Response(
                {"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN
            )

        # Don't allow changing organisation, suborganisation, or parent_template
        data = request.data.copy()
        data.pop("organisation_id", None)
        data.pop("suborganisation_id", None)
        data.pop("parent_template_id", None)

        serializer = SlideTemplateSerializer(template, data=data, partial=True)
        if serializer.is_valid():
            updated = serializer.save()
            return Response(SlideTemplateSerializer(updated).data, status=200)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        """
        Delete a suborg template.
        Only suborg_admin, org_admin, or super_admin can delete.
        """
        template = get_object_or_404(SlideTemplate, pk=pk)

        # Must be a suborg template
        if not template.suborganisation:
            return Response(
                {"detail": "This endpoint is only for suborg templates."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not user_can_manage_suborg(request.user, template.suborganisation):
            return Response(
                {"detail": "Not authorized to delete this template."},
                status=status.HTTP_403_FORBIDDEN,
            )

        template.delete()
        return Response(
            {"detail": "Template deleted successfully."},
            status=status.HTTP_204_NO_CONTENT,
        )


class FrontdeskAPIKey(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Return the API key with the property name expected by the frontend
        return Response({"apiKey": settings.FRONTDESK_API_KEY}, status=200)


class BranchURLCollectionItemAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        """
        GET without pk: Returns list of URL collection items for the authenticated branch.
        GET with pk: Returns a specific URL collection item.
        """
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)

        if pk:
            item = get_object_or_404(BranchURLCollectionItem, pk=pk, branch=branch)
            serializer = BranchURLCollectionItemSerializer(item)
        else:
            items = BranchURLCollectionItem.objects.filter(branch=branch)
            serializer = BranchURLCollectionItemSerializer(items, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        """
        Create a new BranchURLCollectionItem for the authenticated branch.
        """
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)

        # Clone the request data so we can set the branch explicitly
        data = request.data.copy()
        serializer = BranchURLCollectionItemSerializer(data=data)
        if serializer.is_valid():
            # Force the branch to the one determined from the request (ignoring any branch value passed in)
            item = serializer.save(branch=branch)
            return Response(
                BranchURLCollectionItemSerializer(item).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        """
        Partially update an existing BranchURLCollectionItem.
        """
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)

        item = get_object_or_404(BranchURLCollectionItem, pk=pk, branch=branch)
        serializer = BranchURLCollectionItemSerializer(
            item, data=request.data, partial=True
        )
        if serializer.is_valid():
            updated = serializer.save()
            return Response(
                BranchURLCollectionItemSerializer(updated).data,
                status=status.HTTP_200_OK,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        """
        Delete an existing BranchURLCollectionItem.
        """
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)

        item = get_object_or_404(BranchURLCollectionItem, pk=pk, branch=branch)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


###############################################################################
# Custom Colors
###############################################################################


class CustomColorAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Retrieves custom colors for the specified organization.
        Requires ?organisation_id=<ORG_ID> parameter.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has permission to access this organization
        if not (
            user_is_super_admin(request.user)
            or user_belongs_to_organisation(request.user, organisation)
        ):
            return Response(
                {"detail": "You don't have permission to access this organization."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Filter colors by the organisation
        colors = CustomColor.objects.filter(organisation=organisation)
        serializer = CustomColorSerializer(colors, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        """
        Create a new custom color.
        Requires ?organisation_id=<ORG_ID> parameter.
        Only organization admins or super admins can create colors.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has admin permission for this organization
        if not (
            user_is_super_admin(request.user)
            or user_is_admin_in_org(request.user, organisation)
        ):
            return Response(
                {"detail": "You must be an organization admin to add colors."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Create a new color
        data = request.data.copy()
        serializer = CustomColorSerializer(
            data=data, context={"organisation": organisation}
        )

        if serializer.is_valid():
            # Assign the color to the specified organization
            serializer.save(organisation=organisation)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        """
        Partially update a custom color.
        Requires ?organisation_id=<ORG_ID> parameter.
        Only organization admins or super admins can update colors.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has admin permission for this organization
        if not (
            user_is_super_admin(request.user)
            or user_is_admin_in_org(request.user, organisation)
        ):
            return Response(
                {"detail": "You must be an organization admin to modify colors."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            # Get the custom color
            custom_color = CustomColor.objects.get(id=pk, organisation=organisation)
        except CustomColor.DoesNotExist:
            return Response(
                {"detail": "Color not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Update the color
        data = request.data.copy()
        serializer = CustomColorSerializer(
            custom_color,
            data=data,
            context={"organisation": organisation},
            partial=True,
        )

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        """
        Delete a custom color.
        Requires ?organisation_id=<ORG_ID> parameter.
        Only organization admins or super admins can delete colors.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has admin permission for this organization
        if not (
            user_is_super_admin(request.user)
            or user_is_admin_in_org(request.user, organisation)
        ):
            return Response(
                {"detail": "You must be an organization admin to delete colors."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            # Get the custom color
            custom_color = CustomColor.objects.get(id=pk, organisation=organisation)
        except CustomColor.DoesNotExist:
            return Response(
                {"detail": "Color not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Delete the color
        custom_color.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CustomFontAPIView(APIView):
    # AllowAny because we perform our own auth check supporting X-API-KEY or user token
    permission_classes = [AllowAny]

    def get(self, request, pk=None):
        """
        Retrieves custom fonts for the specified organization.
        Requires ?organisation_id=<ORG_ID> parameter.
        Optional: Provide pk to get a specific font.
        """
        org_id = request.query_params.get("organisation_id")
        dw = None
        # If no organisation_id provided, try to infer it from a display website id
        # Support common param names used across the app: 'displayWebsiteId', 'display_website_id', or 'id'
        if not org_id:
            display_website_id = (
                request.query_params.get("displayWebsiteId")
                or request.query_params.get("display_website_id")
                or request.query_params.get("id")
            )
            if not display_website_id:
                return Response(
                    {"detail": "organisation_id parameter is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Resolve the display website and derive organisation from its branch
            try:
                dw = get_object_or_404(DisplayWebsite, id=display_website_id)
            except Exception:
                return Response(
                    {"detail": "Display website not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if not dw.branch or not dw.branch.suborganisation:
                return Response(
                    {"detail": "Display website missing branch/suborganisation."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            organisation = dw.branch.suborganisation.organisation
            org_id = organisation.id
        else:
            try:
                organisation = get_object_or_404(Organisation, pk=org_id)
            except:
                return Response(
                    {"detail": "Organization not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        # Allow access via X-API-KEY (e.g. slideshow player) when the key belongs
        # to a branch under the requested organisation. Otherwise validate the
        # requesting user as before.
        api_key = request.headers.get("X-API-KEY")
        api_key_authenticated = False
        if api_key:
            try:
                key_obj = SlideshowPlayerAPIKey.objects.filter(
                    key=api_key, is_active=True
                ).first()
            except Exception:
                key_obj = None

            if not key_obj:
                return Response(
                    {"detail": "Invalid API key."}, status=status.HTTP_403_FORBIDDEN
                )

            # If we resolved a DisplayWebsite (dw) prefer to validate the api key against that branch.
            if dw:
                if key_obj.branch and key_obj.branch != dw.branch:
                    return Response(
                        {"detail": "API key not valid for this branch."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
            else:
                # Fallback: ensure the api key's branch belongs to the requested organisation
                try:
                    key_org = key_obj.branch.suborganisation.organisation
                except Exception:
                    return Response(
                        {"detail": "API key not linked to an organisation."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                if str(key_org.id) != str(org_id):
                    return Response(
                        {
                            "detail": "API key does not grant access to this organisation."
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

            api_key_authenticated = True

        if not api_key_authenticated:
            # Check if user has permission to access this organization
            if not (
                hasattr(request, "user")
                and user_is_super_admin(request.user)
                or user_belongs_to_organisation(request.user, organisation)
            ):
                return Response(
                    {
                        "detail": "You don't have permission to access this organization."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        if pk:
            # Get a single font by ID
            try:
                custom_font = CustomFont.objects.get(id=pk, organisation=organisation)
                serializer = CustomFontSerializer(custom_font)
                return Response(serializer.data)
            except CustomFont.DoesNotExist:
                return Response(
                    {"detail": "Font not found."}, status=status.HTTP_404_NOT_FOUND
                )
        else:
            # Get all fonts for the organization
            custom_fonts = CustomFont.objects.filter(organisation=organisation)
            serializer = CustomFontSerializer(custom_fonts, many=True)
            return Response(serializer.data)

    def post(self, request):
        """
        Create a new custom font.
        Requires ?organisation_id=<ORG_ID> parameter.
        Only organization admins or super admins can create fonts.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has admin permission for this organization
        if not (
            user_is_super_admin(request.user)
            or user_is_admin_in_org(request.user, organisation)
        ):
            return Response(
                {"detail": "You must be an organization admin to add fonts."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Create a new font. Accept an uploaded file in request.FILES['file'] or a font_url in data.
        data = request.data.copy()

        uploaded_file = request.FILES.get("file")
        allowed_extensions = (".woff2", ".woff", ".ttf", ".otf")

        if uploaded_file:
            # Validate extension
            from django.core.files.storage import default_storage
            from django.core.files.base import ContentFile
            import os

            filename = uploaded_file.name
            ext = os.path.splitext(filename)[1].lower()
            if ext not in allowed_extensions:
                return Response(
                    {
                        "detail": f"Unsupported font file type: {ext}. Allowed: {', '.join(allowed_extensions)}"
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Build storage path: uploads/fonts/<org_id>/<unique_filename>
            safe_dir = f"uploads/fonts/{organisation.id}"
            # Ensure unique filename to avoid collisions
            unique_suffix = secrets.token_hex(6)
            storage_filename = f"{os.path.splitext(filename)[0]}-{unique_suffix}{ext}"
            storage_path = f"{safe_dir}/{storage_filename}"

            try:
                saved_path = default_storage.save(
                    storage_path, ContentFile(uploaded_file.read())
                )
                # Prefer using MEDIA_URL (which may point to MINIO_PUBLIC_URL) for
                # public-facing URLs so we don't return internal presigned URLs.
                from django.conf import settings as _dj_settings
                from urllib.parse import urljoin as _urljoin

                if getattr(_dj_settings, "MEDIA_URL", "").startswith("http"):
                    font_url = _urljoin(_dj_settings.MEDIA_URL, saved_path)
                else:
                    font_url = request.build_absolute_uri(
                        default_storage.url(saved_path)
                    )
                data["font_url"] = font_url
                # Default name to filename (without extension) if not provided
                if not data.get("name"):
                    data["name"] = os.path.splitext(filename)[0]
            except Exception as e:
                logger.error(f"Failed to save uploaded font: {e}")
                return Response(
                    {"detail": "Failed to store uploaded font."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # If uploaded_file not provided, expect client to send font_url in body
        serializer = CustomFontSerializer(
            data=data, context={"organisation": organisation}
        )
        if serializer.is_valid():
            # Assign the font to the specified organization
            serializer.save(organisation=organisation)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        # If serializer invalid and we saved a file, attempt to cleanup the saved file
        if uploaded_file and saved_path:
            try:
                default_storage.delete(saved_path)
            except Exception:
                pass
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        """
        Partially update a custom font.
        Requires ?organisation_id=<ORG_ID> parameter.
        Only organization admins or super admins can update fonts.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has admin permission for this organization
        if not (
            user_is_super_admin(request.user)
            or user_is_admin_in_org(request.user, organisation)
        ):
            return Response(
                {"detail": "You must be an organization admin to modify fonts."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Try to get the font
        try:
            custom_font = CustomFont.objects.get(id=pk, organisation=organisation)
        except CustomFont.DoesNotExist:
            return Response(
                {"detail": "Font not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Update the font
        data = request.data.copy()

        uploaded_file = request.FILES.get("file")
        allowed_extensions = (".woff2", ".woff", ".ttf", ".otf")
        saved_path = None

        if uploaded_file:
            # Validate extension
            from django.core.files.storage import default_storage
            from django.core.files.base import ContentFile
            import os

            filename = uploaded_file.name
            ext = os.path.splitext(filename)[1].lower()
            if ext not in allowed_extensions:
                return Response(
                    {
                        "detail": f"Unsupported font file type: {ext}. Allowed: {', '.join(allowed_extensions)}"
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Build storage path: uploads/fonts/<org_id>/<unique_filename>
            safe_dir = f"uploads/fonts/{organisation.id}"
            # Ensure unique filename to avoid collisions
            unique_suffix = secrets.token_hex(6)
            storage_filename = f"{os.path.splitext(filename)[0]}-{unique_suffix}{ext}"
            storage_path = f"{safe_dir}/{storage_filename}"

            try:
                saved_path = default_storage.save(
                    storage_path, ContentFile(uploaded_file.read())
                )
                from django.conf import settings as _dj_settings
                from urllib.parse import urljoin as _urljoin

                if getattr(_dj_settings, "MEDIA_URL", "").startswith("http"):
                    font_url = _urljoin(_dj_settings.MEDIA_URL, saved_path)
                else:
                    font_url = request.build_absolute_uri(
                        default_storage.url(saved_path)
                    )
                data["font_url"] = font_url
            except Exception as e:
                logger.error(f"Failed to save uploaded font: {e}")
                return Response(
                    {"detail": "Failed to store uploaded font."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        serializer = CustomFontSerializer(
            custom_font, data=data, context={"organisation": organisation}, partial=True
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        # If serializer invalid and we saved a file, attempt to cleanup the saved file
        if uploaded_file and saved_path:
            try:
                default_storage.delete(saved_path)
            except Exception:
                pass
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        """
        Delete a custom font.
        Requires ?organisation_id=<ORG_ID> parameter.
        Only organization admins or super admins can delete fonts.
        """
        org_id = request.query_params.get("organisation_id")
        if not org_id:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            organisation = get_object_or_404(Organisation, pk=org_id)
        except:
            return Response(
                {"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Check if user has admin permission for this organization
        if not (
            user_is_super_admin(request.user)
            or user_is_admin_in_org(request.user, organisation)
        ):
            return Response(
                {"detail": "You must be an organization admin to delete fonts."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Try to get the font
        try:
            custom_font = CustomFont.objects.get(id=pk, organisation=organisation)
        except CustomFont.DoesNotExist:
            return Response(
                {"detail": "Font not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Delete the font
        custom_font.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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


###############################################################################
# Email Test Endpoint
###############################################################################


class SendLoginEmailView(APIView):
    """
    Test endpoint to send a "You logged in" email to the authenticated user.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Send a test login email to the authenticated user.
        """
        user = request.user

        # Get user email
        if not user.email:
            return Response(
                {"error": "User does not have an email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Send email
            subject = "Login Notification - OpenStream Admin"
            message = f"""
Hello {user.first_name or user.username},

You have successfully logged into the OpenStream Admin system.

Login details:
- Username: {user.username}
- Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

If this wasn't you, please contact your administrator immediately.

Best regards,
OpenStream Team
            """

            from_email = settings.DEFAULT_FROM_EMAIL
            recipient_list = [user.email]

            send_mail(
                subject=subject,
                message=message,
                from_email=from_email,
                recipient_list=recipient_list,
                fail_silently=False,
            )

            logger.info(f"Login notification email sent to {user.email}")

            return Response(
                {
                    "message": "Login notification email sent successfully.",
                    "email": user.email,
                    "sent_at": datetime.now().isoformat(),
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            logger.error(
                f"Failed to send login notification email to {user.email}: {str(e)}"
            )
            return Response(
                {"error": f"Failed to send email: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


###############################################################################
# Password Reset Endpoint
###############################################################################


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")

        if not email:
            return Response(
                {"error": "Email is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Find user by email
            user = User.objects.get(email=email)

            # Create a signed token that expires in 1 hour
            signer = TimestampSigner()
            token = signer.sign(f"password_reset_{user.id}")

            # Create the reset URL
            reset_url = f"{request.build_absolute_uri('/reset-password-confirm/')}?token={token}"

            # Send email with reset link
            subject = "OpenStream - Password Reset Request"
            message = f"""
Hello {user.get_full_name() or user.username},

You have requested a password reset for your OpenStream account.

Please click the link below to reset your password:
{reset_url}

This link will expire in 1 hour for security reasons.

If you did not request this password reset, please ignore this email or contact your administrator.

Best regards,
The OpenStream Team
            """

            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )

            logger.info(f"Password reset email sent to {user.email}")

            return Response(
                {
                    "message": "A password reset link has been sent to your email address.",
                    "email": user.email,
                },
                status=status.HTTP_200_OK,
            )

        except User.DoesNotExist:
            # For security reasons, don't reveal if email exists or not
            return Response(
                {
                    "message": "If this email address is associated with an account, you will receive a password reset link.",
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            logger.error(f"Failed to send password reset email for {email}: {str(e)}")
            return Response(
                {
                    "error": "Failed to process password reset request. Please try again later."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ConfirmPasswordResetView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get("token")
        new_password = request.data.get("new_password")

        if not token or not new_password:
            return Response(
                {"error": "Token and new password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(new_password) < 8:
            return Response(
                {"error": "Password must be at least 8 characters long."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Verify the token (expires in 1 hour = 3600 seconds)
            signer = TimestampSigner()
            unsigned_token = signer.unsign(token, max_age=3600)

            # Extract user ID from the token
            if not unsigned_token.startswith("password_reset_"):
                raise BadSignature("Invalid token format")

            user_id = int(unsigned_token.replace("password_reset_", ""))
            user = User.objects.get(id=user_id)

            # Update user's password
            user.set_password(new_password)
            user.save()

            logger.info(f"Password successfully reset for user {user.email}")

            return Response(
                {
                    "message": "Your password has been successfully reset. You can now log in with your new password.",
                },
                status=status.HTTP_200_OK,
            )

        except SignatureExpired:
            return Response(
                {"error": "Password reset link has expired. Please request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        except (BadSignature, ValueError):
            return Response(
                {"error": "Invalid or corrupted password reset link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        except User.DoesNotExist:
            return Response(
                {"error": "User not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        except Exception as e:
            logger.error(f"Failed to reset password with token: {str(e)}")
            return Response(
                {"error": "Failed to reset password. Please try again later."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


###############################################################################
# Screen Connection API
###############################################################################


class RegisterScreenAPIView(APIView):
    """
    API endpoint for registering a new screen with an API key.
    Replaces the register_screen Django template view.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        api_key_value = request.query_params.get("apiKey")
        if not api_key_value:
            return Response(
                {"error": "API key is required."}, status=status.HTTP_400_BAD_REQUEST
            )

        # Validate the API key using your branch-based logic.
        try:
            key_obj = SlideshowPlayerAPIKey.objects.get(
                key=api_key_value, is_active=True
            )
        except SlideshowPlayerAPIKey.DoesNotExist:
            return Response(
                {"error": "Invalid API key."}, status=status.HTTP_400_BAD_REQUEST
            )

        branch = key_obj.branch
        if branch is None:
            return Response(
                {"error": "API key does not map to a valid branch."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Attempt to get an existing screen from the client-provided screenId.
        screen_id = request.query_params.get("screenId")
        screen = None
        if screen_id:
            try:
                screen = DisplayWebsite.objects.get(id=screen_id, branch=branch)
                screen_data = DisplayWebsiteSerializer(screen).data
            except DisplayWebsite.DoesNotExist:
                screen_data = None
        else:
            screen_data = None

        return Response(
            {
                "screen": screen_data,
                "api_key": api_key_value,
                "branch_id": branch.id,
                "branch_name": branch.name,
            }
        )


class CreateScreenAPIView(APIView):
    """
    API endpoint for creating a new screen.
    Replaces the create_screen Django view.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        api_key_value = request.data.get("apiKey") or request.query_params.get("apiKey")
        if not api_key_value:
            return Response(
                {"error": "API key is required."}, status=status.HTTP_400_BAD_REQUEST
            )

        # Validate API key using your existing model logic.
        try:
            key_obj = SlideshowPlayerAPIKey.objects.get(
                key=api_key_value, is_active=True
            )
        except SlideshowPlayerAPIKey.DoesNotExist:
            return Response(
                {"error": "Invalid API key."}, status=status.HTTP_400_BAD_REQUEST
            )

        branch = key_obj.branch
        if branch is None:
            return Response(
                {"error": "API key does not map to a valid branch."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        import uuid

        # Read optional parameters: uid and hostname. uid is an optional
        # external identifier that should be unique per branch.
        uid = request.data.get("uid") or request.query_params.get("uid")
        hostname = request.data.get("hostname") or request.query_params.get("hostname")

        # Accept optional aspect_ratio from request body or query params
        aspect_ratio = (
            request.data.get("aspect_ratio")
            or request.query_params.get("aspect_ratio")
            or DisplayWebsite._meta.get_field("aspect_ratio").get_default()
        )

        # If a uid is provided, try to find an existing screen in this branch
        # matching the uid. If found, update the hostname if provided and
        # different, then return the existing screen. If not found, create
        # a new DisplayWebsite with the provided uid and hostname.
        if uid:
            try:
                screen = DisplayWebsite.objects.get(uid=uid, branch=branch)
                # Update name if hostname provided and different
                if hostname and screen.name != hostname:
                    screen.name = hostname
                    screen.save()
                return Response(
                    {"screenId": screen.id, "name": screen.name, "branch_id": branch.id}
                )
            except DisplayWebsite.DoesNotExist:
                # If a screen with this uid exists elsewhere in the SAME organisation,
                # reassign it to this branch and clear its group (mark as not-activated).
                try:
                    # Resolve organisation from branch -> suborganisation -> organisation
                    org = None
                    if getattr(branch, "suborganisation", None):
                        org = getattr(branch.suborganisation, "organisation", None)
                    if org:
                        existing = DisplayWebsite.objects.get(uid=uid, branch__suborganisation__organisation=org)
                    else:
                        # Fallback: try a global uid lookup
                        existing = DisplayWebsite.objects.get(uid=uid)
                    # Reassign only if it's on a different branch
                    if existing.branch_id != branch.id:
                        existing.branch = branch
                        existing.display_website_group = None
                        # Keep name, but update if hostname provided
                        if hostname:
                            existing.name = hostname
                        existing.save()
                    return Response({"screenId": existing.id, "name": existing.name, "branch_id": branch.id})
                except DisplayWebsite.DoesNotExist:
                    # Create new with uid and hostname (or temporary name)
                    name = hostname or f"SCR-temp-{uuid.uuid4().hex[:8]}"
                    screen = DisplayWebsite.objects.create(
                        branch=branch, name=name, uid=uid, aspect_ratio=aspect_ratio
                    )
                # If we used a temp name and no hostname was provided, set SCR{id}
                if not hostname:
                    screen.name = f"SCR{screen.id}"
                    screen.save()
                return Response(
                    {"screenId": screen.id, "name": screen.name, "branch_id": branch.id}
                )

        # No uid provided: fall back to original behavior creating a screen
        # with a temporary name and returning SCR{id}.
        temp_name = f"SCR-temp-{uuid.uuid4().hex[:8]}"
        screen = DisplayWebsite.objects.create(
            branch=branch, name=temp_name, aspect_ratio=aspect_ratio
        )
        screen.name = f"SCR{screen.id}"
        screen.save()

        return Response(
            {"screenId": screen.id, "name": screen.name, "branch_id": branch.id}
        )


class CheckScreenGroupAPIView(APIView):
    """
    API endpoint for checking if a screen has been assigned to a group.
    Replaces the check_screen_group Django view.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        # Get the parameters from the query string.
        screen_id = request.query_params.get("screenId")
        api_key_value = request.query_params.get("apiKey")
        # Optional uid and hostname for lookup
        uid = request.query_params.get("uid")
        hostname = request.query_params.get("hostname")

        if not screen_id or not api_key_value:
            return Response(
                {"error": "Missing required parameters"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate API key using the SlideshowPlayerAPIKey model.
        try:
            key_obj = SlideshowPlayerAPIKey.objects.get(
                key=api_key_value, is_active=True
            )
        except SlideshowPlayerAPIKey.DoesNotExist:
            return Response(
                {"error": "Invalid API key."}, status=status.HTTP_400_BAD_REQUEST
            )

        branch = key_obj.branch
        if branch is None:
            return Response(
                {"error": "API key does not map to a valid branch."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # If uid is provided, prefer lookup by uid within this branch. If found,
        # ensure hostname updates if provided. Otherwise, fall back to id lookup.
        screen = None
        if uid:
            try:
                screen = DisplayWebsite.objects.get(uid=uid, branch=branch)
                # If hostname provided and differs, update name
                if hostname and screen.name != hostname:
                    screen.name = hostname
                    screen.save()
            except DisplayWebsite.DoesNotExist:
                # No screen with this uid found in this branch. Check if a screen
                # with this uid exists elsewhere in the SAME organisation. If so,
                # reassign it to this branch and clear its group (mark not-activated).
                try:
                    # Resolve organisation from branch -> suborganisation -> organisation
                    org = None
                    if getattr(branch, "suborganisation", None):
                        org = getattr(branch.suborganisation, "organisation", None)
                    if org:
                        existing = DisplayWebsite.objects.get(uid=uid, branch__suborganisation__organisation=org)
                    else:
                        # Fallback: try a global uid lookup
                        existing = DisplayWebsite.objects.get(uid=uid)
                    # Reassign if it's on a different branch
                    if existing.branch_id != branch.id:
                        existing.branch = branch
                        existing.display_website_group = None
                        if hostname:
                            existing.name = hostname
                        existing.save()
                    screen = existing
                except DisplayWebsite.DoesNotExist:
                    # No screen with this uid found anywhere in the organisation
                    return Response(
                        {"error": "Screen not found"}, status=status.HTTP_404_NOT_FOUND
                    )

        if screen is None:
            # Lookup by provided screen id
            try:
                screen = DisplayWebsite.objects.get(id=screen_id, branch=branch)
            except DisplayWebsite.DoesNotExist:
                return Response(
                    {"error": "Screen not found"}, status=status.HTTP_404_NOT_FOUND
                )

        # Return group information if available.
        if screen.display_website_group:
            data = {
                "groupId": screen.display_website_group.id,
                "groupName": screen.display_website_group.name,
            }
        else:
            data = {"groupId": None}

        return Response(data)


###############################################################################
# Authentication Views
###############################################################################


class GetUsernameFromTokenView(APIView):
    """
    Endpoint to retrieve the username based on the provided JWT token.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs) -> Response:
        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication

            jwt_authenticator = JWTAuthentication()
            user, token = jwt_authenticator.authenticate(request)

            if user:
                return Response({"username": user.username}, status=status.HTTP_200_OK)
            else:
                return Response(
                    {"detail": "Invalid token"}, status=status.HTTP_401_UNAUTHORIZED
                )
        except Exception as e:
            logger.error(f"Error decoding token: {e}")
            return Response(
                {"detail": "An error occurred while processing the token."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class UserAPIKeyView(APIView):
    """
    This view is used for fetching and (optionally) regenerating a user's API key.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        from app.models import SlideshowPlayerAPIKey
        import uuid

        api_key, created = SlideshowPlayerAPIKey.objects.get_or_create(
            user=request.user
        )
        return Response({"api_key": str(api_key.key)}, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        from app.models import SlideshowPlayerAPIKey
        import uuid

        api_key, _ = SlideshowPlayerAPIKey.objects.get_or_create(user=request.user)
        api_key.key = uuid.uuid4()
        api_key.save()
        return Response({"api_key": str(api_key.key)}, status=status.HTTP_200_OK)


###############################################################################
# Utility Functions for Ninja API Conversions
###############################################################################


def update_if_minutes_elapsed(minutes, last_update, update_func):
    if time.time() > last_update + 60 * minutes:
        update_func()


class CacheHandler:
    """
    Helper class that tracks cache timing for individual entries
    """

    def __init__(self, **kwargs):
        self._cache = kwargs.get("initial_keys", {})
        self.data_refresh_timer_mins = kwargs.get("data_refresh_timer_mins", 15)
        self.data_refresh_func = kwargs.get("data_refresh_func")

        self.token_refresh_timer_mins = kwargs.get("token_refresh_timer_mins", 15)
        self.token_refresh_func = kwargs.get("token_refresh_func")

        self.keys_refresh_timer_mins = kwargs.get(
            "keys_refresh_timer_mins", 60 * 24
        )  # Default to refresh once a day
        self.keys_refresh_func = kwargs.get("keys_refresh_func")
        if not self.keys_refresh_func:
            raise Exception("A key refresh function must be provided")

    def get_booking_data(self, organisation, location, sub_locations):
        data = self._get_or_update_booking_data(organisation, location, sub_locations)
        return self._filter_bookables(data)

    def _filter_bookables(self, data):
        # Create a deep copy so original is not mutated
        filtered_data = copy.deepcopy(data)

        # Remove top-level _last_refresh_booking_data
        filtered_data.pop("_last_refresh_booking_data", None)

        if "bookables" in filtered_data:
            filtered_data["bookings"] = []
            for key, bookable in filtered_data["bookables"].items():
                bookings = bookable.get("bookings")
                if bookings:
                    bookable.pop("_last_refresh_booking_data", None)
                    for booking in bookings:
                        filtered_data["bookings"].append(
                            {
                                "sub_location": bookable["name"],
                                "sub_location_id": bookable["id"],
                                "booking_data": booking,
                            }
                        )

            # Replace bookables with the structured bookings list
            filtered_data.pop("bookables", None)

        return filtered_data

    def get_locations(self, organisation):
        """
        Returns the entire _data field of a root obj
        """
        if organisation is None:
            raise AttributeError("Must specify organisation")
        obj = self._get_or_update_locations(organisation)
        return obj.get("_data")

    def _get_or_update_booking_data(self, organisation, location, sub_locations):
        found_org, found_loc, found_sub_locs = self._return_found_org_loc_and_sub_loc(
            organisation, location, sub_locations
        )
        if not found_org or not found_loc or (sub_locations and not found_sub_locs):
            self._get_or_update_locations(organisation)
            found_org, found_loc, found_sub_locs = (
                self._return_found_org_loc_and_sub_loc(
                    organisation, location, sub_locations
                )
            )

        elements_to_update = found_loc
        if sub_locations:
            elements_to_update = []
            bookable_dict = {}
            for sub_loc in found_sub_locs:
                bookable_dict[sub_loc["id"]] = sub_loc
                if self._is_expired_booking_data(sub_loc):
                    elements_to_update.append(sub_loc)
            self._update_booking_data(found_org, elements_to_update)

            data = {
                "location_name": found_loc.get("location_name"),
                "bookables": bookable_dict,
            }
            return data
        elif self._is_expired_booking_data(found_loc):
            self._update_booking_data(found_org, found_loc)
            return found_loc

    def _get_or_update_locations(self, entry):
        organisation = self._get_root(entry)
        if organisation is None:
            self._cache[entry] = {"_last_refresh_keys": 0}
            organisation = self._get_root(entry)

        self._update_keys_if_expired(organisation)
        return organisation

    def _update_keys_if_expired(self, organisation):
        if self._is_expired_keys(organisation):
            self._update_keys(organisation)

    def _update_keys(self, organisation):
        self._update_token_if_needed(organisation)
        response = self.keys_refresh_func(organisation)
        if response:
            organisation["_last_refresh_keys"] = self._now()
            return True
        return False

    def _update_booking_data(self, organisation, entries_to_update):
        self._update_token_if_needed(organisation)
        result = self.data_refresh_func(organisation, entries_to_update)
        if result is not None:
            if isinstance(entries_to_update, list):
                for entry in entries_to_update:
                    entry["_last_refresh_booking_data"] = self._now()
            else:
                entries_to_update["_last_refresh_booking_data"] = self._now()
                bookables = entries_to_update.get("bookables")
                if bookables:
                    for bookable in bookables.values():
                        bookable["_last_refresh_booking_data"] = self._now()

    def _return_found_org_loc_and_sub_loc(self, organisation, location, sub_locations):
        found_org = self._cache.get(organisation, {})
        found_loc = found_org.get("_data", {}).get(location)
        found_sub_loc = []
        if found_loc and sub_locations:
            bookables = found_loc.get("bookables", {})
            for entry in bookables:
                if entry in sub_locations:
                    found_sub_loc.append(bookables[entry])

        return (found_org, found_loc, found_sub_loc)

    def _update_token(self, organisation):
        updated_org = self.token_refresh_func(organisation)
        if updated_org:
            updated_org["_last_refresh_token"] = self._now()

    def _update_token_if_needed(self, organisation):
        if self.token_refresh_func and self._is_expired_token(organisation):
            return self._update_token(organisation)

    def _is_expired_token(self, obj):
        return self._is_expired(
            obj, "_last_refresh_token", self.token_refresh_timer_mins * 60
        )

    def _is_expired_keys(self, obj):
        return self._is_expired(
            obj, "_last_refresh_keys", self.keys_refresh_timer_mins * 60
        )

    def _is_expired_booking_data(self, obj):
        return self._is_expired(
            obj, "_last_refresh_booking_data", self.data_refresh_timer_mins * 60
        )

    def _is_expired(self, obj, obj_key, self_timer_value):
        if not obj:
            return False
        return (
            self._now() - obj.get(obj_key, 0) > self_timer_value
            if isinstance(obj, dict) and obj.get(obj_key)
            else True
        )

    def _get_root(self, organisation):
        return self._cache.get(organisation)

    def _now(self):
        return time.time()


class TokenOrAPIKeyMixin:
    """
    Mixin to handle both JWT token and API key authentication
    """

    def check_auth(self, request):
        # Check for a Bearer token if available.
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            # JWT authentication already handled by DRF
            if hasattr(request, "user") and request.user.is_authenticated:
                return request.user

        # Check for X-API-KEY
        api_key = request.headers.get("X-API-KEY")
        if api_key:
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key, is_active=True
            ).first()
            if key_obj:
                return key_obj

        # Fallback: if request.user is already authenticated.
        if hasattr(request, "user") and request.user and request.user.is_authenticated:
            return request.user

        return None


###############################################################################
# DDB (Danish Digital Library) API Views
###############################################################################

# Dictionary with external API URLs and supported libraries per kommune.
DDB_EVENT_API_URLS = {
    "Brøndby": {
        "url": "https://www.brondby-bibliotekerne.dk/api/v1/events",
        "libraries": [
            "Biblioteket i Kilden",
            "Biblioteket i Brønden",
            "Brøndbyvester Bibliotek",
        ],
    },
    "København": {
        "url": "https://bibliotek.kk.dk/api/v1/events",
        "libraries": [
            "Hovedbiblioteket",
            "BIBLIOTEKET Rentemestervej",
            "Bibliotekshuset",
            "Ørestad Bibliotek",
        ],
    },
    "Lyngby-Taarbaek": {
        "url": "https://www.lyngbybib.dk/api/v1/events",
        "libraries": [
            "Stadsbiblioteket",
            "Lundtofte Bibliotek",
            "Taarbæk Bibliotek",
            "Virum Bibliotek",
        ],
    },
    "Aalborg": {
        "url": "https://www.aalborgbibliotekerne.dk/api/v1/events",
        "libraries": [
            "Hals Bibliotek",
            "Haraldslund",
            "Hasseris Bibliotek",
            "HistorieAalborg",
            "Hovedbiblioteket",
            "Nibe Bibliotek",
            "Nørresundby Bibliotek",
            "Storvorde Bibliotek",
            "Svenstrup Bibliotek",
            "Trekanten - Bibliotek og Kulturhus",
            "Vejgaard Bibliotek",
            "Vodskov Bibliotek",
        ],
    },
}


class DDBProxyAPIView(APIView, TokenOrAPIKeyMixin):
    """Simple proxy endpoint for testing"""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"message": "Hello from DDB Proxy endpoint!"})


class DDBEventOptionsAPIView(APIView, TokenOrAPIKeyMixin):
    """Endpoint to return kommune options"""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(DDB_EVENT_API_URLS)


class DDBEventAPIView(APIView, TokenOrAPIKeyMixin):
    """Endpoint to fetch, cache, and filter events"""

    permission_classes = [AllowAny]

    def get(self, request):
        kommune = request.query_params.get("kommune")
        if not kommune:
            return Response(
                {"error": "kommune parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        days = int(request.query_params.get("days", 0))

        # Validate the 'days' parameter.
        if days < 0:
            return Response(
                {"error": "'days' parameter must be a positive integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if the provided kommune is supported.
        if kommune not in DDB_EVENT_API_URLS:
            valid_keys = ", ".join(DDB_EVENT_API_URLS.keys())
            return Response(
                {
                    "error": f"{kommune} is an invalid kommune. Supported kommuner are: {valid_keys}"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        api_url = DDB_EVENT_API_URLS[kommune]["url"]

        # Define a cache key unique for each kommune.
        cache_key = f"ddb_events_{kommune}"
        valid_events = cache.get(cache_key)

        if valid_events is None:
            try:
                resp = requests.get(api_url)
                resp.raise_for_status()
                raw_response_text = resp.text

                # Parse the raw response directly
                events = json.loads(raw_response_text)

            except requests.RequestException as e:
                return Response(
                    {"error": "Failed to fetch data from external API"},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            except json.JSONDecodeError as e:
                return Response(
                    {"error": f"Failed to decode JSON: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            except Exception as e:
                return Response(
                    {"error": f"Unexpected error processing response: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            # Basic validation of events
            valid_events = []
            for event_data in events:
                if isinstance(event_data, dict):
                    valid_events.append(event_data)

            if valid_events:
                cache.set(cache_key, valid_events, timeout=1800)
            else:
                return Response([])

        # Filter events based on the 'days' parameter.
        if not valid_events:
            return Response([])

        now_utc = datetime.now(dt_timezone.utc)
        future_limit = now_utc + timedelta(days=days)
        filtered_events = []

        for event in valid_events:
            dt = event.get("date_time", {})
            start_str = dt.get("start")
            if start_str:
                try:
                    start_time = dateutil.parser.parse(start_str)
                    if start_time >= now_utc.replace(
                        hour=0, minute=0, second=0, microsecond=0
                    ) and (days == 0 or start_time <= future_limit):
                        filtered_events.append(event)
                except Exception as e:
                    continue

        try:
            if filtered_events:
                filtered_events.sort(
                    key=lambda x: (
                        dateutil.parser.parse(x.get("date_time", {}).get("start"))
                        if x.get("date_time", {}).get("start")
                        else datetime.min.replace(tzinfo=dt_timezone.utc)
                    )
                )
        except Exception as e:
            pass

        # Apply additional filters
        extra_filters = {
            key: value.lower()
            for key, value in request.query_params.items()
            if key not in ["sort", "order", "kommune", "days"]
        }
        if extra_filters:
            final_filtered_events = [
                event
                for event in filtered_events
                if all(
                    extra_filters[key] in str(event.get(key, "")).lower()
                    for key in extra_filters
                )
            ]
        else:
            final_filtered_events = filtered_events

        return Response(final_filtered_events)


###############################################################################
# RSS Proxy API Views
###############################################################################

# RSS feed URLs
DR_FEED = {
    "Indland": "https://www.dr.dk/nyheder/service/feeds/indland",
    "Udland": "https://www.dr.dk/nyheder/service/feeds/udland",
    "Penge": "https://www.dr.dk/nyheder/service/feeds/penge",
    "Politik": "https://www.dr.dk/nyheder/service/feeds/politik",
    "Sporten": "https://www.dr.dk/nyheder/service/feeds/sporten",
    "Seneste sport": "https://www.dr.dk/nyheder/service/feeds/senestesport",
    "Viden": "https://www.dr.dk/nyheder/service/feeds/viden",
    "Kultur": "https://www.dr.dk/nyheder/service/feeds/kultur",
    "Musik": "https://www.dr.dk/nyheder/service/feeds/musik",
}

DMI_WEATHER_LOCATIONS = {
    # Sjælland
    "København": {"latitude": 55.6140, "longitude": 12.6454},  # Københavns Lufthavn
    "Lyngby-Taarbæk": {"latitude": 55.7655, "longitude": 12.5110},
    "Roskilde": {"latitude": 55.5868, "longitude": 12.1363},  # Roskilde Lufthavn
    "Hørsholm": {"latitude": 55.8765, "longitude": 12.4121},  # Sjælsmark
    "Hillerød": {
        "latitude": 55.9276,
        "longitude": 12.3008,
    },  # Hillerød Centralrenseanlæg
    "Næstved": {"latitude": 55.2502, "longitude": 11.7690},  # Næstved Maglegårdsvej
    "Slagelse": {"latitude": 55.4024, "longitude": 11.3546},  # Slagelse Pumpestation
    # Jylland
    "Aarhus": {"latitude": 56.3083, "longitude": 10.6254},  # Århus Lufthavn
    "Aalborg": {"latitude": 57.0963, "longitude": 9.8505},  # Flyvestation Ålborg
    "Esbjerg": {"latitude": 55.5281, "longitude": 8.5631},  # Esbjerg Lufthavn
    "Randers": {"latitude": 56.4537, "longitude": 10.0698},  # Randers Centralrenseanlæg
    "Kolding": {"latitude": 55.4715, "longitude": 9.4844},  # Kolding
    "Horsens": {"latitude": 55.8680, "longitude": 9.7869},  # Horsens/Bygholm
    "Vejle": {"latitude": 55.7022, "longitude": 9.5390},  # Vejle Centralrenseanlæg
    "Herning": {"latitude": 56.1364, "longitude": 8.9766},  # Høgild
    "Silkeborg": {"latitude": 56.1998, "longitude": 9.5779},  # Silkeborg Forsyning
    "Fredericia": {"latitude": 55.5518, "longitude": 9.7217},  # Fredericia
}

# Global variables for caching
last_news_update_at = 0
cached_news_data = []
cached_weather_data = {}
last_weather_update_at = {}


def fetch_rss_data():
    global cached_news_data
    try:
        cached_news_data = []
        for category, url in DR_FEED.items():
            try:
                feed = feedparser.parse(url)
                feed_items = []
                for entry in feed.entries:
                    # Extract image URL from media content
                    image_url = ""
                    if hasattr(entry, "media_content") and entry.media_content:
                        # feedparser stores media:content as media_content list
                        image_url = (
                            entry.media_content[0].get("url", "")
                            if entry.media_content
                            else ""
                        )
                    elif hasattr(entry, "links"):
                        # Sometimes images are in links with type image/*
                        for link in entry.links:
                            if link.get("type", "").startswith("image/"):
                                image_url = link.get("href", "")
                                break

                    feed_items.append(
                        {
                            "title": entry.title,
                            "link": entry.link,
                            "published": (
                                entry.published if hasattr(entry, "published") else ""
                            ),
                            "summary": (
                                entry.summary if hasattr(entry, "summary") else ""
                            ),
                            "image": image_url,
                        }
                    )

                # Group items by feed/category as expected by frontend
                cached_news_data.append({"name": category, "items": feed_items})
            except Exception as e:
                cached_news_data.append(
                    {
                        "name": category,
                        "items": [],
                        "error": f"Failed to fetch {category}: {str(e)}",
                    }
                )
    except Exception as e:
        cached_news_data = [
            {"name": "Error", "items": [], "error": f"Unexpected error: {str(e)}"}
        ]


class RSSToJSONAPIView(APIView, TokenOrAPIKeyMixin):
    """Convert RSS feeds to JSON"""

    permission_classes = [AllowAny]

    def get(self, request):
        global last_news_update_at
        if update_if_minutes_elapsed(10, last_news_update_at, fetch_rss_data):
            last_news_update_at = time.time()
        return Response({"news": cached_news_data})


def fetch_weather_data(location):
    global cached_weather_data, last_weather_update_at

    try:
        weather_api_url = f"https://api.open-meteo.com/v1/forecast?latitude={DMI_WEATHER_LOCATIONS[location]['latitude']}&longitude={DMI_WEATHER_LOCATIONS[location]['longitude']}&current=temperature_2m,precipitation,cloud_cover,relative_humidity_2m&models=dmi_seamless"

        response = requests.get(weather_api_url)

        if response.status_code != 200:
            cached_weather_data[location] = {
                "error": f"HTTP error {response.status_code}"
            }
            return

        data = response.json()
        last_weather_update_at[location] = time.time()

        # Extract relevant data with .get() to prevent KeyErrors
        temperature = data.get("current", {}).get("temperature_2m", "N/A")
        precipitation = data.get("current", {}).get("precipitation", 0)
        cloud_cover = data.get("current", {}).get("cloud_cover", 0)

        def get_precipitation_text(precip):
            if precip < 0.1:
                return ""
            elif precip < 5:
                return "💦"
            else:
                return ""

        def get_cloud_cover_text(cloud_cover):
            if cloud_cover < 10:
                return "☀️"
            elif cloud_cover < 50:
                return "⛅"
            elif cloud_cover < 80:
                return "☁️"
            else:
                return ""

        cached_weather_data[location] = {
            "temperature": temperature,
            "precipitationText": get_precipitation_text(precipitation),
            "cloudCoverText": get_cloud_cover_text(cloud_cover),
        }

    except requests.RequestException as e:
        cached_weather_data[location] = {"error": f"Request error: {str(e)}"}
    except KeyError as e:
        cached_weather_data[location] = {"error": f"Missing key in response: {str(e)}"}
    except Exception as e:
        cached_weather_data[location] = {"error": f"Unexpected error: {str(e)}"}


class WeatherAPIView(APIView, TokenOrAPIKeyMixin):
    """Get weather data for a location"""

    permission_classes = [AllowAny]

    def get(self, request):
        location = request.query_params.get("location")
        if not location:
            return Response(
                {"error": "location parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if location not in DMI_WEATHER_LOCATIONS:
            return Response(
                {"error": "Invalid location"}, status=status.HTTP_400_BAD_REQUEST
            )

        global last_weather_update_at
        if update_if_minutes_elapsed(
            10,
            last_weather_update_at.get(location, 0),
            lambda: fetch_weather_data(location),
        ):
            last_weather_update_at[location] = time.time()

        return Response(
            {
                "weather": cached_weather_data.get(
                    location, {"error": "No data available"}
                )
            }
        )


class WeatherLocationsAPIView(APIView, TokenOrAPIKeyMixin):
    """Get available weather locations"""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"locations": list(DMI_WEATHER_LOCATIONS.keys())})


###############################################################################
# Speed Admin API Views
###############################################################################

# Global variables for SpeedAdmin caching
SPEEDADMIN_API_URL = "https://api.speedadmin.dk/v1/lesson"
speedadmin_last_update_at = 0
speedadmin_school_data = []
speedadmin_school_names = []


def fetch_speedadmin_data():
    global speedadmin_last_update_at, speedadmin_school_data, speedadmin_school_names
    print("fetching speedadmin data")
    try:
        headers = {"Authorization": settings.SPEEDADMIN_API_KEY}
        response = requests.get(SPEEDADMIN_API_URL, headers=headers)

        if response.status_code == 200:
            data = response.json()
            speedadmin_last_update_at = time.time()

            speedadmin_school_names.clear()
            speedadmin_school_data.clear()
            for item in data:
                if item["School"] and item["School"] not in speedadmin_school_names:
                    speedadmin_school_names.append(item["School"])
                # Extract time parts
                display_start_time = item["StartTime"].split("T")[1][:5]
                display_end_time = item["EndTime"].split("T")[1][:5]

                extracted_data = {
                    "school": item["School"],
                    "room": item["Room"],
                    "date": item["Date"],
                    "startTime": item["StartTime"],
                    "endTime": item["EndTime"],
                    "title": item["Title"],
                    "courseName": item["CourseName"],
                    "teachers": item["Teachers"],
                    "displayStartTime": display_start_time,
                    "displayEndTime": display_end_time,
                }

                speedadmin_school_data.append(extracted_data)
            # Sort by start time
            speedadmin_school_data.sort(key=lambda x: x["startTime"])
            print("Successfully refetched the data")
        else:
            print("error: Failed to fetch data", "status_code:", response.status_code)
    except Exception as e:
        print(f"Error fetching SpeedAdmin data: {e}")


class SpeedAdminDataAPIView(APIView, TokenOrAPIKeyMixin):
    """Get SpeedAdmin data for a specific school"""

    permission_classes = [AllowAny]

    def get(self, request):
        # Check if user's organisation has access to SpeedAdmin API
        if not check_api_access(request.user, "speedadmin"):
            return Response(
                {"error": "Your organisation does not have access to SpeedAdmin API"},
                status=status.HTTP_403_FORBIDDEN,
            )

        school_name = request.query_params.get("school_name")
        if not school_name:
            return Response(
                {"error": "school_name parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        global speedadmin_last_update_at
        update_if_minutes_elapsed(15, speedadmin_last_update_at, fetch_speedadmin_data)

        data_for_school = []
        today = datetime.now().date()
        for entry in speedadmin_school_data:
            if entry["school"] == school_name:
                date_obj = datetime.strptime(entry["date"], "%Y-%m-%dT%H:%M:%S")
                if date_obj.date() == today:
                    data_for_school.append(entry)
        return Response(data_for_school)


class SpeedAdminSchoolsAPIView(APIView, TokenOrAPIKeyMixin):
    """Get available SpeedAdmin schools"""

    permission_classes = [AllowAny]

    def get(self, request):
        # Check if user's organisation has access to SpeedAdmin API
        if not check_api_access(request.user, "speedadmin"):
            return Response(
                {"error": "Your organisation does not have access to SpeedAdmin API"},
                status=status.HTTP_403_FORBIDDEN,
            )

        global speedadmin_last_update_at
        update_if_minutes_elapsed(15, speedadmin_last_update_at, fetch_speedadmin_data)
        return Response(speedadmin_school_names)


###############################################################################
# WinKAS API Views
###############################################################################

# Global variables for WinKAS
default_winkas_credentials = {
    "UserName": getattr(settings, "WINKAS_USERNAME", ""),
    "UserPassword": getattr(settings, "WINKAS_PW", ""),
    "UserContractCode": getattr(settings, "WINKAS_CONTRACTCODE", ""),
}


def fetch_winkas_bookings(organisation, elements_to_update):
    """Fetch WinKAS bookings"""
    if not organisation or not elements_to_update:
        return
    api_url = "https://air.winkas.net/api/Calendar/GetAllResourceEventsInTimePeriod"

    if isinstance(elements_to_update, dict):
        multiple_entries = elements_to_update.get("bookables", {})
        resources = [key for key in multiple_entries]
    else:
        resources = [entry["id"] for entry in elements_to_update]

    local_tz = ZoneInfo("Europe/Copenhagen")
    now = datetime.now(local_tz)

    # Get midnight tomorrow in local time
    midnight_tomorrow = datetime.combine(
        (now + timedelta(days=1)).date(), datetime.min.time(), tzinfo=local_tz
    )

    body = {
        "Token": organisation.get("_token"),
        "StartTime": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "EndTime": midnight_tomorrow.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "Resources": resources,
    }

    try:
        response = requests.post(api_url, json=body)
        if response.status_code == 200:
            return clean_booking_response(elements_to_update, response.json())
    except Exception as e:
        print("Error when fetching bookings:", e)


def clean_booking_response(update_target, response_data):
    """Removes unnecessary properties and properly structures data"""

    def extract_booking_data(booking_list, booking):
        rc = booking.get("ResourceCalendarbooking")
        booking_list.append(
            {
                "subject": rc.get("Subject"),
                "start": rc.get("Start"),
                "stop": rc.get("Stop"),
                "booked_by": booking.get("BookingOwner").get("FirstName"),
            }
        )

    if isinstance(update_target, dict):
        bookables = update_target.get("bookables")
        for bookable in response_data["Resources"]:
            current_bookable = bookables.get(bookable.get("Id"))
            current_booking_list = current_bookable.get("bookings")
            calender_bookings = bookable["ResourceCalendarbookings"]
            if not current_bookable or not isinstance(calender_bookings, list):
                continue
            current_booking_list.clear()
            for booking in calender_bookings:
                extract_booking_data(current_booking_list, booking)

        for booking_list in bookables.values():
            booking_list["bookings"].sort(key=lambda x: x["start"])

        return bookables

    elif isinstance(update_target, list):
        for bookable in response_data["Resources"]:
            bookings_data = bookable["ResourceCalendarbookings"]
            if isinstance(bookings_data, list):
                bookings_list = next(
                    (
                        entry["bookings"]
                        for entry in update_target
                        if entry.get("id") == bookable["Id"]
                    ),
                    None,
                )
                bookings_list.clear()
                for booking in bookings_data:
                    extract_booking_data(bookings_list, booking)
                bookings_list.sort(key=lambda x: x["start"])

        return update_target


def refresh_winkas_token(organisation):
    """Refresh WinKAS authentication token"""
    api_url = "https://air.winkas.net/api/Authentication/Authenticate"
    body = {
        "UserName": default_winkas_credentials.get("UserName"),
        "UserPassword": default_winkas_credentials.get("UserPassword"),
        "UserContractCode": default_winkas_credentials.get("UserContractCode"),
    }
    try:
        response = requests.post(url=api_url, json=body).json()
        token = response.get("WinKasData", {}).get("CurrentToken")
        if token:
            organisation["_token"] = token
            return organisation
    except Exception as e:
        print("Failed to refresh token:", e)


def fetch_winkas_resources(organisation):
    """Fetch WinKAS resources"""
    api_url = "https://air.winkas.net/api/Calendar/GetAllResources"
    body = {"Token": organisation.get("_token")}
    try:
        response = requests.post(url=api_url, json=body)

        if response.status_code == 200:
            response = response.json()
            cleaned = clean_organisation_resources(response)
            organisation["_data"] = cleaned
            return organisation
    except Exception as e:
        print("Error occurred while getting resources")


def clean_organisation_resources(response_data):
    """Clean and structure WinKAS organisation resources"""
    cleaned_data = {}
    for resource in response_data.get("Resources", []):
        res_loc = resource.get("ResourceLocation")
        if res_loc and isinstance(res_loc, dict):
            location_name = res_loc.get("Name")
            location_id = res_loc.get("Id")
            address = res_loc.get("Address")
            if not location_name or not location_id or not address:
                continue
            if location_id not in cleaned_data:
                cleaned_data[location_id] = {
                    "id": location_id,
                    "location_name": location_name,
                    "bookables": {},
                }
            cleaned_data[location_id]["bookables"][resource.get("Id")] = {
                "name": resource.get("Name"),
                "id": resource.get("Id"),
                "bookings": [],
            }
    return cleaned_data


# Initialize WinKAS cache handler
winkas_cache = CacheHandler(
    token_refresh_func=refresh_winkas_token,
    keys_refresh_func=fetch_winkas_resources,
    data_refresh_func=fetch_winkas_bookings,
)


class WinKASLocationsAPIView(APIView, TokenOrAPIKeyMixin):
    """Get available WinKAS locations and their bookable sub-locations"""

    permission_classes = [AllowAny]

    def get(self, request):
        # Allow either X-API-KEY auth or regular user-based auth.
        api_key_value = request.headers.get("X-API-KEY")
        org_allowed = False

        if api_key_value:
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key_value, is_active=True
            ).first()
            if not key_obj:
                return Response({"error": "Invalid or inactive API key."}, status=403)

            # Resolve organisation from branch if present, otherwise from key user
            org = None
            if key_obj.branch:
                org = key_obj.branch.suborganisation.organisation
            elif getattr(key_obj, "user", None):
                org = get_org_from_user(key_obj.user)

            if not org:
                return Response(
                    {"error": "Could not determine organisation from API key."},
                    status=403,
                )

            # Finally check organisation access for WinKAS
            if OrganisationAPIAccess.objects.filter(
                organisation=org, api_name="winkas", is_active=True
            ).exists():
                org_allowed = True
            else:
                return Response(
                    {"error": "Your organisation does not have access to WinKAS API"},
                    status=403,
                )

        else:
            # user-based check
            if not check_api_access(request.user, "winkas"):
                return Response(
                    {"error": "Your organisation does not have access to WinKAS API"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        try:
            return Response(
                winkas_cache.get_locations(default_winkas_credentials["UserName"])
            )
        except Exception as e:
            return Response(
                {"error": f"Failed to get WinKAS locations: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class WinKASBookingsAPIView(APIView, TokenOrAPIKeyMixin):
    """Get bookings for a WinKAS location"""

    permission_classes = [AllowAny]

    def get(self, request):
        # Allow X-API-KEY auth or regular user-based auth for WinKAS access.
        api_key_value = request.headers.get("X-API-KEY")
        if api_key_value:
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key_value, is_active=True
            ).first()
            if not key_obj:
                return Response({"error": "Invalid or inactive API key."}, status=403)

            org = None
            if key_obj.branch:
                org = key_obj.branch.suborganisation.organisation
            elif getattr(key_obj, "user", None):
                org = get_org_from_user(key_obj.user)

            if (
                not org
                or not OrganisationAPIAccess.objects.filter(
                    organisation=org, api_name="winkas", is_active=True
                ).exists()
            ):
                return Response(
                    {"error": "Your organisation does not have access to WinKAS API"},
                    status=403,
                )
        else:
            # user-based check
            if not check_api_access(request.user, "winkas"):
                return Response(
                    {"error": "Your organisation does not have access to WinKAS API"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        location = request.query_params.get("location")
        sub_locations = request.query_params.get("sub_locations")

        if not location:
            return Response(
                {"error": "location parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if sub_locations:
            sub_locations = sub_locations.split(",")
            sub_locations = [int(item) for item in sub_locations]

        try:
            data = winkas_cache.get_booking_data(
                default_winkas_credentials["UserName"], int(location), sub_locations
            )
            data["bookings"].sort(key=lambda x: x["booking_data"]["start"])
            return Response(data)
        except Exception as e:
            return Response(
                {"error": f"Failed to get WinKAS bookings: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


###############################################################################
# KMD API Views
###############################################################################


# Load the Excel file for KMD
def load_kmd_location_data():
    """Load KMD location data from Excel file"""
    try:
        file_path = Path(__file__).resolve().parent / "data" / "KMD" / "lokale ID.xlsx"
        if not file_path.exists():
            file_path = (
                Path(settings.BASE_DIR) / "app" / "data" / "KMD" / "lokale ID.xlsx"
            )

        df = pd.read_excel(file_path)
        df["Anlægsrapport"] = df["Anlægsrapport"].astype(str).str.strip()
        df["Lokalenavn"] = df["Lokalenavn"].astype(str).str.strip()

        def clean_displayname(location_name):
            if location_name == "" or not isinstance(location_name, str):
                return location_name
            prefix, _, rest = location_name.partition("-")
            if rest and re.search(r"\b(EBH|LH|LYIB|VH)\b", prefix):
                return rest.strip()
            else:
                return location_name.strip()

        location_names = (
            df.groupby("Anlægsrapport")["Lokalenavn"]
            .apply(lambda x: sorted(x.str.strip().apply(clean_displayname).tolist()))
            .to_dict()
        )
        return location_names
    except Exception as e:
        print(f"Error loading KMD location data: {e}")
        return {}


# Global variables for KMD
KMD_API_URL = (
    "https://booking-ltk.kmd.dk/kmd_webapi/api/Monitor/GetFilteredAccessControlRecords?"
)
kmd_last_update_at = {
    "Engelsborghallerne": {"ID": "EBH", "last_update": 0},
    "Lyngby Idrætsby": {"ID": "LST", "last_update": 0},
    "Lundtoftehallen": {"ID": "LH", "last_update": 0},
    "Virumhallerne": {"ID": "VH", "last_update": 0},
}
kmd_locations_data = {}
kmd_location_names = load_kmd_location_data()


def clean_kmd_displayname(location_name):
    """Clean KMD location display names"""
    if location_name == "" or not isinstance(location_name, str):
        return location_name
    prefix, _, rest = location_name.partition("-")
    if rest and re.search(r"\b(EBH|LH|LYIB|VH)\b", prefix):
        return rest.strip()
    else:
        return location_name.strip()


def fetch_kmd_data(facility=""):
    """Fetch KMD data for a specific facility"""
    global kmd_locations_data, kmd_last_update_at

    if facility and facility not in kmd_location_names:
        return False

    try:
        headers = {"Content-Type": "application/json"}
        today_date = datetime.today().strftime("%Y-%m-%d")

        # Get API key from settings
        kmd_api_key = getattr(settings, "KMD_API_KEY", "")

        response = requests.get(
            KMD_API_URL
            + f"facility={kmd_last_update_at[facility]['ID']}&dateTimeFrom={today_date}&dateTimeTo={today_date}&authenticationCode={kmd_api_key}",
            headers=headers,
        )

        if response.status_code == 200:
            print("KMD data fetched successfully")
            data = response.json()
            data = data["AccessControlRecords"]["OccasionRecords"]

            # Update the timestamp
            kmd_last_update_at[facility]["last_update"] = time.time()

            if facility in kmd_locations_data:
                kmd_locations_data[facility].clear()

            for item in data:
                EO_booking = datetime.strptime(item["TomKlo"], "%H:%M").time()
                # Get current time adapted to time zone
                tz = pytz.timezone("Europe/Copenhagen")
                current_time = datetime.now(tz).time()

                # Skip any data without facility name and any that's already passed
                if item["FacilityName"] and EO_booking > current_time:
                    item["FacilityName"] = item["FacilityName"].strip()
                    if item["FacilityName"] not in kmd_locations_data:
                        kmd_locations_data[item["FacilityName"]] = []

                    extracted_data = {
                        "FacilityName": item["FacilityName"].strip(),
                        "PartOfObjectName": clean_kmd_displayname(
                            item["PartOfObjectName"]
                        ),
                        "ObjectName": clean_kmd_displayname(item["ObjectName"]),
                        "Activity": item["Activity"],
                        "CustomerName": item["CustomerName"],
                        "FomKlo": item["FomKlo"],
                        "TomKlo": item["TomKlo"],
                    }

                    kmd_locations_data[item["FacilityName"]].append(extracted_data)

            # Sort by start time
            for location in kmd_locations_data:
                kmd_locations_data[location].sort(key=lambda x: x["FomKlo"])

            print("Successfully refetched the KMD data")
            return True
        else:
            message = (
                f"error: Failed to fetch data. status_code: {response.status_code}"
            )
            print(message)
            return False
    except Exception as e:
        print(f"Error fetching KMD data: {e}")
        return False


class KMDDataAPIView(APIView, TokenOrAPIKeyMixin):
    """Get KMD data for a location"""

    permission_classes = [AllowAny]

    def post(self, request):
        # Allow X-API-KEY auth or regular user-based auth for KMD access.
        api_key_value = request.headers.get("X-API-KEY")
        if api_key_value:
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key_value, is_active=True
            ).first()
            if not key_obj:
                return Response({"error": "Invalid or inactive API key."}, status=403)

            org = None
            if key_obj.branch:
                org = key_obj.branch.suborganisation.organisation
            elif getattr(key_obj, "user", None):
                org = get_org_from_user(key_obj.user)

            if (
                not org
                or not OrganisationAPIAccess.objects.filter(
                    organisation=org, api_name="kmd", is_active=True
                ).exists()
            ):
                return Response(
                    {"error": "Your organisation does not have access to KMD API"},
                    status=403,
                )
        else:
            # user-based check
            if not check_api_access(request.user, "kmd"):
                return Response(
                    {"error": "Your organisation does not have access to KMD API"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return Response(
                {"error": "Invalid JSON"}, status=status.HTTP_400_BAD_REQUEST
            )

        location = body.get("location")
        sub_locations = body.get("sub_locations", [])

        if not location:
            return Response(
                {"error": "location is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        if location not in kmd_last_update_at:
            return Response(
                {"error": "Invalid location"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Update every 15 minutes
        if kmd_last_update_at[location]["last_update"] + 15 * 60 < time.time():
            print("Updating KMD data")
            fetch_kmd_data(location)
        else:
            print(
                f"Didn't update data. Will update in {kmd_last_update_at[location]['last_update'] + 15 * 60 - time.time()} seconds"
            )

        if location in kmd_locations_data:
            data_for_location = {"loc_name": location}
            if sub_locations != "all" and len(sub_locations) > 0:
                data_for_location["data"] = []
                data_for_location["is_sub_loc"] = True
                for sub_loc in kmd_locations_data[location]:
                    if (
                        sub_loc["ObjectName"] in sub_locations
                        or sub_loc["PartOfObjectName"] in sub_locations
                    ):
                        data_for_location["data"].append(sub_loc)
            else:
                data_for_location["data"] = kmd_locations_data[location]
                data_for_location["is_sub_loc"] = False
            return Response(data_for_location)
        else:
            return Response(
                {"error": f"No data found for location {location}"},
                status=status.HTTP_404_NOT_FOUND,
            )


class KMDLocationsAPIView(APIView, TokenOrAPIKeyMixin):
    """Get available KMD locations"""

    permission_classes = [AllowAny]

    def get(self, request):
        # Allow X-API-KEY auth or regular user-based auth for KMD access.
        api_key_value = request.headers.get("X-API-KEY")
        if api_key_value:
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key_value, is_active=True
            ).first()
            if not key_obj:
                return Response({"error": "Invalid or inactive API key."}, status=403)

            org = None
            if key_obj.branch:
                org = key_obj.branch.suborganisation.organisation
            elif getattr(key_obj, "user", None):
                org = get_org_from_user(key_obj.user)

            if (
                not org
                or not OrganisationAPIAccess.objects.filter(
                    organisation=org, api_name="kmd", is_active=True
                ).exists()
            ):
                return Response(
                    {"error": "Your organisation does not have access to KMD API"},
                    status=403,
                )
        else:
            # user-based check
            if not check_api_access(request.user, "kmd"):
                return Response(
                    {"error": "Your organisation does not have access to KMD API"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        return Response(kmd_location_names)


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    This view uses our custom serializer to provide token pairs.
    """

    serializer_class = CustomTokenObtainPairSerializer
