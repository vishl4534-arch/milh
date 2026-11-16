"""Lab-report reader: upload a photo/PDF, Gemini proposes the values, the owner confirms them.

Nothing is stored as data here. Confirmed values are saved through POST /soil-tests?via=lab_report.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from milh.ai import gemini as gemini_mod
from milh.ai.gemini import LabReportExtract
from milh.auth import Principal, owned_farm, require_role
from milh.config import get_settings
from milh.db import get_session

router = APIRouter(prefix="/api/v1", tags=["lab"])
ALLOWED = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf"}
MAX_BYTES = 10 * 1024 * 1024


class LabPreview(BaseModel):
    attachment_path: str
    extract: LabReportExtract


@router.post("/farms/{farm_id}/lab-report", response_model=LabPreview)
async def read_lab_report(
    farm_id: uuid.UUID,
    file: UploadFile,
    p: Annotated[Principal, Depends(require_role("owner", "admin"))],
    session: Annotated[Session, Depends(get_session)],
) -> LabPreview:
    owned_farm(session, p, farm_id)
    ext = ALLOWED.get(file.content_type or "")
    if ext is None:
        raise HTTPException(415, "Upload a PNG, JPEG, WebP photo or a PDF")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File larger than 10 MB")
    gem = gemini_mod.get_gemini()
    if gem is None:
        raise HTTPException(503, "Lab-report reading needs GEMINI_API_KEY on the server")
    rel = f"uploads/{uuid.uuid4().hex}.{ext}"
    path = get_settings().media_dir / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    extract = gem.extract_lab_report(data, file.content_type or "")
    if extract is None:
        raise HTTPException(502, "Could not read values from this report; enter them by hand")
    return LabPreview(attachment_path=rel, extract=extract)
