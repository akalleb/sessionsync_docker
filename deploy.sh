#!/bin/bash

# Stop script on error
set -e

echo "Deploying SessionSync..."

# 1. Update repository
echo "Pulling latest changes..."
git pull origin main

# 2. Rebuild images (forcing no cache to ensure latest code and dependencies)
echo "Building Docker images..."
# We need to export VITE_ variables so docker-compose can use them in build args
# This assumes they are in .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

docker compose build --no-cache

# 3. Start containers
echo "Starting services..."
docker compose up -d

# 4. Clean up old images
echo "Pruning unused images..."
docker image prune -f

echo "Deployment complete!"
