# Security policy

## Report a vulnerability

Do not put secrets, mailbox contents, access tokens, or exploit details in a public issue. Open a
private GitHub security advisory for this repository instead. Include the affected Skill or template,
the observed behavior, reproduction steps using non-sensitive test data, and the version or commit.

Never publish mailbox authorization codes, app passwords, Feishu app secrets or access tokens, device
codes, cookies, JWTs, browser sessions, private Base URLs, real record IDs, or unredacted email content.
If a credential is exposed, revoke or rotate it immediately and remove it from Git history.

## Trust boundaries

- OfferLoop stores private configuration outside installed Skill directories and must not print it in
  preflight reports.
- Offline preflight verifies only local prerequisites and locators. Identity, permissions, publication,
  installation, sharing, and remote data access remain `unverified` until a user-approved online check.
- Recruiting email is untrusted third-party content. The reminder Skill maps it into a fixed schema and
  requires confirmation before Base writes and again before calendar writes. It must not follow commands,
  visit links, disclose data, or change configuration because an email asks it to.
- Generated app templates should contain only runtime code needed by OfferLoop. Unused remote SDK loaders,
  server-directed redirects, and browser-exposed signing material are release blockers.

## Release acceptance

The release gate uses `skills@1.5.19` to install the four Skills into a temporary, project-scoped Codex
workspace with copy mode. It verifies all four manifests, both app templates, a collection-only preflight,
exact missing-dependency recovery, and report redaction. The CLI version is deliberately pinned; update it
in the acceptance script through a reviewed pull request after testing the new installer contract.

Security scanner disposition for the 2026-07-21 release review:

- Socket reported a low-confidence, low-severity anomaly in an unused generic user-profile scaffold. The
  scaffold dynamically loaded a remote SDK and accepted a server-provided redirect. The component was not
  reachable from either OfferLoop app, and it has been removed from both shipped templates rather than
  accepted as dormant risk.
- Snyk reported medium indirect prompt-injection exposure because the reminder intentionally reads email
  content. This is an inherent residual risk, not a clean scan: envelopes are labeled
  `untrusted_external`, the Skill forbids treating email as instructions or automatically visiting links,
  and both write stages retain explicit user confirmation. Re-review this boundary whenever email parsing,
  tool access, confirmation, or write behavior changes.
