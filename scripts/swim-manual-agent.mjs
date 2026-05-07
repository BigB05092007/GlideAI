#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const INDEX_VERSION = 1;
const DEFAULT_INDEX_PATH = "data/swim-manual-index.json";
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown"]);
const DEFAULT_CHUNK_CHARS = 1800;
const DEFAULT_CHUNK_OVERLAP = 240;
const TOP_K = 5;

const OLLAMA_HOST = (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ?? "llama3.2";
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
const INDEX_PATH = process.env.SWIM_AGENT_INDEX ?? DEFAULT_INDEX_PATH;
const OLLAMA_REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_REQUEST_TIMEOUT_MS ?? 120000);
const OLLAMA_EMBED_TIMEOUT_MS = Number(process.env.OLLAMA_EMBED_TIMEOUT_MS ?? 15000);
const OLLAMA_STATUS_TIMEOUT_MS = Number(process.env.OLLAMA_STATUS_TIMEOUT_MS ?? 3000);

function usage() {
  console.log(`
GlideAI swim manual agent

Commands:
  ingest <manual-file-or-folder...>   Build a local searchable manual index
  ask <question>                      Ask one question
  chat                                Start an interactive chat
  status                              Show index and Ollama status

Examples:
  npm run agent:ingest -- data/manuals/freestyle.md
  npm run agent:ask -- "What are the key freestyle catch cues?"
  npm run agent:chat

Environment:
  OLLAMA_HOST=http://127.0.0.1:11434
  OLLAMA_CHAT_MODEL=llama3.2
  OLLAMA_EMBED_MODEL=nomic-embed-text
  SWIM_AGENT_INDEX=data/swim-manual-index.json
  OLLAMA_REQUEST_TIMEOUT_MS=120000
`);
}

function resolveProjectPath(filePath) {
  return path.resolve(process.cwd(), filePath);
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectManualFiles(targets) {
  const files = [];

  for (const target of targets) {
    const resolved = resolveProjectPath(target);
    const stat = await fs.stat(resolved);

    if (stat.isDirectory()) {
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      for (const entry of entries) {
        const child = path.join(resolved, entry.name);
        const relative = path.relative(process.cwd(), child);
        if (entry.isDirectory()) {
          files.push(...(await collectManualFiles([relative])));
        } else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
          files.push(child);
        }
      }
      continue;
    }

    if (!TEXT_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
      throw new Error(`Unsupported manual type: ${target}. Use .txt, .md, or .markdown.`);
    }

    files.push(resolved);
  }

  return [...new Set(files)].sort();
}

function chunkText(text, source) {
  const paragraphs = normalizeWhitespace(text)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks = [];
  let current = "";

  const pushCurrent = () => {
    const clean = current.trim();
    if (!clean) return;
    chunks.push({
      source,
      chunkIndex: chunks.length,
      text: clean,
    });
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > DEFAULT_CHUNK_CHARS) {
      pushCurrent();
      current = "";

      for (let start = 0; start < paragraph.length; start += DEFAULT_CHUNK_CHARS - DEFAULT_CHUNK_OVERLAP) {
        chunks.push({
          source,
          chunkIndex: chunks.length,
          text: paragraph.slice(start, start + DEFAULT_CHUNK_CHARS).trim(),
        });
      }
      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > DEFAULT_CHUNK_CHARS) {
      pushCurrent();
      const overlap = current.slice(Math.max(0, current.length - DEFAULT_CHUNK_OVERLAP));
      current = overlap ? `${overlap}\n\n${paragraph}` : paragraph;
    } else {
      current = next;
    }
  }

  pushCurrent();
  return chunks;
}

async function ollamaJson(endpoint, body, timeoutMs = OLLAMA_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetch(`${OLLAMA_HOST}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Ollama ${endpoint} failed (${response.status}): ${message}`);
  }

  return response.json();
}

async function embedBatch(texts) {
  try {
    const result = await ollamaJson("/api/embed", {
      model: EMBED_MODEL,
      input: texts,
    }, OLLAMA_EMBED_TIMEOUT_MS);

    if (Array.isArray(result.embeddings)) return result.embeddings;
  } catch (error) {
    if (!String(error).includes("/api/embed")) throw error;
  }

  const embeddings = [];
  for (const text of texts) {
    const result = await ollamaJson("/api/embeddings", {
      model: EMBED_MODEL,
      prompt: text,
    }, OLLAMA_EMBED_TIMEOUT_MS);
    if (!Array.isArray(result.embedding)) {
      throw new Error("Ollama did not return an embedding.");
    }
    embeddings.push(result.embedding);
  }
  return embeddings;
}

async function tryEmbedChunks(chunks) {
  try {
    const embedded = [];
    const batchSize = 12;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await embedBatch(batch.map((chunk) => chunk.text));
      for (let j = 0; j < batch.length; j++) {
        embedded.push({ ...batch[j], embedding: embeddings[j] });
      }
      console.log(`Embedded ${Math.min(i + batch.length, chunks.length)}/${chunks.length} chunks`);
    }
    return { chunks: embedded, embeddingModel: EMBED_MODEL };
  } catch (error) {
    console.warn(`Embedding skipped: ${error.message}`);
    console.warn("The agent will use keyword retrieval. Run `ollama pull nomic-embed-text` for better search.");
    return { chunks, embeddingModel: null };
  }
}

function tokenize(text) {
  const words = text
    .toLowerCase()
    .match(/[a-z0-9]+/g);
  return words ? words.filter((word) => word.length > 2) : [];
}

function keywordScore(query, text) {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return 0;

  const textTerms = tokenize(text);
  const frequencies = new Map();
  for (const term of textTerms) {
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  }

  let score = 0;
  for (const term of queryTerms) {
    score += Math.log(1 + (frequencies.get(term) ?? 0));
  }
  return score / Math.sqrt(Math.max(1, textTerms.length));
}

function cosineSimilarity(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }

  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

async function retrieveChunks(index, question) {
  const hasEmbeddings = index.chunks.every((chunk) => Array.isArray(chunk.embedding));

  if (hasEmbeddings && index.embeddingModel) {
    try {
      const [queryEmbedding] = await embedBatch([question]);
      return index.chunks
        .map((chunk) => ({
          ...chunk,
          score: cosineSimilarity(queryEmbedding, chunk.embedding),
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, TOP_K);
    } catch (error) {
      console.warn(`Embedding search failed, using keywords: ${error.message}`);
    }
  }

  return index.chunks
    .map((chunk) => ({
      ...chunk,
      score: keywordScore(question, chunk.text),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, TOP_K);
}

function buildContext(chunks) {
  return chunks
    .map((chunk, index) => {
      const source = chunk.source.replace(/\\/g, "/");
      return `[${index + 1}] ${source}#chunk-${chunk.chunkIndex}\n${chunk.text}`;
    })
    .join("\n\n---\n\n");
}

async function askOllama(question, index, history = []) {
  const chunks = await retrieveChunks(index, question);
  const context = buildContext(chunks);
  const messages = [
    {
      role: "system",
      content:
        "You are GlideAI Manual Coach, a concise swimming instruction assistant. " +
        "Answer from the provided manual context first. If the manual does not contain the answer, say that clearly and give a safe general suggestion. " +
        "Do not invent page numbers. Cite sources like [1] or [2] when using the manual. Keep answers practical for coaching.",
    },
    ...history.slice(-6),
    {
      role: "user",
      content: `Manual context:\n${context}\n\nQuestion: ${question}`,
    },
  ];

  const result = await ollamaJson("/api/chat", {
    model: CHAT_MODEL,
    stream: false,
    messages,
    options: {
      temperature: 0.2,
      num_ctx: 8192,
    },
  });

  const answer = result.message?.content?.trim();
  if (!answer) throw new Error("Ollama returned an empty answer.");

  return { answer, chunks };
}

async function loadIndex() {
  const resolved = resolveProjectPath(INDEX_PATH);
  if (!(await fileExists(resolved))) {
    throw new Error(`No manual index found at ${INDEX_PATH}. Run: npm run agent:ingest -- <manual.md>`);
  }

  const index = JSON.parse(await fs.readFile(resolved, "utf8"));
  if (index.version !== INDEX_VERSION || !Array.isArray(index.chunks)) {
    throw new Error(`Unsupported manual index format at ${INDEX_PATH}. Re-run ingest.`);
  }
  return index;
}

async function ingest(targets) {
  if (targets.length === 0) {
    throw new Error("Provide at least one manual file or folder.");
  }

  const files = await collectManualFiles(targets);
  if (files.length === 0) {
    throw new Error("No .txt or .md manual files found.");
  }

  let chunks = [];
  for (const file of files) {
    const relative = path.relative(process.cwd(), file);
    const text = await fs.readFile(file, "utf8");
    chunks = chunks.concat(chunkText(text, relative));
  }

  chunks = chunks.map((chunk, index) => ({
    id: `chunk-${String(index + 1).padStart(4, "0")}`,
    ...chunk,
  }));

  const embedded = await tryEmbedChunks(chunks);
  const index = {
    version: INDEX_VERSION,
    createdAt: new Date().toISOString(),
    ollamaHost: OLLAMA_HOST,
    chatModel: CHAT_MODEL,
    embeddingModel: embedded.embeddingModel,
    sourceFiles: files.map((file) => path.relative(process.cwd(), file)),
    chunkChars: DEFAULT_CHUNK_CHARS,
    chunkOverlap: DEFAULT_CHUNK_OVERLAP,
    chunks: embedded.chunks,
  };

  const indexPath = resolveProjectPath(INDEX_PATH);
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(`Indexed ${files.length} file(s), ${chunks.length} chunks.`);
  console.log(`Saved ${INDEX_PATH}`);
}

async function ask(question) {
  if (!question.trim()) throw new Error("Ask a non-empty question.");

  const index = await loadIndex();
  const { answer, chunks } = await askOllama(question, index);
  console.log(`\n${answer}\n`);
  console.log("Sources:");
  for (const [i, chunk] of chunks.entries()) {
    console.log(`  [${i + 1}] ${chunk.source}#chunk-${chunk.chunkIndex}`);
  }
}

async function chat() {
  const index = await loadIndex();
  const rl = readline.createInterface({ input, output });
  const history = [];

  console.log("Swim manual agent ready. Type /exit to quit.");
  while (true) {
    const question = (await rl.question("\nYou: ")).trim();
    if (!question || question === "/exit" || question === "/quit") break;

    try {
      const { answer } = await askOllama(question, index, history);
      console.log(`\nAgent: ${answer}`);
      history.push({ role: "user", content: question });
      history.push({ role: "assistant", content: answer });
    } catch (error) {
      console.error(`Agent error: ${error.message}`);
    }
  }

  rl.close();
}

async function status() {
  const indexPath = resolveProjectPath(INDEX_PATH);
  if (await fileExists(indexPath)) {
    const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
    console.log(`Index: ${INDEX_PATH}`);
    console.log(`Chunks: ${index.chunks?.length ?? 0}`);
    console.log(`Sources: ${(index.sourceFiles ?? []).join(", ") || "none"}`);
    console.log(`Embedding model: ${index.embeddingModel ?? "keyword fallback"}`);
  } else {
    console.log(`Index: missing (${INDEX_PATH})`);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_STATUS_TIMEOUT_MS);
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const models = (data.models ?? []).map((model) => model.name).join(", ");
    console.log(`Ollama: online at ${OLLAMA_HOST}`);
    console.log(`Models: ${models || "none"}`);
  } catch (error) {
    console.log(`Ollama: offline at ${OLLAMA_HOST} (${error.message})`);
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }

  if (command === "ingest") {
    await ingest(args);
    return;
  }

  if (command === "ask") {
    await ask(args.join(" "));
    return;
  }

  if (command === "chat") {
    await chat();
    return;
  }

  if (command === "status") {
    await status();
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
