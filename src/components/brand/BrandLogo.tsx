import { BRAND } from '../../constants/brand'
import { BrandMark } from './BrandMark'

export type BrandLogoSize = 'xs' | 'sm' | 'md' | 'lg'

export interface BrandLogoProps {
  /** 图标容器尺寸档位 */
  size?: BrandLogoSize
  /** 是否显示产品名 */
  showWordmark?: boolean
  /** 是否显示版本号（仅在有字标时） */
  showVersion?: boolean
  /** 字标旁副文案（覆盖默认版本） */
  subtitle?: string
  className?: string
  /** 字标额外 class */
  wordmarkClassName?: string
}

const SIZE_MAP: Record<
  BrandLogoSize,
  { box: string; icon: number; radius: string; gap: string; title: string; sub: string }
> = {
  xs: {
    box: 'w-5 h-5',
    icon: 11,
    radius: 'rounded-md',
    gap: 'gap-2',
    title: 'text-xs font-semibold',
    sub: 'text-[10px]',
  },
  sm: {
    box: 'w-7 h-7',
    icon: 15,
    radius: 'rounded-lg',
    gap: 'gap-2.5',
    title: 'text-sm font-semibold',
    sub: 'text-[10px]',
  },
  md: {
    box: 'w-8 h-8',
    icon: 16,
    radius: 'rounded-lg',
    gap: 'gap-2',
    title: 'text-sm font-bold',
    sub: 'text-[10px]',
  },
  lg: {
    box: 'w-14 h-14',
    icon: 28,
    radius: 'rounded-2xl',
    gap: 'gap-3',
    title: 'text-2xl font-bold',
    sub: 'text-sm',
  },
}

/**
 * LocalForge 统一品牌标识：渐变底 + 锻砧 mark + 可选字标
 */
export function BrandLogo({
  size = 'sm',
  showWordmark = true,
  showVersion = false,
  subtitle,
  className = '',
  wordmarkClassName = '',
}: BrandLogoProps) {
  const s = SIZE_MAP[size]
  const sub = subtitle ?? (showVersion ? BRAND.versionLabel : undefined)

  return (
    <div className={`flex items-center ${s.gap} ${className}`}>
      <div
        className={`flex items-center justify-center ${s.box} ${s.radius} bg-gradient-brand shadow-sm text-white flex-shrink-0`}
      >
        <BrandMark size={s.icon} title={BRAND.name} />
      </div>
      {showWordmark && (
        <div className="min-w-0">
          <div
            className={`${s.title} text-gray-800 dark:text-gray-100 tracking-tight leading-tight ${wordmarkClassName}`}
          >
            {BRAND.name}
          </div>
          {sub && (
            <p className={`${s.sub} text-gray-400 dark:text-gray-500 font-medium leading-tight`}>
              {sub}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
