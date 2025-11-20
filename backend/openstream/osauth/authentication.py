# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
import logging
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, get_authorization_header

from osauth.errors import handle_keycloak_error
from osauth.keycloak import KeycloakClient, KeycloakError
from osauth.utils import kc_user_info_2_local_user

logger = logging.getLogger(__name__)


class OSAuthRequired(BaseAuthentication):
    token_type = "Bearer"

    def __init__(self):
        super().__init__()
        self.client = KeycloakClient(
            host=settings.KEYCLOAK_HOST,
            port=settings.KEYCLOAK_PORT,
            realm=settings.KEYCLOAK_REALM,
            client_id=settings.KEYCLOAK_CLIENT_ID,
        )

    def authenticate(self, request):
        auth = get_authorization_header(request).split()
        if not auth or auth[0].lower() != self.token_type.lower().encode():
            return None

        if len(auth) == 1:
            msg = _("Invalid token header. No credentials provided.")
            raise exceptions.AuthenticationFailed(msg)
        elif len(auth) > 2:
            msg = _("Invalid token header. Token string should not contain spaces.")
            raise exceptions.AuthenticationFailed(msg)

        try:
            token = auth[1].decode()
        except UnicodeError:
            msg = _(
                "Invalid token header. Token string should not contain invalid characters."
            )
            raise exceptions.AuthenticationFailed(msg)

        return self.authenticate_credentials(token)

    def authenticate_credentials(self, token):
        try:
            keycloak_user = self.client.user_info(token)
            return (kc_user_info_2_local_user(keycloak_user), None)
        except KeycloakError as e:
            handle_keycloak_error(e)

    def authenticate_header(self, request):
        return self.token_type
