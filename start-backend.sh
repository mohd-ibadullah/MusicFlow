#!/bin/bash
set -e

mkdir -p /tmp/mongodb-data

if ! mongod --dbpath /tmp/mongodb-data --fork --logpath /tmp/mongodb.log 2>/dev/null; then
  echo "MongoDB may already be running, continuing..."
fi

sleep 1

cd Backend
exec node server.js
