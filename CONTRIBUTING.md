# Contributing to PaperDeck

Thanks for taking the time to contribute.

## Before you start

- Search existing issues and pull requests first.
- For a large feature or architectural change, open an issue before writing code.
- For security issues, do **not** open a public issue. See [SECURITY.md](SECURITY.md).

## Development setup

Requirements:

- Windows 10 or 11
- Node.js 22+ (24 recommended)
- npm

```bash
git clone https://github.com/Paperpiece-Cloud/PaperDeck.git
cd PaperDeck
npm install
npm start
```

Useful commands:

```bash
npm run dev       # development launch
npm run pack:dir  # unpacked build
npm run dist      # NSIS installer
```

## Coding guidelines

- Keep runtime renderer code framework-free: plain HTML/CSS/JS.
- Use 2-space indentation for JS/JSON/CSS/HTML and Markdown.
- Prefer small, focused modules under `src/main/`.
- Do not add Node.js access to renderer code; extend `preload.js` instead.
- Sanitize any external text before inserting it into the DOM.
- Avoid hard-coded absolute paths; use `paths.js`.
- New PowerShell bridges must use hidden windows, timeouts, and UTF-8 output.
- Keep the display layout usable at 798 × 480 and with touch targets enabled.

## Commit style

Use short imperative subjects, for example:

```text
fix: preserve artwork when track changes
feat: add centered volume modal
docs: document local lyric lookup
```

## Pull requests

- Keep the change focused.
- Include a short description of the problem and solution.
- Add screenshots for visible UI changes.
- Mention any Windows version or player used for testing.
- Run `npm run pack:dir` before submitting if your change affects packaging.
- Do not commit build output, certificates, local config, or generated caches.

## Reporting bugs

Use the bug report template and include:

- PaperDeck version
- Windows version and display layout
- Player and track (if media-related)
- Steps to reproduce
- Expected/actual behavior
- Logs or screenshots when useful

## License

By contributing, you agree that your contributions are licensed under the
project's GNU General Public License v3.0 only (GPL-3.0-only).
