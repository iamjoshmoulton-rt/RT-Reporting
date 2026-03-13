import { useState, useRef, useEffect, useCallback } from 'react'
import { HelpCircle } from 'lucide-react'

export interface CalcTooltipData {
  title: string
  formula: string
  source?: string
}

interface CalcTooltipProps extends CalcTooltipData {
  className?: string
}

export function CalcTooltip({ title, formula, source, className }: CalcTooltipProps) {
  const [show, setShow] = useState(false)
  const [above, setAbove] = useState(true)
  const iconRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(null)

  const open = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    // Determine if we should flip below
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect()
      setAbove(rect.top > 180)
    }
    setShow(true)
  }, [])

  const close = useCallback(() => {
    timer.current = setTimeout(() => setShow(false), 150)
  }, [])

  const keepOpen = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  // Close on scroll / resize
  useEffect(() => {
    if (!show) return
    const hide = () => setShow(false)
    window.addEventListener('scroll', hide, { passive: true, capture: true })
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [show])

  return (
    <span
      ref={iconRef}
      className={`relative inline-flex items-center ${className ?? ''}`}
      onMouseEnter={open}
      onMouseLeave={close}
      onClick={(e) => { e.stopPropagation(); setShow(s => !s) }}
    >
      <HelpCircle className="h-3.5 w-3.5 text-[var(--muted-foreground)] opacity-50 hover:opacity-100 transition-opacity cursor-help" />

      {show && (
        <div
          ref={tipRef}
          onMouseEnter={keepOpen}
          onMouseLeave={close}
          className={`absolute z-50 w-72 rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl p-3 text-left ${
            above
              ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
              : 'top-full mt-2 left-1/2 -translate-x-1/2'
          }`}
        >
          {/* Arrow */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 border border-[var(--border)] bg-[var(--card)] ${
              above
                ? '-bottom-[6px] border-t-0 border-l-0'
                : '-top-[6px] border-b-0 border-r-0'
            }`}
          />

          <p className="text-xs font-semibold text-[var(--card-foreground)] mb-1.5">
            {title}
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)] font-mono whitespace-pre-wrap break-words">
            {formula}
          </p>
          {source && (
            <p className="text-[10px] text-[var(--muted-foreground)] mt-2 pt-1.5 border-t border-[var(--border)] opacity-70">
              Source: {source}
            </p>
          )}
        </div>
      )}
    </span>
  )
}
