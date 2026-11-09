/* Song Repetition Visualizer: page logic. Formula lives in analyzer.js. */
(function () {
    "use strict";
    const S = window.SongRepetition;
    const $ = (id) => document.getElementById(id);

    const store = {
        get(key, fallback) { try { return JSON.parse(localStorage.getItem("srv_" + key)) ?? fallback; } catch { return fallback; } },
        set(key, value) { try { localStorage.setItem("srv_" + key, JSON.stringify(value)); } catch { /* private mode */ } },
    };
    function track(name, params = {}) { if (typeof gtag === "function") gtag("event", name, params); }
    const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });

    // ---- Comparison figures (built by scripts/build-comparison.mjs) ----------
    let comparison = null;
    const comparisonReady = fetch("comparison.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { comparison = j; })
        .catch(() => { comparison = null; });

    // ---- Legend --------------------------------------------------------------
    const legend = $("legend");
    legend.innerHTML = '<span class="legend-label">Times sung:</span>' +
        S.COLORS.map((_, i) => {
            const c = S.colorFor(i + 1);
            return `<span style="background:${c.bg};color:${c.fg}">${i === 9 ? "10+" : i + 1}</span>`;
        }).join("");

    // ---- Analyze -------------------------------------------------------------
    function render(fromUser) {
        const raw = $("lyrics").value;
        const r = S.analyze(raw);
        if (!r.total) { showResults(false); return; }
        showResults(true);
        $("s-score").textContent = fmt(r.score);
        $("s-unique").textContent = r.unique;
        $("s-total").textContent = r.total;

        const song = $("song");
        song.textContent = "";
        for (const l of r.lines) {
            const li = document.createElement("li");
            const c = S.colorFor(l.count);
            li.style.background = c.bg;
            li.style.color = c.fg;
            if (l.repeated) { li.className = "added"; li.title = "Added by: " + l.repeated; }
            const t = document.createElement("span");
            t.className = "song-text";
            t.textContent = l.text;
            const n = document.createElement("span");
            n.className = "song-count";
            n.textContent = "×" + l.count;
            n.setAttribute("aria-label", `sung ${l.count} time${l.count === 1 ? "" : "s"}`);
            li.append(t, n);
            song.append(li);
        }

        const notes = $("notes");
        notes.textContent = "";
        r.notes.forEach((t) => { const li = document.createElement("li"); li.textContent = t; notes.append(li); });
        $("notes-wrap").hidden = !r.notes.length;

        comparisonReady.then(() => renderCompare(r.score));
        if (fromUser) {
            // Narrow screens stack the stats under the input: bring them into view
            if (matchMedia("(max-width: 760px)").matches) $("stats").scrollIntoView({ behavior: "smooth", block: "start" });
            // Only coarse numbers go to analytics, never the lyrics
            track("song_analyzed", { lines_sung: r.total, score_band: r.score < 2 ? "1-2" : r.score < 5 ? "2-5" : r.score < 10 ? "5-10" : "10+", directions: r.notes.length });
        }
    }

    function showResults(on) {
        $("workspace").classList.toggle("has-results", on);
        $("stats").hidden = !on;
        $("results").hidden = !on;
    }

    function renderCompare(songScore) {
        const rows = [{ name: "This song", value: songScore, color: "var(--bar-song)" }];
        const note = [];
        if (comparison && comparison.psalms && comparison.psalms.n) {
            rows.push({ name: "Psalms", value: comparison.psalms.mean, color: "var(--bar-ps)" });
            note.push(`${comparison.psalms.n} psalms (ESV)`);
        }
        if (comparison && comparison.hymns && comparison.hymns.n) {
            rows.push({ name: "Hymns", value: comparison.hymns.mean, color: "var(--bar-hy)" });
            note.push(`${comparison.hymns.n} hymns`);
        }
        if (rows.length === 1) note.push(navigator.onLine === false ? "You're offline, so the psalm and hymn figures couldn't load." : "Psalm and hymn figures aren't available yet.");
        // Linear scale from 0, so bar heights compare directly
        const max = Math.max(...rows.map((r) => r.value), 1);
        const h = (v) => Math.max(1, (v / max) * 100);
        $("compare").setAttribute("aria-label", rows.map((r) => `${r.name}: ${fmt(r.value)}`).join(", "));
        $("compare").innerHTML = rows.map((r) => `
            <div class="cmp-col">
                <div class="cmp-track" aria-hidden="true">
                    <div class="cmp-bar" style="height:${h(r.value)}%;background:${r.color}"><span class="cmp-val">${fmt(r.value)}</span></div>
                </div>
                <span class="cmp-name">${r.name}</span>
            </div>`).join("");
        $("compare-note").textContent = rows.length > 1 ? "Psalms and hymns are averages: " + note.join(", ") + "." : note.join("");
    }

    $("analyze").addEventListener("click", () => render(true));
    $("clear").addEventListener("click", () => { $("lyrics").value = ""; showResults(false); $("lyrics").focus(); });
    $("lyrics").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) render(true); });

    // ---- Theme ---------------------------------------------------------------
    $("theme").addEventListener("click", () => {
        const dark = document.documentElement.dataset.theme
            ? document.documentElement.dataset.theme === "dark"
            : matchMedia("(prefers-color-scheme: dark)").matches;
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        store.set("theme", next);
    });

    // ---- Install (PWA) -------------------------------------------------------
    let installEvent = null;
    addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e; $("install").hidden = false; });
    $("install").addEventListener("click", async () => {
        if (!installEvent) return;
        installEvent.prompt();
        await installEvent.userChoice;
        installEvent = null;
        $("install").hidden = true;
    });
    addEventListener("appinstalled", () => { $("install").hidden = true; track("app_installed"); });
    if ("serviceWorker" in navigator && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
        navigator.serviceWorker.register("sw.js").catch(() => {});
    }

    // ---- Support callout (same cadence and wording as Let's Sing) ------------
    const SUPPORT_DAY_MS = 20 * 60 * 60 * 1000;
    const supportCallout = $("support-callout");
    const supportLink = $("support");
    function trackSupportUsage() {
        if (store.get("supportDismissedForever", false) || store.get("supportActed", false)) return;
        const visits = store.get("supportVisits", 0) + 1;
        store.set("supportVisits", visits);
        let days = store.get("supportDaysUsed", 0);
        const today = new Date().toISOString().slice(0, 10);
        if (store.get("supportLastDayUsed", "") !== today) {
            days += 1;
            store.set("supportDaysUsed", days);
            store.set("supportLastDayUsed", today);
        }
        if (store.get("supportMaybeLaterCount", 0) >= 5) return;
        const lastShown = store.get("supportLastShown", 0);
        const due = lastShown === 0 ? visits >= 10 || days >= 3 : Date.now() - lastShown >= 24 * SUPPORT_DAY_MS;
        if (due) setTimeout(showSupportCallout, 1500);
    }
    function showSupportCallout() {
        supportCallout.classList.add("open");
        store.set("supportLastShown", Date.now());
        track("support_callout_shown");
        setTimeout(() => document.addEventListener("click", supportOutsideClick), 0);
    }
    function supportOutsideClick(e) {
        if (supportCallout.contains(e.target) || supportLink.contains(e.target)) return;
        supportCallout.classList.remove("open");
        document.removeEventListener("click", supportOutsideClick);
    }
    function supportDismiss(mode) {
        supportCallout.classList.remove("open");
        document.removeEventListener("click", supportOutsideClick);
        if (mode === "forever") store.set("supportDismissedForever", true);
        else if (mode === "later") store.set("supportMaybeLaterCount", store.get("supportMaybeLaterCount", 0) + 1);
        else if (mode === "acted") store.set("supportActed", true);
        if (mode === "forever" || mode === "later") track("support_callout_dismiss", { choice: mode });
    }
    supportLink.addEventListener("click", () => { track("support_click", { source: "heart" }); supportDismiss("acted"); });
    supportCallout.querySelector('[data-support="acted"]').addEventListener("click", () => track("support_click", { source: "callout" }));
    supportCallout.querySelectorAll("[data-support]").forEach((el) => el.addEventListener("click", () => supportDismiss(el.dataset.support)));
    trackSupportUsage();
})();
