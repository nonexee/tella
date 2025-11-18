# Production Deployment Guide

## Architecture

In production, the Tella AI platform runs as a **unified application**:
- **Backend API (GraphQL)**: Available at `http://localhost:4000/graphql`
- **Frontend (SPA)**: Served at `http://localhost:4000/` (served by backend)
- **WebSocket**: Available at `ws://localhost:4000/graphql`

Port 5173 is **only used in development** (Vite dev server). In production, everything runs on port 4000.

## Quick Start

1. **Generate secure environment configuration**:
   ```bash
   ./fix-env.sh
   # This creates a properly formatted .env file with secure passwords
   ```

2. **Rebuild Docker image** (to include frontend serving changes):
   ```bash
   docker-compose build --no-cache app
   ```

3. **Start services**:
   ```bash
   docker-compose up -d
   ```

4. **Access the application**:
   - Frontend: http://localhost:4000
   - GraphQL API: http://localhost:4000/graphql
   - Health Check: http://localhost:4000/health

## Default Credentials

```
Email: admin@tella.ai
Password: Admin123!@#
```

**⚠️ IMPORTANT**: Change these credentials immediately after first login!

## Port Mapping

| Service    | Container Port | Host Port | Purpose                          |
|------------|----------------|-----------|----------------------------------|
| app        | 4000           | 4000      | Backend API + Frontend (SPA)     |
| postgres   | 5432           | 5432      | PostgreSQL Database              |
| redis      | 6379           | 6379      | Redis Task Queue                 |

## Troubleshooting

### "Connection reset" on port 5173
Port 5173 is not used in production. Access the application on port 4000 instead.

### "CORS error"
Update your `CORS_ORIGIN` in `.env` to match your deployment URL:
```bash
# For local deployment
CORS_ORIGIN=http://localhost:4000

# For production deployment
CORS_ORIGIN=https://yourdomain.com
```

### Frontend not loading
1. Check that the build completed successfully:
   ```bash
   docker-compose logs app | grep "Client files"
   ```

2. Verify frontend files exist in container:
   ```bash
   docker exec tella-app ls -la /app/dist/client
   ```

3. Rebuild if necessary:
   ```bash
   docker-compose build --no-cache app
   docker-compose up -d
   ```

## Environment Variables

### Required
- `JWT_SECRET`: Secure random string (min 64 chars, hex recommended)
- `POSTGRES_PASSWORD`: Database password (URL-safe, hex recommended)

### Optional
- `OPENAI_API_KEY`: OpenAI API key (AI features disabled without it)
- `CORS_ORIGIN`: Allowed origins (default: http://localhost:4000)
- `MAX_CONCURRENT_AGENTS`: Max concurrent security agents (default: 5)
- `AGENT_TIMEOUT_MS`: Agent timeout in milliseconds (default: 300000)
- `ENABLE_AGGRESSIVE_TESTING`: Enable aggressive testing (default: false)

## Security Notes

1. **Never commit `.env` file** - contains secrets
2. **Use URL-safe passwords** - hex encoding recommended (no special chars)
3. **Change default credentials** - immediately after first login
4. **Update CORS_ORIGIN** - set to your actual domain in production
5. **Review security settings** - before public deployment

## Development vs Production

| Feature          | Development (npm run dev) | Production (docker-compose) |
|------------------|---------------------------|------------------------------|
| Frontend Server  | Vite dev server (5173)    | Served by backend (4000)     |
| Backend Server   | tsx watch (4000)          | node dist/server (4000)      |
| Hot Reload       | ✅ Yes                     | ❌ No (requires rebuild)      |
| Source Maps      | ✅ Yes                     | ✅ Yes                        |
| Optimization     | ❌ No                      | ✅ Yes (minified)             |

## Build Process

The Docker build performs:
1. Install all dependencies (including devDependencies)
2. Generate Prisma client
3. Build backend (TypeScript → JavaScript)
4. Copy GraphQL schema to dist
5. Build frontend (Svelte → optimized bundle)
6. Create production image with only runtime dependencies
7. Copy built files (backend + frontend) to production image

## Logs

View application logs:
```bash
# All logs
docker-compose logs -f app

# Last 100 lines
docker-compose logs --tail=100 app

# Specific container
docker logs tella-app -f
```

Log files are also available in `./logs/` directory on the host.
