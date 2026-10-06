# Document assistant (RAG)

The RAG feature is a standalone Vercel page at `/rag`; the existing portfolio pages are not modified. It accepts PDF, DOCX, TXT, Markdown, CSV, and JSON files. File text is extracted and searched in the browser. For each question, only the five highest-ranked passages are sent to the serverless API and Gemini. This app does not upload or persist the original files or chat history.

## Deploy to Vercel

1. Import this repository into Vercel and deploy it from the repository root. Vercel serves the existing static site, the `/rag` route, and the `/api/rag` serverless function.
2. In **Project Settings → Environment Variables**, add `GEMINI_API_KEY` with a Gemini API key. Add it to the environments where the project is deployed. Do not put the key in HTML, JavaScript, or any `NEXT_PUBLIC_` variable.
3. Optionally set `GEMINI_MODEL` to a model enabled for your project. The default is `gemini-3.5-flash-lite`.
4. Redeploy after saving environment variables.
5. Visit `https://your-deployment.vercel.app/rag` to use the assistant. The existing portfolio remains available at `/`.

The key is read only by `api/rag.js` on the server and sent to Gemini in an HTTP request header. It is not returned to the browser.

## Run locally

The local server reads `GEMINI_API_KEY` from its process environment. You can set it in your shell, or use a local `.env.local` file (ignored by Git). To use the file, add this line without quotes:

```text
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Keep `.env.local` private; never commit it or put the key in frontend files. Start the local server with Node's built-in environment-file support:

```powershell
node --env-file=.env.local dev-server.js
```

Alternatively, set the environment variable in PowerShell and run the server normally:

```powershell
$env:GEMINI_API_KEY = "your-gemini-api-key"
node dev-server.js
```

In Command Prompt:

```bat
set GEMINI_API_KEY=your-gemini-api-key
node dev-server.js
```

Open `http://127.0.0.1:8000/rag`. The local server serves the same `/api/rag` handler used by Vercel. An environment variable already set in the shell takes precedence over the `.env.local` value. Do not paste the key into browser code.

## Limits and behavior

- Up to 10 files, 8 MB per file, 24 MB total, 1,000,000 extracted characters per file, and 1,000 indexed passages per browser session. PDFs are limited to 500 pages.
- Scanned/image-only PDFs require OCR before they can be searched.
- The document index and chat history exist only in the current browser tab and are cleared when that tab is closed or refreshed.
- The browser loads PDF.js and Mammoth from jsDelivr to extract PDF and DOCX text. A connection to the CDN is required for those file types.
- Gemini API usage is billed to the key owner and subject to Google's quota and model availability. Keep the key's API restrictions and Vercel project access appropriately limited.
