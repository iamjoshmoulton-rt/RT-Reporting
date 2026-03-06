import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  className?: string
}

const STATUS_STYLES: Record<string, string> = {
  sale: 'bg-success/10 text-success border-success/20',
  done: 'bg-success/10 text-success border-success/20',
  posted: 'bg-success/10 text-success border-success/20',
  paid: 'bg-success/10 text-success border-success/20',
  purchase: 'bg-primary/10 text-primary border-primary/20',
  confirmed: 'bg-primary/10 text-primary border-primary/20',
  assigned: 'bg-primary/10 text-primary border-primary/20',
  draft: 'bg-[var(--muted)]/50 text-[var(--muted-foreground)] border-[var(--border)]',
  cancel: 'bg-danger/10 text-danger border-danger/20',
  not_paid: 'bg-warning/10 text-warning border-warning/20',
  partial: 'bg-warning/10 text-warning border-warning/20',
  in_payment: 'bg-primary/10 text-primary border-primary/20',
  sent: 'bg-primary/10 text-primary border-primary/20',
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] || STATUS_STYLES['draft']
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-normal',
      style, className
    )}>
      {label}
    </span>
  )
}
