// Builds comparison.json: the repetition score of every psalm (ESV) and of
// each hymn on hymn-list.txt (lyrics from Let's Sing), using the same
// analyzer as the web page.
//
// Run from the project folder:   node scripts/build-comparison.mjs
// Needs ESV_API_KEY in the .env file (see README). Psalm text is cached in
// scripts/.cache (not committed) so later runs don't hit the API again.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const S = require("../analyzer.js");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts", ".cache");
const LETS_SING_LOCAL = path.resolve(ROOT, "..", "Let's Sing App", "web", "public", "hymns.json");
const LETS_SING_URL = "https://taylordrummond.org/lets-sing/hymns.json";

async function env() {
    const file = path.join(ROOT, ".env");
    const out = { ...process.env };
    if (existsSync(file)) {
        for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
            if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
    }
    return out;
}

const summary = (items) => {
    const v = items.map((i) => i.score).sort((a, b) => a - b);
    const n = v.length;
    return {
        n,
        mean: n ? v.reduce((a, b) => a + b, 0) / n : 0,
        median: n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : 0,
        min: v[0] ?? 0,
        max: v[n - 1] ?? 0,
    };
};
const round = (x) => Math.round(x * 1000) / 1000;

// ---- Psalms ------------------------------------------------------------------
async function psalmText(n, key) {
    const file = path.join(CACHE, `psalm-${n}.txt`);
    if (existsSync(file)) return readFile(file, "utf8");
    if (!key) throw new Error("ESV_API_KEY is missing. Put it in the .env file (see README).");
    const params = new URLSearchParams({
        q: `Psalm ${n}`,
        "include-passage-references": "false",
        "include-verse-numbers": "false",
        "include-first-verse-numbers": "false",
        "include-footnotes": "false",
        "include-footnote-body": "false",
        "include-headings": "false",
        "include-short-copyright": "false",
        "include-copyright": "false",
        "include-selahs": "false",
        "indent-poetry": "true",
        "line-length": "0",
    });
    const res = await fetch("https://api.esv.org/v3/passage/text/?" + params, { headers: { Authorization: "Token " + key } });
    if (!res.ok) throw new Error(`ESV API: Psalm ${n} → HTTP ${res.status} ${await res.text()}`);
    const text = (await res.json()).passages.join("\n");
    await writeFile(file, text, "utf8");
    await new Promise((r) => setTimeout(r, 1100)); // stay under the API's per-minute limit
    return text;
}

// Superscriptions ("A Psalm of David.") aren't sung lines; ESV prints them
// before verse 1 without poetry indent. Drop unindented lines that come before
// the first indented (poetry) line.
const HEBREW_LETTERS = /^(Aleph|Beth|Gimel|Daleth|He|Waw|Zayin|Heth|Teth|Yodh|Kaph|Lamedh|Mem|Nun|Samekh|Ayin|Pe|Tsadhe|Qoph|Resh|Sin and Shin|Shin|Taw)$/;
function psalmLines(text) {
    const lines = text.replace(/\r/g, "").split("\n");
    // Poetry lines are indented; unindented ones are superscriptions or the
    // Hebrew-letter headings of Psalm 119 (Aleph, Beth…). "Selah" isn't sung text.
    const poetry = lines.some((l) => /^\s+\S/.test(l));
    return lines
        .filter((l) => l.trim() && (!poetry || /^\s/.test(l)))
        .map((l) => l.replace(/\s+Selah\s*$/, "").trim())
        .filter((l) => l && !HEBREW_LETTERS.test(l));
}

// ---- Hymns -------------------------------------------------------------------
// Ignores punctuation, a leading A/The/O/Oh, and a trailing "(Psalm 100)" / "(Lyra)".
const titleKey = (t) => S.normalizeLine(String(t).replace(/\s*\([^)]*\)\s*$/, "")).replace(/^(a|an|the|o|oh) /, "");

async function hymns() {
    if (existsSync(LETS_SING_LOCAL)) return JSON.parse(await readFile(LETS_SING_LOCAL, "utf8"));
    const res = await fetch(LETS_SING_URL);
    if (!res.ok) throw new Error("Couldn't load Let's Sing hymns: HTTP " + res.status);
    return res.json();
}

async function main() {
    const { ESV_API_KEY } = await env();
    await mkdir(CACHE, { recursive: true });
    const out = { built: new Date().toISOString().slice(0, 10), psalms: null, hymns: null };

    // Hymns first: needs no key
    const listFile = path.join(ROOT, "hymn-list.txt");
    const wanted = (await readFile(listFile, "utf8")).split(/\r?\n/)
        .map((l) => l.replace(/#.*/, "").trim()).filter(Boolean)
        .map((l) => { const [list, ls] = l.split("=>").map((x) => x.replace(/\s*\(\d+\)\s*$/, "").trim()); return { list, ls: ls || list }; });
    const all = await hymns();
    const byTitle = new Map(all.map((h) => [titleKey(h.title), h]));
    const hymnItems = [];
    const missing = [];
    const seen = new Set();
    for (const { list, ls } of wanted) {
        const h = byTitle.get(titleKey(ls)) || all.find((x) => x.title === ls);
        if (!h) { if (!missing.includes(list)) missing.push(list); continue; }
        if (seen.has(h.id)) continue; // same hymn listed twice: count it once
        seen.add(h.id);
        const r = S.analyze(h.verses.join("\n\n"));
        hymnItems.push({ name: h.title, score: round(r.score), unique: r.unique, total: r.total });
    }
    out.hymns = { label: "hymns", ...summary(hymnItems), items: hymnItems };
    console.log(`Hymns: ${hymnItems.length} of ${wanted.length} found. Mean ${out.hymns.mean.toFixed(2)}, median ${out.hymns.median.toFixed(2)}`);
    if (missing.length) console.log("  Not found in Let's Sing:\n   - " + missing.join("\n   - "));

    // Psalms
    try {
        const psItems = [];
        for (let n = 1; n <= 150; n++) {
            const r = S.analyze(psalmLines(await psalmText(n, ESV_API_KEY)).join("\n"));
            psItems.push({ name: `Psalm ${n}`, score: round(r.score), unique: r.unique, total: r.total });
            process.stdout.write(`\rPsalms: ${n}/150`);
        }
        out.psalms = { label: "Psalms 1–150 (ESV)", ...summary(psItems), items: psItems };
        console.log(`\nPsalms: mean ${out.psalms.mean.toFixed(2)}, median ${out.psalms.median.toFixed(2)}`);
    } catch (e) {
        console.log("\nPsalms skipped: " + e.message);
        const prev = existsSync(path.join(ROOT, "comparison.json")) ? JSON.parse(await readFile(path.join(ROOT, "comparison.json"), "utf8")) : {};
        out.psalms = prev.psalms || null;
    }

    for (const k of ["psalms", "hymns"]) if (out[k]) { out[k].mean = round(out[k].mean); out[k].median = round(out[k].median); }
    await writeFile(path.join(ROOT, "comparison.json"), JSON.stringify(out, null, 1) + "\n", "utf8");
    console.log("Wrote comparison.json");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
