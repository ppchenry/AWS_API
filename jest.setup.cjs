const MIN_TEST_TIMEOUT_MS = 60000;

const originalSetTimeout = jest.setTimeout.bind(jest);

// Keep integration tests from shrinking the timeout below a Windows-safe floor.
jest.setTimeout = (timeoutMs) => originalSetTimeout(Math.max(timeoutMs, MIN_TEST_TIMEOUT_MS));
originalSetTimeout(MIN_TEST_TIMEOUT_MS);