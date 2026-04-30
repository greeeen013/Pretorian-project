# Router pro endpointy rezervací.
#
# Klíčová business logika: změna stavu rezervace ovlivňuje kreditový
# zůstatek člena (CONFIRMED odečte, CANCELLED z CONFIRMED vrátí).
# Stavový automat zabraňuje neplatným přechodům (např. ATTENDED → CREATED).

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.dependencies import CurrentUser, get_current_member
from db.dependencies import get_db
from models.lesson import LessonSchedule
from models.member import Member
from models.reservation import Reservation
from schemas.reservation import (
    ReservationCreate,
    ReservationResponse,
    ReservationStatusResponse,
    ReservationStatusUpdate,
)

router = APIRouter(prefix="/reservations", tags=["Rezervace"])



# Povolené přechody stavového automatu rezervace.
# Klíč = aktuální stav, hodnota = seznam povolených cílových stavů.
POVOLENE_PRECHODY: dict[str, list[str]] = {
    "CREATED": ["CONFIRMED", "CANCELLED"],
    "CONFIRMED": ["CANCELLED", "ATTENDED"],
    "CANCELLED": [],
    "ATTENDED": [],
}


@router.post("/", response_model=ReservationStatusResponse, status_code=status.HTTP_201_CREATED)
def vytvor_rezervaci(
    data: ReservationCreate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_member),
):
    """
    Vytvoří novou rezervaci přímo ve stavu CONFIRMED a atomicky odečte kredity.

    SELECT FOR UPDATE na člena zabraňuje race condition při souběžných požadavcích.
    """
    member_id = data.member_id if current.role == "admin" else current.member_id

    # Načtení lekce pro zjištění skutečné ceny
    lesson = db.get(LessonSchedule, data.lesson_schedule_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lekce nenalezena")
    cena_lekce = int(lesson.price) if lesson.price is not None else 0

    clen = db.execute(
        select(Member).where(Member.member_id == member_id).with_for_update()
    ).scalar_one_or_none()
    if not clen:
        raise HTTPException(status_code=404, detail="Člen nenalezen")
    if clen.credit_balance < cena_lekce:
        raise HTTPException(status_code=422, detail="Nedostatek kreditů")

    clen.credit_balance -= cena_lekce

    nova_rezervace = Reservation(
        member_id=member_id,
        lesson_schedule_id=data.lesson_schedule_id,
        note=data.note,
        guest_name=data.guest_name,
        status="CONFIRMED",
    )
    db.add(nova_rezervace)
    db.commit()
    db.refresh(nova_rezervace)

    # Auto-transition to FULL if capacity reached
    if lesson.status == 'OPEN':
        active_count = db.query(Reservation).filter(
            Reservation.lesson_schedule_id == lesson.lesson_schedule_id,
            Reservation.status.in_(["CREATED", "CONFIRMED"])
        ).count()
        if active_count >= lesson.maximum_capacity:
            lesson.status = 'FULL'
            db.commit()

    return {
        "reservation_id": nova_rezervace.reservation_id,
        "status": nova_rezervace.status,
        "member_id": nova_rezervace.member_id,
        "lesson_schedule_id": nova_rezervace.lesson_schedule_id,
        "credit_balance": clen.credit_balance,
    }


@router.get("/", response_model=list[ReservationResponse])
def seznam_rezervaci(
    member_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_member),
):
    """
    Vrátí seznam rezervací. Volitelně filtruje podle member_id.

    Frontend při inicializaci načítá seznam pro přihlášeného člena.
    """
    dotaz = db.query(Reservation)
    if current.role != "admin":
        dotaz = dotaz.filter(Reservation.member_id == current.member_id)
    elif member_id is not None:
        dotaz = dotaz.filter(Reservation.member_id == member_id)
    return dotaz.all()


@router.patch("/{rezervace_id}/status", response_model=ReservationStatusResponse)
def zmen_stav_rezervace(
    rezervace_id: int,
    data: ReservationStatusUpdate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_member),
):
    """
    Změní stav rezervace a provede odpovídající kreditovou operaci.

    - CONFIRMED: odečte CENA_LEKCE kreditů (chyba 422 při nedostatku)
    - CANCELLED (z CONFIRMED): vrátí CENA_LEKCE kreditů zpět
    - CANCELLED (z CREATED): bez kreditové operace
    - ATTENDED: potvrzení fyzické účasti, bez kreditové operace

    Vrací jak aktualizovanou rezervaci, tak nový kreditový zůstatek.
    """
    rezervace = db.get(Reservation, rezervace_id)
    if not rezervace:
        raise HTTPException(status_code=404, detail="Rezervace nenalezena")

    if current.role != "admin" and current.member_id != rezervace.member_id:
        raise HTTPException(status_code=403, detail="Přístup zamítnut")

    novy_stav = data.status.upper()
    povolene = POVOLENE_PRECHODY.get(rezervace.status, [])

    if novy_stav not in povolene:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Přechod ze stavu '{rezervace.status}' do '{novy_stav}' není povolen. "
                f"Povolené přechody: {povolene}"
            ),
        )

    novy_zustatek: Optional[int] = None

    # Načtení ceny lekce z databáze
    lesson = db.get(LessonSchedule, rezervace.lesson_schedule_id)
    cena_lekce = int(lesson.price) if lesson else 0

    # Potvrzení rezervace – odečtení kreditů
    # SELECT FOR UPDATE zabrání race condition při souběžných požadavcích:
    # bez zámku by dva souběžné requesty oba prošly kontrolou a odečetly kredity.
    if novy_stav == "CONFIRMED":
        clen = db.execute(
            select(Member).where(Member.member_id == rezervace.member_id).with_for_update()
        ).scalar_one_or_none()
        if not clen:
            raise HTTPException(status_code=404, detail="Člen nenalezen")
        if clen.credit_balance < cena_lekce:
            raise HTTPException(status_code=422, detail="Nedostatek kreditů")
        clen.credit_balance -= cena_lekce
        novy_zustatek = clen.credit_balance

    # Zrušení potvrzené rezervace – vrácení kreditů
    elif novy_stav == "CANCELLED" and rezervace.status == "CONFIRMED":
        clen = db.execute(
            select(Member).where(Member.member_id == rezervace.member_id).with_for_update()
        ).scalar_one_or_none()
        if clen:
            clen.credit_balance += cena_lekce
            novy_zustatek = clen.credit_balance

    rezervace.status = novy_stav
    rezervace.timestamp_change = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rezervace)

    # If CANCELLED and lesson was FULL, check if we can reopen
    if novy_stav == "CANCELLED":
        lesson = db.get(LessonSchedule, rezervace.lesson_schedule_id)
        if lesson and lesson.status == 'FULL':
            active_count = db.query(Reservation).filter(
                Reservation.lesson_schedule_id == lesson.lesson_schedule_id,
                Reservation.status.in_(["CREATED", "CONFIRMED"])
            ).count()
            if active_count < lesson.maximum_capacity:
                lesson.status = 'OPEN'
                db.commit()

    return {
        "reservation_id": rezervace.reservation_id,
        "status": rezervace.status,
        "member_id": rezervace.member_id,
        "lesson_schedule_id": rezervace.lesson_schedule_id,
        "credit_balance": novy_zustatek,
    }
