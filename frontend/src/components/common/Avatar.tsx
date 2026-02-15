const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const SIZES = {
  sm: "w-6 h-6 text-[10px]",
  md: "w-8 h-8 text-xs",
  lg: "w-12 h-12 text-base",
} as const;

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getColor(name: string): string {
  const hue = ((hashCode(name) % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
}

export default function Avatar({
  src,
  name,
  size = "md",
  className = "",
  onClick,
}: AvatarProps) {
  const sizeClass = SIZES[size];
  const base = `rounded-full inline-flex items-center justify-center shrink-0 ${sizeClass} ${className}`;

  if (src) {
    const imgSrc = src.startsWith("/") ? `${API_URL}${src}` : src;
    return (
      <img
        src={imgSrc}
        alt={name}
        className={`${base} object-cover`}
        onClick={onClick}
        style={onClick ? { cursor: "pointer" } : undefined}
      />
    );
  }

  return (
    <div
      className={`${base} text-white font-semibold select-none`}
      style={{
        backgroundColor: getColor(name),
        ...(onClick ? { cursor: "pointer" } : {}),
      }}
      onClick={onClick}
    >
      {getInitials(name)}
    </div>
  );
}
