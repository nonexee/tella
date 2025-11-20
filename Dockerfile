FROM node:18-alpine AS base

# Install dependencies for building
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for building)
RUN npm ci && npm cache clean --force

# Copy source code
COPY src ./src
COPY index.html ./
COPY vite.config.ts ./
COPY svelte.config.js ./

# Generate Prisma client
RUN npx prisma generate

# Build application
RUN npm run build

# Production image
FROM node:18-alpine AS production

# Add security labels
LABEL org.opencontainers.image.title="Tella AI Security Platform"
LABEL org.opencontainers.image.description="Agentic AI for Offensive Security Testing"
LABEL org.opencontainers.image.vendor="Tella AI"
LABEL security.scan="enabled"

# Install security updates and runtime dependencies
RUN apk --no-cache upgrade && \
    apk add --no-cache \
    dumb-init \
    openssl \
    nmap \
    nmap-scripts \
    python3 \
    py3-pip \
    nikto \
    git \
    curl \
    && pip3 install --no-cache-dir sqlmap

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p logs tmp && \
    chown -R nodejs:nodejs /app

# Copy package files for production install
COPY package*.json ./
COPY prisma ./prisma

# Install ONLY production dependencies in final image
RUN npm ci --only=production && npm cache clean --force

# Generate Prisma Client for production
RUN npx prisma generate

# Copy built files from build stage
COPY --from=base --chown=nodejs:nodejs /app/dist ./dist

# Drop capabilities and security hardening
USER nodejs

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start application
CMD ["node", "dist/server/index.js"]
