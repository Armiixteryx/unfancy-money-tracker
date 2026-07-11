-- Synthetic-only local backend fixture. The client still starts with an empty dataset.
INSERT INTO datasets (dataset_id, owner_subject)
VALUES ('00000000-0000-4000-8000-000000000001', 'local-synthetic-user')
ON CONFLICT (dataset_id) DO NOTHING;

INSERT INTO sync_records (
  dataset_id, entity_type, record_id, revision, base_revision, operation, payload, tombstone
)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'category',
  '00000000-0000-4000-8000-000000000010',
  1,
  0,
  'upsert',
  '{"kind":"expense","name":"Synthetic category"}'::jsonb,
  FALSE
)
ON CONFLICT (dataset_id, entity_type, record_id) DO NOTHING;

