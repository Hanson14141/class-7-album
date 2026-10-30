-- Shared shop/draw base weights: common95.95 / epic3 / legendary1 / classified0.05. Does not touch pity, inventory or compensation.
CREATE OR REPLACE FUNCTION class7_test.draw_photo_pool(c text[],e text[],l text[],s text[],n integer DEFAULT 5) RETURNS text[]
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,class7_test AS $$
DECLARE result text[]:='{}'; item text; wc integer; we integer; wl integer; ws integer; roll double precision; idx integer;
BEGIN
 c:=COALESCE(c,'{}'); e:=COALESCE(e,'{}'); l:=COALESCE(l,'{}'); s:=COALESCE(s,'{}');
 FOR slot IN 1..LEAST(5,GREATEST(0,n)) LOOP
  wc:=CASE WHEN cardinality(c)>0 THEN 1919 ELSE 0 END;
  we:=CASE WHEN cardinality(e)>0 THEN 60 ELSE 0 END;
  wl:=CASE WHEN cardinality(l)>0 THEN 20 ELSE 0 END;
  ws:=CASE WHEN cardinality(s)>0 THEN 1 ELSE 0 END;
  IF wc+we+wl+ws=0 THEN EXIT; END IF;
  roll:=random()*(wc+we+wl+ws);
  IF roll<wc THEN idx:=1+floor(random()*cardinality(c))::integer;item:=c[idx];c:=array_remove(c,item);
  ELSIF roll<wc+we THEN idx:=1+floor(random()*cardinality(e))::integer;item:=e[idx];e:=array_remove(e,item);
  ELSIF roll<wc+we+wl THEN idx:=1+floor(random()*cardinality(l))::integer;item:=l[idx];l:=array_remove(l,item);
  ELSE idx:=1+floor(random()*cardinality(s))::integer;item:=s[idx];s:=array_remove(s,item); END IF;
  result:=array_append(result,item);
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION class7_test.draw_photo_pool(text[],text[],text[],text[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.draw_photo_pool(text[],text[],text[],text[],integer) TO service_role;
