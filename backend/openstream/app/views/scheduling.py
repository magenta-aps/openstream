# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import datetime, timedelta
from django.utils import timezone
import logging
from django.core.paginator import Paginator
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from app.models import (
    DisplayWebsite,
    DisplayWebsiteGroup,
    ScheduledContent,
    RecurringScheduledContent,
)
from app.serializers import (
    DisplayWebsiteGroupSerializer,
    SlideshowSerializer,
    SlideshowPlaylistSerializer,
    DisplayWebsiteSerializer,
    RecurringScheduledContentSerializer,
    ScheduledContentSerializer,
)

logger = logging.getLogger(__name__)

from app.permissions import (
    user_can_access_branch,
    get_branch_and_authenticate,
    handle_branch_request,
    HasAPIKeyOrIsAuthenticated,
)


class DisplayWebsiteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @handle_branch_request
    def get(self, request, branch, pk=None):

        if pk:
            dw = get_object_or_404(DisplayWebsite, pk=pk, branch=branch)
            ser = DisplayWebsiteSerializer(dw)
            return Response(ser.data)
        else:
            websites = DisplayWebsite.objects.filter(branch=branch)
            ser = DisplayWebsiteSerializer(websites, many=True)
            return Response(ser.data)

    @handle_branch_request
    def post(self, request, branch):
        ser = DisplayWebsiteSerializer(data=request.data)
        if ser.is_valid():
            dw = ser.save(branch=branch)
            return Response(DisplayWebsiteSerializer(dw).data, status=201)
        return Response(ser.errors, status=400)

    @handle_branch_request
    def patch(self, request, branch, pk):
        dw = get_object_or_404(DisplayWebsite, pk=pk, branch=branch)
        ser = DisplayWebsiteSerializer(dw, data=request.data, partial=True)
        if ser.is_valid():
            updated = ser.save()
            return Response(DisplayWebsiteSerializer(updated).data)
        return Response(ser.errors, status=400)

    @handle_branch_request
    def delete(self, request, branch, pk):
        dw = get_object_or_404(DisplayWebsite, pk=pk, branch=branch)
        dw.delete()
        return Response(status=204)


class DisplayWebsiteGroupAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @handle_branch_request
    def get(self, request, branch, pk=None):

        if pk:
            dwg = get_object_or_404(DisplayWebsiteGroup, pk=pk, branch=branch)
            ser = DisplayWebsiteGroupSerializer(dwg)
            return Response(ser.data)
        else:
            groups = DisplayWebsiteGroup.objects.filter(branch=branch)
            ser = DisplayWebsiteGroupSerializer(groups, many=True)
            return Response(ser.data)

    @handle_branch_request
    def post(self, request, branch):
        ser = DisplayWebsiteGroupSerializer(data=request.data)
        if ser.is_valid():
            dwg = ser.save(branch=branch)
            return Response(DisplayWebsiteGroupSerializer(dwg).data, status=201)
        return Response(ser.errors, status=400)

    @handle_branch_request
    def patch(self, request, branch, pk):
        dwg = get_object_or_404(DisplayWebsiteGroup, pk=pk, branch=branch)
        ser = DisplayWebsiteGroupSerializer(dwg, data=request.data, partial=True)
        if ser.is_valid():
            updated = ser.save()
            return Response(DisplayWebsiteGroupSerializer(updated).data)
        return Response(ser.errors, status=400)

    @handle_branch_request
    def delete(self, request, branch, pk):
        dwg = get_object_or_404(DisplayWebsiteGroup, pk=pk, branch=branch)
        dwg.delete()
        return Response(status=204)


class ScheduledContentAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Expects ?id=<group_id> or ?ids=<comma separated group_ids>.
        Must ensure the user can access the branch for each group.
        """
        group_ids = request.query_params.get("ids")
        single_id = request.query_params.get("id")

        if not group_ids and not single_id:
            return Response(
                {"detail": "Either 'id' or 'ids' parameter is required."}, status=400
            )

        if group_ids:
            group_ids_list = [int(x) for x in group_ids.split(",") if x.strip()]
            groups = DisplayWebsiteGroup.objects.filter(id__in=group_ids_list)
            if groups.count() != len(group_ids_list):
                return Response(
                    {"detail": "Unknown display website group."}, status=404
                )

            for group in groups:
                if not user_can_access_branch(request.user, group.branch):
                    return Response({"detail": "Not allowed."}, status=403)

            results = ScheduledContent.objects.filter(
                display_website_group__id__in=group_ids_list
            )
        else:
            # single group
            group_id = int(single_id)
            group = get_object_or_404(DisplayWebsiteGroup, pk=group_id)
            if not user_can_access_branch(request.user, group.branch):
                return Response({"detail": "Not allowed."}, status=403)

            results = ScheduledContent.objects.filter(display_website_group=group)

        ser = ScheduledContentSerializer(results, many=True)
        return Response(ser.data)

    def post(self, request):
        ser = ScheduledContentSerializer(data=request.data)
        if ser.is_valid():
            group = ser.validated_data["display_website_group"]
            if not user_can_access_branch(request.user, group.branch):
                return Response({"detail": "Not allowed."}, status=403)

            sc = ser.save()
            return Response(ScheduledContentSerializer(sc).data, status=201)
        return Response(ser.errors, status=400)

    def patch(self, request, pk):
        sc = get_object_or_404(ScheduledContent, pk=pk)
        group = sc.display_website_group
        if not user_can_access_branch(request.user, group.branch):
            return Response({"detail": "Not allowed."}, status=403)

        ser = ScheduledContentSerializer(sc, data=request.data, partial=True)
        if ser.is_valid():
            new_group = ser.validated_data.get("display_website_group", group)
            if not user_can_access_branch(request.user, new_group.branch):
                return Response({"detail": "Not allowed."}, status=403)

            updated = ser.save()
            return Response(ScheduledContentSerializer(updated).data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        sc = get_object_or_404(ScheduledContent, pk=pk)
        group = sc.display_website_group
        if not user_can_access_branch(request.user, group.branch):
            return Response({"detail": "Not allowed."}, status=403)
        sc.delete()
        return Response(status=204)


class RecurringScheduledContentAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Get recurring scheduled content for given group IDs.
        Returns the recurring event definitions - frontend will generate calendar instances.
        Expects ?ids=<comma separated group_ids> or ?id=<single_group_id>
        """
        group_ids = request.query_params.get("ids")
        single_id = request.query_params.get("id")

        if not group_ids and not single_id:
            return Response(
                {"detail": "Either 'id' or 'ids' parameter is required."}, status=400
            )

        if group_ids:
            group_ids_list = [int(x) for x in group_ids.split(",") if x.strip()]
            groups = DisplayWebsiteGroup.objects.filter(id__in=group_ids_list)
            if groups.count() != len(group_ids_list):
                return Response(
                    {"detail": "Unknown display website group."}, status=404
                )

            for group in groups:
                if not user_can_access_branch(request.user, group.branch):
                    return Response({"detail": "Not allowed."}, status=403)

            recurring_content = RecurringScheduledContent.objects.filter(
                display_website_group__id__in=group_ids_list
            )
        else:
            # single group
            group_id = int(single_id)
            group = get_object_or_404(DisplayWebsiteGroup, pk=group_id)
            if not user_can_access_branch(request.user, group.branch):
                return Response({"detail": "Not allowed."}, status=403)

            recurring_content = RecurringScheduledContent.objects.filter(
                display_website_group=group
            )

        # Return the recurring content definitions
        # Frontend will generate calendar instances as needed
        ser = RecurringScheduledContentSerializer(recurring_content, many=True)
        return Response(ser.data)

    def post(self, request):
        """Create new recurring scheduled content"""
        ser = RecurringScheduledContentSerializer(data=request.data)
        if ser.is_valid():
            group = ser.validated_data["display_website_group"]
            if not user_can_access_branch(request.user, group.branch):
                return Response({"detail": "Not allowed."}, status=403)

            recurring_content = ser.save()
            return Response(
                RecurringScheduledContentSerializer(recurring_content).data, status=201
            )
        return Response(ser.errors, status=400)

    def patch(self, request, pk):
        """Update recurring scheduled content"""
        recurring_content = get_object_or_404(RecurringScheduledContent, pk=pk)
        group = recurring_content.display_website_group
        if not user_can_access_branch(request.user, group.branch):
            return Response({"detail": "Not allowed."}, status=403)

        ser = RecurringScheduledContentSerializer(
            recurring_content, data=request.data, partial=True
        )
        if ser.is_valid():
            new_group = ser.validated_data.get("display_website_group", group)
            if not user_can_access_branch(request.user, new_group.branch):
                return Response({"detail": "Not allowed."}, status=403)

            updated = ser.save()
            return Response(RecurringScheduledContentSerializer(updated).data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        """Delete recurring scheduled content"""
        recurring_content = get_object_or_404(RecurringScheduledContent, pk=pk)
        group = recurring_content.display_website_group
        if not user_can_access_branch(request.user, group.branch):
            return Response({"detail": "Not allowed."}, status=403)
        recurring_content.delete()
        return Response(status=204)


class GetActiveContentAPIView(APIView):
    permission_classes = [HasAPIKeyOrIsAuthenticated]

    def wrap_slideshow_as_playlist_item(self, slideshow_data, position=0):
        """
        Wrap a serialized slideshow (dict) as a playlist-style item.
        This ensures standalone slideshow content uses the same format as playlist items.
        """
        return {
            "id": slideshow_data.get("id"),
            "position": position,  
            "slideshow_playlist": 1,
            "slideshow": slideshow_data,
        }

    def serialize_content(self, content, content_type):
        """
        Serialize content using the appropriate serializer.
        """
        if content_type == "slideshow":
            return SlideshowSerializer(
                content, context={"include_slideshow_data": True}
            )
        elif content_type == "playlist":
            return SlideshowPlaylistSerializer(
                content, context={"include_slides": True}
            )
        return None

    def get_playlist_items(self, content, content_type):
        """
        Return a list of playlist entry items from the content.
        - For playlists, the serializer is assumed to return a dict with an "items" key.
        - For manage_content, we wrap the entire slideshow data into a single playlist item.
        """
        serializer = self.serialize_content(content, content_type)
        data = serializer.data
        if content_type == "playlist":
            return data.get("items", [])
        elif content_type == "slideshow":
            return [self.wrap_slideshow_as_playlist_item(data)]
        return []

    def get(self, request):
        # --- Authentication Section ---
        display_website_id = request.query_params.get("id")
        if not display_website_id:
            return Response({"detail": "Display website ID is required."}, status=400)

        dw = get_object_or_404(DisplayWebsite, id=display_website_id)

        # Permission class has already validated authentication
        # Now validate branch access
        if hasattr(request, "api_key_obj"):
            # For API key auth, verify branch-bound key matches the display website's branch
            if not request.api_key_obj.branch:
                return Response(
                    {"detail": "API key must be bound to a branch."},
                    status=403,
                )
            if request.api_key_obj.branch != dw.branch:
                return Response(
                    {"detail": "API key not valid for this branch."}, status=403
                )
        else:
            # For user auth, check branch access
            if not user_can_access_branch(request.user, dw.branch):
                return Response({"detail": "Not allowed."}, status=403)

        dwg = dw.display_website_group
        if not dwg:
            return Response({"detail": "No display_website_group found."}, status=404)

        slideshow_ids = set()
        playlist_ids = set()
        scheduled_ids = set()
        recurring_ids = set()

        def track_slides_from_items(items):
            if not items:
                return
            for item in items:
                slideshow_data = item.get("slideshow") if isinstance(item, dict) else None
                if isinstance(slideshow_data, dict):
                    slideshow_id = slideshow_data.get("id")
                    if slideshow_id is not None:
                        slideshow_ids.add(slideshow_id)

        def metadata_payload():
            return {
                "slideshow_ids": sorted(slideshow_ids),
                "slideshow_playlist_ids": sorted(playlist_ids),
                "scheduled_content_ids": sorted(scheduled_ids),
                "recurring_scheduled_content_ids": sorted(recurring_ids),
                "display_website_group_id": dwg.id,
                "org_id": dw.branch.suborganisation.organisation.id,
                "suborg_id": dw.branch.suborganisation.id,
                "branch_id": dw.branch.id,
            }

        tz_now = timezone.now()
        current_weekday = tz_now.weekday()
        current_time = tz_now.time()
        current_date = tz_now.date()

        scheduled_qs = ScheduledContent.objects.filter(
            display_website_group=dwg, start_time__lte=tz_now, end_time__gte=tz_now
        ).order_by("start_time")

        recurring_qs = (
            RecurringScheduledContent.objects.filter(
                display_website_group=dwg,
                weekday=current_weekday,
                start_time__lte=current_time,
                end_time__gte=current_time,
                active_from__lte=current_date,
            )
            .filter(Q(active_until__isnull=True) | Q(active_until__gte=current_date))
            .order_by("start_time")
        )

        scheduled_items = []
        combine_with_default = False

        for sc in scheduled_qs:
            scheduled_ids.add(sc.id)
            if sc.slideshow is not None:
                slideshow_items = self.get_playlist_items(sc.slideshow, "slideshow")
                track_slides_from_items(slideshow_items)
                scheduled_items += slideshow_items
                if sc.slideshow_id:
                    slideshow_ids.add(sc.slideshow_id)
            elif sc.playlist is not None:
                playlist_items = self.get_playlist_items(sc.playlist, "playlist")
                track_slides_from_items(playlist_items)
                scheduled_items += playlist_items
                if sc.playlist_id:
                    playlist_ids.add(sc.playlist_id)
            # If any scheduled content requires merging with default, mark the flag.
            if sc.combine_with_default:
                combine_with_default = True

        # Iterate over all recurring scheduled content records.
        for rsc in recurring_qs:
            recurring_ids.add(rsc.id)
            if rsc.slideshow is not None:
                slideshow_items = self.get_playlist_items(rsc.slideshow, "slideshow")
                track_slides_from_items(slideshow_items)
                scheduled_items += slideshow_items
                if rsc.slideshow_id:
                    slideshow_ids.add(rsc.slideshow_id)
            elif rsc.playlist is not None:
                playlist_items = self.get_playlist_items(rsc.playlist, "playlist")
                track_slides_from_items(playlist_items)
                scheduled_items += playlist_items
                if rsc.playlist_id:
                    playlist_ids.add(rsc.playlist_id)
            # If any recurring content requires merging with default, mark the flag.
            if rsc.combine_with_default:
                combine_with_default = True

        def merge_items(list1, list2):
            """Merge two lists of playlist items."""
            return list1 + list2

        if scheduled_items:
            if combine_with_default:
                default_items = []
                if (
                    hasattr(dwg, "default_slideshow")
                    and dwg.default_slideshow is not None
                ):
                    default_slideshow_items = self.get_playlist_items(
                        dwg.default_slideshow, "slideshow"
                    )
                    track_slides_from_items(default_slideshow_items)
                    default_items += default_slideshow_items
                    if getattr(dwg, "default_slideshow_id", None):
                        slideshow_ids.add(dwg.default_slideshow_id)
                if (
                    hasattr(dwg, "default_playlist")
                    and dwg.default_playlist is not None
                ):
                    default_playlist_items = self.get_playlist_items(
                        dwg.default_playlist, "playlist"
                    )
                    track_slides_from_items(default_playlist_items)
                    default_items += default_playlist_items
                    if getattr(dwg, "default_playlist_id", None):
                        playlist_ids.add(dwg.default_playlist_id)
                merged_items = merge_items(scheduled_items, default_items)
            else:
                merged_items = scheduled_items

            payload = {"items": merged_items}
            payload.update(metadata_payload())
            return Response(payload, status=200)
        else:
            # Fallback: if no scheduled content is active, use default content.
            default_items = []
            if hasattr(dwg, "default_slideshow") and dwg.default_slideshow is not None:
                default_slideshow_items = self.get_playlist_items(
                    dwg.default_slideshow, "slideshow"
                )
                track_slides_from_items(default_slideshow_items)
                default_items += default_slideshow_items
                if getattr(dwg, "default_slideshow_id", None):
                    slideshow_ids.add(dwg.default_slideshow_id)
            if hasattr(dwg, "default_playlist") and dwg.default_playlist is not None:
                default_playlist_items = self.get_playlist_items(
                    dwg.default_playlist, "playlist"
                )
                track_slides_from_items(default_playlist_items)
                default_items += default_playlist_items
                if getattr(dwg, "default_playlist_id", None):
                    playlist_ids.add(dwg.default_playlist_id)
            if not default_items:
                return Response({"detail": "No default content found."}, status=404)
            else:
                payload = {"items": default_items}
                payload.update(metadata_payload())
                return Response(payload, status=200)


class BranchActiveContentAPIView(APIView):
    """Return all currently active content for a branch (aggregated across groups), paginated.

    Query params:
      - branch_id (required)
      - page (optional, default=1)
      - page_size (optional, default=10)
    Authentication: Accepts X-API-KEY header (branch-bound) or normal user auth.
    """

    permission_classes = []  # we handle auth internally

    def get_playlist_items(self, content, content_type):
        if content_type == "slideshow":
            return [
                {
                    "id": content.id,
                    "position": 0,
                    "slideshow_playlist": 1,
                    "slideshow": SlideshowSerializer(
                        content, context={"include_slideshow_data": True}
                    ).data,
                }
            ]
        elif content_type == "playlist":
            return SlideshowPlaylistSerializer(
                content, context={"include_slides": True}
            ).data.get("items", [])
        return []

    def get(self, request):
        branch, error = get_branch_and_authenticate(request, "branch_id")
        if error:
            return error

        tz_now = timezone.now()
        current_weekday = tz_now.weekday()
        current_time = tz_now.time()
        current_date = tz_now.date()

        items = []
        grouped = []  # new: list of { display_website_group: name, items: [...] }

        groups = DisplayWebsiteGroup.objects.filter(branch=branch)
        for dwg in groups:
            scheduled_qs = ScheduledContent.objects.filter(
                display_website_group=dwg,
                start_time__lte=tz_now,
                end_time__gte=tz_now,
            ).order_by("start_time")
            recurring_qs = (
                RecurringScheduledContent.objects.filter(
                    display_website_group=dwg,
                    weekday=current_weekday,
                    start_time__lte=current_time,
                    end_time__gte=current_time,
                    active_from__lte=current_date,
                )
                .filter(
                    Q(active_until__isnull=True) | Q(active_until__gte=current_date)
                )
                .order_by("start_time")
            )

            scheduled_items = []
            combine_with_default = False

            for sc in scheduled_qs:
                if sc.slideshow is not None:
                    scheduled_items += self.get_playlist_items(
                        sc.slideshow, "slideshow"
                    )
                elif sc.playlist is not None:
                    scheduled_items += self.get_playlist_items(sc.playlist, "playlist")
                if sc.combine_with_default:
                    combine_with_default = True

            for rsc in recurring_qs:
                if rsc.slideshow is not None:
                    scheduled_items += self.get_playlist_items(
                        rsc.slideshow, "slideshow"
                    )
                elif rsc.playlist is not None:
                    scheduled_items += self.get_playlist_items(rsc.playlist, "playlist")
                if rsc.combine_with_default:
                    combine_with_default = True

            if scheduled_items:
                if combine_with_default:
                    default_items = []
                    if (
                        hasattr(dwg, "default_slideshow")
                        and dwg.default_slideshow is not None
                    ):
                        default_items += self.get_playlist_items(
                            dwg.default_slideshow, "slideshow"
                        )
                    if (
                        hasattr(dwg, "default_playlist")
                        and dwg.default_playlist is not None
                    ):
                        default_items += self.get_playlist_items(
                            dwg.default_playlist, "playlist"
                        )
                    merged = scheduled_items + default_items
                else:
                    merged = scheduled_items

                for _it in merged:
                    try:
                        _it["display_website_group"] = dwg.name
                    except Exception:
                        pass

                grouped.append({"display_website_group": dwg.name, "items": merged})
                items += merged
            else:
                default_items = []
                if (
                    hasattr(dwg, "default_slideshow")
                    and dwg.default_slideshow is not None
                ):
                    default_items += self.get_playlist_items(
                        dwg.default_slideshow, "slideshow"
                    )
                if (
                    hasattr(dwg, "default_playlist")
                    and dwg.default_playlist is not None
                ):
                    default_items += self.get_playlist_items(
                        dwg.default_playlist, "playlist"
                    )

                for _it in default_items:
                    try:
                        _it["display_website_group"] = dwg.name
                    except Exception:
                        pass

                grouped.append(
                    {"display_website_group": dwg.name, "items": default_items}
                )
                items += default_items

        # Pagination
        try:
            page = int(request.query_params.get("page", 1))
        except ValueError:
            page = 1
        try:
            page_size = int(request.query_params.get("page_size", 10))
        except ValueError:
            page_size = 10

        paginator = Paginator(items, page_size)
        page_obj = paginator.get_page(page)

        data = {
            "count": paginator.count,
            "num_pages": paginator.num_pages,
            "current_page": page_obj.number,
            "items_per_page": paginator.per_page,
            "next": page_obj.next_page_number() if page_obj.has_next() else None,
            "previous": (
                page_obj.previous_page_number() if page_obj.has_previous() else None
            ),
            "results": page_obj.object_list,
            "grouped": grouped,
        }

        return Response(data)


class BranchUpcomingContentAPIView(APIView):
    """Return the next upcoming scheduled and recurring content for a branch (limit 10).

    Query params:
      - branch_id (required)
    Authentication: Accepts X-API-KEY header (branch-bound) or normal user auth.
    """

    permission_classes = []

    def get_next_recurring_instance(self, rsc, now_dt):
        """Compute the next occurrence datetime for a RecurringScheduledContent after now_dt.
        Returns (start_datetime, end_datetime) or (None, None) if none within active range.
        """
        today = now_dt.date()
        start_date = max(today, rsc.active_from)
        days_ahead = (rsc.weekday - start_date.weekday() + 7) % 7
        candidate = start_date + timedelta(days=days_ahead)

        candidate_start_dt = datetime.combine(candidate, rsc.start_time)
        # make timezone-aware if needed
        if timezone.is_naive(candidate_start_dt):
            candidate_start_dt = timezone.make_aware(
                candidate_start_dt, timezone.get_current_timezone()
            )
        if candidate_start_dt <= now_dt:
            candidate = candidate + timedelta(days=7)
            candidate_start_dt = datetime.combine(candidate, rsc.start_time)
            if timezone.is_naive(candidate_start_dt):
                candidate_start_dt = timezone.make_aware(
                    candidate_start_dt, timezone.get_current_timezone()
                )

        # Check active_until
        if rsc.active_until and candidate > rsc.active_until:
            return (None, None)

        candidate_end_dt = datetime.combine(candidate, rsc.end_time)
        if timezone.is_naive(candidate_end_dt):
            candidate_end_dt = timezone.make_aware(
                candidate_end_dt, timezone.get_current_timezone()
            )
        return (candidate_start_dt, candidate_end_dt)

    def get(self, request):
        branch, error = get_branch_and_authenticate(request, "branch_id")
        if error:
            return error

        now_dt = timezone.now()

        # Upcoming scheduled content (start_time >= now)
        scheduled_qs = ScheduledContent.objects.filter(
            display_website_group__branch=branch, start_time__gte=now_dt
        ).order_by("start_time")

        upcoming = []

        for sc in scheduled_qs:
            entry = {
                "type": "scheduled",
                "id": sc.id,
                "group": (
                    sc.display_website_group.name if sc.display_website_group else None
                ),
                "start_time": sc.start_time.isoformat(),
                "end_time": sc.end_time.isoformat() if sc.end_time else None,
            }
            if sc.slideshow:
                entry["content"] = {
                    "type": "slideshow",
                    "id": sc.slideshow.id,
                    "name": sc.slideshow.name,
                }
            elif sc.playlist:
                entry["content"] = {
                    "type": "playlist",
                    "id": sc.playlist.id,
                    "name": sc.playlist.name,
                }
            upcoming.append(entry)

        # Recurring scheduled content: compute next instance for each recurring entry
        recurring_qs = RecurringScheduledContent.objects.filter(
            display_website_group__branch=branch,
            active_from__lte=now_dt.date(),
        ).filter(Q(active_until__isnull=True) | Q(active_until__gte=now_dt.date()))

        for rsc in recurring_qs:
            start_dt, end_dt = self.get_next_recurring_instance(rsc, now_dt)
            if start_dt is None:
                continue
            entry = {
                "type": "recurring",
                "id": rsc.id,
                "group": (
                    rsc.display_website_group.name
                    if rsc.display_website_group
                    else None
                ),
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat() if end_dt else None,
            }
            if rsc.slideshow:
                entry["content"] = {
                    "type": "slideshow",
                    "id": rsc.slideshow.id,
                    "name": rsc.slideshow.name,
                }
            elif rsc.playlist:
                entry["content"] = {
                    "type": "playlist",
                    "id": rsc.playlist.id,
                    "name": rsc.playlist.name,
                }
            upcoming.append(entry)

        # Sort all upcoming entries by start_time and limit to 10
        def parse_dt(v):
            try:
                dt = datetime.fromisoformat(v)
                # make aware if naive
                if timezone.is_naive(dt):
                    dt = timezone.make_aware(dt, timezone.get_current_timezone())
                return dt
            except Exception:
                return datetime.max

        upcoming_sorted = sorted(upcoming, key=lambda x: parse_dt(x.get("start_time")))[
            :10
        ]

        return Response({"results": upcoming_sorted}, status=200)
