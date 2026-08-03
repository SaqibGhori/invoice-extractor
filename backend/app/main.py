import truststore

truststore.inject_into_ssl()

import json
import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAIError
from pydantic import ValidationError

from app.extraction import extract_text_from_pdf
from app.llm_client import extract_invoice, NotAnInvoiceError

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/extract")
async def extract(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    file_bytes = await file.read()

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")

    try:
        text = extract_text_from_pdf(file_bytes)
    except Exception:
        raise HTTPException(status_code=422, detail="Could not read this PDF — it may be corrupted")

    if not text.strip():
        raise HTTPException(
            status_code=422,
            detail="No extractable text found — this looks like a scanned/image PDF, which isn't supported yet",
        )

    try:
        invoice = extract_invoice(text)
    except NotAnInvoiceError:
        raise HTTPException(
            status_code=422,
            detail="This document doesn't appear to be an invoice — please upload an actual invoice or bill",
        )
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=f"Could not extract valid invoice data: {e}")
    except OpenAIError:
        raise HTTPException(status_code=502, detail="The AI service is unavailable right now — please try again in a moment")
    except (RuntimeError, json.JSONDecodeError):
        raise HTTPException(status_code=502, detail="The AI returned an unexpected response — please try again")

    return invoice
