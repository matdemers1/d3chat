export interface UserPreferences {
  desktop_notifications?: boolean;
  notification_sound?: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string | null;
  server_domain: string;
  is_local: boolean;
  role: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  status_message: string | null;
  email_visible: boolean;
  preferences: UserPreferences;
  created_at: string;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string | null;
  server_domain: string;
  is_local: boolean;
  role: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  status_message: string | null;
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
  display_name: string | null;
  avatar_url: string | null;
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

// Admin types
export interface DashboardStats {
  total_users: number;
  active_users_today: number;
  total_messages: number;
  total_channels: number;
}

export interface AnalyticsDayPoint {
  date: string;
  new_users: number;
  active_users: number;
  new_messages: number;
  new_channels: number;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  server_domain: string;
  is_local: boolean;
  role: string;
  is_banned: boolean;
  is_suspended: boolean;
  suspended_until: string | null;
  ban_reason: string | null;
  created_at: string;
}

export interface AdminUserDetail extends AdminUser {
  device_count: number;
  session_count: number;
  channel_count: number;
  message_count: number;
}

export interface AdminChannel {
  id: string;
  name: string | null;
  is_dm: boolean;
  is_federated: boolean;
  encryption_type: string;
  created_by: string | null;
  created_at: string;
  member_count: number;
  message_count: number;
}

export interface AuditLogEntry {
  id: string;
  admin_user_id: string;
  admin_username: string | null;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface ServerSetting {
  key: string;
  value: Record<string, unknown> | null;
  category: string;
  description: string | null;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

export interface PublicConfig {
  app_name: string;
  app_description: string;
  registration_mode: string;
  brand_primary_color: string;
  brand_accent_color: string;
}
