-- Add adBlockEnabled column to vpn_configs table
ALTER TABLE `vpn_configs` ADD COLUMN `adBlockEnabled` BOOLEAN NOT NULL DEFAULT 0 COMMENT 'Enable DNS-based ad blocking (admin only)';
