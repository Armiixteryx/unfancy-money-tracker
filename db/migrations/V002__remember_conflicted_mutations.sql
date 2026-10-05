-- Remember valid requests even when they need manual conflict resolution.
-- A mutation identity can never be reused with different contents.
CREATE TABLE mutation_requests (
  dataset_id uuid NOT NULL REFERENCES datasets(id),
  mutation_id uuid NOT NULL CHECK (substring(mutation_id::text,15,1)='7'),
  request_hash text NOT NULL,
  PRIMARY KEY (dataset_id,mutation_id)
);
INSERT INTO mutation_requests(dataset_id,mutation_id,request_hash)
SELECT dataset_id,mutation_id,request_hash FROM mutation_acknowledgments;
CREATE TRIGGER immutable_requests BEFORE UPDATE OR DELETE ON mutation_requests
FOR EACH ROW EXECUTE FUNCTION reject_change_modification();
GRANT SELECT,INSERT ON mutation_requests TO unfancy_sync;
