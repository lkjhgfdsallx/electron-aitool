/**
 * LocalForge 图形标识：几何锻砧 + 火花节点
 * 使用 currentColor，便于放在渐变底或纯色文字上
 */
export interface BrandMarkProps {
  size?: number
  className?: string
  title?: string
}

export function BrandMark({ size = 16, className = '', title }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {/* Horn */}
      <path
        d="M6 14.5C6 13.12 7.12 12 8.5 12H12v5H8.5C7.12 17 6 15.88 6 14.5Z"
        fill="currentColor"
        opacity="0.92"
      />
      {/* Face / body */}
      <path d="M12 11h10.5c.83 0 1.5.67 1.5 1.5V17H12V11Z" fill="currentColor" />
      {/* Waist */}
      <path d="M14 17h8v2.5H14V17Z" fill="currentColor" opacity="0.95" />
      {/* Base */}
      <path d="M12.5 19.5h11L25 24H11l1.5-4.5Z" fill="currentColor" />
      <rect x="9.5" y="24" width="14" height="2.2" rx="0.6" fill="currentColor" opacity="0.9" />
      {/* Sparks / nodes */}
      <circle cx="17" cy="6.2" r="1.35" fill="currentColor" />
      <circle cx="21.2" cy="8.4" r="1" fill="currentColor" opacity="0.9" />
      <circle cx="13.5" cy="7.6" r="0.85" fill="currentColor" opacity="0.85" />
      <path
        d="M17 10.2V8M20.2 10.6l-1.1-1.4M14.2 10.4l1-1.3"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  )
}
