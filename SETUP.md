# Tella AI Security - Setup Guide

## ⚠️ CRITICAL: First-Time Setup

After cloning this repository, you MUST run database migrations before starting the application.

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

### 3. Run Database Migrations

**CRITICAL**: The Prisma schema has unique constraints that don't exist yet in your database.

```bash
# Development
npx prisma migrate dev

# Production
npx prisma migrate deploy
```

This creates:
- All database tables
- Unique constraint on `Target.url`
- Unique constraint on `KnowledgeBase(category, title)`

### 4. Seed Database (Optional)

```bash
npm run db:seed
```

Creates:
- Admin user (email: `admin@tella.ai`, password: `Admin123!@#`)
- Sample security tools
- Knowledge base entries
- Demo target

**Note**: Seed script is idempotent - safe to run multiple times.

### 5. Start Application

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

## Docker Setup

```bash
# Set environment variables in .env first!
docker-compose up -d
```

The docker-compose setup automatically:
- Runs migrations on startup
- Seeds the database
- Starts the application

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

### "Unique constraint violation" errors

Run migrations:
```bash
npx prisma migrate deploy
```

### "Connection pool exhausted" errors

Check that you're not creating multiple PrismaClient instances. All code should import from `src/server/utils/prisma.ts`.

### Seed script fails

Migrations may not be applied. Run:
```bash
npx prisma migrate deploy
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
│   ├── utils/           # Utilities (auth, logger, prisma)
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
