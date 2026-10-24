import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const folder = new URL('../../src/features/farm-simulation/', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, folder), 'utf8').replaceAll('\r\n', '\n');

type Theme = 'light' | 'dark';
type Rgba = [number, number, number, number];

function body(css: string, opener: string): string {
  const start = css.indexOf(opener);
  assert.ok(start >= 0, `${opener} not found`);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}

function declarations(text: string): Record<string, string> {
  return Object.fromEntries([...text.matchAll(/(?<![\w-])(--[\w-]+|background|color):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const aqLight = declarations(body(read('paddy-tokens.css'), '.aq-root {'));
const aqDark = { ...aqLight, ...declarations(body(read('paddy-tokens.css'), ":root[data-theme='dark'] .aq-root {")) };
const appDark = declarations(body(read('tokens.css'), ":root,\n:root[data-theme='dark'] {"));
const appLight = { ...appDark, ...declarations(body(read('tokens.css'), ":root[data-theme='light'] {")) };

function resolve(value: string, scope: Record<string, string>): string {
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolve(scope[ref[1]] ?? ref[1], scope) : value;
}

function parse(color: string): Rgba {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [parseInt(hex[1].slice(0, 2), 16), parseInt(hex[1].slice(2, 4), 16), parseInt(hex[1].slice(4, 6), 16), 1];
  const fn = color.match(/^rgba?\(([^)]+)\)$/);
  assert.ok(fn, `cannot read ${color}`);
  const [r, g, b, a = 1] = fn[1].split(',').map(Number);
  return [r, g, b, a];
}

const over = (top: Rgba, under: Rgba): Rgba => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1) as Rgba;
const luminance = ([r, g, b]: Rgba) => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a: Rgba, b: Rgba) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

function rule(file: string, selector: string): Record<string, string> {
  return declarations(body(read(file), `\n${selector} {`));
}

function pair(file: string, selector: string, scope: Record<string, string>, surface: string): number {
  const found = rule(file, selector);
  const under = parse(resolve(surface, scope));
  const fill = over(parse(resolve(found.background ?? 'transparent', scope).replace('transparent', 'rgba(0,0,0,0)')), under);
  return ratio(over(parse(resolve(found.color, scope)), fill), fill);
}

const MIN = 4.5;

for (const theme of ['light', 'dark'] as Theme[]) {
  const aq = theme === 'light' ? aqLight : aqDark;
  const app = theme === 'light' ? appLight : appDark;
  const aqSurface = aq['--aq-surface-app'];
  const appSurface = app['--surface-base'];

  test(`the primary button text is readable in ${theme} mode`, () => {
    assert.ok(pair('paddy-controls.css', '.aq-btn-primary', aq, aqSurface) >= MIN);
  });

  for (const kind of ['is-accent', 'is-warning', 'is-alert', 'is-water']) {
    test(`the ${kind} badge text is readable in ${theme} mode`, () => {
      assert.ok(pair('paddy-controls.css', `.aq-badge.${kind}`, aq, aq['--aq-surface-card']) >= MIN);
    });
  }

  for (const kind of ['measured', 'modelled', 'inferred', 'unavailable']) {
    test(`the ${kind} provenance badge text is readable in ${theme} mode`, () => {
      assert.ok(pair('index.css', `.provenance-${kind}`, app, appSurface) >= MIN);
    });
  }
}

test('form controls reach 44 px on touch screens', () => {
  const css = read('farmmap-tokens.css');
  const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
  const rule = coarse.match(/([^{}]*select\.aq-input[^{}]*)\{([^}]*)\}/);
  assert.ok(rule, 'no coarse-pointer rule covers select.aq-input');
  assert.match(rule[2], /min-height:\s*44px/);
  assert.match(rule[1], /input\.aq-input/);
});
