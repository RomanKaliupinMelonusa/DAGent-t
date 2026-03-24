## Azure Functions v4 Node.js Build Constraints

- esbuild MUST use `format: "cjs"` for Azure Functions v4 worker. ESM format causes `Dynamic require of "X" is not supported` errors at runtime because @azure/functions internals use CJS require() calls.
- All runtime dependencies must be either bundled by esbuild OR listed in backend/package.json `dependencies` (not `devDependencies`). In a monorepo with npm workspace hoisting, packages in root node_modules are NOT available at deploy time.
- Node built-in modules (util, path, fs, etc.) must be in the esbuild `external` array — they are provided by the Node.js runtime on Azure.
- After `npm run build`, verify the output is loadable by running `node -e "require('./dist/src/functions/<name>.js')"` for each function entry point.
