# Vertex AI Gemini Migration

This document describes the migration from **Gemini Developer API** (AI Studio / Generative Language API) to **Vertex AI Gemini**, and how to verify that the app uses Vertex AI.

---

## 1. Which SDK is used in each backend service?

| Service | When **Vertex AI** is used | When **Developer API** is used |
|--------|-----------------------------|---------------------------------|
| **roadmap_service** | `vertexai.generative_models.GenerativeModel` (google-cloud-aiplatform) | `google.generativeai.GenerativeModel` |
| **library_service** (document_structured) | Same Vertex SDK | Same genai SDK |
| **summary_service** | Vertex SDK | genai SDK |
| **paraphrase_service** | Vertex SDK | genai SDK |
| **quiz_service** | Vertex SDK | genai SDK |
| **librarian_service** | Vertex SDK | genai SDK |
| **groups_service** (notes_summarizer) | Vertex SDK | genai SDK |

**Rule:** If `VERTEX_AI_PROJECT` and `VERTEX_AI_LOCATION` are both set, the service uses **Vertex AI**. Otherwise it uses the **Gemini Developer API** with `GEMINI_API_KEY`.

---

## 2. What endpoint is called?

- **Vertex AI path:** Requests go to **Vertex AI** endpoints (e.g. `{location}-aiplatform.googleapis.com`), not to the Generative Language API. The SDK uses your GCP project and location (e.g. `us-central1`).
- **Developer API path:** Requests go to **Generative Language API** (`generativelanguage.googleapis.com`), using the Gemini API key.

At startup, each service logs which path is active, for example:
- `roadmap_service Gemini: path=Vertex AI | model=... | SDK=... | endpoint=Vertex AI (project=..., location=...)`
- or `path=Gemini Developer API | endpoint=Generative Language API (generativelanguage.googleapis.com)`.

---

## 3. API key vs Vertex

- **Vertex AI:** Does **not** use `GEMINI_API_KEY`. It uses **Application Default Credentials** (ADC): either `gcloud auth application-default login` or a service account key in `GOOGLE_APPLICATION_CREDENTIALS`.
- **Developer API:** Uses **only** `GEMINI_API_KEY` (from AI Studio).

---

## 4. Project / location for Vertex AI

When using Vertex AI, the code explicitly sets:

- **Project ID:** from `VERTEX_AI_PROJECT`
- **Location:** from `VERTEX_AI_LOCATION` (e.g. `us-central1`)

These are passed to `vertexai.init(project=..., location=...)` in each service.

---

## 5. Debug logs

Each service logs at **INFO** on startup:

- Which **path** is active: `Vertex AI` or `Gemini Developer API`
- Which **model** is used (e.g. `gemini-2.5-flash`)
- Which **SDK/client** is initialized
- Which **endpoint family** is targeted (Vertex AI vs Generative Language API)

With **DEBUG** logging (e.g. `ROADMAP_LOG_LEVEL=DEBUG` or `SUMMARY_SERVICE_LOG_LEVEL=DEBUG`), per-request logs also print path, model, and endpoint so you can confirm each call.

---

## 6. Files changed

| File | Change |
|------|--------|
| `backend/roadmap_service/main.py` | Vertex init + fallback to Developer API; debug logs; `generate_content(prompt)` string |
| `backend/roadmap_service/requirements.txt` | Added `google-cloud-aiplatform>=1.38.0` |
| `backend/library_service/app/services/document_structured.py` | Vertex init + fallback; debug logs; `_get_model()` sets path/SDK/endpoint |
| `backend/library_service/requirements.txt` | Added `google-cloud-aiplatform>=1.38.0` |
| `backend/summary_service/main.py` | Vertex init + fallback; debug logs; string prompt |
| `backend/summary_service/requirements.txt` | Added `google-cloud-aiplatform>=1.38.0` |
| `backend/paraphrase_service/main.py` | Same pattern as summary |
| `backend/paraphrase_service/requirements.txt` | Added Vertex SDK |
| `backend/quiz_service/main.py` | Same pattern; `_extract_json_text(result: Any)`; string prompt |
| `backend/quiz_service/requirements.txt` | Added Vertex SDK |
| `backend/librarian_service/app/core/config.py` | Added `VERTEX_AI_PROJECT`, `VERTEX_AI_LOCATION` |
| `backend/librarian_service/app/api/v1/routes.py` | `_get_librarian_model()` Vertex or genai; guard uses model presence; debug log |
| `backend/librarian_service/requirements.txt` | Added `google-cloud-aiplatform>=1.38.0` |
| `backend/groups_service/app/services/notes_summarizer.py` | Vertex init + fallback; debug logs; string prompt; `_get_model()` returns None if no config |
| `backend/groups_service/requirements.txt` | Added Vertex SDK |
| `backend/.env.example` | Documented Vertex vs API key options |
| `backend/library_service/.env.example` | Documented Vertex + API key |

---

## 7. Previous vs new integration path

- **Previous:** All services used only the **Gemini Developer API**:
  - SDK: `google.generativeai` (`genai.configure(api_key=...)`, `genai.GenerativeModel`)
  - Endpoint: **Generative Language API** (`generativelanguage.googleapis.com`)
  - Auth: **Gemini API key** only.

- **New:** Each service can use **either** path:
  - **If** `VERTEX_AI_PROJECT` and `VERTEX_AI_LOCATION` are set → **Vertex AI**:
    - SDK: `vertexai` from `google-cloud-aiplatform` (`vertexai.init(project=..., location=...)`, `GenerativeModel` from `vertexai.generative_models`)
    - Endpoint: **Vertex AI** (project + location).
    - Auth: **Application Default Credentials** (no API key for Vertex).
  - **Else** if `GEMINI_API_KEY` is set → **Developer API** (unchanged behavior).
  - **Else** → no Gemini (service may fail or skip AI features).

---

## 8. Env vars you need for Vertex AI

Set these in the environment (or in each service’s `.env` if you use dotenv):

```bash
VERTEX_AI_PROJECT=your-gcp-project-id
VERTEX_AI_LOCATION=us-central1
```

Do **not** rely on changing only `GEMINI_API_KEY` to “switch” to Vertex: the code chooses the path from **presence of Vertex vars**, not from the key.

**Auth for Vertex:**

- **Option A:** `gcloud auth application-default login` (use your user credentials).
- **Option B:** Service account key: set `GOOGLE_APPLICATION_CREDENTIALS` to the path to the JSON key file.

Optional (for Developer API fallback or when not using Vertex):

```bash
GEMINI_API_KEY=your_ai_studio_key
```

---

## 9. How to verify in Google Cloud Console that requests use Vertex AI

1. **Enable the API**  
   In Google Cloud Console → **APIs & Services** → **Enable APIs** → enable **Vertex AI API** for your project.

2. **Billing**  
   Vertex AI is billable. Ensure the project has billing enabled (e.g. your $300 credits). Usage appears under that project, not under the free AI Studio tier.

3. **Check usage**  
   - **Console:** **Vertex AI** → **Dashboard** (or **Generative AI** section). Usage and model calls for your project/location appear here.  
   - **Billing:** **Billing** → **Reports** → filter by “Vertex AI” or “Generative AI” to see cost/usage.

4. **Logs**  
   - In the **service logs** (e.g. `./logs/roadmap_service.log`), look for:  
     `path=Vertex AI | endpoint=Vertex AI (project=..., location=...)`.  
   - If you see `path=Gemini Developer API` and `Generative Language API`, that request used the old path.

5. **No Generative Language API usage for Vertex path**  
   When the app uses Vertex AI, **Generative Language API** (the one used with the AI Studio key) is **not** called for that service. So:
   - API key quota in AI Studio does not decrease for those calls.
   - Usage shows under your GCP project and Vertex AI in the console.

---

## 10. Quick checklist

- [ ] Set `VERTEX_AI_PROJECT` and `VERTEX_AI_LOCATION` (e.g. in `backend/.env` or service `.env`).
- [ ] Authenticate with ADC (`gcloud auth application-default login` or `GOOGLE_APPLICATION_CREDENTIALS`).
- [ ] Enable Vertex AI API (and optionally disable or leave unset `GEMINI_API_KEY` if you want only Vertex).
- [ ] Restart backend services and check startup logs for `path=Vertex AI`.
- [ ] Trigger an AI feature (e.g. roadmap, summarize, quiz, librarian chat) and check logs again.
- [ ] In GCP Console, confirm Vertex AI / Generative AI usage for your project and location.
