# IntelliLibrary AI Coding Instructions

These guidelines help AI agents contribute productively to this Vite + React + TypeScript SPA. Focus on existing patterns—do not introduce backend frameworks.

## Architecture Overview
- Single-page app: `App.tsx` manually switches views via a discriminated union `View`; no router. To add a view: extend `View`, update `Navbar` + `renderView` switch.
- Data + business logic lives in `services/apiService.ts` (mock DB over `localStorage` for users, papers, groups, invitations). Treat it as the authoritative in-browser persistence layer.
- AI integrations: `services/geminiService.ts` (chat / virtual librarian) and `services/quizService.ts` (quiz JSON generation). Both call Gemini model `gemini-2.5-flash`.
- Types centralized in `types.ts`; always extend or reuse these instead of ad-hoc inline shapes.

## Environment & Build
- Scripts: `npm run dev` (Vite), `npm run build`, `npm run preview`.
- Path alias: `@/*` resolves to project root (see `tsconfig.json`). Prefer relative clarity; do not invent deeper alias layers.
- NOTE: README expects `GEMINI_API_KEY`; code uses `process.env.API_KEY`. Align by either adding `API_KEY` variable or refactoring to `process.env.GEMINI_API_KEY` consistently if you touch env usage. Keep changes localized.

## Data & Persistence Patterns
- LocalStorage keys defined at top of `apiService.ts` (e.g. `intellilibrary_users`). Reuse constants; do not hardcode duplicate keys.
- Password hashing is a reversible demo (`hashPassword` reverses string + salt). Do not replace with real crypto unless explicitly requested; keep interface stable.
- All async service functions simulate latency via `simulateNetworkDelay`; when adding new service calls, use consistent delay patterns for UX parity.

## Searching & RAG Flow
- `searchPapers(query, filters)` performs lightweight scoring: title (3), summary (0.5), author tokens (2), explicit author extraction (5), year match (2). If enhancing, preserve scoring weights unless a clear justification is given.
- Chat flow (`Chatbot.tsx`): 1) user input -> 2) local search (`searchPapers`) -> 3) build prompt with header `--- SEARCH RESULTS ---` (mandatory) -> 4) Gemini response via `generateChatResponse`. Maintain this header verbatim; system instruction depends on it.
- Empty result case must include `No relevant documents found` to allow model fallback to general knowledge.

## AI Prompting Conventions
- System instruction in `geminiService.ts` enforces library-first truth, no hallucinations. Preserve the numbered rule block if modifying.
- Quiz generation: strict JSON contract (questions[], four options, answerIndex 0–3). If parsing fails, throw meaningful errors like existing code. Keep `sanitizeJson` approach when adjusting formatting.

## Views & State
- Global user/auth + invitations + chat message state are lifted in `App.tsx`. Add new cross-view state only there or via a dedicated context provider (if truly needed). Avoid prop drilling explosions.
- When adding group-related behavior, use existing invitation flow patterns (`inviteUserToGroup`, `respondToInvitation`). Ensure membership updates persist via `saveGroups`.

## Error & Edge Handling
- Services throw `Error` with user-readable messages (login, group/invite). Surface these in UI components with minimal string transformation.
- Always strip sensitive fields (e.g. `hashedPassword`) before returning user objects—follow existing pattern in auth functions.

## Extension Examples
- New paper attribute: add field in `Paper` interface (in `types.ts`), populate in `mockPapers`, adjust search scoring if relevant.
- New view (e.g. analytics): extend `View`, add a `case` in `renderView`, update `Navbar` with badge logic if needed.
- New AI feature: create `services/<feature>Service.ts` mirroring error handling + env key pattern from existing Gemini services.

## Contributing Rules for AI Agents
- Do not introduce server calls or external DB without explicit instruction—this project is client-only mock data.
- Prefer incremental refactors; avoid wide stylistic rewrites (keep utility class styling intact).
- Keep line-oriented JSON error messages short and explicit ("Failed to parse quiz JSON.").
- Before changing environment variable names, note the mismatch in PR description.

## Quick Reference
`App.tsx` (view/state) • `services/apiService.ts` (mock backend) • `services/geminiService.ts` (chat AI) • `services/quizService.ts` (quiz AI) • `types.ts` (schema) • `components/Chatbot.tsx` (RAG flow UI).

Clarify any ambiguous area (e.g. adding persistence, synch policies) before large changes.
