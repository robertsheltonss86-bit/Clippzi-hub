---
name: OpenAPI codegen (orval)
description: Pitfalls when editing lib/api-spec/openapi.yaml and running codegen.
---

Codegen command: `pnpm --filter @workspace/api-spec run codegen` (runs orval then `typecheck:libs`).

**Rule 1:** orval hard-fails ("Ref not found: #/components/schemas/X") if any `$ref` points to a schema that does not exist. There is no shared `SuccessResponse` schema in this spec — for simple `{ success: boolean }` style 200s, write the response schema inline rather than referencing a shared one.

**How to apply:** after adding paths, grep that every `$ref` target is actually defined under `components/schemas` before running codegen.
