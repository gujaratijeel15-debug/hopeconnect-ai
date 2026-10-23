# HopeConnect AI

A community support board that connects local requests with available resources. The frontend has usable sample listings and deterministic match suggestions without requiring an API key or database. Its cream, tomato, rose, pink, and gold palette is defined in `src/styles.css`. The API provides MongoDB persistence, JWT session cookies, ownership checks, and optional server-side AI structuring.

## Requirements

- Node.js 20 or newer
- MongoDB for persistent listings

## Setup and run

```sh
npm install
Copy-Item .env.example .env
```

For the local single-user demo, keep `LOCAL_DEMO_MODE=true` in `.env` and set `MONGODB_URI` to a reachable local MongoDB database. Gemini drafting additionally requires `GEMINI_API_KEY` and `GEMINI_MODEL`. No account, session cookie, CSRF token, or SMTP setup is needed for the local demo. The API binds to `127.0.0.1` and rejects this mode when `NODE_ENV=production`. Run the API and frontend in separate terminals:

```sh
npm run server
npm run dev
```

Open the Vite URL (normally http://localhost:5173). The API listens on port 4000 by default. Use `npm run build` for a production frontend build and `npm start` to launch the API.

## Local demo workflow

The app opens at `/` without a login redirect. The local demo uses a stable MongoDB member identity (`single-user@hopeconnect.local`) so new requests and offers retain consistent ownership. Drafts are still reviewed and explicitly confirmed before publication. Listings and deterministic same-location matches remain available without signing in. Admin and account-management APIs are unavailable in this mode; they are not exposed as unauthenticated demo operations.

`LOCAL_DEMO_MODE` is an explicit opt-in and is disabled unless set to `true`. It is forcibly disabled when `NODE_ENV=production`, and the server listens only on the loopback interface (`127.0.0.1`). Do not expose this server to a network or use this mode for a shared deployment. The normal authentication APIs are disabled in this local demo configuration.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default 4000) |
| `LOCAL_DEMO_MODE` | Set `true` for local single-user API access. The server rejects demo mode when `NODE_ENV=production` and listens only on `127.0.0.1`. |
| `MONGODB_URI` | MongoDB connection string; without it, database endpoints are unavailable |
| `CLIENT_ORIGIN` | Exact frontend origin permitted by CORS |
| `AI_PROVIDER` | Text structuring provider: `gemini` (default), `openrouter`, or explicit `rules` fallback |
| `GEMINI_API_KEY` | Server-only Google AI Studio key required when `AI_PROVIDER=gemini` |
| `GEMINI_MODEL` | Gemini API model ID, for example `gemini-3.8-flash`; select a currently available model in Google AI Studio |
| `AI_MODEL` | Model name for the optional OpenAI-compatible provider |
| `AI_BASE_URL` | OpenAI-compatible provider API base URL (defaults to OpenRouter) |
| `AI_API_KEY` | Server-only OpenAI-compatible provider key; never put this in frontend variables |
| `STT_BASE_URL` | OpenAI-compatible speech transcription API base URL (default OpenAI API) |
| `STT_API_KEY` | Server-only speech transcription credential; blank disables transcription |
| `STT_MODEL` | Speech transcription model name; blank disables transcription |
Never commit `.env`. Keep this application on the local machine. If remote access is needed, put the frontend and every API route behind a VPN or an authenticated reverse proxy; do not expose the loopback API directly.

## Working features

- Responsive editorial community board with keyword, category, and status filters.
- Create request and resource offer forms with quantity, category, area, urgency, and browser speech recognition when supported. Typed entry always works.
- Sample listings stored locally in the browser for immediate demo use. They are not shared or server-persisted.
- Matching suggestions only include open requests and available offers in the same category and location. The deterministic score is category 60 points, location 25, adequate quantity 10 (3 for a partial quantity), and high/critical urgency 5, for a maximum of 100 fit points. This is not a probability. Cross-location matches are excluded pending a real delivery workflow. Human confirmation is required.
- Single-user local mode keeps new listing ownership linked to one stable MongoDB identity. Existing User and Entry models and records are retained. `/user` and `/provider` panels remain available without a login flow.
- Account and administrator APIs are disabled in single-user mode. Listing writes and AI/media processing require `LOCAL_DEMO_MODE=true`, a connected MongoDB, and a non-production environment; the API binds to `127.0.0.1`.
- Server-side Google Gemini text structuring using the official `@google/genai` SDK. Set `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, and `GEMINI_MODEL`; the API validates a strict structured response and never silently falls back when Gemini fails. The default model example is `gemini-3.8-flash`; choose a model currently available to your API key in Google AI Studio and set its exact model ID.
- Optional OpenAI-compatible text structuring remains available with `AI_PROVIDER=openrouter`, `AI_API_KEY`, and `AI_MODEL`. Set `AI_PROVIDER=rules` to explicitly use approximate local extraction without an external provider.
- Assistant workflows for help requests and resource offers. Gemini receives the selected workflow, proposes an editable draft, flags missing quantity or location instead of inventing values, and publishes only after explicit confirmation. Schema validation checks structure, not the truth of user-provided facts.
- Browser audio recording and transcription upload remain available in local mode. Supported audio types are WebM, WAV, MP3, and MP4/M4A, up to 25 MB. Uploads are temporary, rate-limited, signature checked, and deleted after processing. The transcription provider must accept the chosen format.
- Local image/audio/video previews and live camera preview/video recording. Media remains in the browser until the user submits it.

## Limitations

- This single-user mode is intended for local development. It is disabled when `NODE_ENV=production` and the API binds to loopback; do not publish it without a separate access-control layer.
- Image and video uploads are signature checked and handled in private temporary storage, but image analysis, video audio extraction, and frame analysis are not configured. The API returns an explicit unavailable response and does not fabricate analysis. Audio transcription requires `STT_API_KEY` and `STT_MODEL`; no third-party media processing occurs without those settings.
- Temporary media is deleted after a request and when the API receives SIGINT/SIGTERM. Local temporary storage is ephemeral and suitable for a single server instance; production deployments should provide a private, access-controlled temporary volume and process supervision.
- No messaging, contact sharing, fulfillment reservation, or quantity decrement workflow exists. The board does not expose contact details. Owners can close or cancel their own requests, but offers cannot be marked fulfilled until an allocation workflow exists; matches are suggestions, not reservations.
- The current matching policy requires the same normalized city/area and does not infer travel or delivery distance.
- Text-only Gemini integration does not provide image/video understanding, traffic, weather, or news. Audio transcription remains a separate optional OpenAI-compatible service. Match scoring remains deterministic and uses actual saved records; AI output never authorizes access, writes database records, or fabricates matches.

## Tests

```sh
npm test
```

Run `npm test` for unit and UI tests. Gemini SDK behavior is tested through a mocked client boundary; tests do not need a key and do not contact Google. `npm run build` checks the production frontend bundle. MongoDB API integration tests require a disposable test database and are not included.

### Gemini setup

1. Create an API key in [Google AI Studio](https://aistudio.google.com/app/apikey). Keep it server-side in `.env` as `GEMINI_API_KEY`; never add it to `VITE_*` variables or frontend source.
2. Set `AI_PROVIDER=gemini` and choose a currently supported model ID for `GEMINI_MODEL` in Google AI Studio. The example uses `gemini-3.8-flash`, but model availability depends on the account and API release.
3. Restart `npm run server`, then start the frontend with `npm run dev`. The assistant reports the selected provider in its draft label; a rule-based draft is labeled separately and is only used when `AI_PROVIDER=rules` is selected.
4. Run `npm test` and `npm run build`. These use mocked Gemini responses and do not make a paid/live provider request. To smoke-test a live key, prepare a draft in the local app; no draft is saved until you confirm publication.
