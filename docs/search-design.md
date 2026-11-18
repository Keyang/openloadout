# Search on a static site: research and recommendation

Written 2026-11-18. Covers features FIND-2, FIND-8 and FIND-9 in `features.md`.

**The rule from Keyang:** the whole site must work as static files, for example on GitHub Pages. So search runs in the visitor's browser, and anything expensive happens once, when the site is built.

**Keyang's suggestion:** research embedding models, and have every site build create a SQLite database with vectors so people can search by meaning ("contextual search").

**Short answer:** yes to building the index at build time, yes to one SQLite file, yes to an embedding model for meaning. Two changes to the suggestion:

1. **Do not depend on the `sqlite-vec` extension in the browser.** It has no supported browser build. Store the vectors in the SQLite file as plain columns and compare them with a short loop in JavaScript. At this catalogue's size that is fast enough and removes the riskiest dependency.
2. **Do not make search wait for the model.** The model is a 22 to 34 MB download. Keyword search should answer instantly; the model loads in the background and improves the results when it is ready.

Nothing here has been built or measured in this project. Numbers are from the sources listed at the end, and the ones I could not confirm are marked.

---

## 1. What "contextual search" needs

Two things have to turn into vectors with the **same model**:

| What | When | Where |
|---|---|---|
| Every asset's search text (name, role, tags, action words, description, what it pairs with) | Once per site build | Build machine or GitHub Actions |
| The words the visitor types | On every search | The visitor's browser |

The second row is the hard part on a static site: there is no server to embed the query, so the model itself must be downloaded to the browser. Everything else is easy.

## 2. Embedding models that can run in a browser

All run through Transformers.js (version 4, released February 2026), which uses WebGPU when the browser has it and falls back to WebAssembly on the processor.

| Model | Download (8-bit) | Vector size | Retrieval score | Notes |
|---|---|---|---|---|
| **snowflake-arctic-embed-xs** | Not confirmed; same design as MiniLM, so likely about 23 MB | 384 | 50.2 | Best score per megabyte in this list. First candidate |
| all-MiniLM-L6-v2 | 22 MB | 384 | 42.0 to 42.9 | The common default. Baseline to beat |
| bge-small-en-v1.5 | 32 to 34 MB | 384 | 53.9 on a newer version of the benchmark, so not directly comparable | Half as big again as the two above |
| snowflake-arctic-embed-s | 32 MB | 384 | Not looked up | |
| potion-retrieval-32M (static) | Not confirmed; one port measured about 129 MB, 16 MB at 4-bit | 512 | 35.1 | "Static" models are a lookup table, not a neural network pass: about a millisecond per text, but clearly weaker |
| potion-base-8M (static) | about 30 MB; the family's smallest is about 8 MB | 256 | Not found | Candidate for a tiny fallback |
| EmbeddingGemma | about 188 MB at 4-bit | 768, can be cut to 128 | Top of its class | Too large to ask a visitor to download |

Retrieval score is the MTEB retrieval measure (NDCG@10) as reported on the model cards. Scores from different benchmark versions should not be compared with each other.

All of these are English models. If people will search in other languages, the choice changes (decision S2 below).

**Speed of embedding one query**, from a community benchmark of all-MiniLM-L6-v2 (unquantised, one run): about 15 ms on WebGPU and about 530 ms on WebAssembly. WebGPU became widely available in January 2026 and about 82% of browsers support it.

## 3. What GitHub Pages allows

| Limit | Value | What it means here |
|---|---|---|
| Published site size | 1 GB | Room for the model, the index and pre-made thumbnails, but thumbnails need a budget |
| Single file | 100 MB | A 22 to 34 MB model fits. EmbeddingGemma does not |
| Bandwidth | 100 GB per month, soft limit | A 23 MB model allows roughly 4,300 first-time model downloads a month before the limit. Load the model only when someone searches, and move it to another host if traffic grows |
| Custom response headers | Not possible | Multi-threaded WebAssembly needs two headers Pages cannot send, so the processor fallback runs on one thread and is slow. WebGPU is not affected. A known workaround (a small service-worker script) exists but reloads the page on first visit |
| Server code | None | No accounts, no server-side search, no logging of searches without a third-party analytics script |

## 4. Where the vectors live: the options

| Option | What it is | For | Against |
|---|---|---|---|
| A. **SQLite file, vectors as plain columns, compared in JavaScript** | Build writes one `.sqlite` file: asset table with all facets, SQLite's built-in keyword index (FTS5), one 384-byte vector per asset. Browser opens it with the official SQLite WebAssembly build | One file holds filters, keyword search and vectors. The same file can serve the MCP server, command-line tools and the Unity exporter. Uses only the official, stable SQLite build | Adds the SQLite WebAssembly download (size not measured here). Vector comparison is our own 20 lines of code |
| B. SQLite file with the `sqlite-vec` extension | Same, with vector search done inside SQL | Vector search in one SQL statement | The extension is pre-1.0 (0.1.9 stable). It cannot be loaded into a browser build of SQLite; it must be compiled into a custom build that we would maintain, or taken from a package its author labels a demonstration with no stability promise |
| C. JSON files and a JavaScript search library (Orama) | Build writes JSON; Orama does keyword, vector and combined search in plain JavaScript, with facets and typo tolerance | No WebAssembly, smallest moving parts | Not one portable database; other tools would need their own reader |
| D. Keyword search only (Pagefind or MiniSearch) | No vectors | Tiny, instant, proven on static sites | Not contextual |

**Why a vector index is not needed.** The catalogue will hold hundreds to a few thousand assets. Ten thousand assets at 384 bytes each is 3.8 MB, and comparing a query against all of them is about 3.8 million multiply-and-adds, which a browser does in a few milliseconds (my estimate; to be measured). Special vector indexes pay off at hundreds of thousands of items.

## 5. Recommendation

**Option A, with search in two stages.**

### At build time

A script (run locally or by GitHub Actions on every push) that:

1. Reads every asset's metadata (FIND-1).
2. Writes the search text for each asset, including synonyms and action words. These can be written by an agent once per asset and stored with it, so "coin" also matches "gold" and "money" with no model at all.
3. Embeds each search text with the chosen model, using the same library the browser uses so the vectors match.
4. Writes one SQLite file: assets and facets, the keyword index, and the vectors (8-bit, 384 bytes each).
5. Also stores each asset's nearest neighbours. "Similar assets" and "goes with" suggestions then need no model in the browser.

### In the browser

| Stage | When | What the visitor gets |
|---|---|---|
| 1. Keyword | Immediately, on every keystroke | Matches on names, tags, synonyms and action words, with filters. Works with no model |
| 2. Meaning | After the model has loaded in the background (started the first time the search box is used) | The query is embedded, compared with every asset vector, and merged with the keyword results. Finds "something for when the player dies" or "spooky cave noise" |

If the model fails to load, the device is slow, or the visitor is on a metered connection, search stays at stage 1 and still works.

The model file is served from the site itself and cached by the browser after the first download, so later visits are instant.

### First model to try

snowflake-arctic-embed-xs, with all-MiniLM-L6-v2 as the baseline and a static potion model as the "tiny and instant" alternative. The choice should be made by measurement, not from this table.

## 6. The test that decides it

A small experiment, about a week of work, before committing:

1. **A stand-in catalogue.** The real library has 27 assets, too few to test search. Write 300 to 500 catalogue entries (name, role, tags, description) from the lists in `asset-taxonomy.md`. No art or sound needed.
2. **A question set.** 60 to 100 searches with the right answers marked, in the words the taxonomy says people use: verbs ("chop"), events ("level up"), synonyms ("money"), descriptions ("footsteps on snow", "boss fight music"), and misspellings.
3. **Measure** for keyword only, each model alone, and keyword plus model:
   - how often the right asset is in the top 5
   - model download size and time to first result on a cold visit
   - time per query on WebGPU and on single-thread WebAssembly
   - index file size and time to open it
4. **Pass mark, proposed:** keyword plus model finds the right asset in the top 5 at least 15 points more often than keyword alone on the description-style searches, with a model under 35 MB. If it does not, ship stage 1 only and revisit.

## 7. Decisions needed

| Id | Decision | Default I would take |
|---|---|---|
| S1 | SQLite file (option A) or JSON with Orama (option C)? | A, because other tools can read the same file |
| S2 | English only, or other languages too? | English only to start. Multilingual models are several times larger |
| S3 | Serve the model from the site, or from Hugging Face's servers? | From the site: no dependence on a third party, and no visitor data leaves the site |
| S4 | Is a 22 to 34 MB background download acceptable for the meaning stage? | Yes, because stage 1 never waits for it |

## Sources

Read on 2026-11-18.

- sqlite-vec in the browser: [sqlite-vec WebAssembly page](https://alexgarcia.xyz/sqlite-vec/wasm.html), [sqlite-wasm-vec community build](https://github.com/yangbooom/sqlite-wasm-vec)
- Model sizes, Transformers.js version, WebGPU availability, sqlite-vec status: ["The Vector Database You Were About to Buy Is a For Loop", 15 July 2026](https://jwatte.com/blog/on-device-rag-client-side-semantic-search.md)
- WebGPU against WebAssembly timing: [Transformers.js WebGPU benchmark results](https://huggingface.co/spaces/Xenova/webgpu-embedding-benchmark/discussions/5)
- bge-small size and score: [hermes-ai.net note on Xenova's bge-small](https://hermes-ai.net/news/xenova-s-bge-small-brings-private-semantic-search-directly-to-javascript/)
- snowflake-arctic-embed-xs scores: [model summary quoting the model card](https://www.promptlayer.com/models/snowflake-arctic-embed-xs), [Snowflake's announcement](https://www.snowflake.com/en/blog/introducing-snowflake-arctic-embed-snowflakes-state-of-the-art-text-embedding-family-of-models/)
- Static embedding models: [potion-retrieval-32M model card](https://huggingface.co/minishlab/potion-retrieval-32M), [model2vec](https://github.com/MinishLab/model2vec), [Qdrant's evaluation](https://qdrant.tech/articles/embedding-at-the-speed-of-light/), [@yaks/model2vec JavaScript port](https://jsr.io/@yaks/model2vec/0.2.16/README.md)
- EmbeddingGemma: [Google's announcement](https://developers.googleblog.com/en/introducing-embeddinggemma/)
- GitHub Pages limits: [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- Headers on GitHub Pages: [community request for COOP and COEP headers](https://github.com/orgs/community/discussions/13309), [coi-serviceworker](https://www.github.com/gzuidhof/coi-serviceworker)
- Static-site search libraries: [free site search comparison, June 2026](https://merginit.com/blog/22062026-free-site-search-comparison)

Not confirmed, and to check during the test: the 8-bit download size of snowflake-arctic-embed-xs; the download size of the official SQLite WebAssembly build and whether its keyword index (FTS5) is switched on; the licence of each model; whether GitHub Pages serves partial file requests; the few-milliseconds estimate for comparing 10,000 vectors.
