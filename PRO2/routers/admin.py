from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth.dependencies import require_admin
from db.dependencies import get_db

router = APIRouter(prefix="/admin", tags=["Administrace"])


@router.post("/billing/close", summary="Uzavřít měsíční vyúčtování")
def uzavrit_vyuctovani(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    """Označí PENDING platby s expirovanou permanentkou jako FAILED.
    Volá DB proceduru pr_close_monthly_billing()."""
    db.execute(text("CALL pr_close_monthly_billing()"))
    db.commit()
    return {"message": "Měsíční vyúčtování úspěšně uzavřeno"}


@router.post("/members/archive", summary="Archivovat neaktivní členy")
def archivovat_cleny(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    """Nastaví is_active = false členům bez platné permanentky.
    Volá DB proceduru pr_archive_inactive_members()."""
    db.execute(text("CALL pr_archive_inactive_members()"))
    db.commit()
    return {"message": "Neaktivní členové úspěšně archivováni"}
