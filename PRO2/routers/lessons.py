# Router pro endpointy lekcí.
from datetime import datetime, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth.dependencies import CurrentUser, get_current_member
from db.dependencies import get_db
from models.lesson import LessonSchedule, Employee, LessonTemplate, LessonType
from models.member import Member
from models.reservation import Reservation
from models.tariff import Tariff
from schemas.lesson import (
    LessonCreate,
    LessonResponse,
    LessonDetailResponse,
    LessonStatusUpdate,
    LessonStatusResponse,
    AttendanceUpdate,
    AttendanceResponse,
    LessonAttendeeResponse,
    TeamAttendanceUpdate,
    TeamAttendanceResponse,
    TrainerResponse,
    LessonTemplateResponse,
    LessonTemplateCreate,
    LessonTypeResponse,
)

router = APIRouter(prefix="/lessons", tags=["Lekce"])


def auto_complete_past_lessons(db: Session) -> None:
    """Označí jako COMPLETED všechny lekce, jejichž konec již proběhl."""
    now = datetime.now()
    past = (
        db.query(LessonSchedule)
        .filter(
            LessonSchedule.status.notin_(["COMPLETED", "CANCELLED"]),
        )
        .all()
    )
    changed = False
    for lesson in past:
        end = lesson.end_time or (lesson.start_time + timedelta(minutes=lesson.duration))
        if end < now:
            lesson.status = "COMPLETED"
            changed = True
    if changed:
        db.commit()




@router.get("/trainers/", response_model=List[TrainerResponse])
def get_trainers(db: Session = Depends(get_db)):
    """Načte seznam všech zaměstnanců (trenérů) s jejich jménem a příjmením."""
    results = (
        db.query(Employee, Member)
        .join(Member, Employee.employee_id == Member.member_id)
        .all()
    )
    return [
        TrainerResponse(employee_id=emp.employee_id, name=mem.name, surname=mem.surname)
        for emp, mem in results
    ]


@router.get("/templates/", response_model=List[LessonTemplateResponse])
def get_lesson_templates(db: Session = Depends(get_db)):
    """Načte seznam všech šablon lekcí."""
    templates = db.query(LessonTemplate).all()
    return [
        LessonTemplateResponse(
            lesson_template_id=t.lesson_template_id,
            name=t.name,
            description=t.description,
            duration=t.duration,
            maximum_capacity=t.maximum_capacity,
            price=float(t.price),
            lesson_type_id=t.lesson_type_id,
            allowed_tariff_ids=[tar.tariff_id for tar in t.allowed_tariffs],
        )
        for t in templates
    ]

@router.post("/templates/", response_model=LessonTemplateResponse, status_code=status.HTTP_201_CREATED)
def create_lesson_template(data: LessonTemplateCreate, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_member)):
    """Vytvoří novou šablonu lekce (preset). Dostupné pro trenéra a admina."""
    if current.role not in ('trainer', 'admin'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pouze trenér nebo admin může vytvořit šablonu.")
    template = LessonTemplate(
        name=data.name,
        description=data.description,
        duration=data.duration,
        maximum_capacity=data.maximum_capacity,
        price=data.price,
        lesson_type_id=data.lesson_type_id,
    )
    db.add(template)
    db.flush()
    if data.allowed_tariff_ids:
        tariffs = db.query(Tariff).filter(Tariff.tariff_id.in_(data.allowed_tariff_ids)).all()
        template.allowed_tariffs = tariffs
    db.commit()
    db.refresh(template)
    return LessonTemplateResponse(
        lesson_template_id=template.lesson_template_id,
        name=template.name,
        description=template.description,
        duration=template.duration,
        maximum_capacity=template.maximum_capacity,
        price=float(template.price),
        lesson_type_id=template.lesson_type_id,
        allowed_tariff_ids=[tar.tariff_id for tar in template.allowed_tariffs],
    )


@router.get("/types/", response_model=List[LessonTypeResponse])
def get_lesson_types(db: Session = Depends(get_db)):
    """Načte seznam všech typů lekcí."""
    return db.query(LessonType).all()


@router.get("/", response_model=List[LessonResponse])
def get_lessons(db: Session = Depends(get_db)):
    """Načte seznam všech rozvrhnutých lekcí včetně počtu aktivních rezervací."""
    from sqlalchemy import func
    auto_complete_past_lessons(db)
    lessons = db.query(LessonSchedule).all()
    result = []
    for lesson in lessons:
        count = db.query(func.count(Reservation.reservation_id)).filter(
            Reservation.lesson_schedule_id == lesson.lesson_schedule_id,
            Reservation.status.in_(["CREATED", "CONFIRMED"])
        ).scalar() or 0
        lesson_dict = {
            "lesson_schedule_id": lesson.lesson_schedule_id,
            "name": lesson.name,
            "description": lesson.description,
            "duration": lesson.duration,
            "start_time": lesson.start_time,
            "end_time": lesson.end_time,
            "maximum_capacity": lesson.maximum_capacity,
            "status": lesson.status,
            "price": lesson.price,
            "is_private": lesson.is_private,
            "employee_id": lesson.employee_id,
            "lesson_template_id": lesson.lesson_template_id,
            "lesson_type_id": lesson.lesson_type_id,
            "registered_count": count,
            "allowed_tariff_ids": [t.tariff_id for t in lesson.allowed_tariffs],
        }
        result.append(LessonResponse(**lesson_dict))
    return result

@router.get("/{lesson_id}/attendees", response_model=List[LessonAttendeeResponse])
def get_lesson_attendees(lesson_id: int, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_member)):
    """
    Vrátí seznam registrovaných členů na konkrétní lekci.
    """
    if current.role not in ('trainer', 'admin'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pouze trenér nebo admin může zobrazit účastníky lekce.")

    lesson = db.get(LessonSchedule, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lekce nenalezena")

    if current.role == 'trainer' and lesson.employee_id != current.member_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Trenér může zobrazit účastníky pouze vlastní lekce.")

    rows = (
        db.query(Reservation, Member)
        .join(Member, Reservation.member_id == Member.member_id)
        .filter(
            Reservation.lesson_schedule_id == lesson_id,
            Reservation.status != "CANCELLED",
        )
        .all()
    )

    return [
        LessonAttendeeResponse(
            reservation_id=r.reservation_id,
            member_id=r.member_id,
            member_name=m.name,
            member_surname=m.surname,
            status=r.status,
            attendance=r.attendance,
            guest_name=r.guest_name,
            note=r.note,
        )
        for r, m in rows
    ]

@router.get("/{lesson_id}", response_model=LessonDetailResponse)
def get_lesson_detail(lesson_id: int, db: Session = Depends(get_db)):
    """
    Vrátí detail jedné konkrétní lekce včetně počtu registrovaných.
    POZOR: Tato route musí být definovaná AŽ PO všech cestách s dalšími segmenty
    (např. /{lesson_id}/attendees), jinak by FastAPI zachytil /attendees jako lesson_id.
    """
    auto_complete_past_lessons(db)
    lesson = db.get(LessonSchedule, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lekce nenalezena")

    registered_count = db.query(Reservation).filter(
        Reservation.lesson_schedule_id == lesson_id,
        Reservation.status.in_(["CREATED", "CONFIRMED"])
    ).count()

    trainer = db.query(Member).filter(Member.member_id == lesson.employee_id).first()
    trainer_name = f"{trainer.name} {trainer.surname}" if trainer else None

    return LessonDetailResponse(
        lesson_schedule_id=lesson.lesson_schedule_id,
        name=lesson.name,
        description=lesson.description,
        duration=lesson.duration,
        start_time=lesson.start_time,
        end_time=lesson.end_time,
        maximum_capacity=lesson.maximum_capacity,
        status=lesson.status,
        price=lesson.price,
        is_private=lesson.is_private,
        employee_id=lesson.employee_id,
        lesson_template_id=lesson.lesson_template_id,
        lesson_type_id=lesson.lesson_type_id,
        registered_count=registered_count,
        trainer_name=trainer_name,
        allowed_tariff_ids=[t.tariff_id for t in lesson.allowed_tariffs],
    )


@router.delete("/{lesson_id}/enrollments/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def kick_member(
    lesson_id: int,
    reservation_id: int,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_member),
):
    """Vyhodí člena z lekce (zruší jeho rezervaci). Trenér může vyhodit jen z vlastní lekce."""
    if current.role not in ('trainer', 'admin'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pouze trenér nebo admin může vyhodit člena.")

    lesson = db.get(LessonSchedule, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lekce nenalezena")

    if current.role == 'trainer' and lesson.employee_id != current.member_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Trenér může vyhodit člena pouze z vlastní lekce.")

    reservation = db.get(Reservation, reservation_id)
    if not reservation or reservation.lesson_schedule_id != lesson_id:
        raise HTTPException(status_code=404, detail="Rezervace nenalezena")

    if reservation.status == 'CANCELLED':
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rezervace je již zrušena.")

    if reservation.status == 'CONFIRMED':
        member = db.query(Member).filter(Member.member_id == reservation.member_id).first()
        if member:
            member.credit_balance += int(lesson.price)

    reservation.status = 'CANCELLED'

    if lesson.status == 'FULL':
        active_count = db.query(Reservation).filter(
            Reservation.lesson_schedule_id == lesson_id,
            Reservation.status.in_(["CREATED", "CONFIRMED"])
        ).count()
        if active_count < lesson.maximum_capacity:
            lesson.status = 'OPEN'

    db.commit()


@router.post("/", response_model=LessonResponse, status_code=status.HTTP_201_CREATED)
def create_lesson(data: LessonCreate, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_member)):
    """Vytvoří novou lekci."""
    if current.role not in ('trainer', 'admin'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pouze trenér nebo admin může vytvořit lekci.")
    lesson_data = data.model_dump(exclude={'allowed_tariff_ids'})
    lesson = LessonSchedule(**lesson_data)
    db.add(lesson)
    db.flush()
    if data.allowed_tariff_ids:
        tariffs = db.query(Tariff).filter(Tariff.tariff_id.in_(data.allowed_tariff_ids)).all()
        lesson.allowed_tariffs = tariffs
    db.commit()
    db.refresh(lesson)
    return LessonResponse(
        lesson_schedule_id=lesson.lesson_schedule_id,
        name=lesson.name,
        description=lesson.description,
        duration=lesson.duration,
        start_time=lesson.start_time,
        end_time=lesson.end_time,
        maximum_capacity=lesson.maximum_capacity,
        status=lesson.status,
        price=lesson.price,
        is_private=lesson.is_private,
        employee_id=lesson.employee_id,
        lesson_template_id=lesson.lesson_template_id,
        lesson_type_id=lesson.lesson_type_id,
        registered_count=0,
        allowed_tariff_ids=[t.tariff_id for t in lesson.allowed_tariffs],
    )

@router.patch("/{lesson_id}/status", response_model=LessonStatusResponse)
def update_lesson_status(lesson_id: int, data: LessonStatusUpdate, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_member)):
    """Změní stav lekce. Při stornování (CANCELLED) zruší všechny aktivní rezervace
    a vrátí kredity za potvrzené rezervace. Uzavření (COMPLETED) rezervace ponechá."""
    lesson = db.get(LessonSchedule, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lekce nenalezena")

    new_status = data.status.upper()
    if new_status in ('OPEN', 'CANCELLED', 'COMPLETED'):
        if current.role == 'trainer' and lesson.employee_id != current.member_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Trenér může měnit stav pouze vlastní lekce.")
        elif current.role not in ('trainer', 'admin'):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pouze trenér nebo admin může měnit stav lekce.")

    lesson.status = new_status

    if new_status == "CANCELLED":
        active = db.query(Reservation).filter(
            Reservation.lesson_schedule_id == lesson_id,
            Reservation.status.in_(["CREATED", "CONFIRMED"])
        ).all()
        for res in active:
            if res.status == "CONFIRMED":
                member = db.query(Member).filter(Member.member_id == res.member_id).first()
                if member:
                    member.credit_balance += int(lesson.price)
            res.status = "CANCELLED"

    db.commit()
    db.refresh(lesson)
    return {"lesson_schedule_id": lesson.lesson_schedule_id, "status": lesson.status}

@router.post("/{lesson_id}/attendance", response_model=AttendanceResponse)
def set_attendance(lesson_id: int, data: AttendanceUpdate, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_member)):
    """Zapíše nebo upraví docházku člena na konkrétní lekci."""
    if current.role not in ('trainer', 'admin'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pouze trenér nebo admin může zapsat docházku.")

    lesson = db.get(LessonSchedule, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lekce nenalezena")

    if current.role == 'trainer' and lesson.employee_id != current.member_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Trenér může zapsat docházku pouze na vlastní lekci.")

    if lesson.status != 'COMPLETED':
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Docházku lze zapsat pouze na uzavřenou lekci.")

    
    # Najít validní rezervaci
    reservation = db.query(Reservation).filter(
        Reservation.lesson_schedule_id == lesson_id,
        Reservation.member_id == data.member_id
    ).first()
    
    if not reservation:
        raise HTTPException(status_code=404, detail="Rezervace nenalezena")
        
    reservation.attendance = data.attended
    db.commit()
    db.refresh(reservation)
    
    return {
        "reservation_id": reservation.reservation_id,
        "lesson_schedule_id": reservation.lesson_schedule_id,
        "member_id": reservation.member_id,
        "attendance": reservation.attendance
    }

@router.post("/{lesson_id}/team-attendance", response_model=TeamAttendanceResponse)
def set_team_attendance(lesson_id: int, data: TeamAttendanceUpdate, db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_member)):
    """Hromadný zápis docházky pro celý tým najednou."""
    if current.role not in ('trainer', 'admin'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pouze trenér nebo admin může zapsat docházku.")

    lesson = db.get(LessonSchedule, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lekce nenalezena")

    if current.role == 'trainer' and lesson.employee_id != current.member_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Trenér může zapsat docházku pouze na vlastní lekci.")

    if lesson.status != 'COMPLETED':
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Docházku lze zapsat pouze na uzavřenou lekci.")

    updated_count = 0
    for record in data.members:
        reservation = db.query(Reservation).filter(
            Reservation.lesson_schedule_id == lesson_id,
            Reservation.member_id == record.member_id
        ).first()

        if reservation:
            reservation.attendance = record.attended
            updated_count += 1

    db.commit()

    return {
        "lesson_schedule_id": lesson_id,
        "updated_count": updated_count,
        "message": f"Docházka úspěšně uložena pro {updated_count} členů."
    }
