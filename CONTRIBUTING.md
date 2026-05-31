# Contributing

Thanks for helping improve MoneyForward Toolpack. This is an early-stage Chrome
extension that touches sensitive household finance pages, so small, focused, and
privacy-aware pull requests are preferred.

## Setup

This repository includes `pnpm-lock.yaml`, so use pnpm for dependency
installation. `corepack pnpm` works even when the standalone `pnpm` command is
not installed.

```bash
corepack pnpm install --frozen-lockfile
```

## Build

```bash
corepack pnpm run build
```

The build script recreates `dist/` for loading the extension in Chrome.

## Test

```bash
corepack pnpm run test
```

## Lint and Format

```bash
corepack pnpm run lint
corepack pnpm run check
corepack pnpm run format
```

`format` may modify files. Review the diff before committing.

## Pull Request Checklist

- Keep the PR focused on one intent.
- Run the relevant build, test, lint, or check command before requesting review.
- Update documentation when behavior, permissions, storage, or setup changes.
- Avoid committing generated archives, API keys, browser profile data, or
  personal finance data.
- Use sample or mock data in tests and documentation.

## Security and Privacy Checklist

For Chrome extension changes, check whether the PR:

- Adds or broadens Chrome permissions or host permissions.
- Changes content script behavior on MoneyForward pages.
- Changes `chrome.storage` keys, storage location, or fallback behavior.
- Changes Gemini API key handling or the transaction fields sent to Gemini.
- Changes CSV download, clipboard, or file naming behavior.
- Changes screen masking selectors, default state, or toggle behavior.
- Introduces any developer-managed backend, telemetry, analytics, or hidden
  network request.

If any item applies, explain the risk and verification in the PR description.
