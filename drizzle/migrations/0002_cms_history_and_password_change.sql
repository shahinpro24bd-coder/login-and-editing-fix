CREATE TABLE public.cms_content_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action text NOT NULL,
  page text NOT NULL,
  cms_id text NOT NULL,
  old_item jsonb,
  new_item jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cms_content_history TO service_role;
ALTER TABLE public.cms_content_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX cms_content_history_page_idx ON public.cms_content_history (page, cms_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.cms_log_content_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO cms_content_history (action, page, cms_id, old_item, new_item)
    VALUES ('delete', OLD.page, OLD.cms_id, OLD.item, NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.item IS DISTINCT FROM NEW.item THEN
      INSERT INTO cms_content_history (action, page, cms_id, old_item, new_item)
      VALUES ('update', NEW.page, NEW.cms_id, OLD.item, NEW.item);
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO cms_content_history (action, page, cms_id, old_item, new_item)
    VALUES ('insert', NEW.page, NEW.cms_id, NULL, NEW.item);
    RETURN NEW;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.cms_log_content_change() FROM PUBLIC;

CREATE TRIGGER cms_content_history_log
AFTER INSERT OR UPDATE OR DELETE ON public.cms_content
FOR EACH ROW EXECUTE FUNCTION public.cms_log_content_change();

-- keep a baseline copy of everything saved so far
INSERT INTO public.cms_content_history (action, page, cms_id, old_item, new_item, changed_at)
SELECT 'baseline', page, cms_id, NULL, item, updated_at FROM public.cms_content;

CREATE OR REPLACE FUNCTION public.cms_change_password(p_token uuid, p_old text, p_new text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_user text; v_hash text;
BEGIN
  SELECT username INTO v_user FROM cms_sessions WHERE token = p_token AND expires_at > now();
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_new IS NULL OR length(p_new) < 8 OR length(p_new) > 200 THEN RAISE EXCEPTION 'weak password'; END IF;
  SELECT password_hash INTO v_hash FROM cms_admins WHERE username = v_user;
  IF v_hash IS NULL OR extensions.crypt(coalesce(p_old, ''), v_hash) <> v_hash THEN
    RETURN false;
  END IF;
  UPDATE cms_admins SET password_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)) WHERE username = v_user;
  DELETE FROM cms_sessions WHERE username = v_user AND token <> p_token;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.cms_change_password(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cms_change_password(uuid, text, text) TO anon, authenticated;