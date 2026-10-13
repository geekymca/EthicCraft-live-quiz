# Implementation Plan: Deduplicate Existing Participant Rows & Apply Unique Index

Resolve the PostgreSQL error `23505: could not create unique index "idx_room_phone_unique"` caused by existing duplicate test entries in the `participants` table.

---

## 1. Problem Diagnostics
* **Root Cause**: The `participants` table contains existing historical rows where the same participant entered multiple times with the same phone number (or roll number) in the same room (e.g. `room_code = '9768NR', phone_number = '24001002041'`).
* **PostgreSQL Behavior**: PostgreSQL forbids creating a `UNIQUE` index on a table that already contains duplicate key values.

---

## 2. Solution Strategy
1. **Deduplicate Existing Rows**:
   Run a SQL query that identifies duplicate `(room_code, phone_number)` rows and keeps only the latest row (or the one with the highest score), deleting redundant duplicate rows.
   Alternatively, provide an option to purge all historical participant rows if previous test data is no longer needed.
2. **Apply the Unique Index**:
   Once duplicates are removed, create the `UNIQUE INDEX idx_room_phone_unique ON participants (room_code, phone_number);`.

---

## 3. SQL Execution Plan
* Provide the deduplication script using `ctid` or `ROW_NUMBER() OVER (PARTITION BY room_code, phone_number ORDER BY score DESC, ctid DESC)` to retain the best score entry.
* Provide the safe unique index creation script.
