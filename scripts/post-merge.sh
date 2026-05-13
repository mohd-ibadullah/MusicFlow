#!/bin/bash
set -e

echo "=== Post-merge setup ==="

echo "Installing server dependencies..."
cd server && npm install --prefer-offline 2>&1 | tail -3
cd ..

echo "Installing client dependencies..."
cd client && npm install --prefer-offline 2>&1 | tail -3
cd ..

echo "Installing Admin dependencies..."
cd admin && npm install --prefer-offline 2>&1 | tail -3
cd ..

echo "=== Post-merge setup complete ==="
