SeraVault Firebase
==================

Setup
-----
- Install Node.js 18+ and npm.
- Install deps: `npm install`.
- Copy environment template (e.g., `.env.test` → `.env`) and fill secrets.
- Install Firebase CLI and log in: `firebase login`.
- Select project: `firebase use <project-id>`.

Development
-----------
- Start dev server: `npm run dev`.
- Run tests (optional): `npm test`.

Build & Deploy
--------------
- Build app: `npm run build`.
- Deploy hosting/app only: `npm run deploy:app`.
- Deploy all Firebase targets (no landing): `npm run deploy:all`.

Config Notes
------------
- Firebase config is ignored; use `.firebaserc.example` as a template.
- Keep secrets out of git (env files, service accounts).***
