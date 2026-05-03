# Router pro endpointy členů.
#
# Zatím implementuji pouze dotaz na kreditový zůstatek (GET /members/{id}/balance),
# který frontend potřebuje pro zobrazení aktuálního stavu konta.
# Kompletní CRUD pro členy přijde v dalších iteracích.

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth.dependencies import CurrentUser, get_current_member
from db.dependencies import get_db
from models.member import Member

router = APIRouter(prefix="/members", tags=["Členové"])


@router.get("/{member_id}", tags=["Členové"])
def detail_clena(
    member_id: int,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_member),
):
    """Vrátí detaily člena jako JSON (fn_get_member_details_json). Admin nebo vlastní profil."""
    if current.role != "admin" and current.member_id != member_id:
        raise HTTPException(status_code=403, detail="Přístup zamítnut")

    detail = db.execute(
        text("SELECT fn_get_member_details_json(:mid)"),
        {"mid": member_id},
    ).scalar()

    if not detail:
        raise HTTPException(status_code=404, detail="Člen nenalezen")

    return detail


@router.get("/{member_id}/balance")
def zustatok_kreditů(
    member_id: int,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_member),
):
    """
    Vrátí aktuální kreditový zůstatek člena.

    Přihlášený člen vidí jen svůj vlastní zůstatek; admin vidí libovolného člena.
    """
    if current.role != "admin" and current.member_id != member_id:
        raise HTTPException(status_code=403, detail="Přístup zamítnut")

    clen = db.get(Member, member_id)
    if not clen:
        raise HTTPException(status_code=404, detail="Člen nenalezen")

    return {
        "member_id": clen.member_id,
        "jmeno": f"{clen.name} {clen.surname}",
        "credit_balance": clen.credit_balance,
    }
