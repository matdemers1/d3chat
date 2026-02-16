import { useState } from "react";
import type { Attachment } from "@/types";
import ImageLightbox from "./ImageLightbox";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1").replace(/\/api\/v1$/, "");

interface Props {
  attachments: Attachment[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function isImage(contentType: string): boolean {
  return contentType.startsWith("image/");
}

function getAuthUrl(path: string): string {
  const token = localStorage.getItem("access_token");
  const separator = path.includes("?") ? "&" : "?";
  return `${API_BASE}${path}${token ? `${separator}token=${token}` : ""}`;
}

export default function AttachmentPreview({ attachments }: Props) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (!attachments.length) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-1">
        {attachments.map((att) =>
          isImage(att.content_type) ? (
            <button
              key={att.id}
              onClick={() => setLightboxUrl(getAuthUrl(att.url))}
              className="block rounded overflow-hidden hover:opacity-90 transition-opacity"
            >
              <img
                src={getAuthUrl(att.thumbnail_url || att.url)}
                alt={att.filename}
                className="max-w-[200px] max-h-[200px] object-cover rounded"
                loading="lazy"
              />
            </button>
          ) : (
            <a
              key={att.id}
              href={getAuthUrl(att.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors text-sm"
            >
              <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <div className="min-w-0">
                <div className="text-gray-200 truncate">{att.filename}</div>
                <div className="text-gray-500 text-xs">{formatSize(att.size_bytes)}</div>
              </div>
            </a>
          )
        )}
      </div>
      {lightboxUrl && (
        <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </>
  );
}
