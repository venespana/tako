// container-status.test.ts — docker ps JSON-lines parser fixtures
// (iteration 2 of tui-remote-home-screen)
//
// `docker ps -a --format '{{json .}}'` emits JSON-lines, one object per
// container. Malformed output is a STRICT refusal (loud-refusal convention,
// mirroring stack-status): the parser never returns a partially rendered
// list.
import { describe, expect, it } from 'vitest';

import { parseDockerPsJson } from './container-status.js';

describe('parseDockerPsJson — JSON lines (docker ps shape)', () => {
  it('parses one object per line, extracting the compose project label', () => {
    const stdout =
      `{"ID":"abc123","Names":"media-web-1","State":"running","Labels":"com.docker.compose.project=media,com.docker.compose.service=web"}\n` +
      `{"ID":"def456","Names":"media-db-1","State":"exited","Labels":"com.docker.compose.project=media"}\n`;
    const result = parseDockerPsJson(stdout);

    expect(result).toEqual({
      kind: 'ok',
      containers: [
        { id: 'abc123', name: 'media-web-1', state: 'running', composeProject: 'media', health: null },
        { id: 'def456', name: 'media-db-1', state: 'exited', composeProject: 'media', health: null },
      ],
    });
  });

  it('maps an absent or empty compose label to composeProject null', () => {
    const stdout =
      `{"ID":"abc123","Names":"portainer","State":"running","Labels":""}\n` +
      `{"ID":"def456","Names":"watchtower","State":"running"}\n`;
    const result = parseDockerPsJson(stdout);

    expect(result).toEqual({
      kind: 'ok',
      containers: [
        { id: 'abc123', name: 'portainer', state: 'running', composeProject: null, health: null },
        { id: 'def456', name: 'watchtower', state: 'running', composeProject: null, health: null },
      ],
    });
  });

  it('takes the FIRST name of a comma-joined Names field', () => {
    const result = parseDockerPsJson(`{"ID":"abc123","Names":"legacy-old,legacy","State":"running","Labels":""}\n`);

    expect(result).toEqual({
      kind: 'ok',
      containers: [{ id: 'abc123', name: 'legacy-old', state: 'running', composeProject: null, health: null }],
    });
  });

  it('extracts the compose project from a multi-label string, tolerating "=" inside values', () => {
    const stdout = `{"ID":"abc123","Names":"caddy","State":"paused","Labels":"org.image.title=app=v2,com.docker.compose.project=proxy"}\n`;
    const result = parseDockerPsJson(stdout);

    expect(result).toEqual({
      kind: 'ok',
      containers: [{ id: 'abc123', name: 'caddy', state: 'paused', composeProject: 'proxy', health: null }],
    });
  });

  it('tolerates a trailing newline between entries', () => {
    const stdout = `{"ID":"a","Names":"one","State":"running","Labels":""}\n{"ID":"b","Names":"two","State":"exited","Labels":""}\n`;
    const result = parseDockerPsJson(stdout);

    expect(result).toEqual({
      kind: 'ok',
      containers: [
        { id: 'a', name: 'one', state: 'running', composeProject: null, health: null },
        { id: 'b', name: 'two', state: 'exited', composeProject: null, health: null },
      ],
    });
  });
});

describe('parseDockerPsJson — health (T3-health-status)', () => {
  it('reads health from the Health string field (docker CLI formatter emits a plain string)', () => {
    const stdout =
      `{"ID":"a","Names":"web","State":"running","Labels":"","Health":"healthy"}\n` +
      `{"ID":"b","Names":"db","State":"running","Labels":"","Health":"unhealthy"}\n` +
      `{"ID":"c","Names":"queue","State":"running","Labels":"","Health":"starting"}\n`;

    expect(parseDockerPsJson(stdout)).toEqual({
      kind: 'ok',
      containers: [
        { id: 'a', name: 'web', state: 'running', composeProject: null, health: 'healthy' },
        { id: 'b', name: 'db', state: 'running', composeProject: null, health: 'unhealthy' },
        { id: 'c', name: 'queue', state: 'running', composeProject: null, health: 'starting' },
      ],
    });
  });

  it('reads health from HealthStatus too (the field name since the API v1.52 rename)', () => {
    const result = parseDockerPsJson(
      `{"ID":"a","Names":"web","State":"running","Labels":"","HealthStatus":"healthy"}\n`
    );

    expect(result).toEqual({
      kind: 'ok',
      containers: [{ id: 'a', name: 'web', state: 'running', composeProject: null, health: 'healthy' }],
    });
  });

  it('prefers Health over HealthStatus when both appear', () => {
    const result = parseDockerPsJson(
      `{"ID":"a","Names":"web","State":"running","Labels":"","Health":"unhealthy","HealthStatus":"healthy"}\n`
    );

    if (result.kind !== 'ok') throw new Error('expected ok');

    expect(result.containers[0]?.health).toBe('unhealthy');
  });

  it('maps an absent, empty, or "none" health field to health null (no healthcheck defined)', () => {
    const stdout =
      `{"ID":"a","Names":"no-field","State":"running","Labels":""}\n` +
      `{"ID":"b","Names":"empty","State":"running","Labels":"","Health":""}\n` +
      `{"ID":"c","Names":"explicit-none","State":"running","Labels":"","Health":"none"}\n`;

    expect(parseDockerPsJson(stdout)).toEqual({
      kind: 'ok',
      containers: [
        { id: 'a', name: 'no-field', state: 'running', composeProject: null, health: null },
        { id: 'b', name: 'empty', state: 'running', composeProject: null, health: null },
        { id: 'c', name: 'explicit-none', state: 'running', composeProject: null, health: null },
      ],
    });
  });

  it('reads health from an object with a string Status (defensive engine-style shape)', () => {
    const stdout =
      `{"ID":"a","Names":"web","State":"running","Labels":"","Health":{"Status":"healthy","FailingStreak":0}}\n` +
      `{"ID":"b","Names":"db","State":"running","Labels":"","Health":{"Status":"starting"}}\n`;

    expect(parseDockerPsJson(stdout)).toEqual({
      kind: 'ok',
      containers: [
        { id: 'a', name: 'web', state: 'running', composeProject: null, health: 'healthy' },
        { id: 'b', name: 'db', state: 'running', composeProject: null, health: 'starting' },
      ],
    });
  });

  it('maps any OTHER health shape to health null and NEVER refuses the line (auxiliary metadata)', () => {
    const stdout =
      `{"ID":"a","Names":"weird-object","State":"running","Labels":"","Health":{"nope":true}}\n` +
      `{"ID":"b","Names":"number","State":"running","Labels":"","Health":42}\n` +
      `{"ID":"c","Names":"unknown-string","State":"running","Labels":"","Health":"degraded"}\n` +
      `{"ID":"d","Names":"null","State":"running","Labels":"","Health":null}\n`;

    expect(parseDockerPsJson(stdout)).toEqual({
      kind: 'ok',
      containers: [
        { id: 'a', name: 'weird-object', state: 'running', composeProject: null, health: null },
        { id: 'b', name: 'number', state: 'running', composeProject: null, health: null },
        { id: 'c', name: 'unknown-string', state: 'running', composeProject: null, health: null },
        { id: 'd', name: 'null', state: 'running', composeProject: null, health: null },
      ],
    });
  });
});

describe('parseDockerPsJson — empty output', () => {
  it('treats empty or whitespace-only stdout as an empty list (exit code is the use case’s concern)', () => {
    expect(parseDockerPsJson('')).toEqual({ kind: 'ok', containers: [] });
    expect(parseDockerPsJson('  \n\t')).toEqual({ kind: 'ok', containers: [] });
  });
});

describe('parseDockerPsJson — strict refusal (loud-refusal convention)', () => {
  it('refuses a stream where one line is corrupt, naming the line', () => {
    const stdout = `{"ID":"a","Names":"one","State":"running","Labels":""}\nnot json\n`;
    const result = parseDockerPsJson(stdout);

    expect(result).toEqual({ kind: 'refusal', reason: 'docker ps line 2 is not valid JSON' });
  });

  it('refuses a line without Names (a row without a name is unrenderable)', () => {
    const result = parseDockerPsJson(`{"ID":"a","State":"running","Labels":""}\n`);

    expect(result).toEqual({ kind: 'refusal', reason: 'docker ps line 1 has no container name' });
  });

  it('refuses a line with an empty Names', () => {
    const result = parseDockerPsJson(`{"ID":"a","Names":"","State":"running","Labels":""}\n`);

    expect(result.kind).toBe('refusal');
  });

  it('refuses a line without State', () => {
    const result = parseDockerPsJson(`{"ID":"a","Names":"one","Labels":""}\n`);

    expect(result).toEqual({ kind: 'refusal', reason: 'docker ps line 1 has no state' });
  });

  it('refuses a line that is not a JSON object (array or scalar)', () => {
    expect(parseDockerPsJson('[{"ID":"a","Names":"one","State":"running"}]').kind).toBe('refusal');
    expect(parseDockerPsJson('42').kind).toBe('refusal');
    expect(parseDockerPsJson('"ok"').kind).toBe('refusal');
  });

  it('a later corrupt line refuses the WHOLE output (first refusal wins)', () => {
    const stdout =
      `{"ID":"a","Names":"one","State":"running","Labels":""}\n` +
      `{"ID":"b","Names":"two","State":"exited","Labels":""}\n` +
      `{"ID":"c","Names":"three"}\n`;
    const result = parseDockerPsJson(stdout);

    expect(result).toEqual({ kind: 'refusal', reason: 'docker ps line 3 has no state' });
  });
});
