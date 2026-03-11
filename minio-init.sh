#!/bin/sh

# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

set -e

# Wait for MinIO to be ready
# Use the service name 'minio' from docker-compose.yml
until mc alias set local http://minio:9000 minioadmin minioadmin; do
    echo "Waiting for MinIO..."
    sleep 1
done

# Create the bucket if it doesn't already exist
# The --ignore-existing flag prevents errors on subsequent runs
mc mb --ignore-existing local/infoscreen

# Set the bucket policy to allow public downloads
mc anonymous set download local/infoscreen

echo "MinIO configured successfully."
