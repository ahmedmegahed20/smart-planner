import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

/**
 * Regression cover for the silent-white-screen class of failure.
 *
 * These tests exercise the boundary's state machine directly. The project has
 * no DOM test environment (no jsdom/happy-dom), and adding one for this would be
 * a bigger change than the fix it guards; the render() output itself is a plain
 * element tree, so the behaviour that matters — children pass through, an error
 * is captured and retained, retry clears it — is all reachable without one.
 */

type AnyBoundary = ErrorBoundary & { state: { error: Error | null; info: unknown } };

function makeBoundary(children: React.ReactNode = 'child'): AnyBoundary {
  const b = new ErrorBoundary({ children } as { children: React.ReactNode });
  // Stand in for React's async setState so the assertions stay synchronous.
  (b as any).setState = (partial: any) => {
    const next = typeof partial === 'function' ? partial(b.state) : partial;
    b.state = { ...b.state, ...next };
  };
  return b as AnyBoundary;
}

/** Reproduce the order React uses when a child throws while rendering. */
function simulateThrow(b: AnyBoundary, error: Error, componentStack = '\n    in Broken'): void {
  (b as any).setState(ErrorBoundary.getDerivedStateFromError(error));
  b.componentDidCatch(error, { componentStack } as any);
}

describe('ErrorBoundary', () => {
  it('renders children untouched while nothing has thrown', () => {
    const node = React.createElement('div', null, 'app');
    const b = makeBoundary(node);
    expect(b.state.error).toBeNull();
    expect(b.render()).toBe(node);
  });

  it('derives state from a thrown error', () => {
    const err = new Error('boom');
    expect(ErrorBoundary.getDerivedStateFromError(err)).toEqual({ error: err });
  });

  it('captures the error and keeps a component stack, and always logs it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const b = makeBoundary();
      const err = new Error('render exploded');
      simulateThrow(b, err);

      expect(b.state.error).toBe(err);
      // Logging is the only durable trace on Android, where a blank window
      // otherwise leaves nothing to diagnose.
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toContain('ErrorBoundary');
      expect(String(spy.mock.calls[0][1])).toContain('render exploded');
    } finally {
      spy.mockRestore();
    }
  });

  it('stops rendering children once it has failed', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const b = makeBoundary(React.createElement('div', null, 'app'));
      simulateThrow(b, new Error('nope'), '');
      const out = b.render() as React.ReactElement;
      expect(out).not.toBe(b.props.children);
      expect(out.props.role).toBe('alert');
    } finally {
      spy.mockRestore();
    }
  });

  it('clears the error on retry so the subtree can re-render', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const node = React.createElement('div', null, 'app');
      const b = makeBoundary(node);
      simulateThrow(b, new Error('transient'), '');
      expect(b.state.error).not.toBeNull();

      b.reset();
      expect(b.state.error).toBeNull();
      expect(b.render()).toBe(node);
    } finally {
      spy.mockRestore();
    }
  });
});
