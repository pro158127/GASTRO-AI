-- Restricciones que los modelos SQLAlchemy no declaran: CHECK, triggers y secuencias.
-- Se aplica con la migración Alembic «0002_restricciones», después de crear las tablas.

-- Umbrales dentro del rango permitido (RF-A01: 10 % a 90 %)
ALTER TABLE "ConfiguracionInferencia"
  ADD CONSTRAINT "config_fila_unica"   CHECK ("id" = 1),
  ADD CONSTRAINT "config_umbral_rango" CHECK ("umbral_global" BETWEEN 0.10 AND 0.90);
ALTER TABLE "Caracteristica"
  ADD CONSTRAINT "caract_umbral_rango" CHECK ("umbral" IS NULL OR "umbral" BETWEEN 0.10 AND 0.90);

-- Probabilidades y coordenadas normalizadas
ALTER TABLE "ResultadoCaracteristica"
  ADD CONSTRAINT "resultado_probabilidad_rango" CHECK ("probabilidad" BETWEEN 0 AND 1);
ALTER TABLE "RegionInteres"
  ADD CONSTRAINT "region_caja_rango" CHECK ("caja_x" BETWEEN 0 AND 1 AND "caja_y" BETWEEN 0 AND 1
     AND "caja_ancho" BETWEEN 0 AND 1 AND "caja_alto" BETWEEN 0 AND 1 AND "area_porcentaje" BETWEEN 0 AND 100);

-- Solo una cuenta ELIMINADA puede quedar sin correo ni contraseña
ALTER TABLE "Usuario"
  ADD CONSTRAINT "usuario_credenciales" CHECK ("estado" = 'ELIMINADO' OR ("correo" IS NOT NULL AND "hash_contrasena" IS NOT NULL));

-- Un traslado siempre va a otro doctor
ALTER TABLE "Traslado" ADD CONSTRAINT "traslado_distinto" CHECK ("origen_id" <> "destino_id");

-- Solo un modelo vigente (RNF-29). Se usa un trigger y no un índice parcial
-- para que la autogeneración de Alembic no intente borrarlo en migraciones futuras.
CREATE OR REPLACE FUNCTION modelo_un_vigente() RETURNS trigger AS $$
BEGIN
  IF NEW.es_vigente AND EXISTS (SELECT 1 FROM "ModeloDesplegado" WHERE es_vigente AND id <> NEW.id) THEN
    RAISE EXCEPTION 'Solo puede haber un modelo vigente (RNF-29)' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "modelo_un_vigente" BEFORE INSERT OR UPDATE OF es_vigente ON "ModeloDesplegado"
  FOR EACH ROW EXECUTE FUNCTION modelo_un_vigente();

-- Bitácora inmutable (RNF-05): nadie puede modificar ni borrar entradas
CREATE OR REPLACE FUNCTION bitacora_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora es inmutable (RNF-05)' USING ERRCODE = '42501';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "bitacora_sin_cambios" BEFORE UPDATE OR DELETE ON "Bitacora"
  FOR EACH ROW EXECUTE FUNCTION bitacora_inmutable();
CREATE TRIGGER "bitacora_sin_truncate" BEFORE TRUNCATE ON "Bitacora"
  FOR EACH STATEMENT EXECUTE FUNCTION bitacora_inmutable();
-- Además, el usuario de la aplicación solo debe tener INSERT y SELECT sobre "Bitacora":
-- REVOKE UPDATE, DELETE, TRUNCATE ON "Bitacora" FROM gastroai_app;
-- Seudónimo inmutable (RF-D01 CA 13, RNF-25): un caso no cambia de seudónimo
-- y un análisis no cambia de caso. Un traslado solo cambia doctor_asignado_id.
CREATE OR REPLACE FUNCTION seudonimo_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El seudónimo de un análisis guardado no se modifica (RF-D01 CA 13)' USING ERRCODE = '42501';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "caso_seudonimo_fijo" BEFORE UPDATE OF "seudonimo", "version_clave" ON "CasoPaciente"
  FOR EACH ROW WHEN (OLD."seudonimo" IS DISTINCT FROM NEW."seudonimo" OR OLD."version_clave" IS DISTINCT FROM NEW."version_clave")
  EXECUTE FUNCTION seudonimo_inmutable();
CREATE TRIGGER "analisis_caso_fijo" BEFORE UPDATE OF "caso_id" ON "Analisis"
  FOR EACH ROW WHEN (OLD."caso_id" IS DISTINCT FROM NEW."caso_id")
  EXECUTE FUNCTION seudonimo_inmutable();

CREATE SEQUENCE analisis_codigo_seq;  -- RNF-24: códigos A-2026-000147
