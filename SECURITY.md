# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |
| < 1.0 | No |

## Reporting a vulnerability

Please **do not** open a public issue for a security vulnerability.

Preferred:

- Open a private report through GitHub Security Advisories:
  `https://github.com/Paperpiece-Cloud/PaperDeck/security/advisories/new`

Alternative:

- Contact the maintainer at **leezm0311new@gmail.com**

Please include:

- Affected version
- Windows version
- Reproduction steps or proof of concept
- Impact assessment
- Any relevant logs, without personal data

You can expect an acknowledgement within a reasonable time. Please allow time
for a fix and coordinated disclosure before publishing details.

## Scope

PaperDeck is a local desktop application. Relevant security areas include:

- IPC boundaries between main and renderer processes
- PowerShell command construction and paths
- External media/lyric requests
- Handling of local files and screenshots
- Installer/update integrity

## Not in scope

- Issues requiring physical access to an unlocked machine
- Vulnerabilities in Windows, Electron, or third-party players that are not
  caused by PaperDeck's integration
- Social engineering
- Denial of service from intentionally malformed local media files without a
  demonstrable security impact

## Unsigned builds

Official builds are currently unsigned. Verify the SHA-256 checksum published
with each release. If your threat model requires Authenticode, build from source
and sign the resulting binaries with your own certificate.
