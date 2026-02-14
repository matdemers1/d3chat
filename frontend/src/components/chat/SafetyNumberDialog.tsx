import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { generateSafetyNumber } from "@/crypto/safetyNumbers";
import type { ChannelMember, KeyBundle } from "@/types";

interface Props {
  channelId: string;
  onClose: () => void;
}

export default function SafetyNumberDialog({ channelId, onClose }: Props) {
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const members = await api.get<ChannelMember[]>(
          `/channels/${channelId}/members`
        );

        if (members.length !== 2) {
          setError("Safety numbers are only available for DMs");
          return;
        }

        // Get both users' key bundles
        const identityKeys: string[] = [];
        for (const member of members) {
          const bundles = await api.get<KeyBundle[]>(
            `/keys/${member.user_id}/bundles`
          );
          if (bundles.length > 0) {
            identityKeys.push(bundles[0]!.identity_key);
          }
        }

        if (identityKeys.length !== 2) {
          setError("Could not retrieve both users' identity keys");
          return;
        }

        const number = await generateSafetyNumber(
          identityKeys[0]!,
          identityKeys[1]!
        );
        setSafetyNumber(number);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to generate safety number"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [channelId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 w-96 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">
            Security Verification
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {loading && (
          <p className="text-sm text-gray-400">
            Generating safety number...
          </p>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {safetyNumber && (
          <div>
            <p className="text-xs text-gray-400 mb-3">
              Compare this number with your contact through a trusted channel
              (in person, phone call, etc.) to verify your conversation is
              secure.
            </p>
            <div className="bg-gray-800 rounded-lg p-4 font-mono text-center text-lg text-white tracking-wider leading-relaxed">
              {safetyNumber
                .split(" ")
                .reduce<string[][]>((rows, group, i) => {
                  const rowIndex = Math.floor(i / 4);
                  if (!rows[rowIndex]) rows[rowIndex] = [];
                  rows[rowIndex]!.push(group);
                  return rows;
                }, [])
                .map((row, i) => (
                  <div key={i}>{row.join("  ")}</div>
                ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              If both users see the same number, your messages are
              end-to-end encrypted and no one is intercepting the
              conversation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
