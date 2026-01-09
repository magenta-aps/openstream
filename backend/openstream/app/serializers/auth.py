# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
"""Authentication serializers."""

from django.contrib.auth.models import User
from django.core.exceptions import ObjectDoesNotExist
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Allow authentication using either username or email."""

    @classmethod
    def get_token(cls, user):
        return super().get_token(user)

    def validate(self, attrs):
        identifier = attrs.get(self.username_field)

        try:
            user = User.objects.get(email=identifier)
            attrs[self.username_field] = user.get_username()
        except ObjectDoesNotExist:
            pass
        except User.MultipleObjectsReturned:
            pass

        return super().validate(attrs)
