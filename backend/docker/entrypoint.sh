#!/bin/sh

# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

# tells script to exit as soon as any line in the script fails
set -e

MAKE_MIGRATIONS=${MAKE_MIGRATIONS:=false}
MIGRATE=${MIGRATE:=true}
LOAD_FIXTURES=${LOAD_FIXTURES:=false}
DJANGO_ENV=${DJANGO_ENV:=production}
CREATE_TEST_REALMS=${CREATE_TEST_REALMS:=false}
# Hardcoded list of test realms (comma-separated). Each item must be a
# semicolon-separated set of key/value pairs. Supported keys: `name` and `uri`.
# Keycloak will use the `uri` value; `name` is used when creating the organisation.
# Example:
#   TEST_REALM_LIST='name=Demo Organization;uri=demo,name=Example Org;uri=example'
TEST_REALM_LIST='name=Demo Organization;uri=demo,name=Example Org;uri=example'
KEYCLOAK_WAIT_TIMEOUT=${KEYCLOAK_WAIT_TIMEOUT:=60}

wait_for_keycloak() {
  HOST=${KEYCLOAK_INTERNAL_HOST:-${KEYCLOAK_HOST:-localhost}}
  PORT=${KEYCLOAK_PORT:-8080}
  TIMEOUT=${KEYCLOAK_WAIT_TIMEOUT}
  START_TS=$(date +%s)

  echo "Waiting for Keycloak at ${HOST}:${PORT} (timeout ${TIMEOUT}s)"

  while true; do
    if python - <<PY
import socket
import sys

host = "${HOST}"
port = int("${PORT}")

sock = socket.socket()
sock.settimeout(1)

try:
    sock.connect((host, port))
except OSError:
    sys.exit(1)
else:
    sys.exit(0)
finally:
    sock.close()
PY
    then
      echo "Keycloak is reachable."
      return 0
    fi

    NOW_TS=$(date +%s)
    if [ $((NOW_TS - START_TS)) -ge "${TIMEOUT}" ]; then
      echo "Timed out waiting for Keycloak."
      return 1
    fi

    sleep 2
  done
}

cd /app

# Database migrations
if [ "${MAKE_MIGRATIONS}" = true ]; then
  echo 'generating migrations'
  ./manage.py makemigrations --no-input
fi

if [ "${MIGRATE}" = true ]; then
  echo 'running migrations'
  ./manage.py migrate
fi

# Load fixtures
if [ "${LOAD_FIXTURES}" = true ]; then
  echo 'loading fixtures'
  if [ -f "/app/fixtures/app/data.json" ]; then
    ./manage.py loaddata /app/fixtures/app/data.json
  else
    echo 'No fixtures found at /app/fixtures/app/data.json'
  fi
fi

if [ "${CREATE_TEST_REALMS}" = true ]; then
  if [ -z "${TEST_REALM_LIST}" ]; then
    echo 'CREATE_TEST_REALMS=true but TEST_REALM_LIST is empty - skipping realm creation'
  else
    if wait_for_keycloak; then
      OLD_IFS="$IFS"
      IFS=','
      for entry in ${TEST_REALM_LIST}; do
        # Trim whitespace
        entry=$(echo "${entry}" | sed 's/^ *//;s/ *$//')
        if [ -z "${entry}" ]; then
          continue
        fi

        # Parse `name` and `uri` from semicolon-separated key=value pairs
        name=$(echo "${entry}" | awk -F';' '{for(i=1;i<=NF;i++){n=$i; split(n,a,"="); gsub(/^ +| +$/,"",a[1]); gsub(/^ +| +$/,"",a[2]); if(a[1]=="name") name=a[2]; if(a[1]=="uri") uri=a[2];}} END{printf "%s", name}')
        uri=$(echo "${entry}" | awk -F';' '{for(i=1;i<=NF;i++){n=$i; split(n,a,"="); gsub(/^ +| +$/,"",a[1]); gsub(/^ +| +$/,"",a[2]); if(a[1]=="name") name=a[2]; if(a[1]=="uri") uri=a[2];}} END{printf "%s", uri}')

        # Fallback: if no uri provided, use the raw entry as uri and name
        if [ -z "${uri}" ]; then
          CLEAN_REALM=$(echo "${entry}" | tr -d ' \t\n\r')
          uri="${CLEAN_REALM}"
          if [ -z "${name}" ]; then
            name="${CLEAN_REALM}"
          fi
        fi

        echo "Ensuring Keycloak realm '${uri}' exists"
        ./manage.py create_keycloak_realm "${uri}"
        ./manage.py create_organisation "${name}" "${uri}"
      done
      IFS="$OLD_IFS"
    else
      echo 'Skipping realm creation because Keycloak did not become ready in time.'
    fi
  fi
fi

# Run the application
if [ "${DJANGO_ENV}" = "development" ]; then
  echo "Running openstream.dk in development mode"
  exec ./manage.py runserver 0.0.0.0:8000
fi

if [ "${DJANGO_ENV}" = "production" ]; then
  echo "Running openstream.dk in production mode"
  # Ensure static files are collected to STATIC_ROOT so WhiteNoise can serve them
  echo 'Collecting static files'
  ./manage.py collectstatic --noinput
  exec gunicorn project.wsgi:application --config /app/gunicorn-settings.py --bind 0.0.0.0:8000
fi