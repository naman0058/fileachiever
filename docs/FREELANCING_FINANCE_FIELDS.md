# Freelancing finance field audit (Phase 8)

**Source of truth for pricing edits:** `leads` row + `POST /freelancing/update-field` (converted leads grid).  
**Ops finance ledger:** `lead_client_payments` / `lead_agent_payments` (partial payments; does not replace historical columns).

## Per-field semantics (not interchangeable)

| Field | Meaning | Currency | Notes |
|--------|---------|----------|--------|
| `lead_price` | **Lead price / total contracted value (client)** | INR (₹ in UI) | Sum shown as “Total contracted value”; not agent cost. |
| `agent_price` | **Agreed agent cost** | INR | Used for agent payable calculations. |
| `pakistani_price` | **PKR track (project price in Pakistan)** | PKR | Separate from INR; never added to `lead_price` or `advance_amount`. |
| `advance_amount` | **Client amount received (INR), cumulative** | INR | Legacy + sheet sync; ops payments **increment** this for INR partials. |
| `is_payment_received` | **Legacy boolean: client fully paid** | — | Toggle on converted leads; may lag partial ledger until balance clears. |
| `is_agent_payment_done` | **Legacy boolean: agent fully paid** | — | Toggle on converted leads; reconciled against agent payment sum. |
| `is_project_done` | Internal completion | — | **Not** client payment or delivery. |

There is **no** separate `project_price` column — in UI copy, “project price” refers to `lead_price` unless PKR is explicitly labeled.

## Derived metrics (ops finance)

| Metric | Formula | Label in UI |
|--------|---------|-------------|
| Client outstanding (INR) | `max(lead_price - client_received_inr, 0)` | Client outstanding |
| Client received (INR) | `advance_amount` (kept in sync with INR ledger sum) | Payments received |
| Agent paid (INR) | `SUM(lead_agent_payments.amount)` where currency=INR | Agent payments made |
| Agent outstanding | `max(agent_price - agent_paid, 0)` | Agent payables |
| Gross project profit | `lead_price - agent_price` (per row); aggregated in range | **Gross project profit** (not net profit) |

## Invoicing

No dedicated invoicing module was found in the freelancing ops stack — **Invoiced value** is shown as N/A unless extended later.

## Sync

Sheet sync (`INSERT IGNORE`) may set `lead_price`, `agent_price`, `advance_amount`, `pakistani_price` on **new rows only** — never overwrites existing financials.
