import { RotateCcw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { btn, input, overline } from '../ui'

const inputClass = input

interface FieldShellProps {
  label: string
  hint?: string
  /** The value the app would generate. When it differs from the current one a reset button appears. */
  auto?: { value: string | number | undefined; current: string | number | undefined; onReset: () => void }
  required?: boolean
  children: ReactNode
}

export function FieldShell({ label, hint, auto, required, children }: FieldShellProps) {
  const isAuto = auto !== undefined && auto.value !== undefined && String(auto.value) === String(auto.current)
  const canReset = auto !== undefined && auto.value !== undefined && !isAuto
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-on-surface-variant">
          {label}
          {required && <span className="text-error"> *</span>}
        </span>
        {isAuto && <span className="rounded border border-accent-fg/30 bg-accent/10 px-1.5 text-[10px] leading-4 font-medium text-accent-fg" title="Filled in for you">auto</span>}
        {canReset && (
          <button
            type="button"
            onClick={auto.onReset}
            title={`Reset to the generated value (${auto.value})`}
            className="flex items-center gap-1 rounded px-1 text-[10px] text-on-surface-variant hover:text-accent-fg"
          >
            <RotateCcw className="size-3" aria-hidden />
            auto
          </button>
        )}
      </div>
      {children}
      {hint && <p className="text-[11px] text-on-surface-variant">{hint}</p>}
    </div>
  )
}

interface TextFieldProps extends Omit<FieldShellProps, 'children'> {
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  placeholder?: string
  multiline?: boolean
  autoFocus?: boolean
}

export function TextField({ value, onChange, onCommit, placeholder, multiline, autoFocus, ...shell }: TextFieldProps) {
  return (
    <FieldShell {...shell} auto={shell.auto && { ...shell.auto, current: value }}>
      {multiline ? (
        <textarea value={value} rows={2} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onBlur={onCommit} className={`${inputClass} h-auto py-1.5 leading-snug`} />
      ) : (
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className={inputClass}
        />
      )}
    </FieldShell>
  )
}

interface NumberFieldProps extends Omit<FieldShellProps, 'children'> {
  value: number | undefined
  onChange: (value: number) => void
  onCommit: () => void
  unit?: string
  step?: number
}

export function NumberField({ value, onChange, onCommit, unit, ...shell }: NumberFieldProps) {
  // Keep what the user is typing ("1.", "-") until it parses; follow outside changes otherwise.
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => {
    if (Number(text) !== value) setText(value === undefined ? '' : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <FieldShell {...shell} auto={shell.auto && { ...shell.auto, current: value }}>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const n = Number(e.target.value)
            if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n)
          }}
          onBlur={onCommit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className={`${inputClass} tabular-nums`}
        />
        {unit && <span className="shrink-0 text-[11px] text-on-surface-variant">{unit}</span>}
      </div>
    </FieldShell>
  )
}

interface SelectFieldProps<T extends string> extends Omit<FieldShellProps, 'children'> {
  value: T
  options: { id: T; label: string }[]
  onChange: (value: T) => void
}

export function SelectField<T extends string>({ value, options, onChange, ...shell }: SelectFieldProps<T>) {
  return (
    <FieldShell {...shell} auto={shell.auto && { ...shell.auto, current: value }}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className={inputClass}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

export function CheckField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-xs text-on-surface">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-3.5" />
      <span>
        {label}
        {hint && <span className="block text-[11px] text-on-surface-variant">{hint}</span>}
      </span>
    </label>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-outline-variant pt-4 first:border-t-0 first:pt-0">
      <h3 className={overline}>{title}</h3>
      {children}
    </section>
  )
}

export function ReadOnly({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-xs">
      <span className="shrink-0 text-on-surface-variant">{label}</span>
      <span className="text-right text-on-surface tabular-nums">{children}</span>
    </div>
  )
}

export const buttonClass = btn
