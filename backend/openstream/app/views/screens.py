# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
import logging
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from app.models import (
    DisplayWebsite,
    SlideshowPlayerAPIKey,
)
from app.serializers import (
    DisplayWebsiteSerializer,
)

logger = logging.getLogger(__name__)


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

from rest_framework.throttling import SimpleRateThrottle

class ApiKeyRateThrottle(SimpleRateThrottle):
    scope = 'create_screen_key'

    def get_cache_key(self, request, view):
        api_key = request.data.get("apiKey") or request.query_params.get("apiKey")
        if not api_key:
            return None  # Fallback: don't throttle if no API key is provided (though View itself handles this)

        return self.cache_format % {
            'scope': self.scope,
            'ident': api_key
        }

class CreateScreenAPIView(APIView):
    """
    API endpoint for creating a new screen.
    Replaces the create_screen Django view.
    """

    permission_classes = [AllowAny]

    throttle_classes = [ApiKeyRateThrottle]

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
                        existing = DisplayWebsite.objects.get(
                            uid=uid, branch__suborganisation__organisation=org
                        )
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
                    return Response(
                        {
                            "screenId": existing.id,
                            "name": existing.name,
                            "branch_id": branch.id,
                        }
                    )
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
                        existing = DisplayWebsite.objects.get(
                            uid=uid, branch__suborganisation__organisation=org
                        )
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
