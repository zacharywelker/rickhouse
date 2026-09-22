# Security Policy

## Supported Versions

Security fixes are provided for the latest version of the application on the `main` branch.

Older versions are not supported.

## Reporting a Vulnerability

If you discover a security vulnerability, please do not open a public GitHub issue.

Instead, report it privately through GitHub's **Report a vulnerability** feature, if available.

Please include:

* A description of the vulnerability
* Steps to reproduce it
* The potential impact
* Any relevant logs, screenshots, or proof-of-concept code
* The affected version or commit, if known

Please allow reasonable time for the issue to be investigated and fixed before publicly disclosing it.

## Scope

Security issues of particular concern include:

* Authentication or authorization bypass
* Exposure of passwords, tokens, API keys, or other secrets
* Unauthorized access to application data
* SQL injection or other injection vulnerabilities
* Remote code execution
* Cross-site scripting (XSS)
* Server-side request forgery (SSRF)
* Vulnerabilities that allow an attacker to escape the application's intended access boundaries

## Out of Scope

The following are generally not considered security vulnerabilities:

* Issues requiring physical access to the server
* Vulnerabilities in third-party dependencies that are not caused by this project
* Issues requiring an already-compromised administrator account
* Denial-of-service attacks against a privately hosted installation
* Security issues resulting solely from intentionally insecure local configuration

## Disclosure

Security vulnerabilities will be investigated and addressed as appropriate. Public disclosure should occur only after a fix or mitigation is available.
