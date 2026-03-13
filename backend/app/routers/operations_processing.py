"""Operations / Processing Dashboard endpoints — PO pipeline stage analytics."""

from fastapi import APIRouter, Depends

from app.auth.dependencies import require_permission
from app.auth.models import User
from app.services import operations_processing_service

router = APIRouter(prefix="/api/operations-processing", tags=["Operations Processing"])


@router.get("/overview")
async def operations_processing_overview(
    _user: User = Depends(require_permission("operations_processing.view")),
):
    """Operations Processing dashboard — KPIs, PO stage table, by-category chart."""
    return await operations_processing_service.get_overview()
