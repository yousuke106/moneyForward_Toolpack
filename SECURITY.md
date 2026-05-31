# Security Policy

## Supported Versions

Security fixes are considered for the `main` branch and the latest published
release, if a release exists.

## Reporting a Vulnerability

Please do not report suspected vulnerabilities with full technical details in a
public GitHub Issue.

If a private maintainer contact or GitHub Security Advisory channel is available
for this repository, use that channel first. If no private channel is visible,
open a minimal public issue asking for a private security contact and do not
include exploit steps, secrets, personal finance data, or API keys.

## Scope

Security reports are in scope when they relate to this extension, including:

- Chrome extension permissions and Manifest V3 behavior.
- Content scripts running on MoneyForward pages.
- Local storage, `chrome.storage.sync`, and `chrome.storage.local` behavior.
- Gemini API key handling and optional Gemini API requests.
- Clipboard, download, and CSV behavior triggered by extension features.
- Screen masking behavior intended to reduce accidental disclosure during screen
  sharing or screenshots.

## Out of Scope

The following are outside this project's security scope:

- Vulnerabilities in MoneyForward ME or the MoneyForward service itself.
- Issues that require a compromised user device, compromised browser profile, or
  malicious local extension environment.
- Social engineering, phishing, or attacks that rely on tricking users outside
  this extension's behavior.
- Findings based only on stale DOM selectors without a concrete security impact.

## Security Goals

This project aims to keep security and privacy reviewable by focusing on:

- Minimum necessary Chrome extension permissions.
- No collection of MoneyForward login credentials.
- No hidden data exfiltration to a developer-managed backend.
- Transparent, user-controlled features for Gemini analysis, CSV download, and
  screen masking.
- Small, reviewable changes when permissions, storage, network requests, or DOM
  parsing behavior changes.
