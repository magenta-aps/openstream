# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

# Frontend Dockerfile with development and production targets
FROM node:20-alpine AS base

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Development target
FROM base AS development

# Expose Express server port
EXPOSE 4174

# Set environment to development
ENV NODE_ENV=development
ENV PORT=4174

# Start Express server with nodemon (which will start Vite in middleware mode)
CMD ["npm", "run", "dev:server"]

# Production build stage
FROM base AS build

# Build the application
RUN npm run build

# Production target
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files for production dependencies
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built application from build stage
COPY --from=build /app/dist ./dist

# Copy server code
COPY server ./server

# Copy source pages for the server (needed for development mode fallback)
COPY src/pages ./src/pages

# Set environment to production
ENV NODE_ENV=production
ENV PORT=4173

# Expose port 4173
EXPOSE 4173

# Start Express server
CMD ["node", "server/main.js"]
