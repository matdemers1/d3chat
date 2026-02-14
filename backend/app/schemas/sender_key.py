import uuid

from pydantic import BaseModel


class SenderKeyDistribute(BaseModel):
    device_id: uuid.UUID
    sender_key_public: str
    chain_key: str


class SenderKeyResponse(BaseModel):
    device_id: uuid.UUID
    sender_key_public: str
    chain_key: str
    message_number: int

    model_config = {"from_attributes": True}
