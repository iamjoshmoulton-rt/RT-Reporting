import { useState, useRef, useEffect, useCallback } from 'react'
import { Pencil, Square, ArrowRight, Type, Undo2, Trash2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const COLORS = [
  { name: 'red', value: '#ef4444' },
  { name: 'yellow', value: '#eab308' },
  { name: 'green', value: '#22c55e' },
  { name: 'blue', value: '#3b82f6' },
  { name: 'white', value: '#ffffff' },
  { name: 'black', value: '#000000' },
]

type Tool = 'draw' | 'rect' | 'arrow' | 'text'
type StrokeWidth = 'thin' | 'thick'

interface Point {
  x: number
  y: number
}

type Annotation =
  | { type: 'freehand'; points: Point[]; color: string; strokeWidth: number }
  | { type: 'rect'; x1: number; y1: number; x2: number; y2: number; color: string; strokeWidth: number }
  | { type: 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string; strokeWidth: number }
  | { type: 'text'; x: number; y: number; text: string; color: string; strokeWidth: number }

export interface ScreenshotEditorProps {
  screenshot: string
  onSave: (editedBase64: string) => void
  onCancel: () => void
}

export function ScreenshotEditor({ screenshot, onSave, onCancel }: ScreenshotEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bgCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawCanvasRef = useRef<HTMLCanvasElement>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [tool, setTool] = useState<Tool>('draw')
  const [color, setColor] = useState(COLORS[0].value)
  const [strokeWidth, setStrokeWidth] = useState<StrokeWidth>('thin')
  const strokePx = strokeWidth === 'thin' ? 2 : 5
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentPoints, setCurrentPoints] = useState<Point[]>([])
  const [rectStart, setRectStart] = useState<Point | null>(null)
  const [arrowStart, setArrowStart] = useState<Point | null>(null)
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null)
  const [textValue, setTextValue] = useState('')
  const scaleRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 })

  const [imgLoaded, setImgLoaded] = useState(false)
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setImgLoaded(true)
    }
    img.src = `data:image/png;base64,${screenshot}`
    setImgLoaded(false)
  }, [screenshot])

  const resizeCanvases = useCallback(() => {
    const container = containerRef.current
    const bg = bgCanvasRef.current
    const draw = drawCanvasRef.current
    if (!container || !bg || !draw || !imgRef.current) return
    const img = imgRef.current
    const cw = container.clientWidth
    const ch = container.clientHeight
    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight, 1)
    const width = Math.floor(img.naturalWidth * scale)
    const height = Math.floor(img.naturalHeight * scale)
    bg.width = width
    bg.height = height
    draw.width = width
    draw.height = height
    setDisplaySize({ w: width, h: height })
    scaleRef.current = { scale, offsetX: 0, offsetY: 0 }
    const ctx = bg.getContext('2d')
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height)
    }
    redrawAnnotations()
  }, [screenshot])

  const redrawAnnotations = useCallback(() => {
    const draw = drawCanvasRef.current
    if (!draw) return
    const ctx = draw.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, draw.width, draw.height)
    const scale = scaleRef.current.scale
    annotations.forEach((ann) => {
      ctx.strokeStyle = ann.color
      ctx.fillStyle = ann.color
      const sw = ann.strokeWidth
      ctx.lineWidth = sw
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (ann.type === 'freehand' && ann.points.length >= 2) {
        ctx.beginPath()
        ctx.moveTo(ann.points[0].x * scale, ann.points[0].y * scale)
        ann.points.slice(1).forEach((p) => ctx.lineTo(p.x * scale, p.y * scale))
        ctx.stroke()
      } else if (ann.type === 'rect') {
        const x = Math.min(ann.x1, ann.x2) * scale
        const y = Math.min(ann.y1, ann.y2) * scale
        const w = Math.abs(ann.x2 - ann.x1) * scale
        const h = Math.abs(ann.y2 - ann.y1) * scale
        ctx.strokeRect(x, y, w, h)
      } else if (ann.type === 'arrow') {
        const x1 = ann.x1 * scale
        const y1 = ann.y1 * scale
        const x2 = ann.x2 * scale
        const y2 = ann.y2 * scale
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        const angle = Math.atan2(y2 - y1, x2 - x1)
        const headLen = 12
        ctx.beginPath()
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6))
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6))
        ctx.stroke()
      } else if (ann.type === 'text' && ann.text) {
        ctx.font = `${Math.max(14, 16 * scale)}px sans-serif`
        ctx.fillText(ann.text, ann.x * scale, ann.y * scale)
      }
    })
    if (currentPoints.length >= 2) {
      ctx.strokeStyle = color
      ctx.lineWidth = strokePx
      ctx.beginPath()
      ctx.moveTo(currentPoints[0].x * scale, currentPoints[0].y * scale)
      currentPoints.slice(1).forEach((p) => ctx.lineTo(p.x * scale, p.y * scale))
      ctx.stroke()
    }
    if (rectStart) {
      const last = currentPoints[0]
      if (last) {
        ctx.strokeStyle = color
        ctx.lineWidth = strokePx
        const x = Math.min(rectStart.x, last.x) * scale
        const y = Math.min(rectStart.y, last.y) * scale
        const w = Math.abs(last.x - rectStart.x) * scale
        const h = Math.abs(last.y - rectStart.y) * scale
        ctx.strokeRect(x, y, w, h)
      }
    }
    if (arrowStart && currentPoints.length) {
      const last = currentPoints[0]
      if (last) {
        ctx.strokeStyle = color
        ctx.lineWidth = strokePx
        const x1 = arrowStart.x * scale
        const y1 = arrowStart.y * scale
        const x2 = last.x * scale
        const y2 = last.y * scale
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        const angle = Math.atan2(y2 - y1, x2 - x1)
        const headLen = 12
        ctx.beginPath()
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6))
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6))
        ctx.stroke()
      }
    }
  }, [annotations, currentPoints, rectStart, arrowStart, color, strokePx])

  useEffect(() => {
    redrawAnnotations()
  }, [redrawAnnotations])

  useEffect(() => {
    if (!imgLoaded) return
    resizeCanvases()
    const ro = new ResizeObserver(resizeCanvases)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [resizeCanvases, screenshot, imgLoaded])

  const getCoords = (e: React.PointerEvent): Point | null => {
    const draw = drawCanvasRef.current
    if (!draw || !imgRef.current) return null
    const rect = draw.getBoundingClientRect()
    const scale = scaleRef.current.scale
    const canvasX = (e.clientX - rect.left) * (draw.width / rect.width)
    const canvasY = (e.clientY - rect.top) * (draw.height / rect.height)
    return { x: canvasX / scale, y: canvasY / scale }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (textInput) return
    const pt = getCoords(e)
    if (!pt) return
    if (tool === 'draw') {
      setIsDrawing(true)
      setCurrentPoints([pt])
    } else if (tool === 'rect') {
      setRectStart(pt)
      setCurrentPoints([pt])
    } else if (tool === 'arrow') {
      setArrowStart(pt)
      setCurrentPoints([pt])
    } else if (tool === 'text') {
      setTextInput({ x: pt.x, y: pt.y })
      setTextValue('')
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const pt = getCoords(e)
    if (!pt) return
    if (tool === 'draw' && isDrawing) {
      setCurrentPoints((prev) => [...prev, pt])
    } else if ((tool === 'rect' && rectStart) || (tool === 'arrow' && arrowStart)) {
      setCurrentPoints([pt])
    }
  }

  const handlePointerUp = () => {
    if (tool === 'draw' && isDrawing) {
      if (currentPoints.length >= 2) {
        setAnnotations((prev) => [
          ...prev,
          { type: 'freehand', points: [...currentPoints], color, strokeWidth: strokePx },
        ])
      }
      setCurrentPoints([])
      setIsDrawing(false)
    } else if (tool === 'rect' && rectStart && currentPoints.length) {
      const end = currentPoints[0]
      setAnnotations((prev) => [
        ...prev,
        { type: 'rect', x1: rectStart.x, y1: rectStart.y, x2: end.x, y2: end.y, color, strokeWidth: strokePx },
      ])
      setRectStart(null)
      setCurrentPoints([])
    } else if (tool === 'arrow' && arrowStart && currentPoints.length) {
      const end = currentPoints[0]
      setAnnotations((prev) => [
        ...prev,
        { type: 'arrow', x1: arrowStart.x, y1: arrowStart.y, x2: end.x, y2: end.y, color, strokeWidth: strokePx },
      ])
      setArrowStart(null)
      setCurrentPoints([])
    }
  }

  const commitText = () => {
    if (textInput && textValue.trim()) {
      setAnnotations((prev) => [
        ...prev,
        { type: 'text', x: textInput.x, y: textInput.y, text: textValue.trim(), color, strokeWidth: strokePx },
      ])
    }
    setTextInput(null)
    setTextValue('')
  }

  const undo = () => {
    setAnnotations((prev) => prev.slice(0, -1))
    setCurrentPoints([])
    setRectStart(null)
    setArrowStart(null)
  }

  const clearAll = () => {
    setAnnotations([])
    setCurrentPoints([])
    setRectStart(null)
    setArrowStart(null)
    setTextInput(null)
  }

  const handleDone = () => {
    const img = imgRef.current
    if (!img) return
    const scale = scaleRef.current.scale
    const temp = document.createElement('canvas')
    temp.width = img.naturalWidth
    temp.height = img.naturalHeight
    const ctx = temp.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0)
    const lineScale = 1 / scale
    annotations.forEach((ann) => {
      ctx.strokeStyle = ann.color
      ctx.fillStyle = ann.color
      const lw = (ann.type === 'freehand' || ann.type === 'rect' || ann.type === 'arrow')
        ? (ann as { strokeWidth: number }).strokeWidth * lineScale
        : 2 * lineScale
      ctx.lineWidth = lw
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (ann.type === 'freehand' && ann.points.length >= 2) {
        ctx.beginPath()
        ctx.moveTo(ann.points[0].x, ann.points[0].y)
        ann.points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y))
        ctx.stroke()
      } else if (ann.type === 'rect') {
        const x = Math.min(ann.x1, ann.x2)
        const y = Math.min(ann.y1, ann.y2)
        const w = Math.abs(ann.x2 - ann.x1)
        const h = Math.abs(ann.y2 - ann.y1)
        ctx.strokeRect(x, y, w, h)
      } else if (ann.type === 'arrow') {
        ctx.beginPath()
        ctx.moveTo(ann.x1, ann.y1)
        ctx.lineTo(ann.x2, ann.y2)
        ctx.stroke()
        const angle = Math.atan2(ann.y2 - ann.y1, ann.x2 - ann.x1)
        const headLen = 15 * lineScale
        ctx.beginPath()
        ctx.moveTo(ann.x2, ann.y2)
        ctx.lineTo(ann.x2 - headLen * Math.cos(angle - Math.PI / 6), ann.y2 - headLen * Math.sin(angle - Math.PI / 6))
        ctx.moveTo(ann.x2, ann.y2)
        ctx.lineTo(ann.x2 - headLen * Math.cos(angle + Math.PI / 6), ann.y2 - headLen * Math.sin(angle + Math.PI / 6))
        ctx.stroke()
      } else if (ann.type === 'text' && ann.text) {
        ctx.font = `${16 * lineScale}px sans-serif`
        ctx.fillText(ann.text, ann.x, ann.y)
      }
    })
    const dataUrl = temp.toDataURL('image/png')
    const base64 = dataUrl.split(',')[1]
    if (base64) onSave(base64)
  }

  return (
    <div className="flex flex-col h-full bg-[var(--card)]">
      <div className="flex items-center gap-1 p-2 border-b border-[var(--border)] flex-wrap">
        <button
          type="button"
          onClick={() => setTool('draw')}
          className={cn(
            'p-2 rounded-lg border transition-colors',
            tool === 'draw' ? 'border-[#48cae1] bg-[#48cae1]/10' : 'border-[var(--border)] hover:bg-[var(--muted)]'
          )}
          title="Draw"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setTool('rect')}
          className={cn(
            'p-2 rounded-lg border transition-colors',
            tool === 'rect' ? 'border-[#48cae1] bg-[#48cae1]/10' : 'border-[var(--border)] hover:bg-[var(--muted)]'
          )}
          title="Rectangle"
        >
          <Square className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setTool('arrow')}
          className={cn(
            'p-2 rounded-lg border transition-colors',
            tool === 'arrow' ? 'border-[#48cae1] bg-[#48cae1]/10' : 'border-[var(--border)] hover:bg-[var(--muted)]'
          )}
          title="Arrow"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setTool('text')}
          className={cn(
            'p-2 rounded-lg border transition-colors',
            tool === 'text' ? 'border-[#48cae1] bg-[#48cae1]/10' : 'border-[var(--border)] hover:bg-[var(--muted)]'
          )}
          title="Text"
        >
          <Type className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1 ml-1">
          {COLORS.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setColor(c.value)}
              className={cn(
                'w-6 h-6 rounded-full border-2 transition-transform',
                color === c.value ? 'border-[#48cae1] scale-110' : 'border-[var(--border)]'
              )}
              style={{ backgroundColor: c.value }}
              title={c.name}
            />
          ))}
        </div>
        <select
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(e.target.value as StrokeWidth)}
          className="ml-1 px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] text-sm"
        >
          <option value="thin">Thin</option>
          <option value="thick">Thick</option>
        </select>
        <button
          type="button"
          onClick={undo}
          disabled={annotations.length === 0}
          className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] disabled:opacity-50 ml-1"
          title="Undo"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={annotations.length === 0}
          className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] disabled:opacity-50"
          title="Clear all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div ref={containerRef} className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden">
        <div
          className="relative shrink-0"
          style={{ width: displaySize.w, height: displaySize.h }}
        >
          <canvas
            ref={bgCanvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ pointerEvents: 'none' }}
          />
          <canvas
            ref={drawCanvasRef}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{ touchAction: 'none' }}
          />
          {textInput && (
            <div
              className="absolute flex items-center gap-1"
              style={{
                left: Math.min(textInput.x * scaleRef.current.scale, displaySize.w - 100),
                top: Math.min(textInput.y * scaleRef.current.scale, displaySize.h - 32),
              }}
            >
              <input
                type="text"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitText()
                  if (e.key === 'Escape') {
                    setTextInput(null)
                    setTextValue('')
                  }
                }}
                onBlur={commitText}
                autoFocus
                placeholder="Type..."
                className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] text-sm min-w-[80px]"
                style={{ color }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 p-3 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDone}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-navy text-white hover:bg-navy/90"
        >
          <Check className="w-4 h-4" />
          Done
        </button>
      </div>
    </div>
  )
}
