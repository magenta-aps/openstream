# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

from datetime import timedelta
from pathlib import Path
import os

###############################################################################
# Base Directories
###############################################################################
BASE_DIR = Path(__file__).resolve().parent.parent

###############################################################################
# Security and General Settings
###############################################################################

PRODUCTION = os.environ.get("ENV", "production") == "production"

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
SLIDETYPE_BASE_API_URL = os.environ.get(
    "SLIDETYPE_BASE_API_URL", "http://localhost:9000/api"
)
SPEEDADMIN_API_KEY = os.environ.get("SPEEDADMIN_API_KEY")
KMD_API_KEY = os.environ.get("KMD_API_KEY")
FRONTDESK_API_KEY = os.environ.get("FRONTDESK_API_KEY")
WINKAS_USERNAME = os.environ.get("WINKAS_USERNAME")
WINKAS_PW = os.environ.get("WINKAS_PW")
WINKAS_CONTRACTCODE = os.environ.get("WINKAS_CONTRACTCODE")
FRONTEND_PASSWORD_RESET_URL = os.environ.get("FRONTEND_PASSWORD_RESET_URL")


DEBUG = os.environ.get("DEBUG") == "True"

if os.environ.get("ALLOWED_HOSTS"):
    ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS").split(",")
else:
    ALLOWED_HOSTS = []

if os.environ.get("CSRF_TRUSTED_ORIGINS"):
    CSRF_TRUSTED_ORIGINS = os.environ.get("CSRF_TRUSTED_ORIGINS").split(",")
else:
    CSRF_TRUSTED_ORIGINS = []

################################################################################
# Media Files and S3-compatible storage (Using Django 4.2+ STORAGES)
################################################################################

# New: support generic AWS_S3_* envs (used for MinIO/local S3)
AWS_S3_KEY = os.environ.get("AWS_S3_KEY") or os.environ.get("AWS_ACCESS_KEY_ID")
AWS_S3_SECRET = os.environ.get("AWS_S3_SECRET") or os.environ.get(
    "AWS_SECRET_ACCESS_KEY"
)
AWS_S3_BUCKET = os.environ.get("AWS_S3_BUCKET") or os.environ.get(
    "AWS_STORAGE_BUCKET_NAME"
)
AWS_S3_ENDPOINT_URL_ENV = os.environ.get("AWS_S3_ENDPOINT_URL")
# Optional: internal endpoint for services running in the same compose network
# e.g. set to 'http://minio:9000' so the backend container can reach MinIO
AWS_S3_INTERNAL_ENDPOINT_URL = os.environ.get("AWS_S3_INTERNAL_ENDPOINT_URL")

# --- START: MODIFIED LOGIC ---

# 1. Read the new public-facing URL from the environment
MINIO_PUBLIC_URL_ENV = os.environ.get("MINIO_PUBLIC_URL")

# --- END: MODIFIED LOGIC ---


# Priority: if AWS_S3_KEY/SECRET/BUCKET provided, use those (for MinIO/local S3)
if AWS_S3_KEY and AWS_S3_SECRET and AWS_S3_BUCKET:
    AWS_ACCESS_KEY_ID = AWS_S3_KEY
    AWS_SECRET_ACCESS_KEY = AWS_S3_SECRET
    AWS_STORAGE_BUCKET_NAME = AWS_S3_BUCKET

    # Choose internal endpoint for boto3 if provided (container network host)
    if AWS_S3_INTERNAL_ENDPOINT_URL:
        AWS_S3_ENDPOINT_URL = AWS_S3_INTERNAL_ENDPOINT_URL
    elif AWS_S3_ENDPOINT_URL_ENV:
        # Fallback: use provided external endpoint for both boto3 and MEDIA_URL
        AWS_S3_ENDPOINT_URL = AWS_S3_ENDPOINT_URL_ENV

    # --- START: MODIFIED LOGIC ---

    # 2. Check if the public URL is provided (for generating frontend-facing URLs)
    if MINIO_PUBLIC_URL_ENV:
        # 3. Construct MEDIA_URL using the PUBLIC URL
        public_endpoint = MINIO_PUBLIC_URL_ENV.rstrip("/")
        MEDIA_URL = f"{public_endpoint}/{AWS_S3_BUCKET}/"

    # 4. Fallback to the old logic if the public URL isn't set
    elif AWS_S3_ENDPOINT_URL_ENV and AWS_S3_ENDPOINT_URL_ENV.startswith("http"):
        endpoint = AWS_S3_ENDPOINT_URL_ENV.rstrip("/")
        MEDIA_URL = f"{endpoint}/{AWS_S3_BUCKET}/"

    # --- END: MODIFIED LOGIC ---

    # Fallback custom domain logic (can be simplified, but kept for compatibility)
    if "MEDIA_URL" not in globals():
        if AWS_S3_ENDPOINT_URL_ENV:
            try:
                from urllib.parse import urlparse

                parsed = urlparse(AWS_S3_ENDPOINT_URL_ENV)
                netloc = parsed.netloc or parsed.path
                AWS_S3_CUSTOM_DOMAIN = f"{netloc}/{AWS_S3_BUCKET}"
            except Exception:
                stripped = (
                    AWS_S3_ENDPOINT_URL_ENV.replace("http://", "")
                    .replace("https://", "")
                    .rstrip("/")
                )
                AWS_S3_CUSTOM_DOMAIN = f"{stripped}/{AWS_S3_BUCKET}"
        else:
            AWS_S3_CUSTOM_DOMAIN = f"{AWS_S3_BUCKET}.s3.amazonaws.com"
        MEDIA_URL = f"https://{AWS_S3_CUSTOM_DOMAIN}/"

    # Extra compatibility for MinIO / local S3 endpoints:
    # Force path-style addressing and use signature v4 which MinIO expects.
    # Also set a sensible default region if none provided. Use the effective
    # AWS_S3_ENDPOINT_URL (which may be the internal endpoint) to decide.
    if "AWS_S3_ENDPOINT_URL" in globals() and AWS_S3_ENDPOINT_URL:
        AWS_S3_ADDRESSING_STYLE = os.environ.get("AWS_S3_ADDRESSING_STYLE", "path")
        AWS_S3_SIGNATURE_VERSION = os.environ.get("AWS_S3_SIGNATURE_VERSION", "s3v4")
        AWS_S3_REGION_NAME = os.environ.get("AWS_S3_REGION_NAME", "us-east-1")

    AWS_S3_OBJECT_PARAMETERS = {"CacheControl": "max-age=86400"}
    AWS_DEFAULT_ACL = "public-read"

    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3boto3.S3Boto3Storage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
        },
    }

# If AWS_S3_* envs are not provided, fall back to filesystem storage below.
else:
    STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
        },
    }
    MEDIA_URL = "/media/"
    MEDIA_ROOT = os.path.join(BASE_DIR, "media")

###############################################################################
# Application Definition
###############################################################################

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # 3rd party apps
    "rest_framework",  # Django REST Framework
    "rest_framework_simplejwt",  # Simple JWT for authentication
    "corsheaders",  # CORS headers
    "storages",  # django-storages for DigitalOcean Spaces
    # OpenStream Apps
    "osauth.apps.OSAuthConfig",
    "app.apps.App",
    "sso.apps.SSOConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    # WhiteNoise serves static files directly when DEBUG=False
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

###############################################################################
# CORS Settings
###############################################################################

if os.environ.get("CORS_ALLOWED_ORIGINS"):
    CORS_ALLOWED_ORIGINS = os.environ.get("CORS_ALLOWED_ORIGINS").split(",")
else:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:4174",
    ]

CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-api-key",
]

ROOT_URLCONF = "project.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "project.wsgi.application"

###############################################################################
# Database Configuration
###############################################################################

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DATABASE_NAME", "db"),
        "USER": os.environ.get("DATABASE_USERNAME", "db"),
        "PASSWORD": os.environ.get("DATABASE_PASSWORD", "dbpassword"),
        "HOST": os.environ.get("DATABASE_HOST", "db"),
        "PORT": os.environ.get("DATABASE_PORT", "5432"),
    }
}

###############################################################################
# Password Validation
###############################################################################

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

USE_TZ = True
TIME_ZONE = "Europe/Copenhagen"


###############################################################################
# Static Files
###############################################################################

STATIC_URL = "/static/"
STATIC_ROOT = "/data/static"

###############################################################################
# Default Primary Key Field Type
###############################################################################

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

###############################################################################
# Django REST Framework and Simple JWT
###############################################################################

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=99999),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

###############################################################################
# Logging Configuration
###############################################################################

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "require_debug_false": {
            "()": "django.utils.log.RequireDebugFalse",
        },
    },
    "handlers": {
        "console": {
            "level": "WARNING",  # Change to "ERROR" or "CRITICAL" to reduce more output
            "class": "logging.StreamHandler",
        },
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "WARNING",  # Change to "ERROR" to suppress most logs
            "propagate": True,
        },
        "django.server": {  # Suppresses server startup logs
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}

###############################################################################
# Additional Security Settings
###############################################################################

X_FRAME_OPTIONS = "SAMEORIGIN"

USE_TZ = True
TIME_ZONE = "Europe/Copenhagen"

###############################################################################
# EMAIL
###############################################################################

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.environ.get("EMAIL_HOST", "smtp.eu.mailgun.org")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "True").lower() == "true"
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = EMAIL_HOST_USER or "noreply@openstream.dk"

###############################################################################
# Keycloak Configuration
###############################################################################

KEYCLOAK_HOST = os.environ.get("KEYCLOAK_HOST", "auth.openstream.dk")
KEYCLOAK_PORT = os.environ.get("KEYCLOAK_PORT", "")

KEYCLOAK_REALM = os.environ.get("KEYCLOAK_REALM", "openstream-customer_name-here")
KEYCLOAK_CLIENT_ID = os.environ.get(
    "KEYCLOAK_CLIENT_ID", "openstream-customer_name-client_id-here"
)
KEYCLOAK_CLIENT_SECRET = os.environ.get(
    "KEYCLOAK_CLIENT_SECRET", "openstream-customer_name-client_secret-here"
)

KEYCLOAK_TIMEOUT = int(os.environ.get("KEYCLOAK_TIMEOUT", "5"))
