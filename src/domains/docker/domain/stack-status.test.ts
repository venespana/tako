// stack-status.test.ts — compose ls JSON parser fixtures (S1 of mvp-status-command)
//
// `docker compose ls --format json` emits a JSON array (current compose v2)
// or JSON-lines on older builds. Malformed output is a STRICT refusal
// (user decision 2026-10-17): the parser never returns a partially
// rendered list.
import { describe, expect, it } from 'vitest';

import { parseComposeLsJson } from './stack-status.js';

describe('parseComposeLsJson — JSON array (compose v2 shape)', () => {
  it('parses the verified real-world fixture', () => {
    const result = parseComposeLsJson(
      '[{"Name":"reverse-proxy","Status":"running(2)","ConfigFiles":"/home/venespana/develop/reverse-proxy/docker-compose.yml"}]'
    );
    expect(result).toEqual({
      kind: 'ok',
      entries: [
        {
          name: 'reverse-proxy',
          status: 'running(2)',
          configFiles: '/home/venespana/develop/reverse-proxy/docker-compose.yml',
        },
      ],
    });
  });

  it('parses a pretty-printed multi-entry array, preserving order', () => {
    const stdout = `[
  {"Name":"reverse-proxy","Status":"running(2)","ConfigFiles":"/srv/reverse-proxy/docker-compose.yml"},
  {"Name":"media","Status":"exited(1)","ConfigFiles":"/srv/media/compose.yml"}
]`;
    const result = parseComposeLsJson(stdout);
    expect(result).toEqual({
      kind: 'ok',
      entries: [
        { name: 'reverse-proxy', status: 'running(2)', configFiles: '/srv/reverse-proxy/docker-compose.yml' },
        { name: 'media', status: 'exited(1)', configFiles: '/srv/media/compose.yml' },
      ],
    });
  });

  it('parses an empty array as an empty entry list', () => {
    expect(parseComposeLsJson('[]')).toEqual({ kind: 'ok', entries: [] });
  });

  it('defaults absent display fields to empty strings (only the name is required)', () => {
    const result = parseComposeLsJson('[{"Name":"solo"}]');
    expect(result).toEqual({ kind: 'ok', entries: [{ name: 'solo', status: '', configFiles: '' }] });
  });
});

describe('parseComposeLsJson — JSON lines (older compose builds)', () => {
  it('parses one object per line, tolerating a trailing newline', () => {
    const stdout =
      `{"Name":"a","Status":"running(1)","ConfigFiles":"/a/compose.yml"}\n` +
      `{"Name":"b","Status":"exited(0)","ConfigFiles":"/b/compose.yml"}\n`;
    const result = parseComposeLsJson(stdout);
    expect(result).toEqual({
      kind: 'ok',
      entries: [
        { name: 'a', status: 'running(1)', configFiles: '/a/compose.yml' },
        { name: 'b', status: 'exited(0)', configFiles: '/b/compose.yml' },
      ],
    });
  });
});

describe('parseComposeLsJson — empty output', () => {
  it('treats empty or whitespace-only stdout as an empty list (exit code is S2’s concern)', () => {
    expect(parseComposeLsJson('')).toEqual({ kind: 'ok', entries: [] });
    expect(parseComposeLsJson('  \n\t')).toEqual({ kind: 'ok', entries: [] });
  });
});

describe('parseComposeLsJson — strict refusal (user decision 2026-10-17)', () => {
  it('refuses output that is not valid JSON at all', () => {
    const result = parseComposeLsJson('cannot connect to docker daemon');
    expect(result.kind).toBe('refusal');
  });

  it('refuses a truncated array (no partial rendering)', () => {
    const result = parseComposeLsJson('[{"Name":"a","Status":"running(1)"},{"Name":');
    expect(result.kind).toBe('refusal');
  });

  it('refuses a JSONL stream where one line is corrupt', () => {
    const stdout = `{"Name":"a","Status":"running(1)","ConfigFiles":"/a.yml"}\n` + `{"Name":"b","Status":`;
    const result = parseComposeLsJson(stdout);
    expect(result.kind).toBe('refusal');
  });

  it('refuses an array holding a non-object element', () => {
    expect(parseComposeLsJson('[42]').kind).toBe('refusal');
    expect(parseComposeLsJson('["a"]').kind).toBe('refusal');
    expect(parseComposeLsJson('[null]').kind).toBe('refusal');
  });

  it('refuses an entry without a project name (a row without a name is unrenderable)', () => {
    expect(parseComposeLsJson('[{"Status":"running(1)"}]').kind).toBe('refusal');
    expect(parseComposeLsJson('[{"Name":""}]').kind).toBe('refusal');
    expect(parseComposeLsJson('[{"Name":42}]').kind).toBe('refusal');
  });

  it('refuses top-level JSON scalars', () => {
    expect(parseComposeLsJson('42').kind).toBe('refusal');
    expect(parseComposeLsJson('null').kind).toBe('refusal');
    expect(parseComposeLsJson('"ok"').kind).toBe('refusal');
  });

  it('refusal results carry a human-readable reason', () => {
    const result = parseComposeLsJson('[{"Status":"running(1)"}]');
    if (result.kind !== 'refusal') throw new Error('expected refusal');
    expect(result.reason.length).toBeGreaterThan(0);
  });
});
