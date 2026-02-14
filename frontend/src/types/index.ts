export interface User {
  id: string;
  username: string;
  email: string | null;
  server_domain: string;
  is_local: boolean;
  created_at: string;
}

export interface Device {
  id: string;
  device_name: string;
  device_key_public: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface Channel {
  id: string;
  name: string | null;
  is_dm: boolean;
  is_federated: boolean;
  encryption_type: string;
  created_by: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string | null;
  sender_device_id: string | null;
  content: string;
  content_type: string;
  protocol_version: number;
  edited_at: string | null;
  created_at: string;
}

export interface MessagePage {
  messages: Message[];
  has_more: boolean;
}

export interface ChannelMember {
  user_id: string;
  username: string;
  server_domain: string;
  is_local: boolean;
  role: string;
  joined_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: string;
  device_id: string;
}

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

export interface KeyBundle {
  device_id: string;
  identity_key: string;
  signed_pre_key: string;
  signed_pre_key_signature: string;
  one_time_pre_key: string | null;
  one_time_pre_key_count: number;
}

export interface SenderKeyData {
  device_id: string;
  sender_key_public: string;
  chain_key: string;
  message_number: number;
}
