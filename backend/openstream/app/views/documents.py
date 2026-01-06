# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
import logging
from urllib.parse import urljoin
from django.core.exceptions import ValidationError
from django.core.paginator import Paginator
from django.core.signing import SignatureExpired, BadSignature, TimestampSigner
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from app.models import (
    Branch,
    DisplayWebsite,
    Document,
    SlideshowPlayerAPIKey,
    Category,
    Tag,
)
from app.serializers import (
    DocumentSerializer,
)
from django.conf import settings

logger = logging.getLogger(__name__)

from app.permissions import (
    get_branch_from_request,
    user_can_access_branch,
    get_org_from_user,
    handle_branch_request,
)


class DocumentListView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Returns a filtered and paginated list of media files
        try:
            # Use the passed branch ID to check permissions.
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)

        # Get the organisation from the branch.
        organisation = branch.suborganisation.organisation

        # Fetch documents across all branches in the same organisation.
        # Organisations intentionally share media assets across branches, so access is org-wide here.
        docs = Document.objects.filter(
            branch__suborganisation__organisation=organisation
        ).order_by("-uploaded_at")

        # (Optional) Log the branch that was passed for auditing.
        logger.info(f"Document images fetched using branch id: {branch.id}")

        # JSON body input
        data = request.data

        title = data.get("title")
        if title:
            docs = docs.filter(title__icontains=title)

        category_ids_input = data.get("categories")
        if (
            category_ids_input is not None and category_ids_input != ""
        ):  # Check for None or empty string
            processed_category_ids = []
            if isinstance(category_ids_input, list):
                for cat_id in category_ids_input:
                    if str(cat_id).strip():  # Ensure not empty or just whitespace
                        try:
                            processed_category_ids.append(int(cat_id))
                        except (ValueError, TypeError):
                            logger.warning(
                                f"Invalid category ID '{cat_id}' in list, skipping."
                            )
            elif isinstance(category_ids_input, (str, int)):  # Single category ID
                if str(
                    category_ids_input
                ).strip():  # Ensure not empty or just whitespace
                    try:
                        processed_category_ids.append(int(category_ids_input))
                    except (ValueError, TypeError):
                        logger.warning(
                            f"Invalid single category ID '{category_ids_input}', skipping."
                        )
            # else: Unhandled type for category_ids_input, could log if necessary

            if processed_category_ids:
                docs = docs.filter(category_id__in=processed_category_ids)

        branch_ids = data.get("branches")
        if branch_ids:
            docs = docs.filter(branch_id__in=branch_ids)

        file_types = data.get("file_types")
        if file_types:
            docs = docs.filter(file_type__in=file_types)

        tag_ids = data.get("tags")
        if tag_ids:
            docs = docs.filter(tags__id__in=tag_ids).distinct()

        # Pagination
        DEFAULT_PAGE_SIZE = 10
        MAX_PAGE_SIZE = 100

        # Validate and sanitize page_size param
        try:
            page_size = int(request.query_params.get("page_size", DEFAULT_PAGE_SIZE))
        except ValueError:
            page_size = DEFAULT_PAGE_SIZE

        if page_size < 1:
            page_size = DEFAULT_PAGE_SIZE  # Fallback for negative or zero page_size
        elif page_size > MAX_PAGE_SIZE:
            page_size = MAX_PAGE_SIZE

        # Paginate the results.
        paginator = Paginator(docs, page_size)
        page_number = request.query_params.get("page", 1)
        page_obj = paginator.get_page(page_number)
        serializer = DocumentSerializer(
            page_obj.object_list,
            many=True,
            context={"request": request, "branch": branch},
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
            "results": serializer.data,
        }
        return Response(data)


class DocumentAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @handle_branch_request
    def get(self, request, branch, document_id):
        """Return metadata for a single document that belongs to the caller's organisation."""

        organisation = branch.suborganisation.organisation
        doc = get_object_or_404(
            Document,
            id=document_id,
            branch__suborganisation__organisation=organisation,
        )

        serializer = DocumentSerializer(
            doc, context={"request": request, "branch": branch}
        )
        return Response(serializer.data, status=200)

    @handle_branch_request
    def post(self, request, branch):
        """
        Upload a new document to a branch.
        Expects 'title' and 'file' in request, plus branch_id in data or query.
        Category and tag_names are optional
        """

        title = request.data.get("title")
        uploaded_file = request.FILES.get("file")
        category = request.data.get("category")
        tag_ids = request.data.getlist("tags[]") or []

        # Get organisation from the branch instead of user
        organisation = branch.suborganisation.organisation
        tags = Tag.objects.filter(id__in=tag_ids, organisation=organisation)

        if category:
            try:
                category = Category.objects.get(id=category, organisation=organisation)
            except Category.DoesNotExist:
                return Response(
                    {"error": "Category not found in your organisation."},
                    status=400,
                )

        if not title or not uploaded_file:
            return Response({"error": "Title and file are required"}, status=400)

        doc = Document(
            title=title,
            file=uploaded_file,
            branch=branch,
            category=category if category else None,
        )

        try:
            doc.full_clean()
            doc.save()
            doc.tags.set(
                tags
            )  # Many to many fields can't be instantiated directly on a new object

            return Response(
                DocumentSerializer(doc, context={"request": request}).data, status=201
            )
        except ValidationError as e:
            # Handle ValidationError properly
            if hasattr(e, "message_dict") and e.message_dict:
                message = e.message_dict.get("error", ["Validation error"])[0]
            elif hasattr(e, "messages") and e.messages:
                message = e.messages[0]
            else:
                message = str(e)
            return Response({"message": message}, status=400)
        except Exception as e:
            message = str(e)
            return Response({"message": message}, status=400)

    def put(self, request, document_id):
        """
        Update an existing document.
        """
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)
        doc = get_object_or_404(Document, id=document_id, branch=branch)

        title = request.data.get("title")
        tag_ids = request.data.getlist("tags[]") or []
        category = request.data.get("category", None)

        if category:
            try:
                category = Category.objects.get(
                    id=category, organisation=branch.suborganisation.organisation
                )
            except Category.DoesNotExist:
                return Response(
                    {"error": "Category not found in your organisation."},
                    status=400,
                )

        if not title:
            return Response({"error": "Title is required"}, status=400)

        doc.title = title
        doc.category = category

        # Get organisation from the branch instead of user
        organisation = branch.suborganisation.organisation
        tags = Tag.objects.filter(id__in=tag_ids, organisation=organisation)
        doc.tags.set(tags)

        try:
            doc.full_clean()
            doc.save()
            return Response(DocumentSerializer(doc, context={"request": request}).data)
        except ValidationError as e:
            # Handle ValidationError properly
            if hasattr(e, "message_dict") and e.message_dict:
                message = e.message_dict.get("error", ["Validation error"])[0]
            elif hasattr(e, "messages") and e.messages:
                message = e.messages[0]
            else:
                message = str(e)
            return Response({"message": message}, status=400)
        except Exception as e:
            message = str(e)
            return Response({"message": message}, status=400)

    def delete(self, request, document_id):
        try:
            branch = get_branch_from_request(request)
        except ValueError as e:
            return Response({"detail": str(e)}, status=403)
        doc = get_object_or_404(Document, id=document_id, branch=branch)
        doc.delete()
        return Response({"message": "Document deleted"}, status=204)


class DocumentFileView(APIView):
    """
    Example of a 'tokened' file download if you want to allow direct access
    with a secure link.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, document_id):
        token = request.query_params.get("token")
        branch_id = request.query_params.get("branch_id")
        if not token or not branch_id:
            raise Http404("Missing token or branch_id.")

        signer = TimestampSigner()
        try:
            value = signer.unsign(token, max_age=3600)
        except (SignatureExpired, BadSignature):
            raise Http404("Invalid or expired token.")

        expected = f"{document_id}:{branch_id}"
        if value != expected:
            raise Http404("Token mismatch.")

        branch = get_object_or_404(Branch, id=branch_id)
        doc = get_object_or_404(
            Document,
            id=document_id,
            branch__suborganisation__organisation=branch.suborganisation.organisation,
        )

        try:
            response = FileResponse(
                doc.file.open("rb"), content_type="application/octet-stream"
            )
            response["Content-Disposition"] = f'inline; filename="{doc.file.name}"'
            return response
        except Exception as e:
            logger.error(
                f"Error retrieving file for document {document_id}: {str(e)}",
                exc_info=True,
                extra={"document_id": document_id, "branch_id": branch_id},
            )
            raise Http404("File not found")


class DocumentFileTokenView(APIView):
    """
    Unified endpoint:

    1) If a Bearer token is present in the Authorization header:
       - We ignore DisplayWebsite (dw) and the API key checks.
       - We simply call get_branch_from_request(...) to ensure the user
         (or whoever is making the request) can access that branch.
       - We fetch the Document from that branch's organisation and return its URL.

    2) Otherwise (no Bearer token):
       - We look for `X-API-KEY`. If present & valid => OK.
       - If no API key => we use user-based auth (request.user).
       - We require ?id=<display_website_id> in query params to identify the branch.
       - We then fetch the Document from that branch’s organisation and return its URL.

    """

    permission_classes = [AllowAny]  # Because we do our own checks below.

    def get(self, request, document_id):
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            bearer_token = auth_header[len("Bearer ") :].strip()
            if not bearer_token:
                return Response({"detail": "Empty Bearer token."}, status=400)

            try:
                branch = get_branch_from_request(request)
            except ValueError as e:
                return Response({"detail": str(e)}, status=403)

            # Fetch the document from that branch’s organisation
            doc = get_object_or_404(
                Document,
                id=document_id,
                branch__suborganisation__organisation=branch.suborganisation.organisation,
            )

            media_url = getattr(settings, "MEDIA_URL", "")
            if media_url and media_url.startswith("http"):
                file_url = urljoin(media_url, doc.file.name)
            else:
                file_url = request.build_absolute_uri(doc.file.url)
            return Response({"file_url": file_url}, status=200)

        else:
            display_website_id = request.query_params.get("id")
            if not display_website_id:
                return Response(
                    {"detail": "Display website ID (param 'id') is required."},
                    status=400,
                )

            dw = get_object_or_404(DisplayWebsite, id=display_website_id)

            api_key_value = request.headers.get("X-API-KEY")
            if api_key_value:
                key_obj = SlideshowPlayerAPIKey.objects.filter(
                    key=api_key_value, is_active=True
                ).first()
                if not key_obj:
                    return Response(
                        {"detail": "Invalid or inactive API key."}, status=403
                    )
                # If the key is branch-limited, ensure it matches dw.branch
                if key_obj.branch:
                    if key_obj.branch != dw.branch:
                        return Response(
                            {"detail": "API key not valid for this branch."},
                            status=403,
                        )
                    key_org = key_obj.branch.suborganisation.organisation
                else:
                    # Unscoped keys must still match the display website's organisation
                    key_org = get_org_from_user(getattr(key_obj, "user", None))
                    if not key_org:
                        return Response(
                            {
                                "detail": "API key is not linked to an organisation and cannot access documents.",
                            },
                            status=403,
                        )
                    dw_org = dw.branch.suborganisation.organisation
                    if key_org != dw_org:
                        return Response(
                            {
                                "detail": "API key does not grant access to this organisation.",
                            },
                            status=403,
                        )
            else:
                if not request.user or not request.user.is_authenticated:
                    return Response({"detail": "Authentication required."}, status=401)

                if not user_can_access_branch(request.user, dw.branch):
                    return Response({"detail": "Not allowed."}, status=403)

            doc = get_object_or_404(
                Document,
                id=document_id,
                branch__suborganisation__organisation=dw.branch.suborganisation.organisation,
            )

            media_url = getattr(settings, "MEDIA_URL", "")
            if media_url and media_url.startswith("http"):
                file_url = urljoin(media_url, doc.file.name)
            else:
                file_url = request.build_absolute_uri(doc.file.url)
            return Response({"file_url": file_url}, status=200)
