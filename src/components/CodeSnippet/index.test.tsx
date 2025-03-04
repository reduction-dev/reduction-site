import { extractSnippet } from './extract-snippet';
import { expect, test, describe } from "bun:test";

test('extracts snippet between markers and removes common indentation', () => {
  const code = `// snippet-start: test\n    console.log("Hello, world!");\n// snippet-end: test`;
  const result = extractSnippet(code, 'test');
  expect(result).toBe('console.log("Hello, world!");');
});

test('throws error if start marker is missing', () => {
  const code = `    console.log("No start marker");\n// snippet-end: test`;
  expect(() => extractSnippet(code, 'test')).toThrow('Start marker not found: test');
});

test('throws error if end marker is missing', () => {
  const code = `// snippet-start: test\n    console.log("No end marker");`;
  expect(() => extractSnippet(code, 'test')).toThrow('End marker not found: test');
});

test('throws error if duplicate markers found', () => {
  const code = `// snippet-start: test\n    console.log("First snippet");\n// snippet-start: test\n    console.log("Duplicate snippet");\n// snippet-end: test`;
  expect(() => extractSnippet(code, 'test')).toThrow('Duplicate markers found: test');
});

test('returns full code with snippet markers removed', () => {
  const code = `// snippet-start: test1
const a = 1;
// snippet-end: test1
const b = 2;
// snippet-start: test2
const c = 3;
// snippet-end: test2`;
  const expected = `const a = 1;
const b = 2;
const c = 3;`;
  const result = extractSnippet(code);
  expect(result).toBe(expected);
});

test('preserves indentation when no marker provided', () => {
  const code = `    const a = 1;
// snippet-start: test
  const b = 2;
// snippet-end: test
  const c = 3;`;
  const expected = `const a = 1;
  const b = 2;
  const c = 3;`;
  const result = extractSnippet(code);
  expect(result).toBe(expected);
})
