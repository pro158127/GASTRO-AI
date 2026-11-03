from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.analisis import AnalisisOut
from app.services.analisis_service import AnalisisService

router = APIRouter()


@router.post("/analisis", status_code=202, response_model=AnalisisOut)
def crear_analisis(
    file: UploadFile = File(...),
    documento: str = Form(...),
    tipo_documento: str = Form("CC"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    service = AnalisisService(db)
    return service.crear_analisis(file, documento, tipo_documento)


@router.get("/analisis/{analisis_id}", response_model=AnalisisOut)
def obtener_analisis(
    analisis_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    service = AnalisisService(db)
    analisis = service.obtener_analisis(analisis_id)
    if analisis is None:
        raise HTTPException(status_code=404, detail="Análisis no encontrado")
    return analisis
