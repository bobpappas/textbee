# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Install pnpm and required OpenSSL dependencies
RUN apk add --no-cache openssl openssl-dev
RUN npm install -g pnpm@9

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Install pnpm and required OpenSSL dependencies
RUN apk add --no-cache openssl openssl-dev
RUN npm install -g pnpm@9

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all files
COPY . .

# Set environment variables for building
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_SITE_URL=http://localhost:8080
ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}


# Build the application
RUN pnpm build

# Stage 3: Production runner
FROM node:22-alpine AS runner
WORKDIR /app

# Install required OpenSSL dependencies
RUN apk add --no-cache openssl openssl-dev

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV CONTAINER_RUNTIME=docker

# Add a non-root user to run the app. The traced standalone runtime remains
# root-owned and read-only because the web process needs no writable app path.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy necessary files for the standalone app
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose the port the app will run on
ENV PORT=3000
EXPOSE ${PORT}

# Health check to verify app is running
# HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
#   CMD wget -q -O - http://localhost:${PORT}/api/health || exit 1

CMD ["node", "server"]
