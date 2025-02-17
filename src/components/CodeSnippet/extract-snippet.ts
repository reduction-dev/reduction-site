export function extractSnippet(code: string, marker?: string): string {
  const lines = code.split('\n');

  // If no marker provided, just remove snippet markers and return all code
  if (!marker) {
    return lines
      .filter(line => !/^\s*\/\/\s*snippet-(start|end):/.test(line))
      .join('\n')
      .trim();
  }

  let startIndex = -1;
  let endIndex = -1;
  let startCount = 0;
  let endCount = 0;

  // Find start and end markers for the given marker
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const startRegex = new RegExp(`^\\s*\\/\\/\\s*snippet-start:\\s*${marker}\\s*$`);
    const endRegex = new RegExp(`^\\s*\\/\\/\\s*snippet-end:\\s*${marker}\\s*$`);
    if (startRegex.test(line)) {
      startCount++;
      if (startCount === 1) {
        startIndex = i;
      }
    }
    if (endRegex.test(line)) {
      endCount++;
      if (endCount === 1) {
        endIndex = i;
      }
    }
  }

  if (startCount === 0) {
    throw new Error(`Start marker not found: ${marker}`);
  }
  if (endCount === 0) {
    throw new Error(`End marker not found: ${marker}`);
  }
  if (startCount > 1 || endCount > 1) {
    throw new Error(`Duplicate markers found: ${marker}`);
  }

  // Extract lines between start and end markers
  const snippetLines: string[] = [];
  for (let i = startIndex + 1; i < endIndex; i++) {
    // Omit any marker lines (for any marker)
    if (/^\s*\/\/\s*snippet-(start|end):/.test(lines[i])) {
      continue;
    }
    snippetLines.push(lines[i]);
  }

  // Remove shared indentation
  const nonEmptyLines = snippetLines.filter(line => line.trim().length > 0);
  let minIndent = Infinity;
  for (const line of nonEmptyLines) {
    const match = line.match(/^(\s*)/);
    if (match) {
      minIndent = Math.min(minIndent, match[1].length);
    }
  }
  if (minIndent === Infinity) {
    minIndent = 0;
  }
  const unindented = snippetLines.map(line => line.slice(minIndent));
  return unindented.join('\n').trim();
}
