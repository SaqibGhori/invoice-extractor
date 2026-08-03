from pydantic import BaseModel


class Invoice(BaseModel):
    vendor_name: str
    invoice_number: str
    invoice_date: str
    due_date: str
    currency: str
    subtotal: float
    tax: float
    total: float
