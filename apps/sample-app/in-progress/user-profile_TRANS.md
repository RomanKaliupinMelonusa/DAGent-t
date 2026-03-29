# Transition Log — user-profile

## Workflow
- **Type:** Full-Stack
- **Started:** 2026-03-29
- **Deployed URL:** https://github.com/RomanKaliupinMelonusa/DAGent-t/pull/13

## Implementation Notes
Draft PR #13 created — awaiting Terraform plan

## Checklist
### Infrastructure (Wave 1)
- [x] Development Complete — Schemas (@schema-dev)
- [x] Infrastructure Written — Terraform (@infra-architect)
- [x] Infra Code Pushed to Origin (@deploy-manager)
- [x] Draft PR Created (@pr-creator)
- [ ] Infra Plan CI Passed (@deploy-manager)
### Approval Gate
- [ ] Infra Approval Received (null)
- [ ] Infra Outputs Captured — Interfaces Written (@infra-handoff)
### Pre-Deploy (Wave 2)
- [ ] Development Complete — Backend (@backend-dev)
- [ ] Development Complete — Frontend (@frontend-dev)
- [ ] Unit Tests Passed — Backend (@backend-test)
- [ ] Unit Tests Passed — Frontend (@frontend-ui-test)
### Deploy
- [ ] App Code Pushed to Origin (@deploy-manager)
- [ ] App CI Workflows Passed (@deploy-manager)
### Post-Deploy
- [ ] Integration Tests Passed (@backend-test)
- [ ] Live UI Validated (@frontend-ui-test)
### Finalize
- [ ] Dead Code Eliminated (@code-cleanup)
- [ ] Docs Updated & Archived (@docs-expert)
- [ ] PR Published & Ready for Review (@pr-creator)

## Error Log
### 2026-03-29T02:05:23.981Z — poll-infra-plan
DOMAIN: backend
── Run 23699111071 ──────────────────────────────────────────────
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1242803Z     [7m81[0m     expect(ctx.log).toHaveBeenCalledWith("Hello endpoint called with name=Bob");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1243268Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1244712Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m84[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1245746Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1245990Z     [7m84[0m   it("logs the request with default name", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1246345Z     [7m  [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1246988Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m90[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1247638Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1247990Z     [7m90[0m     expect(ctx.log).toHaveBeenCalledWith(
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1248348Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1249815Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m95[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1251029Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1251328Z     [7m95[0m   it("returns 400 when name exceeds 100 characters", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1251716Z     [7m  [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1252364Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m102[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1252802Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1252996Z     [7m102[0m     expect(result.status).toBe(400);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1253329Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1253980Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m103[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1254418Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1254605Z     [7m103[0m     expect(result.jsonBody).toEqual({
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1254936Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1256372Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m109[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1258732Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1259107Z     [7m109[0m   it("accepts name with exactly 100 characters", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1259512Z     [7m   [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1260188Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m116[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1260643Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1260836Z     [7m116[0m     expect(result.status).toBe(200);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1261180Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1261842Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m117[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1262278Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1262579Z     [7m117[0m     expect(result.jsonBody.message).toBe(`Hello, ${maxName}!`);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1263001Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1264455Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m120[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1265492Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1265749Z     [7m120[0m   it("handles special characters in name", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1266111Z     [7m   [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1266758Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m126[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1267200Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1267387Z     [7m126[0m     expect(result.status).toBe(200);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1268013Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1268679Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m127[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1269114Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1269432Z     [7m127[0m     expect(result.jsonBody.message).toBe("Hello, O'Brien & Co.!");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1269863Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1271331Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m130[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1272363Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1272634Z     [7m130[0m   it("handles empty string name (uses default)", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1273023Z     [7m   [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1273671Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m139[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1274688Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1274937Z     [7m139[0m     expect(result.status).toBe(200);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1275273Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1275949Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m141[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1276401Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1276647Z     [7m141[0m     expect(result.jsonBody.message).toBe("Hello, !");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1277032Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1277184Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1887780Z ts-jest[config] (WARN) [94mmessage[0m[90m TS151002: [0mUsing hybrid module kind (Node16/18/Next) is only supported in "isolatedModules: true". Please set "isolatedModules: true" in your tsconfig.json. To disable this message, you can set "diagnostics.ignoreCodes" to include 151002 in your ts-jest config. See more at https://kulshekhar.github.io/ts-jest/docs/getting-started/options/diagnostics
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1918203Z FAIL src/functions/__tests__/smoke.integration.test.ts
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1919270Z   ● Test suite failed to run
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1919544Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1922090Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m11[0m:[93m44[0m - [91merror[0m[90m TS2593: [0mCannot find name 'describe'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1923874Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1924402Z     [7m11[0m   process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1925211Z     [7m  [0m [91m                                           ~~~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1928244Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m11[0m:[93m55[0m - [91merror[0m[90m TS2593: [0mCannot find name 'describe'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1930153Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1930806Z     [7m11[0m   process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1931886Z     [7m  [0m [91m                                                      ~~~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1934995Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m39[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1937135Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1938017Z     [7m39[0m   it("returns 200 with default greeting when no name provided", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1938939Z     [7m  [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1940385Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m41[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1941360Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1941774Z     [7m41[0m     expect(res.status).toBe(200);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1942475Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1944009Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m44[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1945078Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1945561Z     [7m44[0m     expect(body.message).toBe("Hello, World!");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1946346Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1948158Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m44[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1949262Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1949738Z     [7m44[0m     expect(body.message).toBe("Hello, World!");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1951056Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1952648Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m45[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1953687Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1954136Z     [7m45[0m     expect(body.timestamp).toBeDefined();
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1954895Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1956447Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m45[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1957751Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1958254Z     [7m45[0m     expect(body.timestamp).toBeDefined();
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1959017Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1960650Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m47[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1961674Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1962385Z     [7m47[0m     expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1963638Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1965225Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m47[0m:[93m21[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1966354Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1967095Z     [7m47[0m     expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1968283Z     [7m  [0m [91m                    ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1969927Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m47[0m:[93m57[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1970986Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1971702Z     [7m47[0m     expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1972900Z     [7m  [0m [91m                                                        ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1976392Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m50[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1978942Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1979736Z     [7m50[0m   it("returns 200 with custom greeting when name is provided", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1980650Z     [7m  [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1982171Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m52[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1983220Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1983639Z     [7m52[0m     expect(res.status).toBe(200);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1984362Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1985940Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m55[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1987022Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1987765Z     [7m55[0m     expect(body.message).toBe("Hello, IntegrationTest!");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1988660Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1990334Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m55[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1991438Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1992024Z     [7m55[0m     expect(body.message).toBe("Hello, IntegrationTest!");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1992871Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1994448Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m56[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1995504Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1995982Z     [7m56[0m     expect(body.timestamp).toBeDefined();
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1996730Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1998892Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m56[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2000046Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2000496Z     [7m56[0m     expect(body.timestamp).toBeDefined();
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2001265Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2004686Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m59[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2007104Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2007960Z     [7m59[0m   it("returns 400 when name exceeds 100 characters", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2008853Z     [7m  [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2010381Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m62[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2011688Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2012144Z     [7m62[0m     expect(res.status).toBe(400);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2012826Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2014404Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m65[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2015424Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2016085Z     [7m65[0m     expect(body.error).toBe("INVALID_INPUT");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2016917Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2019164Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m65[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2020305Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2020811Z     [7m65[0m     expect(body.error).toBe("INVALID_INPUT");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2021641Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2023225Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m66[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2024274Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2024808Z     [7m66[0m     expect(body.message).toContain("100 characters");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2025650Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2027213Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m66[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2028676Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2029216Z     [7m66[0m     expect(body.message).toContain("100 characters");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2030047Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2033344Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m75[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2035678Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2036549Z     [7m75[0m   it("returns 200 with token and displayName for valid demo credentials", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2037906Z     [7m  [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2039465Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m81[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2040531Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2040941Z     [7m81[0m     expect(res.status).toBe(200);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2041612Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2043201Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m84[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2044297Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2044721Z     [7m84[0m     expect(body.token).toBeDefined();
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2045468Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2047096Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m84[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2048671Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2049132Z     [7m84[0m     expect(body.token).toBeDefined();
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2049897Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2051522Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m85[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2052562Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2053058Z     [7m85[0m     expect(typeof body.token).toBe("string");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2053862Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2055491Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m85[0m:[93m19[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2056598Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2057106Z     [7m85[0m     expect(typeof body.token).toBe("string");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2058113Z     [7m  [0m [91m                  ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2059758Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m86[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2061106Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2061639Z     [7m86[0m     expect(body.token.length).toBeGreaterThan(0);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2062458Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2064073Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m86[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2065169Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2065671Z     [7m86[0m     expect(body.token.length).toBeGreaterThan(0);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2066473Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2068191Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m87[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2069285Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2069802Z     [7m87[0m     expect(body.displayName).toBe("Demo User");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2070612Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2072152Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m87[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2073198Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2073687Z     [7m87[0m     expect(body.displayName).toBe("Demo User");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2074453Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2077909Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m90[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2080257Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2080844Z     [7m90[0m   it("returns 401 for invalid credentials", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2081633Z     [7m  [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2083179Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m96[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2084210Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2118720Z     [7m96[0m     expect(res.status).toBe(401);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2119610Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2121204Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m99[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2122251Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2122734Z     [7m99[0m     expect(body.error).toBe("UNAUTHORIZED");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2123501Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2125109Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m99[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2126130Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2126615Z     [7m99[0m     expect(body.error).toBe("UNAUTHORIZED");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2128111Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2131180Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m102[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2133490Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2134077Z     [7m102[0m   it("returns 400 for missing fields", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2134824Z     [7m   [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2136383Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m108[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2137423Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2138041Z     [7m108[0m     expect(res.status).toBe(400);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2138794Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2140244Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m111[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2141528Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2142043Z     [7m111[0m     expect(body.error).toBe("INVALID_INPUT");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2142818Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2144358Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m111[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2145393Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2145878Z     [7m111[0m     expect(body.error).toBe("INVALID_INPUT");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2146669Z     [7m   [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2151973Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m114[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2154324Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2154925Z     [7m114[0m   it("returns 400 for invalid JSON body", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2155759Z     [7m   [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2157310Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m120[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2158542Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2159001Z     [7m120[0m     expect(res.status).toBe(400);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2159714Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2161284Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m123[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2162380Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2162911Z     [7m123[0m     expect(body.error).toBe("INVALID_INPUT");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2163611Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2165140Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m123[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2166185Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2166719Z     [7m123[0m     expect(body.error).toBe("INVALID_INPUT");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2167742Z     [7m   [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2168069Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2321632Z Test Suites: 3 failed, 3 total
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2321967Z Tests:       0 total
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2322201Z Snapshots:   0 total
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2322411Z Time:        3.591 s
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2322607Z Ran all test suites.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.3107389Z ##[error]Process completed with exit code 1.
── End Run 23699111071 ──────────────────────────────────────────

### 2026-03-29T02:05:24.026Z — reset-for-dev
Redevelopment cycle 1/5: DOMAIN: backend
── Run 23699111071 ──────────────────────────────────────────────
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1242803Z     [7m81[0m     expect(ctx.log).toHaveBeenCalledWith("Hello endpoint called with name=Bob");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1243268Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1244712Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m84[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1245746Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1245990Z     [7m84[0m   it("logs the request with default name", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1246345Z     [7m  [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1246988Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m90[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1247638Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1247990Z     [7m90[0m     expect(ctx.log).toHaveBeenCalledWith(
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1248348Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1249815Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m95[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1251029Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1251328Z     [7m95[0m   it("returns 400 when name exceeds 100 characters", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1251716Z     [7m  [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1252364Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m102[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1252802Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1252996Z     [7m102[0m     expect(result.status).toBe(400);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1253329Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1253980Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m103[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1254418Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1254605Z     [7m103[0m     expect(result.jsonBody).toEqual({
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1254936Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1256372Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m109[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1258732Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1259107Z     [7m109[0m   it("accepts name with exactly 100 characters", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1259512Z     [7m   [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1260188Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m116[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1260643Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1260836Z     [7m116[0m     expect(result.status).toBe(200);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1261180Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1261842Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m117[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1262278Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1262579Z     [7m117[0m     expect(result.jsonBody.message).toBe(`Hello, ${maxName}!`);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1263001Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1264455Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m120[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1265492Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1265749Z     [7m120[0m   it("handles special characters in name", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1266111Z     [7m   [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1266758Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m126[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1267200Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1267387Z     [7m126[0m     expect(result.status).toBe(200);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1268013Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1268679Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m127[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1269114Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1269432Z     [7m127[0m     expect(result.jsonBody.message).toBe("Hello, O'Brien & Co.!");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1269863Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1271331Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m130[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1272363Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1272634Z     [7m130[0m   it("handles empty string name (uses default)", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1273023Z     [7m   [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1273671Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m139[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1274688Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1274937Z     [7m139[0m     expect(result.status).toBe(200);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1275273Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1275949Z     [96msrc/functions/__tests__/fn-hello.test.ts[0m:[93m141[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1276401Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1276647Z     [7m141[0m     expect(result.jsonBody.message).toBe("Hello, !");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1277032Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1277184Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1887780Z ts-jest[config] (WARN) [94mmessage[0m[90m TS151002: [0mUsing hybrid module kind (Node16/18/Next) is only supported in "isolatedModules: true". Please set "isolatedModules: true" in your tsconfig.json. To disable this message, you can set "diagnostics.ignoreCodes" to include 151002 in your ts-jest config. See more at https://kulshekhar.github.io/ts-jest/docs/getting-started/options/diagnostics
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1918203Z FAIL src/functions/__tests__/smoke.integration.test.ts
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1919270Z   ● Test suite failed to run
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1919544Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1922090Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m11[0m:[93m44[0m - [91merror[0m[90m TS2593: [0mCannot find name 'describe'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1923874Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1924402Z     [7m11[0m   process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1925211Z     [7m  [0m [91m                                           ~~~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1928244Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m11[0m:[93m55[0m - [91merror[0m[90m TS2593: [0mCannot find name 'describe'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1930153Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1930806Z     [7m11[0m   process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1931886Z     [7m  [0m [91m                                                      ~~~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1934995Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m39[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1937135Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1938017Z     [7m39[0m   it("returns 200 with default greeting when no name provided", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1938939Z     [7m  [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1940385Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m41[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1941360Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1941774Z     [7m41[0m     expect(res.status).toBe(200);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1942475Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1944009Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m44[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1945078Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1945561Z     [7m44[0m     expect(body.message).toBe("Hello, World!");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1946346Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1948158Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m44[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1949262Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1949738Z     [7m44[0m     expect(body.message).toBe("Hello, World!");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1951056Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1952648Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m45[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1953687Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1954136Z     [7m45[0m     expect(body.timestamp).toBeDefined();
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1954895Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1956447Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m45[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1957751Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1958254Z     [7m45[0m     expect(body.timestamp).toBeDefined();
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1959017Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1960650Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m47[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1961674Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1962385Z     [7m47[0m     expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1963638Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1965225Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m47[0m:[93m21[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1966354Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1967095Z     [7m47[0m     expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1968283Z     [7m  [0m [91m                    ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1969927Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m47[0m:[93m57[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1970986Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1971702Z     [7m47[0m     expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1972900Z     [7m  [0m [91m                                                        ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1976392Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m50[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1978942Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1979736Z     [7m50[0m   it("returns 200 with custom greeting when name is provided", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1980650Z     [7m  [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1982171Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m52[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1983220Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1983639Z     [7m52[0m     expect(res.status).toBe(200);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1984362Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1985940Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m55[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1987022Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1987765Z     [7m55[0m     expect(body.message).toBe("Hello, IntegrationTest!");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1988660Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1990334Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m55[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1991438Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1992024Z     [7m55[0m     expect(body.message).toBe("Hello, IntegrationTest!");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1992871Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1994448Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m56[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1995504Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1995982Z     [7m56[0m     expect(body.timestamp).toBeDefined();
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1996730Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.1998892Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m56[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2000046Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2000496Z     [7m56[0m     expect(body.timestamp).toBeDefined();
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2001265Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2004686Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m59[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2007104Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2007960Z     [7m59[0m   it("returns 400 when name exceeds 100 characters", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2008853Z     [7m  [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2010381Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m62[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2011688Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2012144Z     [7m62[0m     expect(res.status).toBe(400);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2012826Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2014404Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m65[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2015424Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2016085Z     [7m65[0m     expect(body.error).toBe("INVALID_INPUT");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2016917Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2019164Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m65[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2020305Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2020811Z     [7m65[0m     expect(body.error).toBe("INVALID_INPUT");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2021641Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2023225Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m66[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2024274Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2024808Z     [7m66[0m     expect(body.message).toContain("100 characters");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2025650Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2027213Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m66[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2028676Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2029216Z     [7m66[0m     expect(body.message).toContain("100 characters");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2030047Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2033344Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m75[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2035678Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2036549Z     [7m75[0m   it("returns 200 with token and displayName for valid demo credentials", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2037906Z     [7m  [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2039465Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m81[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2040531Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2040941Z     [7m81[0m     expect(res.status).toBe(200);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2041612Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2043201Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m84[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2044297Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2044721Z     [7m84[0m     expect(body.token).toBeDefined();
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2045468Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2047096Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m84[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2048671Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2049132Z     [7m84[0m     expect(body.token).toBeDefined();
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2049897Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2051522Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m85[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2052562Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2053058Z     [7m85[0m     expect(typeof body.token).toBe("string");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2053862Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2055491Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m85[0m:[93m19[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2056598Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2057106Z     [7m85[0m     expect(typeof body.token).toBe("string");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2058113Z     [7m  [0m [91m                  ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2059758Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m86[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2061106Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2061639Z     [7m86[0m     expect(body.token.length).toBeGreaterThan(0);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2062458Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2064073Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m86[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2065169Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2065671Z     [7m86[0m     expect(body.token.length).toBeGreaterThan(0);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2066473Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2068191Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m87[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2069285Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2069802Z     [7m87[0m     expect(body.displayName).toBe("Demo User");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2070612Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2072152Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m87[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2073198Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2073687Z     [7m87[0m     expect(body.displayName).toBe("Demo User");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2074453Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2077909Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m90[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2080257Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2080844Z     [7m90[0m   it("returns 401 for invalid credentials", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2081633Z     [7m  [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2083179Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m96[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2084210Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2118720Z     [7m96[0m     expect(res.status).toBe(401);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2119610Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2121204Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m99[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2122251Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2122734Z     [7m99[0m     expect(body.error).toBe("UNAUTHORIZED");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2123501Z     [7m  [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2125109Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m99[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2126130Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2126615Z     [7m99[0m     expect(body.error).toBe("UNAUTHORIZED");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2128111Z     [7m  [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2131180Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m102[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2133490Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2134077Z     [7m102[0m   it("returns 400 for missing fields", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2134824Z     [7m   [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2136383Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m108[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2137423Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2138041Z     [7m108[0m     expect(res.status).toBe(400);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2138794Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2140244Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m111[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2141528Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2142043Z     [7m111[0m     expect(body.error).toBe("INVALID_INPUT");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2142818Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2144358Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m111[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2145393Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2145878Z     [7m111[0m     expect(body.error).toBe("INVALID_INPUT");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2146669Z     [7m   [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2151973Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m114[0m:[93m3[0m - [91merror[0m[90m TS2593: [0mCannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2154324Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2154925Z     [7m114[0m   it("returns 400 for invalid JSON body", async () => {
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2155759Z     [7m   [0m [91m  ~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2157310Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m120[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2158542Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2159001Z     [7m120[0m     expect(res.status).toBe(400);
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2159714Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2161284Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m123[0m:[93m5[0m - [91merror[0m[90m TS2304: [0mCannot find name 'expect'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2162380Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2162911Z     [7m123[0m     expect(body.error).toBe("INVALID_INPUT");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2163611Z     [7m   [0m [91m    ~~~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2165140Z     [96msrc/functions/__tests__/smoke.integration.test.ts[0m:[93m123[0m:[93m12[0m - [91merror[0m[90m TS18046: [0m'body' is of type 'unknown'.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2166185Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2166719Z     [7m123[0m     expect(body.error).toBe("INVALID_INPUT");
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2167742Z     [7m   [0m [91m           ~~~~[0m
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2168069Z 
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2321632Z Test Suites: 3 failed, 3 total
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2321967Z Tests:       0 total
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2322201Z Snapshots:   0 total
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2322411Z Time:        3.591 s
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.2322607Z Ran all test suites.
Backend — Lint, Test & Build	Unit tests (Jest)	2026-03-29T02:02:22.3107389Z ##[error]Process completed with exit code 1.
── End Run 23699111071 ──────────────────────────────────────────. Reset 5 items: backend-dev, backend-unit-test, poll-infra-plan, push-app, poll-app-ci


> ⚠️ This file is auto-generated by `npm run pipeline:status`. Do not edit manually.
