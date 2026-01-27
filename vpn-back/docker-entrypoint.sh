#!/bin/sh
set -e

# Copy the mounted key to a writable location and lock permissions
if [ -f "${SSH_KEY_PATH:-}" ]; then
  mkdir -p /root/.ssh
  cp "$SSH_KEY_PATH" /root/.ssh/vpnctl_ed25519
  chmod 600 /root/.ssh/vpnctl_ed25519
  export SSH_KEY_PATH=/root/.ssh/vpnctl_ed25519
fi

# Run database migrations
echo "Running database migrations..."
npx prisma migrate deploy

exec "$@"
