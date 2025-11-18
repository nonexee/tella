#!/bin/bash
# Quick fix to create a properly formatted .env file

echo "🔧 Creating properly formatted .env file..."

# Generate URL-safe passwords (hex has no special characters to escape)
JWT_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)

# Extract OpenAI key from old .env if it exists, otherwise use placeholder
OPENAI_KEY="your-openai-api-key-here"
if [ -f .env ]; then
    EXISTING_KEY=$(grep "^OPENAI_API_KEY=" .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")
    if [ ! -z "$EXISTING_KEY" ] && [ "$EXISTING_KEY" != "your-openai-api-key-here" ]; then
        OPENAI_KEY="$EXISTING_KEY"
        echo "✓ Preserved your existing OPENAI_API_KEY"
    fi
fi

# Backup old .env if it exists
if [ -f .env ]; then
    mv .env .env.broken.backup
    echo "✓ Backed up broken .env to .env.broken.backup"
fi

# Create properly formatted .env file
cat > .env << EOF
# Docker Production Environment Configuration
# Generated on $(date)

# Database (used by docker-compose.yml)
# Using hex encoding - no special characters that need URL escaping
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# JWT Secret (securely generated)
JWT_SECRET=${JWT_SECRET}

# OpenAI API Key
OPENAI_API_KEY=${OPENAI_KEY}
OPENAI_MODEL=gpt-4-turbo-preview

# Application Configuration
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
MAX_CONCURRENT_AGENTS=5
AGENT_TIMEOUT_MS=300000
ENABLE_AGGRESSIVE_TESTING=false

# Note: DATABASE_URL and REDIS_URL are auto-configured in docker-compose.yml
EOF

echo "✅ Created new .env file with:"
echo "   - Proper # comment syntax"
echo "   - URL-safe hex-encoded passwords"
if [ "$OPENAI_KEY" != "your-openai-api-key-here" ]; then
    echo "   - Your OpenAI API key (preserved)"
else
    echo "   - Placeholder OpenAI key (edit .env to add yours)"
fi
echo ""
echo "🚀 Now run: docker-compose down && docker-compose up -d"
