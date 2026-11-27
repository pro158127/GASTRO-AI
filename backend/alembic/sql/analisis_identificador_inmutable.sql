-- RNF-24: el UUID interno y el código visible de un análisis no se pueden cambiar.
CREATE OR REPLACE FUNCTION analisis_identificador_inmutable() RETURNS trigger AS $$
BEGIN
  IF OLD."id" IS DISTINCT FROM NEW."id" OR OLD."codigo" IS DISTINCT FROM NEW."codigo" THEN
    RAISE EXCEPTION 'El identificador de análisis es inmutable (RNF-24)' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "analisis_identificador_fijo"
  BEFORE UPDATE OF "id", "codigo" ON "Analisis"
  FOR EACH ROW EXECUTE FUNCTION analisis_identificador_inmutable();
