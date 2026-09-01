// react-router.test.tsx — Minimal integration guard: react-router v8's DATA
// router (createMemoryRouter + RouterProvider + nested layout routes +
// Outlet) renders and navigates under Ink 7's custom reconciler. If this
// fails, the problem is in the router/Ink integration itself — not in the
// app's UX flows (covered by App.test.tsx). Kept as a trimmed version of the
// original throwaway smoke test; renamed from *.integration.* because the
// vitest unit project excludes **/*.integ.* files.
import { describe, it, expect } from 'vitest';
import { useEffect } from 'react';
import { render } from 'ink-testing-library';
import { Box, Text } from 'ink';
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { createMemoryRouter, Outlet, RouterProvider, useNavigate } from 'react-router';
// Capture navigate imperatively so the test can drive navigation without
// keyboard plumbing — this is a renderer integration test, not a UX test.
let nav: ((to: number | string) => void) | null = null;

function Probe(): null {
  const navigate = useNavigate();
  useEffect(() => {
    nav = (to: number | string) => {
      // useNavigate is overloaded (To | delta); calling per-branch keeps both
      if (typeof to === 'number') void navigate(to);
      else void navigate(to);
    };
  }, [navigate]);
  return null;
}

function Shell(): React.ReactElement {
  return (
    <Box flexDirection='column'>
      <Probe />
      <Text>shell-menu</Text>
      <Outlet />
    </Box>
  );
}

function List(): React.ReactElement {
  // Renders the nested :id child via its outlet
  return (
    <Box>
      <Text>page:list</Text>
      <Outlet />
    </Box>
  );
}

function Detail(): React.ReactElement {
  return <Text>page:detail</Text>;
}

function Home(): React.ReactElement {
  return <Text>page:home</Text>;
}

const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));

describe('react-router under Ink 7 (data router)', () => {
  it('renders the nested layout and navigates push/back', async () => {
    const router = createMemoryRouter(
      [
        { path: '/', Component: Home },
        {
          path: '/remotes',
          Component: Shell,
          children: [{ path: 'list', Component: List, children: [{ path: ':id', Component: Detail }] }],
        },
      ],
      { initialEntries: ['/remotes/list'] }
    );

    const { lastFrame, unmount } = render(<RouterProvider router={router} />);
    await wait();
    expect(lastFrame()).toContain('shell-menu');
    expect(lastFrame()).toContain('page:list');

    nav!('/remotes/list/42'); // push
    await wait();
    expect(lastFrame()).toContain('shell-menu');
    expect(lastFrame()).toContain('page:list');
    expect(lastFrame()).toContain('page:detail');

    nav!(-1); // back to /remotes/list
    await wait();
    expect(lastFrame()).not.toContain('page:detail');
    unmount();
  });

  it('leaves the layout branch when navigating to "/"', async () => {
    const router = createMemoryRouter(
      [
        { path: '/', Component: Home },
        {
          path: '/remotes',
          Component: Shell,
          children: [{ path: 'list', Component: List }],
        },
      ],
      { initialEntries: ['/remotes/list'] }
    );

    const { lastFrame, unmount } = render(<RouterProvider router={router} />);
    await wait();

    nav!('/');
    await wait();
    expect(lastFrame()).toContain('page:home');
    expect(lastFrame()).not.toContain('shell-menu');
    unmount();
  });
});
