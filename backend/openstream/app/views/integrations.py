# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import datetime, timedelta, timezone as dt_timezone
from django.utils.text import slugify
import logging
import json
import dateutil.parser
from django.core.cache import cache
import copy
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from app.models import (
    OrganisationAPIAccess,
    SlideshowPlayerAPIKey,
)

logger = logging.getLogger(__name__)

from app.permissions import (
    check_api_access,
    get_org_from_user,
)
from app.utils import (
    _normalize_text,
)
from app.views.auth import TokenOrAPIKeyMixin
from app.services import (
    DDB_EVENT_API_URLS,
    DDBEventFetchError,
    fetch_cached_ddb_events,
    get_cached_ddb_categories,
    fetch_speedadmin_data,
    winkas_cache,
    fetch_kmd_data,
    kmd_location_names,
    default_winkas_credentials,
    _event_matches_search,
    _collect_event_identifiers,
    fetch_weather_data,
    DMI_WEATHER_LOCATIONS,
    fetch_rss_data,
)


class DDBProxyAPIView(APIView, TokenOrAPIKeyMixin):
    """Simple proxy endpoint for testing"""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"message": "Hello from DDB Proxy endpoint!"})


class DDBEventOptionsAPIView(APIView, TokenOrAPIKeyMixin):
    """Endpoint to return kommune options"""

    permission_classes = [AllowAny]

    def get(self, request):
        include_categories_param = request.query_params.get(
            "include_categories", "false"
        )
        include_categories = include_categories_param.lower() in {
            "true",
            "1",
            "yes",
        }

        requested_kommune = request.query_params.get("kommune")

        if requested_kommune and requested_kommune not in DDB_EVENT_API_URLS:
            valid_keys = ", ".join(DDB_EVENT_API_URLS.keys())
            return Response(
                {
                    "error": f"{requested_kommune} is an invalid kommune. Supported kommuner are: {valid_keys}",
                    "validKommuner": list(DDB_EVENT_API_URLS.keys()),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        kommuner = (
            [requested_kommune]
            if requested_kommune
            else list(DDB_EVENT_API_URLS.keys())
        )

        response_payload = {}

        for kommune_name in kommuner:
            kommune_data = copy.deepcopy(DDB_EVENT_API_URLS[kommune_name])

            if include_categories:
                categories = []
                try:
                    events = fetch_cached_ddb_events(kommune_name)
                except DDBEventFetchError as error:
                    logger.warning(
                        "Failed to load DDB events for %s: %s",
                        kommune_name,
                        error,
                    )
                    if error.status_code == status.HTTP_400_BAD_REQUEST:
                        return Response(
                            {
                                "error": str(error),
                                "validKommuner": list(DDB_EVENT_API_URLS.keys()),
                            },
                            status=error.status_code,
                        )
                else:
                    categories = get_cached_ddb_categories(kommune_name, events)

                kommune_data["categories"] = categories

            response_payload[kommune_name] = kommune_data

        return Response(response_payload)


class DDBEventAPIView(APIView, TokenOrAPIKeyMixin):
    """Endpoint to fetch, cache, and filter events"""

    permission_classes = [AllowAny]

    def get(self, request):
        kommune = request.query_params.get("kommune")
        if not kommune:
            return Response(
                {"error": "kommune parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        days_param = request.query_params.get("days")

        if days_param is None or str(days_param).strip() == "":
            days = 0
        else:
            try:
                days = int(str(days_param).strip())
            except (TypeError, ValueError):
                return Response(
                    {"error": "'days' parameter must be a positive integer."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Validate the 'days' parameter.
        if days < 0:
            return Response(
                {"error": "'days' parameter must be a positive integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if the provided kommune is supported.
        if kommune not in DDB_EVENT_API_URLS:
            valid_keys = ", ".join(DDB_EVENT_API_URLS.keys())
            return Response(
                {
                    "error": f"{kommune} is an invalid kommune. Supported kommuner are: {valid_keys}"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        available_libraries = {}
        for library in DDB_EVENT_API_URLS[kommune].get("libraries", []):
            normalized_library = _normalize_text(library)
            if normalized_library:
                available_libraries[normalized_library] = library

        def _parse_multi_value_param(param_name):
            values = []
            raw_values = request.query_params.getlist(param_name)
            for raw_value in raw_values:
                if not raw_value:
                    continue
                # Allow comma-separated lists as well as repeated parameters.
                split_values = [
                    item.strip() for item in raw_value.split(",") if item.strip()
                ]
                values.extend(split_values)
            return values

        selected_libraries = _parse_multi_value_param("libraries")
        if not selected_libraries:
            selected_libraries = _parse_multi_value_param("branches")
        if not selected_libraries:
            selected_libraries = _parse_multi_value_param("library")

        normalized_libraries = set()
        for requested_library in selected_libraries:
            lookup_key = _normalize_text(requested_library)
            if lookup_key in available_libraries:
                normalized_libraries.add(lookup_key)

        if selected_libraries and not normalized_libraries:
            return Response(
                {
                    "error": "None of the requested libraries are available for the selected kommune.",
                    "requested": selected_libraries,
                    "available": list(available_libraries.values()),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            valid_events = fetch_cached_ddb_events(kommune)
        except DDBEventFetchError as error:
            return Response({"error": str(error)}, status=error.status_code)

        available_categories = {}
        for category in get_cached_ddb_categories(kommune, valid_events):
            normalized_category = _normalize_text(category)
            if normalized_category:
                available_categories[normalized_category] = category

        selected_categories = _parse_multi_value_param("categories")
        if not selected_categories:
            selected_categories = _parse_multi_value_param("category")

        normalized_categories = set()
        for requested_category in selected_categories:
            lookup_key = _normalize_text(requested_category)
            if lookup_key in available_categories:
                normalized_categories.add(lookup_key)

        if selected_categories and not normalized_categories:
            return Response(
                {
                    "error": "None of the requested categories are available for the selected kommune.",
                    "requested": selected_categories,
                    "available": list(available_categories.values()),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        search_query = request.query_params.get("search")
        normalized_search_query = _normalize_text(search_query) if search_query else ""

        selected_event_ids = _parse_multi_value_param("event_ids")
        if not selected_event_ids:
            selected_event_ids = _parse_multi_value_param("eventIds")

        normalized_event_id_set = {
            _normalize_text(value)
            for value in selected_event_ids
            if _normalize_text(value)
        }

        # Filter events based on the 'days' parameter.
        if not valid_events:
            return Response([])

        now_utc = datetime.now(dt_timezone.utc)
        future_limit = now_utc + timedelta(days=days)
        filtered_events = []

        for event in valid_events:
            dt = event.get("date_time", {})
            start_str = dt.get("start")
            if start_str:
                try:
                    start_time = dateutil.parser.parse(start_str)
                    if start_time >= now_utc.replace(
                        hour=0, minute=0, second=0, microsecond=0
                    ) and (days == 0 or start_time <= future_limit):
                        filtered_events.append(event)
                except Exception as e:
                    continue

        try:
            if filtered_events:
                filtered_events.sort(
                    key=lambda x: (
                        dateutil.parser.parse(x.get("date_time", {}).get("start"))
                        if x.get("date_time", {}).get("start")
                        else datetime.min.replace(tzinfo=dt_timezone.utc)
                    )
                )
        except Exception as e:
            pass

        if normalized_libraries:

            def _event_matches_selected_libraries(event):
                event_branches = event.get("branches")
                candidate_names = set()

                if isinstance(event_branches, list):
                    candidate_names.update(
                        _normalize_text(branch)
                        for branch in event_branches
                        if _normalize_text(branch)
                    )
                elif isinstance(event_branches, (str, int, float)):
                    normalized_branch = _normalize_text(event_branches)
                    if normalized_branch:
                        candidate_names.add(normalized_branch)

                branch_name = event.get("branch")
                if isinstance(branch_name, (str, int, float)):
                    normalized_branch = _normalize_text(branch_name)
                    if normalized_branch:
                        candidate_names.add(normalized_branch)

                address_location = event.get("address", {}).get("location")
                if isinstance(address_location, (str, int, float)):
                    normalized_branch = _normalize_text(address_location)
                    if normalized_branch:
                        candidate_names.add(normalized_branch)

                location_name = event.get("location")
                if isinstance(location_name, (str, int, float)):
                    normalized_branch = _normalize_text(location_name)
                    if normalized_branch:
                        candidate_names.add(normalized_branch)

                venue_name = event.get("venue_name")
                if isinstance(venue_name, (str, int, float)):
                    normalized_branch = _normalize_text(venue_name)
                    if normalized_branch:
                        candidate_names.add(normalized_branch)

                return bool(candidate_names & normalized_libraries)

            filtered_events = [
                event
                for event in filtered_events
                if _event_matches_selected_libraries(event)
            ]

        if normalized_categories:

            def _event_matches_selected_categories(event):
                event_categories = event.get("categories")
                candidate_categories = set()

                if isinstance(event_categories, list):
                    candidate_categories.update(
                        _normalize_text(category)
                        for category in event_categories
                        if _normalize_text(category)
                    )
                elif isinstance(event_categories, (str, int, float)):
                    normalized_value = _normalize_text(event_categories)
                    if normalized_value:
                        candidate_categories.add(normalized_value)

                return bool(candidate_categories & normalized_categories)

            filtered_events = [
                event
                for event in filtered_events
                if _event_matches_selected_categories(event)
            ]

        if normalized_search_query:

            def _event_matches_query(event):
                return _event_matches_search(event, normalized_search_query)

            filtered_events = [
                event for event in filtered_events if _event_matches_query(event)
            ]

        if normalized_event_id_set:

            def _event_matches_selected_ids(event):
                identifiers = {
                    _normalize_text(identifier)
                    for identifier in _collect_event_identifiers(event)
                    if _normalize_text(identifier)
                }
                return bool(identifiers & normalized_event_id_set)

            filtered_events = [
                event for event in filtered_events if _event_matches_selected_ids(event)
            ]

        # Apply additional filters
        extra_filters = {
            key: value.lower()
            for key, value in request.query_params.items()
            if key
            not in [
                "sort",
                "order",
                "kommune",
                "days",
                "libraries",
                "library",
                "branches",
                "categories",
                "category",
                "eventIds",
                "event_ids",
                "search",
                "selectionMode",
            ]
        }
        if extra_filters:
            final_filtered_events = [
                event
                for event in filtered_events
                if all(
                    extra_filters[key] in str(event.get(key, "")).lower()
                    for key in extra_filters
                )
            ]
        else:
            final_filtered_events = filtered_events

        return Response(final_filtered_events)


class RSSToJSONAPIView(APIView, TokenOrAPIKeyMixin):
    """Convert RSS feeds to JSON"""

    permission_classes = [AllowAny]

    def get(self, request):
        # Cache for 10 minutes (600 seconds)
        news_data = cache.get("rss_news_data")
        if news_data is None:
            news_data = fetch_rss_data()
            cache.set("rss_news_data", news_data, 600)
        return Response({"news": news_data})


class WeatherAPIView(APIView, TokenOrAPIKeyMixin):
    """Get weather data for a location"""

    permission_classes = [AllowAny]

    def get(self, request):
        location = request.query_params.get("location")
        if not location:
            return Response(
                {"error": "location parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if location not in DMI_WEATHER_LOCATIONS:
            return Response(
                {"error": "Invalid location"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Cache key based on location
        cache_key = f"weather_data_{slugify(location)}"
        weather_data = cache.get(cache_key)

        if weather_data is None:
            weather_data = fetch_weather_data(location)
            # Cache for 10 minutes
            cache.set(cache_key, weather_data, 600)

        return Response({"weather": weather_data})


class WeatherLocationsAPIView(APIView, TokenOrAPIKeyMixin):
    """Get available weather locations"""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"locations": list(DMI_WEATHER_LOCATIONS.keys())})


class SpeedAdminDataAPIView(APIView, TokenOrAPIKeyMixin):
    """Get SpeedAdmin data for a specific school"""

    permission_classes = [AllowAny]

    def get(self, request):
        # Check if user's organisation has access to SpeedAdmin API
        if not check_api_access(request.user, "speedadmin"):
            return Response(
                {"error": "Your organisation does not have access to SpeedAdmin API"},
                status=status.HTTP_403_FORBIDDEN,
            )

        school_name = request.query_params.get("school_name")
        if not school_name:
            return Response(
                {"error": "school_name parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Cache key
        cache_key = "speedadmin_data"
        cached_data = cache.get(cache_key)

        if cached_data is None:
            speedadmin_school_data, speedadmin_school_names = fetch_speedadmin_data()
            # Cache for 15 minutes
            cache.set(cache_key, (speedadmin_school_data, speedadmin_school_names), 900)
        else:
            speedadmin_school_data, speedadmin_school_names = cached_data

        data_for_school = []
        today = datetime.now().date()
        for entry in speedadmin_school_data:
            if entry["school"] == school_name:
                date_obj = datetime.strptime(entry["date"], "%Y-%m-%dT%H:%M:%S")
                if date_obj.date() == today:
                    data_for_school.append(entry)
        return Response(data_for_school)


class SpeedAdminSchoolsAPIView(APIView, TokenOrAPIKeyMixin):
    """Get available SpeedAdmin schools"""

    permission_classes = [AllowAny]

    def get(self, request):
        # Check if user's organisation has access to SpeedAdmin API
        if not check_api_access(request.user, "speedadmin"):
            return Response(
                {"error": "Your organisation does not have access to SpeedAdmin API"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Cache key
        cache_key = "speedadmin_data"
        cached_data = cache.get(cache_key)

        if cached_data is None:
            speedadmin_school_data, speedadmin_school_names = fetch_speedadmin_data()
            # Cache for 15 minutes
            cache.set(cache_key, (speedadmin_school_data, speedadmin_school_names), 900)
        else:
            speedadmin_school_data, speedadmin_school_names = cached_data

        return Response(speedadmin_school_names)


class WinKASLocationsAPIView(APIView, TokenOrAPIKeyMixin):
    """Get available WinKAS locations and their bookable sub-locations"""

    permission_classes = [AllowAny]

    def get(self, request):
        # Allow either X-API-KEY auth or regular user-based auth.
        api_key_value = request.headers.get("X-API-KEY")
        org_allowed = False

        if api_key_value:
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key_value, is_active=True
            ).first()
            if not key_obj:
                return Response({"error": "Invalid or inactive API key."}, status=403)

            # Resolve organisation from branch if present, otherwise from key user
            org = None
            if key_obj.branch:
                org = key_obj.branch.suborganisation.organisation
            elif getattr(key_obj, "user", None):
                org = get_org_from_user(key_obj.user)

            if not org:
                return Response(
                    {"error": "Could not determine organisation from API key."},
                    status=403,
                )

            # Finally check organisation access for WinKAS
            if OrganisationAPIAccess.objects.filter(
                organisation=org, api_name="winkas", is_active=True
            ).exists():
                org_allowed = True
            else:
                return Response(
                    {"error": "Your organisation does not have access to WinKAS API"},
                    status=403,
                )

        else:
            # user-based check
            if not check_api_access(request.user, "winkas"):
                return Response(
                    {"error": "Your organisation does not have access to WinKAS API"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        try:
            return Response(
                winkas_cache.get_locations(default_winkas_credentials["UserName"])
            )
        except Exception as e:
            return Response(
                {"error": f"Failed to get WinKAS locations: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class WinKASBookingsAPIView(APIView, TokenOrAPIKeyMixin):
    """Get bookings for a WinKAS location"""

    permission_classes = [AllowAny]

    def get(self, request):
        # Allow X-API-KEY auth or regular user-based auth for WinKAS access.
        api_key_value = request.headers.get("X-API-KEY")
        if api_key_value:
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key_value, is_active=True
            ).first()
            if not key_obj:
                return Response({"error": "Invalid or inactive API key."}, status=403)

            org = None
            if key_obj.branch:
                org = key_obj.branch.suborganisation.organisation
            elif getattr(key_obj, "user", None):
                org = get_org_from_user(key_obj.user)

            if (
                not org
                or not OrganisationAPIAccess.objects.filter(
                    organisation=org, api_name="winkas", is_active=True
                ).exists()
            ):
                return Response(
                    {"error": "Your organisation does not have access to WinKAS API"},
                    status=403,
                )
        else:
            # user-based check
            if not check_api_access(request.user, "winkas"):
                return Response(
                    {"error": "Your organisation does not have access to WinKAS API"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        location = request.query_params.get("location")
        sub_locations = request.query_params.get("sub_locations")

        if not location:
            return Response(
                {"error": "location parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if sub_locations:
            sub_locations = sub_locations.split(",")
            sub_locations = [int(item) for item in sub_locations]

        try:
            data = winkas_cache.get_booking_data(
                default_winkas_credentials["UserName"], int(location), sub_locations
            )
            data["bookings"].sort(key=lambda x: x["booking_data"]["start"])
            return Response(data)
        except Exception as e:
            return Response(
                {"error": f"Failed to get WinKAS bookings: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class KMDDataAPIView(APIView, TokenOrAPIKeyMixin):
    """Get KMD data for a location"""

    permission_classes = [AllowAny]

    def post(self, request):
        # Allow X-API-KEY auth or regular user-based auth for KMD access.
        api_key_value = request.headers.get("X-API-KEY")
        if api_key_value:
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key_value, is_active=True
            ).first()
            if not key_obj:
                return Response({"error": "Invalid or inactive API key."}, status=403)

            org = None
            if key_obj.branch:
                org = key_obj.branch.suborganisation.organisation
            elif getattr(key_obj, "user", None):
                org = get_org_from_user(key_obj.user)

            if (
                not org
                or not OrganisationAPIAccess.objects.filter(
                    organisation=org, api_name="kmd", is_active=True
                ).exists()
            ):
                return Response(
                    {"error": "Your organisation does not have access to KMD API"},
                    status=403,
                )
        else:
            # user-based check
            if not check_api_access(request.user, "kmd"):
                return Response(
                    {"error": "Your organisation does not have access to KMD API"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return Response(
                {"error": "Invalid JSON"}, status=status.HTTP_400_BAD_REQUEST
            )

        location = body.get("location")
        sub_locations = body.get("sub_locations", [])

        if not location:
            return Response(
                {"error": "location is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Cache key
        cache_key = f"kmd_data_{slugify(location)}"
        kmd_locations_data = cache.get(cache_key)

        if kmd_locations_data is None:
            kmd_locations_data = fetch_kmd_data(location)
            if kmd_locations_data is not None:
                # Cache for 15 minutes
                cache.set(cache_key, kmd_locations_data, 900)
            else:
                return Response(
                    {"error": "Invalid location or failed to fetch data"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if location in kmd_locations_data:
            data_for_location = {"loc_name": location}
            if sub_locations != "all" and len(sub_locations) > 0:
                data_for_location["data"] = []
                data_for_location["is_sub_loc"] = True
                for sub_loc in kmd_locations_data[location]:
                    if (
                        sub_loc["ObjectName"] in sub_locations
                        or sub_loc["PartOfObjectName"] in sub_locations
                    ):
                        data_for_location["data"].append(sub_loc)
            else:
                data_for_location["data"] = kmd_locations_data[location]
                data_for_location["is_sub_loc"] = False
            return Response(data_for_location)
        else:
            if kmd_locations_data:
                keys = list(kmd_locations_data.keys())
                if keys:
                    first_key = keys[0]
                    data_for_location = {
                        "loc_name": location,
                        "data": kmd_locations_data[first_key],
                        "is_sub_loc": False,
                    }
                    return Response(data_for_location)

            return Response(
                {"error": f"No data found for location {location}"},
                status=status.HTTP_404_NOT_FOUND,
            )


class KMDLocationsAPIView(APIView, TokenOrAPIKeyMixin):
    """Get available KMD locations"""

    permission_classes = [AllowAny]

    def get(self, request):
        # Allow X-API-KEY auth or regular user-based auth for KMD access.
        api_key_value = request.headers.get("X-API-KEY")
        if api_key_value:
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key_value, is_active=True
            ).first()
            if not key_obj:
                return Response({"error": "Invalid or inactive API key."}, status=403)

            org = None
            if key_obj.branch:
                org = key_obj.branch.suborganisation.organisation
            elif getattr(key_obj, "user", None):
                org = get_org_from_user(key_obj.user)

            if (
                not org
                or not OrganisationAPIAccess.objects.filter(
                    organisation=org, api_name="kmd", is_active=True
                ).exists()
            ):
                return Response(
                    {"error": "Your organisation does not have access to KMD API"},
                    status=403,
                )
        else:
            # user-based check
            if not check_api_access(request.user, "kmd"):
                return Response(
                    {"error": "Your organisation does not have access to KMD API"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        return Response(kmd_location_names)
