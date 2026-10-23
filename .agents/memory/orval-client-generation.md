---
name: Orval client generation
description: Runtime and TypeScript compatibility details for generated API clients in this workspace.
---

For date-only values sent in URL query parameters, define the OpenAPI parameter as a plain string and validate `YYYY-MM-DD` at the API boundary. Orval converts query parameters marked `format: date` to Zod `date()`, which rejects the strings browsers send in URLs.

**Why:** Generated query validation must match the wire format. A mismatch makes valid date filters fail before route logic runs.

**How to apply:** Keep date formats on JSON request/response fields where appropriate, but omit `format: date` from query parameters and validate their calendar format in the route. If generated client code uses `Headers.entries()`, include `dom.iterable` in that package's TypeScript libraries.
