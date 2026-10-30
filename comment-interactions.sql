-- Replies and private comment votes in the existing free PostgreSQL database.
ALTER TABLE class7_test.comments ADD COLUMN IF NOT EXISTS reply_to_id text;
ALTER TABLE class7_test.comments ADD COLUMN IF NOT EXISTS reply_to_author text;
ALTER TABLE class7_test.comments ADD COLUMN IF NOT EXISTS author_username text;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='comments_reply_to_fk' AND conrelid='class7_test.comments'::regclass) THEN
  ALTER TABLE class7_test.comments ADD CONSTRAINT comments_reply_to_fk FOREIGN KEY(reply_to_id) REFERENCES class7_test.comments(id) ON DELETE SET NULL;
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS comments_reply_to_created ON class7_test.comments(reply_to_id,created_at);
CREATE TABLE IF NOT EXISTS class7_test.comment_likes (
 comment_id text NOT NULL REFERENCES class7_test.comments(id) ON DELETE CASCADE,
 owner_hash text NOT NULL REFERENCES class7_test.accounts(owner_hash),
 created_at text NOT NULL,
 PRIMARY KEY(comment_id,owner_hash)
);
CREATE INDEX IF NOT EXISTS comment_likes_owner ON class7_test.comment_likes(owner_hash);
CREATE TABLE IF NOT EXISTS class7_test.reply_inbox_seen (
 account_id text PRIMARY KEY REFERENCES class7_test.accounts(id) ON DELETE CASCADE,
 seen_at text NOT NULL
);
REVOKE ALL ON TABLE class7_test.comment_likes,class7_test.reply_inbox_seen FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE class7_test.comment_likes,class7_test.reply_inbox_seen TO service_role;

CREATE OR REPLACE FUNCTION class7_test.set_comment_like(account_key text,comment_key text,should_like boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE raw_owner text; group_owner text; likes bigint; mine boolean;
BEGIN
 LOCK TABLE class7_test.account_owner_links IN SHARE MODE;
 SELECT owner_hash INTO raw_owner FROM class7_test.accounts WHERE id=account_key;
 IF raw_owner IS NULL THEN RETURN jsonb_build_object('unauthorized',true); END IF;
 PERFORM id FROM class7_test.comments WHERE id=comment_key FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('missing',true); END IF;
 group_owner:=class7_test.canonical_owner(raw_owner);
 PERFORM pg_advisory_xact_lock(hashtextextended('comment|'||comment_key||'|'||group_owner,0));
 IF should_like THEN
  INSERT INTO class7_test.comment_likes(comment_id,owner_hash,created_at)
  SELECT comment_key,raw_owner,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  WHERE NOT EXISTS(SELECT 1 FROM class7_test.comment_likes WHERE comment_id=comment_key AND class7_test.canonical_owner(owner_hash)=group_owner)
  ON CONFLICT(comment_id,owner_hash) DO NOTHING;
 ELSE
  DELETE FROM class7_test.comment_likes WHERE comment_id=comment_key AND class7_test.canonical_owner(owner_hash)=group_owner;
 END IF;
 SELECT count(DISTINCT class7_test.canonical_owner(owner_hash)),COALESCE(bool_or(class7_test.canonical_owner(owner_hash)=group_owner),false)
 INTO likes,mine FROM class7_test.comment_likes WHERE comment_id=comment_key;
 RETURN jsonb_build_object('likeCount',likes,'liked',mine);
END $$;
REVOKE ALL ON FUNCTION class7_test.set_comment_like(text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.set_comment_like(text,text,boolean) TO service_role;
