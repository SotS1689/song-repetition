/*
 * Song Repetition Analyzer: the formula from "Song Repetition Visualizer.xlsx"
 * (first sheet), with better line matching and sung-repeat directions.
 *
 * Excel:  count  = COUNTIF(lyrics, line)               (column B)
 *         weight = SUM(code × lines with that count)   (column F, I4)
 *         unique = SUM(lines with count / count)       (I2)
 *         score  = weight / unique                     (I5)
 * Same thing: score = Σ(count² over distinct lines) / distinct lines.
 *
 * Works in the browser (window.SongRepetition) and in Node (require).
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.SongRepetition = factory();
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    // ---- Matching key: what makes two lines "the same line" -------------------
    // Excel compared raw cells, so a trailing space, a comma, a curly quote or a
    // verse number made a repeated line look new. Here those are all ignored;
    // only the words (and their order) count.
    function normalizeLine(text) {
        return String(text)
            .normalize("NFKD")
            .replace(/[̀-ͯ]/g, "")       // accents: é → e
            .replace(/�/g, "")                // broken-character marks
            .toLowerCase()
            .replace(/^\s*\d+\s*[.):]?\s+(?=\D)/, "") // leading verse number "2 " / "2. "
            .replace(/['‘’ʼ`]/g, "") // apostrophes join: pow'r → powr
            .replace(/[^\p{L}\p{N}]+/gu, " ")      // every other mark → space
            .trim()
            .replace(/\s+/g, " ");
    }

    // ---- Directions ------------------------------------------------------------
    const SECTION = "(verse|chorus|refrain|pre[- ]?chorus|bridge|tag|intro|outro|ending|interlude|instrumental|vamp|coda|turnaround)";
    const COUNT = "(?:x\\s*(\\d+)|(\\d+)\\s*x|×\\s*(\\d+)|(\\d+)\\s*×|(twice)|(three times|thrice)|(\\d+)\\s*times)";
    const headerRe = new RegExp("^[\\[(]?\\s*" + SECTION + "\\s*(\\d+)?\\s*[\\])]?\\s*:?\\s*(?:[\\[(]?\\s*" + COUNT + "\\s*[\\])]?)?\\s*:?$", "i");
    const repeatRe = new RegExp(
        "^[\\[(]?\\s*(?:repeat|rpt\\.?)\\s*(?:the\\s+)?" +
        "((?:" + SECTION.slice(1, -1) + ")\\s*\\d*|last\\s+(?:\\d+|two|three|four)\\s+lines|last\\s+line|line|all|that|previous|above)?" +
        "\\s*(?:[\\[(]?\\s*" + COUNT + "\\s*[\\])]?)?\\s*[\\])]?\\s*[:.]?$", "i");
    const countOnlyRe = new RegExp("^[\\[(]?\\s*" + COUNT + "\\s*[\\])]?\\s*[:.]?$", "i");
    const inlineRe = new RegExp("\\s*(?:[\\[(]\\s*(?:" + COUNT + "|(repeat))\\s*[\\])]|\\s(?:x\\s*(\\d+)|(\\d+)x))\\s*$", "i");

    const WORD_NUM = { two: 2, three: 3, four: 4 };

    function countFrom(m, start) {
        // Pulls the number out of the COUNT groups beginning at index `start`.
        const g = m.slice(start, start + 7);
        if (g[0] || g[1] || g[2] || g[3]) return parseInt(g[0] || g[1] || g[2] || g[3], 10);
        if (g[4]) return 2;
        if (g[5]) return 3;
        if (g[6]) return parseInt(g[6], 10);
        return null;
    }

    function sectionKey(name, num) {
        let n = name.toLowerCase().replace(/[- ]/g, "");
        if (n === "v") n = "verse";
        if (n === "refrain") n = "chorus";
        return num ? n + " " + num : n;
    }

    /**
     * Turns pasted lyrics into the list of lines actually sung.
     * One pasted line = one sung line; blank lines only separate stanzas.
     * Returns { sung: [{text, key, source, repeated}], notes: [string] }.
     */
    function expandLyrics(raw) {
        const notes = [];
        const sections = {};     // key → array of line objects
        const stanzas = [];      // arrays of line objects, in order sung
        let current = null;      // stanza being filled
        let currentKey = null;

        function startStanza(key) {
            current = [];
            currentKey = key;
            stanzas.push(current);
        }
        function lastStanzaWithLines() {
            for (let i = stanzas.length - 1; i >= 0; i--) if (stanzas[i].length) return stanzas[i];
            return null;
        }
        function copyOf(lines, why) {
            return lines.map((l) => ({ text: l.text, key: l.key, source: l.source, repeated: why }));
        }

        const rawLines = String(raw).replace(/\r\n?/g, "\n").split("\n");
        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i].trim();
            if (!line) {
                if (current && current.length) { if (currentKey) sections[currentKey] = current; current = null; currentKey = null; }
                continue;
            }

            let m;
            // "Chorus", "[Verse 2]", "Chorus x2"
            if ((m = line.match(headerRe))) {
                if (current && current.length && currentKey) sections[currentKey] = current;
                const key = sectionKey(m[1], m[2]);
                const times = countFrom(m, 3);
                const nextIsLyric = (() => {
                    for (let j = i + 1; j < rawLines.length; j++) {
                        const t = rawLines[j].trim();
                        if (!t) return false;
                        return !headerRe.test(t) && !repeatRe.test(t) && !countOnlyRe.test(t);
                    }
                    return false;
                })();
                if (!nextIsLyric && sections[key]) {
                    // A label with no words under it: sing that section again
                    const n = times || 1;
                    for (let k = 0; k < n; k++) stanzas.push(copyOf(sections[key], line));
                    notes.push(`“${line}” → ${m[1]}${m[2] ? " " + m[2] : ""} sung ${n === 1 ? "again" : n + " more times"}`);
                    current = null; currentKey = null;
                } else {
                    startStanza(key);
                    if (times && times > 1) current.timesPending = times;
                }
                continue;
            }

            // "Repeat chorus", "Repeat last line", "(Repeat)", "Repeat x2"
            if ((m = line.match(repeatRe))) {
                const what = (m[1] || "").toLowerCase().trim();
                const times = countFrom(m, 2) || 1;
                let lines = null;
                let label = "the previous stanza";
                const lm = what.match(/^last\s+(\d+|two|three|four)?\s*lines?$/);
                if (lm) {
                    const n = lm[1] ? (WORD_NUM[lm[1]] || parseInt(lm[1], 10)) : 1;
                    const pool = lastStanzaWithLines() || [];
                    lines = pool.slice(-n);
                    label = n === 1 ? "the last line" : `the last ${n} lines`;
                } else if (what && !/^(all|that|previous|above|line)$/.test(what)) {
                    const sm = what.match(new RegExp("^" + SECTION + "\\s*(\\d*)$", "i"));
                    const key = sm ? sectionKey(sm[1], sm[2]) : null;
                    lines = key && sections[key];
                    if (!lines && key && current && currentKey === key) lines = current;
                    label = what;
                } else if (what === "line") {
                    const pool = lastStanzaWithLines() || [];
                    lines = pool.slice(-1);
                    label = "the last line";
                } else {
                    lines = lastStanzaWithLines();
                }
                if (current && current.length && currentKey) sections[currentKey] = current;
                if (lines && lines.length) {
                    for (let k = 0; k < times; k++) stanzas.push(copyOf(lines, line));
                    notes.push(`“${line}” → ${label} sung ${times === 1 ? "again" : times + " more times"}`);
                } else {
                    notes.push(`“${line}” → ignored (couldn't find ${label} above it)`);
                }
                current = null; currentKey = null;
                continue;
            }

            // A line that is only "x2" / "(2x)" / "twice": the stanza just above, n times in all
            if ((m = line.match(countOnlyRe))) {
                const times = countFrom(m, 1) || 2;
                const target = (current && current.length) ? current : lastStanzaWithLines();
                if (target) {
                    for (let k = 1; k < times; k++) stanzas.push(copyOf(target, line));
                    notes.push(`“${line}” → the stanza above sung ${times} times in all`);
                }
                if (current && current.length && currentKey) sections[currentKey] = current;
                current = null; currentKey = null;
                continue;
            }

            // A lyric line, possibly ending in "(x2)" / "[repeat]" / " x3"
            let text = line;
            let times = 1;
            const im = line.match(inlineRe);
            if (im) {
                const n = countFrom(im, 1);
                times = n || (im[8] ? 2 : null) || parseInt(im[9] || im[10], 10) || 2;
                text = line.slice(0, im.index).trim();
                notes.push(`“${line}” → that line sung ${times} times`);
            }
            if (!current) startStanza(null);
            const obj = { text, key: normalizeLine(text), source: i + 1, repeated: null };
            current.push(obj);
            for (let k = 1; k < times; k++) current.push({ ...obj, repeated: line });
        }
        if (current && current.length && currentKey) sections[currentKey] = current;

        // "Chorus x2" header with lyrics under it: whole section n times
        const sung = [];
        for (const st of stanzas) {
            sung.push(...st);
            if (st.timesPending) {
                for (let k = 1; k < st.timesPending; k++) sung.push(...copyOf(st, "×" + st.timesPending));
                notes.push(`Section marked ×${st.timesPending} → sung ${st.timesPending} times`);
            }
        }
        return { sung: sung.filter((l) => l.key), notes };
    }

    /** The Excel formula, applied to the sung lines. */
    function score(sungLines) {
        const counts = new Map();
        for (const l of sungLines) counts.set(l.key, (counts.get(l.key) || 0) + 1);
        const unique = counts.size;
        const total = sungLines.length;
        let weight = 0;
        for (const c of counts.values()) weight += c * c;
        return {
            unique,                     // I2  Unique Lines
            total,                      // I3  Total #
            weight,                     // I4  Total weight
            score: unique ? weight / unique : 0, // I5 Total score
            counts,
        };
    }

    function analyze(raw) {
        const { sung, notes } = expandLyrics(raw);
        const result = score(sung);
        result.lines = sung.map((l) => ({ ...l, count: result.counts.get(l.key) }));
        result.notes = notes;
        return result;
    }

    // Excel's fill colors for counts 1–9; everything from 10 up shares the last one.
    const COLORS = ["#00B0F0", "#00B050", "#92D050", "#FFFF00", "#FFC000", "#FF0000", "#C00000", "#7030A0", "#002060", "#000000"];
    const TEXT_ON = ["#000", "#000", "#000", "#000", "#000", "#000", "#fff", "#fff", "#fff", "#fff"];
    function colorFor(count) {
        const i = Math.min(Math.max(count, 1), 10) - 1;
        return { bg: COLORS[i], fg: TEXT_ON[i] };
    }

    return { normalizeLine, expandLyrics, score, analyze, colorFor, COLORS };
});
