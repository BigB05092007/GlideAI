# GlideAI Swim Manual Agent

This is a small local Ollama agent for asking questions against a swimming instruction manual.
It keeps the manual and generated search index on your machine.

## In-App Phone Agent

The phone app uses `evaluatePhoneSwimAgent` from `src/lib/mobileSwimCoach.ts`. It is a bundled, phone-local keyword retrieval agent over the stroke curriculum, so the app does not need Node, file-system access, Ollama, or a network connection during a swim session.

The CLI below remains useful for desktop manual experiments and richer local Ollama Q&A.

## Setup

1. Install and start Ollama.
2. Pull a chat model:

```powershell
ollama pull gemma3:270m
```

`gemma3:270m` is the default because it is the lightest practical Ollama chat model for local phone-class hardware.

3. Optional: pull an embedding model for better manual search:

```powershell
ollama pull nomic-embed-text
```

The agent runs without the embedding model and falls back to keyword search by default. Set `OLLAMA_EMBED_MODEL` only when you want vector search.

## Add A Manual

Put `.txt`, `.md`, or `.markdown` manuals in `data/manuals/`, then ingest them:

```powershell
npm run agent:ingest -- data/manuals
```

You can also ingest one file directly:

```powershell
npm run agent:ingest -- data/manuals/freestyle.md
```

## Ask Questions

```powershell
npm run agent:ask -- "What does the manual say about early vertical forearm?"
```

For an interactive session:

```powershell
npm run agent:chat
```

Type `/exit` to quit.

## Models And Paths

Defaults:

```powershell
$env:OLLAMA_HOST="http://127.0.0.1:11434"
$env:OLLAMA_CHAT_MODEL="gemma3:270m"
$env:OLLAMA_EMBED_MODEL=""
$env:OLLAMA_NUM_CTX="4096"
$env:SWIM_AGENT_INDEX="data/swim-manual-index.json"
$env:OLLAMA_REQUEST_TIMEOUT_MS="120000"
```

Example using a different chat model:

```powershell
$env:OLLAMA_CHAT_MODEL="mistral"
npm run agent:ask -- "Create a simple catch drill from the manual."
```

## Privacy

`data/manuals/*` and `data/swim-manual-index.json` are ignored by git. The manual content stays local unless you explicitly move or commit it somewhere else.
