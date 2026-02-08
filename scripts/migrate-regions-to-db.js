#!/usr/bin/env node
/**
 * Migration Script: Move regions from .env to database
 *
 * This script helps migrate your existing hardcoded regions
 * from .env file into the database.
 *
 * Usage:
 *   node scripts/migrate-regions-to-db.js
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './vpn-back/.env' });

const prisma = new PrismaClient();

async function migrateRegions() {
  console.log('🔄 Starting region migration...\n');

  const regions = [];

  // Tokyo region
  if (process.env.REGION_TOKYO_ID) {
    regions.push({
      id: process.env.REGION_TOKYO_ID,
      name: process.env.REGION_TOKYO_NAME || 'Japan (Tokyo)',
      host: process.env.REGION_TOKYO_HOST,
      endpoint: process.env.REGION_TOKYO_ENDPOINT,
      serverPublicKey: process.env.REGION_TOKYO_SERVER_PUBLIC_KEY,
      baseIp: process.env.REGION_TOKYO_BASE_IP,
      dns: process.env.DNS_DEFAULT || '1.1.1.1',
    });
  }

  // Canada region
  if (process.env.REGION_CA_TORONTO_ID) {
    regions.push({
      id: process.env.REGION_CA_TORONTO_ID,
      name: process.env.REGION_CA_TORONTO_NAME || 'Canada (Toronto)',
      host: process.env.REGION_CA_TORONTO_HOST,
      endpoint: process.env.REGION_CA_TORONTO_ENDPOINT,
      serverPublicKey: process.env.REGION_CA_TORONTO_SERVER_PUBLIC_KEY,
      baseIp: process.env.REGION_CA_TORONTO_BASE_IP,
      dns: process.env.DNS_DEFAULT || '1.1.1.1',
    });
  }

  // Add more regions here if needed
  // Just follow the same pattern above

  console.log(`Found ${regions.length} region(s) in .env file:\n`);

  for (const region of regions) {
    console.log(`  📍 ${region.name} (${region.id})`);
    console.log(`     Host: ${region.host}`);
    console.log(`     Base IP: ${region.baseIp}`);
    console.log('');
  }

  if (regions.length === 0) {
    console.log('⚠️  No regions found in .env file!');
    console.log('   Make sure your .env has REGION_*_ID variables set.');
    process.exit(1);
  }

  console.log('💾 Saving to database...\n');

  let inserted = 0;
  let skipped = 0;

  for (const region of regions) {
    try {
      // Check if region already exists
      const existing = await prisma.region.findUnique({
        where: { id: region.id },
      });

      if (existing) {
        console.log(`  ⏭️  Skipped ${region.id} (already exists)`);
        skipped++;
        continue;
      }

      // Insert region
      await prisma.region.create({
        data: region,
      });

      console.log(`  ✅ Inserted ${region.id}`);
      inserted++;
    } catch (error) {
      console.error(`  ❌ Failed to insert ${region.id}:`, error.message);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Migration Complete!');
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped:  ${skipped}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (inserted > 0) {
    console.log('📝 Next steps:');
    console.log('   1. Verify regions in database:');
    console.log('      SELECT * FROM regions;');
    console.log('   2. Restart your backend');
    console.log('   3. Test region loading in dashboard');
    console.log('   4. (Optional) Remove REGION_* vars from .env\n');
  }

  await prisma.$disconnect();
}

migrateRegions().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
