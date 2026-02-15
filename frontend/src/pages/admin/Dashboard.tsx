import { useEffect } from "react";
import { useAdminStore } from "@/store/adminStore";
import type { AnalyticsDayPoint } from "@/types";

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-bold mt-1">{value.toLocaleString()}</p>
    </div>
  );
}

function BarChart({
  data,
  dataKey,
  label,
  color,
}: {
  data: AnalyticsDayPoint[];
  dataKey: keyof AnalyticsDayPoint;
  label: string;
  color: string;
}) {
  const values = data.map((d) => (d[dataKey] as number) || 0);
  const max = Math.max(...values, 1);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-sm text-gray-400 mb-3">{label}</p>
      <div className="flex items-end gap-[2px] h-24">
        {data.map((d, i) => {
          const v = values[i] ?? 0;
          return (
            <div
              key={d.date}
              className="flex-1 rounded-t transition-all"
              style={{
                height: `${(v / max) * 100}%`,
                backgroundColor: color,
                minHeight: v > 0 ? "2px" : "0px",
              }}
              title={`${d.date}: ${v}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-gray-600">{data[0]?.date.slice(5)}</span>
        <span className="text-[10px] text-gray-600">{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { stats, analytics, loadingStats, fetchStats, fetchAnalytics } = useAdminStore();

  useEffect(() => {
    fetchStats();
    fetchAnalytics(30);
  }, [fetchStats, fetchAnalytics]);

  if (loadingStats && !stats) {
    return <p className="text-gray-400">Loading...</p>;
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Dashboard</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Users" value={stats?.total_users ?? 0} />
        <StatCard label="Active Today" value={stats?.active_users_today ?? 0} />
        <StatCard label="Total Messages" value={stats?.total_messages ?? 0} />
        <StatCard label="Total Channels" value={stats?.total_channels ?? 0} />
      </div>

      {analytics.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BarChart data={analytics} dataKey="new_messages" label="Messages (30d)" color="#3b82f6" />
          <BarChart data={analytics} dataKey="active_users" label="Active Users (30d)" color="#10b981" />
          <BarChart data={analytics} dataKey="new_users" label="New Users (30d)" color="#8b5cf6" />
          <BarChart data={analytics} dataKey="new_channels" label="New Channels (30d)" color="#f59e0b" />
        </div>
      )}
    </div>
  );
}
