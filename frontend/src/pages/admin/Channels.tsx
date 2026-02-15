import { useEffect, useState } from "react";
import { useAdminStore } from "@/store/adminStore";

export default function Channels() {
  const {
    channels, channelsTotal, channelsPage, loadingChannels,
    fetchChannels, deleteChannel,
  } = useAdminStore();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const handleSearch = () => {
    fetchChannels({ search, type: typeFilter });
  };

  const handlePageChange = (newPage: number) => {
    fetchChannels({ page: newPage, search, type: typeFilter });
  };

  const totalPages = Math.ceil(channelsTotal / 50);

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Channels</h2>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search channel name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-blue-500"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white"
        >
          <option value="">All Types</option>
          <option value="channel">Channels</option>
          <option value="dm">DMs</option>
        </select>
        <button onClick={handleSearch} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm">
          Search
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Type</th>
              <th className="pb-2 pr-4">Federated</th>
              <th className="pb-2 pr-4">Members</th>
              <th className="pb-2 pr-4">Messages</th>
              <th className="pb-2 pr-4">Created</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingChannels ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">Loading...</td></tr>
            ) : channels.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">No channels found</td></tr>
            ) : (
              channels.map((ch) => (
                <tr key={ch.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                  <td className="py-2 pr-4">{ch.name || "—"}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded text-xs ${ch.is_dm ? "bg-purple-900 text-purple-300" : "bg-blue-900 text-blue-300"}`}>
                      {ch.is_dm ? "DM" : "Channel"}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    {ch.is_federated && (
                      <span className="px-2 py-0.5 rounded text-xs bg-purple-900 text-purple-300">Fed</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-gray-400">{ch.member_count}</td>
                  <td className="py-2 pr-4 text-gray-400">{ch.message_count}</td>
                  <td className="py-2 pr-4 text-gray-400">{new Date(ch.created_at).toLocaleDateString()}</td>
                  <td className="py-2">
                    <button
                      onClick={() => {
                        if (confirm(`Delete channel "${ch.name || ch.id}"? This will remove all messages.`))
                          deleteChannel(ch.id);
                      }}
                      className="px-2 py-1 bg-red-800 hover:bg-red-700 rounded text-xs"
                    >
                      Delete
                    </button>
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
            disabled={channelsPage <= 1}
            onClick={() => handlePageChange(channelsPage - 1)}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm disabled:opacity-50"
          >
            Prev
          </button>
          <span className="px-3 py-1 text-sm text-gray-400">
            Page {channelsPage} of {totalPages}
          </span>
          <button
            disabled={channelsPage >= totalPages}
            onClick={() => handlePageChange(channelsPage + 1)}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
