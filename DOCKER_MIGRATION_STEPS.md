# 🐳 Docker Migration Steps - Database Regions

**Corrected steps for Docker setup**

---

## ✅ Super Simple Method (Recommended)

Since your backend runs in Docker, the migration is **automatic**!

### On Your VPS:

```bash
cd /home/ubuntu/vpn

# 1. Pull latest code
git pull

# 2. Rebuild containers
docker-compose down
docker-compose build vpn-back

# 3. Start containers (migration runs automatically!)
docker-compose up -d

# 4. Watch the logs
docker logs vpn-vpn-back-1 -f
```

**What happens automatically:**
1. ✅ Database schema synced (`prisma db push`)
2. ✅ `regions` table created
3. ✅ Existing regions migrated from .env
4. ✅ Backend starts with database regions

**Expected logs:**
```
Syncing database schema...
✅ Database schema in sync

Running region migration check...
🔄 Starting region migration...

Found 2 region(s) in .env file:
  📍 Japan (Tokyo) (jp-tokyo)
  📍 Canada (Toronto) (ca-toronto)

💾 Saving to database...
  ✅ Inserted jp-tokyo
  ✅ Inserted ca-toronto

✅ Migration Complete!

vpn-back listening on :5060 with WebSocket support
```

---

## 🔧 Manual Method (If Automatic Fails)

If automatic migration doesn't work, run manually:

```bash
# 1. Enter the running container
docker-compose exec vpn-back sh

# 2. Check if regions table exists
npx prisma db push

# 3. Run migration script
node scripts/migrate-regions-to-db.js

# 4. Exit container
exit

# 5. Restart
docker-compose restart vpn-back
```

---

## ✅ Verify Migration

### Check Database:

```bash
# Enter MySQL container
docker exec -it vpn-mysql mysql -u vpn_user -pvpnpassword vpn_db

# Check regions
SELECT id, name, host, baseIp, isActive FROM regions;

# Exit
exit
```

**Expected output:**
```
+------------+-------------------+---------------+---------+----------+
| id         | name              | host          | baseIp  | isActive |
+------------+-------------------+---------------+---------+----------+
| jp-tokyo   | Japan (Tokyo)     | 35.78.219.52  | 10.30.0 | 1        |
| ca-toronto | Canada (Toronto)  | 35.183.23.201 | 10.40.0 | 1        |
+------------+-------------------+---------------+---------+----------+
```

### Check API:

```bash
curl https://vpn.engageswap.in/api/regions
```

**Expected:**
```json
[
  {"id": "jp-tokyo", "name": "Japan (Tokyo)"},
  {"id": "ca-toronto", "name": "Canada (Toronto)"}
]
```

### Check Dashboard:

1. Open dashboard
2. Go to "Generate VPN Config"
3. **Should show regions in dropdown** ✅

---

## 🐛 Troubleshooting

### Problem: "Migration script not found"

**Fix:**
```bash
# Check if script exists in container
docker-compose exec vpn-back ls -la /app/scripts/

# If missing, rebuild
docker-compose build vpn-back
docker-compose up -d
```

---

### Problem: "No regions found in .env"

**Cause:** .env file not mounted or empty

**Fix:**
```bash
# Check .env is mounted
docker-compose exec vpn-back cat /app/.env | grep REGION_

# If empty, add regions manually to database
docker exec -it vpn-mysql mysql -u vpn_user -pvpnpassword vpn_db

# Then insert manually (see below)
```

**Manual Insert:**
```sql
INSERT INTO regions (id, name, host, endpoint, serverPublicKey, baseIp, dns, isActive) VALUES
('jp-tokyo', 'Japan (Tokyo)', '35.78.219.52', '35.78.219.52:51820', 'your-pubkey', '10.30.0', '1.1.1.1', 1);
```

---

### Problem: Container crashes on startup

**Debug:**
```bash
# View logs
docker logs vpn-vpn-back-1 --tail 100

# Common issues:
# - Database not ready
# - Invalid .env format
# - Prisma schema error
```

**Fix:**
```bash
# Ensure MySQL is healthy
docker-compose ps

# Should show:
# vpn-mysql - Up (healthy)

# If not, wait 30 seconds and retry
```

---

## 📦 What Changed in Docker

### `docker-entrypoint.sh`
```sh
# Auto-runs on container start:
1. Syncs database schema (creates regions table)
2. Checks if regions table is empty
3. If empty, runs migration from .env
4. Starts backend
```

### `Dockerfile`
```dockerfile
# No changes needed
# Just rebuild to pick up new code
```

### `docker-compose.yml`
```yaml
# No changes needed
# Existing setup works fine
```

---

## 🎯 Quick Commands Reference

```bash
# Rebuild and restart
docker-compose down
docker-compose build vpn-back
docker-compose up -d

# View logs
docker logs vpn-vpn-back-1 -f

# Check database
docker exec -it vpn-mysql mysql -u vpn_user -pvpnpassword vpn_db -e "SELECT * FROM regions"

# Run migration manually
docker-compose exec vpn-back node scripts/migrate-regions-to-db.js

# Check API
curl https://vpn.engageswap.in/api/regions
```

---

## ✅ Success Checklist

- [ ] Code pulled (`git pull`)
- [ ] Container rebuilt (`docker-compose build`)
- [ ] Container started (`docker-compose up -d`)
- [ ] Logs show "Migration Complete"
- [ ] Database has regions (`SELECT * FROM regions`)
- [ ] API returns regions (`curl /api/regions`)
- [ ] Dashboard shows regions
- [ ] VPN config downloads
- [ ] Everything works as before!

---

## 🚀 Next Steps

Once migration is successful:

1. **Verify everything works**
2. **Optional:** Remove REGION_* from .env (not needed anymore)
3. **Ready for admin panel!** 🎨

The foundation is now set for:
- Adding regions via API
- Admin panel UI
- One-click EC2 setup
- Dynamic region management

---

**Time Required:** 5 minutes
**Difficulty:** Easy (mostly automatic!)

🎉 **Your regions are now database-driven!**
