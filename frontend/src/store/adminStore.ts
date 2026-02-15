import { create } from "zustand";
import { api } from "@/api/client";
import type {
  DashboardStats,
  AnalyticsDayPoint,
  AdminUser,
  AdminUserDetail,
  AdminChannel,
  AuditLogEntry,
  ServerSetting,
} from "@/types";

interface AdminState {
  // Dashboard
  stats: DashboardStats | null;
  analytics: AnalyticsDayPoint[];
  loadingStats: boolean;

  // Users
  users: AdminUser[];
  usersTotal: number;
  usersPage: number;
  selectedUser: AdminUserDetail | null;
  loadingUsers: boolean;

  // Channels
  channels: AdminChannel[];
  channelsTotal: number;
  channelsPage: number;
  loadingChannels: boolean;

  // Audit Logs
  auditLogs: AuditLogEntry[];
  auditLogsTotal: number;
  auditLogsPage: number;
  loadingAuditLogs: boolean;

  // Settings
  settings: ServerSetting[];
  loadingSettings: boolean;

  // Actions
  fetchStats: () => Promise<void>;
  fetchAnalytics: (days?: number) => Promise<void>;
  fetchUsers: (params?: { page?: number; search?: string; role?: string; status?: string }) => Promise<void>;
  fetchUserDetail: (id: string) => Promise<void>;
  banUser: (id: string, reason?: string) => Promise<void>;
  unbanUser: (id: string) => Promise<void>;
  suspendUser: (id: string, hours: number, reason?: string) => Promise<void>;
  unsuspendUser: (id: string) => Promise<void>;
  promoteUser: (id: string, role: string) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  fetchChannels: (params?: { page?: number; search?: string; type?: string }) => Promise<void>;
  deleteChannel: (id: string) => Promise<void>;
  fetchAuditLogs: (params?: { page?: number; action?: string }) => Promise<void>;
  fetchSettings: () => Promise<void>;
  clearSelectedUser: () => void;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  stats: null,
  analytics: [],
  loadingStats: false,

  users: [],
  usersTotal: 0,
  usersPage: 1,
  selectedUser: null,
  loadingUsers: false,

  channels: [],
  channelsTotal: 0,
  channelsPage: 1,
  loadingChannels: false,

  auditLogs: [],
  auditLogsTotal: 0,
  auditLogsPage: 1,
  loadingAuditLogs: false,

  settings: [],
  loadingSettings: false,

  fetchStats: async () => {
    set({ loadingStats: true });
    try {
      const stats = await api.get<DashboardStats>("/admin/dashboard/stats");
      set({ stats });
    } finally {
      set({ loadingStats: false });
    }
  },

  fetchAnalytics: async (days = 30) => {
    try {
      const data = await api.get<{ days: AnalyticsDayPoint[] }>(`/admin/dashboard/analytics?days=${days}`);
      set({ analytics: data.days });
    } catch {
      // ignore
    }
  },

  fetchUsers: async (params) => {
    set({ loadingUsers: true });
    try {
      const qs = new URLSearchParams();
      if (params?.page) qs.set("page", String(params.page));
      if (params?.search) qs.set("search", params.search);
      if (params?.role) qs.set("role", params.role);
      if (params?.status) qs.set("status", params.status);
      const data = await api.get<{ users: AdminUser[]; total: number; page: number }>(
        `/admin/users?${qs.toString()}`
      );
      set({ users: data.users, usersTotal: data.total, usersPage: data.page });
    } finally {
      set({ loadingUsers: false });
    }
  },

  fetchUserDetail: async (id) => {
    const data = await api.get<AdminUserDetail>(`/admin/users/${id}`);
    set({ selectedUser: data });
  },

  banUser: async (id, reason) => {
    await api.post(`/admin/users/${id}/ban`, { reason: reason || null });
    await get().fetchUsers({ page: get().usersPage });
  },

  unbanUser: async (id) => {
    await api.post(`/admin/users/${id}/unban`);
    await get().fetchUsers({ page: get().usersPage });
  },

  suspendUser: async (id, hours, reason) => {
    await api.post(`/admin/users/${id}/suspend`, { hours, reason: reason || null });
    await get().fetchUsers({ page: get().usersPage });
  },

  unsuspendUser: async (id) => {
    await api.post(`/admin/users/${id}/unsuspend`);
    await get().fetchUsers({ page: get().usersPage });
  },

  promoteUser: async (id, role) => {
    await api.post(`/admin/users/${id}/promote`, { role });
    await get().fetchUsers({ page: get().usersPage });
  },

  deleteUser: async (id) => {
    await api.delete(`/admin/users/${id}`);
    await get().fetchUsers({ page: get().usersPage });
  },

  fetchChannels: async (params) => {
    set({ loadingChannels: true });
    try {
      const qs = new URLSearchParams();
      if (params?.page) qs.set("page", String(params.page));
      if (params?.search) qs.set("search", params.search);
      if (params?.type) qs.set("type", params.type);
      const data = await api.get<{ channels: AdminChannel[]; total: number; page: number }>(
        `/admin/channels?${qs.toString()}`
      );
      set({ channels: data.channels, channelsTotal: data.total, channelsPage: data.page });
    } finally {
      set({ loadingChannels: false });
    }
  },

  deleteChannel: async (id) => {
    await api.delete(`/admin/channels/${id}`);
    await get().fetchChannels({ page: get().channelsPage });
  },

  fetchAuditLogs: async (params) => {
    set({ loadingAuditLogs: true });
    try {
      const qs = new URLSearchParams();
      if (params?.page) qs.set("page", String(params.page));
      if (params?.action) qs.set("action", params.action);
      const data = await api.get<{ logs: AuditLogEntry[]; total: number; page: number }>(
        `/admin/audit-logs?${qs.toString()}`
      );
      set({ auditLogs: data.logs, auditLogsTotal: data.total, auditLogsPage: data.page });
    } finally {
      set({ loadingAuditLogs: false });
    }
  },

  fetchSettings: async () => {
    set({ loadingSettings: true });
    try {
      const settings = await api.get<ServerSetting[]>("/admin/settings");
      set({ settings });
    } finally {
      set({ loadingSettings: false });
    }
  },

  clearSelectedUser: () => set({ selectedUser: null }),
}));
