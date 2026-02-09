-- Add customDuration column to vpn_configs table
ALTER TABLE `vpn_configs` ADD COLUMN `customDuration` INT NULL COMMENT 'Custom duration in minutes (admin only), null = use plan defaults';
