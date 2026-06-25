import { useId } from 'react';

interface LogoIconProps {
  size?: number;
  className?: string;
}

/**
 * LocalSEOHub brand mark: a location pin with a magnifying glass inside.
 * Pin shape = "local", magnifier = "search / SEO".
 */
export function LogoIcon({ size = 32, className = '' }: LogoIconProps) {
  const uid = useId().replace(/:/g, '');
  const gradId = `lsh-g-${uid}`;
  const w = Math.round(size * 0.72);

  return (
    <svg
      width={w}
      height={size}
      viewBox="0 0 14 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      {/* Pin body — teardrop shape */}
      <path
        d="M7 0.5C3.41 0.5 0.5 3.41 0.5 7C0.5 11.75 7 19.5 7 19.5C7 19.5 13.5 11.75 13.5 7C13.5 3.41 10.59 0.5 7 0.5Z"
        fill={`url(#${gradId})`}
      />
      {/* Magnifier lens ring */}
      <circle
        cx="6.3"
        cy="6.3"
        r="2.35"
        fill="none"
        stroke="#0f172a"
        strokeWidth="1.35"
      />
      {/* Magnifier handle */}
      <line
        x1="7.95"
        y1="7.95"
        x2="9.6"
        y2="9.6"
        stroke="#0f172a"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}
