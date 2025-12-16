# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from rest_framework import serializers

from osauth.models import KeycloakSession


class TokenResponseSerializer(serializers.Serializer):
    token_type = serializers.CharField()
    access_token = serializers.CharField()
    expires_in = serializers.IntegerField()

    refresh_token = serializers.CharField()
    refresh_expires_in = serializers.IntegerField()

    id_token = serializers.CharField()
    not_before_policy = serializers.IntegerField()
    session_state = serializers.CharField()
    scope = serializers.CharField()


class SignOutResponseSerializer(serializers.Serializer):
    redirect_url = serializers.CharField()
