## SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
## SPDX-License-Identifier: AGPL-3.0-only

from datetime import datetime, timedelta
from django.db.models import Q
from django.core.exceptions import ValidationError
from django.apps import apps
from django.core.cache import cache
from django.conf import settings
from rest_framework import status
import json
import requests
import logging
import re
import pandas as pd
import pytz
import feedparser
from pathlib import Path
from zoneinfo import ZoneInfo
from .utils import (
    make_aware_if_needed,
    _normalize_text,
    CacheHandler,
)

logger = logging.getLogger(__name__)


def _check_overlap(start1, end1, start2, end2):
    """Check if two time ranges overlap."""
    return start1 < end2 and end1 > start2


def validate_scheduled_content(
    start_time, end_time, display_website_group, combine_with_default, instance_id=None
):
    """
    Validates a ScheduledContent instance (one-time event).
    """
    ScheduledContent = apps.get_model("app", "ScheduledContent")
    RecurringScheduledContent = apps.get_model("app", "RecurringScheduledContent")

    if not start_time or not end_time:
        return

    start_time = make_aware_if_needed(start_time)
    end_time = make_aware_if_needed(end_time)

    # 1. Check against other ScheduledContent
    # If this is an override (combine_with_default=False), it conflicts with ANY overlapping content.
    # If it's not an override, it only conflicts with overlapping OVERRIDES.

    conflicting_scheduled = ScheduledContent.objects.filter(
        display_website_group=display_website_group,
        start_time__lt=end_time,
        end_time__gt=start_time,
    )

    if instance_id:
        conflicting_scheduled = conflicting_scheduled.exclude(pk=instance_id)

    if not combine_with_default:
        # We are an override, so we conflict with everything
        if conflicting_scheduled.exists():
            conflict = conflicting_scheduled.first()
            content_name = conflict.slideshow or conflict.playlist
            raise ValidationError(
                f"Cannot schedule an override as other content is already present: '{content_name}'."
            )
    else:
        # We are not an override, so we only conflict with existing overrides
        overrides = conflicting_scheduled.filter(combine_with_default=False)
        if overrides.exists():
            conflict = overrides.first()
            content_name = conflict.slideshow or conflict.playlist
            raise ValidationError(
                f"Cannot schedule content as an override is already present: '{content_name}'."
            )

    # 2. Check against RecurringScheduledContent
    # We need to find recurring events that are active during [start_time, end_time]
    # and match the weekday and time.

    # Filter recurring events that are active during the date range of the scheduled content
    relevant_recurring = RecurringScheduledContent.objects.filter(
        display_website_group=display_website_group,
        active_from__lte=end_time.date(),
    ).filter(Q(active_until__isnull=True) | Q(active_until__gte=start_time.date()))

    if not combine_with_default:
        # We are an override, conflict with ANY recurring content in the slot
        pass
    else:
        # We are not an override, conflict only with recurring OVERRIDES
        relevant_recurring = relevant_recurring.filter(combine_with_default=False)

    # Force evaluation to a list to avoid repeated DB hits
    relevant_recurring = list(relevant_recurring)

    # Now iterate through the relevant recurring events and check for precise overlap
    # Since start_time and end_time can span multiple days, we iterate through the days of the scheduled content

    current_date = start_time.date()
    end_date = end_time.date()

    while current_date <= end_date:
        weekday = current_date.weekday()

        # Filter recurring events for this weekday
        days_recurring = [r for r in relevant_recurring if r.weekday == weekday]

        for recurring in days_recurring:
            # Construct the specific time range for this recurring event on this day
            r_start = make_aware_if_needed(
                datetime.combine(current_date, recurring.start_time)
            )
            r_end = make_aware_if_needed(
                datetime.combine(current_date, recurring.end_time)
            )

            if _check_overlap(start_time, end_time, r_start, r_end):
                content_name = recurring.slideshow or recurring.playlist
                msg = (
                    f"Cannot schedule content as a recurring override is already present: '{content_name}'."
                    if recurring.combine_with_default is False
                    else f"Cannot schedule an override as other recurring content is already present: '{content_name}'."
                )
                # Adjust message based on who is the override
                if not combine_with_default:
                    raise ValidationError(
                        f"Cannot schedule an override as other recurring content is already present: '{content_name}'."
                    )
                else:
                    raise ValidationError(
                        f"Cannot schedule content as a recurring override is already present: '{content_name}'."
                    )

        current_date += timedelta(days=1)


def validate_recurring_content(
    weekday,
    start_time,
    end_time,
    active_from,
    active_until,
    display_website_group,
    combine_with_default,
    instance_id=None,
):
    """
    Validates a RecurringScheduledContent instance.
    """
    ScheduledContent = apps.get_model("app", "ScheduledContent")
    RecurringScheduledContent = apps.get_model("app", "RecurringScheduledContent")

    if not active_until:
        # If no end date, check 5 years into the future
        check_until = active_from + timedelta(days=365 * 5)
    else:
        check_until = active_until

    # 1. Check against other RecurringScheduledContent
    conflicting_recurring = RecurringScheduledContent.objects.filter(
        display_website_group=display_website_group,
        weekday=weekday,
        start_time__lt=end_time,
        end_time__gt=start_time,
        active_from__lte=check_until,
    ).filter(Q(active_until__isnull=True) | Q(active_until__gte=active_from))

    if instance_id:
        conflicting_recurring = conflicting_recurring.exclude(pk=instance_id)

    if not combine_with_default:
        # We are an override, conflict with ANY overlapping recurring
        if conflicting_recurring.exists():
            conflict = conflicting_recurring.first()
            content_name = conflict.slideshow or conflict.playlist
            raise ValidationError(
                f"Cannot schedule an override as other recurring content is already present: '{content_name}'."
            )
    else:
        # We are not an override, conflict only with recurring OVERRIDES
        overrides = conflicting_recurring.filter(combine_with_default=False)
        if overrides.exists():
            conflict = overrides.first()
            content_name = conflict.slideshow or conflict.playlist
            raise ValidationError(
                f"Cannot schedule content as a recurring override is already present: '{content_name}'."
            )

    # 2. Check against ScheduledContent
    # Optimization: Fetch all potentially conflicting ScheduledContent in one query
    # instead of iterating through every day.

    # We need ScheduledContent that:
    # - Is in the same group
    # - Overlaps with the date range [active_from, check_until]
    # - If we are override: ANY content. If we are not: only OVERRIDE content.

    potential_conflicts = ScheduledContent.objects.filter(
        display_website_group=display_website_group,
        start_time__lt=make_aware_if_needed(
            datetime.combine(check_until, datetime.max.time())
        ),
        end_time__gt=make_aware_if_needed(
            datetime.combine(active_from, datetime.min.time())
        ),
    )

    if instance_id:
        # This is tricky because we are validating a RecurringContent, but checking against ScheduledContent.
        # instance_id refers to RecurringContent, so we don't exclude anything from ScheduledContent.
        pass

    if combine_with_default:
        # We are not an override, so we only care about ScheduledContent that IS an override
        potential_conflicts = potential_conflicts.filter(combine_with_default=False)

    # Now iterate through the potential conflicts and check if they actually hit the weekday and time
    for sc in potential_conflicts:
        # Check if this ScheduledContent overlaps with any occurrence of the recurring event

        # Intersection of date ranges
        sc_start_date = sc.start_time.date()
        sc_end_date = sc.end_time.date()

        overlap_start_date = max(active_from, sc_start_date)
        overlap_end_date = min(check_until, sc_end_date)

        if overlap_start_date > overlap_end_date:
            continue

        # Iterate through days in the intersection to find if our weekday is present
        # Optimization: jump to the first occurrence of 'weekday'

        days_until_weekday = (weekday - overlap_start_date.weekday() + 7) % 7
        first_occurrence = overlap_start_date + timedelta(days=days_until_weekday)

        if first_occurrence > overlap_end_date:
            continue

        # If we found at least one day that is the correct weekday within the overlap,
        # we need to check the time overlap on that day.
        # Since the recurring event is the same time every day, and ScheduledContent might span multiple days,
        # we need to be careful.

        # We iterate through all occurrences in the overlap range
        current_occurrence = first_occurrence
        while current_occurrence <= overlap_end_date:
            # Check time overlap on this specific day

            # Recurring time on this day
            r_start = make_aware_if_needed(
                datetime.combine(current_occurrence, start_time)
            )
            r_end = make_aware_if_needed(datetime.combine(current_occurrence, end_time))

            # ScheduledContent time is sc.start_time to sc.end_time
            # It definitely overlaps if we are here, because sc spans this whole day (or part of it)
            # But we need to check if the *times* overlap.

            if _check_overlap(sc.start_time, sc.end_time, r_start, r_end):
                content_name = sc.slideshow or sc.playlist
                if not combine_with_default:
                    raise ValidationError(
                        f"Cannot schedule an override as other content is present: '{content_name}' on {current_occurrence}."
                    )
                else:
                    raise ValidationError(
                        f"Cannot schedule content as an override is present: '{content_name}' on {current_occurrence}."
                    )

            current_occurrence += timedelta(days=7)


###############################################################################
# DDB (Danish Digital Library) Services
###############################################################################

# Dictionary with external API URLs and supported libraries per kommune.
DDB_EVENT_API_URLS = {
    "events_path": "/events",
    "opening_hours_path": "/opening_hours",
    "kommuner": {
        "Brøndby": {
            "base_url": "https://www.brondby-bibliotekerne.dk/api/v1",
            "libraries": [
                {"name": "Biblioteket i Kilden", "branch_id": 10},
                {"name": "Biblioteket i Brønden", "branch_id": 12},
                {"name": "Brøndbyvester Bibliotek", "branch_id": 11},
            ],
        },
        "København": {
            "base_url": "https://bibliotek.kk.dk/api/v1",
            "libraries": [
                {"name": "Hovedbiblioteket", "branch_id": 230},
                {"name": "BIBLIOTEKET Rentemestervej", "branch_id": 209},
                {"name": "Bibliotekshuset", "branch_id": 228},
                {"name": "Ørestad Bibliotek", "branch_id": 246},
            ],
        },
        "Lyngby-Taarbaek": {
            "base_url": "https://www.lyngbybib.dk/api/v1",
            "libraries": [
                {"name": "Stadsbiblioteket", "branch_id": 17},
                {"name": "Lundtofte Bibliotek", "branch_id": 20},
                {"name": "Taarbæk Bibliotek", "branch_id": 19},
                {"name": "Virum Bibliotek", "branch_id": 18},
            ],
        },
        "Aalborg": {
            "base_url": "https://www.aalborgbibliotekerne.dk/api/v1",
            "libraries": [
                {"name": "Hals Bibliotek", "branch_id": 111},
                {"name": "Haraldslund", "branch_id": 115},
                {"name": "Hasseris Bibliotek", "branch_id": 117},
                {"name": "HistorieAalborg", "branch_id": 119},
                {"name": "Hovedbiblioteket", "branch_id": 170},
                {"name": "Nibe Bibliotek", "branch_id": 121},
                {"name": "Nørresundby Bibliotek", "branch_id": 192},
                {"name": "Storvorde Bibliotek", "branch_id": 125},
                {"name": "Svenstrup Bibliotek", "branch_id": 127},
                {"name": "Trekanten - Bibliotek og Kulturhus", "branch_id": 129},
                {"name": "Vejgaard Bibliotek", "branch_id": 135},
                {"name": "Vodskov Bibliotek", "branch_id": 137},
            ],
        },
        "Fredericia": {
            "base_url": "https://fredericiabib.dk/api/v1",
            "libraries": [
                {"name": "Fredericia Bibliotek", "branch_id": 10},
                {"name": "Taulov Bibliotek", "branch_id": 13},
                {"name": "Bredstrup-Pjedsted Hallen", "branch_id": 38},
                {"name": "Brugsen Egeskov", "branch_id": 37},
                {"name": "Erritsø Idrætscenter", "branch_id": 36},
            ],
        },
    },
    "Fredericia": {
        "url": "https://fredericiabib.dk/api/v1/events",
        "libraries": [
            "Fredericia Bibliotek",
            "Taulov Bibliotek",
            "Bredstrup-Pjedsted Hallen",
            "Brugsen Egeskov",
            "Erritsø Idrætscenter",
        ],
    },
}


class DDBEventFetchError(Exception):
    """Raised when fetching DDB events fails."""

    def __init__(self, message, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR):
        super().__init__(message)
        self.status_code = status_code


def _extract_unique_categories(events):
    unique_categories = {}

    for event in events or []:
        categories = event.get("categories")

        if isinstance(categories, list):
            iterable = categories
        elif categories is None:
            iterable = []
        else:
            iterable = [categories]

        for category in iterable:
            normalized = _normalize_text(category)
            if not normalized:
                continue

            label = str(category).strip()
            unique_categories.setdefault(normalized, label)

    # Return categories sorted alphabetically (case-insensitive) while keeping original casing
    return sorted(unique_categories.values(), key=lambda value: value.casefold())


def _collect_event_identifiers(event):
    identifiers = []
    if not isinstance(event, dict):
        return identifiers

    candidate_keys = (
        "id",
        "event_id",
        "eventId",
        "record_id",
        "recordId",
        "uuid",
        "slug",
    )

    for key in candidate_keys:
        value = event.get(key)
        if isinstance(value, (str, int, float)):
            text = str(value).strip()
            if text:
                identifiers.append(text)

    url_value = event.get("url")
    if isinstance(url_value, str):
        text = url_value.strip()
        if text:
            identifiers.append(text)

    title = event.get("title")
    start_time = event.get("date_time", {}).get("start")
    if isinstance(title, (str, int, float)) and isinstance(
        start_time, (str, int, float)
    ):
        composite = f"{title}|{start_time}"
        text = composite.strip()
        if text:
            identifiers.append(text)

    return identifiers


def _event_matches_search(event, normalized_query):
    if not normalized_query:
        return True

    if not isinstance(event, dict):
        return False

    candidate_values = []

    for key in (
        "title",
        "subtitle",
        "body",
        "description",
        "summary",
        "teaser",
        "location",
        "venue_name",
        "branch",
    ):
        value = event.get(key)
        if isinstance(value, (str, int, float)):
            candidate_values.append(str(value))

    address = event.get("address")
    if isinstance(address, dict):
        for key in ("location", "street", "city"):
            value = address.get(key)
            if isinstance(value, (str, int, float)):
                candidate_values.append(str(value))

    categories = event.get("categories")
    if isinstance(categories, list):
        candidate_values.extend(str(category) for category in categories)
    elif isinstance(categories, (str, int, float)):
        candidate_values.append(str(categories))

    tags = event.get("tags")
    if isinstance(tags, list):
        candidate_values.extend(str(tag) for tag in tags)

    for value in candidate_values:
        normalized_value = _normalize_text(value)
        if normalized_value and normalized_query in normalized_value:
            return True

    return False


def fetch_cached_ddb_events(kommune):
    if kommune not in DDB_EVENT_API_URLS["kommuner"]:
        raise DDBEventFetchError(
            f"{kommune} is an invalid kommune.",
            status.HTTP_400_BAD_REQUEST,
        )

    cache_key = f"ddb_events_{kommune}"
    categories_cache_key = f"ddb_events_categories_{kommune}"
    cached_events = cache.get(cache_key)

    if isinstance(cached_events, list):
        if cache.get(categories_cache_key) is None:
            cache.set(
                categories_cache_key,
                _extract_unique_categories(cached_events),
                timeout=1800,
            )
        return cached_events

    events_path = DDB_EVENT_API_URLS["events_path"]
    api_url = DDB_EVENT_API_URLS["kommuner"][kommune]["base_url"]

    try:
        resp = requests.get(f"{api_url}{events_path}", timeout=15)
        resp.raise_for_status()
        raw_response_text = resp.text
        events = json.loads(raw_response_text)
    except requests.RequestException as exc:
        raise DDBEventFetchError(
            "Failed to fetch data from external API",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        ) from exc
    except json.JSONDecodeError as exc:
        raise DDBEventFetchError(
            f"Failed to decode JSON: {exc}",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        ) from exc
    except Exception as exc:
        raise DDBEventFetchError(
            f"Unexpected error processing response: {exc}",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        ) from exc

    valid_events = [event for event in events if isinstance(event, dict)]

    cache.set(cache_key, valid_events, timeout=1800)
    cache.set(
        categories_cache_key,
        _extract_unique_categories(valid_events),
        timeout=1800,
    )

    return valid_events


def get_cached_ddb_categories(kommune, events=None):
    categories_cache_key = f"ddb_events_categories_{kommune}"
    cached_categories = cache.get(categories_cache_key)

    if isinstance(cached_categories, list):
        return cached_categories

    if events is None:
        events = cache.get(f"ddb_events_{kommune}") or []

    if not isinstance(events, list):
        events = []

    categories = _extract_unique_categories(events)
    cache.set(categories_cache_key, categories, timeout=1800)
    return categories


###############################################################################
# SpeedAdmin Services
###############################################################################

SPEEDADMIN_API_URL = "https://speedadmin.dk/api/v1/bookings"  # Placeholder URL


def fetch_speedadmin_data():
    # This is a placeholder implementation based on what was in views.py
    # In a real implementation, this would fetch from the API

    # Return empty data and names for now
    return [], []


###############################################################################
# WinKAS Services
###############################################################################

# Global variables for WinKAS
default_winkas_credentials = {
    "UserName": getattr(settings, "WINKAS_USERNAME", ""),
    "UserPassword": getattr(settings, "WINKAS_PW", ""),
    "UserContractCode": getattr(settings, "WINKAS_CONTRACTCODE", ""),
}


def fetch_winkas_bookings(organisation, elements_to_update):
    """Fetch WinKAS bookings"""
    if not organisation or not elements_to_update:
        return
    api_url = "https://air.winkas.net/api/Calendar/GetAllResourceEventsInTimePeriod"

    if isinstance(elements_to_update, dict):
        multiple_entries = elements_to_update.get("bookables", {})
        resources = [key for key in multiple_entries]
    else:
        resources = [entry["id"] for entry in elements_to_update]

    local_tz = ZoneInfo("Europe/Copenhagen")
    now = datetime.now(local_tz)

    # Get midnight tomorrow in local time
    midnight_tomorrow = datetime.combine(
        (now + timedelta(days=1)).date(), datetime.min.time(), tzinfo=local_tz
    )

    body = {
        "Token": organisation.get("_token"),
        "StartTime": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "EndTime": midnight_tomorrow.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "Resources": resources,
    }

    try:
        response = requests.post(api_url, json=body)
        if response.status_code == 200:
            return clean_booking_response(elements_to_update, response.json())
    except Exception as e:
        print("Error when fetching bookings:", e)


def clean_booking_response(update_target, response_data):
    """Removes unnecessary properties and properly structures data"""

    def extract_booking_data(booking_list, booking):
        rc = booking.get("ResourceCalendarbooking")
        booking_list.append(
            {
                "subject": rc.get("Subject"),
                "start": rc.get("Start"),
                "stop": rc.get("Stop"),
                "booked_by": booking.get("BookingOwner").get("FirstName"),
            }
        )

    if isinstance(update_target, dict):
        bookables = update_target.get("bookables")
        for bookable in response_data["Resources"]:
            current_bookable = bookables.get(bookable.get("Id"))
            current_booking_list = current_bookable.get("bookings")
            calender_bookings = bookable["ResourceCalendarbookings"]
            if not current_bookable or not isinstance(calender_bookings, list):
                continue
            current_booking_list.clear()
            for booking in calender_bookings:
                extract_booking_data(current_booking_list, booking)

        for booking_list in bookables.values():
            booking_list["bookings"].sort(key=lambda x: x["start"])

        return bookables

    elif isinstance(update_target, list):
        for bookable in response_data["Resources"]:
            bookings_data = bookable["ResourceCalendarbookings"]
            if isinstance(bookings_data, list):
                bookings_list = next(
                    (
                        entry["bookings"]
                        for entry in update_target
                        if entry.get("id") == bookable["Id"]
                    ),
                    None,
                )
                bookings_list.clear()
                for booking in bookings_data:
                    extract_booking_data(bookings_list, booking)
                bookings_list.sort(key=lambda x: x["start"])

        return update_target


def refresh_winkas_token(organisation):
    """Refresh WinKAS authentication token"""
    api_url = "https://air.winkas.net/api/Authentication/Authenticate"
    body = {
        "UserName": default_winkas_credentials.get("UserName"),
        "UserPassword": default_winkas_credentials.get("UserPassword"),
        "UserContractCode": default_winkas_credentials.get("UserContractCode"),
    }
    try:
        response = requests.post(url=api_url, json=body).json()
        token = response.get("WinKasData", {}).get("CurrentToken")
        if token:
            organisation["_token"] = token
            return organisation
    except Exception as e:
        print("Failed to refresh token:", e)


def fetch_winkas_resources(organisation):
    """Fetch WinKAS resources"""
    api_url = "https://air.winkas.net/api/Calendar/GetAllResources"
    body = {"Token": organisation.get("_token")}
    try:
        response = requests.post(url=api_url, json=body)

        if response.status_code == 200:
            response = response.json()
            cleaned = clean_organisation_resources(response)
            organisation["_data"] = cleaned
            return organisation
    except Exception as e:
        print("Error occurred while getting resources")


def clean_organisation_resources(response_data):
    """Clean and structure WinKAS organisation resources"""
    cleaned_data = {}
    for resource in response_data.get("Resources", []):
        res_loc = resource.get("ResourceLocation")
        if res_loc and isinstance(res_loc, dict):
            location_name = res_loc.get("Name")
            location_id = res_loc.get("Id")
            address = res_loc.get("Address")
            if not location_name or not location_id or not address:
                continue
            if location_id not in cleaned_data:
                cleaned_data[location_id] = {
                    "id": location_id,
                    "location_name": location_name,
                    "bookables": {},
                }
            cleaned_data[location_id]["bookables"][resource.get("Id")] = {
                "name": resource.get("Name"),
                "id": resource.get("Id"),
                "bookings": [],
            }
    return cleaned_data


# Initialize WinKAS cache handler
winkas_cache = CacheHandler(
    token_refresh_func=refresh_winkas_token,
    keys_refresh_func=fetch_winkas_resources,
    data_refresh_func=fetch_winkas_bookings,
)


###############################################################################
# KMD Services
###############################################################################


# Load the Excel file for KMD
def load_kmd_location_data():
    """Load KMD location data from Excel file"""
    try:
        file_path = Path(__file__).resolve().parent / "data" / "KMD" / "lokale ID.xlsx"
        if not file_path.exists():
            # Fallback path if needed, though __file__ based should work
            file_path = (
                Path(settings.BASE_DIR)
                / "backend"
                / "openstream"
                / "app"
                / "data"
                / "KMD"
                / "lokale ID.xlsx"
            )

        df = pd.read_excel(file_path)
        df["Anlægsrapport"] = df["Anlægsrapport"].astype(str).str.strip()
        df["Lokalenavn"] = df["Lokalenavn"].astype(str).str.strip()

        def clean_displayname(location_name):
            if location_name == "" or not isinstance(location_name, str):
                return location_name
            prefix, _, rest = location_name.partition("-")
            if rest and re.search(r"\b(EBH|LH|LYIB|VH)\b", prefix):
                return rest.strip()
            else:
                return location_name.strip()

        location_names = (
            df.groupby("Anlægsrapport")["Lokalenavn"]
            .apply(lambda x: sorted(x.str.strip().apply(clean_displayname).tolist()))
            .to_dict()
        )
        return location_names
    except Exception as e:
        print(f"Error loading KMD location data: {e}")
        return {}


# Global variables for KMD
KMD_API_URL = (
    "https://booking-ltk.kmd.dk/kmd_webapi/api/Monitor/GetFilteredAccessControlRecords?"
)
KMD_FACILITIES = {
    "Engelsborghallerne": "EBH",
    "Lyngby Idrætsby": "LST",
    "Lundtoftehallen": "LH",
    "Virumhallerne": "VH",
}
kmd_location_names = load_kmd_location_data()


def clean_kmd_displayname(location_name):
    """Clean KMD location display names"""
    if location_name == "" or not isinstance(location_name, str):
        return location_name
    prefix, _, rest = location_name.partition("-")
    if rest and re.search(r"\b(EBH|LH|LYIB|VH)\b", prefix):
        return rest.strip()
    else:
        return location_name.strip()


def fetch_kmd_data(facility=""):
    """Fetch KMD data for a specific facility"""
    if facility and facility not in KMD_FACILITIES:
        return None

    try:
        headers = {"Content-Type": "application/json"}
        today_date = datetime.today().strftime("%Y-%m-%d")

        # Get API key from settings
        kmd_api_key = getattr(settings, "KMD_API_KEY", "")
        facility_id = KMD_FACILITIES[facility]

        response = requests.get(
            KMD_API_URL
            + f"facility={facility_id}&dateTimeFrom={today_date}&dateTimeTo={today_date}&authenticationCode={kmd_api_key}",
            headers=headers,
        )

        if response.status_code == 200:
            print("KMD data fetched successfully")
            data = response.json()
            data = data["AccessControlRecords"]["OccasionRecords"]

            result_data = []

            for item in data:
                EO_booking = datetime.strptime(item["TomKlo"], "%H:%M").time()
                # Get current time adapted to time zone
                tz = pytz.timezone("Europe/Copenhagen")
                current_time = datetime.now(tz).time()

                # Skip any data without facility name and any that's already passed
                if item["FacilityName"] and EO_booking > current_time:
                    item["FacilityName"] = item["FacilityName"].strip()

                    extracted_data = {
                        "FacilityName": item["FacilityName"].strip(),
                        "PartOfObjectName": clean_kmd_displayname(
                            item["PartOfObjectName"]
                        ),
                        "ObjectName": clean_kmd_displayname(item["ObjectName"]),
                        "Activity": item["Activity"],
                        "CustomerName": item["CustomerName"],
                        "FomKlo": item["FomKlo"],
                        "TomKlo": item["TomKlo"],
                    }

                    result_data.append(extracted_data)

            # Sort by start time
            result_data.sort(key=lambda x: x["FomKlo"])

            # Group by FacilityName
            grouped_data = {}
            for item in result_data:
                fname = item["FacilityName"]
                if fname not in grouped_data:
                    grouped_data[fname] = []
                grouped_data[fname].append(item)

            print("Successfully refetched the KMD data")
            return grouped_data
        else:
            message = (
                f"error: Failed to fetch data. status_code: {response.status_code}"
            )
            print(message)
            return None
    except Exception as e:
        print(f"Error fetching KMD data: {e}")
        return None


###############################################################################
# DR Services
###############################################################################

# RSS feed URLs
DR_FEED = {
    "Indland": "https://www.dr.dk/nyheder/service/feeds/indland",
    "Udland": "https://www.dr.dk/nyheder/service/feeds/udland",
    "Penge": "https://www.dr.dk/nyheder/service/feeds/penge",
    "Politik": "https://www.dr.dk/nyheder/service/feeds/politik",
    "Sporten": "https://www.dr.dk/nyheder/service/feeds/sporten",
    "Seneste sport": "https://www.dr.dk/nyheder/service/feeds/senestesport",
    "Viden": "https://www.dr.dk/nyheder/service/feeds/viden",
    "Kultur": "https://www.dr.dk/nyheder/service/feeds/kultur",
    "Musik": "https://www.dr.dk/nyheder/service/feeds/musik",
    "Mit liv": "https://www.dr.dk/nyheder/service/feeds/mitliv",
    "Mad": "https://www.dr.dk/nyheder/service/feeds/mad",
    "Vejret": "https://www.dr.dk/nyheder/service/feeds/vejret",
    "Alle nyheder": "https://www.dr.dk/nyheder/service/feeds/allenyheder",
}


def fetch_rss_data():
    news_data = []
    try:
        for category, url in DR_FEED.items():
            try:
                feed = feedparser.parse(url)
                feed_items = []
                for entry in feed.entries:
                    # Extract image URL from media content
                    image_url = ""
                    if hasattr(entry, "media_content") and entry.media_content:
                        # feedparser stores media:content as media_content list
                        image_url = (
                            entry.media_content[0].get("url", "")
                            if entry.media_content
                            else ""
                        )
                    elif hasattr(entry, "links"):
                        # Sometimes images are in links with type image/*
                        for link in entry.links:
                            if link.get("type", "").startswith("image/"):
                                image_url = link.get("href", "")
                                break

                    feed_items.append(
                        {
                            "title": entry.title,
                            "link": entry.link,
                            "published": (
                                entry.published if hasattr(entry, "published") else ""
                            ),
                            "summary": (
                                entry.summary if hasattr(entry, "summary") else ""
                            ),
                            "image": image_url,
                        }
                    )

                # Group items by feed/category as expected by frontend
                news_data.append({"name": category, "items": feed_items})
            except Exception as e:
                news_data.append(
                    {
                        "name": category,
                        "items": [],
                        "error": f"Failed to fetch {category}: {str(e)}",
                    }
                )
    except Exception as e:
        news_data = [
            {"name": "Error", "items": [], "error": f"Unexpected error: {str(e)}"}
        ]
    return news_data


DMI_WEATHER_LOCATIONS = {
    # Sjælland
    "København": {"latitude": 55.6140, "longitude": 12.6454},  # Københavns Lufthavn
    "Lyngby-Taarbæk": {"latitude": 55.7655, "longitude": 12.5110},
    "Roskilde": {"latitude": 55.5868, "longitude": 12.1363},  # Roskilde Lufthavn
    "Hørsholm": {"latitude": 55.8765, "longitude": 12.4121},  # Sjælsmark
    "Hillerød": {
        "latitude": 55.9276,
        "longitude": 12.3008,
    },  # Hillerød Centralrenseanlæg
    "Næstved": {"latitude": 55.2502, "longitude": 11.7690},  # Næstved Maglegårdsvej
    "Slagelse": {"latitude": 55.4024, "longitude": 11.3546},  # Slagelse Pumpestation
    # Jylland
    "Aarhus": {"latitude": 56.3083, "longitude": 10.6254},  # Århus Lufthavn
    "Aalborg": {"latitude": 57.0963, "longitude": 9.8505},  # Flyvestation Ålborg
    "Esbjerg": {"latitude": 55.5281, "longitude": 8.5631},  # Esbjerg Lufthavn
    "Randers": {"latitude": 56.4537, "longitude": 10.0698},  # Randers Centralrenseanlæg
    "Kolding": {"latitude": 55.4715, "longitude": 9.4844},  # Kolding
    "Horsens": {"latitude": 55.8680, "longitude": 9.7869},  # Horsens/Bygholm
    "Vejle": {"latitude": 55.7022, "longitude": 9.5390},  # Vejle Centralrenseanlæg
    "Herning": {"latitude": 56.1364, "longitude": 8.9766},  # Høgild
    "Silkeborg": {"latitude": 56.1998, "longitude": 9.5779},  # Silkeborg Forsyning
    "Fredericia": {"latitude": 55.5518, "longitude": 9.7217},  # Fredericia
}


def fetch_weather_data(location):
    try:
        weather_api_url = f"https://api.open-meteo.com/v1/forecast?latitude={DMI_WEATHER_LOCATIONS[location]['latitude']}&longitude={DMI_WEATHER_LOCATIONS[location]['longitude']}&current=temperature_2m,precipitation,cloud_cover,relative_humidity_2m&models=dmi_seamless"

        response = requests.get(weather_api_url)

        if response.status_code != 200:
            return {"error": f"HTTP error {response.status_code}"}

        data = response.json()

        # Extract relevant data with .get() to prevent KeyErrors
        temperature = data.get("current", {}).get("temperature_2m", "N/A")
        precipitation = data.get("current", {}).get("precipitation", 0)
        cloud_cover = data.get("current", {}).get("cloud_cover", 0)

        def get_precipitation_text(precip):
            if precip < 0.1:
                return ""
            elif precip < 5:
                return "💦"
            else:
                return ""

        def get_cloud_cover_text(cloud_cover):
            if cloud_cover < 10:
                return "☀️"
            elif cloud_cover < 50:
                return "⛅"
            elif cloud_cover < 80:
                return "☁️"
            else:
                return ""

        return {
            "temperature": temperature,
            "precipitationText": get_precipitation_text(precipitation),
            "cloudCoverText": get_cloud_cover_text(cloud_cover),
        }

    except requests.RequestException as e:
        return {"error": f"Request error: {str(e)}"}
    except KeyError as e:
        return {"error": f"Missing key in response: {str(e)}"}
    except Exception as e:
        return {"error": f"Unexpected error: {str(e)}"}
