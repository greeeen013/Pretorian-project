# SQLAlchemy model pro tabulku 'reservation'.
#
# Rezervace je jádro business logiky Studenta A – reprezentuje vztah mezi
# konkrétním členem (member) a naplánovanou lekcí (lesson_schedule).
# Stavový automat rezervace:  CREATED -> CONFIRMED -> ATTENDED
#                              CREATED/CONFIRMED -> UNENROLLED  (člen se odhlásil)
#                              CREATED/CONFIRMED -> CANCELLED   (admin/systém zrušil)
#
# Sloupce odpovídají DDL.sql vygenerovanému z Enterprise Architectu.
#
# Poznámka k junction tabulce reservation_payment:
# V DDL nemá tato tabulka primární klíč a oba FK sloupce jsou nullable.
# SQLAlchemy proto nemapujeme jako třídu (ORM třída vyžaduje PK),
# ale jako čistý Table objekt, který se použije jako 'secondary' v relationship.
# Tím zajistíme, že create_all() nevytvoří odlišné schéma oproti DDL.sql.

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base
from .tables import reservation_payment_table  # junction tabulka definována centrálně



class Reservation(Base):
    """ORM mapování tabulky 'reservation' z databáze mma_club_db."""

    __tablename__ = "reservation"

    # --- Primární klíč ---
    # Automaticky generovaný integer – odpovídá sekvenci reservation_reservation_id_seq v DB.
    reservation_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # --- Stav rezervace (stavový automat) ---
    # Povolené hodnoty: CREATED, CONFIRMED, CANCELLED, ATTENDED, UNENROLLED
    # NOT NULL – každá rezervace musí mít stav od okamžiku vzniku.
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="CREATED",
        comment="Aktuální stav rezervace v rámci stavového automatu.",
    )

    # --- Časové razítko vytvoření ---
    # Timezone-aware UTC datetime – dle CLAUDE.md pravidla "timestampy vždy timezone-aware".
    timestamp_creation: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        comment="Čas vzniku rezervace (UTC).",
    )

    # --- Časové razítko poslední změny stavu ---
    # Nullable – při vytvoření je NULL, vyplní se při každé změně stavu.
    timestamp_change: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Čas poslední změny stavu rezervace.",
    )

    # --- Přítomnost na lekci ---
    # TRUE = člen se lekce fyzicky zúčastnil (přechod do stavu ATTENDED).
    attendance: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
        comment="Zda se člen fyzicky zúčastnil lekce.",
    )

    # --- Jméno hosta ---
    # Nepovinné – pro případ, kdy rezervaci vytváří člen pro cizí osobu.
    guest_name: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        comment="Jméno hosta, pokud rezervace není pro samotného člena.",
    )

    # --- Poznámka ---
    note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Volitelná poznámka k rezervaci.",
    )

    # --- Cizí klíče ---
    # FK na tabulku 'member' – každá rezervace patří jednomu členovi.
    member_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("member.member_id", ondelete="NO ACTION"),
        nullable=False,
        comment="ID člena, který rezervaci provedl.",
    )

    # FK na tabulku 'lesson_schedule'
    lesson_schedule_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("lesson_schedule.lesson_schedule_id"),
        nullable=False,
        comment="ID naplánované lekce, na kterou se rezervace vztahuje.",
    )

    # --- Vztah k platbám přes junction tabulku ---
    # secondary=reservation_payment_table – SQLAlchemy použije Table objekt (bez vlastního ORM modelu).
    # Lazy loading – platby se dotáhnou až při přístupu k atributu.
    payments: Mapped[list["Payment"]] = relationship(
        "Payment",
        secondary=reservation_payment_table,
        back_populates="reservations",
    )

    def __repr__(self) -> str:
        return (
            f"<Reservation(id={self.reservation_id}, "
            f"member={self.member_id}, "
            f"lesson={self.lesson_schedule_id}, "
            f"status='{self.status}')>"
        )


# Lazy import – Payment je definován v jiném modulu, importujeme až na konci.
from .payment import Payment  # noqa: E402
