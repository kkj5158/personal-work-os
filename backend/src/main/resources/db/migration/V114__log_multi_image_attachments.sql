-- Expand ordered relationships in place. All existing posts, drafts, images and order remain intact.
-- Service configuration controls the current attachment cap (default 20, maximum 100).
ALTER TABLE log_post_images DROP CONSTRAINT log_post_images_position_check;
ALTER TABLE log_post_images ADD CONSTRAINT log_post_images_position_check CHECK(position BETWEEN 0 AND 99);
ALTER TABLE log_draft_images DROP CONSTRAINT log_draft_images_position_check;
ALTER TABLE log_draft_images ADD CONSTRAINT log_draft_images_position_check CHECK(position BETWEEN 0 AND 99);
