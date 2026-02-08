#!/bin/sh
set -e

# Copy the mounted key to a writable location and lock permissions
if [ -f "${SSH_KEY_PATH:-}" ]; then
  mkdir -p /root/.ssh
  cp "$SSH_KEY_PATH" /root/.ssh/vpnctl_ed25519
  chmod 600 /root/.ssh/vpnctl_ed25519
  export SSH_KEY_PATH=/root/.ssh/vpnctl_ed25519
fi

# Sync database schema
echo "Syncing database schema..."
npx prisma db push --skip-generate

# Run region migration (only if regions table is empty and migration script exists)
if [ -f "/app/scripts/migrate-regions-to-db.js" ]; then
  echo "Running region migration check..."
  node /app/scripts/migrate-regions-to-db.js 2>&1 || echo "Migration completed or skipped"
else
  echo "Migration script not found, skipping..."
fi

exec "$@"
