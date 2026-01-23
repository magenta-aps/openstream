# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

# Multi-stage Dockerfile for polling-server
# - Installs dependencies in the first stage depending on NODE_ENV
# - Copies node_modules into the final image and the application code
# Use build arg NODE_ENV to switch between production and development builds

FROM node:20 AS deps
WORKDIR /app
ARG NODE_ENV=production
COPY package*.json ./
# Install dependencies: production builds omit devDependencies
RUN if [ "$NODE_ENV" = "production" ]; then \
      npm ci --omit=dev; \
    else \
      npm install; \
    fi

FROM node:20 AS runner
WORKDIR /app
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
# Copy installed modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy package files too (useful for container-side npm install if dev bind-mount overwrites files)
COPY package*.json ./
# Copy the app source; in dev the compose file may mount over this path
COPY . .
EXPOSE 3000
# Default to running the production start script. For development compose will override command to run dev.
CMD ["node", "main.js"]
