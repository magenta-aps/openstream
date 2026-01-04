import os
import hashlib
import logging
import fitz  # PyMuPDF
from io import BytesIO
from django.core.files.uploadedfile import InMemoryUploadedFile


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
