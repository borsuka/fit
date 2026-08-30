// Fail a test that logs an unexpected console.error. A React key warning or a
// state-update-after-unmount is a real defect; silently green tests are not.
const originalError = console.error;

beforeAll(() => {
  console.error = (...args: unknown[]) => {
    originalError(...args);
    throw new Error(`Unexpected console.error in test: ${String(args[0])}`);
  };
});

afterAll(() => {
  console.error = originalError;
});
