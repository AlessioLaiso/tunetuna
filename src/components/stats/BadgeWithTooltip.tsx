import { ReactNode } from 'react'
import { getAccentColorRgba } from '../../utils/badgeTooltipUtils'

interface BadgeWithTooltipProps {
  badge: string
  opacity: number
  tooltip: ReactNode
  className?: string
}

export function BadgeWithTooltip({ badge, opacity, tooltip, className = '' }: BadgeWithTooltipProps) {
  return (
    <div className={`relative ${className}`}>
      <div
        className="px-2 py-1 rounded text-sm font-medium tabular-nums text-white cursor-help peer text-center w-14"
        style={{
          backgroundColor: getAccentColorRgba(opacity),
        }}
      >
        {badge}
      </div>
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-950 text-zinc-100 text-xs rounded whitespace-nowrap opacity-0 peer-hover:opacity-100 transition-opacity pointer-events-none z-10">
        {tooltip}
      </div>
    </div>
  )
}
