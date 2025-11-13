# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from urllib.parse import urlencode
from uuid import UUID
from http import HTTPStatus
from typing import Any, Optional, List
from django.conf import settings
from pydantic import BaseModel, Field
import requests

# Errors


class KeycloakError(Exception):
    def __init__(
        self,
        status_code: int,
        message: Optional[str] = None,
        data: Optional[Any] = None,
    ):
        self.status_code = status_code
        self.message = message
        self.data = data

        super().__init__(
            self.message
            if self.message
            else "KeycloakError {status_code}: {message}".format(
                status_code=self.status_code,
                message=HTTPStatus(self.status_code).phrase,
            )
        )


# Models


class UserInfo(BaseModel):
    sub: UUID
    preferred_username: str
    email: str
    email_verified: bool

    name: Optional[str] = None
    given_name: Optional[str] = None
    family_name: Optional[str] = None

    realm_access: Optional["RealmAccess"] = None


class RealmAccess(BaseModel):
    roles: List[str]


class TokenResponse(BaseModel):
    token_type: str
    access_token: str
    expires_in: int

    refresh_token: str
    refresh_expires_in: int

    id_token: str
    not_before_policy: int = Field(alias="not-before-policy")
    session_state: str
    scope: str


# Keycloak Client Class


class KeycloakClient:
    def __init__(
        self, host: str, port: str, realm: str, client_id: str, client_secret: str
    ):
        self.host = host
        self.port = port
        self.realm = realm

        self.client_id = client_id
        self.client_secret = client_secret

    def authenticate(self, username: str, password: str) -> TokenResponse:
        resp = requests.post(
            f"{self.url_realm()}/protocol/openid-connect/token",
            headers={
                "Content-Type": f"application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "password",
                "scope": "openid",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "username": username,
                "password": password,
            },
        )

        if resp.status_code != 200:
            raise KeycloakError(resp.status_code, data=resp.json())

        return TokenResponse.model_validate(resp.json())

    def refresh(self, refresh_token: str) -> TokenResponse:
        resp = requests.post(
            f"{self.url_realm()}/protocol/openid-connect/token",
            headers={
                "Content-Type": f"application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "refresh_token",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": refresh_token,
            },
        )

        if resp.status_code != 200:
            raise KeycloakError(resp.status_code, data=resp.json())

        return TokenResponse.model_validate(resp.json())

    def user_info(self, access_token: str) -> UserInfo:
        resp = requests.get(
            f"{self.url_realm()}/protocol/openid-connect/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        if resp.status_code != 200:
            raise KeycloakError(
                resp.status_code, data=resp.json() if resp.content else None
            )

        return UserInfo.model_validate(resp.json())

    def token_from_code(self, code: str, redirect_uri: str):
        resp = requests.post(
            f"{self.url_realm()}/protocol/openid-connect/token",
            headers={
                "Content-Type": f"application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "authorization_code",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )

        if resp.status_code != 200:
            raise KeycloakError(
                resp.status_code, data=resp.json() if resp.content else None
            )

        return TokenResponse.model_validate(resp.json())

    def url(self):
        return "{schema}://{host}{port}".format(
            schema="http" if self.port is not None else "https",
            host=self.host,
            port=f":{self.port}" if self.port else "",
            realm=self.realm,
        )

    def url_realm(self):
        return f"{self.url()}/realms/{self.realm}"

    def url_signout(self, id_token: str, post_logout_redirect_uri: str):
        params = {
            "post_logout_redirect_uri": post_logout_redirect_uri,
            "id_token_hint": id_token,
        }

        return f"{self.url_realm()}/protocol/openid-connect/logout?{urlencode(params)}"


def kc_client_from_settings() -> KeycloakClient:
    return KeycloakClient(
        host=settings.KEYCLOAK_HOST,
        port=settings.KEYCLOAK_PORT,
        realm=settings.KEYCLOAK_REALM,
        client_id=settings.KEYCLOAK_CLIENT_ID,
        client_secret=settings.KEYCLOAK_CLIENT_SECRET,
    )
