import { useState } from 'react'

interface Props {
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  step?: number | 'any'
  digits?: number
  id?: string
  bad?: boolean
  disabled?: boolean
  label?: string
}

/** Number field that keeps what you type while it is incomplete and only commits valid numbers. */
export default function NumInput({ value, onCommit, min = -Infinity, max = Infinity, step = 'any', digits, id, bad, disabled, label }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (digits === undefined ? String(value) : String(+value.toFixed(digits)))
  const parsed = Number(draft)
  const ok = draft === null || (draft.trim() !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max)
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      value={shown}
      step={step}
      min={Number.isFinite(min) ? min : undefined}
      max={Number.isFinite(max) ? max : undefined}
      disabled={disabled}
      aria-label={label}
      aria-invalid={bad || !ok}
      className={bad || !ok ? 'bad' : undefined}
      onChange={(e) => {
        const v = e.target.value
        setDraft(v)
        const n = Number(v)
        if (v.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onCommit(n)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}
