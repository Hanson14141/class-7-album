-- Private, server-managed likes. Account links define one voting identity.
CREATE TABLE IF NOT EXISTS class7_test.photo_likes (
 photo_id text NOT NULL REFERENCES class7_test.photos(id) ON DELETE CASCADE,
 owner_hash text NOT NULL REFERENCES class7_test.accounts(owner_hash),
 created_at text NOT NULL,
 PRIMARY KEY(photo_id,owner_hash)
);
CREATE INDEX IF NOT EXISTS photo_likes_owner ON class7_test.photo_likes(owner_hash);
REVOKE ALL ON TABLE class7_test.photo_likes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON class7_test.photo_likes TO service_role;
CREATE OR REPLACE FUNCTION class7_test.set_photo_like(account_key text,photo_key text,should_like boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE raw_owner text; group_owner text; likes bigint; mine boolean;
BEGIN
 -- Link/unlink takes SHARE ROW EXCLUSIVE; votes see one stable account group.
 LOCK TABLE class7_test.account_owner_links IN SHARE MODE;
 IF to_regprocedure('class7_test.contest_tick()') IS NOT NULL THEN PERFORM class7_test.contest_tick(); END IF;
 SELECT owner_hash INTO raw_owner FROM class7_test.accounts WHERE id=account_key;
 IF raw_owner IS NULL THEN RETURN jsonb_build_object('unauthorized',true); END IF;
 PERFORM id FROM class7_test.photos WHERE id=photo_key FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('missing',true); END IF;
 group_owner:=class7_test.canonical_owner(raw_owner);
 PERFORM pg_advisory_xact_lock(hashtextextended(photo_key||'|'||group_owner,0));
 IF should_like THEN
  INSERT INTO class7_test.photo_likes(photo_id,owner_hash,created_at)
  SELECT photo_key,raw_owner,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  WHERE NOT EXISTS(SELECT 1 FROM class7_test.photo_likes WHERE photo_id=photo_key AND class7_test.canonical_owner(owner_hash)=group_owner)
  ON CONFLICT(photo_id,owner_hash) DO NOTHING;
 ELSE
  DELETE FROM class7_test.photo_likes WHERE photo_id=photo_key AND class7_test.canonical_owner(owner_hash)=group_owner;
 END IF;
 SELECT count(DISTINCT class7_test.canonical_owner(owner_hash)),COALESCE(bool_or(class7_test.canonical_owner(owner_hash)=group_owner),false)
 INTO likes,mine FROM class7_test.photo_likes WHERE photo_id=photo_key;
 RETURN jsonb_build_object('likeCount',likes,'liked',mine);
END $$;
REVOKE ALL ON FUNCTION class7_test.set_photo_like(text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.set_photo_like(text,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION class7_test.unlink_account(source_id text,target_id text,expected_group text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE source_raw text; target_raw text; old_group text; new_group text; members text; photo_count bigint; comment_count bigint;
BEGIN
 LOCK TABLE class7_test.account_owner_links IN SHARE ROW EXCLUSIVE MODE;
 IF to_regprocedure('class7_test.contest_tick()') IS NOT NULL THEN PERFORM class7_test.contest_tick(); END IF;
 IF to_regprocedure('class7_test.comment_contest_tick()') IS NOT NULL THEN PERFORM class7_test.comment_contest_tick(); END IF;
 SELECT owner_hash INTO source_raw FROM class7_test.accounts WHERE id=source_id;
 SELECT owner_hash INTO target_raw FROM class7_test.accounts WHERE id=target_id;
 IF source_raw IS NULL OR target_raw IS NULL OR source_id=target_id THEN RETURN jsonb_build_object('invalid',true); END IF;
 old_group:=class7_test.canonical_owner(source_raw);
 IF class7_test.canonical_owner(target_raw)<>old_group THEN RETURN jsonb_build_object('notLinked',true); END IF;
 SELECT string_agg(username,'|' ORDER BY username) INTO members FROM class7_test.accounts WHERE class7_test.canonical_owner(owner_hash)=old_group;
 IF members IS DISTINCT FROM expected_group THEN RETURN jsonb_build_object('stale',true); END IF;
 SELECT count(*) INTO photo_count FROM class7_test.photos WHERE class7_test.canonical_owner(owner_hash)=old_group;
 SELECT count(*) INTO comment_count FROM class7_test.comments WHERE class7_test.canonical_owner(owner_hash)=old_group;
 new_group:=CASE WHEN old_group=target_raw THEN source_raw ELSE old_group END;
 INSERT INTO class7_test.profiles(device_hash,nickname,created_at,updated_at)
 SELECT new_group,nickname,created_at,updated_at FROM class7_test.profiles WHERE device_hash=old_group
 ON CONFLICT(device_hash) DO NOTHING;
 -- Only rows keyed to the removed account need to move. All other original
 -- owner identifiers and every file remain intact.
 UPDATE class7_test.photos SET owner_hash=new_group WHERE owner_hash=target_raw;
 UPDATE class7_test.comments SET owner_hash=new_group WHERE owner_hash=target_raw;
 -- Keep existing shared votes with the remaining group when a member leaves.
 IF to_regclass('class7_test.photo_likes') IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='class7_test.photo_likes'::regclass AND attname='week_start' AND NOT attisdropped) THEN
   INSERT INTO class7_test.photo_likes(photo_id,owner_hash,created_at,voted_at,week_start)
   SELECT photo_id,new_group,min(created_at),min(voted_at),week_start FROM class7_test.photo_likes WHERE owner_hash=target_raw GROUP BY photo_id,week_start
   ON CONFLICT(photo_id,owner_hash,week_start) DO UPDATE SET created_at=LEAST(class7_test.photo_likes.created_at,excluded.created_at),voted_at=LEAST(class7_test.photo_likes.voted_at,excluded.voted_at);
  ELSE
  INSERT INTO class7_test.photo_likes(photo_id,owner_hash,created_at)
  SELECT photo_id,new_group,min(created_at) FROM class7_test.photo_likes WHERE owner_hash=target_raw GROUP BY photo_id
  ON CONFLICT(photo_id,owner_hash) DO UPDATE SET created_at=LEAST(class7_test.photo_likes.created_at,excluded.created_at);
  END IF;
  DELETE FROM class7_test.photo_likes WHERE owner_hash=target_raw;
 END IF;
 IF to_regclass('class7_test.comment_likes') IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='class7_test.comment_likes'::regclass AND attname='week_start' AND NOT attisdropped) THEN
   INSERT INTO class7_test.comment_likes(comment_id,owner_hash,created_at,voted_at,week_start)
   SELECT comment_id,new_group,min(created_at),min(voted_at),week_start FROM class7_test.comment_likes WHERE owner_hash=target_raw GROUP BY comment_id,week_start
   ON CONFLICT(comment_id,owner_hash,week_start) DO UPDATE SET created_at=LEAST(class7_test.comment_likes.created_at,excluded.created_at),voted_at=LEAST(class7_test.comment_likes.voted_at,excluded.voted_at);
  ELSE
  INSERT INTO class7_test.comment_likes(comment_id,owner_hash,created_at)
  SELECT comment_id,new_group,min(created_at) FROM class7_test.comment_likes WHERE owner_hash=target_raw GROUP BY comment_id
  ON CONFLICT(comment_id,owner_hash) DO UPDATE SET created_at=LEAST(class7_test.comment_likes.created_at,excluded.created_at);
  END IF;
  DELETE FROM class7_test.comment_likes WHERE owner_hash=target_raw;
 END IF;
 -- Preserve the earliest shared vote when an account leaves the group.
 IF to_regclass('class7_test.photo_like_history') IS NOT NULL THEN
  INSERT INTO class7_test.photo_like_history(photo_id,owner_hash,first_liked_at)
  SELECT photo_id,new_group,min(first_liked_at) FROM class7_test.photo_like_history WHERE owner_hash=target_raw GROUP BY photo_id
  ON CONFLICT(photo_id,owner_hash) DO UPDATE SET first_liked_at=LEAST(class7_test.photo_like_history.first_liked_at,excluded.first_liked_at);
  DELETE FROM class7_test.photo_like_history WHERE owner_hash=target_raw;
 END IF;
 UPDATE class7_test.account_owner_links SET canonical_owner_hash=new_group WHERE canonical_owner_hash=old_group AND owner_hash<>target_raw;
 DELETE FROM class7_test.account_owner_links WHERE owner_hash=target_raw;
 RETURN jsonb_build_object('retainedPhotos',photo_count,'retainedComments',comment_count);
END $$;
REVOKE ALL ON FUNCTION class7_test.unlink_account(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.unlink_account(text,text,text) TO service_role;
