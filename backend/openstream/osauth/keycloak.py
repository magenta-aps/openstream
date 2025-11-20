# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from urllib.parse import urlencode
from uuid import UUID
from http import HTTPStatus
from typing import Any, Dict, Optional, List
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

    # Custom keycloak UserInfo-attributes
    org_admin: Optional[str] = None
    suborg_admin: Optional[str] = None
    branch_admin: Optional[str] = None
    employee: Optional[str] = None
    sso_privilege_list: Optional[str] = None


class RealmAccess(BaseModel):
    roles: List[str]


class TokenResponse(BaseModel):
    token_type: str
    access_token: str
    expires_in: int

    refresh_token: str
    refresh_expires_in: int

    id_token: Optional[str] = None
    not_before_policy: int = Field(alias="not-before-policy")
    session_state: str
    scope: str


class UserRepresentationAttrs(BaseModel):
    org_admin: List[str] = []
    suborg_admin: List[str] = []
    branch_admin: List[str] = []
    employee: List[str] = []
    sso_privilege_list: List[str] = []


class UserRepresentation(BaseModel):
    """Ref: https://www.keycloak.org/docs-api/latest/rest-api/index.html#UserRepresentation"""

    id: str | None = None
    username: str
    email: str
    emailVerified: bool
    enabled: bool

    attributes: UserRepresentationAttrs | None = None

    totp: bool | None = None
    disableableCredentialTypes: List[Any] | None = None
    requiredActions: List[Any] | None = None
    notBefore: int | None = None
    access: Dict[str, Any] | None = None
    createdTimestamp: int | None = None


# Keycloak clients


class KeycloakBaseClient:
    def __init__(self, host: str, port: str, realm: str, client_id: str):
        self.host = host
        self.port = port
        self.realm = realm
        self.client_id = client_id

    def url(self):
        return "{schema}://{host}{port}".format(
            schema="http" if self.port is not None else "https",
            host=self.host,
            port=f":{self.port}" if self.port else "",
            realm=self.realm,
        )

    def url_realm(self):
        return f"{self.url()}/realms/{self.realm}"


class KeycloakClient(KeycloakBaseClient):
    def __init__(self, host: str, port: str, realm: str, client_id: str):
        super().__init__(host=host, port=port, realm=realm, client_id=client_id)

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
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )

        if resp.status_code != 200:
            raise KeycloakError(
                resp.status_code, data=resp.json() if resp.content else None
            )

        return TokenResponse.model_validate(resp.json())

    def url_signout(self, id_token: str, post_logout_redirect_uri: str):
        params = {
            "post_logout_redirect_uri": post_logout_redirect_uri,
            "id_token_hint": id_token,
        }

        return f"{self.url_realm()}/protocol/openid-connect/logout?{urlencode(params)}"


class KeycloakAdminClient(KeycloakBaseClient):
    auth_token = None

    def __init__(self, host: str, port: str, client_id: str):
        super().__init__(host=host, port=port, realm="master", client_id=client_id)

    def auth(self, username: str, password: str):
        resp = requests.post(
            f"{self.url()}/realms/{self.realm}/protocol/openid-connect/token",
            headers={
                "Content-Type": f"application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "password",
                "client_id": self.client_id,
                "username": username,
                "password": password,
            },
        )

        if resp.status_code != 200:
            raise KeycloakError(resp.status_code, data=resp.json())

        return TokenResponse.model_validate(resp.json())

    def count_realm_users(self, token: TokenResponse, realm: str):
        resp = requests.get(
            f"{self.url()}/admin/realms/{realm}/users/count",
            headers={"Authorization": f"Bearer {token.access_token}"},
        )

        if resp.status_code != 200:
            raise KeycloakError(
                resp.status_code, data=resp.json() if resp.content else None
            )

        return int(resp.json())

    def list_realm_users(
        self, token: TokenResponse, realm: str, total_count: int | None = None
    ):
        headers = {"Authorization": f"Bearer {token.access_token}"}
        first = 0
        max_fetch = 100

        # only fetch first page if total_count is not defined
        if total_count is None:
            resp = requests.get(
                f"{self.url()}/admin/realms/{realm}/users",
                headers=headers,
                params={"first": first, "max": max_fetch},
            )

            if resp.status_code != 200:
                raise KeycloakError(
                    resp.status_code, data=resp.json() if resp.content else None
                )

            return [UserRepresentation.model_validate(user) for user in resp.json()]

        # Fetch in batches
        users = []
        for first in range(0, total_count, max_fetch):
            resp = requests.get(
                f"{self.url()}/admin/realms/{realm}/users",
                headers=headers,
                params={"first": first, "max": max_fetch},
            )

            if resp.status_code != 200:
                raise KeycloakError(
                    resp.status_code, data=resp.json() if resp.content else None
                )

            batch = resp.json()
            users.extend(UserRepresentation.model_validate(user) for user in batch)

            # Stop early if fewer than max_results users were returned
            if len(batch) < max_fetch:
                break

        return users

    def get_realm_user(self, token: TokenResponse, realm: str, user_id: str):
        resp = requests.get(
            f"{self.url()}/admin/realms/{realm}/users/{user_id}",
            headers={"Authorization": f"Bearer {token.access_token}"},
        )

        if resp.status_code != 200:
            raise KeycloakError(
                resp.status_code, data=resp.json() if resp.content else None
            )

        return UserRepresentation.model_validate(resp.json())

    def create_realm_user(
        self, token: TokenResponse, realm: str, new_user: UserRepresentation
    ):
        resp = requests.post(
            f"{self.url()}/admin/realms/{realm}/users",
            headers={
                "Authorization": f"Bearer {token.access_token}",
                "Content-Type": f"application/json",
            },
            json=new_user.model_dump(),
        )

        if resp.status_code != 201:
            raise KeycloakError(
                resp.status_code, data=resp.json() if resp.content else None
            )

        new_kc_user_id = resp.headers["Location"].rstrip("/").split("/")[-1]
        return new_kc_user_id

    def add_realm_role_to_user(
        self, token: TokenResponse, realm: str, user_id: str, role
    ):
        resp = requests.post(
            f"{self.url()}/admin/realms/{realm}/users/{user_id}/role-mappings/realm",
            headers={
                "Authorization": f"Bearer {token.access_token}",
                "Content-Type": "application/json",
            },
            json=[role],
        )

        if resp.status_code != 204:
            raise KeycloakError(
                resp.status_code, data=resp.json() if resp.content else None
            )

    def get_realm_role(self, token: TokenResponse, realm: str, role_name: str):
        resp = requests.get(
            f"{self.url()}/admin/realms/{realm}/roles/{role_name}",
            headers={"Authorization": f"Bearer {token.access_token}"},
        )

        if resp.status_code != 200:
            raise KeycloakError(
                resp.status_code, data=resp.json() if resp.content else None
            )

        return resp.json()

    def set_realm_user_password(
        self,
        token: TokenResponse,
        realm: str,
        user_id: str,
        new_password: str,
        temporary: bool = True,
    ):
        resp = requests.put(
            f"{self.url()}/admin/realms/{realm}/users/{user_id}/reset-password",
            headers={
                "Authorization": f"Bearer {token.access_token}",
                "Content-Type": "application/json",
            },
            json={
                "type": "password",
                "value": new_password,
                "temporary": temporary,
            },
        )

        if resp.status_code != 204:
            raise KeycloakError(
                resp.status_code, data=resp.json() if resp.content else None
            )

    def update_realm_user(
        self,
        token: TokenResponse,
        realm: str,
        user_id: str,
        updated_user: UserRepresentation,
    ):
        resp = requests.put(
            f"{self.url()}/admin/realms/{realm}/users/{user_id}",
            headers={
                "Authorization": f"Bearer {token.access_token}",
                "Content-Type": "application/json",
            },
            json=updated_user.model_dump(),
        )

        if resp.status_code not in (204, 200):
            raise KeycloakError(
                resp.status_code, data=resp.json() if resp.content else None
            )


def kc_client_from_settings() -> KeycloakClient:
    return KeycloakClient(
        host=settings.KEYCLOAK_HOST,
        port=settings.KEYCLOAK_PORT,
        realm=settings.KEYCLOAK_REALM,
        client_id=settings.KEYCLOAK_CLIENT_ID,
    )


def kc_adm_client_from_settings() -> KeycloakAdminClient:
    return KeycloakAdminClient(
        host=settings.KEYCLOAK_HOST,
        port=settings.KEYCLOAK_PORT,
        client_id="admin-cli",
    )
