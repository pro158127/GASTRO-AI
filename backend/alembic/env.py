from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context
from app.core.config import get_settings
from app.models import Base

# La config de Alembic, la que sale de alembic.ini
config = context.config

# La URL sale del .env, no de alembic.ini; así no hay contraseñas regadas en el repo.
# Las pruebas la pasan por config.attributes["url"] pa migrar su base aparte.
url_pruebas = config.attributes.get("url")
config.set_main_option("sqlalchemy.url", url_pruebas or get_settings().database_url)

# Prende los logs según lo que diga el .ini, SIN apagar los que ya existen: si no, al
# migrar desde la app o las pruebas, el logger «gastroia» queda mudo y nadie se entera
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Con esto el autogenerate sabe qué tablas existen. Si no ves tu tabla en la migración,
# revisa que esté importada en app/models/__init__.py
target_metadata = Base.metadata

# Si algún día necesitas más opciones del .ini, se sacan con config.get_main_option(...)


def run_migrations_offline() -> None:
    """Modo offline: no se conecta a nada, solo escupe el SQL por pantalla.

    Sirve pa revisar qué va a hacer la migración antes de soltarla en la base de verdad.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Modo online: se conecta a PostgreSQL y aplica la migración de una.

    compare_type=True es pa que también detecte cambios de tipo de columna, que si no se
    le pasan de largo.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
