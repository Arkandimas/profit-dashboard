'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Calendar, ChevronDown } from 'lucide-react'

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
]

interface DateRangePickerProps {
  value: string
  onChange: (value: string) => void
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const current = PRESETS.find((p) => p.value === value) || PRESETS[3]

  return (
    <div className="relative">
      <Button
        variant="outline"
        className="gap-2"
        onClick={() => setOpen(!open)}
      >
        <Calendar className="w-4 h-4" />
        {current.label}
        <ChevronDown className="w-4 h-4" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-slate-900 border rounded-lg shadow-lg p-1 min-w-[160px]">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm rounded-md transition-colors',
                  value === preset.value
                    ? 'bg-emerald-50 text-emerald-700 font-medium'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
                onClick={() => {
                  onChange(preset.value)
                  setOpen(false)
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
