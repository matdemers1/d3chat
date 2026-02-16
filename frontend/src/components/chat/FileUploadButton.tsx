import { useRef, useState } from "react";
import { api } from "@/api/client";
import type { Attachment } from "@/types";

interface Props {
  channelId: string;
  onUploaded: (attachment: Attachment) => void;
}

export default function FileUploadButton({ channelId, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Simulate progress since fetch doesn't support upload progress natively
      const progressTimer = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const attachment = await api.upload<Attachment>(
        `/channels/${channelId}/attachments`,
        formData
      );

      clearInterval(progressTimer);
      setProgress(100);
      onUploaded(attachment);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      setProgress(0);
      // Reset file input
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleChange}
        disabled={uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="p-2 text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
        title="Attach file"
      >
        {uploading ? (
          <div className="w-5 h-5 flex items-center justify-center">
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
            />
          </svg>
        )}
      </button>
      {uploading && (
        <div className="absolute bottom-full left-0 right-0 h-1 bg-gray-700">
          <div
            className="h-full bg-brand transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </>
  );
}
