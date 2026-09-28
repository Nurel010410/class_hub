# Class Hub integration

Added reusable frontend assets:

- `frontend/projects.js` — safe `fetch('/api/getProjects')`, timeout, response validation, HTML escaping, and `renderProjects()`.
- `frontend/projects.css` — minimal project-card styling.
- `apps-script/handleJoinRequestSubmission.gs` — replacement for the existing function in `code.js`. It correctly reads the project name/deadline through the column map, validates input, prevents duplicate pending requests, and returns a result object.

## Wire the frontend

Add these before the closing `</body>` in `index.html`:

```html
<link rel="stylesheet" href="/frontend/projects.css">
<script src="/frontend/projects.js" defer></script>
```

The page must contain a `#projectsList` element. Call `loadProjects()` after the DOM has loaded, or keep the existing initialization and replace its current project loader with `loadProjects()`.

## Wire Apps Script

Replace the current `handleJoinRequestSubmission()` in `code.js` with the contents of `apps-script/handleJoinRequestSubmission.gs`; do not keep two functions with the same name in the same Apps Script project.

The `/api/getProjects` route must proxy to the Apps Script `doGet?action=getProjects` endpoint and return JSON. The existing Cloudflare Worker currently accepts POST only, so it must be extended to proxy GET requests before this frontend endpoint can work.
