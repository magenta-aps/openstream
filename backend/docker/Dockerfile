# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

FROM python:3.12-slim AS base

ARG APP_UID=75040
ARG APP_GID=75040

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VERSION=2.1.1 \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1 \
    PROJECT_DIR="/app" \
    APP_USER=openstream \
    APP_GROUP=openstream \
    APP_UID=${APP_UID} \
    APP_GID=${APP_GID}

# Add Poetry to the PATH
ENV PATH="$POETRY_HOME/bin:$PROJECT_DIR/.venv/bin:$PATH"

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gettext \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN curl -sSL https://install.python-poetry.org | POETRY_HOME="$POETRY_HOME" python3 - && \
    ln -s "$POETRY_HOME/bin/poetry" /usr/local/bin/poetry
SHELL ["/bin/sh", "-c"]

FROM base AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml poetry.lock* README.md ./


ARG INSTALL_DEV_DEPS=false
RUN if [ "$INSTALL_DEV_DEPS" = "true" ]; \
    then poetry install --no-interaction --no-ansi --no-root; \
    else poetry install --no-interaction --no-ansi --no-root --without dev; \
    fi

FROM base AS final

ARG CACHEBUSTER108="CACHEBUSTER108"

RUN echo "Cachebuster: $CACHEBUSTER108"

WORKDIR /app

# 1. Copy ONLY the installed dependencies from the builder
COPY --from=builder /app/.venv ./.venv

# 2. Copy the application code and scripts directly from the build context
# This is the key change. Now, any change in './openstream' will bust this layer's cache.
COPY ./openstream .
COPY ./docker/entrypoint.sh .
COPY ./docker/gunicorn-settings.py .

# Install SUPERCRONIC - latest releases available at https://github.com/aptible/supercronic/releases
ENV SUPERCRONIC_URL=https://github.com/aptible/supercronic/releases/download/v0.2.33/supercronic-linux-amd64 \
    SUPERCRONIC_SHA1SUM=71b0d58cc53f6bd72cf2f293e09e294b79c666d8 \
    SUPERCRONIC=supercronic-linux-amd64

# Set the shell to fail the command if any part of a pipe fails
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN curl -fsSLO "$SUPERCRONIC_URL" \
 && echo "${SUPERCRONIC_SHA1SUM}  ${SUPERCRONIC}" | sha1sum -c - \
 && chmod +x "$SUPERCRONIC" \
 && mv "$SUPERCRONIC" "/usr/local/bin/${SUPERCRONIC}" \
 && ln -s "/usr/local/bin/${SUPERCRONIC}" /usr/local/bin/supercronic

# Reset the shell to the default for subsequent commands
SHELL ["/bin/sh", "-c"]

# Copy crontab-file to where supercron uses it from
COPY crontab /crontab

# Configure data directories
RUN mkdir -p /data/static /data/media /data/fixtures

EXPOSE 8000
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
# ---------------------------------------------------------------------
# Target 1: Development Image (runs as root by default)
# ---------------------------------------------------------------------
FROM final AS development
# ---------------------------------------------------------------------
# Target 2: Production Image (creates and runs as non-root)
# ---------------------------------------------------------------------
FROM final AS production

RUN set -ex \
    && groupadd -r -g ${APP_GID} ${APP_GROUP} \
    && useradd --no-log-init -r -u ${APP_UID} -g ${APP_GROUP} ${APP_USER}
RUN chown -R "$APP_USER:$APP_GROUP" /app /data
USER $APP_USER:$APP_GROUP