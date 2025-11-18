#!/bin/bash
echo "Generating secure JWT_SECRET..."
echo ""
SECRET=$(openssl rand -base64 48 | tr -d '\n')
echo "Add this to your .env file:"
echo ""
echo "JWT_SECRET=$SECRET"
echo ""
echo "Or run this to add it automatically:"
echo "echo 'JWT_SECRET=$SECRET' >> .env"
