-- Optional, owner-editable session metadata. Kept outside answers and the immutable report snapshot.
ALTER TABLE authoring_sessions ADD COLUMN title VARCHAR(200);
ALTER TABLE authoring_sessions ADD COLUMN memo VARCHAR(5000);
