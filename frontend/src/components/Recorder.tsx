import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { errorMessage, toast } from '@/lib/feedback'
import { sfx } from '@/lib/sound'
import { cn } from '@/lib/utils'

interface RecorderProps {
  onDone: (file: File) => void
  compact?: boolean
  disabled?: boolean
  disabledReason?: string
  subtitle?: string
  className?: string
}

/**
 * Reusable browser MediaRecorder voice-note capture button.
 * Supports full intake cards and compact toolbar triggers.
 */
export function Recorder({
  onDone,
  compact = false,
  disabled = false,
  disabledReason,
  subtitle = '12 Indian & regional languages · WebM audio',
  className,
}: RecorderProps) {
  const [recording, setRecording] = useState(false)
  const [secs, setSecs] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearTimer()
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.onstop = null
          recorderRef.current.stop()
        } catch {
          // Ignore stop errors during unmount cleanup
        }
      }
      stopTracks()
    }
  }, [])

  const stop = () => {
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') return
    try {
      rec.stop()
    } catch (e) {
      clearTimer()
      stopTracks()
      setRecording(false)
      setSecs(0)
      recorderRef.current = null
      toast('bad', 'Could not stop recording', errorMessage(e))
    }
  }

  const start = async () => {
    if (disabled || recording) return
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      sfx.reject()
      toast(
        'bad',
        'Voice recording unsupported',
        'This browser does not support MediaRecorder audio capture. Upload an audio file instead.',
      )
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      )
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recorderRef.current = rec
      chunksRef.current = []

      rec.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
      }

      rec.onerror = () => {
        clearTimer()
        stopTracks()
        recorderRef.current = null
        setRecording(false)
        setSecs(0)
        sfx.reject()
        toast('bad', 'Recording failed', 'Audio stream interrupted. Try again or upload a file.')
      }

      rec.onstop = () => {
        clearTimer()
        stopTracks()
        recorderRef.current = null
        setRecording(false)
        setSecs(0)

        const type = rec.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        chunksRef.current = []

        if (blob.size === 0) {
          sfx.reject()
          toast('bad', 'Empty audio capture', 'No audio was recorded. Check microphone input and try again.')
          return
        }

        const ext = type.includes('mp4') ? 'm4a' : 'webm'
        sfx.accept()
        onDone(new File([blob], `client_note_${Date.now()}.${ext}`, { type }))
      }

      rec.start(250)
      setRecording(true)
      setSecs(0)
      sfx.accept()
      timerRef.current = window.setInterval(() => setSecs((s) => s + 1), 1000)
    } catch (e) {
      clearTimer()
      stopTracks()
      recorderRef.current = null
      setRecording(false)
      setSecs(0)
      sfx.reject()
      toast(
        'bad',
        'Microphone unavailable',
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow access or upload an audio file instead.'
          : 'Could not access microphone. Upload an audio file instead.',
      )
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        disabled={disabled && !recording}
        title={disabled && !recording ? disabledReason : undefined}
        onClick={() => (recording ? stop() : void start())}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-[5px] border px-3 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
          recording
            ? 'border-bad/45 bg-bad-50 text-bad'
            : 'border-line bg-surface text-ink hover:border-navy/45 hover:bg-hover',
          className,
        )}
      >
        {recording ? (
          <Square size={12} className="shrink-0 text-bad" />
        ) : (
          <Mic size={12} className="shrink-0 text-navy" />
        )}
        <span>{recording ? `Stop recording (${secs}s)` : 'Record voice note'}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={disabled && !recording}
      title={disabled && !recording ? disabledReason : undefined}
      onClick={() => (recording ? stop() : void start())}
      className={cn(
        'flex items-start gap-3 rounded-[5px] border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        recording
          ? 'border-bad/45 bg-bad-50'
          : 'border-line bg-sunken hover:border-navy/45 hover:bg-hover',
        className,
      )}
    >
      {recording ? (
        <Square size={17} className="mt-0.5 shrink-0 text-bad" />
      ) : (
        <Mic size={17} className="mt-0.5 shrink-0 text-navy" />
      )}
      <div>
        <p className={cn('text-[13px] font-medium', recording ? 'text-bad' : 'text-ink')}>
          {recording ? `Recording (${secs}s) — Stop` : 'Record Voice Note'}
        </p>
        <p className="text-[11px] text-ink-3">{subtitle}</p>
      </div>
    </button>
  )
}
