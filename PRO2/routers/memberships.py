from datetime import date as date_type
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth.dependencies import CurrentUser, get_current_member
from db.dependencies import get_db
from models.member import Member
from models.membership import Membership
from models.payment import Payment
from models.tariff import Tariff
from schemas.membership import (
    ArchivedTariffResponse,
    MembershipPurchase,
    MembershipResponse,
    TariffCreate,
    TariffResponse,
)

router = APIRouter(tags=["Permanentky"])


@router.get("/tariffs", response_model=list[TariffResponse])
def get_tariffs(db: Session = Depends(get_db)):
    return db.query(Tariff).filter(Tariff.is_active == True).all()


@router.get("/tariffs/archived", response_model=list[ArchivedTariffResponse])
def get_archived_tariffs(
    current: CurrentUser = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    if current.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pouze administrátor.")
    try:
        rows = db.execute(text("SELECT * FROM v_archived_tariffs ORDER BY tariff_id")).mappings().all()
        return [dict(r) for r in rows]
    except Exception:
        db.rollback()
        return [
            {**{c: getattr(t, c) for c in ["tariff_id", "name", "description", "price", "duration_months", "duration_days"]}, "total_memberships_sold": 0}
            for t in db.query(Tariff).filter(Tariff.is_active == False).all()
        ]


@router.patch("/tariffs/{tariff_id}/restore", response_model=TariffResponse)
def restore_tariff(
    tariff_id: int,
    current: CurrentUser = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    if current.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pouze administrátor.")
    tariff = db.query(Tariff).filter(Tariff.tariff_id == tariff_id).first()
    if not tariff or tariff.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivovaný tarif neexistuje.")
    tariff.is_active = True
    db.commit()
    db.refresh(tariff)
    return tariff


@router.post("/tariffs", response_model=TariffResponse, status_code=status.HTTP_201_CREATED)
def create_tariff(
    data: TariffCreate,
    current: CurrentUser = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    if current.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Pouze administrátor může vytvářet tarify.",
        )
    tariff = Tariff(**data.model_dump())
    db.add(tariff)
    db.commit()
    db.refresh(tariff)
    return tariff


@router.delete("/tariffs/{tariff_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tariff(
    tariff_id: int,
    current: CurrentUser = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    if current.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Pouze administrátor může mazat tarify.",
        )
    tariff = db.query(Tariff).filter(Tariff.tariff_id == tariff_id).first()
    if not tariff or not tariff.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarif neexistuje.")
    tariff.is_active = False
    db.commit()


@router.get("/memberships/me", response_model=list[MembershipResponse])
def get_my_memberships(
    current: CurrentUser = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Membership, Tariff)
        .join(Tariff, Membership.tariff_id == Tariff.tariff_id)
        .filter(Membership.member_id == current.member_id)
        .all()
    )
    return [
        MembershipResponse(
            membership_id=m.membership_id,
            tariff_id=m.tariff_id,
            tariff_name=t.name,
            valid_from=m.valid_from,
            valid_to=m.valid_to,
            member_id=m.member_id,
        )
        for m, t in rows
    ]


@router.post("/memberships", response_model=MembershipResponse, status_code=status.HTTP_201_CREATED)
def purchase_membership(
    data: MembershipPurchase,
    current: CurrentUser = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    tariff = db.query(Tariff).filter(Tariff.tariff_id == data.tariff_id).first()
    if not tariff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarif neexistuje.")

    # Cena přes DB funkci fn_get_tariff_price (umožňuje budoucí slevy).
    # Fallback na tariff.price pro SQLite (testy).
    try:
        cena = int(db.execute(
            text("SELECT fn_get_tariff_price(:tid, 0)"),
            {"tid": data.tariff_id},
        ).scalar())
    except Exception:
        db.rollback()
        cena = int(tariff.price)

    # SELECT FOR UPDATE – prevence race conditions na credit_balance
    member = (
        db.query(Member)
        .with_for_update()
        .filter(Member.member_id == current.member_id)
        .first()
    )

    if member.credit_balance < cena:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Nedostatečný kredit.",
        )

    # Naive UTC – DDL má timestamp without time zone
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    active = (
        db.query(Membership)
        .filter(
            Membership.member_id == current.member_id,
            Membership.tariff_id == data.tariff_id,
            Membership.valid_to > now,
        )
        .first()
    )
    if active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Aktivní permanentka tohoto tarifu již existuje.",
        )

    # Atomická transakce: odečtení kreditů + vytvoření Membership + Payment
    member.credit_balance -= cena

    valid_from = now
    valid_to = now + relativedelta(months=tariff.duration_months, days=tariff.duration_days)

    membership = Membership(
        creation_date=date_type.today(),
        valid_from=valid_from,
        valid_to=valid_to,
        member_id=current.member_id,
        tariff_id=data.tariff_id,
        is_auto_renewal=False,
    )
    db.add(membership)
    db.flush()  # membership_id je potřeba pro Payment.membership_id

    payment = Payment(
        amount=cena,
        payment_type="CREDIT",
        status="COMPLETED",
        member_id=current.member_id,
        membership_id=membership.membership_id,
    )
    db.add(payment)
    db.commit()
    db.refresh(membership)

    return MembershipResponse(
        membership_id=membership.membership_id,
        tariff_id=membership.tariff_id,
        tariff_name=tariff.name,
        valid_from=membership.valid_from,
        valid_to=membership.valid_to,
        member_id=membership.member_id,
    )
