-- Migration: Add regions table
-- This replaces hardcoded regions in regions.js

CREATE TABLE IF NOT EXISTS `regions` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `host` VARCHAR(100) NOT NULL,
  `endpoint` VARCHAR(100) NOT NULL,
  `serverPublicKey` TEXT NOT NULL,
  `baseIp` VARCHAR(20) NOT NULL,
  `dns` VARCHAR(50) NOT NULL DEFAULT '1.1.1.1',
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `idx_active` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrate existing regions from .env to database
-- You'll need to run this manually with your actual values
-- Example:
-- INSERT INTO regions (id, name, host, endpoint, serverPublicKey, baseIp, dns) VALUES
-- ('jp-tokyo', 'Japan (Tokyo)', '35.78.219.52', '35.78.219.52:51820', 'your-pubkey', '10.30.0', '1.1.1.1'),
-- ('ca-toronto', 'Canada (Toronto)', '35.183.23.201', '35.183.23.201:51820', 'your-pubkey', '10.40.0', '1.1.1.1');
