# ERP Cleanliness Audit Report

Date: 2026-06-07  
Scope: Current database and code state after recent supplier Excel import/cleanup attempts.  
Rule for this audit: read-only database inspection. No cleanup, import, delete, restore, or data migration was performed.

## Executive Summary

The system is not in a clean ERP state right now.

The main issue is not the supplier Excel files themselves. The issue is that the cleanup appears to have removed only part of the supplier import data. The database now contains imported product masters and imported purchase headers, but the supplier ledger around them is missing.

This creates a mixed state:

- Suppliers table is empty.
- Imported purchase headers still exist.
- Those purchases have no supplier and no purchase items.
- Imported products still exist, mostly with generated `SUP-...` part numbers.
- Stock movements are empty, while some products still have stock quantities.
- Sales exist, but sale item rows are empty.

This is not acceptable by normal ERP standards because core ledgers cannot be reconciled.

## Current Database State

### Master Data

| Area | Count | Comment |
|---|---:|---|
| Suppliers | 0 | Critical: no supplier master records exist. |
| Products | 523 | Includes 507 supplier-import-created products. |
| Customers | 3 | Present. |

Imported product status:

| Check | Count |
|---|---:|
| Products tagged `supplier-excel-import` | 507 |
| Imported products with stock `0` | 507 |
| Imported products with non-zero stock | 0 |
| Products using generated `SUP-...` SKU | 339 |
| Products using generated `MISSINGPART...` SKU | 14 |

Observation: The supplier import did not change stock quantity on those 507 products, but it did add many product master rows. Many of these are not clean product master records because they were created from supplier ledger text, not from a controlled product catalog review.

### Purchasing / Supplier Ledger

| Area | Count / Value | Comment |
|---|---:|---|
| Purchases | 266 | All are imported purchase headers. |
| Purchases with `supplier_id = null` | 266 | Critical: all purchases are orphaned from suppliers. |
| Purchases tagged `supplier-excel-import` | 266 | Import leftovers remain. |
| Purchases without purchase items | 266 | Critical: every purchase header has no item lines. |
| Purchase item rows | 0 | Critical. |
| Purchase total amount | 2,005,003.65 | Not supported by item lines. |
| Supplier payments | 0 | Removed/absent. |
| Supplier product settlements | 0 | Removed/absent. |

ERP-standard finding: A purchase invoice must have a supplier and at least one line item, and the invoice total should reconcile to the line total. Current purchase records fail all three requirements.

### Sales Ledger

| Area | Count / Value | Comment |
|---|---:|---|
| Sales | 20 | Present. |
| Sales without sale items | 20 | Critical unless these are intended service-only invoices, but current item table is empty. |
| Sale item rows | 0 | Critical for product sales. |
| Sales total amount | 68,179.00 | Not supported by item lines. |
| Sales paid amount | 39,924.93 | Present but not enough to validate sales contents. |

ERP-standard finding: A sale invoice should have product/service lines, and totals should reconcile to those lines. Current sale records do not meet that standard.

### Inventory Ledger

| Area | Count / Value | Comment |
|---|---:|---|
| Stock movements | 0 | Critical: no stock audit trail currently exists. |
| Product stock quantity total | 19 | Products still have stock despite no movement rows. |
| Imported stock movements | 0 | Supplier import did not create stock movement rows. |

Sample mismatch found:

- Product `MISSINGPART0441` has stock `1`, but movement quantity `0`.
- Product `MISSINGPART0639` has stock `1`, but movement quantity `0`.
- Product `12312312` has stock `1`, but movement quantity `0`.

ERP-standard finding: Product stock should reconcile to stock movement history, opening balances, inventory count adjustments, purchases, sales, and returns. Current stock quantities do not have an audit trail.

## Current Code State

The following supplier-import-related code still exists:

- `backend/scripts/importSupplierWorkbooks.js`
- `backend/package.json` contains `import:suppliers`
- Supplier profile still contains the “Products Received / Sent With Supplier” section.
- Backend supplier service still aggregates received and sent supplier products.

This code is not automatically running. The risk is that it can still be run manually.

## ERP Standards To Aim For

### 1. Product Master

A clean ERP product should have:

- One stable SKU/part number.
- Clear product name.
- Optional barcode, category, brand, supplier reference.
- No duplicate pseudo-products created from ledger text.
- Stock quantity derived from controlled stock processes.

Current risk: many supplier-import products are created from workbook text and may duplicate existing products.

### 2. Inventory

Inventory should be controlled by:

- Opening stock import or inventory count.
- Purchase receipts.
- Sales.
- Purchase returns / supplier product settlements.
- Sale returns.
- Manual adjustments with reason and audit trail.

Current risk: product quantities exist without stock movements, so inventory is not auditable.

### 3. Purchasing / Accounts Payable

Every supplier purchase should have:

- Supplier.
- Invoice date.
- Invoice number or internal reference.
- Line items.
- Total amount equal to line totals.
- Payment records separate from invoice records.
- Supplier credit handling when overpaid or when products are sent instead of cash.

Current risk: imported purchase headers have value but no supplier and no item lines.

### 4. Sales

Every sale should have:

- Customer or walk-in customer.
- Product/service lines.
- Total equal to line totals.
- Payment records.
- Stock impact for product lines.

Current risk: sales exist without item lines.

### 5. Imports

ERP-standard imports should use staging:

1. Read Excel into a staging/import preview table or report.
2. Show rows as `valid`, `warning`, or `blocked`.
3. Let the user confirm mapping decisions.
4. Commit only clean rows.
5. Keep an immutable import batch record.
6. Never mix stock import and supplier financial import unless explicitly designed.

Current risk: supplier Excel import was committed directly into operational tables, then partially removed.

## What Is Correct

- The application has a reasonable modular structure: products, suppliers, purchases, sales, reports, backups.
- The schema already supports supplier payments and supplier product settlements.
- The supplier import did not create stock movement rows.
- The supplier import-created products all currently have stock `0`.
- Backup files still exist under `backend/backups`.

## What Is Not Correct

Critical:

1. Suppliers table is empty.
2. Purchases exist without suppliers.
3. Purchases exist without purchase items.
4. Sales exist without sale items.
5. Stock quantities exist without stock movements.
6. Imported product masters remain after supplier import cleanup.

High risk:

1. Product master has many generated/imported SKUs.
2. Purchase totals are not supported by item totals.
3. Stock movement audit trail is missing.
4. The import script still exists and can be run again.

## Recommended Cleanup Paths

### Option A: Restore A Known Clean Backup

Best if the backup represents the state before the supplier import confusion.

Candidate backup:

- `backend/backups/vtec_backup_2026-06-07_15-45-04.dump`

This backup was created immediately before the supplier import commit. If the goal is to return to the state before supplier import records were written, this is the safest candidate.

Do not restore it blindly. First confirm:

- It contains the desired stock sheet import.
- It contains the desired product catalog.
- It does not contain the supplier Excel import records.

### Option B: Surgical Cleanup

Use this only if restoring a backup would lose important work.

Possible cleanup scope:

- Delete purchase headers tagged `supplier-excel-import`.
- Delete products tagged `supplier-excel-import`.
- Remove the supplier importer script/command or disable it.
- Rebuild stock movements from the current stock sheet or opening inventory count.
- Recreate suppliers manually or via a new reviewed import.

This must be done with a fresh backup first.

### Option C: Start A Fresh Database

Best if the current data is mostly test/import data.

Clean order:

1. Product master import from reviewed stock sheet.
2. Opening stock inventory count with movement audit.
3. Supplier master import only.
4. Supplier balances as opening AP balances, not fake purchases.
5. Daily operations from the application going forward.

## Recommended Decision

I recommend pausing all supplier Excel import work.

Then choose one of these:

1. Restore the pre-import backup if it contains the correct product/stock state.
2. If not, do a surgical cleanup with a fresh backup.

After the database is clean, supplier Excel import should be redesigned as a staging/review workflow, not a direct commit workflow.

## Proposed Clean ERP Design Going Forward

For your business, the clean model should be:

- Stock sheet import controls product stock only.
- Supplier sheets should not change stock.
- Supplier sheets should create either:
  - supplier opening balance,
  - supplier payment history,
  - supplier product relationship history,
  - or reviewed purchase invoice lines only when the sheet is truly an invoice source.
- Products given to supplier instead of money should be recorded as supplier product settlement / credit.
- For live daily work, sending product to supplier should reduce stock.
- For historical supplier import, it may be recorded without stock movement if stock was already imported separately.

## Final Assessment

Current state: not ERP-clean.  
Main cause: partial cleanup left orphan imported records.  
Recommended next step: restore or clean before adding more features/imports.

