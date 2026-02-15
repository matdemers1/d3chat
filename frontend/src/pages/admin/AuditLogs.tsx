import { useEffect, useState } from "react";
import { useAdminStore } from "@/store/adminStore";

const ACTION_OPTIONS = [
  "ban_user",
  "unban_user",
  "suspend_user",
  "unsuspend_user",
  "promote_user",
  "delete_user",
  "delete_channel",
  "update_setting",
];

export default function AuditLogs() {
  const {
    auditLogs, auditLogsTotal, auditLogsPage, loadingAuditLogs,
    fetchAuditLogs,
  } = useAdminStore();

  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const handleFilter = () => {
    fetchAuditLogs({ action: actionFilter });
  };

  const handlePageChange = (newPage: number) => {
    fetchAuditLogs({ page: newPage, action: actionFilter });
  };

  const totalPages = Math.ceil(auditLogsTotal / 50);

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Audit Logs</h2>

      <div className="flex gap-2 mb-4">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white"
        >
          <option value="">All Actions</option>
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
          ))}
        </select>
        <button onClick={handleFilter} className="px-4 py-1.5 bg-brand hover:brightness-90 rounded text-sm">
          Filter
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="pb-2 pr-4">Timestamp</th>
              <th className="pb-2 pr-4">Admin</th>
              <th className="pb-2 pr-4">Action</th>
              <th className="pb-2 pr-4">Target</th>
              <th className="pb-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {loadingAuditLogs ? (
              <tr><td colSpan={5} className="py-8 text-center text-gray-500">Loading...</td></tr>
            ) : auditLogs.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-gray-500">No audit logs found</td></tr>
            ) : (
              auditLogs.map((log) => (
                <tr key={log.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                  <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">{log.admin_username || "—"}</td>
                  <td className="py-2 pr-4">
                    <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-300">
                      {log.action.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-gray-400">
                    {log.target_type}:{log.target_id.slice(0, 8)}
                  </td>
                  <td className="py-2 text-gray-500 text-xs max-w-xs truncate">
                    {log.details ? JSON.stringify(log.details) : "—"}
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
            disabled={auditLogsPage <= 1}
            onClick={() => handlePageChange(auditLogsPage - 1)}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm disabled:opacity-50"
          >
            Prev
          </button>
          <span className="px-3 py-1 text-sm text-gray-400">
            Page {auditLogsPage} of {totalPages}
          </span>
          <button
            disabled={auditLogsPage >= totalPages}
            onClick={() => handlePageChange(auditLogsPage + 1)}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
