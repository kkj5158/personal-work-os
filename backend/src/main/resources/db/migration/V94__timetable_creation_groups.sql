ALTER TABLE calendar_timetable_blocks ADD COLUMN creation_group_id UUID;

-- V91 batch receipts are authoritative provenance. Only untouched, active members
-- can be recovered: an earlier individual edit/delete must not rejoin a group.
-- Timetable-copy receipts contain no blocks array and are deliberately excluded.
WITH receipts AS (
    SELECT user_id, operation_id, response_json::jsonb AS response
    FROM calendar_creation_operations
    WHERE operation_kind LIKE 'timetable:%'
), batches AS (
    SELECT * FROM receipts
    WHERE CASE WHEN jsonb_typeof(response->'blocks') = 'array'
               THEN jsonb_array_length(response->'blocks') BETWEEN 2 AND 7 ELSE false END
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(response->'blocks') item
                      WHERE item ? 'creationGroupId')
), members AS (
    SELECT r.user_id, r.operation_id, item->>'id' AS block_id,
           item->>'timetableId' AS timetable_id, item->>'weekday' AS weekday
    FROM batches r CROSS JOIN LATERAL jsonb_array_elements(r.response->'blocks') item
), valid AS (
    SELECT m.user_id, m.operation_id
    FROM members m
    LEFT JOIN calendar_timetable_blocks b ON b.id::text=m.block_id AND b.timetable_id::text=m.timetable_id
    LEFT JOIN calendar_timetables t ON t.id=b.timetable_id AND t.owner_id=m.user_id
    GROUP BY m.user_id,m.operation_id
    HAVING count(*)=count(t.id) AND count(*)=count(DISTINCT m.block_id)
       AND count(*)=count(DISTINCT m.weekday) AND count(DISTINCT m.timetable_id)=1
)
UPDATE calendar_timetable_blocks b SET creation_group_id=m.operation_id
FROM members m JOIN valid v USING(user_id,operation_id)
WHERE b.id::text=m.block_id AND b.timetable_id::text=m.timetable_id
  AND b.version=0 AND b.deleted_at IS NULL;

CREATE UNIQUE INDEX uq_timetable_creation_group_weekday
    ON calendar_timetable_blocks(timetable_id,creation_group_id,weekday)
    WHERE creation_group_id IS NOT NULL AND deleted_at IS NULL;
