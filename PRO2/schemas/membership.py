from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class TariffCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: Decimal
    duration_months: int = 1
    duration_days: int = 0


class TariffResponse(BaseModel):
    tariff_id: int
    name: str
    description: Optional[str] = None
    price: Decimal
    duration_months: int
    duration_days: int

    model_config = ConfigDict(from_attributes=True)


class ArchivedTariffResponse(TariffResponse):
    total_memberships_sold: int = 0


class MembershipPurchase(BaseModel):
    tariff_id: int


class MembershipResponse(BaseModel):
    membership_id: int
    tariff_id: int
    tariff_name: Optional[str] = None
    valid_from: datetime
    valid_to: datetime
    member_id: int

    model_config = ConfigDict(from_attributes=True)
