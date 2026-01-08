# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
"""Serializers for user accounts and memberships."""

from django.contrib.auth.hashers import check_password
from django.contrib.auth.models import User
from rest_framework import serializers

from app.models import OrganisationMembership, SubOrganisation, UserExtended

from .organisation import BranchSerializer


class OrganisationMembershipSerializer(serializers.ModelSerializer):
    """Expose organisation membership hierarchy fields."""

    class Meta:
        model = OrganisationMembership
        fields = ["id", "user", "organisation", "suborganisation", "branch", "role"]
        read_only_fields = ["id"]


class UserMembershipDetailSerializer(serializers.ModelSerializer):
    """Organisation membership with human-readable names."""

    organisation_name = serializers.SerializerMethodField()
    suborganisation_name = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()

    class Meta:
        model = OrganisationMembership
        fields = [
            "id",
            "role",
            "organisation",
            "suborganisation",
            "branch",
            "organisation_name",
            "suborganisation_name",
            "branch_name",
        ]

    def get_organisation_name(self, obj):
        return obj.organisation.name if obj.organisation else None

    def get_suborganisation_name(self, obj):
        return obj.suborganisation.name if obj.suborganisation else None

    def get_branch_name(self, obj):
        return obj.branch.name if obj.branch else None


class SubOrganisationWithRoleSerializer(serializers.ModelSerializer):
    user_role = serializers.SerializerMethodField()
    organisation_name = serializers.SerializerMethodField()
    organisation_uri_name = serializers.SerializerMethodField()
    branches = serializers.SerializerMethodField()

    class Meta:
        model = SubOrganisation
        fields = [
            "id",
            "name",
            "organisation",
            "organisation_name",
            "organisation_uri_name",
            "user_role",
            "branches",
        ]

    def get_user_role(self, suborg):
        org_admin_org_ids = self.context.get("org_admin_org_ids", set())
        suborg_roles = self.context.get("suborg_roles", {})
        if suborg.organisation_id in org_admin_org_ids:
            return "org_admin"
        return suborg_roles.get(suborg.id)

    def get_organisation_name(self, suborg):
        return suborg.organisation.name

    def get_organisation_uri_name(self, suborg):
        return suborg.organisation.uri_name

    def get_branches(self, suborg):
        request = self.context.get("request")
        if not request:
            branches = suborg.branches.all()
        else:
            user_role = self.get_user_role(suborg)
            if user_role in ["org_admin", "suborg_admin"]:
                branches = suborg.branches.all()
            else:
                branches = suborg.branches.filter(memberships__user=request.user)
        return BranchSerializer(branches, many=True, context=self.context).data


class UserSerializer(serializers.ModelSerializer):
    """Basic user info (omits password)."""

    class Meta:
        model = User
        fields = ["id", "username", "email"]


class CreateUserSerializer(serializers.ModelSerializer):
    """Create a user and set password."""

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]
        extra_kwargs = {"password": {"write_only": True}}

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email"),
            password=validated_data["password"],
        )
        return user


class UpdateUserSerializer(serializers.ModelSerializer):
    """Update Django User and UserExtended fields in one go."""

    username = serializers.CharField(source="user.username")
    email = serializers.EmailField(source="user.email")
    first_name = serializers.CharField(source="user.first_name")
    last_name = serializers.CharField(source="user.last_name")

    class Meta:
        model = UserExtended
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "language_preference",
        ]

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        language_preference = validated_data.get(
            "language_preference", instance.language_preference
        )
        instance.update_user_info(user_data, language_preference)
        return instance


class ChangePasswordSerializer(serializers.Serializer):
    """Change the authenticated user's password."""

    old_password = serializers.CharField(write_only=True, required=True)
    new_password = serializers.CharField(write_only=True, required=True)
    confirm_password = serializers.CharField(write_only=True, required=True)

    def validate(self, data):
        user = self.context["request"].user
        if not check_password(data["old_password"], user.password):
            raise serializers.ValidationError(
                {"old_password": "Old password is incorrect."}
            )
        if data["new_password"] != data["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "New passwords do not match."}
            )
        return data

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save()
        return user


class ShowUsernameAndEmailSerializer(serializers.ModelSerializer):
    """Read-only username + email."""

    username = serializers.CharField(source="username", read_only=True)
    email = serializers.EmailField(source="email", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email"]
        read_only_fields = ("username", "email")

    def to_representation(self, user_obj):
        if user_obj.id:
            return {"username": user_obj.username, "email": user_obj.email}


class ShowAllUserInfoSerializer(ShowUsernameAndEmailSerializer):
    """Extended read-only view with names and language preference."""

    username = serializers.CharField(source="user.username", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    language_preference = serializers.CharField(
        source="language_preference", read_only=True
    )

    class Meta:
        model = UserExtended
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "language_preference",
        ]
        read_only_fields = (
            "username",
            "first_name",
            "last_name",
            "email",
            "language_preference",
        )

    def to_representation(self, user_obj):
        if user_obj.id:
            return {
                "id": user_obj.id,
                "username": user_obj.user.username,
                "first_name": user_obj.user.first_name,
                "last_name": user_obj.user.last_name,
                "email": user_obj.user.email,
                "language_preference": user_obj.language_preference,
            }
