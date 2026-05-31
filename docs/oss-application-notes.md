# OSS Application Notes

## Project importance

MoneyForward Toolpack focuses on a sensitive and common problem: reviewing
household finance data without unnecessarily moving it away from the user's own
browser. Personal finance data can reveal spending habits, subscriptions,
medical or family-related expenses, and other private information.

Subscription review, duplicate-payment detection, and category mistake checks
are common needs during monthly budget reviews. A local-first browser extension
can provide a privacy-friendly alternative to uploading transaction data to a
third-party backend. The project is also useful for screen sharing and
screenshot workflows because masking can reduce accidental disclosure of
household finance details.

The project is still early-stage, but it is worth growing because the security
and privacy boundaries are concrete, reviewable, and useful to users who want
more control over their own financial review workflow.

## Planned use of API credits

API credits would be used to improve maintainability and review quality, not to
replace user control over their own data. Planned uses include maintainer
automation, automated review assistance, test generation, regression checks for
DOM parsing, documentation improvements, release notes, and security-focused
review prompts.

Credits may also support optional AI-assisted classification improvements, while
keeping the user in control of whether AI analysis is enabled and which API key
is used.

## Why Codex Security is needed

This Chrome extension touches sensitive browser surfaces. Content scripts
interact with financial pages, local storage and API key handling need careful
review, and CSV download plus screen masking features directly affect user
privacy.

Codex Security would help review realistic attack paths around Manifest V3
permissions, content script boundaries, Gemini API request handling, local
storage behavior, clipboard or download flows, and DOM parsing assumptions. The
project benefits from small, reviewable security fixes because permission scope
and privacy expectations should stay easy for users and maintainers to audit.
