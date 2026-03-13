import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import {
  LifeBuoy, X, Camera, Clipboard, Video, Square,
  ChevronDown, ChevronUp, Loader2, Trash2, Pencil,
} from 'lucide-react'
import { ScreenshotEditor } from './ScreenshotEditor'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useSubmitSupportTicket } from '@/api/hooks'
import { getRecentErrors, trackPageVisit, getPageVisits } from '@/hooks/useErrorCollector'

type Priority = 'low' | 'medium' | 'high'

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'bg-green-500' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { value: 'high', label: 'High', color: 'bg-red-500' },
]

const MAX_RECORD_SECONDS = 60
const WARN_BEFORE_SECONDS = 10

function parseBrowserInfo(ua: string) {
  let browser = 'Unknown'
  let os = 'Unknown'

  if (ua.includes('Firefox/')) browser = `Firefox ${ua.split('Firefox/')[1]?.split(' ')[0]}`
  else if (ua.includes('Edg/')) browser = `Edge ${ua.split('Edg/')[1]?.split(' ')[0]}`
  else if (ua.includes('Chrome/')) browser = `Chrome ${ua.split('Chrome/')[1]?.split(' ')[0]}`
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = `Safari ${ua.split('Version/')[1]?.split(' ')[0] ?? ''}`

  if (ua.includes('Mac OS X')) os = `macOS ${ua.split('Mac OS X ')[1]?.split(')')[0]?.replace(/_/g, '.') ?? ''}`
  else if (ua.includes('Windows NT')) os = `Windows ${ua.split('Windows NT ')[1]?.split(';')[0]}`
  else if (ua.includes('Linux')) os = 'Linux'

  return { browser: browser.trim(), os: os.trim() }
}

function buildDiagnostics(theme: string, userName: string, userEmail: string) {
  const { browser, os } = parseBrowserInfo(navigator.userAgent)
  return {
    browser,
    os,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen_resolution: `${screen.width}x${screen.height}`,
    theme,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: new Date().toISOString(),
    user_name: userName,
    user_email: userEmail,
    recent_errors: getRecentErrors(),
    pages_visited: getPageVisits(),
  }
}

export function SupportWidget() {
  const { user } = useAuth()
  const submitTicket = useSubmitSupportTicket()
  const location = useLocation()

  useEffect(() => {
    trackPageVisit(location.pathname)
  }, [location.pathname])

  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [recording, setRecording] = useState<Blob | null>(null)
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [diagOpen, setDiagOpen] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isEditingScreenshot, setIsEditingScreenshot] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const displayStreamRef = useRef<MediaStream | null>(null)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  const diagnostics = user ? buildDiagnostics(currentTheme, user.full_name, user.email) : null

  const resetForm = useCallback(() => {
    setSubject('')
    setDescription('')
    setPriority('medium')
    setScreenshot(null)
    if (recordingUrl) URL.revokeObjectURL(recordingUrl)
    setRecording(null)
    setRecordingUrl(null)
    setDiagOpen(false)
  }, [recordingUrl])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach(t => t.stop())
      displayStreamRef.current = null
    }
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    }
    setIsRecording(false)
  }, [])

  useEffect(() => {
    return () => {
      stopRecording()
      if (recordingUrl) URL.revokeObjectURL(recordingUrl)
    }
  }, [stopRecording, recordingUrl])

  const handlePasteOnDescription = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (blob) blobToBase64(blob).then(setScreenshot)
        return
      }
    }
  }

  const handlePasteFromClipboard = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read()
      for (const item of clipboardItems) {
        const imageType = item.types.find(t => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const b64 = await blobToBase64(blob)
          setScreenshot(b64)
          return
        }
      }
      toast.info('No image found in clipboard')
    } catch {
      toast.error('Unable to read clipboard. Try pasting directly into the description field.')
    }
  }

  const handleCaptureScreen = async () => {
    setIsCapturing(true)
    const wasOpen = open
    setOpen(false)

    await new Promise(r => setTimeout(r, 400))

    try {
      const mod = await import('html2canvas-pro')
      const html2canvas = mod.default ?? mod
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        scale: window.devicePixelRatio > 1 ? 1.5 : 1,
        logging: false,
        foreignObjectRendering: false,
        removeContainer: true,
      })
      const b64 = canvas.toDataURL('image/png').split(',')[1]
      setScreenshot(b64)
      toast.success('Screenshot captured')
    } catch (err) {
      console.error('Screenshot capture error:', err)
      toast.error(`Screenshot failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      if (wasOpen) setOpen(true)
      setIsCapturing(false)
    }
  }

  const startRecording = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      })
      displayStreamRef.current = displayStream

      let combinedStream: MediaStream
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        combinedStream = new MediaStream([
          ...displayStream.getVideoTracks(),
          ...micStream.getAudioTracks(),
        ])
      } catch {
        combinedStream = displayStream
        toast.info('Microphone access denied — recording video only. Allow mic to narrate.')
      }

      streamRef.current = combinedStream

      const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
        ? 'video/webm; codecs=vp9'
        : 'video/webm'

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 1_000_000,
        audioBitsPerSecond: 128_000,
      })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        if (recordingUrl) URL.revokeObjectURL(recordingUrl)
        setRecording(blob)
        setRecordingUrl(URL.createObjectURL(blob))
        setIsRecording(false)
        setRecordSeconds(0)
      }

      displayStream.getVideoTracks()[0].onended = () => stopRecording()

      recorder.start(1000)
      setIsRecording(true)
      setRecordSeconds(0)

      let elapsed = 0
      recordTimerRef.current = setInterval(() => {
        elapsed++
        setRecordSeconds(elapsed)
        if (elapsed === MAX_RECORD_SECONDS - WARN_BEFORE_SECONDS) {
          toast.warning(`Recording will stop in ${WARN_BEFORE_SECONDS}s`)
        }
        if (elapsed >= MAX_RECORD_SECONDS) {
          stopRecording()
        }
      }, 1000)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') return
      console.error('Screen recording error:', err)
      toast.error(`Recording failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const removeRecording = () => {
    if (recordingUrl) URL.revokeObjectURL(recordingUrl)
    setRecording(null)
    setRecordingUrl(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !description.trim()) {
      toast.error('Subject and description are required')
      return
    }

    const fd = new FormData()
    fd.append('subject', subject.trim())
    fd.append('description', description.trim())
    fd.append('priority', priority)
    fd.append('page_url', window.location.href)
    if (screenshot) fd.append('screenshot', screenshot)
    fd.append('diagnostics', JSON.stringify(diagnostics))
    if (recording) {
      fd.append('recording', new File([recording], 'recording.webm', { type: 'video/webm' }))
    }

    submitTicket.mutate(fd, {
      onSuccess: () => {
        toast.success('Bug report submitted successfully!')
        resetForm()
        setOpen(false)
      },
      onError: (err) => {
        toast.error(`Failed to submit: ${(err as Error).message}`)
      },
    })
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex items-center justify-center',
          'w-14 h-14 rounded-full shadow-lg',
          'bg-navy text-white hover:bg-navy/90 transition-all duration-200',
          'hover:scale-105 active:scale-95',
          open && 'hidden',
        )}
        aria-label="Report a bug"
      >
        <LifeBuoy className="w-6 h-6" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-out panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-full sm:w-[420px]',
          'bg-[var(--card)] border-l border-[var(--border)]',
          'flex flex-col shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
        )}
      >
        {isEditingScreenshot && screenshot ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <ScreenshotEditor
              screenshot={screenshot}
              onSave={(b64) => {
                setScreenshot(b64)
                setIsEditingScreenshot(false)
              }}
              onCancel={() => setIsEditingScreenshot(false)}
            />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-navy text-white">
              <div className="flex items-center gap-3">
                <LifeBuoy className="w-5 h-5 text-[#48cae1]" />
                <h2 className="text-lg font-heading font-bold">Report a Bug</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Brief summary of the issue"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[#48cae1]/50 focus:border-[#48cae1]"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              onPaste={handlePasteOnDescription}
              placeholder="Describe the bug in detail. You can paste screenshots here (Ctrl/Cmd+V)."
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[#48cae1]/50 focus:border-[#48cae1] resize-none"
              required
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
              Priority
            </label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPriority(opt.value)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all',
                    priority === opt.value
                      ? 'border-[#48cae1] bg-[#48cae1]/10 text-[var(--foreground)]'
                      : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--foreground)]/30',
                  )}
                >
                  <span className={cn('w-2 h-2 rounded-full', opt.color)} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Screenshot section */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Screenshot
            </label>
            {screenshot ? (
              <div className="relative rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--background)]">
                <img
                  src={`data:image/png;base64,${screenshot}`}
                  alt="Screenshot preview"
                  className="w-full max-h-48 object-contain"
                />
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setIsEditingScreenshot(true)}
                    className="p-1 rounded-full bg-[#48cae1] text-white hover:bg-[#48cae1]/90 transition-colors"
                    title="Edit / Markup"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreenshot(null)}
                    className="p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--muted-foreground)] hover:border-[#48cae1] hover:text-[#48cae1] transition-colors"
                >
                  <Clipboard className="w-4 h-4" />
                  Paste
                </button>
                <button
                  type="button"
                  onClick={handleCaptureScreen}
                  disabled={isCapturing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--muted-foreground)] hover:border-[#48cae1] hover:text-[#48cae1] transition-colors disabled:opacity-50"
                >
                  {isCapturing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                  Capture Page
                </button>
              </div>
            )}
          </div>

          {/* Screen recording section */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Screen Recording
            </label>
            {isRecording ? (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-mono text-[var(--foreground)]">
                  {formatTime(recordSeconds)}
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  / {formatTime(MAX_RECORD_SECONDS)}
                </span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop
                </button>
              </div>
            ) : recordingUrl ? (
              <div className="relative rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--background)]">
                <video
                  src={recordingUrl}
                  controls
                  className="w-full max-h-48"
                />
                <button
                  type="button"
                  onClick={removeRecording}
                  className="absolute top-2 right-2 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--muted-foreground)] hover:border-[#48cae1] hover:text-[#48cae1] transition-colors"
              >
                <Video className="w-4 h-4" />
                Record Screen
              </button>
            )}
            <p className="text-xs text-[var(--muted-foreground)] mt-1.5">
              Max {MAX_RECORD_SECONDS}s. Screen + microphone so you can narrate. Allow mic when prompted.
            </p>
          </div>

          {/* Diagnostics */}
          <div className="rounded-lg border border-[var(--border)] overflow-hidden">
            <button
              type="button"
              onClick={() => setDiagOpen(!diagOpen)}
              className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <span>Auto-collected diagnostics</span>
              {diagOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {diagOpen && diagnostics && (
              <div className="px-4 pb-3 space-y-1.5 border-t border-[var(--border)] pt-3">
                {Object.entries(diagnostics).map(([key, value]) => {
                  if (key === 'recent_errors') {
                    const errors = value as { message: string; source?: string }[]
                    if (!errors.length) return null
                    return (
                      <div key={key}>
                        <span className="text-xs font-medium text-[var(--muted-foreground)]">Recent Errors:</span>
                        {errors.map((err, i) => (
                          <div key={i} className="ml-2 mt-1 text-xs text-red-500 break-all">
                            {err.message}
                            {err.source && <span className="text-[var(--muted-foreground)]"> ({err.source})</span>}
                          </div>
                        ))}
                      </div>
                    )
                  }
                  if (key === 'pages_visited') {
                    const visits = value as { path: string; timestamp: string }[]
                    if (!visits.length) return null
                    return (
                      <div key={key}>
                        <span className="text-xs font-medium text-[var(--muted-foreground)]">
                          Pages Visited ({visits.length}):
                        </span>
                        <div className="ml-2 mt-1 max-h-32 overflow-y-auto space-y-0.5">
                          {visits.map((v, i) => (
                            <div key={i} className="text-xs text-[var(--foreground)] flex gap-2">
                              <span className="text-[var(--muted-foreground)] shrink-0">
                                {new Date(v.timestamp).toLocaleTimeString()}
                              </span>
                              <span className="truncate">{v.path}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={key} className="flex gap-2 text-xs">
                      <span className="text-[var(--muted-foreground)] min-w-[100px]">
                        {key.replace(/_/g, ' ')}:
                      </span>
                      <span className="text-[var(--foreground)] break-all">
                        {String(value)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitTicket.isPending || !subject.trim() || !description.trim()}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all',
              'bg-navy text-white hover:bg-navy/90 disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {submitTicket.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Bug Report'
            )}
          </button>
        </form>
          </>
        )}
      </div>
    </>
  )
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
