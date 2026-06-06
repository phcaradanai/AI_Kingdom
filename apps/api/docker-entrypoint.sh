#!/bin/sh
set -eu

echo "Generating Prisma client..."
npx prisma generate

echo "Applying Prisma migrations with migrate deploy..."
npx prisma migrate deploy

echo "Seeding agents/settings only if needed..."
node dist/prisma/seed-staging.js

echo "Starting AI Kingdom API..."
node dist/src/server.js
