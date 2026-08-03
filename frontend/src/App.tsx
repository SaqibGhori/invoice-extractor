import { useState } from 'react'
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

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<Invoice | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setStatus('loading')
    setError(null)

    try {
      const client = await Client.connect(SPACE_URL)
      const res = await client.predict('/demo_extract', { pdf_path: file })
      const data = (res.data as unknown[])[0] as Invoice | { error: string }

      if ('error' in data) {
        throw new Error(data.error)
      }
      setResult(data)
      setStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-16 px-4">
      <h1 className="text-3xl font-semibold text-gray-900 mb-8">Invoice Extractor</h1>

      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4 mb-10">
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-gray-900 file:text-white file:cursor-pointer"
        />
        <button
          type="submit"
          disabled={!file || status === 'loading'}
          className="px-6 py-2 rounded-md bg-gray-900 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {status === 'loading' ? 'Extracting...' : 'Extract'}
        </button>
      </form>

      {status === 'error' && <p className="text-red-600 mb-6">{error}</p>}

      {status === 'success' && result && (
        <table className="border-collapse w-full max-w-md text-left">
          <tbody>
            {Object.entries(result).map(([key, value]) => (
              <tr key={key} className="border-b border-gray-200">
                <td className="py-2 pr-4 font-medium text-gray-600 capitalize">
                  {key.replace(/_/g, ' ')}
                </td>
                <td className="py-2 text-gray-900">{String(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default App
