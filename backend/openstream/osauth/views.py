# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
import logging
from urllib.parse import urlencode
from django.conf import settings
from django.contrib.auth import get_user_model
from django.shortcuts import redirect
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions
from rest_framework.request import Request
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from osauth.errors import handle_keycloak_error
from osauth.keycloak import KeycloakClient, KeycloakError
from osauth.serializers import TokenResponseSerializer


logger = logging.getLogger(__name__)

User = get_user_model()


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
            client_secret=settings.KEYCLOAK_CLIENT_SECRET,
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
        code = request.GET.get("code")
        if not code:
            raise exceptions.APIException("Missing SSO authorization code")

        org_realm = request.GET.get("org")
        if not org_realm:
            raise exceptions.APIException("Missing org_realm")

        kc_client = KeycloakClient(
            host=settings.KEYCLOAK_HOST,
            port=settings.KEYCLOAK_PORT,
            realm=org_realm,
            client_id=settings.KEYCLOAK_CLIENT_ID,
            client_secret=settings.KEYCLOAK_CLIENT_SECRET,
        )

        # Fetch access- & refresh-token using the authroization code
        token = None
        try:
            token = kc_client.token_from_code(
                code,
                redirect_uri=request.build_absolute_uri(
                    f"/auth/code/?{urlencode({'org': org_realm})}"
                ),
            )
        except KeycloakError as e:
            handle_keycloak_error(e)

        if not token:
            logger.error("Token is None after successful fetch from Keycloak")
            raise exceptions.AuthenticationFailed()

        # Get, or create, django user
        keycloak_user_info = kc_client.user_info(token.access_token)
        email = keycloak_user_info.email
        username = keycloak_user_info.preferred_username

        user, created = User.objects.get_or_create(
            username=username,
            defaults={"email": email},
        )

        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)

        redirect_params = {
            "username": user.username,
            "access": access,
            "refresh": refresh,
        }

        redirect_url = f"{settings.FRONTEND_HOST}/{org_realm}/sign-in-callback?{urlencode(redirect_params)}"
        return redirect(redirect_url)


class SignOutView(APIView):
    def get(self, request: Request):
        org_realm = request.GET.get("org")
        if not org_realm:
            raise exceptions.APIException("Missing org_realm")

        kc_client = KeycloakClient(
            host=settings.KEYCLOAK_HOST,
            port=settings.KEYCLOAK_PORT,
            realm=org_realm,
            client_id=settings.KEYCLOAK_CLIENT_ID,
            client_secret=settings.KEYCLOAK_CLIENT_SECRET,
        )

        return redirect(
            f"{kc_client.url_realm()}/protocol/openid-connect/logout"
        )
