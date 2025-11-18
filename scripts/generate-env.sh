#!/bin/bash
# Generate .env file with secure random values

set -e

echo "🔐 Generating secure environment configuration..."

# Check if .env already exists
if [ -f .env ]; then
    echo "⚠️  .env file already exists!"
    read -p "Do you want to overwrite it? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted. Your existing .env file was not modified."
        exit 0
    fi
    mv .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✓ Backed up existing .env file"
fi

# Generate secure random values
echo "Generating secure secrets..."
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '\n')

# Create .env file
cat > .env << EOF
# Docker Production Environment Configuration
# Generated on $(date)

# Database (used by docker-compose.yml)
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# JWT Secret (securely generated)
JWT_SECRET=${JWT_SECRET}

# Optional: OpenAI API Key for AI features
# If not set, system will run but AI agents will be disabled
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4-turbo-preview

# Application Configuration
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
MAX_CONCURRENT_AGENTS=5
AGENT_TIMEOUT_MS=300000
ENABLE_AGGRESSIVE_TESTING=false

# Note: DATABASE_URL and REDIS_URL are auto-configured in docker-compose.yml
EOF

echo "✅ Created .env file with secure random values"
echo ""
echo "📝 Next steps:"
echo "   1. Edit .env and set your OPENAI_API_KEY (optional)"
echo "   2. Update CORS_ORIGIN for production (if deploying)"
echo "   3. Review and customize other settings as needed"
echo "   4. Run: docker-compose up -d"
echo ""
echo "🔒 Keep your .env file secret and never commit it to git!"
