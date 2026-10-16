import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.argv.includes("--root") ? process.argv[process.argv.indexOf("--root") + 1] : "src";
const TOKEN_FILES = [/tokens/i, /theme/i, /variables\.css$/i, /tailwind\.config/i];
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".vue"]);
const BASELINE = ".anti-slop-baseline.json";

const RULES = [
  { id: "E1", sev: "E", re: /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\[(?:#|rgb|hsl)/, msg: "raw color; use a token", skipTokens: true },
  { id: "E2", sev: "E", re: /\b(?:from|via|to)-(?:purple|violet|indigo|fuchsia|pink)-\d{2,3}\b/, msg: "default-palette gradient" },
  { id: "E4", sev: "E", re: /font-family\s*:|font-\[['"]|fontFamily\s*:/, msg: "font literal in component", skipTokens: true },
  { id: "W5", sev: "W", re: /\b(?:p|m|px|py|gap|rounded)-\[\d+px\]/, msg: "arbitrary spacing/radius" },
  { id: "W6", sev: "W", re: /z-\[\d{3,}\]|z-index\s*:\s*\d{4,}/, msg: "z-index off the layer scale" },
  { id: "E7", sev: "E", re: /!important|style=\{\{[^}]*(?:color|background|font)/, msg: "!important or inline color/font" },
  { id: "E10", sev: "E", re: /\b(?:TODO|FIXME|XXX)\b(?!.*#\d+)/, msg: "TODO without issue ref" },
  { id: "E11", sev: "E", re: /lorem ipsum|john doe|acme\b|feature (?:one|two|three)/i, msg: "placeholder content" },
  { id: "E13", sev: "E", re: /Math\.random\(\)/, msg: "random used for data/UI" },
  { id: "E15a", sev: "E", re: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/, msg: "empty catch" },
  { id: "E15b", sev: "E", re: /console\.log\(/, msg: "console.log left in src" },
  { id: "E17", sev: "E", re: /<(?:div|span)\b[^>]*\bonClick=/, msg: "clickable div/span; use button or add role+tabIndex+key handler" },
  { id: "E18", sev: "E", re: /\boutline-none\b|outline\s*:\s*none/, msg: "focus outline removed; ensure focus-visible replacement" },
  { id: "E19", sev: "E", re: /<img\b(?![^>]*\balt=)/, msg: "img without alt" },
  { id: "W20", sev: "W", re: /\banimate-(?:pulse|bounce|ping)\b/, msg: "decorative animation; allow only for loading/live status" },
  { id: "E21", sev: "E", re: /:\s*any\b|as any\b|@ts-ignore|@ts-nocheck/, msg: "any / ts-ignore" },
  { id: "E22", sev: "E", re: /dangerouslySetInnerHTML|(?:api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{12,}/i, msg: "unsafe HTML or hardcoded secret" },
];

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  if (/node_modules|dist|build|\.next|\.git/.test(p)) return [];
  return statSync(p).isDirectory() ? walk(p) : EXT.has(extname(p)) ? [p] : [];
});

const findings = [];
for (const file of walk(ROOT)) {
  const isToken = TOKEN_FILES.some((r) => r.test(file));
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes("anti-slop-allow:")) return;
    for (const r of RULES) {
      if (r.skipTokens && isToken) continue;
      if (r.re.test(line)) findings.push({ id: r.id, sev: r.sev, file, line: i + 1, msg: r.msg });
    }
  });
  if (lines.length > 250) findings.push({ id: "W9", sev: "W", file, line: 1, msg: `file has ${lines.length} lines` });
}

const key = (f) => `${f.id}|${f.file}|${f.msg}`;
if (process.argv.includes("--write-baseline")) {
  writeFileSync(BASELINE, JSON.stringify(findings.map(key), null, 2));
  console.log(`Baseline saved: ${findings.length} findings`);
  process.exit(0);
}
const base = new Set(existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : []);
const fresh = findings.filter((f) => !base.has(key(f)));
for (const f of fresh) console.log(`${f.sev} ${f.id} ${f.file}:${f.line} ${f.msg}`);
const errors = fresh.filter((f) => f.sev === "E").length;
console.log(`New: ${fresh.length} (errors ${errors}); total ${findings.length}; baseline ${base.size}`);
process.exit(errors ? 1 : 0);
