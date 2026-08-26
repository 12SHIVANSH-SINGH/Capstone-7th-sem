# Testing and quality

No `*.test.*` or `*.spec.*` application files were found. The backend has no test framework/configuration; its declared test command deliberately fails:

```sh
cd attendance-backend
npm test
```

Observed output: `Error: no test specified`.

The frontend declares CRA's `react-scripts test` and CRA ESLint presets, but no frontend test files or standalone lint/format/typecheck command exist. Its test runner requires installation first:

```sh
cd attendance-frontend
npm test
```

No CI files establish a noninteractive test invocation. The conventional CRA watch behavior described by its generic README should not be reported as project CI behavior.

Before first behavior changes, create/confirm a maintainer-approved test approach. High-value uncovered areas are authentication, WebAuthn, code expiry, access control, and geolocation bounds.
