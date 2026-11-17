/* 웹 슬라이드 엔진
 * 넘기기: → ↓ Space PageDown Enter (리모컨 포함) / 뒤로: ← ↑ PageUp Backspace / 처음·끝: Home End
 * p: 발표자 화면(경과 시간·계획 시간·말할 것)   t: 타이머 다시 시작   b: 화면 가리기   f: 전체 화면
 * 슬라이드 속성: data-start="2:30" (계획 시작 시각), data-title, data-notes, data-auto="1200" (단계 자동 진행 ms)
 */
(function () {
  const stage = document.querySelector(".stage");
  const slides = Array.from(document.querySelectorAll("section.slide"));
  const bar = document.createElement("div");
  bar.className = "progress";
  document.body.appendChild(bar);
  const black = document.createElement("div");
  black.className = "blackout";
  document.body.appendChild(black);
  const pres = document.createElement("div");
  pres.className = "presenter";
  pres.innerHTML = '<div class="clock">0:00</div><div class="meta"></div><div class="notes"></div>';
  document.body.appendChild(pres);

  let cur = 0, t0 = null, autoTimer = null;

  const sec = s => { if (!s) return null; const [m, x] = s.split(":").map(Number); return m * 60 + x; };
  const mmss = s => `${s < 0 ? "-" : ""}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, "0")}`;
  const steps = el => Array.from(el.querySelectorAll(".step"));

  function fit() {
    const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${k})`;
  }

  function show(i, fromBack) {
    clearInterval(autoTimer);
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, j) => s.classList.toggle("active", j === cur));
    const s = slides[cur];
    steps(s).forEach(x => x.classList.toggle("shown", !!fromBack));
    if (!fromBack && s.dataset.auto) {
      autoTimer = setInterval(() => { if (!advanceStep()) clearInterval(autoTimer); }, Number(s.dataset.auto));
    }
    if (location.hash !== `#${cur}`) history.replaceState(null, "", `#${cur}`);
    bar.style.width = `${(cur / (slides.length - 1)) * 100}%`;
    if (cur > 0 && t0 === null) t0 = Date.now();
    document.dispatchEvent(new CustomEvent("slide", { detail: { index: cur, el: s } }));
    tick();
  }

  function advanceStep() {
    const next = steps(slides[cur]).find(x => !x.classList.contains("shown"));
    if (next) { next.classList.add("shown"); return true; }
    return false;
  }
  function next() { if (!advanceStep()) show(cur + 1); }
  function prev() {
    const shown = steps(slides[cur]).filter(x => x.classList.contains("shown"));
    if (shown.length) shown[shown.length - 1].classList.remove("shown");
    else show(cur - 1, true);
  }

  function tick() {
    const s = slides[cur];
    const el = t0 === null ? 0 : Math.round((Date.now() - t0) / 1000);
    const plan = sec(s.dataset.start);
    const nextPlan = slides[cur + 1] ? sec(slides[cur + 1].dataset.start) : sec("13:00");
    const clock = pres.querySelector(".clock");
    clock.textContent = mmss(el);
    clock.className = "clock";
    if (plan !== null && t0 !== null) {
      const late = el - (nextPlan ?? plan);
      clock.classList.add(late > 30 ? "over" : late > 0 ? "late" : "ahead");
    }
    const nx = slides[cur + 1];
    pres.querySelector(".meta").innerHTML =
      `<b>${cur} / ${slides.length - 1}</b> ${s.dataset.title || ""}<br>계획 ${s.dataset.start || "-"} ~ ${nextPlan !== null ? mmss(nextPlan) : "-"}` +
      (nx ? `<br>다음: ${nx.dataset.title || cur + 1}` : "");
    pres.querySelector(".notes").textContent = s.dataset.notes || "";
  }
  setInterval(tick, 500);

  document.addEventListener("keydown", e => {
    if (e.target.closest("input, textarea, select, dialog")) return;
    const k = e.key;
    if (["ArrowRight", "ArrowDown", " ", "PageDown", "Enter"].includes(k)) { e.preventDefault(); next(); }
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(k)) { e.preventDefault(); prev(); }
    else if (k === "Home") show(0);
    else if (k === "End") show(slides.length - 1);
    else if (k === "p") pres.classList.toggle("on");
    else if (k === "t") { t0 = Date.now(); tick(); }
    else if (k === "b" || k === ".") black.classList.toggle("on");
    else if (k === "f") { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (_) {} }
  });
  stage.addEventListener("click", e => { if (!e.target.closest("button, a, input, .no-advance")) next(); });

  // 슬라이드 번호 자동 표시
  slides.forEach((s, i) => { if (i > 0) { const n = document.createElement("div"); n.className = "slide-no"; n.textContent = i; s.appendChild(n); } });

  window.addEventListener("resize", fit);
  fit();
  show(Number(location.hash.slice(1)) || 0);
  window.Deck = { show, next, prev, get index() { return cur; } };
})();

/* 1분 타이머: <div class="timer" data-seconds="60">1:00</div> 를 클릭하거나 s 키 */
(function () {
  function run(el) {
    if (el._t) { clearInterval(el._t); el._t = null; }
    let left = Number(el.dataset.seconds || 60);
    const draw = () => { el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`; };
    draw();
    el._t = setInterval(() => { left -= 1; draw(); if (left <= 0) { clearInterval(el._t); el._t = null; el.classList.add("done"); } }, 1000);
  }
  document.addEventListener("click", e => { const t = e.target.closest(".timer"); if (t) { e.stopPropagation(); run(t); } });
  document.addEventListener("keydown", e => {
    if (e.key !== "s" || e.target.closest("input, textarea, dialog")) return;
    const t = document.querySelector("section.slide.active .timer");
    if (t) run(t);
  });
})();
