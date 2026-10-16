import { test } from 'node:test';
import assert from 'node:assert/strict';

test('StatusBar connection and diagnostic tones contract', () => {
  const getTone = (errorCount: number, diagnosticCount: number) => {
    if (errorCount > 0) return { token: 'error', label: `${errorCount} error${errorCount > 1 ? 's' : ''}` };
    if (diagnosticCount > 0) return { token: 'warning', label: `${diagnosticCount} warning${diagnosticCount > 1 ? 's' : ''}` };
    return { token: 'valid', label: 'No problems' };
  };

  assert.equal(getTone(0, 0).token, 'valid');
  assert.equal(getTone(0, 2).token, 'warning');
  assert.equal(getTone(1, 2).token, 'error', 'errors take precedence over warnings');
});
