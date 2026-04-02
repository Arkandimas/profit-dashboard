'use client'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface KpiCardProps {
  title: string
  value: string
  change?: number
  changeLabel?: string
  icon?: React.ReactNode
  highlight?: boolean
  loading?: boolean
}

export function KpiCard({ title, value, change, changeLabel, icon, highlight, loading }: KpiCardProps) {
  const isPositive = change !== undefined && change >= 0
  const isNegative = change !== undefined && change < 0

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
    <Card className={cn(highlight && 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20')}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p
              className={cn(
                'text-2xl font-bold',
                highlight && isPositive && 'text-emerald-600',
                highlight && isNegative && 'text-red-600'
              )}
            >
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
