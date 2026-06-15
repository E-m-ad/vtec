-- Mark stale inventory count snapshots as read-only.
ALTER TYPE "InventoryCountStatus" ADD VALUE 'outdated';
