import html
import json
from pathlib import Path
from typing import Any

from django.http import HttpResponse
from rest_framework.views import exception_handler

_TEMPLATE_PATH = Path(__file__).resolve().parent / "templates" / "authcode_error.html"
_TEMPLATE_CACHE: str | None = None


def _get_template() -> str:
    global _TEMPLATE_CACHE
    if _TEMPLATE_CACHE is None:
        _TEMPLATE_CACHE = _TEMPLATE_PATH.read_text(encoding="utf-8")
    return _TEMPLATE_CACHE


def _render_error_html(status_code: int, detail: Any) -> str:
    try:
        detail_json = json.dumps(detail, indent=2, ensure_ascii=False)
    except Exception:
        detail_json = str(detail)

    safe_detail = html.escape(detail_json)

    template = _get_template()
    return (
        template.replace("__STATUS_CODE__", str(status_code))
        .replace("__DETAIL__", safe_detail)
    )


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    request = context.get("request") if context else None
    view = context.get("view") if context else None

    if response is None:
        return response

    is_auth_code_view = bool(view and view.__class__.__name__ == "AuthCodeAPIView")
    accepts_html = False
    if request and is_auth_code_view:
        accept_header = request.META.get("HTTP_ACCEPT", "")
        accepts_html = "text/html" in accept_header

    if accepts_html and is_auth_code_view:
        html_body = _render_error_html(response.status_code, response.data)
        return HttpResponse(html_body, status=response.status_code, content_type="text/html")

    return response
