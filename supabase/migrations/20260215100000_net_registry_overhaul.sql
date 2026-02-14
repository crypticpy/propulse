-- Net Registry Overhaul: add summary, country, state_or_province columns
-- with indexes and updated search_vector trigger

ALTER TABLE public.nets ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE public.nets ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.nets ADD COLUMN IF NOT EXISTS state_or_province text;

CREATE INDEX IF NOT EXISTS nets_country_idx ON public.nets (country);
CREATE INDEX IF NOT EXISTS nets_country_state_idx ON public.nets (country, state_or_province);

-- Update search_vector trigger to include summary
CREATE OR REPLACE FUNCTION public.nets_update_search_vector()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.name, '') || ' ' || coalesce(NEW.summary, '') || ' ' ||
    coalesce(NEW.description, '') || ' ' || coalesce(array_to_string(NEW.tags, ' '), ''));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS nets_search_vector_trigger ON public.nets;
CREATE TRIGGER nets_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, summary, description, tags
  ON public.nets FOR EACH ROW EXECUTE FUNCTION public.nets_update_search_vector();
