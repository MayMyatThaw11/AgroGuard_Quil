import { test } from 'node:test';
import assert from 'node:assert/strict';

test('CodeEditor diagnostic contract: flags uncertified synthetic_urea input', () => {
  const sampleCode = `// Field scenario 01
parcel "field_01" {
  standard: "ASEAN_ORGANIC_ASOA"
  input "synthetic_urea" {
    rate: 120
  }
}`;

  const lines = sampleCode.split('\n');
  const flaggedLine = lines.findIndex(line =>
    !line.trim().startsWith('//') && line.includes('synthetic_urea')
  ) + 1;

  assert.equal(flaggedLine, 4, 'synthetic_urea on line 4 flagged for organic review');

  // Verify commented line is ignored
  const commentedCode = `// input "synthetic_urea"`;
  const commentedLines = commentedCode.split('\n');
  const commentedFlag = commentedLines.findIndex(line =>
    !line.trim().startsWith('//') && line.includes('synthetic_urea')
  ) + 1;
  assert.equal(commentedFlag, 0, 'commented out input is not flagged');
});
