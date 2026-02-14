import { useState } from "react";
import { api } from "@/api/client";
import type { User } from "@/types";

interface Props {
  onSelect: (user: User) => void;
}

function isFederatedIdentity(q: string): boolean {
  const parts = q.split("@");
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
}

export default function UserSearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (q: string) => {
    setQuery(q);
    setError(null);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const trimmed = q.trim();
      const currentUserId = localStorage.getItem("user_id");

      if (isFederatedIdentity(trimmed)) {
        // Federation lookup: user@server format
        try {
          const user = await api.get<User>(
            `/users/lookup?identity=${encodeURIComponent(trimmed)}`
          );
          setResults(user.id !== currentUserId ? [user] : []);
        } catch {
          setResults([]);
          setError("User not found on remote server");
        }
      } else {
        // Local search
        const users = await api.get<User[]>(
          `/users/search?q=${encodeURIComponent(trimmed)}`
        );
        setResults(users.filter((u) => u.id !== currentUserId));
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search users or enter user@server..."
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
        autoFocus
      />
      <div className="mt-2 max-h-48 overflow-y-auto">
        {searching && (
          <p className="text-xs text-gray-500 px-2 py-1">Searching...</p>
        )}
        {error && (
          <p className="text-xs text-red-400 px-2 py-1">{error}</p>
        )}
        {!searching && !error && results.length === 0 && query.trim().length >= 2 && (
          <p className="text-xs text-gray-500 px-2 py-1">No users found</p>
        )}
        {results.map((user) => (
          <button
            key={user.id}
            onClick={() => onSelect(user)}
            className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded transition-colors"
          >
            <span className="text-white">{user.username}</span>
            <span className="text-gray-500 ml-2 text-xs">
              @{user.server_domain}
            </span>
            {!user.is_local && (
              <span className="text-purple-400 ml-2 text-xs">remote</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
