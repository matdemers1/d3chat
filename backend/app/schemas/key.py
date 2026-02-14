import uuid
from pydantic import BaseModel


class KeyBundleUpload(BaseModel):
    device_id: uuid.UUID
    identity_key: str
    signed_pre_key: str
    signed_pre_key_signature: str
    one_time_pre_keys: list[str] = []


class KeyBundleResponse(BaseModel):
    device_id: uuid.UUID
    identity_key: str
    signed_pre_key: str
    signed_pre_key_signature: str
    one_time_pre_key: str | None = None
    one_time_pre_key_count: int = 0

    model_config = {"from_attributes": True}


class OneTimeKeyUpload(BaseModel):
    device_id: uuid.UUID
    one_time_pre_keys: list[str]
