import json
import os
import re
from openai import OpenAI
from pydantic import ValidationError

from app.models import Invoice

client = OpenAI(
    api_key=os.environ["GROQ_API_KEY"],
    base_url="https://api.groq.com/openai/v1",
    timeout=60.0,
    max_retries=1,
)

MODEL = os.environ["LLM_MODEL"]

# Coarse first-pass cap before any API call. Tokens-per-char varies wildly by
# script (Arabic/CJK can run ~1 token/char vs ~4 chars/token for English), so
# this is just a sanity ceiling - the real fit happens in _call_llm_with_shrink,
# which reacts to Groq's actual reported token count.
MAX_INVOICE_TEXT_CHARS = 20000

RATE_LIMIT_PATTERN = re.compile(r"Limit (\d+), Requested (\d+)")

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
                "invoice_date": {
                    "type": "string",
                    "description": "ISO 8601 format YYYY-MM-DD, e.g. 2026-03-20. Never use formats like 20-Mar-26.",
                },
                "due_date": {
                    "type": "string",
                    "description": "ISO 8601 format YYYY-MM-DD. Use the payment/due date shown on the invoice.",
                },
                "currency": {
                    "type": "string",
                    "description": (
                        "ISO 4217 code of the currency the invoice totals are stated in "
                        "(e.g. the currency named next to the total or net payable amount). "
                        "Ignore currencies mentioned in bank-account or payment-instruction fine print."
                    ),
                },
                "subtotal": {
                    "type": "number",
                    "description": "Amount before tax/VAT.",
                },
                "tax": {
                    "type": "number",
                    "description": "Total tax/VAT amount. Use 0 if the invoice shows no tax.",
                },
                "total": {
                    "type": "number",
                    "description": (
                        "The final payable amount of the invoice. If the document shows a "
                        "'Net Payable' or 'Amount Due' figure, use exactly that value — it may be "
                        "negative for returns/credits."
                    ),
                },
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

    # Groq occasionally emits a malformed tool call (documented quirk, not an
    # outage) - one quiet retry before letting the error surface, same idea as
    # the Pydantic-validation retry below.
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = client.chat.completions.create(
                model=MODEL,
                max_tokens=1024,
                temperature=0,
                tools=[INVOICE_TOOL],
                tool_choice={"type": "function", "function": {"name": "record_invoice"}},
                messages=[{"role": "user", "content": prompt}],
            )
            tool_calls = response.choices[0].message.tool_calls
            if not tool_calls:
                raise RuntimeError("Model did not return a tool call")
            return json.loads(tool_calls[0].function.arguments)
        except Exception as e:
            last_error = e
    raise last_error


def _to_invoice(raw: dict) -> Invoice:
    if not raw.pop("is_invoice", False):
        raise NotAnInvoiceError("Document is not an invoice")
    return Invoice(**raw)


def _truncate_middle(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    # Invoice headers (vendor, invoice #) live near the top; totals live near
    # the bottom - keep both ends and drop the (usually line-item-heavy) middle.
    head_chars = max_chars * 2 // 3
    tail_chars = max_chars - head_chars
    return (
        text[:head_chars]
        + "\n\n[... middle of document omitted for length ...]\n\n"
        + text[-tail_chars:]
    )


def _call_llm_with_shrink(invoice_text: str, retry_note: str = "") -> dict:
    text = invoice_text
    last_error: Exception | None = None
    for _ in range(3):
        try:
            return _call_llm(text, retry_note=retry_note)
        except Exception as e:
            match = RATE_LIMIT_PATTERN.search(str(e))
            if not match:
                raise
            limit, requested = int(match.group(1)), int(match.group(2))
            # 0.85 safety margin: the retry's own overhead (prompt wrapper,
            # tool schema) isn't part of this ratio, so undershoot a bit.
            new_len = max(1000, int(len(text) * (limit / requested) * 0.85))
            if new_len >= len(text):
                raise
            text = _truncate_middle(text, new_len)
            last_error = e
    raise last_error


def extract_invoice(invoice_text: str) -> Invoice:
    invoice_text = _truncate_middle(invoice_text, MAX_INVOICE_TEXT_CHARS)
    raw = _call_llm_with_shrink(invoice_text)
    try:
        return _to_invoice(raw)
    except ValidationError as e:
        raw_retry = _call_llm_with_shrink(invoice_text, retry_note=str(e))
        return _to_invoice(raw_retry)
