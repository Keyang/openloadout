# Search evaluation: what was measured, and the model choice

Written 2026-11-18 for features FIND-2, FIND-8, FIND-9 and FIND-10. This is the test that `search-design.md` section 6 asked for. Everything in the "Measured" section is written by `node tools/search-eval.mjs --write`; the rest is the reading of those numbers.

## The answer

1. **No model met the pass mark.** The mark was: keyword plus model finds the right asset in the top 5 at least 15 points more often than keyword alone on description-style searches, with a model under 35 MB. The models gained 14 points on the main test set and 5 to 7 points on a held-out set. Keyword search alone was already at 86% and 93% on those searches, so there was little left to gain.
2. **Decision (2026-11-18): search by meaning is off by default and offered to the visitor as a switch.** `createSearch({ catalog })` does no model work at all: no model file is fetched, no worker is started, and the vectors in the index file are not read. `s.enableMeaning()` turns it on for that visitor (a 38.5 MB download, then 9 to 13 ms per query) and `s.disableMeaning()` turns it off again. A site built with `--no-meaning` has no vectors and no model files, and the switch reports that it is not available.
3. **The model behind the switch is `Snowflake/snowflake-arctic-embed-xs`** (8-bit, 23.0 MB, 384 numbers per vector, Apache-2.0; `DEFAULT_MODEL` in `tools/lib/embed.mjs`). On this test it cannot be told apart from all-MiniLM-L6-v2, which is the same size and scored the same; bge-small found one more search and is 11 MB larger. arctic-embed-xs was kept for its higher published retrieval score. On this evidence the choice between the two small models is a coin toss.

**What the model buys: a better first result, and about the same top 5.**

| Searches | Top 5, keywords only | Top 5, with the model | First place, keywords only | First place, with the model |
|---|---:|---:|---:|---:|
| Main set, 100 searches (their author also wrote the catalogue) | 91% | 98% | 77% | 86% |
| Held-out set, 40 description searches (written from asset names only) | 93% | 98% | 73% | 83% |
| The reviewer's own 25 untuned searches (an independent check; figures as reported by the reviewer, not re-run here) | 96% | 96% | 84% | 92% |

The 7-point top-5 gain on the main set is seven searches. Three are everyday or slang words that were left out of the assets' word lists ("kitty", "shroom", "explode"); adding those words to the lists would give keyword search the same result with no model. Four are descriptions that share no word with the asset. Two more slang words ("robber", "specter") are missed with or without the model. On the two sets nobody tuned against, the top-5 gain is 5 points and 0 points. The first-place gain (8 to 10 points) is the consistent one across all three sets.

What it costs: a 38.5 MB download for a visitor who switches it on (the 23.7 MB model plus a 14.3 MB runtime that the design document did not count).

## How to read the test

- **The catalogue** is a stand-in: 490 entries written from the lists in `asset-taxonomy.md` (253 sprites, 199 sounds, 38 music tracks), with names, one-sentence descriptions, roles, themes and word lists. No art or sound exists for them. It is made by `tests/fixtures/search/make-catalog.mjs`.
- **The main question set** is 100 searches in `tests/fixtures/search/queries.json`, each with the ids that count as right, in six kinds: exact name, verb or event, synonym, description, misspelling, and search with filters.
- **The held-out set** is 40 more description searches in `queries-blind.json`. The main set and the catalogue were written by the same author, who knew which words each asset carried; that flatters keyword search and the models alike. The held-out searches were written by a separate agent that saw only each asset's id, type, role and name, and was told not to use the main word of the name. Read the held-out numbers as the more honest ones for description searches.
- **A search is "found"** when one of its right answers is in the first 5 results.
- **Sample size is small.** One search is 3.6 points on the 28 description searches and 2.5 points on the held-out 40. Differences of one or two searches between methods are noise. The 15-point mark could not have been met on the main set at all once keyword search reached 86%: the most any model could add was 14.
- **Methods.** "Basic keyword" is `search/core.js` working from the catalogue alone, with typo tolerance. "FTS5 keyword" is SQLite's keyword index in the index file, with spelling corrected from the catalogue's words (without that help it finds 7% of misspellings). "Both keyword searches" merges those two rankings; it is what the site uses at the keywords level. "Model alone" compares the query's vector with every asset's 8-bit vector. "Keyword + model" merges the keyword ranking with the model's ranking by position (reciprocal rank fusion, equal weight), after correcting the query's spelling against the catalogue's words (a word the model itself knows is left alone, so "robber" is not turned into "bobber") and dropping assets less similar than the model's floor (see "The similarity floor" below); it is what the site uses at the meaning level.

## What the numbers say

- **Keyword search is strong when assets carry good word lists.** 89% from the catalogue alone, with every exact name, misspelling and filtered search found. This is the level every visitor has from the first keystroke, so the word lists in each asset's `meta.words` matter more than the model.
- **The SQLite keyword index adds little accuracy over the basic search** (92% against 89% in the top 5; 74% against 78% in first place). The index file earns its place through stored "similar asset" lists, the vectors, and being one file other tools can read, not through better keyword ranking.
- **A model alone is not enough.** Every model fails on misspellings (21% to 57%), which keyword search handles. The two have to be merged.
- **All four models land within two searches of each other when merged with keywords** (97% to 99%). The choice between them is about size and what it takes to run them, not accuracy.
- **Storing vectors as 8-bit numbers loses nothing measurable** (the same top-5 rate as full precision for every model, within one search).

## The static model: a cheaper route the contracts do not allow yet

`minishlab/potion-base-8M` is not a neural network pass but a table with one vector per word piece. A JavaScript route exists and is what `tools/lib/embed.mjs` uses: read the table from `model.safetensors`, look up each token, average. It was measured here at 97% in the top 5 on the main set with keywords (one search fewer than the chosen model) and 98% on the held-out set (the same), but 81% against 86% in first place.

| | snowflake-arctic-embed-xs | potion-base-8M, table stored as 8-bit |
|---|---|---|
| Download for the meaning level | 38.5 MB (model 23.7 MB, runtime 14.3 MB, Transformers.js 0.6 MB) | about 8.2 MB (table 7.6 MB, tokenizer 0.7 MB) |
| Time to read one query | 9 to 13 ms in a worker | under 0.1 ms, no worker needed |
| Runs through | Transformers.js and ONNX Runtime WebAssembly | about 40 lines of plain JavaScript and a tokenizer |
| Numbers per vector | 384 | 256 |
| Top 5, all 100 searches, with keywords | 98% | 97% |
| Top 5, 40 held-out searches, with keywords | 98% | 98% |
| First place, all 100 searches, with keywords | 86% | 81% |

It is not what the site uses because Contract 5 says 384 numbers per vector and the task named Transformers.js in a worker; a browser tokenizer for it has not been written. This is the first thing to revisit: it removes four fifths of the download behind the switch, for the same top 5 and a weaker first place (the model's main benefit).

## Rules the search follows, added after review

- **Nonsense finds nothing.** Input with no words in it (`"`, `*`, an emoji, `日本`) returns no results at every level; only an empty search lists assets. One-letter words are never treated as the start of a word, and a search is cut to 200 characters and 16 words.
- **Results have to be similar enough.** At the meaning level an asset under the similarity floor (0.56 for the chosen model) is not a result, and the model is not asked at all about input made only of filler words and single letters. On the real 27-asset library "spooky" now returns nothing instead of 27 unrelated assets, and "money" returns the coin and its sound. How the floor was set is in "The similarity floor" below: right answers score 0.55 to 0.76, nonsense 0.49 to 0.53, and at 0.56 two right answers in 121 are lost. It was set on the same searches it is reported on.
- **Similar assets go by the catalogue first.** Assets are ranked by shared words, role and bundle; the vectors only order ties and fill up the list. On the real library the vectors alone put knight, slime and wolf next to the coin; the list is now coin-pickup, powerup, chime-success, battle-theme, footstep-gravel, metal-hit.
- **The model reads one search at a time.** While someone types, only the newest waiting search is kept; if the model's worker breaks, search drops back to keywords at once.

## What the design document listed as "not confirmed"

| Item | Result |
|---|---|
| 8-bit download size of snowflake-arctic-embed-xs | **Confirmed.** `onnx/model_quantized.onnx` is 22,972,992 bytes (23.0 MB); 23.7 MB with the tokenizer. The guess was "about 23 MB" |
| Download size of the official SQLite WebAssembly build | **Measured.** `index.mjs` 657 KB and `sqlite3.wasm` 879 KB: 1.54 MB, 586 KB gzipped (version 3.54.1) |
| Whether its keyword index (FTS5) is switched on | **Confirmed.** `ENABLE_FTS5` is in its compile options, and `tests/unit/search-index.test.mjs` opens an index file with it and runs a keyword search |
| The licence of each model | arctic-embed-xs: Apache-2.0 (stated in the model card text; the card's licence field is empty). all-MiniLM-L6-v2: Apache-2.0. bge-small-en-v1.5: MIT (on BAAI's original; the Xenova conversion carries no licence field). potion-base-8M: MIT |
| Whether GitHub Pages serves partial file requests | **Confirmed.** A `Range: bytes=0-99` request to files on pages.github.com returns `206` with `content-range`. Not needed by this design: the index file is small enough to fetch whole |
| The few-milliseconds estimate for comparing 10,000 vectors | **Confirmed.** About 5 ms in plain JavaScript (see the table below), so no vector index or extension is needed at this catalogue's size |
| The potion model download size | **Corrected.** potion-base-8M is 30.2 MB as published (32-bit) and 7.6 MB if the table is stored as 8-bit, with no loss measured. The 129 MB figure is potion-retrieval-32M, not tested |

## What the design document got wrong or left out

1. **The runtime is a download too.** Running a neural model in the browser needs ONNX Runtime's WebAssembly file: 14.3 MB (3.7 MB gzipped), on top of the model. The meaning level is a 38.5 MB download, not 23 MB.
2. **WebGPU is slower here, not faster.** For this small 8-bit model, one query took 9 to 13 ms on one processor thread and about 40 ms on WebGPU (180 ms for the first), and WebGPU needs a 26.9 MB runtime instead of the 14.3 MB one. Measured in headless Chromium on an Apple M1 Max with WebGPU switched on by flags. So the site runs the model on the processor by default and does not copy the WebGPU runtime; `createSearch({ device: 'auto' })` with `vendorAll({ webgpu: true })` turns it on. The 530 ms WebAssembly figure quoted in the design document does not apply to this model.
3. **The headers GitHub Pages cannot send do not matter.** One thread is fast enough for one short query at a time.
4. **Transformers.js has no built-in support for model2vec (potion) models**, and it cannot take a full web address as its local model folder; `search/embed-worker.js` gives it the vendor folder as its download host instead.

## Not measured

- Time to first result on a cold visit over a real network. On this machine, from a local server: the keywords level was ready 50 ms after the page asked for it, and the meaning level 0.3 to 0.7 s after it was switched on.
- Phones, slow laptops, Safari and Firefox. Only headless Chromium on an M1 Max was used.
- WebGPU with a full-precision (not 8-bit) model, which is where WebGPU usually wins; that model is 45 to 90 MB, over the size limit.
- Searches by real visitors. Both question sets were written by agents.

## Measured

<!-- measured:start (written by tools/search-eval.mjs --write) -->

Test set: 490 catalogue entries, 100 searches. Node v24.19.0. A search counts as found when a right answer is in the first 5 results.

### Right asset in the top 5

| Method | exact (13) | verb (14) | synonym (17) | description (28) | misspelling (14) | filtered (14) | **All** (100) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Basic keyword | 100% | 93% | 76% | 79% | 100% | 100% | 89% |
| FTS5 keyword | 100% | 93% | 76% | 89% | 100% | 100% | 92% |
| Both keyword searches | 100% | 93% | 76% | 86% | 100% | 100% | 91% |
| snowflake-arctic-embed-xs alone | 100% | 100% | 94% | 100% | 21% | 100% | 88% |
| all-MiniLM-L6-v2 alone | 100% | 100% | 88% | 100% | 36% | 100% | 89% |
| bge-small-en-v1.5 alone | 100% | 100% | 88% | 100% | 57% | 100% | 92% |
| potion-base-8M alone | 100% | 100% | 88% | 93% | 36% | 100% | 87% |
| potion-base-8M (8-bit table) alone | 100% | 100% | 88% | 93% | 36% | 100% | 87% |
| keyword + snowflake-arctic-embed-xs | 100% | 100% | 88% | 100% | 100% | 100% | 98% |
| keyword + all-MiniLM-L6-v2 | 100% | 100% | 88% | 100% | 100% | 100% | 98% |
| keyword + bge-small-en-v1.5 | 100% | 100% | 94% | 100% | 100% | 100% | 99% |
| keyword + potion-base-8M | 100% | 100% | 88% | 96% | 100% | 100% | 97% |
| keyword + potion-base-8M (8-bit table) | 100% | 100% | 88% | 96% | 100% | 100% | 97% |

### Right asset in first place

| Method | exact (13) | verb (14) | synonym (17) | description (28) | misspelling (14) | filtered (14) | **All** (100) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Basic keyword | 100% | 86% | 65% | 61% | 86% | 93% | 78% |
| FTS5 keyword | 92% | 86% | 65% | 54% | 79% | 93% | 74% |
| Both keyword searches | 92% | 86% | 65% | 61% | 86% | 93% | 77% |
| snowflake-arctic-embed-xs alone | 100% | 79% | 94% | 75% | 21% | 93% | 77% |
| all-MiniLM-L6-v2 alone | 100% | 100% | 71% | 68% | 21% | 79% | 72% |
| bge-small-en-v1.5 alone | 100% | 86% | 65% | 79% | 36% | 86% | 75% |
| potion-base-8M alone | 85% | 64% | 88% | 71% | 21% | 100% | 72% |
| potion-base-8M (8-bit table) alone | 85% | 64% | 88% | 71% | 21% | 100% | 72% |
| keyword + snowflake-arctic-embed-xs | 92% | 93% | 82% | 71% | 93% | 100% | 86% |
| keyword + all-MiniLM-L6-v2 | 100% | 86% | 71% | 82% | 100% | 86% | 86% |
| keyword + bge-small-en-v1.5 | 100% | 86% | 76% | 79% | 93% | 93% | 86% |
| keyword + potion-base-8M | 92% | 86% | 76% | 61% | 93% | 100% | 81% |
| keyword + potion-base-8M (8-bit table) | 92% | 86% | 76% | 61% | 93% | 100% | 81% |

### The pass mark

Keyword plus model must find the right asset in the top 5 at least 15 points more often than keyword alone on description searches, with a model under 35.0 MB. Keyword alone on description searches: 86%.

On the 40 held-out description searches (`queries-blind.json`, written without sight of the descriptions and words), keyword alone finds 93%.

| Model | Keyword + model, description | Gain (points) | Keyword + model, held-out | Gain, held-out (points) | Model download | Passed on the main set | Passed on the held-out set |
|---|---:|---:|---:|---:|---:|---:|---:|
| Snowflake/snowflake-arctic-embed-xs | 100% | +14 | 98% | +5 | 23.7 MB | no | no |
| Xenova/all-MiniLM-L6-v2 | 100% | +14 | 98% | +5 | 23.7 MB | no | no |
| Xenova/bge-small-en-v1.5 | 100% | +14 | 100% | +7 | 34.7 MB | no | no |
| minishlab/potion-base-8M | 96% | +11 | 98% | +5 | 30.9 MB | no | no |
| minishlab/potion-base-8M (8-bit table) | 96% | +11 | 98% | +5 | 8.2 MB | no | no |

### The held-out description searches (40)

| Method | In the top 5 | In first place |
|---|---:|---:|
| Basic keyword | 90% | 75% |
| FTS5 keyword | 90% | 75% |
| Both keyword searches | 93% | 73% |
| snowflake-arctic-embed-xs alone | 95% | 78% |
| all-MiniLM-L6-v2 alone | 95% | 75% |
| bge-small-en-v1.5 alone | 98% | 78% |
| potion-base-8M alone | 98% | 75% |
| potion-base-8M (8-bit table) alone | 98% | 75% |
| keyword + snowflake-arctic-embed-xs | 98% | 83% |
| keyword + all-MiniLM-L6-v2 | 98% | 83% |
| keyword + bge-small-en-v1.5 | 100% | 83% |
| keyword + potion-base-8M | 98% | 75% |
| keyword + potion-base-8M (8-bit table) | 98% | 75% |

### Models

| Model | Kind | Numbers per vector | Licence | Download | Download, gzip | One query in Node (median) | Slowest query | All 490 assets | Index file |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Snowflake/snowflake-arctic-embed-xs | transformer | 384 | Apache-2.0 | 23.7 MB | 16.0 MB | 1.2 ms | 3.2 ms | 0.7 s | 848 KB |
| Xenova/all-MiniLM-L6-v2 | transformer | 384 | Apache-2.0 | 23.7 MB | 16.0 MB | 0.9 ms | 2.6 ms | 0.8 s | 848 KB |
| Xenova/bge-small-en-v1.5 | transformer | 384 | MIT | 34.7 MB | 24.1 MB | 2.3 ms | 4.2 ms | 1.3 s | 848 KB |
| minishlab/potion-base-8M | static | 256 | MIT | 30.9 MB | 28.3 MB | 0.0 ms | 0.0 ms | 0.0 s | 782 KB |
| minishlab/potion-base-8M (8-bit table) | static | 256 | MIT | 8.2 MB | not measured | 0.0 ms | 0.0 ms | 0.0 s | 782 KB |

- Snowflake/snowflake-arctic-embed-xs: `config.json` 737 bytes, `tokenizer.json` 711,649 bytes, `tokenizer_config.json` 1,433 bytes, `onnx/model_quantized.onnx` 22,972,992 bytes. Top 5 with full-precision vectors instead of 8-bit: 88% overall (8-bit: 88%).
- Xenova/all-MiniLM-L6-v2: `config.json` 650 bytes, `tokenizer.json` 711,661 bytes, `tokenizer_config.json` 366 bytes, `onnx/model_quantized.onnx` 22,972,370 bytes. Top 5 with full-precision vectors instead of 8-bit: 89% overall (8-bit: 89%).
- Xenova/bge-small-en-v1.5: `config.json` 683 bytes, `tokenizer.json` 711,396 bytes, `tokenizer_config.json` 366 bytes, `onnx/model_quantized.onnx` 34,014,426 bytes. Top 5 with full-precision vectors instead of 8-bit: 91% overall (8-bit: 92%).
- minishlab/potion-base-8M: `config.json` 202 bytes, `tokenizer.json` 683,666 bytes, `tokenizer_config.json` 1,431 bytes, `model.safetensors` 30,236,760 bytes. Note: the table is 30.2 MB as 32-bit numbers; as 8-bit it would be 7.6 MB (29528 rows of 256). Top 5 with full-precision vectors instead of 8-bit: 87% overall (8-bit: 87%).
- minishlab/potion-base-8M (8-bit table): `config.json` 202 bytes, `tokenizer.json` 683,666 bytes, `tokenizer_config.json` 1,431 bytes, `model.safetensors` 30,236,760 bytes. Note: the table is 30.2 MB as 32-bit numbers; as 8-bit it would be 7.6 MB (29528 rows of 256). Top 5 with full-precision vectors instead of 8-bit: 87% overall (8-bit: 87%).

### The similarity floor

At the meaning level an asset less similar to the query than the floor is not a result, so nonsense finds nothing and a small library is not padded with unrelated assets. "Right answers" are the right assets the model ranks in its own top 5, over the main and held-out searches (misspellings left out). The floor for the chosen model is fixed in `tools/lib/embed.mjs`; for the others it is the highest value that loses at most 2% of the right answers. It was set on these same searches, so it is fitted to them.

| Model | Right answers | Lowest | 5th percentile | Median | Nonsense input (6 strings), nearest asset | Floor | Right answers under the floor | Results over the floor per search (of 50) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Snowflake/snowflake-arctic-embed-xs | 121 | 0.549 | 0.569 | 0.642 | 0.488 to 0.533 | 0.56 | 2 of 121 | 18.3 |
| Xenova/all-MiniLM-L6-v2 | 119 | 0.295 | 0.352 | 0.551 | 0.141 to 0.292 | 0.31 (by the 2% rule) | 2 of 119 | 21.0 |
| Xenova/bge-small-en-v1.5 | 120 | 0.561 | 0.648 | 0.741 | 0.520 to 0.645 | 0.61 (by the 2% rule) | 2 of 120 | 19.5 |
| minishlab/potion-base-8M | 118 | 0.214 | 0.356 | 0.576 | 0.183 to 0.316 | 0.28 (by the 2% rule) | 2 of 118 | 20.0 |
| minishlab/potion-base-8M (8-bit table) | 118 | 0.213 | 0.356 | 0.576 | 0.183 to 0.315 | 0.28 (by the 2% rule) | 2 of 118 | 20.0 |

### Other measurements

| What | Measured |
|---|---:|
| Basic keyword search, one query (median) | 0.03 ms |
| Building the basic keyword search from the catalogue | 9 ms |
| FTS5 keyword search in Node, one query (median) | 0.07 ms |
| Comparing one query with 10,000 stored vectors (384 numbers, 8-bit) in plain JavaScript | 3.8 ms |
| Index file without vectors (490 assets) | 639 KB |
| Index file with snowflake-arctic-embed-xs vectors | 848 KB |
| Index file with all-MiniLM-L6-v2 vectors | 848 KB |
| Index file with bge-small-en-v1.5 vectors | 848 KB |
| Index file with potion-base-8M vectors | 782 KB |
| SQLite WebAssembly build: `index.mjs` | 657 KB (179 KB gzip) |
| SQLite WebAssembly build: `sqlite3.wasm` | 879 KB (407 KB gzip) |
| FTS5 keyword search without spelling help: misspelling searches found | 7% |

<!-- measured:end -->

### In the browser

From `tests/e2e/search.spec.mjs` and one-off runs, headless Chromium (Playwright 1.65), Apple M1 Max, local static server.

| What | Measured |
|---|---:|
| Keywords level ready (SQLite WebAssembly loaded, 848 KB index file opened, vectors read) | 45 to 55 ms |
| Meaning level ready after it is switched on (runtime and model loaded from a local server, first run done) | 0.3 to 0.7 s |
| One query read by the model, one processor thread | 9 to 13 ms |
| One whole search at the meaning level (keywords, model, comparing vectors, merging) | 9 to 18 ms |
| One query read by the model on WebGPU, same 8-bit model | about 40 ms; 180 ms for the first |
| Meaning level ready on WebGPU | 1.2 s |

### What `vendor/` holds

Written by `vendorAll()` in `tools/lib/vendor.mjs`: 9 files, 40.1 MB. `vendorAll({ meaning: false })` writes the SQLite files only (1.5 MB).

| File | Size | Fetched |
|---|---:|---|
| `sqlite/index.mjs`, `sqlite/sqlite3.wasm` | 1.54 MB | By every visitor, at the keywords level |
| `transformers/transformers.min.js` | 0.59 MB | When the visitor switches search by meaning on |
| `ort/ort-wasm-simd-threaded.mjs`, `.wasm` | 14.29 MB | When the visitor switches search by meaning on |
| `models/Snowflake/snowflake-arctic-embed-xs/` (config, tokenizer, `onnx/model_quantized.onnx`) | 23.69 MB | When the visitor switches search by meaning on |
