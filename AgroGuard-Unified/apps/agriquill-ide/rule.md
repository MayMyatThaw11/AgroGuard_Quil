# Anti-Slop Code-Level Rules (AgriQill Frontend)

> Mission: Enforce product-specific, intentional design and prevent generic AI-generated slop patterns across the AgriQill frontend (`AGRIQILL/source/frontend/agriquill-ide`).
> Severity:
> - **E (Error)**: Blocks commit. Must be resolved before commit.
> - **W (Warning)**: Must be fixed or explicitly justified in the commit message.

---

## 1. Style Tokens

- **E1 [Error]**: No raw colors in components. No hex (`#rgb`/`#rrggbb`), `rgb()`/`rgba()`, `hsl()`/`hsla()` literals, or Tailwind arbitrary colors like `bg-[#123456]`. Use CSS variables and design tokens (`var(--agri-...)` / `src/tokens.css`). The tokens file is the only allowed place for raw values.
- **E2 [Error]**: No default-palette gradients as decoration. No `from-`, `via-`, or `to-` utility classes using `purple`, `violet`, `indigo`, `fuchsia`, or `pink`, and no gradient over a surface that holds dense text or telemetry data.
- **W3 [Warning]**: Max one gradient per surface. Gradients must derive from semantic tokens.
- **E4 [Error]**: No font-family literals in components (`font-family: ...` or `font-['...']`). Fonts are declared once in `src/tokens.css` or `src/index.css` and referenced by CSS variable or token class.
- **W5 [Warning]**: Spacing and radii must sit on the 8px grid via tokens. Flag arbitrary values such as `p-[13px]`, `gap-[7px]`, `rounded-[10px]`.
- **W6 [Warning]**: No z-index above the project's defined layer scale (e.g. `z-[9999]`). Follow IDE layer tokens (`--z-canvas`, `--z-panels`, `--z-modal`, `--z-popover`).
- **E7 [Error]**: No `!important` and no inline `style={{ ... }}` props for `color`, `background`, or `font`.

---

## 2. Structure

- **W8 [Warning]**: Repeated identical card markup (3+ copies) must become one reusable component with props. No copy-pasted card grids.
- **W9 [Warning]**: Component files stay small and single-purpose. Flag files over ~250 lines or JSX nesting deeper than ~6 levels.
- **E10 [Error]**: No dead code: unused exports, unused imports, commented-out blocks, leftover `TODO`/`FIXME`/`XXX` without an issue reference.
- **E11 [Error]**: No placeholder content: `lorem ipsum`, `John Doe`, `Acme`, `Feature one`, fake testimonials, or invented metrics.

---

## 3. Data Honesty

- **E12 [Error]**: Any hardcoded, simulated, or mock data must carry a visible "demo" label in code (e.g., `DEMO_` prefix or `source: "demo"` property) and in the UI.
- **E13 [Error]**: No `Math.random()` or timers used to fake data, progress, or loading in production paths.
- **E14 [Error]**: Numbers shown to users must carry units and a source or "demo" tag. Never change agronomic/cyber-physical meaning.

---

## 4. States and Async

- **E15 [Error]**: Every async surface renders loading, empty, error, and success states. No silent catch, no empty `catch {}` block, and no `console.log()` left in `src`.
- **W16 [Warning]**: No spinner-only loading for data panels; use a skeleton that matches the final layout to avoid cumulative layout shift (CLS).

---

## 5. Accessibility

- **E17 [Error]**: Interactive elements must be real buttons/links/inputs. A `div` or `span` with `onClick` needs `role`, `tabIndex`, and key handlers (`onKeyDown`), or must be replaced with `<button type="button">`.
- **E18 [Error]**: `outline-none` / `outline: none` is banned unless a visible `focus-visible` style (`focus-visible:ring-1 focus-visible:ring-[var(--agri-focus-ring)]`) replaces it in the same rule.
- **E19 [Error]**: Images must have an `alt` attribute. Icon-only buttons must have an accessible name (`aria-label` or `title`).
- **W20 [Warning]**: Animations must respect `prefers-reduced-motion` (`motion-reduce:...`). `animate-pulse`, `bounce`, and `ping` are only allowed for true loading or live cyber-physical status indication.

---

## 6. Type Safety & Security

- **E21 [Error]**: No `any`, `@ts-ignore`, or `@ts-nocheck` added by this work. Use strict TypeScript interfaces.
- **E22 [Error]**: No `dangerouslySetInnerHTML`, hardcoded keys, tokens, or secrets in code.

---

## 7. Scanner & Verification

- Scanner script: `scripts/anti-slop-scan.mjs`
- Baseline stored in: `.anti-slop-baseline.json`
- Verification commands:
  ```bash
  # Check anti-slop rules (0 new errors required)
  node scripts/anti-slop-scan.mjs
  # Check type safety
  npm run typecheck
  # Run regression and contract tests
  npm test
  # Build bundle
  npm run build
  ```
