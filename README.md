# Invoice Extractor

Upload an invoice PDF, get clean structured data back. Built with React + FastAPI + LLM structured extraction.

## How it works

```
React upload → FastAPI → PDF text extraction (pdfplumber) → LLM (forced tool call) → Pydantic validation (retry on failure) → JSON → results table
```

- **Frontend:** React + TypeScript (Vite) + Tailwind CSS
- **Backend:** Python + FastAPI
- **AI:** Llama 3.3 70B Instruct via DigitalOcean Gradient serverless inference (OpenAI-compatible API), structured output enforced with forced function calling
- **Validation:** Pydantic schema with one self-correcting retry (validation errors are fed back to the model)

## Extracted fields

`vendor_name`, `invoice_number`, `invoice_date`, `due_date`, `currency`, `subtotal`, `tax`, `total`

## Run locally

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp .env.example .env    # then fill in your key
uvicorn app.main:app --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DO_INFERENCE_API_KEY` | backend | DigitalOcean serverless inference key |
| `LLM_MODEL` | backend | Model ID (e.g. `llama3.3-70b-instruct`) |
| `FRONTEND_ORIGIN` | backend | Allowed CORS origin(s), comma-separated |
| `VITE_API_URL` | frontend | Backend base URL (defaults to `http://localhost:8000`) |

## Edge cases handled

- Non-PDF uploads rejected (400)
- Files over 5 MB rejected (413)
- Corrupted/unreadable PDFs (422)
- Scanned/image-only PDFs with no text layer (422)
- LLM service outages return a clean 502 instead of crashing
- Invalid LLM output triggers one self-correcting retry before failing
