import uuid
from datetime import date

from sqlalchemy import Date, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AnalyticsDaily(Base):
    __tablename__ = "analytics_daily"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    date: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    total_users: Mapped[int] = mapped_column(Integer, default=0)
    new_users: Mapped[int] = mapped_column(Integer, default=0)
    active_users: Mapped[int] = mapped_column(Integer, default=0)
    total_messages: Mapped[int] = mapped_column(Integer, default=0)
    new_messages: Mapped[int] = mapped_column(Integer, default=0)
    total_channels: Mapped[int] = mapped_column(Integer, default=0)
    new_channels: Mapped[int] = mapped_column(Integer, default=0)
