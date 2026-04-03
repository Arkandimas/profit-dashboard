'use client'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Info } from 'lucide-react'

type KpiColorScheme = 'default' | 'blue' | 'orange' | 'emerald'

interface KpiCardProps {
  title: string
  value: string
  change?: number
  changeLabel?: string
  icon?: React.ReactNode
  highlight?: boolean
  colorScheme?: KpiColorScheme
  loading?: boolean
  tooltip?: string
}

const COLOR_SCHEMES: Record<KpiColorScheme, { card: string; value: (isPositive: boolean, isNegative: boolean) => string }> = {
  default: {
    card: '',
    value: () => '',
  },
  blue: {
    card: 'border-blue-200 bg-blue-50/50 dark:bg-blue-950/20',
    value: () => 'text-blue-600 dark:text-blue-400',
  },
  orange: {
    card: 'border-orange-200 bg-orange-50/50 dark:bg-orange-950/20',
    value: () => 'text-orange-600 dark:text-orange-400',
  },
  emerald: {
    card: 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20',
    value: (isPositive, isNegative) =>
      isPositive ? 'text-emerald-600' : isNegative ? 'text-red-600' : '',
  },
}

export function KpiCard({ title, value, change, changeLabel, icon, highlight, colorScheme, loading, tooltip }: KpiCardProps) {
  const isPositive = change !== undefined && change >= 0
  const isNegative = change !== undefined && change < 0

  // highlight prop maps to emerald for backward compat
  const scheme = COLOR_SCHEMES[colorScheme ?? (highlight ? 'emerald' : 'default')]

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-slate-200 rounded w-24" />
            <div className="h-7 bg-slate-200 rounded w-32" />
            <div className="h-4 bg-slate-200 rounded w-20" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(scheme.card)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              {tooltip && (
                <span title={tooltip} className="cursor-help flex items-center">
                  <Info className="w-3.5 h-3.5 text-muted-foreground/60" />
                </span>
              )}
            </div>
            <p className={cn('text-2xl font-bold', scheme.value(isPositive, isNegative))}>
              {value}
            </p>
            {change !== undefined && (
              <div
                className={cn(
                  'flex items-center gap-1 text-xs font-medium',
                  isPositive ? 'text-emerald-600' : 'text-red-600'
                )}
              >
                {isPositive ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span>
                  {isPositive ? '+' : ''}
                  {change.toFixed(1)}%{changeLabel ? ` ${changeLabel}` : ''}
                </span>
              </div>
            )}
          </div>
          {icon && (
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
