# Third-party notices

Loadout's own code and assets are MIT licensed (see `LICENSE`). The build copies the third-party files below into `vendor/` (and into `dist/vendor/` for a deployed site). They are not part of this repository's source; they are installed by `npm install` or downloaded by `npm run build`, and each keeps its own licence. If you deploy the site, keep this file with it.

| Component | Used for | Licence | Source |
|---|---|---|---|
| `@sqlite.org/sqlite-wasm` | Search index in the browser | Apache-2.0 | https://sqlite.org/wasm |
| `@huggingface/transformers` | Runs the search model in the browser | Apache-2.0 | https://github.com/huggingface/transformers.js |
| `onnxruntime-web` | Runtime under Transformers.js | MIT | https://github.com/microsoft/onnxruntime |
| `Snowflake/snowflake-arctic-embed-xs` | "Smarter search" (search by meaning), downloaded by the build unless `--no-meaning` is used | Apache-2.0, as published on its model card | https://huggingface.co/Snowflake/snowflake-arctic-embed-xs |
| `@fontsource/geist` (Geist) | Site text | SIL Open Font License 1.1. Copyright 2024 The Geist Project Authors | https://github.com/vercel/geist-font |
| `@fontsource/pixelify-sans` (Pixelify Sans) | Site headings | SIL Open Font License 1.1. Copyright 2021 The Pixelify Sans Project Authors | https://github.com/eifetx/Pixelify-Sans |

The npm packages' licences are the ones their `package.json` declares; each package's full licence text is in its folder under `node_modules/` after `npm install`. The two fonts are served as web fonts unchanged, as the SIL Open Font License allows; their licence texts are in `node_modules/@fontsource/geist/LICENSE` and `node_modules/@fontsource/pixelify-sans/LICENSE`.

The model's licence is stated as published by its authors at the time this file was written. Check the model card before a release.

The pixel fonts used inside sprites (`pieces/font-*.v1.json`, drawn by `engine/pixel-font.js`) are original to this project and are covered by the MIT licence.
