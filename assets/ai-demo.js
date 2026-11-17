/* AI 시연: 같은 자료(정리 전 / 정리 후)에 같은 질문을 던져 답과 근거 파일을 나란히 보여 준다.
 * 기본은 '리허설 기록'(recorded.json). 인터넷과 키가 있으면 '지금 실행'으로 실시간 호출.
 * 키는 코드에 넣지 않는다. 발표 노트북에서 k 키 → 설정 창에 입력하면 그 브라우저에만 저장된다.
 */
window.AIDemo = (function () {
  const LS = "axslides.ai";
  // protocol: "anthropic" = Claude Messages 규격(/v1/messages), "openai" = OpenAI 호환(/v1/chat/completions)
  const DEFAULTS = { protocol: "anthropic", base: "https://copa.codyssey.kr", key: "", model: "claude-haiku-4", temperature: "0", maxTokens: 300, timeout: 8 };
  const SYSTEM =
    "당신은 (주)다온오피스의 업무 비서입니다. 아래 회사 자료만 보고 질문에 답하세요. " +
    "반드시 두 줄로만 답하세요.\n답: (한 문장)\n근거: (근거로 삼은 파일 이름 하나)\n" +
    "자료에서 찾을 수 없으면 '답: 자료에서 찾을 수 없음'이라고 쓰세요.";

  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS) || "{}")); } catch (_) { return Object.assign({}, DEFAULTS); }
  }
  function save(cfg) { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (_) {} }

  function corpusText(docs) {
    return docs.map(d => `### 파일: ${d.name}\n${d.text}`).join("\n\n");
  }

  function parse(text) {
    const a = (text.match(/답\s*[:：]\s*(.+)/) || [])[1] || text.trim().split("\n")[0];
    const s = (text.match(/근거\s*[:：]\s*(.+)/) || [])[1] || "";
    return { answer: a.trim(), source: s.replace(/[\[\]`*]/g, "").trim() };
  }

  async function ask(docs, question, cfg, timeoutSec) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), (timeoutSec || cfg.timeout) * 1000);
    const user = `${corpusText(docs)}\n\n질문: ${question}`;
    const root = String(cfg.base || "").replace(/\/+$/, "").replace(/\/v1$/, "");
    const anthropic = (cfg.protocol || "anthropic") === "anthropic";
    let url, headers, body;
    if (anthropic) {
      url = root + "/v1/messages";
      headers = { "content-type": "application/json", "x-api-key": cfg.key, "anthropic-version": "2023-06-01" };
      body = { model: cfg.model, max_tokens: Number(cfg.maxTokens) || 300, system: SYSTEM, messages: [{ role: "user", content: user }] };
    } else {
      url = root + "/v1/chat/completions";
      headers = { "content-type": "application/json", authorization: `Bearer ${cfg.key}` };
      body = { model: cfg.model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] };
    }
    if (cfg.temperature !== "" && cfg.temperature != null) body.temperature = Number(cfg.temperature);
    const t = performance.now();
    try {
      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
      const j = await r.json();
      const text = anthropic
        ? (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n")
        : j.choices?.[0]?.message?.content || "";
      return Object.assign(parse(text), { raw: text, ms: Math.round(performance.now() - t) });
    } finally { clearTimeout(timer); }
  }

  async function fetchJSON(url) { const r = await fetch(url, { cache: "no-store" }); return r.json(); }

  /* ---------- 설정 창 (k 키) ---------- */
  function settings() {
    let dlg = document.getElementById("ai-settings");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "ai-settings";
      dlg.style.cssText = "font-family:var(--font);font-size:18px;padding:24px;border-radius:14px;border:1px solid #ccc;min-width:520px";
      dlg.innerHTML = `
        <h3 style="font-size:22px;margin:0 0 12px">AI 연결 설정 (이 브라우저에만 저장)</h3>
        <label>방식 <select name="protocol" style="width:100%"><option value="anthropic">Claude (Anthropic Messages · /v1/messages)</option><option value="openai">OpenAI 호환 (/v1/chat/completions)</option></select></label><br><br>
        <label>주소 (뒤에 /v1 없이) <input name="base" style="width:100%"></label><br><br>
        <label>키 <input name="key" type="password" style="width:100%" autocomplete="off"></label><br><br>
        <label>모델 (예: claude-haiku-4, claude-sonnet-4) <input name="model" style="width:100%"></label><br><br>
        <label>temperature (비우면 보내지 않음) <input name="temperature" style="width:100%"></label><br><br>
        <label>max_tokens (Claude 필수) <input name="maxTokens" style="width:100%"></label><br><br>
        <label>제한 시간(초) <input name="timeout" style="width:100%"></label><br><br>
        <button data-act="test">연결 시험</button> <button data-act="save">저장</button> <button data-act="close">닫기</button>
        <button data-act="forget" style="float:right">키 지우기</button>
        <p class="msg" style="margin-top:12px;color:#555;white-space:pre-line"></p>`;
      document.body.appendChild(dlg);
      dlg.addEventListener("click", async e => {
        const act = e.target.dataset.act;
        if (!act) return;
        const cfg = {};
        dlg.querySelectorAll("input, select").forEach(i => (cfg[i.name] = i.value.trim()));
        cfg.timeout = Number(cfg.timeout) || 8;
        const msg = dlg.querySelector(".msg");
        if (act === "save") { save(cfg); msg.textContent = "저장했습니다."; }
        if (act === "close") dlg.close();
        if (act === "forget") { save(Object.assign(cfg, { key: "" })); dlg.querySelector("[name=key]").value = ""; msg.textContent = "키를 지웠습니다."; }
        if (act === "test") {
          msg.textContent = "시험 중…";
          try {
            const r = await ask([{ name: "시험.txt", text: "오늘 점심은 김치찌개로 정했다." }], "오늘 점심 메뉴는?", cfg, 20);
            msg.textContent = `연결됨 · ${r.ms}ms\n${r.raw}`;
          } catch (err) {
            msg.textContent = `실패: ${err.message}\n'Failed to fetch'라면 브라우저에서 직접 호출이 막힌 것(CORS)일 수 있습니다.`;
          }
        }
      });
    }
    const cfg = load();
    dlg.querySelectorAll("input, select").forEach(i => (i.value = cfg[i.name] ?? ""));
    dlg.querySelector(".msg").textContent = "";
    dlg.showModal();
  }
  document.addEventListener("keydown", e => { if (e.key === "k" && !e.target.closest("input, select, dialog")) settings(); });

  /* ---------- 슬라이드 안 시연 ---------- */
  function mount(root) {
    const corpusUrl = root.dataset.corpus, recUrl = root.dataset.recorded;
    const question = root.dataset.question;
    const panels = { before: root.querySelector("[data-side=before]"), after: root.querySelector("[data-side=after]") };
    let corpus = null, rec = null;

    function paint(side, r, badge, cls) {
      const p = panels[side];
      p.querySelector(".ans").textContent = r.answer || "—";
      p.querySelector(".src").textContent = r.source ? `근거: ${r.source}` : "";
      const b = p.querySelector(".badge");
      b.textContent = badge;
      b.className = `badge pill ${cls || ""}`;
    }

    function showRecorded(note) {
      if (!rec) return;
      const tag = rec.runs ? `리허설 기록 · ${rec.runs}회 중 정답 ` : "재현 시험 전 (예시 화면)";
      paint("before", rec.before, rec.runs ? tag + `${rec.before.correct}회` : tag, rec.before.correct > rec.runs / 2 ? "ok" : "warn");
      paint("after", rec.after, rec.runs ? tag + `${rec.after.correct}회` : tag, rec.after.correct > rec.runs / 2 ? "ok" : "warn");
      root.querySelector(".status").textContent = note || (rec.model ? `모델 ${rec.model} · ${rec.recorded_at}` : "");
    }

    async function live() {
      const cfg = load();
      const status = root.querySelector(".status");
      if (!cfg.key) { status.textContent = "키가 없어 리허설 기록을 보여 드립니다 (k 키로 설정)"; showRecorded(status.textContent); return; }
      ["before", "after"].forEach(s => paint(s, { answer: "…", source: "" }, "실시간 실행 중", "accent"));
      status.textContent = `실시간 · ${cfg.model}`;
      const jobs = ["before", "after"].map(async side => {
        try {
          const r = await ask(corpus[side], question, cfg);
          paint(side, r, `실시간 · ${(r.ms / 1000).toFixed(1)}초`, "accent");
        } catch (err) {
          const r = rec[side];
          paint(side, r, `리허설 기록 (실시간 응답 ${err.name === "AbortError" ? "지연" : "실패"})`, "");
        }
      });
      await Promise.all(jobs);
    }

    Promise.all([fetchJSON(corpusUrl), fetchJSON(recUrl)]).then(([c, r]) => { corpus = c; rec = r; showRecorded(); });
    root.querySelector("[data-act=recorded]").addEventListener("click", e => { e.stopPropagation(); showRecorded(); });
    root.querySelector("[data-act=live]").addEventListener("click", e => { e.stopPropagation(); live(); });
    document.addEventListener("keydown", e => {
      if (e.key === "r" && root.closest("section.slide.active") && !e.target.closest("input, dialog")) live();
    });
  }
  document.querySelectorAll(".ai-demo").forEach(mount);

  return { ask, load, save, settings, parse, fetchJSON };
})();
