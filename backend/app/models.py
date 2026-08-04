from pydantic import BaseModel, Field


class Invoice(BaseModel):
    vendor_name: str
    invoice_number: str
    invoice_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    due_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    subtotal: float
    tax: float
    total: float
