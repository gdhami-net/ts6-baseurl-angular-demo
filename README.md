# ts6-baseurl-angular-demo

An Angular 22 workspace with the tsconfig that Angular CLI 16 and earlier
generated: `"baseUrl": "./"`, two path aliases written relative to it
(`@app/*`, `@env/*`), and one bare import (`src/app/shared/format-name`) that
only resolves because of `baseUrl`.

Companion to the post "Fix the baseUrl error that TypeScript 6 raises in older
Angular workspaces" on gdhami.net.

## What it proves

`npm run check` builds the workspace once per tsconfig in `variants/` and
asserts:

1. With `baseUrl`, `ng build` fails with
   `TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0. Specify compilerOption '"ignoreDeprecations": "6.0"' to silence this error.`
   It is an error, not a warning.
2. Adding `"ignoreDeprecations": "6.0"` (`variants/bridge`) makes it build.
3. Deleting `baseUrl` and leaving the paths as `"src/app/*"` (`variants/half-fix`)
   fails with `TS5090: Non-relative paths are not allowed when 'baseUrl' is not set.`
4. Paths written as `"./src/app/*"` with no `baseUrl` (`variants/fixed-no-star`)
   keep both aliases working, but the bare import fails with TS2307.
5. Adding `"*": ["./*"]` (`variants/fixed`) brings the bare import back.
6. Converting the bare import to `@app/shared/format-name`
   (`variants/aliases-only/app.ts`) builds without `"*"`.
7. TypeScript 7.0.2 rejects `baseUrl` with TS5102 even when
   `"ignoreDeprecations": "6.0"` is set (plus TS5090 for the paths with no
   leading `./`), type-checks the fixed workspace, and accepts
   `"ignoreDeprecations": "6.0"` on its own (`variants/fixed-with-ignore`).
8. `@andrewbranch/ts5to6 --fixBaseUrl`, run on a temporary copy, writes exactly
   `variants/fixed/tsconfig.json`, `"*"` entry included.
9. No Angular 22 update migration (`@angular/core/schematics`,
   `@schematics/angular/migrations`) contains the string `baseUrl`.

The committed `tsconfig.json` is the old one, so `npm run build` shows the error
straight away. The check script puts it back after every step.

`npm run check:templates` (needs network) downloads `@schematics/angular` for
CLI 7.3 through 22.2 (one or two releases per major, 9 to 22, plus 7 and 8) and checks which new-workspace templates contained
`"baseUrl": "./"`: every version checked up to 16.2.16, none from 17.0.0 on.

## Run it

```
npm ci
npm run check            # about 20 seconds
npm run check:templates  # optional, downloads 18 packages
npm run build            # the error, as a reader sees it after upgrading
```

## Versions it was run with

- Windows 11, Node.js 26.1.0, npm 11.13.0
- Angular 22.2.2 (`@angular/core`, `@angular/cli`, `@angular/build`)
- TypeScript 6.0.3 (what Angular builds with; its peer range is `>=6.0 <6.1`)
- TypeScript 7.0.2, installed as the npm alias `typescript7` so it doesn't
  replace 6.0.3. It does take over `node_modules/.bin/tsc`, so `npx tsc -v`
  prints 7.0.2 in this folder; Angular itself still loads 6.0.3.
- `@andrewbranch/ts5to6` 1.1.1

## The ng update run

Not part of `npm run check`, because it needs a second workspace. On
2026-10-11: a fresh Angular 21.2.26 workspace (TypeScript 5.9.3), with
`"baseUrl": "./"` and an `@app/*` path added and committed, then
`ng update @angular/core@22 @angular/cli@22`. The update moved TypeScript to
6.0.3 ("Updating package.json with dependency typescript to version 6.0.3..."),
ran its migrations, printed nothing about `baseUrl` and left `tsconfig.json`
untouched. `ng build` then failed with the TS5101 error above.

## Edge cases the post leaves out

- **Bare imports that read `app/...`.** With the CLI's root `"baseUrl": "./"`,
  bare imports start with `src/`. If yours start with `app/`, some tsconfig sets
  `baseUrl` to `src`, and the catch-all becomes `"*": ["./src/*"]` (written
  relative to that tsconfig). Not tested here.
- **`"*"` makes root files shadow packages.** With `"paths": {"*": ["./*"]}`,
  a file named `rxjs.ts` in the workspace root wins over the `rxjs` package for
  TypeScript (checked with `tsc --traceResolution` on TypeScript 6.0.3 in a
  scratch folder; esbuild not tested). That is the behaviour TypeScript
  deprecated `baseUrl` for, which is why the post prefers aliases.
- **TypeScript 7 still accepts `"ignoreDeprecations": "6.0"`.** A config with
  that line and no deprecated options type-checks on 7.0.2. The line just no
  longer does anything for `baseUrl`. The TypeScript 6.0 release notes say
  "TypeScript 7.0 will not support this option at all", which reads stronger
  than what 7.0.2 does.
- **Other TypeScript 6 deprecations.** Older workspaces often also carry
  `"moduleResolution": "node"`, which TypeScript 6 deprecates too. This demo
  uses the CLI 22 defaults for everything except `baseUrl` and `paths`, so it
  doesn't show that error.
- **Libraries and several tsconfigs.** A workspace with `projects/` libraries
  has more files to edit; that is where the codemod saves real time. Its README
  doesn't mention that it adds `"*"` when it finds an import that relies on
  `baseUrl`; it did here, and it left `"*"` out on a copy with no bare import.
- **CLI 6.x templates** could not be downloaded with `npm pack` from this
  machine, so they are not in `check:templates`.

## License

MIT, see `LICENSE`.
