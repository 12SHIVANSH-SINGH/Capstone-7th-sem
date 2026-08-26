# Development workflow

Use each nested directory as its own repository; do not run root-level npm or Git commands expecting a monorepo. Confirm local changes separately:

```sh
git -C attendance-backend status --short
git -C attendance-frontend status --short
```

Regular source-evidenced commands after dependency installation are:

```sh
cd attendance-backend && npm start
cd attendance-frontend && npm start
cd attendance-frontend && npm run build
cd attendance-frontend && npm test
```

There is no backend dev/watch script, lint, formatter, migration, seed, typecheck, debug, or production script. Avoid inventing them in project guidance.

Read backend route/controller/model changes together with every frontend component that calls the endpoint: request contracts are duplicated and implicit. Treat `controllers/userController.js`, `models/userModels.js`, `controllers/codeController.js`, and `models/uniqueCodeModels.js` as high-impact areas.
