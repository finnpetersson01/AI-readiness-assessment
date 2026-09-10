# Setup

## 1. Start the app

- **macOS:** double-click `macos/Start Prototype.command`
- **Windows:** double-click `windows/Start Prototype.cmd`

Requires Python 3. If double-clicking does nothing, open a terminal in this folder and run `python3 server.py` instead.

This opens the prototype in your browser at `http://127.0.0.1:8765/`.

**macOS security warning on first run:** since this was downloaded rather than installed from the App Store, macOS will likely refuse to open `Start Prototype.command` the first time ("Apple could not verify..."). This is normal for any downloaded script, not a sign of a problem. On current macOS, right-click → Open does not reliably bypass this for script files, so use one of these instead:

- **Terminal (most reliable):** open Terminal, type `xattr -d com.apple.quarantine ` (with a trailing space), drag `Start Prototype.command` from Finder into the Terminal window to fill in its path, then press Enter. Double-clicking the file will work normally after this.
- **Or skip the launcher entirely:** open Terminal in this folder and run `python3 server.py` directly — this never goes through Gatekeeper at all.
- **Or via System Settings:** try double-clicking once (it will be blocked), then go to System Settings → Privacy & Security, scroll down to the security message naming this file, and click **Open Anyway**.

## 2. (Optional) Connect a live AI model

The demo projects work fully without this step — every demo loads with a pre-filled, curated requirement proposal either way. This step is only needed to generate a *live* requirement proposal instead of using the curated one.

1. Copy `llm.env.example` to a new file named `llm.env` in this folder.
2. Fill in any OpenAI-compatible endpoint:
   - a hosted provider or proxy you have a key for, or
   - a free local model via [Ollama](https://ollama.com) — install it, run `ollama pull llama3.1` (or any model), then set:
     ```
     LITELLM_API_KEY=ollama
     LITELLM_BASE_URL=http://localhost:11434/v1
     ```
     (the API key value doesn't matter for Ollama, it just can't be empty)
3. Restart the app.

## 3. Try it

Load one of the three included demo projects and walk through the flow: project import → requirement generation → consultant review → client assessment → results.

## More detail

- `README.md` — the full demonstration workflow and scoring logic
- `docs/requirement-library-method.md` — how the requirement catalog and criticality model work
- `docs/llm-requirement-selection-contract.md` — what the AI step is contracted to produce
