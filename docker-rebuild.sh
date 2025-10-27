#!/bin/bash

# Docker Rebuild Script for Sitrec (Development)
# Quick rebuild after source changes - uses cache for speed
# Works on Mac and Ubuntu

set -e  # Exit on any error

echo "🔨 Starting Docker rebuild for Sitrec..."
echo ""

# Change to the directory where this script is located
cd "$(dirname "$0")"

echo "📍 Working directory: $(pwd)"
echo ""

# Step 1: Rebuild images (with cache)
echo "1️⃣  Rebuilding Docker images..."
docker compose -p sitrec build
echo "   ✓ Build complete"
echo ""

# Step 2: Restart services
echo "2️⃣  Restarting services..."
docker compose -p sitrec up -d
echo "   ✓ Services restarted"
echo ""

echo "✅ Docker rebuild complete!"
echo ""
echo "Access the application at: http://localhost:6425"
echo ""
echo "View logs: docker compose -p sitrec logs -f"