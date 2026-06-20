# Shadow Slave RAG Bot
## Complete PRD + Project Notes

---

# 1. Project Overview

## Project Name
Shadow Slave RAG Bot

## Status
Final PRD v1

## Owner
bradagy

## Product Summary
Build a TypeScript-first RAG system that answers questions about *Shadow Slave* using a locally stored chapter corpus and chapter-grounded retrieval. The system must be designed so the same core logic can later power a CLI tool, a Discord bot, and a web app without rewriting retrieval or answer-generation logic.

v1 is intentionally narrow:
- private use only
- CLI only
- canon-only answers
- scrape `readshadowslave.com`
- support a local Markdown fallback import path
- use local embeddings
- use hosted answer generation with a configurable model/provider

The goal is not to build a generic chatbot. The goal is to build a **canon-grounded lore assistant**.

---

# 2. Problem Statement

The user wants a way to ask factual questions about *Shadow Slave* and get accurate, chapter-grounded answers without manually searching across thousands of chapters.

Generic chatbots fail at this because they:
- hallucinate lore
- confuse arcs and events
- do not reliably cite chapter evidence
- are weak at canon-sensitive retrieval
- tend to present guesses as facts

This project solves that by using:
- chapter ingestion
- chunking
- local embeddings
- retrieval over stored chapter text
- chapter citations
- canon-only answer rules

---

# 3. Product Goals

## Primary Goals
1. Answer canon questions about *Shadow Slave* using retrieved chapter text.
2. Return chapter-backed answers with citations.
3. Support private dogfooding first.
4. Keep infrastructure cheap and simple.
5. Make future expansion to Discord and web easy.

## Secondary Goals
1. Support chapter lookup and lore exploration.
2. Reduce hallucinations through retrieval constraints.
3. Make corpus ingestion reproducible.
4. Make models and providers configurable rather than hardcoded.

---

# 4. Non-Goals

The following are explicitly out of scope for v1:

- training a custom base model
- fine-tuning before the RAG system proves useful
- public multi-user deployment
- advanced dashboards
- telemetry stacks unless real pain appears
- queues or background infra unless real pain appears
- theory mode or speculation mode
- Discord bot
- web app
- advanced spoiler controls beyond the v1 chapter and named-boundary filters
- character graph / lore graph
- reranking
- hybrid retrieval tuning
- public release hardening

---

# 5. Users

## Primary User
- bradagy, using the system privately from the CLI

## Future Users
- trusted friends in a Discord server
- possible public users later, after the system is stable

---

# 6. Core User Stories

1. As a private user, I want to ask a question about a character, event, object, or concept and get a canon-grounded answer.
2. As a private user, I want answers to cite supporting chapters so I can verify them.
3. As a private user, I want to search where something was mentioned even if I do not remember the chapter.
4. As a private user, I want the system to stay cheap and simple.
5. As a private user, I want the core logic to be reusable later for Discord or web.
6. As a future user, I want the architecture to already support expansion without rewriting the app core.

---

# 7. Final Product Decisions

## Locked Decisions
- **v1 interface:** pure CLI only
- **v1 answer mode:** canon-only
- **initial corpus source:** `readshadowslave.com`
- **fallback corpus import:** local Markdown files
- **embeddings:** local
- **default local embedding model:** `BAAI/bge-small-en-v1.5`
- **answer generation:** hosted
- **default hosted answer model:** Gemini 2.5 Flash
- **model hardcoding:** not allowed
- **architecture rule:** one shared core, future-ready for Discord/web later

## Practical Meaning
- retrieval/search happens locally
- final answer writing happens through a hosted model
- answer model must be configurable through env/config
- embedding model should also be configurable, even if v1 defaults are fixed

---

# 8. Functional Requirements

## 8.1 Corpus Acquisition and Ingestion
The system must:
- acquire a usable *Shadow Slave* chapter corpus
- use `readshadowslave.com` as the initial v1 source
- treat the source layer as replaceable
- scrape chapter text from the source
- store chapter metadata and provenance
- support a manual fallback import path from local Markdown chapter files
- support safe re-ingestion if the source changes or the corpus improves
- avoid duplicating unchanged chapters during re-import

## 8.2 Chunking
The system must:
- split chapter text into retrieval-friendly chunks
- preserve chapter linkage per chunk
- preserve chunk order per chapter
- support deterministic chunk regeneration
- store chunk metadata such as token/character count

## 8.3 Embeddings
The system must:
- generate local embeddings for chunks
- generate embeddings for user questions at query time
- store chunk embeddings in Postgres using pgvector
- keep the embedding model configurable, even if v1 defaults to `BAAI/bge-small-en-v1.5`

## 8.4 Retrieval
The system must:
- retrieve relevant chunks for user queries
- prefer chapter-grounded factual retrieval
- return enough evidence to support auditable answers
- support future filtering by metadata such as chapter range or arc

## 8.5 Answer Generation
The system must:
- build answers only from retrieved chunks
- cite supporting chapters
- avoid inventing chapter references
- prefer “not enough evidence” over bluffing
- remain canon-only
- avoid theory or speculation in normal answers

## 8.6 Interface
v1 must support:
- CLI only

The architecture must make it easy to add later:
- Discord bot
- web app

## 8.7 Configuration
The system must:
- avoid hardcoding the hosted answer model
- avoid hardcoding the hosted provider
- support config through env vars or a config file
- keep embedding configuration separate from answer-generation configuration

## 8.8 Data Management
The system must:
- keep schema and migrations in Git
- keep database contents out of Git
- support backup and restore workflows
- support portability to another machine using code + DB dump

---

# 9. v1 Scope

## Included in v1
- TypeScript codebase
- Node.js runtime
- Postgres
- pgvector
- chapter scraper for `readshadowslave.com`
- local Markdown fallback import
- chunking pipeline
- local embeddings
- retrieval pipeline
- hosted answer generation
- chapter citations
- basic spoiler-safe retrieval filters
- basic logs
- private CLI

## Explicitly Deferred
- Discord bot
- web UI
- reranker
- hybrid search
- advanced spoiler-aware response modes
- fine-tuning
- public deployment
- auth
- analytics
- background job infrastructure
- telemetry stack

---

# 10. Success Criteria

The product is successful if:
1. the user can ask canon questions and get chapter-cited answers
2. the output is materially better than a generic chatbot without retrieval
3. the system is useful enough that the owner actually uses it
4. the project can move to another machine without pain
5. adding a second interface later does not require rewriting the core retrieval logic
6. the hosted answer model can be swapped by configuration instead of code edits

---

# 11. Example Questions the Product Should Handle

## In Scope
- Who is Mordret?
- When was a given character first introduced?
- Which chapters mention a certain Memory or Echo?
- Summarize a specific arc using cited chapter evidence.
- Compare two characters using cited canon evidence.
- What happened around a major event?
- Where was X first mentioned?
- Which chapter explains Y?

## Out of Scope for v1 Behavior
- fan theories presented as fact
- speculation
- unsupported long-range inference
- spoiler-aware response modes
- non-canon “what if” scenarios

---

# 12. Product Principles

1. **Canon over cleverness**
2. **Evidence over confidence**
3. **Simplicity over fancy infra**
4. **One shared core, many interfaces**
5. **Private usefulness before public polish**
6. **Configuration over hardcoding**

---

# 13. Technical Direction

## 13.1 Architecture Principle
Create one shared application core that handles:
- scraping
- fallback file import
- ingestion
- chunking
- embedding
- retrieval
- prompt construction
- answer formatting

The CLI should call this core directly in v1.

Future interfaces should remain thin wrappers over the same core.

## 13.2 Proposed Stack
- **Language:** TypeScript
- **Runtime:** Node.js
- **Database:** Postgres
- **Vector storage:** pgvector
- **DB access:** plain `pg` first, Drizzle later only if real schema pain appears
- **Deployment:** native Postgres on a local machine first
- **Logging:** basic structured logs
- **Embeddings:** local via `BAAI/bge-small-en-v1.5`
- **Answer generation:** hosted LLM via configurable provider/model
- **Default hosted answer model:** Gemini 2.5 Flash

## 13.3 Why This Stack
- cheap
- simple
- future-friendly
- avoids unnecessary external services
- keeps the expensive part limited to final answer generation
- supports growth without forcing overengineering now

---

# 14. High-Level System Design

```text
Source chapter corpus
    ↓
Scraper or fallback Markdown importer
    ↓
Raw chapter storage
    ↓
Chunking
    ↓
Local embedding generation
    ↓
Embeddings stored in Postgres
    ↓
Question embedding
    ↓
Similarity retrieval
    ↓
Prompt assembly
    ↓
Hosted answer model
    ↓
CLI output with citations
```

---

# 15. Repository Structure

```text
shadow-slave-bot/
  src/
    core/
      ingest.ts
      scrape.ts
      import-files.ts
      chunk.ts
      embed.ts
      retrieve.ts
      answer.ts
      prompt.ts
    db/
      connection.ts
      queries.ts
      migrations/
      seeds/
    interfaces/
      cli.ts
      api.ts
      discord.ts
    providers/
      llm.ts
      embeddings.ts
    config/
      env.ts
      models.ts
    utils/
      logger.ts
      hashing.ts
      fs.ts
  data/
    chapters/
  scripts/
  docs/
    PRD.md
  package.json
  .env.example
```

## Notes
- `api.ts` and `discord.ts` are future-facing and may remain unused in v1
- `providers/llm.ts` should abstract Gemini and any future hosted model
- `providers/embeddings.ts` should abstract the local embedding model and make future swaps easy

---

# 16. Data Model

## 16.1 `chapters`
- `id`
- `chapter_number`
- `title`
- `source_name`
- `source_url`
- `source_chapter_ref`
- `content_hash`
- `raw_text`
- `ingested_at`
- `created_at`
- `updated_at`

## 16.2 `chunks`
- `id`
- `chapter_id`
- `chunk_index`
- `chunk_text`
- `token_count` or `char_count`
- `embedding`
- `created_at`

## 16.3 Optional Future Tables
- `arcs`
- `characters`
- `aliases`
- `question_logs`
- `answer_feedback`

---

# 17. Retrieval and Answer Rules

## 17.1 v1 Answer Behavior
- retrieve relevant chunks
- build the answer only from retrieved chunks
- cite chapters used
- prefer “not enough evidence” over guessing
- do not invent chapter references
- remain canon-only
- do not include theory/speculation in normal answers

## 17.2 Model Behavior Rules
- hosted answer model must not be hardcoded into core logic
- provider and model name must be configurable
- model swaps must require config changes, not architectural rewrites

## 17.3 Future Retrieval Improvements
- hybrid keyword + semantic search
- metadata filters
- reranking
- richer spoiler controls beyond named boundaries and chapter cutoffs

---

# 18. Operational Requirements

## 18.1 Source Provenance
- each chapter must preserve where it came from
- source metadata should support debugging and future source replacement
- the app core must not become permanently married to one scraper

## 18.2 Cost Constraints
- must run cheaply on one machine or low-cost VPS
- avoid managed services unless clearly necessary
- keep always-on services minimal

## 18.3 Portability
- schema must be reproducible from code
- DB contents must be movable by dump/restore
- the project must be restorable on another machine

## 18.4 Reliability
- logs must show ingestion failures and query failures
- failures should be understandable without telemetry infrastructure

## 18.5 Configuration
- hosted answer model configurable through env or config
- embedding config separate from answer-generation config
- model/provider abstraction required

---

# 19. Manual Fallback Import Format

## Directory Layout
```text
data/chapters/
  0001.md
  0002.md
  0003.md
```

## File Format
Each chapter file should be Markdown with lightweight frontmatter.

Example:

```md
---
chapter_number: 1
title: "Chapter 1"
source_url: "https://readshadowslave.com/chapter/1/"
---

Chapter text starts here...
```

## Requirements
- one chapter per file
- Markdown only for v1
- importer parses frontmatter + body
- malformed files should fail clearly
- re-import should avoid duplicate unchanged chapters
- `content_hash` should be used to detect unchanged data

---

# 20. Open Risks

1. corpus acquisition and cleanup may be messy
2. `readshadowslave.com` may change structure
3. non-official source quality may drift
4. poor chunking may hurt retrieval more than the model choice
5. the hosted answer model may still hallucinate if the prompt is weak
6. some questions may require evidence across many distant chapters
7. public deployment may raise copyright concerns later

---

# 21. Milestones

## Milestone 1: Project Skeleton
- set up repository
- set up Postgres + pgvector
- define schema
- implement config
- build CLI entry point

## Milestone 2: Corpus Pipeline
- inspect `readshadowslave.com`
- build chapter scraper
- parse TOC page
- collect chapter URLs
- store source provenance
- import chapters
- support local Markdown fallback imports
- chunk chapters
- store chunks
- generate local embeddings

## Milestone 3: Query Pipeline
- embed user question
- retrieve relevant chunks
- build answer prompt
- call hosted answer-generation provider through configurable model interface
- return cited canon-only answers via CLI

## Milestone 4: Dogfooding
- run real CLI questions
- fix obvious retrieval failures
- verify chapter citations
- verify canon-only behavior
- verify portability to another machine

## Milestone 5: Expansion Readiness
- clean interface boundaries
- prepare for Discord as the second interface

---

# 22. MVP Definition

The MVP is complete when:
- the system can ingest a usable corpus from `readshadowslave.com`
- the system can import fallback chapter files from `data/chapters/*.md`
- the CLI can accept natural language questions
- the bot returns chapter-grounded, canon-only answers with citations
- the hosted answer model can be changed by configuration
- the owner actually finds it useful
- the project can be moved to another machine using code + DB dump

---

# 23. Future Roadmap

## v2
- Discord bot
- richer spoiler-aware modes
- retrieval tuning
- hybrid search

## v3
- web interface
- character/arc filters
- answer history
- feedback loop

## v4
- fine-tuning for behavior/style if ever truly needed
- lore graph / entity extraction
- public release hardening

---

# 24. Final Recommendation

Build a private, TypeScript-first RAG system with Postgres + pgvector and a shared core architecture. Keep v1 narrow. Focus on:
- corpus quality
- chunk quality
- local embeddings
- configurable hosted answer generation
- chapter citations
- clean separation between core logic and interface logic

Delay optional complexity until real usage proves you need it.

---

# 25. Relevant Project Notes

## 25.1 What a Local Embedding Model Is
A local embedding model turns text into vectors on your own machine so the app can do semantic search.

It is used for:
- embedding chapter chunks
- embedding user questions
- comparing similarity for retrieval

It is **not** the same thing as the answer model.

## 25.2 Do Local Embeddings Cost Money?
Usually **no external service fee**.

You may still pay indirectly for:
- hardware
- VPS
- electricity
- setup time

But there is no per-request embedding API bill if embeddings are local.

## 25.3 Why Separate Embedding Model and Answer Model?
They do different jobs.

### Embedding model
- search brain
- retrieval
- semantic similarity

### Answer model
- reads retrieved chunks
- writes final answer
- follows canon-only instructions

## 25.4 Chosen Models
### Answer generation
- **Gemini 2.5 Flash**
- hosted
- configurable
- not hardcoded

### Embeddings
- **BAAI/bge-small-en-v1.5**
- local
- good enough for v1 and likely well beyond
- suitable for an English-only lore corpus

## 25.5 Is `bge-small-en-v1.5` Good Enough for 2500+ Chapters?
Yes, probably.

The bigger retrieval quality factors will be:
- chunking quality
- metadata quality
- prompt construction
- maybe reranking later

The chapter count alone is not a reason to panic.

## 25.6 Hosted Embeddings in the Future
Possible, but probably not necessary soon.

You can look at hosted embeddings later if:
- you want easier operations
- retrieval quality needs more experimentation
- local model setup becomes annoying

But local is the right default right now.

## 25.7 Why Postgres Instead of SQLite?
SQLite is fine for tiny local-only prototypes.

Postgres is the better default here because:
- pgvector fits naturally
- future CLI/Discord/web expansion is cleaner
- concurrency and growth headroom are better
- dump/restore portability is standard

## 25.8 What Goes in Git vs Not in Git
### Commit to Git
- code
- schema
- migrations
- seed scripts
- `.env.example`

### Do not commit
- live DB contents
- Postgres data directories
- secrets
- real `.env`
- large DB dumps

## 25.9 How to Move the DB to Another Machine
Use:
- migrations for structure
- `pg_dump` / `pg_restore` for data

Do not commit the live database to Git.

## 25.10 Seed Script vs Ingest Script
### Seed script
Adds starter/default data.

### Ingest script
Imports the actual chapter corpus.

For this project, ingestion matters much more than seeding.

## 25.11 Why CLI First Is Correct
CLI-first keeps v1:
- cheap
- simple
- fast to dogfood
- free of unnecessary UI work

This is the right call.

## 25.12 Why Model Configurability Matters
You do not want the project tied forever to one hosted model.

Good config shape:

```env
ANSWER_PROVIDER=google
ANSWER_MODEL=gemini-2.5-flash

EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
```

That is the clean long-term shape.

## 25.13 Practical Ingestion Strategy
Basic scraper flow:
1. fetch chapters index page
2. collect chapter links
3. visit each chapter page
4. extract chapter number, title, body
5. store raw text and source metadata
6. chunk
7. embed
8. store embeddings

Fallback flow:
1. read `data/chapters/*.md`
2. parse frontmatter and body
3. import to same pipeline

## 25.14 Simplicity Rules for v1
Do not add yet:
- queues
- telemetry stacks
- Redis
- rerankers
- web frontend
- Discord bot
- Drizzle unless raw SQL becomes annoying

Use the simplest thing that works.

## 25.15 v1 Build Philosophy
- one core
- one DB
- one CLI
- local embeddings
- hosted answer model
- citations everywhere
- canon-only answers
- no fluff

---

# 26. Suggested Immediate Next Steps

1. freeze this PRD as `docs/PRD.md`
2. create a numbered implementation plan
3. generate a Codex bootstrap prompt from the PRD
4. scaffold the repo
5. build the schema
6. test scraper against a few chapters
7. implement chunking
8. implement local embeddings
9. wire retrieval
10. wire Gemini answer generation
11. test with real lore questions

---
