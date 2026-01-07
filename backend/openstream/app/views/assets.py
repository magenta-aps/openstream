# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
import logging
import secrets
import os
from urllib.parse import urljoin
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from app.models import (
    Branch,
    DisplayWebsite,
    SlideshowPlayerAPIKey,
    Category,
    Tag,
    BranchURLCollectionItem,
    CustomColor,
    CustomFont,
    TextFormattingSettings,
    RegisteredSlideTypes,
)
from app.serializers import (
    CategorySerializer,
    TagSerializer,
    BranchURLCollectionItemSerializer,
    CustomColorSerializer,
    CustomFontSerializer,
    TextFormattingSettingsSerializer,
    RegisteredSlideTypesSerializer,
)
from django.conf import settings

logger = logging.getLogger(__name__)

from app.permissions import (
    get_branch_from_request,
    handle_branch_request,
    user_is_super_admin,
    user_is_admin_in_org,
    get_organisation_from_identifier,
    user_belongs_to_organisation,
)


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
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        # Replace string organisation_id with integer PK for serializer
        data["organisation_id"] = organisation.id
        serializer = CategorySerializer(data=data)
        if serializer.is_valid():
            # Organisation will be set via the serializer's organisation_id field
            new_category = serializer.save()
            return Response(CategorySerializer(new_category).data, status=201)
        return Response(serializer.errors, status=400)

    def put(self, request, pk):
        """
            Fully update a category. Only org_admin or super_admin users can do this.
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        # Replace string organisation_id with integer PK for serializer
        data["organisation_id"] = organisation.id
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
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        # Replace string organisation_id with integer PK for serializer
        data["organisation_id"] = organisation.id
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
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        # Replace string organisation_id with integer PK for serializer
        data["organisation_id"] = organisation.id
        serializer = TagSerializer(data=data)
        if serializer.is_valid():
            # Organisation will be set via the serializer's organisation_id field
            new_tag = serializer.save()
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
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        data = request.data.copy()
        # Replace string organisation_id with integer PK for serializer
        data["organisation_id"] = organisation.id
        serializer = TagSerializer(tag, data=data, partial=True)
        if serializer.is_valid():
            updated_tag = serializer.save()
            return Response(TagSerializer(updated_tag).data, status=200)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        """
        Delete a tag. Only org_admin or super_admin users can do this.
        Requires ?organisation_id=<ORG_ID> parameter.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
            return Response(
                {"detail": "Organization not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not (
            user_is_super_admin(request.user)
            or user_belongs_to_organisation(request.user, organisation)
        ):
            return Response(
                {"detail": "You don't have access to this organization."},
                status=status.HTTP_403_FORBIDDEN,
            )

        search_query = request.query_params.get("search_query", "")
        tags = Tag.objects.filter(
            organisation=organisation, name__icontains=search_query
        ).order_by("name")[:10]
        serializer = TagSerializer(tags, many=True)
        return Response(serializer.data, status=200)


class BranchURLCollectionItemAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @handle_branch_request
    def get(self, request, branch, pk=None):
        """
        GET without pk: Returns list of URL collection items for the authenticated branch.
        GET with pk: Returns a specific URL collection item.
        """
        if pk:
            item = get_object_or_404(BranchURLCollectionItem, pk=pk, branch=branch)
            serializer = BranchURLCollectionItemSerializer(item)
        else:
            items = BranchURLCollectionItem.objects.filter(branch=branch)
            serializer = BranchURLCollectionItemSerializer(items, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @handle_branch_request
    def post(self, request, branch):
        """
        Create a new BranchURLCollectionItem for the authenticated branch.
        """
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

    @handle_branch_request
    def patch(self, request, branch, pk):
        """
        Partially update an existing BranchURLCollectionItem.
        """
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

    @handle_branch_request
    def delete(self, request, branch, pk):
        """
                Delete an existing BOg han arbejde videre på noget i går med det så tror Heini selv arbejder på at få sat det op nu, når han laver OpenStream opgaver altså
        ranchURLCollectionItem.
        """
        item = get_object_or_404(BranchURLCollectionItem, pk=pk, branch=branch)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CustomColorAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Retrieves custom colors for the specified organization.
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        colors = CustomColor.objects.filter(organisation=organisation).order_by(
            "position", "name"
        )
        serializer = CustomColorSerializer(colors, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        """
            Create a new custom color.
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
            Only organization admins or super admins can create colors.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
            Only organization admins or super admins can update colors.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
            Only organization admins or super admins can delete colors.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
        Optional: Provide pk to get a specific font.
        """
        org_identifier = request.query_params.get("organisation_id")
        dw = None
        # If no organisation_id provided, try to infer it from a display website id
        # Support common param names used across the app: 'displayWebsiteId', 'display_website_id', or 'id'
        if not org_identifier:
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
        else:
            organisation = get_organisation_from_identifier(org_identifier)
            if not organisation:
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

                if key_org.id != organisation.id:
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
            custom_fonts = CustomFont.objects.filter(
                organisation=organisation
            ).order_by("position", "name")
            serializer = CustomFontSerializer(custom_fonts, many=True)
            return Response(serializer.data)

    def post(self, request):
        """
            Create a new custom font.
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
            Only organization admins or super admins can create fonts.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
        saved_path = None

        if uploaded_file:
            # Validate extension
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
                if getattr(settings, "MEDIA_URL", "").startswith("http"):
                    font_url = urljoin(settings.MEDIA_URL, saved_path)
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

        # Build serializer (covers both uploaded and URL-only flows)
        serializer = CustomFontSerializer(
            data=data, context={"organisation": organisation}
        )
        if serializer.is_valid():
            serializer.save(organisation=organisation)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        # If serializer invalid and we saved a file, attempt to clean up the saved file
        if uploaded_file and saved_path:
            try:
                default_storage.delete(saved_path)
            except Exception:
                pass

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        """
            Partially update a custom font.
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
            Only organization admins or super admins can update fonts.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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
                if getattr(settings, "MEDIA_URL", "").startswith("http"):
                    font_url = urljoin(settings.MEDIA_URL, saved_path)
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
        Requires ?organisation_id=<ORG_IDENTIFIER> parameter.
            Only organization admins or super admins can delete fonts.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
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


class TextFormattingSettingsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _get_organisation_from_request(request):
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return None, Response(
                {"detail": "organisation_id parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = get_organisation_from_identifier(org_identifier)
        if not organisation:
            return None, Response(
                {"detail": "Organization not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return organisation, None

    def get(self, request):
        organisation, error_response = self._get_organisation_from_request(request)
        if error_response:
            return error_response

        if not (
            user_is_super_admin(request.user)
            or user_belongs_to_organisation(request.user, organisation)
        ):
            return Response(
                {"detail": "You don't have permission to access this organization."},
                status=status.HTTP_403_FORBIDDEN,
            )

        settings_obj, _ = TextFormattingSettings.objects.get_or_create(
            organisation=organisation
        )
        serializer = TextFormattingSettingsSerializer(settings_obj)
        return Response(serializer.data)

    def patch(self, request):
        organisation, error_response = self._get_organisation_from_request(request)
        if error_response:
            return error_response

        if not (
            user_is_super_admin(request.user)
            or user_is_admin_in_org(request.user, organisation)
        ):
            return Response(
                {
                    "detail": "You must be an organization admin to modify toolbar options."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        settings_obj, _ = TextFormattingSettings.objects.get_or_create(
            organisation=organisation
        )
        serializer = TextFormattingSettingsSerializer(
            settings_obj, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class RegisteredSlideTypesAPIView(APIView):
    """
    API view for fetching registered slide types for an organisation.
    - GET: Returns a list of registered slide types for the specified organisation

        Query params (for user authentication):
            - org_id (required): The organisation identifier (numeric id or organisation URI name) to fetch slide types for

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
            org_identifier = request.query_params.get("org_id")
            if not org_identifier:
                return Response(
                    {"error": "org_id parameter is required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            organisation = get_organisation_from_identifier(org_identifier)
            if not organisation:
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
