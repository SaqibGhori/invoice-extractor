import { useCallback, useState } from 'react'
import { Client } from '@gradio/client'

interface Invoice {
  vendor_name: string
  invoice_number: string
  invoice_date: string
  due_date: string
  currency: string
  subtotal: number
  tax: number
  total: number
}

const SPACE_URL =
  import.meta.env.VITE_SPACE_URL ?? 'https://silky779sap-invoice-extractor-api.hf.space'

type Status = 'idle' | 'loading' | 'success' | 'error'

const LOADING_STEPS = [
  'Reading your PDF…',
  'Extracting the text…',
  'Asking the model…',
  'Validating the fields…',
]

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<Invoice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const acceptFile = useCallback((f: File | undefined | null) => {
    if (!f) return
    if (f.type !== 'application/pdf') {
      setError('Only PDF files are supported')
      setStatus('error')
      return
    }
    setFile(f)
    setResult(null)
    setError(null)
    setStatus('idle')
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || status === 'loading') return

    setStatus('loading')
    setError(null)
    setLoadingStep(0)
    setElapsed(null)

    const started = performance.now()
    const stepTimer = setInterval(
      () => setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)),
      2500,
    )

    try {
      const client = await Client.connect(SPACE_URL)
      const res = await client.predict('/demo_extract', { pdf_path: file })
      const data = (res.data as unknown[])[0] as Invoice | { error: string }

      if ('error' in data) throw new Error(data.error)

      setElapsed((performance.now() - started) / 1000)
      setResult(data)
      setStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    } finally {
      clearInterval(stepTimer)
    }
  }

  const copyJson = async () => {
    if (!result) return
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-200 antialiased">
      {/* background glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-125 w-200 -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 -left-40 h-100 w-100 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-75 w-125 rounded-full bg-fuchsia-600/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-10 sm:py-16">
        {/* header */}
        <header className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-slate-300 backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Live · Llama 3.3 70B · structured extraction
          </div>
          <h1 className="bg-linear-to-r from-white via-violet-200 to-cyan-200 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
            Invoice Extractor
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400 sm:text-base">
            Drop any invoice PDF and get clean, validated data back in seconds —
            no templates, no manual entry.
          </p>
        </header>

        {/* upload card */}
        <form onSubmit={handleSubmit}>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              acceptFile(e.dataTransfer.files?.[0])
            }}
            className={`group relative rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 sm:p-10 ${
              dragging
                ? 'border-violet-400 bg-violet-500/10 scale-[1.02]'
                : 'border-white/15 bg-white/3 hover:border-white/30 hover:bg-white/5'
            }`}
          >
            <input
              id="file-input"
              type="file"
              accept="application/pdf"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />
            <div className="pointer-events-none">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-linear-to-br from-violet-500/30 to-cyan-500/30 ring-1 ring-white/10">
                <svg className="h-7 w-7 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                </svg>
              </div>
              {file ? (
                <>
                  <p className="font-medium text-white">{file.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {(file.size / 1024).toFixed(0)} KB · click or drop to replace
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-white">
                    Drop your invoice here{' '}
                    <span className="text-violet-300">or browse</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">PDF only · max 5 MB</p>
                </>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={!file || status === 'loading'}
            className="mt-5 w-full rounded-xl bg-linear-to-r from-violet-600 to-cyan-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-violet-900/40 transition-all duration-300 hover:shadow-violet-700/40 hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400 disabled:shadow-none"
          >
            {status === 'loading' ? (
              <span className="inline-flex items-center gap-3">
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                {LOADING_STEPS[loadingStep]}
              </span>
            ) : (
              'Extract data'
            )}
          </button>
        </form>

        {/* error */}
        {status === 'error' && error && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </div>
        )}

        {/* result */}
        {status === 'success' && result && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/4 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-400/30">
                  <svg className="h-4.5 w-4.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">Extraction complete</p>
                  {elapsed !== null && (
                    <p className="text-xs text-slate-400">{elapsed.toFixed(1)}s · 8 fields validated</p>
                  )}
                </div>
              </div>
              <button
                onClick={copyJson}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                {copied ? '✓ Copied' : 'Copy JSON'}
              </button>
            </div>

            <dl className="divide-y divide-white/6">
              {(
                [
                  ['Vendor', result.vendor_name],
                  ['Invoice number', result.invoice_number],
                  ['Invoice date', result.invoice_date],
                  ['Due date', result.due_date],
                  ['Currency', result.currency],
                  ['Subtotal', formatMoney(result.subtotal, result.currency)],
                  ['Tax', formatMoney(result.tax, result.currency)],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <dt className="text-sm text-slate-400">{label}</dt>
                  <dd className="text-right text-sm font-medium text-slate-100">{value}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 bg-linear-to-r from-violet-500/10 to-cyan-500/10 px-5 py-4">
                <dt className="text-sm font-semibold text-white">Total</dt>
                <dd
                  className={`text-right text-lg font-bold tracking-tight ${
                    result.total < 0 ? 'text-red-300' : 'text-emerald-300'
                  }`}
                >
                  {formatMoney(result.total, result.currency)}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {/* footer */}
        <footer className="mt-auto pt-14 text-center text-xs text-slate-500">
          <p>
            Built by Haris ·{' '}
            <a
              href="https://github.com/SaqibGhori/invoice-extractor"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 underline-offset-4 transition hover:text-white hover:underline"
            >
              Source on GitHub
            </a>{' '}
            ·{' '}
            <a
              href="https://huggingface.co/spaces/silky779sap/invoice-extractor-api"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 underline-offset-4 transition hover:text-white hover:underline"
            >
              API on Hugging Face
            </a>
          </p>
        </footer>
      </div>
    </div>
  )
}

export default App
