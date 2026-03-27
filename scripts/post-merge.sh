#!/bin/bash
set -e

echo "=== Post-merge setup ==="

echo "Installing Backend dependencies..."
cd Backend && npm install --prefer-offline 2>&1 | tail -3
cd ..

echo "Installing MusicWebApp dependencies..."
cd MusicWebApp && npm install --prefer-offline 2>&1 | tail -3
cd ..

echo "Installing Admin dependencies..."
cd admin && npm install --prefer-offline 2>&1 | tail -3
cd ..

echo "=== Post-merge setup complete ==="
