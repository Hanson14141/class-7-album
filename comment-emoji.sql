-- One small inventory photo attachment per comment; no image data copies.
ALTER TABLE class7_test.comments ADD COLUMN IF NOT EXISTS emoji_photo_id text;
ALTER TABLE class7_test.comments ADD COLUMN IF NOT EXISTS emoji_title text;
