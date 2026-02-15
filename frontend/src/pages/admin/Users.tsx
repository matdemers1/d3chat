import { useEffect, useState } from "react";
import { useAdminStore } from "@/store/adminStore";
import type { AdminUserDetail } from "@/types";

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    superadmin: "bg-red-900 text-red-300",
    admin: "bg-blue-900 text-blue-300",
    user: "bg-gray-800 text-gray-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${colors[role] || colors.user}`}>
      {role}
    </span>
  );
}

function StatusBadge({ user }: { user: { is_banned: boolean; is_suspended: boolean } }) {
  if (user.is_banned) return <span className="px-2 py-0.5 rounded text-xs bg-red-900 text-red-300">Banned</span>;
  if (user.is_suspended)
    return <span className="px-2 py-0.5 rounded text-xs bg-yellow-900 text-yellow-300">Suspended</span>;
  return <span className="px-2 py-0.5 rounded text-xs bg-green-900 text-green-300">Active</span>;
}

function UserDetailModal({
  user,
  onClose,
}: {
  user: AdminUserDetail;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">{user.username}</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Email</span>
            <span>{user.email || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Role</span>
            <RoleBadge role={user.role} />
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Status</span>
            <StatusBadge user={user} />
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Devices</span>
            <span>{user.device_count}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Sessions</span>
            <span>{user.session_count}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Channels</span>
            <span>{user.channel_count}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Messages</span>
            <span>{user.message_count}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Created</span>
            <span>{new Date(user.created_at).toLocaleDateString()}</span>
          </div>
          {user.ban_reason && (
            <div className="flex justify-between">
              <span className="text-gray-400">Ban Reason</span>
              <span className="text-red-400">{user.ban_reason}</span>
            </div>
          )}
        </div>
        <button onClick={onClose} className="mt-4 w-full py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm">
          Close
        </button>
      </div>
    </div>
  );
}

export default function Users() {
  const {
    users, usersTotal, usersPage, loadingUsers, selectedUser,
    fetchUsers, fetchUserDetail, banUser, unbanUser,
    suspendUser, unsuspendUser, clearSelectedUser,
  } = useAdminStore();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = () => {
    fetchUsers({ search, role: roleFilter, status: statusFilter });
  };

  const handlePageChange = (newPage: number) => {
    fetchUsers({ page: newPage, search, role: roleFilter, status: statusFilter });
  };

  const totalPages = Math.ceil(usersTotal / 50);

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Users</h2>

      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-blue-500"
        />
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); }}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white"
        >
          <option value="">All Roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="superadmin">Superadmin</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); }}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
          <option value="suspended">Suspended</option>
        </select>
        <button onClick={handleSearch} className="px-4 py-1.5 bg-brand hover:brightness-90 rounded text-sm">
          Search
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="pb-2 pr-4">Username</th>
              <th className="pb-2 pr-4">Email</th>
              <th className="pb-2 pr-4">Role</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Created</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingUsers ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-500">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-500">No users found</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => fetchUserDetail(u.id)}
                      className="text-blue-400 hover:underline"
                    >
                      {u.username}
                    </button>
                  </td>
                  <td className="py-2 pr-4 text-gray-400">{u.email || "—"}</td>
                  <td className="py-2 pr-4"><RoleBadge role={u.role} /></td>
                  <td className="py-2 pr-4"><StatusBadge user={u} /></td>
                  <td className="py-2 pr-4 text-gray-400">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="py-2 space-x-1">
                    {u.is_banned ? (
                      <button
                        onClick={() => unbanUser(u.id)}
                        className="px-2 py-1 bg-green-800 hover:bg-green-700 rounded text-xs"
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          const reason = prompt("Ban reason (optional):");
                          if (reason !== null) banUser(u.id, reason);
                        }}
                        className="px-2 py-1 bg-red-800 hover:bg-red-700 rounded text-xs"
                      >
                        Ban
                      </button>
                    )}
                    {u.is_suspended ? (
                      <button
                        onClick={() => unsuspendUser(u.id)}
                        className="px-2 py-1 bg-green-800 hover:bg-green-700 rounded text-xs"
                      >
                        Unsuspend
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          const hours = prompt("Suspend for how many hours?");
                          if (hours && !isNaN(Number(hours))) suspendUser(u.id, Number(hours));
                        }}
                        className="px-2 py-1 bg-yellow-800 hover:bg-yellow-700 rounded text-xs"
                      >
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex gap-2 mt-4 justify-center">
          <button
            disabled={usersPage <= 1}
            onClick={() => handlePageChange(usersPage - 1)}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm disabled:opacity-50"
          >
            Prev
          </button>
          <span className="px-3 py-1 text-sm text-gray-400">
            Page {usersPage} of {totalPages}
          </span>
          <button
            disabled={usersPage >= totalPages}
            onClick={() => handlePageChange(usersPage + 1)}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {selectedUser && <UserDetailModal user={selectedUser} onClose={clearSelectedUser} />}
    </div>
  );
}
