#!/usr/bin/env bun
// scripts/pen-to-figcraft.ts — regenerate `tako.figcraft` from `design.pen`.
//
// The Pencil canvas (design.pen) is the source of truth for the screens; this
// script mirrors it into the FigCraft file so both surfaces hold the same 35
// screens, the same components and the same flow bands.
//
//   bun run design:figcraft
//
// It is a build script: no imports from src/, no runtime dependencies.
import { deflateRawSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

type PenFill = { type?: string; color?: unknown; url?: string } | string;
interface PenNode {
  type?: string;
  id?: string;
  name?: string;
  x?: number;
  y?: number;
  width?: number | string;
  height?: number | string;
  fill?: PenFill;
  layout?: string;
  gap?: number;
  padding?: number | number[];
  justifyContent?: string;
  alignItems?: string;
  content?: string;
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  textGrowth?: string;
  lineHeight?: number;
  ref?: string;
  reusable?: boolean;
  children?: PenNode[];
  descendants?: Record<string, Record<string, unknown>>;
}

interface Spec {
  kind: 'text' | 'rect' | 'frame' | 'group' | 'component' | 'instance';
  name: string;
  children?: Spec[];
  chars?: string;
  size?: number;
  bold?: boolean;
  fill?: Fill;
  fixed_width?: number;
  line_height?: number;
  w?: number;
  h?: number;
  sizing_h?: 'fill' | 'fixed' | 'hug';
  sizing_v?: 'fill' | 'fixed' | 'hug';
  mode?: 'vertical' | 'horizontal';
  gap?: number;
  padding?: number[];
  main_align?: string;
  cross_align?: string;
  component?: string;
  x?: number;
  y?: number;
}

type Fill = { kind: 'var' | 'hex' | 'rgba'; value: string | Rgba };
interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ---------------------------------------------------------------------------
// design tokens (mirror of docs/design.md)
// ---------------------------------------------------------------------------

const TOKENS: Record<string, string> = {
  bg: '#0D1117',
  'text-primary': '#E6EDF3',
  muted: '#8B949E',
  accent: '#22D3EE',
  success: '#3FB950',
  error: '#F85149',
  warning: '#D29922',
  border: '#30363D',
};

const FONT_MONO = 'JetBrains Mono';

const hexToRgba = (hex: string): Rgba => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
  a: 1,
});

// ---------------------------------------------------------------------------
// pencil canvas
// ---------------------------------------------------------------------------

const pen = JSON.parse(await Bun.file('design.pen').text()) as {
  children: PenNode[];
  variables: Record<string, { type: string; value: string }>;
};

const components = new Map<string, PenNode>();
const screens: PenNode[] = [];

pen.children.forEach(node => {
  if (node.reusable === true && node.id !== undefined) components.set(node.id, node);

  if (node.name?.startsWith('Screen')) screens.push(node);
});

const penFill = (node: PenNode): Fill | undefined => {
  const fill = node.fill;

  if (typeof fill === 'string') {
    return fill.startsWith('$') ? { kind: 'var', value: fill.slice(1) } : { kind: 'hex', value: fill };
  }

  if (Array.isArray(fill) && fill.length > 0) {
    const paint = fill[0];

    if (paint?.type === 'solid') {
      const color = paint.color;

      if (typeof color === 'string' && color.startsWith('$')) return { kind: 'var', value: color.slice(1) };

      if (color && typeof color === 'object') return { kind: 'rgba', value: color as Rgba };
    }
  }

  return undefined;
};

const specFromPen = (node: PenNode, desc?: Record<string, unknown>): Spec | undefined => {
  const type = node.type;

  if (type === 'text') {
    const override = (desc ?? {}) as { content?: string; fill?: string };
    const spec: Spec = {
      kind: 'text',
      name: node.name ?? '',
      chars: override.content ?? node.content ?? '',
      size: node.fontSize ?? 14,
      bold: node.fontWeight === '700',
      fill: override.fill ? { kind: 'var', value: override.fill.replace(/^\$/, '') } : penFill(node),
    };

    if (node.textGrowth === 'fixed-width' && typeof node.width === 'number') spec.fixed_width = node.width;

    if (typeof node.lineHeight === 'number') spec.line_height = node.lineHeight;

    return spec;
  }

  if (type === 'rectangle') {
    const spec: Spec = { kind: 'rect', name: node.name ?? '', fill: penFill(node) };
    const width = node.width;
    const height = node.height;

    if (width === 'fill_container') spec.sizing_h = 'fill';
    else if (typeof width === 'number') {
      spec.sizing_h = 'fixed';
      spec.w = width;
    } else spec.sizing_h = 'hug';

    if (height === 'fill_container') spec.sizing_v = 'fill';
    else if (typeof height === 'number') {
      spec.sizing_v = 'fixed';
      spec.h = height;
    } else spec.sizing_v = 'hug';

    return spec;
  }

  if (type === 'ref') {
    const component = node.ref === undefined ? undefined : components.get(node.ref);

    if (!component) return undefined;

    return {
      kind: 'group',
      name: node.name ?? component.name ?? '',
      children: childrenFromPen(component, node.descendants ?? {}),
    };
  }

  if (type === 'frame') {
    const spec: Spec = {
      kind: 'frame',
      name: node.name ?? '',
      children: childrenFromPen(node, desc ?? {}),
      fill: penFill(node),
      mode: node.layout === 'vertical' ? 'vertical' : 'horizontal',
    };

    if (node.gap) spec.gap = node.gap;

    if (node.padding !== undefined) spec.padding = normalizePadding(node.padding);

    if (node.justifyContent === 'space_between') spec.main_align = 'spaceBetween';

    if (node.alignItems === 'center') spec.cross_align = 'center';

    const width = node.width;
    const height = node.height;

    if (width === 'fill_container') spec.sizing_h = 'fill';
    else if (typeof width === 'number') {
      spec.sizing_h = 'fixed';
      spec.w = width;
    } else spec.sizing_h = 'hug';

    if (height === 'fill_container') spec.sizing_v = 'fill';
    else if (typeof height === 'number') {
      spec.sizing_v = 'fixed';
      spec.h = height;
    } else spec.sizing_v = 'hug';

    return spec;
  }

  return undefined;
};

const normalizePadding = (padding: number | number[]): number[] => {
  if (typeof padding === 'number') return [padding, padding, padding, padding];

  if (padding.length === 2) return [padding[0] ?? 0, padding[1] ?? 0, padding[0] ?? 0, padding[1] ?? 0];

  return [...padding, 0, 0, 0].slice(0, 4);
};

const childrenFromPen = (node: PenNode, desc: Record<string, Record<string, unknown>>): Spec[] => {
  const out: Spec[] = [];

  (node.children ?? []).forEach(child => {
    const override = child.id === undefined ? undefined : desc[child.id];

    if (override?.enabled === false) return;

    if (override && 'children' in override) {
      // slot replaced by a new children list (each entry may carry its own descendants)
      ((override.children as PenNode[] | undefined) ?? []).forEach(entry => {
        const sub = specFromPen(entry, (entry.descendants ?? {}) as Record<string, unknown>);

        if (sub) out.push(sub);
      });

      return;
    }

    const spec = specFromPen(child, (override ?? {}) as Record<string, unknown>);

    if (spec) out.push(spec);
  });

  return out;
};

// ---------------------------------------------------------------------------
// chrome components
// ---------------------------------------------------------------------------

const logo = components.get('EEptB');
const header = components.get('WRhSe');

if (!logo || !header) throw new Error('design.pen is missing the Logo / App Header components');

const logoSpec = (): Spec[] => childrenFromPen(logo, {});

const headerSpec = (remoteLine: string | null): Spec[] => {
  const kids: Spec[] = [{ kind: 'group', name: 'Tako Logo', children: logoSpec() }];

  if (remoteLine !== null) {
    kids.push({
      kind: 'text',
      name: 'Active Remote',
      chars: remoteLine,
      size: 14,
      bold: false,
      fill: { kind: 'var', value: 'accent' },
    });
  }

  return kids;
};

const footerSpec = (hints: [string, boolean][], version = 'v0.7.0'): Spec[] => {
  const kids: Spec[] = [];

  if (hints.length > 0) {
    kids.push({
      kind: 'frame',
      name: 'Hints',
      mode: 'horizontal',
      gap: 0,
      sizing_h: 'hug',
      sizing_v: 'hug',
      cross_align: 'center',
      children: hints.map(([chars, bold], index) => ({
        kind: 'text' as const,
        name: `t${index}`,
        chars,
        size: 13,
        bold,
        fill: { kind: 'var' as const, value: 'muted' },
      })),
    });
  }

  kids.push({
    kind: 'text',
    name: 'version',
    chars: version,
    size: 13,
    bold: false,
    fill: { kind: 'var', value: 'muted' },
  });
  return kids;
};

const BACK: [string, boolean][] = [
  ['h/Esc', true],
  [' back  ', false],
];
const QUIT: [string, boolean][] = [
  ['q', true],
  [' quit', false],
];

const component = (
  name: string,
  children: Spec[],
  x: number,
  y: number,
  w?: number,
  h?: number,
  mode: 'vertical' | 'horizontal' = 'vertical',
  gap = 2
): Spec => ({ kind: 'component', name, children, x, y, w, h, mode, gap });

const COMPONENTS: Spec[] = [
  component('Chrome / Logo', logoSpec(), 0, 0, 380, 102, 'vertical', 0),
  component('Chrome / App Header', headerSpec('homeserver · agent 0.2.0 (active)'), 460, 0, 380, 121),
  component('Chrome / App Header / No Agent', headerSpec('homeserver'), 460, 140, 380, 121),
  component('Chrome / App Header / No Remote', headerSpec(null), 460, 280, 380, 102),
  component('Chrome / App Header / No Remote Selected', headerSpec('no remote selected'), 460, 400, 380, 121),
  component(
    'Chrome / Footer / Menu',
    footerSpec([['↑↓/j k  ', false], ['Enter/l', true], [' select  ', false], ...BACK, ...QUIT]),
    900,
    0
  ),
  component('Chrome / Footer / Command', footerSpec([...BACK, ...QUIT]), 900, 60),
  component('Chrome / Footer / Form', footerSpec([]), 900, 120),
  component('Chrome / Footer / Refresh', footerSpec([['r', true], [' refresh  ', false], ...BACK, ...QUIT]), 900, 180),
  component('Chrome / Footer / Retry', footerSpec([['r', true], [' retry  ', false], ...BACK, ...QUIT]), 900, 240),
  component(
    'Chrome / Footer / Reconnect',
    footerSpec([['r', true], [' reconnect  ', false], ...BACK, ...QUIT]),
    900,
    300
  ),
  component(
    'Chrome / Footer / Browse',
    footerSpec([
      ['n', true],
      [' new  ', false],
      ['r', true],
      [' dry-run  ', false],
      ['a', true],
      [' apply  ', false],
      ['e', true],
      [' edit  ', false],
      ['d', true],
      [' delete  ', false],
      ...BACK,
      ...QUIT,
    ]),
    900,
    360
  ),
  component(
    'Chrome / Footer / Tasks Form',
    footerSpec([
      ['tab', true],
      [' fields  ', false],
      ['enter', true],
      [' submit  ', false],
      ['esc', true],
      [' cancel', false],
    ]),
    900,
    420
  ),
  component(
    'Chrome / Footer / Follow',
    footerSpec([['f', true], [' follow  ', false], ['↑↓', true], [' scroll  ', false], ...BACK, ...QUIT]),
    1400,
    0
  ),
  component(
    'Chrome / Footer / Confirm',
    footerSpec([
      ['y', true],
      [' confirm  ', false],
      ['N/Esc', true],
      [' cancel', false],
    ]),
    1400,
    60
  ),
  component(
    'Chrome / Footer / Refresh Browse',
    footerSpec([['r', true], [' refresh  ', false], ['↑↓/j k', true], [' select  ', false], ...BACK, ...QUIT]),
    1400,
    120
  ),
  component(
    'Chrome / Footer / Global Actions',
    footerSpec([
      ['↑↓/j k', true],
      [' select  ', false],
      ['Enter/l', true],
      [' run  ', false],
      ['1/2', true],
      [' tab  ', false],
      ...BACK,
      ...QUIT,
    ]),
    1400,
    180
  ),
];

const componentByName = new Map(COMPONENTS.map(c => [c.name, c]));

const HEADER_FOR: Record<string, string> = {
  'no remote selected': 'Chrome / App Header / No Remote Selected',
  'homeserver · agent 0.2.0 (active)': 'Chrome / App Header',
  homeserver: 'Chrome / App Header / No Agent',
  '': 'Chrome / App Header / No Remote',
};

/** The chrome each canvas screen uses: which header and which footer variant. */
const screenChrome = (screen: PenNode): { header: string; footer: string } => {
  const kids = screen.children ?? [];
  const headerRef = kids.find(c => c.type === 'ref' && components.get(c.ref ?? '')?.name === 'App Header');
  const footerRef = kids.find(c => c.type === 'ref' && components.get(c.ref ?? '')?.name === 'Footer');

  let headerName = 'Chrome / App Header';

  if (headerRef) {
    const overrides = headerRef.descendants ?? {};

    Object.values(overrides).forEach(value => {
      const content = (value as { content?: string }).content;

      if (content !== undefined) headerName = HEADER_FOR[content] ?? 'Chrome / App Header';
    });
  }

  let footerName = 'Chrome / Footer / Menu';

  if (footerRef) {
    const overrides = footerRef.descendants ?? {};
    const hints = overrides['Qfnk1'];

    if (hints) {
      if ((hints as { enabled?: boolean }).enabled === false) {
        footerName = 'Chrome / Footer / Form';
      } else {
        const texts = ((hints as { children?: PenNode[] }).children ?? [])
          .filter(t => t.type === 'text')
          .map(t => [t.content ?? '', t.fontWeight === '700'] as [string, boolean]);
        const key = JSON.stringify(texts);
        const match = COMPONENTS.find(c => {
          if (!c.name.startsWith('Chrome / Footer')) return false;

          if (c.name === 'Chrome / Footer / Menu' || c.name === 'Chrome / Footer / Form') return false;

          const frame = c.children?.find(k => k.name === 'Hints');

          if (!frame) return false;

          return JSON.stringify((frame.children ?? []).map(k => [k.chars ?? '', k.bold === true])) === key;
        });
        footerName = match?.name ?? 'Chrome / Footer / Menu';
      }
    } else if (Object.values(overrides).some(o => (o as { enabled?: boolean }).enabled === false)) {
      footerName = 'Chrome / Footer / Command';
    }
  }

  return { header: headerName, footer: footerName };
};

// ---------------------------------------------------------------------------
// figcraft document
// ---------------------------------------------------------------------------

type FigNode = Record<string, unknown> & { id?: number; type?: string; children?: number[] };

const nodes: Record<string, FigNode> = {};
let nextId = 2;

const add = (node: FigNode, parent?: number, x?: number, y?: number): number => {
  const id = nextId++;
  node.id = id;

  if (x !== undefined || y !== undefined) node.transform = [1, 0, 0, 1, x ?? 0, y ?? 0];

  if (parent !== undefined) node.parent = parent;

  nodes[String(id)] = node;
  return id;
};

const paint = (fill: Fill | undefined): { fills: unknown[]; bound?: Record<string, string> } => {
  if (!fill) return { fills: [] };

  if (fill.kind === 'var') {
    const name = fill.value as string;
    return {
      fills: [
        { type: 'solid', color: hexToRgba(TOKENS[name] ?? '#000000'), opacity: 1, visible: true, blend: 'normal' },
      ],
      bound: { fill: `VariableID:${TOKEN_IDS[name] ?? 1}` },
    };
  }

  if (fill.kind === 'hex') {
    return {
      fills: [{ type: 'solid', color: hexToRgba(fill.value as string), opacity: 1, visible: true, blend: 'normal' }],
    };
  }

  return {
    fills: [{ type: 'solid', color: fill.value, opacity: 1, visible: true, blend: 'normal' }],
  };
};

const TOKEN_IDS: Record<string, number> = {
  bg: 1,
  'text-primary': 2,
  muted: 3,
  accent: 4,
  success: 5,
  error: 6,
  warning: 7,
  border: 8,
  'font-mono': 9,
};

const layoutSpec = (spec: Spec): Record<string, unknown> => ({
  mode: spec.mode ?? 'horizontal',
  wrap: false,
  gap: spec.gap ?? 0,
  cross_gap: 10,
  padding: spec.padding ?? [0, 0, 0, 0],
  main_align: spec.main_align ?? 'min',
  cross_align: spec.cross_align ?? 'min',
  content_align: 'auto',
  grid_columns: 2,
  grid_rows: 2,
  column_tracks: [],
  row_tracks: [],
  strokes_included: true,
  reverse_z: false,
});

const childLayout = (h: string, v: string): Record<string, unknown> => ({
  sizing_h: h,
  sizing_v: v,
  absolute: false,
  min_w: null,
  max_w: null,
  min_h: null,
  max_h: null,
  grid_column: null,
  grid_row: null,
  grid_column_span: 0,
  grid_row_span: 0,
});

const build = (spec: Spec, parent?: number, x?: number, y?: number): number => {
  if (spec.kind === 'text') {
    const { fills, bound } = paint(spec.fill);
    const node: FigNode = {
      name: spec.name,
      type: 'text',
      characters: spec.chars ?? '',
      style: {
        font_family: FONT_MONO,
        font_style: spec.bold ? 'Bold' : 'Regular',
        font_size: spec.size ?? 14,
        line_height: spec.line_height ? { unit: 'percent', value: spec.line_height * 100 } : { unit: 'auto' },
        letter_spacing: { unit: 'percent', value: 0 },
        decoration: 'none',
        case: 'original',
        fills: null,
        link: null,
      },
      blend: 'normal',
      width: spec.fixed_width ?? null,
      height: (spec.size ?? 14) * 1.2,
      fills,
      child_layout: childLayout('hug', 'hug'),
      textAutoResize: spec.fixed_width ? 'none' : 'widthAndHeight',
    };

    if (bound) node.bound = bound;

    return add(node, parent, x, y);
  }

  if (spec.kind === 'rect') {
    const { fills, bound } = paint(spec.fill);
    const node: FigNode = {
      name: spec.name,
      type: 'rectangle',
      blend: 'normal',
      width: spec.w ?? 0,
      height: spec.h ?? 0,
      fills,
      child_layout: childLayout(spec.sizing_h ?? 'hug', spec.sizing_v ?? 'hug'),
    };

    if (bound) node.bound = bound;

    return add(node, parent, x, y);
  }

  if (spec.kind === 'instance') {
    const componentSpec = componentByName.get(spec.component ?? '');

    if (!componentSpec) throw new Error(`unknown component ${spec.component}`);

    const componentId = componentIds.get(spec.component ?? '');

    if (componentId === undefined) throw new Error(`component not built: ${spec.component}`);

    const node: FigNode = {
      name: spec.component,
      type: 'instance',
      component: componentId,
      props: {},
      layout: layoutSpec(componentSpec),
      child_layout: childLayout('hug', 'hug'),
      clip: true,
      children: [],
      source: componentId,
      width: componentSpec.w ?? null,
      height: componentSpec.h ?? null,
    };
    const id = add(node, parent, x, y);
    nodes[String(id)]!.children = (componentSpec.children ?? []).map(child => build(child, id));
    return id;
  }

  // frame / group
  const { fills, bound } = paint(spec.fill);
  const node: FigNode = {
    name: spec.name,
    type: 'frame',
    blend: 'normal',
    layout: layoutSpec(spec),
    child_layout: childLayout(spec.sizing_h ?? 'hug', spec.sizing_v ?? 'hug'),
    clip: true,
    fills,
    children: [],
  };

  if (bound) node.bound = bound;

  if (spec.w !== undefined) node.width = spec.w;

  if (spec.h !== undefined) node.height = spec.h;

  const id = add(node, parent, x, y);
  nodes[String(id)]!.children = (spec.children ?? []).map(child => build(child, id));
  return id;
};

const componentIds = new Map<string, number>();

COMPONENTS.forEach(spec => {
  const node: FigNode = {
    name: spec.name,
    type: 'component',
    description: '',
    props: {},
    parent: 1,
    transform: [1, 0, 0, 1, spec.x ?? 0, spec.y ?? 0],
    width: spec.w ?? null,
    height: spec.h ?? null,
    layout: layoutSpec(spec),
    child_layout: childLayout('hug', 'hug'),
    clip: true,
    fills: [],
    children: [],
  };
  const id = add(node, 1, spec.x, spec.y);
  componentIds.set(spec.name, id);
  nodes[String(id)]!.children = (spec.children ?? []).map(child => build(child, id));
});

// ---------------------------------------------------------------------------
// screens, grouped in flow bands
// ---------------------------------------------------------------------------

const BANDS: [string, string[]][] = [
  ['ENTRY · LOCAL', ['Screen - Home', 'Screen - Doctor']],
  ['REMOTE SETUP', ['Screen - Remotes', 'Screen - Remote Connect', 'Screen - Add Remote']],
  ['REMOTE HUB · TABS', ['Screen - Home / Remote', 'Screen - Home / Remote / Global Actions']],
  ['DRILL-INS & ACTIONS', ['Screen - Logs', 'Screen - Status', 'Screen - Tasks', 'Screen - Cleanup']],
  ['STATUS FAMILY STATES', ['Screen - Status / Loading', 'Screen - Status / Empty', 'Screen - Status / Error']],
  [
    'HUB STATES',
    ['Screen - Home / Remote / Loading', 'Screen - Home / Remote / Empty', 'Screen - Home / Remote / Error'],
  ],
  ['LOGS STATES', ['Screen - Logs / Connecting', 'Screen - Logs / Ended', 'Screen - Logs / Error']],
  ['REMOTES STATES', ['Screen - Remotes / Loading', 'Screen - Remotes / Error', 'Screen - Remotes / Empty']],
  ['CONNECT GATE STATES', ['Screen - Remote Connect / Validating', 'Screen - Remote Connect / Error']],
  ['DOCTOR STATES', ['Screen - Doctor / Checking', 'Screen - Doctor / Error']],
  [
    'ADD REMOTE WIZARD STATES',
    [
      'Screen - Add Remote / Validating',
      'Screen - Add Remote / Host Key',
      'Screen - Add Remote / Saved',
      'Screen - Add Remote / Error',
    ],
  ],
  [
    'TASKS STATES',
    ['Screen - Tasks / Agent Install', 'Screen - Tasks / Agent Install Failed', 'Screen - Tasks / No Dry-run'],
  ],
  ['GLOBAL ERROR STATES', ['Screen - Route Error', 'Screen - Network / Error']],
];

const MAX_COLS = 6;
const COL_W = 1120;
const ROW_H = 800;
const X0 = 880;
const Y0 = 480;

const screenByName = new Map(screens.map(s => [s.name ?? '', s]));
const captionIds: number[] = [];
const screenIds: number[] = [];

let row = 0;
let col = 0;

BANDS.forEach(([title, names]) => {
  if (col + names.length > MAX_COLS) {
    row += 1;
    col = 0;
  }

  const y = Y0 + row * ROW_H;
  let x = X0 + col * COL_W;

  captionIds.push(
    add(
      {
        name: `Caption ${title}`,
        type: 'text',
        characters: title,
        style: {
          font_family: FONT_MONO,
          font_style: 'Bold',
          font_size: 13,
          line_height: { unit: 'auto' },
          letter_spacing: { unit: 'percent', value: 1 },
          decoration: 'none',
          case: 'original',
          fills: null,
          link: null,
        },
        blend: 'normal',
        width: null,
        height: 17,
        fills: [{ type: 'solid', color: hexToRgba(TOKENS.muted!), opacity: 1, visible: true, blend: 'normal' }],
        bound: { fill: `VariableID:${TOKEN_IDS.muted}` },
        child_layout: childLayout('hug', 'hug'),
        textAutoResize: 'widthAndHeight',
      },
      1,
      x,
      y - 44
    )
  );

  names.forEach(name => {
    const canvasScreen = screenByName.get(name);

    if (!canvasScreen) throw new Error(`missing canvas screen: ${name}`);

    const { header: headerName, footer: footerName } = screenChrome(canvasScreen);
    const kids = canvasScreen.children ?? [];
    const bodyNode = kids.find(c => c.type === 'frame' && c.name !== 'Header');
    const body = bodyNode ? specFromPen(bodyNode) : undefined;

    const spec: Spec = {
      kind: 'frame',
      name,
      mode: 'vertical',
      padding: [28, 36, 28, 36],
      main_align: 'spaceBetween',
      sizing_h: 'fixed',
      sizing_v: 'fixed',
      w: 1040,
      h: 640,
      fill: { kind: 'var', value: 'bg' },
      children: [
        {
          kind: 'frame',
          name: 'Header',
          mode: 'vertical',
          gap: 2,
          sizing_h: 'fill',
          sizing_v: 'hug',
          children: [{ kind: 'instance', name: headerName, component: headerName }],
        },
        {
          kind: 'frame',
          name: 'Body',
          mode: 'vertical',
          gap: 12,
          sizing_h: 'fill',
          sizing_v: 'fill',
          children: body?.children ?? [],
        },
        { kind: 'instance', name: footerName, component: footerName },
      ],
    };
    screenIds.push(build(spec, 1, x, y));
    x += COL_W;
  });

  col += names.length;
});

const STATE_MAP = `STATE                                    → SOURCE (src/tui)
Home / Remote / Loading                  → pages/remote-home/ui/RemoteHomeLoading.tsx
Home / Remote / Empty                    → pages/remote-home/ui/RemoteHomeEmpty.tsx
Home / Remote / Error                    → pages/remote-home/ui/RemoteHomeError.tsx
Logs / Connecting                        → pages/logs/ui/LogsDashboard.tsx (phase: connecting)
Logs / Ended                             → pages/logs/ui/LogsDashboard.tsx (phase: ended)
Logs / Error                             → pages/logs/ui/LogsError.tsx
Remotes / Loading                        → pages/remotes-menu/ui/RemotesMenuPage.tsx
Remotes / Error                          → pages/remotes-menu/ui/RemotesMenuPage.tsx
Remotes / Empty                          → pages/remotes-menu/ui/RemotesMenuPage.tsx
Remote Connect / Validating              → pages/remotes-menu/ui/RemotesMenuPage.tsx (gate)
Remote Connect / Error                   → pages/remotes-menu/ui/RemotesMenuPage.tsx (gate)
Doctor / Checking                        → features/doctor/ui/CheckingState.tsx
Doctor / Error                           → features/doctor/ui/ErrorState.tsx
Add Remote / Validating                  → pages/remotes-add/model/use-add-remote-wizard.ts
Add Remote / Host Key                    → pages/remotes-add/ui/AddRemoteWizard.tsx
Add Remote / Saved                       → pages/remotes-add/ui/AddRemoteWizard.tsx
Add Remote / Error                       → pages/remotes-add/ui/AddRemoteWizard.tsx
Tasks / Agent Install                    → pages/tasks/ui/AgentInstallPanel.tsx
Tasks / Agent Install Failed             → pages/tasks/ui/AgentInstallPanel.tsx
Tasks / No Dry-run                       → pages/tasks/ui/DryRunPreviewPane.tsx
Route Error                              → shared/ui/RouteErrorScreen.tsx`;

const mapId = add(
  {
    name: 'STATE → SOURCE',
    type: 'text',
    characters: STATE_MAP,
    style: {
      font_family: FONT_MONO,
      font_style: 'Regular',
      font_size: 13,
      line_height: { unit: 'auto' },
      letter_spacing: { unit: 'percent', value: 0 },
      decoration: 'none',
      case: 'original',
      fills: null,
      link: null,
    },
    blend: 'normal',
    width: 900,
    height: 374,
    fills: [{ type: 'solid', color: hexToRgba(TOKENS.muted!), opacity: 1, visible: true, blend: 'normal' }],
    bound: { fill: `VariableID:${TOKEN_IDS.muted}` },
    child_layout: childLayout('fixed', 'hug'),
    textAutoResize: 'height',
  },
  1,
  4600,
  700
);

nodes['1'] = {
  id: 1,
  name: 'Tako — TUI screens',
  type: 'page',
  background: { r: 0.9607843, g: 0.9607843, b: 0.9607843, a: 1 },
  flows: [],
  prototype: {
    device: 'None',
    background: { r: 0.11764706, g: 0.11764706, b: 0.11764706, a: 1 },
    rotation: 'portrait',
  },
  children: [...componentIds.values(), ...captionIds, ...screenIds, mapId],
  width: 0,
  height: 0,
};

const variables = {
  collections: [
    {
      id: 'VariableCollectionId:1',
      name: 'Tako',
      modes: [{ id: 'VariableCollectionId:1/mode1', name: 'Mode 1' }],
    },
  ],
  variables: Object.entries(TOKENS).map(([name, value], index) => ({
    id: `VariableID:${index + 1}`,
    name,
    collection: 'VariableCollectionId:1',
    resolvedType: name === 'font-mono' ? 'string' : 'color',
    values: {
      'VariableCollectionId:1/mode1':
        name === 'font-mono' ? { type: 'string', value: FONT_MONO } : { type: 'color', value: hexToRgba(value) },
    },
    description: '',
  })),
};

const document = {
  format: 'figcraft',
  version: 1,
  imageIndex: [],
  name: 'tako',
  pages: [1],
  nodes,
  next_id: nextId,
  styles: [],
  variables,
  current_page: 1,
  document_colors: [],
  comments: [],
};

// ---------------------------------------------------------------------------
// layout pass (sizes + positions) and the .figcraft zip
// ---------------------------------------------------------------------------

const sizeNodes = (): void => {
  const sizeOf = (id: number, availW: number, availH: number): [number, number] => {
    const node = nodes[String(id)]!;
    const type = node.type;

    if (type === 'text') {
      const style = node.style as { font_size: number; line_height: { unit: string; value?: number } };
      const factor = style.line_height.unit === 'percent' ? (style.line_height.value ?? 120) / 100 : 1.2;
      const lines = (node.characters as string).split('\n');
      const chars = Math.max(...lines.map(line => line.length));
      const w = (node.width as number | null) ?? chars * style.font_size * 0.6;
      const h = lines.length * style.font_size * factor;
      node.width = w;
      node.height = h;
      return [w, h];
    }

    if (type === 'rectangle') {
      const cl = node.child_layout as { sizing_h: string; sizing_v: string };
      const w = cl.sizing_h === 'fill' ? availW : ((node.width as number | null) ?? 0);
      const h = cl.sizing_v === 'fill' ? availH : ((node.height as number | null) ?? 0);
      node.width = w;
      node.height = h;
      return [w, h];
    }

    const layout = node.layout as {
      mode: string;
      gap: number;
      padding: number[];
      main_align: string;
      cross_align: string;
    };
    const cl = node.child_layout as { sizing_h: string; sizing_v: string };
    const pad = layout.padding;
    const gap = layout.gap;
    const kids = node.children ?? [];

    const ownW =
      cl.sizing_h === 'fill' ? availW : cl.sizing_h === 'fixed' ? ((node.width as number | null) ?? 0) : null;
    const ownH =
      cl.sizing_v === 'fill' ? availH : cl.sizing_v === 'fixed' ? ((node.height as number | null) ?? 0) : null;

    const innerW = ownW === null ? 10000 : Math.max(ownW - pad[1]! - pad[3]!, 0);
    const innerH = ownH === null ? 10000 : Math.max(ownH - pad[0]! - pad[2]!, 0);

    const sizes = kids.map(kid => {
      const result = sizeOf(kid, innerW, innerH);
      return result;
    });

    // a fill child takes what the fixed siblings leave
    if (layout.mode === 'vertical') {
      const fills = kids.filter(kid => (nodes[String(kid)]!.child_layout as { sizing_v: string }).sizing_v === 'fill');

      if (fills.length > 0) {
        const fixed = sizes.reduce((sum, size, index) => {
          const kid = kids[index]!;
          const sizing = (nodes[String(kid)]!.child_layout as { sizing_v: string }).sizing_v;
          return sizing === 'fill' ? sum : sum + size[1];
        }, 0);
        const free = Math.max(innerH - fixed - gap * Math.max(kids.length - 1, 0), 0);
        const share = free / fills.length;

        fills.forEach(kid => {
          const index = kids.indexOf(kid);
          sizes[index] = sizeOf(kid, innerW, share);
        });
      }
    } else {
      const fills = kids.filter(kid => (nodes[String(kid)]!.child_layout as { sizing_h: string }).sizing_h === 'fill');

      if (fills.length > 0) {
        const fixed = sizes.reduce((sum, size, index) => {
          const kid = kids[index]!;
          const sizing = (nodes[String(kid)]!.child_layout as { sizing_h: string }).sizing_h;
          return sizing === 'fill' ? sum : sum + size[0];
        }, 0);
        const free = Math.max(innerW - fixed - gap * Math.max(kids.length - 1, 0), 0);
        const share = free / fills.length;

        fills.forEach(kid => {
          const index = kids.indexOf(kid);
          sizes[index] = sizeOf(kid, share, innerH);
        });
      }
    }

    const contentW =
      layout.mode === 'horizontal'
        ? sizes.reduce((sum, s) => sum + s[0], 0) + gap * Math.max(kids.length - 1, 0)
        : Math.max(...sizes.map(s => s[0]), 0);
    const contentH =
      layout.mode === 'horizontal'
        ? Math.max(...sizes.map(s => s[1]), 0)
        : sizes.reduce((sum, s) => sum + s[1], 0) + gap * Math.max(kids.length - 1, 0);

    const w = ownW ?? contentW + pad[1]! + pad[3]!;
    const h = ownH ?? contentH + pad[0]! + pad[2]!;
    node.width = w;
    node.height = h;
    return [w, h];
  };

  Object.entries(nodes).forEach(([id, node]) => {
    if (id === '1') return;

    if (node.parent === 1) sizeOf(Number(id), 10000, 10000);
  });
};

const placeNodes = (): void => {
  const place = (id: number, x: number, y: number): void => {
    const node = nodes[String(id)]!;
    node.transform = [1, 0, 0, 1, x, y];
    const kids = node.children ?? [];

    if (kids.length === 0) return;

    const layout = node.layout as {
      mode: string;
      gap: number;
      padding: number[];
      main_align: string;
      cross_align: string;
    };
    const pad = layout.padding;
    const gap = layout.gap;
    const innerW = Math.max(((node.width as number) ?? 0) - pad[1]! - pad[3]!, 0);
    const innerH = Math.max(((node.height as number) ?? 0) - pad[0]! - pad[2]!, 0);
    const sizes = kids.map(kid => [
      (nodes[String(kid)]!.width as number) ?? 0,
      (nodes[String(kid)]!.height as number) ?? 0,
    ]);

    if (layout.mode === 'vertical') {
      const used = sizes.reduce((sum, s) => sum + s[1], 0) + gap * Math.max(kids.length - 1, 0);
      let step = gap;

      if (layout.main_align === 'spaceBetween' && kids.length > 1) {
        step = gap + Math.max(innerH - used, 0) / (kids.length - 1);
      }

      let cursor = pad[0]!;
      kids.forEach((kid, index) => {
        const [kw, kh] = sizes[index]!;
        let cx = pad[3]!;

        if (layout.cross_align === 'center') cx = pad[3]! + (innerW - kw) / 2;

        if (layout.cross_align === 'max') cx = pad[3]! + innerW - kw;

        place(kid, cx, cursor);
        cursor += kh + step;
      });
    } else {
      const used = sizes.reduce((sum, s) => sum + s[0], 0) + gap * Math.max(kids.length - 1, 0);
      let step = gap;

      if (layout.main_align === 'spaceBetween' && kids.length > 1) {
        step = gap + Math.max(innerW - used, 0) / (kids.length - 1);
      }

      let cursor = pad[3]!;
      kids.forEach((kid, index) => {
        const [kw, kh] = sizes[index]!;
        let cy = pad[0]!;

        if (layout.cross_align === 'center') cy = pad[0]! + (innerH - kh) / 2;

        if (layout.cross_align === 'max') cy = pad[0]! + innerH - kh;

        place(kid, cursor, cy);
        cursor += kw + step;
      });
    }
  };

  Object.entries(nodes).forEach(([id, node]) => {
    if (id === '1') return;

    if (node.parent === 1) {
      const transform = (node.transform as number[]) ?? [1, 0, 0, 1, 0, 0];
      place(Number(id), transform[4]!, transform[5]!);
    }
  });
};

sizeNodes();
placeNodes();

// ---------------------------------------------------------------------------
// zip writer (store + deflate), no dependencies
// ---------------------------------------------------------------------------

const crcTable = (() => {
  const table = new Uint32Array(256);

  Array.from({ length: 256 }, (_, i) => i).forEach(i => {
    let c = i;

    Array.from({ length: 8 }).forEach(() => {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    });

    table[i] = c >>> 0;
  });

  return table;
})();

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;

  Array.from(data).forEach(byte => {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  });

  return (crc ^ 0xffffffff) >>> 0;
};

const zip = (entries: { name: string; data: Uint8Array }[]): Uint8Array => {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  entries.forEach(entry => {
    const name = encoder.encode(entry.name);
    const compressed = new Uint8Array(deflateRawSync(entry.data));
    const crc = crc32(entry.data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 8, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    locals.push(local, compressed);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 8, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length + compressed.length;
  });

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let cursor = 0;

  [...locals, ...centrals, end].forEach(part => {
    out.set(part, cursor);
    cursor += part.length;
  });

  return out;
};

const documentJson = new TextEncoder().encode(JSON.stringify(document));
await Bun.write('tako.figcraft', zip([{ name: 'document.json', data: documentJson }]));

console.log(`tako.figcraft: ${COMPONENTS.length} components, ${screenIds.length} screens, ${captionIds.length} bands`);
