import { useState, useRef, useEffect } from 'react'
import { Download, FileSpreadsheet, FileText, File } from 'lucide-react'
import { api } from '@/api/client'
import { usePermission } from '@/hooks/usePermission'

interface ExportMenuProps {
  module: string
  dateFrom?: string
  dateTo?: string
  /** Extra query params like move_type */
  extraParams?: Record<string, string | number | undefined>
}

export function ExportMenu({ module, dateFrom, dateTo, extraParams }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const canCsv = usePermission(`${module}.export_csv`)
  const canExcel = usePermission(`${module}.export_excel`)
  const canPdf = usePermission(`${module}.export_pdf`)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!canCsv && !canExcel && !canPdf) return null

  const params: Record<string, string | number | undefined> = {
    date_from: dateFrom,
    date_to: dateTo,
    ...extraParams,
  }

  async function handleExport(format: 'csv' | 'excel' | 'pdf') {
    setLoading(format)
    setOpen(false)
    try {
      const ext = format === 'excel' ? 'xlsx' : format
      await api.download(`/export/${module}/${format}`, params, `${module}_export.${ext}`)
    } finally {
      setLoading(null)
    }
  }

  const options = [
    { format: 'csv' as const, label: 'CSV', icon: FileText, allowed: canCsv },
    { format: 'excel' as const, label: 'Excel', icon: FileSpreadsheet, allowed: canExcel },
    { format: 'pdf' as const, label: 'PDF', icon: File, allowed: canPdf },
  ].filter(o => o.allowed)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={!!loading}
        className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50 transition-colors flex items-center gap-2"
      >
        <Download className="h-4 w-4" />
        {loading ? 'Exporting\u2026' : 'Export'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg py-1">
          {options.map(({ format, label, icon: Icon }) => (
            <button
              key={format}
              onClick={() => handleExport(format)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--card-foreground)] hover:bg-[var(--muted)] transition-colors"
            >
              <Icon className="h-4 w-4 text-[var(--muted-foreground)]" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
