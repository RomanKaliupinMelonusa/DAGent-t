---
description: "Deterministic infrastructure approval gate — waits for human /dagent approve-infra comment"
---

# Infrastructure Approval Gate

Deterministic pipeline gate that waits for human approval of the Terraform plan before infrastructure is applied. This agent is handled programmatically by the orchestrator and does not run an LLM session.
