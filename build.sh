#!/bin/bash
set -e

echo "Building Veiled Markets..."
echo "Current directory: $(pwd)"
echo "Listing files:"
ls -la

# Navigate to frontend directory
cd frontend

echo "Installing dependencies..."
npm install

echo "Building application..."
npm run build

echo "Build complete!"
