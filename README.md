# Song Repetition Visualizer

Paste a song's lyrics to see how repetitive it is. Each line is colored by how many times it is sung. The song's score is shown next to the average psalm and the average hymn.

Live at https://taylordrummond.org/song-repetition/ once it's deployed.

## The formula

This comes from the first sheet of `Song Repetition Visualizer.xlsx`:

    score = Σ(count² of each unique line) ÷ (number of unique lines)

This is the same as the sheet's Total weight (I4) divided by its Unique Lines (I2). The code is in `analyzer.js`, and `tests/test.js` checks that it reproduces the sheet exactly.

What the web version changes:
- Lines are matched by their words only. Punctuation, capitals, spacing, quote styles and leading verse numbers are ignored.
- Directions are expanded before counting: `Chorus`, `Repeat chorus`, `(x2)`, `Repeat last line` and similar.

## Psalm and hymn figures

`comparison.json` is built by a script. The page only reads that file; your API key is never sent to the website.

1. **Add the ESV API key (one time on each PC).** In this folder, copy `.env.example` to a new file called `.env`, open it in Notepad and fill in the line:

       ESV_API_KEY=paste-your-key-here

   `.env` is listed in `.gitignore`, so the key never reaches GitHub.
2. **Choose the hymns.** List them in `hymn-list.txt`, one title per line. Use `List title => Let's Sing title` when Let's Sing spells a title differently.
3. **Run:** `node scripts/build-comparison.mjs`

Psalm text is cached in `scripts/.cache/`, which is not committed, so later runs don't call the API again. The hymn texts come from `..\Let's Sing App\web\public\hymns.json`.

## Run locally

    python -m http.server 8000

Then open http://localhost:8000. Run the tests with `node tests/test.js`.

## Deploy

GitHub Pages from `main` in the repo SotS1689/song-repetition. It is served under the taylordrummond.org custom domain.
