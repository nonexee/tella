# Docker Setup Guide

## Current Status

All code fixes are committed and ready:
- ✅ OpenSSL 1.1 compatibility added to Dockerfile
- ✅ Prisma Client generation in production stage
- ✅ JWT_SECRET validation split for dev/prod environments
- ✅ OPENAI_API_KEY made optional (system runs without it)

## Issue: Container Using Cached Layers

Your Docker container is still showing old errors because it's using cached build layers. You need to rebuild without cache.

## Quick Fix (3 Steps)

### Step 1: Set JWT_SECRET

Your `docker-compose.yml` sets `NODE_ENV=production`, so you need a real JWT_SECRET.

**Option A - Generate a secure secret:**
```bash
# Generate a random 32+ character secret
openssl rand -base64 32
```

Then add to your `.env` file:
```bash
JWT_SECRET=<paste-the-generated-secret-here>
```

**Option B - Use development mode:**
Edit `docker-compose.yml` line 90:
```yaml
NODE_ENV: development  # Changed from production
```

### Step 2: Rebuild Docker (No Cache)

**Automated (Recommended):**
```bash
./docker-rebuild.sh
```

**Manual:**
```bash
# Stop everything
docker-compose down -v

# Remove old image
docker rmi tella-app

# Rebuild without cache
docker-compose build --no-cache

# Start containers
docker-compose up -d

# Watch logs
docker-compose logs -f app
```

### Step 3: Verify Success

You should see:
```
✅ Environment validation passed
🚀 GraphQL server ready at http://localhost:4000/graphql
```

## Default Login Credentials

Once running, you can log in with:
- **Email:** `admin@tella.ai`
- **Password:** `Admin123!@#`

## Testing the API

```bash
# Health check
curl http://localhost:4000/health

# GraphQL login
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { login(email: \"admin@tella.ai\", password: \"Admin123!@#\") { token user { email role } } }"}'
```

## Common Issues

### "JWT_SECRET must be changed from example value"
- You're in production mode but using the example JWT_SECRET
- Fix: Generate a real secret (see Step 1)

### "Error loading shared library libssl.so.1.1"
- Your container is using cached layers without the OpenSSL fix
- Fix: Rebuild without cache (see Step 2)

### "OPENAI_API_KEY not configured"
- This is just a WARNING - system will run fine without it
- AI agent features will be disabled
- To enable: Add real OpenAI API key to `.env`

## Environment Variables

See `.env.docker` for a complete template with all available options.

Required in production:
- `JWT_SECRET` (min 32 chars)
- `POSTGRES_PASSWORD`
- `CORS_ORIGIN` (no wildcards)

Optional but recommended:
- `OPENAI_API_KEY` (for AI features)
- `REDIS_URL` (auto-configured in docker-compose)
