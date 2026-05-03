from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth.dependencies import CurrentUser, get_current_member
from db.dependencies import get_db
from models.reservation import Reservation
from schemas.reservation import (
    ReservationCreate,
    ReservationResponse,
    ReservationStatusResponse,
    ReservationStatusUpdate,
)

router = APIRouter(prefix="/reservations", tags=["Rezervace"])

# Povolené přechody stavového automatu rezervace.
POVOLENE_PRECHODY: dict[str, list[str]] = {
    "CREATED":    ["CONFIRMED", "CANCELLED", "UNENROLLED"],
    "CONFIRMED":  ["CANCELLED", "ATTENDED", "UNENROLLED"],
    "CANCELLED":  [],
    "ATTENDED":   [],
    "UNENROLLED": [],
}


def _zkontroluj_kapacitu(db: Session, lesson_id: int) -> None:
    """Ověří volnou kapacitu lekce přes DB funkci fn_check_lesson_capacity.
    Fallback na manuální COUNT pro SQLite (testy)."""
    try:
        ma_misto = db.execute(
            text("SELECT fn_check_lesson_capacity(:lid)"),
            {"lid": lesson_id},
        ).scalar()
        if not ma_misto:
            raise HTTPException(status_code=422, detail="Lekce je plná nebo neexistuje")
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        from models.lesson import LessonSchedule
        lekce = db.get(LessonSchedule, lesson_id)
        if not lekce:
            raise HTTPException(status_code=404, detail="Lekce nenalezena")
        obsazeno = (
            db.query(Reservation)
            .filter(
                Reservation.lesson_schedule_id == lesson_id,
                Reservation.status.notin_(["CANCELLED", "UNENROLLED"]),
            )
            .count()
        )
        if obsazeno >= lekce.maximum_capacity:
            raise HTTPException(status_code=422, detail="Lekce je plná")


def _vytvor_rezervaci_db(
    db: Session,
    member_id: int,
    lesson_id: int,
    note: Optional[str],
    guest_name: Optional[str],
) -> Reservation:
    """Vytvoří rezervaci přes DB proceduru pr_secure_booking.
    Trigger fn_validate_reservation zajistí fail-safe kontrolu kapacity.
    Fallback na přímý ORM INSERT pro SQLite (testy)."""
    try:
        db.execute(
            text("CALL pr_secure_booking(:mid, :sid, :note, :guest)"),
            {"mid": member_id, "sid": lesson_id, "note": note, "guest": guest_name},
        )
        return (
            db.query(Reservation)
            .filter(
                Reservation.member_id == member_id,
                Reservation.lesson_schedule_id == lesson_id,
            )
            .order_by(Reservation.reservation_id.desc())
            .first()
        )
    except Exception:
        db.rollback()
        nova = Reservation(
            member_id=member_id,
            lesson_schedule_id=lesson_id,
            status="CONFIRMED",
            note=note,
            guest_name=guest_name,
        )
        db.add(nova)
        db.flush()
        return nova


@router.post("/", response_model=ReservationStatusResponse, status_code=status.HTTP_201_CREATED)
def vytvor_rezervaci(
    data: ReservationCreate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_member),
):
    member_id = data.member_id if current.role == "admin" else current.member_id
    _zkontroluj_kapacitu(db, data.lesson_schedule_id)
    nova_rezervace = _vytvor_rezervaci_db(db, member_id, data.lesson_schedule_id, data.note, data.guest_name)
    db.commit()
    db.refresh(nova_rezervace)
    return {
        "reservation_id": nova_rezervace.reservation_id,
        "status": nova_rezervace.status,
        "member_id": nova_rezervace.member_id,
        "lesson_schedule_id": nova_rezervace.lesson_schedule_id,
        "credit_balance": None,
    }


@router.get("/", response_model=list[ReservationResponse])
def seznam_rezervaci(
    member_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_member),
):
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

    rezervace.status = novy_stav
    rezervace.timestamp_change = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rezervace)

    return {
        "reservation_id": rezervace.reservation_id,
        "status": rezervace.status,
        "member_id": rezervace.member_id,
        "lesson_schedule_id": rezervace.lesson_schedule_id,
        "credit_balance": None,
    }
