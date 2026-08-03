import json
import os
from openai import OpenAI
from pydantic import ValidationError

from app.models import Invoice

client = OpenAI(
    api_key=os.environ["DO_INFERENCE_API_KEY"],
    base_url="https://inference.do-ai.run/v1",
    timeout=60.0,
    max_retries=1,
)

MODEL = os.environ["LLM_MODEL"]

class NotAnInvoiceError(Exception):
    pass


INVOICE_TOOL = {
    "type": "function",
    "function": {
        "name": "record_invoice",
        "description": (
            "Record the structured fields extracted from an invoice. "
            "If the document is NOT an invoice (e.g. a brochure, price list, resume, letter), "
            "set is_invoice to false and use empty/zero values for the other fields — "
            "never invent values that are not present in the document."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "is_invoice": {
                    "type": "boolean",
                    "description": "true only if the document is actually an invoice or bill requesting payment",
                },
                "vendor_name": {"type": "string"},
                "invoice_number": {"type": "string"},
                "invoice_date": {"type": "string", "description": "ISO 8601 format, YYYY-MM-DD"},
                "due_date": {"type": "string", "description": "ISO 8601 format, YYYY-MM-DD"},
                "currency": {"type": "string", "description": "ISO 4217 currency code, e.g. USD"},
                "subtotal": {"type": "number"},
                "tax": {"type": "number"},
                "total": {"type": "number"},
            },
            "required": [
                "is_invoice",
                "vendor_name",
                "invoice_number",
                "invoice_date",
                "due_date",
                "currency",
                "subtotal",
                "tax",
                "total",
            ],
        },
    },
}


def _call_llm(invoice_text: str, retry_note: str = "") -> dict:
    prompt = f"Extract the invoice fields from this document text:\n\n{invoice_text}"
    if retry_note:
        prompt += f"\n\nYour previous attempt was invalid: {retry_note}\nPlease correct it."

    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=1024,
        tools=[INVOICE_TOOL],
        tool_choice={"type": "function", "function": {"name": "record_invoice"}},
        messages=[{"role": "user", "content": prompt}],
    )

    tool_calls = response.choices[0].message.tool_calls
    if not tool_calls:
        raise RuntimeError("Model did not return a tool call")

    return json.loads(tool_calls[0].function.arguments)


def _to_invoice(raw: dict) -> Invoice:
    if not raw.pop("is_invoice", False):
        raise NotAnInvoiceError("Document is not an invoice")
    return Invoice(**raw)


def extract_invoice(invoice_text: str) -> Invoice:
    raw = _call_llm(invoice_text)
    try:
        return _to_invoice(raw)
    except ValidationError as e:
        raw_retry = _call_llm(invoice_text, retry_note=str(e))
        return _to_invoice(raw_retry)
