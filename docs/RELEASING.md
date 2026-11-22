# Releasing PaperDeck

PaperDeck ships as a full Windows NSIS installer. Incremental update packages
are not published.

## 1. Prepare the version

1. Update `version` in `package.json` and `package-lock.json`.
2. Add a section to `CHANGELOG.md`.
3. Update the version shown in the README if necessary.
4. Confirm the About page shows the new version.

## 2. Verify locally

```bash
npm ci
npm run pack:dir
npm start
```

Test at minimum:

- First launch and setup window
- Secondary display selection, including 720P / 1080P / 4K auto scaling
- CPU/GPU metrics
- Media metadata and artwork
- Lyrics (local and online)
- Control center toggles
- Volume/brightness modal
- Tray icon and tooltip
- Restart with existing configuration

## 3. Build the installer

```bash
npm run dist
```

The installer is written to `release/`.

Builds are currently unsigned. Do not claim an Authenticode publisher unless a
trusted code-signing certificate was used.

## 4. Generate the checksum

```powershell
Get-FileHash release/PaperDeck-<version>-x64.exe -Algorithm SHA256
```

Publish the value in the release notes and `SHA256.txt`.

## 5. Publish

1. Create a tag `v<version>`.
2. Attach the installer and checksums to the GitHub release.
3. Mention unsigned-build warnings and any known limitations.
4. Verify the downloaded file matches the published hash.

## 6. Source archive

Create a source archive excluding `node_modules/`, `release/`, caches, local
configuration, certificates, and logs. Include the lockfile and all files needed
to run `npm ci && npm start`.
