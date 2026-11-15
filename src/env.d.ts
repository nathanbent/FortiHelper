/// <reference types="vite/client" />

/** Repository URL, injected by vite from package.json's `repository` field. */
declare const __REPO_URL__: string;

/** `version` from package.json, injected by vite. */
declare const __APP_VERSION__: string;

/** Full hash of the commit the build was made from; empty outside a git checkout. */
declare const __BUILD_COMMIT__: string;

/** Date of that commit as YYYY-MM-DD; empty outside a git checkout. */
declare const __BUILD_DATE__: string;
