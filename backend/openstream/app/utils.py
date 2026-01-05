# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

import os
import hashlib
import logging
import fitz  # PyMuPDF
import time
import copy
import unicodedata
from io import BytesIO
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.utils import timezone


def make_aware_if_needed(dt):
    """Make a datetime object timezone-aware if it's naive."""
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def calculate_aspect_ratio(width, height):
    """
    Calculate aspect ratio from width and height and return as a standardized string.
    Common aspect ratios are simplified to their standard format.
    """
    from math import gcd

    if not width or not height or width <= 0 or height <= 0:
        return "16:9"  # Default fallback

    # Calculate GCD to simplify the ratio
    common_divisor = gcd(int(width), int(height))
    simplified_width = int(width) // common_divisor
    simplified_height = int(height) // common_divisor

    # Map common ratios to their standard representation
    ratio_map = {
        (16, 9): "16:9",
        (4, 3): "4:3",
        (21, 9): "21:9",
        (9, 16): "9:16",
        (3, 4): "3:4",
        (9, 21): "9:21",
        (64, 27): "21:9",  # 2.37:1 mapped to 21:9
        (37, 20): "1.85:1",  # Common cinema ratio
        (239, 100): "2.39:1",  # Common widescreen ratio
        (185, 100): "1.85:1",
        (1, 1): "1:1",  # Square
    }

    # Check if this matches a common ratio
    ratio_key = (simplified_width, simplified_height)
    if ratio_key in ratio_map:
        return ratio_map[ratio_key]

    # For uncommon ratios, return the simplified form
    return f"{simplified_width}:{simplified_height}"


logger = logging.getLogger(__name__)


def generate_content_hash(file_obj, chunk_size=8192):
    """Generates a short hash of the file content safely."""
    hasher = hashlib.sha256()
    try:
        if hasattr(file_obj, "seek"):
            file_obj.seek(0)

        # Read in chunks to avoid memory issues with large videos
        while chunk := file_obj.read(chunk_size):
            hasher.update(chunk)

        if hasattr(file_obj, "seek"):
            file_obj.seek(0)  # Reset pointer

        return hasher.hexdigest()[:12]
    except Exception as e:
        logger.error(f"Failed to generate hash: {e}")
        return None


def create_hashed_filename(filename, content_hash):
    """Returns filename-hash.ext."""
    if not content_hash:
        return filename
    base, ext = os.path.splitext(filename)
    return f"{base}-{content_hash}{ext}"


def convert_pdf_to_png(pdf_file):
    """
    Converts the first page of a PDF to a PNG InMemoryUploadedFile.
    Returns the new file object or None if conversion fails.
    """
    try:
        if hasattr(pdf_file, "seek"):
            pdf_file.seek(0)
        pdf_bytes = pdf_file.read()

        # Convert first page to image
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page = doc.load_page(0)
        pix = page.get_pixmap()
        img_bytes = BytesIO(pix.tobytes("png"))

        # Create new filename
        original_name = getattr(pdf_file, "name", "document.pdf")
        new_name = os.path.splitext(original_name)[0] + ".png"

        return InMemoryUploadedFile(
            file=img_bytes,
            field_name="file",
            name=new_name,
            content_type="image/png",
            size=img_bytes.getbuffer().nbytes,
            charset=None,
        )
    except Exception as e:
        logger.error(f"PDF to PNG conversion failed: {e}")
        return None


def convert_document_pdf(doc_id):
    from .models import Document

    try:
        doc = Document.objects.get(pk=doc_id)
        # Re-open the file to ensure we have a file handle
        doc.file.open()

        png_file = convert_pdf_to_png(doc.file)
        if png_file:
            # We are updating an existing record.
            # Note: The original file is still on storage.
            # We might want to delete it, but let's focus on replacing the reference.
            old_file_name = doc.file.name

            doc.file = png_file
            content_hash = generate_content_hash(doc.file)
            doc.file.name = create_hashed_filename(doc.file.name, content_hash)
            doc.file_type = Document.FileType.PNG
            doc.save()

            # Optional: Delete the old PDF file from storage if needed.
            # Since we don't have easy access to storage backend delete here without knowing the backend,
            # we rely on django-cleanup or manual cleanup if configured.
            # But we can try to delete the old file if it was local.
            # For now, we just update the record.

    except Exception as e:
        logger.error(f"Background conversion failed for document {doc_id}: {e}")


def _normalize_text(value):
    if not isinstance(value, (str, int, float)):
        return ""

    text = str(value).strip()
    if not text:
        return ""

    normalized = unicodedata.normalize("NFKC", text)
    return normalized.casefold()


def update_if_minutes_elapsed(minutes, last_update, update_func):
    if time.time() > last_update + 60 * minutes:
        update_func()


class CacheHandler:
    """
    Helper class that tracks cache timing for individual entries
    """

    def __init__(self, **kwargs):
        self._cache = kwargs.get("initial_keys", {})
        self.data_refresh_timer_mins = kwargs.get("data_refresh_timer_mins", 15)
        self.data_refresh_func = kwargs.get("data_refresh_func")

        self.token_refresh_timer_mins = kwargs.get("token_refresh_timer_mins", 15)
        self.token_refresh_func = kwargs.get("token_refresh_func")

        self.keys_refresh_timer_mins = kwargs.get(
            "keys_refresh_timer_mins", 60 * 24
        )  # Default to refresh once a day
        self.keys_refresh_func = kwargs.get("keys_refresh_func")
        if not self.keys_refresh_func:
            raise Exception("A key refresh function must be provided")

    def get_booking_data(self, organisation, location, sub_locations):
        data = self._get_or_update_booking_data(organisation, location, sub_locations)
        return self._filter_bookables(data)

    def _filter_bookables(self, data):
        # Create a deep copy so original is not mutated
        filtered_data = copy.deepcopy(data)

        # Remove top-level _last_refresh_booking_data
        filtered_data.pop("_last_refresh_booking_data", None)

        if "bookables" in filtered_data:
            filtered_data["bookings"] = []
            for key, bookable in filtered_data["bookables"].items():
                bookings = bookable.get("bookings")
                if bookings:
                    bookable.pop("_last_refresh_booking_data", None)
                    for booking in bookings:
                        filtered_data["bookings"].append(
                            {
                                "sub_location": bookable["name"],
                                "sub_location_id": bookable["id"],
                                "booking_data": booking,
                            }
                        )

            # Replace bookables with the structured bookings list
            filtered_data.pop("bookables", None)

        return filtered_data

    def get_locations(self, organisation):
        """
        Returns the entire _data field of a root obj
        """
        if organisation is None:
            raise AttributeError("Must specify organisation")
        obj = self._get_or_update_locations(organisation)
        return obj.get("_data")

    def _get_or_update_booking_data(self, organisation, location, sub_locations):
        found_org, found_loc, found_sub_locs = self._return_found_org_loc_and_sub_loc(
            organisation, location, sub_locations
        )
        if not found_org or not found_loc or (sub_locations and not found_sub_locs):
            self._get_or_update_locations(organisation)
            found_org, found_loc, found_sub_locs = (
                self._return_found_org_loc_and_sub_loc(
                    organisation, location, sub_locations
                )
            )

        elements_to_update = found_loc
        if sub_locations:
            elements_to_update = []
            bookable_dict = {}
            for sub_loc in found_sub_locs:
                bookable_dict[sub_loc["id"]] = sub_loc
                if self._is_expired_booking_data(sub_loc):
                    elements_to_update.append(sub_loc)
            self._update_booking_data(found_org, elements_to_update)

            data = {
                "location_name": found_loc.get("location_name"),
                "bookables": bookable_dict,
            }
            return data
        elif self._is_expired_booking_data(found_loc):
            self._update_booking_data(found_org, found_loc)
            return found_loc

    def _get_or_update_locations(self, entry):
        organisation = self._get_root(entry)
        if organisation is None:
            self._cache[entry] = {"_last_refresh_keys": 0}
            organisation = self._get_root(entry)

        self._update_keys_if_expired(organisation)
        return organisation

    def _update_keys_if_expired(self, organisation):
        if self._is_expired_keys(organisation):
            self._update_keys(organisation)

    def _update_keys(self, organisation):
        self._update_token_if_needed(organisation)
        response = self.keys_refresh_func(organisation)
        if response:
            organisation["_last_refresh_keys"] = self._now()
            return True
        return False

    def _update_booking_data(self, organisation, entries_to_update):
        self._update_token_if_needed(organisation)
        result = self.data_refresh_func(organisation, entries_to_update)
        if result is not None:
            if isinstance(entries_to_update, list):
                for entry in entries_to_update:
                    entry["_last_refresh_booking_data"] = self._now()
            else:
                entries_to_update["_last_refresh_booking_data"] = self._now()
                bookables = entries_to_update.get("bookables")
                if bookables:
                    for bookable in bookables.values():
                        bookable["_last_refresh_booking_data"] = self._now()

    def _return_found_org_loc_and_sub_loc(self, organisation, location, sub_locations):
        found_org = self._cache.get(organisation, {})
        found_loc = found_org.get("_data", {}).get(location)
        found_sub_loc = []
        if found_loc and sub_locations:
            bookables = found_loc.get("bookables", {})
            for entry in bookables:
                if entry in sub_locations:
                    found_sub_loc.append(bookables[entry])

        return (found_org, found_loc, found_sub_loc)

    def _update_token(self, organisation):
        updated_org = self.token_refresh_func(organisation)
        if updated_org:
            updated_org["_last_refresh_token"] = self._now()

    def _update_token_if_needed(self, organisation):
        if self.token_refresh_func and self._is_expired_token(organisation):
            return self._update_token(organisation)

    def _is_expired_token(self, obj):
        return self._is_expired(
            obj, "_last_refresh_token", self.token_refresh_timer_mins * 60
        )

    def _is_expired_keys(self, obj):
        return self._is_expired(
            obj, "_last_refresh_keys", self.keys_refresh_timer_mins * 60
        )

    def _is_expired_booking_data(self, obj):
        return self._is_expired(
            obj, "_last_refresh_booking_data", self.data_refresh_timer_mins * 60
        )

    def _is_expired(self, obj, obj_key, self_timer_value):
        if not obj:
            return False
        return (
            self._now() - obj.get(obj_key, 0) > self_timer_value
            if isinstance(obj, dict) and obj.get(obj_key)
            else True
        )

    def _get_root(self, organisation):
        return self._cache.get(organisation)

    def _now(self):
        return time.time()
