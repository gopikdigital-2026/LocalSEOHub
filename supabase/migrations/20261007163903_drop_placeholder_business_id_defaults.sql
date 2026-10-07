/*
# Remove placeholder business_id defaults

1. Modified Tables
- `first_value_progress.business_id`: removes the column default 'default'.
- `connected_sources.business_id`: removes the column default 'default'.

2. Why
- Every row now references a real `businesses.id` (UUID as text). A silent
  'default' fallback would hide bugs by writing rows to a non-existent business.
  Inserts must now supply the real business id explicitly.

3. Safety
- No data is changed or removed. Only the column default is dropped.
- Idempotent: dropping a default that is already absent is a no-op.
*/

ALTER TABLE first_value_progress ALTER COLUMN business_id DROP DEFAULT;
ALTER TABLE connected_sources ALTER COLUMN business_id DROP DEFAULT;
