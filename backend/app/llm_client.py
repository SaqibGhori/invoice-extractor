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

INVOICE_TOOL = {
    "type": "function",
    "function": {
        "name": "record_invoice",
        "description": "Record the structured fields extracted from an invoice.",
        "parameters": {
            "type": "object",
            "properties": {
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


def extract_invoice(invoice_text: str) -> Invoice:
    raw = _call_llm(invoice_text)
    try:
        return Invoice(**raw)
    except ValidationError as e:
        raw_retry = _call_llm(invoice_text, retry_note=str(e))
        return Invoice(**raw_retry)
