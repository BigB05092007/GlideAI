# GlideAI Swim Manual Agent

This is a small local Ollama agent for asking questions against a swimming instruction manual.
It keeps the manual and generated search index on your machine.

## Setup

1. Install and start Ollama.
2. Pull a chat model:

```powershell
ollama pull llama3.2
```

3. Pull the embedding model for better manual search:

```powershell
ollama pull nomic-embed-text
```

The agent can still run without the embedding model, but it will fall back to keyword search.

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
$env:OLLAMA_CHAT_MODEL="llama3.2"
$env:OLLAMA_EMBED_MODEL="nomic-embed-text"
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
