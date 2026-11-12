# Una sola imagen pa los dos: api (uvicorn) y worker (celery). Cambia solo el comando.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencias primero: si solo cambias código, Docker reusa esta capa y no reinstala todo
COPY requirements.txt .
RUN pip install -r requirements.txt

# Nada de correr como root, que no estamos en 2005
RUN useradd --create-home --uid 1000 gastroia
COPY --chown=gastroia:gastroia . .
USER gastroia

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
