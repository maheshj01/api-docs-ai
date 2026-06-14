# Understanding RAG (in this project)

A learner's guide to how **Retrieval-Augmented Generation** works — using *this* codebase as
the worked example. Every concept below points at the real file that implements it, so you can
read the explanation here and then go look at the code.

> **The one-sentence version:** instead of asking the LLM to answer from memory, we first
> *search a pile of documentation* for the most relevant passages, then hand those passages to
> the LLM and say "answer the question **using only this**." That's it. Everything else is
> detail about how to search well.

---

## 1. Why RAG exists (the problem it solves)

An LLM like llama3.1 only knows what it saw during training. Ask it about a fast-moving
framework and it will:
- **be out of date** (training has a cutoff), and
- **hallucinate** — confidently invent APIs that don't exist.

RAG fixes both by *grounding* the model in real, current documents that **you** supply at
question time. The model's job shifts from "recall facts" to "read these passages and
summarize the answer." That's a much easier, more reliable job — and you can cite sources.

In this project the "pile of documentation" is the Flutter / Next.js / Vue / FastAPI docs,
fetched from their sitemaps.

---

## 2. The two halves of any RAG system

Almost every RAG system has two phases. Keeping them separate in your head is the single most
useful mental model:

```
┌─────────────────────────── INDEXING (offline, slow, run occasionally) ───────────────────────────┐
│                                                                                                    │
│   docs website  ──▶  fetch & clean  ──▶  chunk into pieces  ──▶  embed each chunk  ──▶  store in   │
│   (sitemap)          (HTML → text)       (~512 tokens each)      (text → vectors)       an index   │
│                                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
        (this is what `make crawl` / POST /crawl does — minutes per source)

┌─────────────────────────── QUERYING (online, fast, runs per question) ────────────────────────────┐
│                                                                                                    │
│   user question  ──▶  embed question  ──▶  search the index  ──▶  pick best chunks  ──▶  feed to   │
│                       (same model)         (find similar)        (rerank, filter)        the LLM   │
│                                                                                            │       │
│                                                                                            ▼       │
│                                                              stream a grounded answer + sources    │
│                                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
        (this is what POST /api/v1/query/stream does — seconds)
```

**Indexing** turns documents into something searchable, once. **Querying** uses that index to
answer many questions cheaply. If you only remember one diagram from this doc, make it this one.

---

## 3. Key idea: embeddings (turning text into vectors)

You can't ask a computer "which paragraph is most *similar in meaning* to this question?"
directly. So we convert text into **embeddings**: lists of numbers (vectors, e.g. 384 numbers)
where **similar meanings end up close together** in that number-space.

- "How do I make a stateless widget?" and "Creating a StatelessWidget" produce *different
  words* but *nearby vectors*, because they mean nearly the same thing.
- Similarity between two vectors is measured with a math operation (here, **inner product** /
  cosine similarity) — a single number where higher = more alike.

This is the magic that lets search work on *meaning*, not just keyword matching.

### This project uses TWO kinds of embeddings

| Kind | Model (in `core/config.py`) | What it's good at |
|------|------------------------------|-------------------|
| **Dense** | `BAAI/bge-small-en-v1.5` | *Semantic* match — captures meaning even when words differ. Great for "what does this concept mean?" |
| **Sparse** | `prithivida/Splade_PP_en_v1` (SPLADE) | *Lexical* match — strong on exact/rare keywords (API names, error codes) that a dense model might blur. |

Why both? Dense embeddings can miss the exact term `useSelectedLayoutSegment`; sparse
embeddings nail exact terms but miss paraphrases. Combining them ("hybrid search") gets the
best of each. More on that in §6.

> **Dense vs sparse, intuitively:** a *dense* vector is a short list of 384 meaningful numbers
> (every slot has a value). A *sparse* vector is huge (one slot per vocabulary word) but mostly
> zeros — it lights up only the words that matter. SPLADE is a *learned* sparse model: it even
> adds related words the text implies, so it's smarter than plain keyword search.

---

## 4. The INDEXING phase, step by step

This runs when you call `POST /api/v1/crawl` (or `make crawl`). Code lives in
`backend-chatbot/retrieval_service/app/retrieval/`. Orchestrated by
`RetrievalPipeline.process_documents()` in `retrieval/base.py`.

1. **Fetch the URL list** — `processing/fetcher.py : fetch_sitemap()`
   Reads the source's `sitemap.xml` (defined in `core/enums.py`) and extracts every page URL.
   *(Note: only flat `<urlset>` sitemaps are supported, not `<sitemapindex>` files.)*

2. **Download & clean each page** — `fetcher.py : fetch_all_contents()` + `processing/cleaner.py`
   Each page's HTML is fetched and stripped down to plain readable text (no tags, nav, etc.).
   This is where you see the `Crawl progress: N/total URLs fetched` log lines.

3. **Chunk the text** — `processing/chunker.py`
   A whole page is too big to embed or feed to the LLM usefully, so it's split into
   **chunks of ~512 tokens with 128 tokens of overlap** (`chunk_size` / `chunk_overlap` in
   `core/config.py`). The overlap means a sentence near a boundary still appears whole in one
   of the chunks — you don't lose context at the seams.

   > **Why chunk at all?** Search returns *chunks*, not whole pages. Small, focused chunks make
   > matches precise and keep the context you send to the LLM short and on-topic. Too big =
   > noisy matches; too small = lost context. 512/128 is a reasonable middle ground.

4. **Embed every chunk** — `embeddings/dense.py` + `embeddings/sparse.py`
   Each chunk is run through *both* the dense and sparse models, producing two vectors per
   chunk. (These are the `Generating dense/sparse embeddings` progress bars.)

5. **Build the search index** — `dense.py : build_index()`
   The dense vectors go into a **FAISS** index (`IndexFlatIP` — exact inner-product search).
   FAISS is a library that makes "find the most similar vectors to *this* one" extremely fast.

6. **Save to disk** — `storage/data_manager.py`
   Chunks, the URL each chunk came from, both sets of embeddings, and the FAISS index are saved
   under `backend-chatbot/data/<source>_docs/`. Next startup just *loads* this — no re-crawl.

After this, a source (e.g. `flutter`) is "built" and ready to answer questions.

---

## 5. The QUERYING phase, step by step

This runs on every question, via `POST /api/v1/query/stream`
(`app/routes/query.py` → `app/agents/qa_agent.py : answer_query_stream()`). The search itself
is `RetrievalPipeline.search_documents()` in `retrieval/base.py`.

1. **Embed the question** with the *same* dense model used at indexing time (it must match, or
   the vectors aren't comparable).

2. **Hybrid search + rerank** (`scoring/hybrid.py`) — see §6 below. Produces a ranked list of
   the most relevant chunks, each with a final score.

3. **Relevance gate** (`scoring/relevance.py`) — a safety check: is the *best* result actually
   good enough? If not, we return "No relevant information found" instead of letting the LLM
   guess. (Thresholds in `config.py`; we relaxed these for local use — see §8.)

4. **Build the context** (`qa_agent.py`) — take the **top 4 chunks**, concatenate their text.
   This is the "open book" the model is allowed to read.

5. **Prompt the LLM** — the question + the context are dropped into a template
   (`app/core/constants.py : MARKDOWN_PROMPT_TEMPLATE`) that essentially says: *"Answer the
   question using only the context below. Format as markdown."*

6. **Stream the answer** — `qa_agent.py` calls Ollama (`llama3.1`) with `.astream()` and
   forwards tokens to the browser as `{"type":"markdown","content":"..."}` lines. For
   "how-to" questions it also emits a `{"type":"sources",...}` line with the cited doc URLs.

---

## 6. Hybrid search & reranking (the heart of "search well")

This is in `scoring/hybrid.py` and is where this project earns the "good retrieval" badge. It's
a **funnel**: start wide and cheap, end narrow and accurate.

```
   50 candidates                 20 candidates              10 → top 4
   (dense FAISS)   ──merge──▶   (by combined score) ──rerank──▶  (by final score) ──▶ context
                   dense+sparse                    cross-encoder
```

Step by step:

1. **Dense search, top 50** (`dense.py : search`, `k=50`)
   FAISS returns the 50 chunks whose dense vectors are closest to the query. Wide net.

2. **Add sparse scores for those 50** (`sparse.py : compute_sparse_scores`)
   For the same 50 chunks, compute how well they match on *exact terms* (SPLADE).

3. **Normalize & combine** (`hybrid.py : normalize_scores`, then weighted sum)
   Both score sets are scaled to 0–1, then blended:
   `combined = 0.7 × dense + 0.3 × sparse`  (`dense_weight` / `sparse_weight` in config).
   So meaning dominates, but exact-keyword matches still get a boost.

4. **Take the top 20 and rerank** (`scoring/reranker.py`, model `Xenova/ms-marco-MiniLM-L-6-v2`)
   A **cross-encoder** re-scores each `(query, chunk)` *pair together*. This is slower but far
   more accurate than embeddings, which is why we only run it on the 20 survivors, not all 50.

   > **Bi-encoder vs cross-encoder — important distinction:**
   > - The embedding models (steps 1–2) are **bi-encoders**: they encode the query and the
   >   chunk *separately* into vectors, then compare. Fast, because chunk vectors are
   >   precomputed at indexing time. Good for scanning thousands of chunks.
   > - The reranker is a **cross-encoder**: it reads the query and one chunk *together* in a
   >   single pass and outputs a relevance score. Much more accurate (it can see how the
   >   question relates to the passage), but too slow to run on everything — hence "retrieve
   >   wide with the fast model, then rerank narrow with the slow accurate one."

5. **Final score on the top 10** (`hybrid.py`)
   `final = 0.5 × combined + 0.5 × rerank`  (`rerank_weight` in config). Results are re-sorted;
   the top ones flow to the relevance gate and then to the LLM (which uses the top 4).

This wide→narrow funnel is a standard, sensible RAG retrieval design. The numbers (50/20/10/4,
the weights) are tunable knobs — see §8.

---

## 6½. A real worked example (trace one question end-to-end)

Theory is easier to believe with real numbers. Below is an **actual** run captured from this
project's logs — the question **"How do I create a dynamic route?"** against the `nextjs` index.

**Stage 1 — embed the question & dense search (top 50).**
The query is embedded, FAISS returns the 50 closest chunks. (Wide net — cheap.)

**Stage 2 — add sparse scores, blend, keep top 20.**
SPLADE scores those candidates on exact terms ("dynamic", "route"), scores are normalized to
0–1 and blended `0.7·dense + 0.3·sparse`. The log shows the reranker then receiving 20
candidates:

```
retrieval_pipeline:rerank:23 - Reranking 20 texts
```

**Stage 3 — cross-encoder rerank, compute final score (top 4 shown).**
Here are the real per-stage scores for the four chunks that became the answer's context:

| Rank | chunk | dense | sparse | combined (0.7d+0.3s) | rerank | **final** (0.5c+0.5r) |
|------|-------|------|--------|----------------------|--------|------------------------|
| #1 | 1242 | 0.871 | 0.991 | 0.907 | **1.000** | **0.953** |
| #2 | 770  | 1.000 | 1.000 | **1.000** | 0.871 | 0.935 |
| #3 | 273  | 0.533 | 0.865 | 0.632 | 0.836 | 0.734 |
| #4 | 1471 | 0.572 | 0.891 | 0.668 | 0.707 | 0.687 |

**👉 Read the #1 vs #2 row carefully — this is the whole point of reranking.**
Chunk **#2** scored a *perfect* `1.000` on the embedding blend (`combined`) — by pure
dense+sparse similarity it looked like the best match. But the **cross-encoder disagreed**:
reading each chunk *together* with the question, it scored #1 higher (`rerank 1.000` vs
`0.871`). Because `final = 0.5·combined + 0.5·rerank`, that bumped **#1 above #2** (`0.953` vs
`0.935`). The reranker literally reordered the results — exactly the accuracy upgrade §6
described, happening on real data.

Verify the arithmetic yourself: #1 `combined = 0.7·0.871 + 0.3·0.991 = 0.907`, then
`final = 0.5·0.907 + 0.5·1.000 = 0.953`. ✓

**Stage 4 — relevance gate.**
```
check_relevance:90 - Relevance metrics - Similarity: 0.796, Term overlap: 1.000
```
`0.796 ≥ 0.5` (and term-overlap passes trivially since we disabled it) → **relevant**, proceed.
If similarity had been, say, `0.3`, the user would instead get "No relevant information found."

**Stage 5 — context → LLM → streamed answer.**
The top 4 chunks' text is concatenated into the prompt's context. The cited sources sent to the
browser were exactly those chunks' pages:
```
1  https://nextjs.org/docs/pages/.../routing/dynamic-routes
2  https://nextjs.org/docs/app/.../routing/dynamic-routes
3  https://nextjs.org/blog/next-9-2
4  https://nextjs.org/learn/pages-router/dynamic-routes
```
And llama3.1, grounded in that context, streamed back:
> ### Creating Dynamic Routes in Next.js
> Dynamic routes allow you to create routes from dynamic data that is filled in at request
> time or prerendered… To create a dynamic route, use the `[...name]` …

Notice the answer is specific and correct because it was **read off the retrieved docs**, not
recalled from the model's memory. That's RAG doing its job.

> **Want to see this yourself?** The relevance line is logged on every query
> (`scoring/relevance.py`). To see the full per-chunk score table like above, add a temporary
> `logger.info(...)` of `final_results` scores at the end of `HybridSearch.search()` in
> `scoring/hybrid.py`, then watch `make logs` while you query.

---

## 7. Where everything lives (file map)

```
backend-chatbot/
├── app/
│   ├── routes/
│   │   ├── crawl.py          # POST /crawl  → triggers INDEXING
│   │   └── query.py          # POST /query/stream → triggers QUERYING
│   ├── agents/
│   │   ├── crawler_agent.py  # thin wrapper around the indexing pipeline
│   │   └── qa_agent.py       # builds context + prompt, streams from Ollama  ← read this
│   ├── utils/
│   │   ├── retrival_manager.py  # picks/loads the right source's pipeline
│   │   └── llm_utils.py         # connects to Ollama (llama3.1)
│   └── core/constants.py     # the LLM prompt template
│
├── retrieval_service/app/retrieval/   ←★ the actual RAG library
│   ├── base.py               # RetrievalPipeline: orchestrates index + search  ← start here
│   ├── core/
│   │   ├── config.py         # all the knobs: models, chunk size, weights, thresholds
│   │   └── enums.py          # DocSource: which sites + sitemap URLs
│   ├── processing/
│   │   ├── fetcher.py        # sitemap + page download
│   │   ├── cleaner.py        # HTML → clean text
│   │   └── chunker.py        # split into ~512-token chunks
│   ├── embeddings/
│   │   ├── dense.py          # BAAI/bge-small  + FAISS index
│   │   └── sparse.py         # SPLADE sparse vectors
│   ├── scoring/
│   │   ├── hybrid.py         # combine dense+sparse, orchestrate rerank  ← the funnel
│   │   ├── reranker.py       # cross-encoder reranking
│   │   └── relevance.py      # the "is this good enough?" gate
│   └── storage/data_manager.py  # save/load index to data/<source>_docs/
│
└── data/<source>_docs/       # the built indexes (output of crawling)
```

**Suggested reading order for a learner:** `base.py` (the orchestration) → `chunker.py`
(simple, concrete) → `hybrid.py` (the interesting part) → `qa_agent.py` (how context meets the
LLM).

---

## 8. The tunable knobs (and what happens if you change them)

All in `retrieval_service/app/core/config.py` unless noted. Great for experimentation:

| Knob | Current | Effect of changing it |
|------|---------|-----------------------|
| `chunk_size` / `chunk_overlap` | 512 / 128 | Bigger chunks = more context per match but noisier; smaller = precise but fragmented. **Changing requires re-crawling** (it's an indexing-time setting). |
| `dense_weight` / `sparse_weight` | 0.7 / 0.3 | Shift toward meaning (dense) vs exact keywords (sparse). |
| `rerank_weight` | 0.5 | How much the cross-encoder overrides the initial blend. Higher = trust the (accurate) reranker more. |
| `relevance_threshold` | 0.5 | Minimum similarity for an answer to be allowed. Higher = stricter (more "no info found"); lower = more answers but more risk of weak matches. |
| `term_overlap_threshold` | 0.0 | Requires the query's literal words to appear in the top chunk. We set this to 0 (disabled) because it rejected good semantic matches — see the comment in `config.py`. |
| top-k values | 50 → 20 → 10 → 4 | In `dense.py` (`k=50`) and `hybrid.py` (the slices). Wider = more thorough but slower; the final "4" controls how much context the LLM gets. |
| LLM model | `llama3.1` | Set via `REACT_APP_MODEL_NAME` (client) / `DEFAULT_MODEL_NAME` (backend). |

> **Tip for learning:** turn on the relevance log line in `relevance.py` (it logs
> `Similarity: x, Term overlap: y` per query) and watch how different questions score. It makes
> the abstract thresholds very concrete.

---

## 9. A gotcha specific to this codebase

The pipeline and its embedders are **singletons** (`metaclass=Singleton`), which means **only
one document source is "live" in memory at a time** — the embeddings/index belong to whichever
source loaded last. So `PipelineManager.search_documents()` (`app/utils/retrival_manager.py`)
**re-activates the requested source** before searching. Without that, a Flutter question could
be answered from Vue's index. This is a design simplification fine for local/single-user
learning; a production system would keep each source's index loaded independently.

---

## 10. Glossary

- **RAG** — Retrieval-Augmented Generation. Retrieve relevant text, then let the LLM generate
  an answer grounded in it.
- **Embedding** — a vector (list of numbers) representing text's meaning; similar meaning →
  nearby vectors.
- **Dense vs sparse** — dense = small vector capturing meaning (semantic); sparse = large mostly-
  zero vector capturing exact terms (lexical). This project uses both.
- **FAISS** — Facebook AI Similarity Search; a library for fast nearest-vector lookup. Here:
  `IndexFlatIP` = exact search by inner product.
- **Chunk** — a small slice of a document (~512 tokens) that is embedded and retrieved as a unit.
- **Hybrid search** — combining dense + sparse retrieval scores.
- **Bi-encoder** — encodes query and document *separately* (fast; used for first-pass retrieval).
- **Cross-encoder / reranker** — reads query + document *together* for an accurate relevance
  score (slow; used to reorder a small candidate set).
- **Relevance gate** — a threshold check that refuses to answer when the best match is too weak,
  preventing hallucination.
- **Context** — the retrieved chunks inserted into the LLM prompt; the model's "open book."

---

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for how this RAG library fits into the wider system
(FastAPI, Ollama, Supabase, the client), and the [main README](../Readme.md) for running it.
