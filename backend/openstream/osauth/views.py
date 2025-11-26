# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
import logging
from urllib.parse import urlencode
from django.conf import settings
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404, redirect
from django.utils.translation import gettext_lazy as _
from app.models import Organisation
from rest_framework import exceptions
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from osauth.utils import (
    sync_keycloak_sso_org_memberships,
)
from osauth.models import KeycloakSession
from osauth.errors import handle_keycloak_error
from osauth.keycloak import (
    KeycloakClient,
    KeycloakError,
)
from osauth.serializers import SignOutResponse, TokenResponseSerializer


logger = logging.getLogger(__name__)

User = get_user_model()


def _get_org_helper(request: Request):
    org_realm = request.GET.get("org")
    if not org_realm:
        raise exceptions.APIException("Missing org_realm")
    return get_object_or_404(Organisation, uri_name=org_realm)


class SignInView(APIView):
    def get(self, request: Request):
        org_realm = request.GET.get("org")
        if not org_realm:
            raise exceptions.APIException("Missing org_realm")

        kc_client = KeycloakClient(
            host=settings.KEYCLOAK_HOST,
            port=settings.KEYCLOAK_PORT,
            realm=org_realm,
            client_id=settings.KEYCLOAK_CLIENT_ID,
        )

        params = {
            "client_id": kc_client.client_id,
            "response_type": "code",
            "scope": "openid email profile",
            "redirect_uri": request.build_absolute_uri(
                f"/auth/code/?{urlencode({'org': org_realm})}"
            ),
        }

        return redirect(
            f"{kc_client.url_realm()}/protocol/openid-connect/auth?{urlencode(params)}"
        )


class AuthCodeView(APIView):
    serializer_class = TokenResponseSerializer

    def get(self, request: Request):
        org = _get_org_helper(request)
        code = request.GET.get("code")
        if not code:
            raise exceptions.APIException("Missing SSO authorization code")

        # Fetch access- & refresh-token using the authroization code
        kc_client = KeycloakClient(
            host=settings.KEYCLOAK_HOST,
            port=settings.KEYCLOAK_PORT,
            realm=org.uri_name,
            client_id=settings.KEYCLOAK_CLIENT_ID,
        )

        keycloak_token = None
        try:
            keycloak_token = kc_client.token_from_code(
                code,
                redirect_uri=request.build_absolute_uri(
                    f"/auth/code/?{urlencode({'org': org.uri_name})}"
                ),
            )
        except KeycloakError as e:
            handle_keycloak_error(e)

        if not keycloak_token:
            logger.error("Token is None after successful fetch from Keycloak")
            raise exceptions.AuthenticationFailed()

        # Get, or create, django user
        keycloak_user_info = kc_client.user_info(keycloak_token.access_token)
        user, user_was_created = User.objects.get_or_create(
            username=keycloak_user_info.preferred_username,
            defaults={
                "email": keycloak_user_info.email,
                "first_name": (
                    keycloak_user_info.given_name
                    if keycloak_user_info.given_name
                    else ""
                ),
                "last_name": (
                    keycloak_user_info.family_name
                    if keycloak_user_info.family_name
                    else ""
                ),
            },
        )

        # Handle Keycloak SSO OrganisationMemberships, if specified
        if keycloak_user_info.sso_privilege_list:
            sync_keycloak_sso_org_memberships(org, keycloak_user_info)

        # Generate django-rest-framework tokens
        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)

        # Cleanup user keycloak sessions & create a new one
        KeycloakSession.objects.filter(user=user).delete()
        db_keycloak_session = KeycloakSession.objects.create(
            user=user,
            access_token=keycloak_token.access_token,
            refresh_token=keycloak_token.refresh_token,
            id_token=keycloak_token.id_token,
        )

        # Redirect back to the frontend
        redirect_params = {
            "username": user.username,
            "access": access,
            "refresh": refresh,
        }
        redirect_url = f"{settings.FRONTEND_HOST}/{org.uri_name}/sign-in-callback?{urlencode(redirect_params)}"
        return redirect(redirect_url)


class SignOutAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        org = _get_org_helper(request)

        # Fetch auth-session "id_token" from DB
        db_keycloak_session = KeycloakSession.objects.get(user=request.user)
        if not db_keycloak_session:
            raise exceptions.ValidationError("No login session for user")

        # Generate signout redirect URL for user
        kc_client = KeycloakClient(
            host=settings.KEYCLOAK_HOST,
            port=settings.KEYCLOAK_PORT,
            realm=org.uri_name,
            client_id=settings.KEYCLOAK_CLIENT_ID,
        )

        serializer = SignOutResponse(
            instance={
                "redirect_url": kc_client.url_signout(
                    db_keycloak_session.id_token,
                    f"{settings.FRONTEND_HOST}/{kc_client.realm}/sign-in",
                ),
            },
            context={"request": request},
        )

        return Response(serializer.data, status=200)
