ALTER TABLE public.cms_login_attempts ADD COLUMN IF NOT EXISTS visitor text NOT NULL DEFAULT 'unknown';
CREATE INDEX IF NOT EXISTS cms_login_attempts_visitor_idx ON public.cms_login_attempts (visitor, created_at);

CREATE OR REPLACE FUNCTION public.cms_login(p_username text, p_password text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_hash text; v_token uuid; v_headers json; v_visitor text;
BEGIN
  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN v_headers := NULL;
  END;
  v_visitor := coalesce(
    nullif(v_headers->>'cf-connecting-ip', ''),
    nullif(v_headers->>'x-real-ip', ''),
    nullif(trim(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown');

  DELETE FROM cms_login_attempts WHERE created_at < now() - interval '15 minutes';
  IF (SELECT count(*) FROM cms_login_attempts WHERE visitor = v_visitor) >= 20
     OR (SELECT count(*) FROM cms_login_attempts) >= 500 THEN
    RAISE EXCEPTION 'too many attempts';
  END IF;
  SELECT password_hash INTO v_hash FROM cms_admins WHERE username = lower(trim(p_username));
  IF v_hash IS NULL OR extensions.crypt(p_password, v_hash) <> v_hash THEN
    INSERT INTO cms_login_attempts (visitor) VALUES (v_visitor);
    RETURN NULL;
  END IF;
  DELETE FROM cms_login_attempts WHERE visitor = v_visitor;
  DELETE FROM cms_sessions WHERE expires_at < now();
  INSERT INTO cms_sessions (username) VALUES (lower(trim(p_username))) RETURNING token INTO v_token;
  RETURN v_token;
END $$;

REVOKE ALL ON FUNCTION public.cms_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cms_login(text, text) TO anon, authenticated;