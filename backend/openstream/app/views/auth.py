# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import datetime
import logging
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.core.signing import SignatureExpired, BadSignature, TimestampSigner
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from app.models import (
    SlideshowPlayerAPIKey,
)
from app.serializers import (
    CustomTokenObtainPairSerializer,
    ChangePasswordSerializer,
)
from django.conf import settings

logger = logging.getLogger(__name__)

from app.permissions import (
    get_branch_from_request,
    handle_branch_request,
    CanManageBranchAPIKey,
)


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    This view uses our custom serializer to provide token pairs.
    """

    serializer_class = CustomTokenObtainPairSerializer


class ValidateTokenView(APIView):
    """
    Validates the provided JWT token.
    Relies on IsAuthenticated permission class to handle validation.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"detail": "Token is valid"}, status=status.HTTP_200_OK)


class GetUsernameFromTokenView(APIView):
    """
    Endpoint to retrieve the username based on the provided JWT token.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs) -> Response:
        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication

            jwt_authenticator = JWTAuthentication()
            user, token = jwt_authenticator.authenticate(request)

            if user:
                return Response({"username": user.username}, status=status.HTTP_200_OK)
            else:
                return Response(
                    {"detail": "Invalid token"}, status=status.HTTP_401_UNAUTHORIZED
                )
        except Exception as e:
            logger.error(f"Error decoding token: {e}")
            return Response(
                {"detail": "An error occurred while processing the token."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ChangePasswordAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = ChangePasswordSerializer(data=request.data, context={"request": request})
        if ser.is_valid():
            ser.save()
            update_session_auth_hash(request, request.user)
            return Response({"message": "Password updated successfully"}, status=200)
        return Response(ser.errors, status=400)


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")

        if not email:
            return Response(
                {"error": "Email is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Find user by email
            user = User.objects.get(email=email)

            # Create a signed token that expires in 1 hour
            signer = TimestampSigner()
            token = signer.sign(f"password_reset_{user.id}")

            reset_url = self._resolve_reset_url(request, token)

            # Send email with reset link
            subject = "OpenStream - Password Reset Request"
            message = f"""
Hello {user.get_full_name() or user.username},

You have requested a password reset for your OpenStream account.

Please click the link below to reset your password:
{reset_url}

This link will expire in 1 hour for security reasons.

If you did not request this password reset, please ignore this email or contact your administrator.

Best regards,
The OpenStream Team
            """

            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )

            logger.info(f"Password reset email sent to {user.email}")

            return Response(
                {
                    "message": "A password reset link has been sent to your email address.",
                    "email": user.email,
                },
                status=status.HTTP_200_OK,
            )

        except User.DoesNotExist:
            # For security reasons, don't reveal if email exists or not
            return Response(
                {
                    "message": "If this email address is associated with an account, you will receive a password reset link.",
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            logger.error(f"Failed to send password reset email for {email}: {str(e)}")
            return Response(
                {
                    "error": "Failed to process password reset request. Please try again later."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @staticmethod
    def _resolve_reset_url(request, token):
        """Resolve where to send the password reset based on settings."""
        frontend_reset_url = getattr(settings, "FRONTEND_PASSWORD_RESET_URL", None)

        if frontend_reset_url:
            # Support simple token placeholders for convenience
            if "{token}" in frontend_reset_url:
                return frontend_reset_url.replace("{token}", token)

            # Ensure the token query parameter is appended/overwritten
            parsed = urlparse(frontend_reset_url)
            query = parse_qs(parsed.query, keep_blank_values=True)
            query["token"] = [token]
            new_query = urlencode(query, doseq=True)
            return urlunparse(parsed._replace(query=new_query))

        base_url = request.build_absolute_uri("/reset-password-confirm/")
        separator = "&" if "?" in base_url else "?"
        return f"{base_url}{separator}token={token}"


class ConfirmPasswordResetView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get("token")
        new_password = request.data.get("new_password")

        if not token or not new_password:
            return Response(
                {"error": "Token and new password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(new_password) < 8:
            return Response(
                {"error": "Password must be at least 8 characters long."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Verify the token (expires in 1 hour = 3600 seconds)
            signer = TimestampSigner()
            unsigned_token = signer.unsign(token, max_age=3600)

            # Extract user ID from the token
            if not unsigned_token.startswith("password_reset_"):
                raise BadSignature("Invalid token format")

            user_id = int(unsigned_token.replace("password_reset_", ""))
            user = User.objects.get(id=user_id)

            # Update user's password
            user.set_password(new_password)
            user.save()

            logger.info(f"Password successfully reset for user {user.email}")

            return Response(
                {
                    "message": "Your password has been successfully reset. You can now log in with your new password.",
                },
                status=status.HTTP_200_OK,
            )

        except SignatureExpired:
            return Response(
                {"error": "Password reset link has expired. Please request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        except (BadSignature, ValueError):
            return Response(
                {"error": "Invalid or corrupted password reset link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        except User.DoesNotExist:
            return Response(
                {"error": "User not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        except Exception as e:
            logger.error(f"Failed to reset password with token: {str(e)}")
            return Response(
                {"error": "Failed to reset password. Please try again later."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class SendLoginEmailView(APIView):
    """
    Test endpoint to send a "You logged in" email to the authenticated user.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Send a test login email to the authenticated user.
        """
        user = request.user

        # Get user email
        if not user.email:
            return Response(
                {"error": "User does not have an email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Send email
            subject = "Login Notification - OpenStream Admin"
            message = f"""
Hello {user.first_name or user.username},

You have successfully logged into the OpenStream Admin system.

Login details:
- Username: {user.username}
- Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

If this wasn't you, please contact your administrator immediately.

Best regards,
OpenStream Team
            """

            from_email = settings.DEFAULT_FROM_EMAIL
            recipient_list = [user.email]

            send_mail(
                subject=subject,
                message=message,
                from_email=from_email,
                recipient_list=recipient_list,
                fail_silently=False,
            )

            logger.info(f"Login notification email sent to {user.email}")

            return Response(
                {
                    "message": "Login notification email sent successfully.",
                    "email": user.email,
                    "sent_at": datetime.now().isoformat(),
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            logger.error(
                f"Failed to send login notification email to {user.email}: {str(e)}"
            )
            return Response(
                {"error": f"Failed to send email: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class BranchAPIKeyView(APIView):
    permission_classes = [IsAuthenticated, CanManageBranchAPIKey]

    @handle_branch_request
    def get(self, request, branch):
        # Permission already checked by CanManageBranchAPIKey

        # Access the API key directly via the branch's one-to-one relation
        try:
            api_key_obj = branch.api_key
        except SlideshowPlayerAPIKey.DoesNotExist:
            return Response(
                {"detail": "No API key found for this branch."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "branch_id": branch.id,
                "api_key": str(api_key_obj.key),
                "is_active": api_key_obj.is_active,
            },
            status=status.HTTP_200_OK,
        )


class UserAPIKeyView(APIView):
    """
    This view is used for fetching and (optionally) regenerating a user's API key.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        from app.models import SlideshowPlayerAPIKey
        import uuid

        api_key, created = SlideshowPlayerAPIKey.objects.get_or_create(
            user=request.user
        )
        return Response({"api_key": str(api_key.key)}, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        from app.models import SlideshowPlayerAPIKey
        import uuid

        api_key, _ = SlideshowPlayerAPIKey.objects.get_or_create(user=request.user)
        api_key.key = uuid.uuid4()
        api_key.save()
        return Response({"api_key": str(api_key.key)}, status=status.HTTP_200_OK)


class FrontdeskAPIKey(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Return the API key with the property name expected by the frontend
        return Response({"apiKey": settings.FRONTDESK_API_KEY}, status=200)


class TokenOrAPIKeyMixin:
    """
    Mixin to handle both JWT token and API key authentication
    """

    def check_auth(self, request):
        # Check for a Bearer token if available.
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            # JWT authentication already handled by DRF
            if hasattr(request, "user") and request.user.is_authenticated:
                return request.user

        # Check for X-API-KEY
        api_key = request.headers.get("X-API-KEY")
        if api_key:
            key_obj = SlideshowPlayerAPIKey.objects.filter(
                key=api_key, is_active=True
            ).first()
            if key_obj:
                return key_obj

        # Fallback: if request.user is already authenticated.
        if hasattr(request, "user") and request.user and request.user.is_authenticated:
            return request.user

        return None
