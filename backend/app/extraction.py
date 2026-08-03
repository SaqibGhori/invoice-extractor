import pdfplumber
from io import BytesIO


def extract_text_from_pdf(file_bytes: bytes) -> str:
    with pdfplumber.open(BytesIO(file_bytes)) as pdf:
        pages_text = [page.extract_text() or "" for page in pdf.pages]
    return "\n".join(pages_text)
