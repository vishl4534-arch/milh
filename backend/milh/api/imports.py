from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from milh.auth import Principal, owned_farm, require_role
from milh.db import get_session
from milh.ingestion.csv_import import Kind, import_csv, template

router = APIRouter(prefix="/api/v1", tags=["imports"])
MAX_BYTES = 2 * 1024 * 1024


class RowErrorOut(BaseModel):
    row: int
    column: str
    message: str


class ImportOut(BaseModel):
    rows_ok: int
    errors: list[RowErrorOut]
    committed: bool
    created: int
    duplicates: int


@router.post("/farms/{farm_id}/imports", response_model=ImportOut)
async def post_import(
    farm_id: uuid.UUID,
    file: UploadFile,
    p: Annotated[Principal, Depends(require_role("owner", "admin"))],
    session: Annotated[Session, Depends(get_session)],
    kind: Kind = "readings",
    dry_run: bool = True,
    published: bool = False,
) -> ImportOut | JSONResponse:
    owned_farm(session, p, farm_id)
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "CSV larger than 2 MB; split it")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise HTTPException(422, "CSV must be UTF-8") from e
    preview = import_csv(session, farm_id, kind, text, p.user.id, published=published, dry_run=dry_run)
    out = ImportOut(rows_ok=preview.rows_ok, errors=[RowErrorOut(**e.__dict__) for e in preview.errors],
                    committed=preview.committed, created=preview.created, duplicates=preview.duplicates)
    if not dry_run and preview.errors:
        session.rollback()
        return JSONResponse(status_code=422, content=out.model_dump())
    session.commit()
    return out


@router.get("/imports/templates/{kind}.csv", response_class=PlainTextResponse)
def get_template(kind: Kind) -> PlainTextResponse:
    return PlainTextResponse(template(kind), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{kind}_template.csv"'})
