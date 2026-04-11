---
name: dev-local
command: "cd {appRoot} && npm start"
description: "Start the PWA Kit local development server on port 3000"
---

# Local Development Server

Start the PWA Kit development server with hot reload.

## When to Use

- To preview storefront changes locally
- Before running Playwright E2E tests (webServer config handles this automatically)
- To verify SSR rendering works correctly

## What It Does

- Starts an Express server with SSR rendering
- Serves the storefront at `http://localhost:3000`
- Proxies Commerce API requests through `/mobify/proxy/api`
- Enables hot module replacement for development
