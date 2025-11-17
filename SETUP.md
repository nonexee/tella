# Tella AI Security - Setup Guide

## 🚀 Quick Start (3 Steps!)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Then edit `.env` and configure:
- `DATABASE_URL` - Your PostgreSQL connection string
- `POSTGRES_PASSWORD` - Strong database password
- `OPENAI_API_KEY` - Your OpenAI API key
- `JWT_SECRET` - MUST be at least 32 characters
- `CORS_ORIGIN` - Your frontend URLs (NO wildcards in production!)

### 3. Start Application

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

**That's it!** The app automatically:
- ✅ Syncs database schema (no migrations needed!)
- ✅ Seeds initial data (admin user, tools, knowledge base)
- ✅ Starts the server

## Docker Setup

```bash
# Set environment variables in .env first!
docker-compose up -d
```

Docker automatically handles everything - just start it!

## Health Check

Verify the application is running:

```bash
curl http://localhost:4000/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-17T...",
  "uptime": 123.45,
  "database": "connected"
}
```

## Default Credentials

**Email**: `admin@tella.ai`
**Password**: `Admin123!@#`

⚠️ **CHANGE THESE IN PRODUCTION!**

## Security Checklist

Before deploying to production:

- [ ] Change default admin password
- [ ] Set `JWT_SECRET` to 32+ character random string
- [ ] Set strong `POSTGRES_PASSWORD`
- [ ] Configure `CORS_ORIGIN` (NO wildcards!)
- [ ] Set `OPENAI_API_KEY` to real API key
- [ ] Set `NODE_ENV=production`
- [ ] Review `ENABLE_AGGRESSIVE_TESTING=false`
- [ ] Configure logging (`DISABLE_FILE_LOGGING=true` for containers)
- [ ] Verify health check works
- [ ] Test rate limiting
- [ ] Review all environment variables

## Troubleshooting

### Database connection fails

Check:
- PostgreSQL is running
- `DATABASE_URL` in `.env` is correct
- Database exists (create with `createdb tella_ai`)

### Schema sync fails

The app automatically syncs the schema on startup. If it fails:
- Check database permissions
- Verify PostgreSQL version (14+)
- Check logs for detailed error

### Seed script fails

The app seeds automatically on first run. To re-seed:
```bash
npm run db:seed
```

### Health check fails

- Check PostgreSQL is running
- Verify `DATABASE_URL` in `.env`
- Check logs: `docker-compose logs app`

## Architecture

```
src/
├── server/
│   ├── ai/              # Agent orchestrator & AI logic
│   ├── graphql/         # GraphQL schema & resolvers
│   ├── tools/           # Security testing tools
│   ├── utils/           # Utilities (auth, logger, prisma, db-init)
│   ├── db/              # Database seeders
│   └── index.ts         # Main server entry point
├── client/
│   ├── components/      # Svelte components
│   ├── stores/          # State management
│   └── lib/             # GraphQL client
└── prisma/
    └── schema.prisma    # Database schema
```

## Support

For issues, check:
1. Logs: `logs/` directory or `docker-compose logs`
2. Health endpoint: `http://localhost:4000/health`
3. Prisma Studio: `npm run prisma:studio`
