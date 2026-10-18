/**
 * Wires up WebGL context-loss recovery on a canvas element.
 *
 * Per the WebGL spec, a lost context is only eligible for restoration if the
 * "webglcontextlost" listener calls event.preventDefault() — otherwise the
 * browser treats the loss as permanent and "webglcontextrestored" never
 * fires, leaving the canvas blank until the page is reloaded. Extracted from
 * FarmScene.tsx so this one property (and the callback wiring around it) is
 * unit-testable without a real WebGL context or DOM.
 */
export interface ContextLossTarget {
  addEventListener(type: 'webglcontextlost' | 'webglcontextrestored', listener: (event: { preventDefault(): void }) => void): void;
  removeEventListener(type: 'webglcontextlost' | 'webglcontextrestored', listener: (event: { preventDefault(): void }) => void): void;
}

export interface ContextLossCallbacks {
  onLost: () => void;
  onRestored: () => void;
}

/** Returns a cleanup function that removes both listeners. */
export function attachContextLossRecovery(target: ContextLossTarget, callbacks: ContextLossCallbacks): () => void {
  const handleLost = (event: { preventDefault(): void }) => {
    event.preventDefault(); // required for "webglcontextrestored" to ever fire
    callbacks.onLost();
  };
  const handleRestored = () => {
    callbacks.onRestored();
  };

  target.addEventListener('webglcontextlost', handleLost);
  target.addEventListener('webglcontextrestored', handleRestored);

  return () => {
    target.removeEventListener('webglcontextlost', handleLost);
    target.removeEventListener('webglcontextrestored', handleRestored);
  };
}
