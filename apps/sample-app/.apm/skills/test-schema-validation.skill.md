---
name: test-schema-validation
command: "cd {appRoot}/backend && npx jest --testPathPattern=schema --verbose"
description: "Run schema validation tests to verify Zod schemas and type exports"
---

# Schema Validation Tests

Run tests that validate shared Zod schemas, type exports, and contract compatibility.

## When to Use

- After defining or updating Zod schemas
- After changing type exports consumed by backend or frontend
- To verify backward compatibility of schema changes

## What It Does

- Executes schema-related test suites
- Validates Zod parse/safeParse behavior against expected inputs
- Confirms inferred TypeScript types match expected contracts
