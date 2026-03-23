// =============================================================================
// Jest setup — extend matchers + mock browser APIs
// =============================================================================

import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mock sessionStorage (JSDOM has it, but ensure it's clean between tests)
// ---------------------------------------------------------------------------

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
