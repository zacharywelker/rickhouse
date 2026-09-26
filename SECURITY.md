# Security Policy

Only the latest version on `main` gets security fixes.

## Reporting a vulnerability

Don't open a public issue. Report it privately with GitHub's [**Report a vulnerability**](https://github.com/zacharywelker/rickhouse/security/advisories/new) form, and include:

- what the vulnerability is and how to reproduce it
- its impact
- the affected version or commit, if you know it
- any logs or proof of concept

Please wait for a fix or mitigation before disclosing publicly.

## Scope

**In scope:** authentication or authorization bypass, access to another account's data, leaked secrets, injection (SQL, XSS, etc.), SSRF and remote code execution.

**Out of scope:** attacks that need physical access or an already-compromised admin account, denial of service against a private install, vulnerabilities in third-party dependencies that this project didn't cause, and deliberately insecure local configuration.
