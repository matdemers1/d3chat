import uuid
from datetime import datetime

from sqlalchemy import JSON, String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DeviceKey(Base):
    __tablename__ = "device_keys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    identity_key: Mapped[str] = mapped_column(String(255), nullable=False)
    signed_pre_key: Mapped[str] = mapped_column(String(255), nullable=False)
    signed_pre_key_signature: Mapped[str] = mapped_column(Text, nullable=False)
    one_time_pre_keys: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    device: Mapped["Device"] = relationship("Device", back_populates="key_bundle")
