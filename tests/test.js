// Run: node tests/test.js
const assert = require("assert");
const S = require("../analyzer.js");
// Song lyrics from the spreadsheet are copyrighted, so this file stays local (.gitignore)
let sheets = null;
try { sheets = require("./excel-sheets.json"); } catch { console.log("(tests/excel-sheets.json not found: skipping spreadsheet checks)"); }

let pass = 0;
function t(name, fn) { fn(); pass++; console.log("ok -", name); }

// 1. Reproduces the Excel first sheet exactly (How Great Thou Art)
if (sheets) t("Excel first sheet: 18 unique, 32 total, 144 weight, score 8", () => {
    const s = sheets["Visualizer (2)"];
    const r = S.analyze(s.lines.join("\n"));
    assert.strictEqual(r.unique, s.I2);
    assert.strictEqual(r.total, s.I3);
    assert.strictEqual(r.weight, s.I4);
    assert.strictEqual(r.score, s.I5);
});

// 2. Excel's raw formula, cell-for-cell (COUNTIF is case-insensitive, compares whole cell)
function excelRaw(lines) {
    const c = new Map();
    for (const l of lines) { const k = String(l).toLowerCase(); c.set(k, (c.get(k) || 0) + 1); }
    let w = 0; for (const n of c.values()) w += n * n;
    return w / c.size;
}
t("Formula identity: weight/unique equals Excel's raw computation when lines already clean", () => {
    const lines = ["a b", "c d", "a b", "e", "a b", "c d"];
    assert.strictEqual(S.analyze(lines.join("\n")).score, excelRaw(lines));
});

// 3. Punctuation, case, spacing, quotes, verse numbers no longer split lines
t("Punctuation does not skew matching", () => {
    const r = S.analyze([
        "How great thou art! How great thou art!",
        "how great thou art, how great thou art  ",
        "“How great Thou art—how great Thou art”",
        "2 How great thou art. How great thou art.",
    ].join("\n"));
    assert.strictEqual(r.unique, 1);
    assert.strictEqual(r.score, 16);
});
t("Apostrophes: thy pow'r = thy pow’r", () => {
    assert.strictEqual(S.normalizeLine("thy pow'r"), S.normalizeLine("Thy pow’r,"));
});
t("Numbers inside a line are kept (not verse numbers)", () => {
    assert.notStrictEqual(S.normalizeLine("10,000 reasons"), S.normalizeLine("reasons"));
});

// 4. Directions
t("Inline (x2) sings the line twice", () => {
    const r = S.analyze("Holy, holy (x2)\nLord God");
    assert.strictEqual(r.total, 3);
});
t("Standalone x2 repeats the stanza above", () => {
    const r = S.analyze("A\nB\nx2\n\nC");
    assert.strictEqual(r.total, 5);
});
t("Chorus label alone sings the chorus again", () => {
    const r = S.analyze("Verse 1\nOne\n\nChorus\nC1\nC2\n\nVerse 2\nTwo\n\nChorus\n\nChorus x2");
    assert.strictEqual(r.total, 2 + 2 + 2 + 4);
    assert.strictEqual(r.counts.get("c1"), 4);
});
t("Repeat chorus / Repeat last line / Repeat", () => {
    const r = S.analyze("[Chorus]\nC1\nC2\n\nV\nW\n(Repeat Chorus)\nEnd line\nRepeat last line\n\nZ\nRepeat");
    // C1 C2 V W, C1 C2, End End, Z Z
    assert.strictEqual(r.total, 10);
});
t("Chorus x2 header with lyrics under it", () => {
    const r = S.analyze("Chorus x2\nC1\nC2\n\nV");
    assert.strictEqual(r.total, 5);
});
t("Lyrics that merely say 'repeat' stay lyrics", () => {
    const r = S.analyze("Repeat, repeat, the sounding joy.\nRepeat the hymn again:\nI will Thy worthy praise repeat.");
    assert.strictEqual(r.total, 3);
    assert.strictEqual(r.notes.length, 0);
});
t("Blank lines ignored", () => {
    assert.strictEqual(S.analyze("\n\nA\n\n\nB\n  \n").total, 2);
});
t("Colors cap at 10+", () => {
    assert.strictEqual(S.colorFor(14).bg, S.colorFor(10).bg);
    assert.strictEqual(S.colorFor(1).bg, "#00B0F0");
});

// Report: every sheet, Excel raw vs. new (informational only)
if (sheets) console.log("\nSheet                Excel-raw  New");
for (const [name, s] of Object.entries(sheets || {})) {
    console.log(name.padEnd(20), excelRaw(s.lines).toFixed(2).padStart(9), S.analyze(s.lines.join("\n")).score.toFixed(2).padStart(6));
}
console.log(`\n${pass} tests passed`);
