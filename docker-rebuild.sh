#!/bin/bash
# Docker Rebuild Script - Fixes cached layer issues
# This script completely rebuilds the Docker containers with all fixes applied

echo "🔄 Stopping all containers..."
docker-compose down -v

echo "🗑️  Removing old images to force complete rebuild..."
docker rmi tella-app 2>/dev/null || true

echo "🏗️  Building from scratch (no cache)..."
docker-compose build --no-cache

echo "✅ Build complete! Starting containers..."
docker-compose up -d

echo "📋 Waiting for services to start..."
sleep 5

echo "📊 Container status:"
docker-compose ps

echo ""
echo "📝 Following logs (Ctrl+C to exit):"
docker-compose logs -f app
