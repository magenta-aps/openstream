# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
import logging
from django.core.paginator import Paginator
from django.contrib.admin.models import LogEntry
from django.contrib.contenttypes.models import ContentType
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from app.models import (
    GlobalSlideTemplate,
    SlideTemplate,
    Slideshow,
    SlideshowPlaylist,
    SlideshowPlaylistItem,
    SubOrganisation,
    Wayfinding,
)
from app.serializers import (
    GlobalSlideTemplateSerializer,
    SlideTemplateSerializer,
    SlideshowSerializer,
    SlideshowPlaylistSerializer,
    SlideshowPlaylistItemSerializer,
    WayfindingSerializer,
)

logger = logging.getLogger(__name__)

from app.permissions import (
    get_branch_from_request,
    get_organisation_from_identifier,
    user_belongs_to_organisation,
    user_can_access_branch,
    handle_branch_request,
    HasBranchAPIKeyOrCanAccessBranch,
    user_can_manage_suborg,
    user_is_admin_in_org,
    user_is_super_admin,
)

from rest_framework import status


class SlideshowCRUDView(APIView):
    permission_classes = [IsAuthenticated]

    @handle_branch_request
    def get(self, request, branch):
        """
        Retrieve 1 or more manage_content for a given branch_id.
        Use ?id=<slideshow_id> to fetch a single slideshow.
        Set ?includeSlideshowData=false to exclude the JSON data.
        """

        slideshow_id = request.query_params.get("id")
        include_data = (
            request.query_params.get("includeSlideshowData", "true").lower() == "true"
        )

        context = {"include_slideshow_data": include_data}

        if slideshow_id:
            ss = get_object_or_404(Slideshow, pk=slideshow_id, branch=branch)
            ser = SlideshowSerializer(ss, context=context)
            return Response(ser.data)
        else:
            slideshows = Slideshow.objects.filter(branch=branch)
            emergency_filter = request.query_params.get("is_emergency_slideshow")
            if emergency_filter is not None:
                emergency_flag = emergency_filter.lower() in ("1", "true", "yes", "on")
                slideshows = slideshows.filter(is_emergency_slideshow=emergency_flag)
            ser = SlideshowSerializer(slideshows, many=True, context=context)
            return Response(ser.data)

    @handle_branch_request
    def post(self, request, branch):
        tags = request.data.get("tags")
        if tags:
            request.data["tag_ids"] = [
                tag["id"] if isinstance(tag, dict) else tag for tag in tags
            ]
        serializer = SlideshowSerializer(data=request.data)
        if serializer.is_valid():
            slideshow = serializer.save(branch=branch, created_by=request.user)
            return Response(SlideshowSerializer(slideshow).data, status=201)
        return Response(serializer.errors, status=400)

    @handle_branch_request
    def patch(self, request, branch, pk):
        slideshow = get_object_or_404(Slideshow, pk=pk, branch=branch)
        serializer = SlideshowSerializer(slideshow, data=request.data, partial=True)
        if serializer.is_valid():
            updated = serializer.save()
            return Response(SlideshowSerializer(updated).data)
        return Response(serializer.errors, status=400)

    @handle_branch_request
    def delete(self, request, branch, pk):
        slideshow = get_object_or_404(Slideshow, pk=pk, branch=branch)
        slideshow.delete()
        return Response(status=204)


class SlideshowPlaylistAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @handle_branch_request
    def get(self, request, branch):

        playlist_id = request.query_params.get("id")
        include_slides = (
            request.query_params.get("includeSlides", "false").lower() == "true"
        )
        context = {"include_slides": include_slides}

        if playlist_id:
            sp = get_object_or_404(SlideshowPlaylist, pk=playlist_id, branch=branch)
            ser = SlideshowPlaylistSerializer(sp, context=context)
            return Response(ser.data)
        else:
            playlists = SlideshowPlaylist.objects.filter(branch=branch)
            ser = SlideshowPlaylistSerializer(playlists, many=True, context=context)
            return Response(ser.data)

    @handle_branch_request
    def post(self, request, branch):
        serializer = SlideshowPlaylistSerializer(data=request.data)
        if serializer.is_valid():
            sp = serializer.save(branch=branch, created_by=request.user)
            return Response(SlideshowPlaylistSerializer(sp).data, status=201)
        return Response(serializer.errors, status=400)

    @handle_branch_request
    def put(self, request, branch, pk):
        sp = get_object_or_404(SlideshowPlaylist, pk=pk, branch=branch)
        serializer = SlideshowPlaylistSerializer(sp, data=request.data)
        if serializer.is_valid():
            updated = serializer.save()
            return Response(SlideshowPlaylistSerializer(updated).data)
        return Response(serializer.errors, status=400)

    @handle_branch_request
    def delete(self, request, branch, pk):
        sp = get_object_or_404(SlideshowPlaylist, pk=pk, branch=branch)
        sp.delete()
        return Response(status=204)


class SlideshowPlaylistItemAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Retrieve items from a specific playlist by ?playlist_id=...
        """
        playlist_id = request.query_params.get("playlist_id")
        if not playlist_id:
            return Response({"detail": "playlist_id is required."}, status=400)

        items = SlideshowPlaylistItem.objects.filter(slideshow_playlist_id=playlist_id)
        if not items.exists():
            return Response([], status=200)

        # Check that user can access the underlying branch
        branch = items.first().slideshow_playlist.branch
        if not user_can_access_branch(request.user, branch):
            return Response(
                {"detail": "Not allowed to view this playlist."}, status=403
            )

        ser = SlideshowPlaylistItemSerializer(items, many=True)
        return Response(ser.data)

    def post(self, request):
        """
        Create a SlideshowPlaylistItem => must ensure slideshow + playlist belong to same branch
        and user can access that branch.
        """
        ser = SlideshowPlaylistItemSerializer(data=request.data)
        if ser.is_valid():
            sp = ser.validated_data["slideshow_playlist"]
            ss = ser.validated_data["slideshow"]
            if sp.branch != ss.branch:
                return Response(
                    {"detail": "Slideshow and playlist must be in the same branch."},
                    status=400,
                )
            if not user_can_access_branch(request.user, sp.branch):
                return Response(
                    {"detail": "Not allowed to modify this branch content."}, status=403
                )

            item = ser.save()
            return Response(SlideshowPlaylistItemSerializer(item).data, status=201)
        return Response(ser.errors, status=400)

    def put(self, request, pk):
        item = get_object_or_404(SlideshowPlaylistItem, pk=pk)
        # Must ensure user can access the item’s branch
        branch = item.slideshow_playlist.branch
        if not user_can_access_branch(request.user, branch):
            return Response({"detail": "Not allowed."}, status=403)

        ser = SlideshowPlaylistItemSerializer(item, data=request.data)
        if ser.is_valid():
            new_sp = ser.validated_data.get(
                "slideshow_playlist", item.slideshow_playlist
            )
            new_ss = ser.validated_data.get("slideshow", item.slideshow)
            if new_sp.branch != new_ss.branch:
                return Response(
                    {"detail": "Slideshow and playlist must be in the same branch."},
                    status=400,
                )
            if not user_can_access_branch(request.user, new_sp.branch):
                return Response({"detail": "Not allowed."}, status=403)

            updated = ser.save()
            return Response(SlideshowPlaylistItemSerializer(updated).data)
        return Response(ser.errors, status=400)

    def patch(self, request, pk):
        item = get_object_or_404(SlideshowPlaylistItem, pk=pk)
        branch = item.slideshow_playlist.branch
        if not user_can_access_branch(request.user, branch):
            return Response({"detail": "Not allowed."}, status=403)

        ser = SlideshowPlaylistItemSerializer(item, data=request.data, partial=True)
        if ser.is_valid():
            new_sp = ser.validated_data.get(
                "slideshow_playlist", item.slideshow_playlist
            )
            new_ss = ser.validated_data.get("slideshow", item.slideshow)
            if new_sp.branch != new_ss.branch:
                return Response(
                    {"detail": "Slideshow and playlist must be in the same branch."},
                    status=400,
                )
            if not user_can_access_branch(request.user, new_sp.branch):
                return Response({"detail": "Not allowed."}, status=403)

            updated = ser.save()
            return Response(SlideshowPlaylistItemSerializer(updated).data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        item = get_object_or_404(SlideshowPlaylistItem, pk=pk)
        branch = item.slideshow_playlist.branch
        if not user_can_access_branch(request.user, branch):
            return Response({"detail": "Not allowed."}, status=403)
        item.delete()
        return Response(status=204)


class LatestEditedSlideshowsAPIView(APIView):
    """Return slideshows for a branch ordered by their latest slide.updated_at (descending).

    Query params:
      - branch_id (required)
      - page (optional, default=1)

    Returns paginated JSON with 20 items per page.
    """

    permission_classes = [IsAuthenticated]

    @handle_branch_request
    def get(self, request, branch):
        try:
            page = int(request.query_params.get("page", 1))
        except ValueError:
            page = 1

        page_size = 20

        # Annotate slideshows with the most recent 'updated_at' from their slides
        # Use the Slideshow.updated_at field (set via auto_now) for last-edited.
        qs = Slideshow.objects.filter(branch=branch).order_by("-updated_at", "-id")

        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        # Build lightweight result set for dashboard (id, name, last_edited)
        results = []
        for ss in page_obj.object_list:
            # Prefer the durable model field `updated_at` (auto_now) as the last edited timestamp.
            last = getattr(ss, "updated_at", None) or getattr(ss, "last_edited", None)
            # If model field isn't available for some reason, try admin LogEntry as a fallback
            if not last:
                try:
                    ct = ContentType.objects.get_for_model(Slideshow)
                    le = (
                        LogEntry.objects.filter(content_type=ct, object_id=ss.id)
                        .order_by("-action_time")
                        .first()
                    )
                    if le:
                        last = le.action_time
                except Exception:
                    last = None
            results.append(
                {
                    "id": ss.id,
                    "name": ss.name,
                    "last_edited": last.isoformat() if last else None,
                }
            )

        data = {
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_obj.number,
            "items_per_page": paginator.per_page,
            "next": page_obj.next_page_number() if page_obj.has_next() else None,
            "previous": (
                page_obj.previous_page_number() if page_obj.has_previous() else None
            ),
            "results": results,
        }

        return Response(data)


class LatestEditedPlaylistsAPIView(APIView):
    """Return playlists for a branch ordered by the most recent update of slides
    referenced by items in the playlist (descending).

    Query params:
      - branch_id (required)
      - page (optional, default=1)

    Returns paginated JSON with 20 items per page.
    """

    permission_classes = [IsAuthenticated]

    @handle_branch_request
    def get(self, request, branch):
        try:
            page = int(request.query_params.get("page", 1))
        except ValueError:
            page = 1

        page_size = 20

        qs = SlideshowPlaylist.objects.filter(branch=branch).order_by(
            "-updated_at", "-id"
        )

        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        results = []
        for pl in page_obj.object_list:
            # Prefer the durable model field `updated_at` (auto_now) as the last edited timestamp.
            last = getattr(pl, "updated_at", None) or getattr(pl, "last_edited", None)
            # Fallback to admin LogEntry if necessary
            if not last:
                try:
                    ct = ContentType.objects.get_for_model(SlideshowPlaylist)
                    le = (
                        LogEntry.objects.filter(content_type=ct, object_id=pl.id)
                        .order_by("-action_time")
                        .first()
                    )
                    if le:
                        last = le.action_time
                except Exception:
                    last = None
            results.append(
                {
                    "id": pl.id,
                    "name": pl.name,
                    "last_edited": last.isoformat() if last else None,
                }
            )

        data = {
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_obj.number,
            "items_per_page": paginator.per_page,
            "next": page_obj.next_page_number() if page_obj.has_next() else None,
            "previous": (
                page_obj.previous_page_number() if page_obj.has_previous() else None
            ),
            "results": results,
        }

        return Response(data)


class WayfindingCRUDView(APIView):
    permission_classes = [HasBranchAPIKeyOrCanAccessBranch]

    def get(self, request, pk=None):
        """
        Retrieve 1 or more wayfinding objects for a given branch_id.
        Use pk in URL or ?id=<wayfinding_id> to fetch a single wayfinding object.
        Set ?includeWayfindingData=false to exclude the JSON data.

        Authentication: Supports both user authentication and X-API-KEY header.
        """
        # Check for ID in URL path first, then query parameter
        wayfinding_id = pk or request.query_params.get("id")
        include_data = (
            request.query_params.get("includeWayfindingData", "true").lower() == "true"
        )

        # Get branch - permission class has already validated access
        if hasattr(request, "api_key_obj"):
            branch = request.api_key_obj.branch
            requested_branch_id = request.query_params.get("branch_id")
            if requested_branch_id and str(branch.id) != str(requested_branch_id):
                return Response(
                    {"detail": "API key not valid for this branch."},
                    status=403,
                )
            context = {"include_wayfinding_data": include_data}
        else:
            try:
                branch = get_branch_from_request(request)
            except ValueError as e:
                return Response({"detail": str(e)}, status=403)

            context = {"include_wayfinding_data": include_data}

        if wayfinding_id:
            wayfinding = get_object_or_404(Wayfinding, pk=wayfinding_id, branch=branch)
            ser = WayfindingSerializer(wayfinding, context=context)
            return Response(ser.data)
        else:
            wayfinding_objects = Wayfinding.objects.filter(branch=branch)
            ser = WayfindingSerializer(wayfinding_objects, many=True, context=context)
            return Response(ser.data)

    @handle_branch_request
    def post(self, request, branch):
        if not request.user or not request.user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=401)

        serializer = WayfindingSerializer(data=request.data)
        if serializer.is_valid():
            wayfinding = serializer.save(branch=branch, created_by=request.user)
            return Response(WayfindingSerializer(wayfinding).data, status=201)
        return Response(serializer.errors, status=400)

    @handle_branch_request
    def patch(self, request, branch, pk):
        if not request.user or not request.user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=401)

        wayfinding = get_object_or_404(Wayfinding, pk=pk, branch=branch)
        serializer = WayfindingSerializer(wayfinding, data=request.data, partial=True)
        if serializer.is_valid():
            updated = serializer.save()
            return Response(WayfindingSerializer(updated).data)
        return Response(serializer.errors, status=400)

    @handle_branch_request
    def delete(self, request, branch, pk):
        # Only authenticated users (not API keys) can delete
        if hasattr(request, "api_key_obj"):
            return Response(
                {"detail": "API keys cannot delete wayfinding."}, status=403
            )

        wayfinding = get_object_or_404(Wayfinding, pk=pk, branch=branch)
        wayfinding.delete()
        return Response(status=204)


class SlideTemplateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        """
            - If pk is provided, return that template detail (check membership).
        - Otherwise, expect ?organisation_id=... (id or name) to list all templates of that org (global templates only).
        """
        if pk:
            template = get_object_or_404(SlideTemplate, pk=pk)
            if not user_belongs_to_organisation(request.user, template.organisation):
                return Response(
                    {"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN
                )
            serializer = SlideTemplateSerializer(template)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # List - only global templates (no suborganisation)
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id query param is required."}, status=400
            )

        org = get_organisation_from_identifier(org_identifier)
        if not org:
            return Response({"detail": "Organization not found."}, status=404)
        if not user_belongs_to_organisation(request.user, org):
            return Response({"detail": "Not allowed."}, status=403)

        templates = SlideTemplate.objects.filter(
            organisation=org, suborganisation__isnull=True
        ).order_by("slide_data__id")
        serializer = SlideTemplateSerializer(templates, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        """
            Creates a new SlideTemplate.
        Expects ?organisation_id=... (id or name)
            The rest of the JSON (name, slide_data, category_id, tag_ids) is in the request body.
        """
        org_identifier = request.query_params.get("organisation_id")
        if not org_identifier:
            return Response(
                {"detail": "organisation_id query param is required."}, status=400
            )

        org = get_organisation_from_identifier(org_identifier)
        if not org:
            return Response({"detail": "Organization not found."}, status=404)
        if not user_is_admin_in_org(request.user, org):
            return Response({"detail": "Not allowed."}, status=403)

        # Clone the request data so we can inject the 'organisation' field
        data = request.data.copy()
        # The serializer expects 'organisation_id' or 'organisation' to be set
        data["organisation_id"] = org.id

        serializer = SlideTemplateSerializer(data=data)
        if serializer.is_valid():
            template = serializer.save()
            return Response(
                SlideTemplateSerializer(template).data, status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        """
        Partially update an existing SlideTemplate.
        Must ensure user is part of that template’s organisation.
        """
        template = get_object_or_404(SlideTemplate, pk=pk)
        if not user_is_admin_in_org(request.user, template.organisation):
            return Response({"detail": "Not allowed."}, status=403)

        # We typically disallow changing organisation on PATCH
        data = request.data.copy()
        data.pop("organisation_id", None)  # ignore if present

        serializer = SlideTemplateSerializer(template, data=data, partial=True)
        if serializer.is_valid():
            updated = serializer.save()
            return Response(SlideTemplateSerializer(updated).data, status=200)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        """
        Deletes a SlideTemplate by its primary key (pk).
        """
        template = get_object_or_404(SlideTemplate, pk=pk)

        # Ensure the user is an admin in the template's organisation
        if not user_is_admin_in_org(request.user, template.organisation):
            return Response(
                {"detail": "Not authorized to delete this template."},
                status=status.HTTP_403_FORBIDDEN,
            )

        template.delete()
        return Response(
            {"detail": "Template deleted successfully."},
            status=status.HTTP_204_NO_CONTENT,
        )


class GlobalSlideTemplateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if pk:
            template = get_object_or_404(GlobalSlideTemplate, pk=pk)
            serializer = GlobalSlideTemplateSerializer(
                template, context={"request": request}
            )
            return Response(serializer.data, status=status.HTTP_200_OK)

        templates = GlobalSlideTemplate.objects.all().order_by("name")
        serializer = GlobalSlideTemplateSerializer(
            templates, many=True, context={"request": request}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        if not user_is_super_admin(request.user):
            return Response(
                {"detail": "Only super admins can manage global templates."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = GlobalSlideTemplateSerializer(
            data=request.data, context={"request": request}
        )
        if serializer.is_valid():
            template = serializer.save()
            return Response(
                GlobalSlideTemplateSerializer(
                    template, context={"request": request}
                ).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        if not user_is_super_admin(request.user):
            return Response(
                {"detail": "Only super admins can manage global templates."},
                status=status.HTTP_403_FORBIDDEN,
            )

        template = get_object_or_404(GlobalSlideTemplate, pk=pk)
        serializer = GlobalSlideTemplateSerializer(
            template,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        if serializer.is_valid():
            updated = serializer.save()
            return Response(
                GlobalSlideTemplateSerializer(
                    updated, context={"request": request}
                ).data,
                status=status.HTTP_200_OK,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        if not user_is_super_admin(request.user):
            return Response(
                {"detail": "Only super admins can manage global templates."},
                status=status.HTTP_403_FORBIDDEN,
            )

        template = get_object_or_404(GlobalSlideTemplate, pk=pk)
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GlobalSlideTemplatePermissionAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"can_manage": user_is_super_admin(request.user)})


class SuborgTemplateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        """
        GET /api/suborg-templates/?suborg_id=<id> - List all templates available for a suborg
          (includes global templates and suborg-specific templates)
        GET /api/suborg-templates/<pk>/ - Get details of a specific template
        """
        if pk:
            template = get_object_or_404(SlideTemplate, pk=pk)
            # Check if user can access this template
            if template.suborganisation:
                if not user_can_manage_suborg(request.user, template.suborganisation):
                    return Response(
                        {"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN
                    )
            else:
                if not user_belongs_to_organisation(
                    request.user, template.organisation
                ):
                    return Response(
                        {"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN
                    )
            serializer = SlideTemplateSerializer(template)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # List templates for a suborg
        suborg_id = request.query_params.get("suborg_id")
        if not suborg_id:
            return Response(
                {"detail": "suborg_id query param is required."}, status=400
            )

        suborg = get_object_or_404(SubOrganisation, pk=suborg_id)

        # User must be able to access this suborg
        if (
            not user_can_access_branch(request.user, suborg.branches.first())
            if suborg.branches.exists()
            else user_can_manage_suborg(request.user, suborg)
        ):
            return Response({"detail": "Not allowed."}, status=403)

        # Get global templates (no suborganisation) and suborg-specific templates
        global_templates = SlideTemplate.objects.filter(
            organisation=suborg.organisation, suborganisation__isnull=True
        )
        suborg_templates = SlideTemplate.objects.filter(suborganisation=suborg)

        templates = (global_templates | suborg_templates).distinct().order_by("name")
        serializer = SlideTemplateSerializer(templates, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        """
        Create a new suborg template based on a global template.
        Required: suborg_id, parent_template_id
        Optional: name (defaults to parent template name)
        """
        suborg_id = request.data.get("suborg_id")
        parent_template_id = request.data.get("parent_template_id")

        if not suborg_id:
            return Response(
                {"detail": "suborg_id is required."}, status=status.HTTP_400_BAD_REQUEST
            )
        if not parent_template_id:
            return Response(
                {"detail": "parent_template_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        suborg = get_object_or_404(SubOrganisation, pk=suborg_id)
        parent_template = get_object_or_404(SlideTemplate, pk=parent_template_id)

        # Check permissions - user must be suborg_admin or org_admin
        if not user_can_manage_suborg(request.user, suborg):
            return Response(
                {
                    "detail": "Not authorized to create templates for this suborganisation."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Verify parent template is a global template from the same organisation
        if parent_template.suborganisation is not None:
            return Response(
                {"detail": "Parent template must be a global template."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if parent_template.organisation != suborg.organisation:
            return Response(
                {"detail": "Parent template must belong to the same organisation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create the new suborg template
        # Note: slide_data is copied as-is, including any preventSettingsChanges flags
        # from the parent template. These will be enforced in the frontend so that
        # suborg admins cannot modify settings that were locked by the global template.
        new_template_name = request.data.get("name", f"{parent_template.name} (Copy)")

        data = {
            "name": new_template_name,
            "slide_data": parent_template.slide_data,
            "organisation_id": suborg.organisation.id,
            "suborganisation_id": suborg.id,
            "parent_template_id": parent_template.id,
            "aspect_ratio": parent_template.aspect_ratio,
            "is_legacy": parent_template.is_legacy,
        }

        if parent_template.category:
            data["category_id"] = parent_template.category.id

        serializer = SlideTemplateSerializer(data=data)
        if serializer.is_valid():
            template = serializer.save()
            # Copy tags from parent
            template.tags.set(parent_template.tags.all())
            return Response(
                SlideTemplateSerializer(template).data, status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        """
        Update a suborg template.
        Only the suborg_admin, org_admin, or super_admin can update.
        """
        template = get_object_or_404(SlideTemplate, pk=pk)

        # Must be a suborg template
        if not template.suborganisation:
            return Response(
                {"detail": "This endpoint is only for suborg templates."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not user_can_manage_suborg(request.user, template.suborganisation):
            return Response(
                {"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN
            )

        # Don't allow changing organisation, suborganisation, or parent_template
        data = request.data.copy()
        data.pop("organisation_id", None)
        data.pop("suborganisation_id", None)
        data.pop("parent_template_id", None)
        data.pop("is_legacy", None)

        serializer = SlideTemplateSerializer(template, data=data, partial=True)
        if serializer.is_valid():
            updated = serializer.save()
            return Response(SlideTemplateSerializer(updated).data, status=200)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        """
        Delete a suborg template.
        Only suborg_admin, org_admin, or super_admin can delete.
        """
        template = get_object_or_404(SlideTemplate, pk=pk)

        # Must be a suborg template
        if not template.suborganisation:
            return Response(
                {"detail": "This endpoint is only for suborg templates."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not user_can_manage_suborg(request.user, template.suborganisation):
            return Response(
                {"detail": "Not authorized to delete this template."},
                status=status.HTTP_403_FORBIDDEN,
            )

        template.delete()
        return Response(
            {"detail": "Template deleted successfully."},
            status=status.HTTP_204_NO_CONTENT,
        )
