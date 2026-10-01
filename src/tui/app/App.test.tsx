// App.test.tsx — Integration tests for the App component.
// App is prop-free: it mounts the memory router — all session state lives in
// zustand module-scope stores (9.20). These tests exercise the composed shell
// (AppShell chrome + routed HomePage) through real keypresses via
// ink-testing-library.
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from './App.js';

describe('App', () => {
  it('renders the home screen with logo, groups, and key hints', () => {
    const { lastFrame } = render(<App />);

    // Shell chrome renders (logo box characters)
    expect(lastFrame()).toContain('███╗');
    // Home page renders the registry groups
    expect(lastFrame()).toContain('Local');
    expect(lastFrame()).toContain('Remote');
    expect(lastFrame()).toContain('Config');
    // Key hints
    expect(lastFrame()).toContain('q');
    expect(lastFrame()).toContain('↑↓');
  });

  it('renders with cursor on first selectable item', () => {
    const { lastFrame } = render(<App />);

    // Cursor glyph appears
    expect(lastFrame()).toContain('❯');
  });

  it('navigates away from home when Enter is pressed on doctor', async () => {
    const { stdin, lastFrame } = render(<App />);

    // Press Enter to select doctor (cursor starts on first item = doctor)
    stdin.write('\r');

    // Wait for the router to swap routes
    await new Promise(resolve => setTimeout(resolve, 50));

    // The doctor route replaced the home page. The check's lifecycle is a
    // Bun-runtime concern (tool spawning) covered by doctor screen tests with
    // injected fakes — under node it surfaces as a categorized error state.
    expect(lastFrame()).not.toContain('Config');
  });
});
