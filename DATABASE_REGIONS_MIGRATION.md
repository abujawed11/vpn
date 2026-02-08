# 🗄️ Database Regions Migration Guide

**Moving from hardcoded regions to database-driven regions**

This enables dynamic region management via admin panel!

---

## Why This Change?

### ❌ Old Way (Hardcoded)
```javascript
// src/data/regions.js
export const REGIONS = [
  { id: "jp-tokyo", name: "Japan", ... },
];
```

**Problems:**
- Manual file editing required
- Backend restart needed
- No admin panel possible
- Can't track region history

### ✅ New Way (Database)
```javascript
// Load dynamically from database
const regions = await prisma.region.findMany();
```

**Benefits:**
- Add regions via admin panel
- No restart needed
- Track creation date, creator
- Enable/disable regions instantly
- Search, filter, paginate

---

## Migration Steps

### Step 1: Run Database Migration

**On your VPS (where backend runs):**

```bash
cd /home/ubuntu/vpn/vpn-back

# Generate Prisma client
npx prisma generate

# Run migration
npx prisma migrate dev --name add_regions_table
```

**Expected output:**
```
✔ Generated Prisma Client
✔ Migration applied successfully
```

**Verify table exists:**
```bash
docker exec -it vpn-mysql mysql -u vpn_user -p vpn_db
```

```sql
SHOW TABLES;
-- Should see 'regions' table

DESCRIBE regions;
-- Should show all columns
```

---

### Step 2: Migrate Existing Regions

**Run migration script:**

```bash
cd /home/ubuntu/vpn
node scripts/migrate-regions-to-db.js
```

**Expected output:**
```
🔄 Starting region migration...

Found 2 region(s) in .env file:

  📍 Japan (Tokyo) (jp-tokyo)
     Host: 35.78.219.52
     Base IP: 10.30.0

  📍 Canada (Toronto) (ca-toronto)
     Host: 35.183.23.201
     Base IP: 10.40.0

💾 Saving to database...

  ✅ Inserted jp-tokyo
  ✅ Inserted ca-toronto

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Migration Complete!
   Inserted: 2
   Skipped:  0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Step 3: Verify Data

**Check database:**

```bash
docker exec -it vpn-mysql mysql -u vpn_user -p vpn_db
```

```sql
SELECT id, name, host, baseIp, isActive FROM regions;
```

**Should show:**
```
+------------+-------------------+---------------+---------+----------+
| id         | name              | host          | baseIp  | isActive |
+------------+-------------------+---------------+---------+----------+
| jp-tokyo   | Japan (Tokyo)     | 35.78.219.52  | 10.30.0 | 1        |
| ca-toronto | Canada (Toronto)  | 35.183.23.201 | 10.40.0 | 1        |
+------------+-------------------+---------------+---------+----------+
```

✅ **If you see this, migration successful!**

---

### Step 4: Restart Backend

```bash
cd /home/ubuntu/vpn
docker-compose restart vpn-back

# Check logs
docker logs vpn-vpn-back-1 --tail 50
```

**Look for:**
- No errors about REGIONS
- Backend starts successfully

---

### Step 5: Test in Dashboard

**Open your dashboard:**

1. Go to "Generate VPN Config"
2. **Region dropdown should still show** your regions
3. Select a region and download config
4. **Should work exactly as before**

✅ **If this works, migration is complete!**

---

## What Changed (Code)

### Before:
```javascript
// routes/regions.js
import { REGIONS } from "../data/regions.js";

router.get("/", (_req, res) => {
  res.json(REGIONS.map(({ id, name }) => ({ id, name })));
});
```

### After:
```javascript
// routes/regions.js
import prisma from "../lib/prisma.js";

router.get("/", async (_req, res) => {
  const regions = await prisma.region.findMany({
    where: { isActive: true }
  });
  res.json(regions);
});
```

**Result:** Regions loaded from database instead of hardcoded file!

---

## Files Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | ✅ Added Region model |
| `src/routes/regions.js` | ✅ Load from database |
| `src/routes/config.js` | ✅ Load from database |

| File | Status |
|------|--------|
| `src/data/regions.js` | ⚠️ No longer used (can delete later) |

---

## Next Steps: Admin Panel

Now that regions are in the database, you can:

### 1. Add Regions via API

```bash
curl -X POST https://vpn.engageswap.in/api/admin/regions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "id": "sg-singapore",
    "name": "Singapore",
    "host": "13.229.xxx.xxx",
    "endpoint": "13.229.xxx.xxx:51820",
    "serverPublicKey": "...",
    "baseIp": "10.50.0",
    "dns": "1.1.1.1"
  }'
```

### 2. Disable a Region

```bash
curl -X PATCH https://vpn.engageswap.in/api/admin/regions/sg-singapore \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"isActive": false}'
```

### 3. List All Regions

```bash
curl https://vpn.engageswap.in/api/admin/regions \
  -H "Authorization: Bearer <admin-token>"
```

---

## Troubleshooting

### Problem: Migration script shows "No regions found"

**Cause:** Script can't find REGION_* variables in .env

**Fix:**
```bash
# Check .env file exists
ls -la /home/ubuntu/vpn/vpn-back/.env

# Verify it has REGION_* variables
cat /home/ubuntu/vpn/vpn-back/.env | grep REGION_

# If missing, add them manually
nano /home/ubuntu/vpn/vpn-back/.env
```

---

### Problem: "Table 'regions' doesn't exist"

**Cause:** Migration didn't run

**Fix:**
```bash
cd /home/ubuntu/vpn/vpn-back
npx prisma migrate dev --name add_regions_table

# If that fails, run SQL manually
docker exec -it vpn-mysql mysql -u vpn_user -p vpn_db < prisma/migrations/add_regions_table.sql
```

---

### Problem: Dashboard shows empty region dropdown

**Cause 1:** Backend not restarted
```bash
docker-compose restart vpn-back
```

**Cause 2:** No regions in database
```bash
# Check database
docker exec -it vpn-mysql mysql -u vpn_user -p vpn_db -e "SELECT COUNT(*) FROM regions WHERE isActive=1"

# Should return > 0
# If 0, run migration script again
```

**Cause 3:** Backend error loading regions
```bash
# Check logs
docker logs vpn-vpn-back-1 --tail 100

# Look for errors about prisma or regions
```

---

### Problem: Config generation fails

**Error:**
```
Invalid regionId
```

**Debug:**
```bash
# Check region exists and is active
docker exec -it vpn-mysql mysql -u vpn_user -p vpn_db
```

```sql
SELECT id, isActive FROM regions WHERE id = 'jp-tokyo';
```

**Fix:**
- Ensure `isActive = 1`
- Ensure regionId matches exactly

---

## Manual Region Insert

If migration script doesn't work, insert manually:

```sql
INSERT INTO regions (
  id,
  name,
  host,
  endpoint,
  serverPublicKey,
  baseIp,
  dns,
  isActive
) VALUES (
  'sg-singapore',
  'Singapore',
  '13.229.xxx.xxx',
  '13.229.xxx.xxx:51820',
  'your-server-public-key-here',
  '10.50.0',
  '1.1.1.1',
  1
);
```

---

## Database Schema

```sql
CREATE TABLE regions (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  host VARCHAR(100) NOT NULL,
  endpoint VARCHAR(100) NOT NULL,
  serverPublicKey TEXT NOT NULL,
  baseIp VARCHAR(20) NOT NULL,
  dns VARCHAR(50) DEFAULT '1.1.1.1',
  isActive BOOLEAN DEFAULT true,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Indexes:**
- `PRIMARY KEY (id)`
- `INDEX idx_active (isActive)`

---

## Rollback (If Needed)

If something goes wrong, you can rollback:

**Step 1: Restore old code**
```bash
git revert <commit-hash>
```

**Step 2: Restart backend**
```bash
docker-compose restart vpn-back
```

**Step 3: (Optional) Drop regions table**
```sql
DROP TABLE regions;
```

**Note:** Your VPN configs will NOT be affected. They reference regionId as a string, not a foreign key.

---

## FAQ

### Q: Can I keep REGION_* in .env?
**A:** Yes! They won't hurt. But database takes priority. You can clean them up later.

### Q: Do I need to update frontend?
**A:** No! Frontend just calls `/api/regions`, which now returns from database.

### Q: Will existing VPN configs break?
**A:** No! VpnConfig table still stores regionId as string. No foreign key constraint.

### Q: Can I add regions via SQL?
**A:** Yes! Use INSERT statement above. But admin panel is easier.

### Q: How do I backup regions?
**A:**
```bash
docker exec vpn-mysql mysqldump -u vpn_user -p vpn_db regions > regions_backup.sql
```

### Q: Can I edit region details?
**A:**
```sql
UPDATE regions
SET name = 'Japan (Tokyo Updated)',
    host = 'new-ip-address'
WHERE id = 'jp-tokyo';
```

---

## Success Checklist

- [ ] `regions` table created
- [ ] Existing regions migrated
- [ ] Backend restarted
- [ ] Dashboard shows regions
- [ ] Can download VPN config
- [ ] VPN connects successfully
- [ ] Timer works (handshake → expiry)
- [ ] No errors in logs

✅ **If all checked, you're ready for admin panel!**

---

## Next: Build Admin Panel

Now that regions are in database:

**Week 1:**
- Admin authentication
- List regions endpoint
- Add region endpoint
- Simple UI

**Week 2:**
- SSH automation
- Setup progress tracking
- Region health monitoring

**See `MONETIZATION_PLAN.md` for full roadmap!**

---

**Last Updated:** February 8, 2026
**Version:** 1.0

🎉 **You're now ready for dynamic region management!**
