const STORAGE_KEY = "navigation-page-data-v3";
const DEFAULTS = {
  version: 2,
  motto: "日拱一卒，静水流深。",
  selectedEngine: "engine1",
  engines: {
    engine1: { name: "Google", searchUrl: "https://www.google.com/search?q={query}", homeUrl: "https://www.google.com/" },
    engine2: { name: "必应中国", searchUrl: "https://cn.bing.com/search?q={query}&ensearch=0", homeUrl: "https://cn.bing.com/" }
  },
  preferences: { newTab: false, backgroundColor: "#9ccfea", backgroundImage: "", overlay: 18 },
  recent: [],
  categories: [{
    id: "common",
    name: "常用",
    sites: [
      { id: "bilibili", name: "哔哩哔哩", url: "https://www.bilibili.com/" },
      { id: "github", name: "GitHub", url: "https://github.com/" },
      { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/" },
      { id: "xiaohongshu", name: "小红书", url: "https://www.xiaohongshu.com/" },
      { id: "gemini", name: "Gemini", url: "https://gemini.google.com/" },
      { id: "x", name: "X", url: "https://x.com/" }
    ]
  }]
};

let state = loadState();
let editorMode = null;
let editing = null;
let returnToManager = false;
let siteDrag = null;
const collapsedCategories = new Set();
let toastTimer;

const $ = selector => document.querySelector(selector);
const els = {
  background: $(".background"), searchForm: $("#searchForm"), searchInput: $("#searchInput"),
  engineSwitch: $("#engineSwitch"), categoryList: $("#categoryList"), recentList: $("#recentList"),
  settingsPanel: $("#settingsPanel"), backdrop: $("#backdrop"), managerDialog: $("#managerDialog"),
  managerList: $("#managerList"), editorDialog: $("#editorDialog"), editorForm: $("#editorForm"),
  dialogFields: $("#dialogFields"), dialogTitle: $("#dialogTitle"), toast: $("#toast")
};

function cloneDefaults() { return JSON.parse(JSON.stringify(DEFAULTS)); }
function makeId(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.version !== 2 || !Array.isArray(saved.categories)) return cloneDefaults();
    const fresh = cloneDefaults();
    return {
      ...fresh, ...saved,
      engines: { ...fresh.engines, ...saved.engines },
      preferences: { ...fresh.preferences, ...saved.preferences },
      recent: Array.isArray(saved.recent) ? saved.recent : []
    };
  } catch { return cloneDefaults(); }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { showToast("保存失败，背景图片可能过大"); }
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("请输入网址");
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(candidate);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("网址仅支持 HTTP 或 HTTPS");
  return parsed.href;
}

function validateEngineUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed.includes("{query}")) throw new Error("搜索网址需要包含 {query}");
  const probe = new URL(trimmed.replace("{query}", "test"));
  if (probe.protocol !== "https:") throw new Error("搜索网址需要使用 HTTPS");
  return trimmed;
}

function engineHome(searchUrl) { return `${new URL(searchUrl.replace("{query}", "")).origin}/`; }
function faviconUrl(url) {
  try { return new URL("/favicon.ico", new URL(url).origin).href; }
  catch { return ""; }
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function iconMarkup(item, className = "site-icon") {
  const src = faviconUrl(item.url || item.homeUrl || item.searchUrl);
  const initial = escapeHtml(String(item.name || "?").slice(0, 1).toUpperCase());
  return `<span class="${className}">${src ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback="${initial}">` : initial}</span>`;
}

function render() {
  $("#mottoText").textContent = state.motto;
  applyAppearance();
  renderEngines();
  renderCategories();
  renderRecent();
  syncSettings();
}

function renderEngines() {
  els.engineSwitch.innerHTML = ["engine1", "engine2"].map(key => {
    const engine = state.engines[key];
    const src = faviconUrl(engine.homeUrl || engine.searchUrl);
    const fallback = escapeHtml(engine.name.slice(0, 1).toUpperCase());
    return `<button class="engine ${state.selectedEngine === key ? "active" : ""}" type="button" data-engine="${key}" aria-label="使用${escapeHtml(engine.name)}搜索" title="${escapeHtml(engine.name)}">
      ${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(engine.name)}" data-fallback="${fallback}">` : `<span class="engine-fallback">${fallback}</span>`}
    </button>`;
  }).join("");
}

function applyAppearance() {
  document.documentElement.style.setProperty("--bg", state.preferences.backgroundColor);
  document.documentElement.style.setProperty("--overlay", String(state.preferences.overlay / 100));
  els.background.style.backgroundImage = state.preferences.backgroundImage
    ? `url("${state.preferences.backgroundImage}")`
    : "radial-gradient(circle at 12% 4%, rgba(255,255,255,.78), transparent 34%), radial-gradient(circle at 88% 8%, rgba(255,255,255,.38), transparent 28%), linear-gradient(155deg, rgba(255,255,255,.16), rgba(101,143,166,.08))";
}

function renderCategories() {
  if (!state.categories.length) {
    els.categoryList.innerHTML = '<div class="recent-empty">还没有网站，点击“网站管理”开始添加</div>';
    return;
  }
  els.categoryList.innerHTML = state.categories.map(category => `
    <article class="category">
      <div class="category-name">${escapeHtml(category.name)}</div>
      <div class="site-grid">
        ${category.sites.length ? category.sites.map(site => `
          <a class="site-card" href="${escapeHtml(site.url)}" data-site-link data-category-id="${escapeHtml(category.id)}" data-site-id="${escapeHtml(site.id)}" title="${escapeHtml(site.name)}">
            ${iconMarkup(site)}<span>${escapeHtml(site.name)}</span>
          </a>`).join("") : '<div class="empty-category">暂无网站</div>'}
      </div>
    </article>`).join("");
}

function renderRecent() {
  if (!state.recent.length) {
    els.recentList.innerHTML = '<div class="recent-empty">暂无记录</div>';
    return;
  }
  els.recentList.innerHTML = state.recent.slice(0, 8).map(site => `
    <a class="recent-item" href="${escapeHtml(site.url)}" data-recent-link data-site-id="${escapeHtml(site.id)}">
      ${iconMarkup(site)}<span>${escapeHtml(site.name)}</span>
    </a>`).join("");
}

function syncSettings() {
  $("#mottoInput").value = state.motto;
  ["engine1", "engine2"].forEach(key => {
    const number = key.slice(-1);
    $(`#${key}Name`).value = state.engines[key].name;
    $(`#${key}Url`).value = state.engines[key].searchUrl;
    $(`#${key}Preview`).src = faviconUrl(state.engines[key].homeUrl || state.engines[key].searchUrl);
    $(`#${key}Preview`).alt = `${state.engines[key].name} logo`;
    $(`#${key}Preview`).dataset.fallback = state.engines[key].name.slice(0, 1).toUpperCase();
    $(`#${key}Preview`).style.visibility = "visible";
  });
  $("#backgroundColor").value = state.preferences.backgroundColor;
  $("#overlayRange").value = state.preferences.overlay;
  $("#overlayValue").textContent = `${state.preferences.overlay}%`;
  $("#newTabToggle").checked = state.preferences.newTab;
}

function navigate(url, newTab = false) {
  if (newTab) window.open(url, "_blank", "noopener,noreferrer");
  else window.location.assign(url);
}

function search(engineKey = state.selectedEngine) {
  const query = els.searchInput.value.trim();
  const engine = state.engines[engineKey];
  const destination = query ? engine.searchUrl.replace("{query}", encodeURIComponent(query)) : engine.homeUrl;
  navigate(destination, false);
}

function recordRecent(site) {
  state.recent = [site, ...state.recent.filter(item => item.url !== site.url)].slice(0, 8);
  saveState();
}

function openSettings() {
  syncSettings();
  els.backdrop.hidden = false;
  els.settingsPanel.classList.add("open");
  els.settingsPanel.setAttribute("aria-hidden", "false");
  setTimeout(() => $("#engine1Name").focus(), 100);
}

function closeSettings() {
  els.settingsPanel.classList.remove("open");
  els.settingsPanel.setAttribute("aria-hidden", "true");
  setTimeout(() => { els.backdrop.hidden = true; $("#settingsButton").focus(); }, 280);
}

function renderManager() {
  if (!state.categories.length) {
    els.managerList.innerHTML = '<div class="recent-empty">还没有分类</div>';
    return;
  }
  els.managerList.innerHTML = state.categories.map((category, categoryIndex) => {
    const collapsed = collapsedCategories.has(category.id);
    return `
      <section class="manager-category" data-category-id="${escapeHtml(category.id)}">
        <div class="manager-category-head">
          <strong>${escapeHtml(category.name)}</strong>
          <div class="manager-actions">
            <button class="manager-action category-toggle" type="button" data-action="category-toggle" aria-expanded="${!collapsed}" aria-label="${collapsed ? "展开" : "收起"}${escapeHtml(category.name)}" title="${collapsed ? "展开分类" : "收起分类"}">${collapsed ? "▸" : "▾"}</button>
            <button class="manager-action" type="button" data-action="category-up" title="分类上移" ${categoryIndex === 0 ? "disabled" : ""}>↑</button>
            <button class="manager-action" type="button" data-action="category-down" title="分类下移" ${categoryIndex === state.categories.length - 1 ? "disabled" : ""}>↓</button>
            <button class="manager-action" type="button" data-action="category-edit">重命名</button>
            <button class="manager-action" type="button" data-action="site-add">添加</button>
            <button class="manager-action danger" type="button" data-action="category-delete">删除</button>
          </div>
        </div>
        <div class="manager-sites" ${collapsed ? "hidden" : ""}>
          ${category.sites.length ? category.sites.map(site => `
            <div class="manager-site" data-site-id="${escapeHtml(site.id)}">
              <button class="site-drag-handle" type="button" data-drag-handle aria-label="按住拖动${escapeHtml(site.name)}排序" title="按住拖动排序">⋮⋮</button>
              <div class="manager-site-name">${iconMarkup(site)}<span>${escapeHtml(site.name)}</span></div>
              <div class="manager-actions">
                <button class="manager-action" type="button" data-action="site-edit">编辑</button>
                <button class="manager-action danger" type="button" data-action="site-delete">删除</button>
              </div>
            </div>`).join("") : '<div class="manager-empty">暂无网站</div>'}
        </div>
      </section>`;
  }).join("");
}

function openManager() { renderManager(); els.managerDialog.showModal(); }

function openEditor(mode, data = {}) {
  editorMode = mode;
  editing = data;
  returnToManager = els.managerDialog.open;
  if (returnToManager) els.managerDialog.close();
  if (mode === "add-category" || mode === "edit-category") {
    els.dialogTitle.textContent = mode === "add-category" ? "添加分类" : "分类改名";
    els.dialogFields.innerHTML = `<label>分类名称<input name="name" maxlength="20" required value="${escapeHtml(data.name || "")}" placeholder="例如：工作学习"></label>`;
  } else {
    els.dialogTitle.textContent = mode === "add-site" ? "添加网站" : "编辑网站";
    const selectedCategory = data.categoryId || state.categories[0]?.id || "";
    els.dialogFields.innerHTML = `
      <label>网站名称<input name="name" maxlength="30" required value="${escapeHtml(data.name || "")}" placeholder="例如：GitHub"></label>
      <label>网站地址<input name="url" inputmode="url" required value="${escapeHtml(data.url || "")}" placeholder="https://example.com"></label>
      <label>所属分类<select name="categoryId" required>${state.categories.map(category => `<option value="${escapeHtml(category.id)}" ${category.id === selectedCategory ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}</select></label>`;
  }
  els.editorDialog.showModal();
  els.dialogFields.querySelector("input")?.focus();
}

function closeEditor(reopen = true) {
  els.editorDialog.close();
  if (reopen && returnToManager) setTimeout(openManager, 20);
  returnToManager = false;
}

function submitEditor(event) {
  event.preventDefault();
  const form = new FormData(els.editorForm);
  const name = String(form.get("name") || "").trim();
  if (!name) return;
  if (editorMode.includes("category")) {
    if (editorMode === "add-category") state.categories.push({ id: makeId("category"), name, sites: [] });
    else state.categories.find(item => item.id === editing.id).name = name;
  } else {
    let url;
    try { url = normalizeUrl(form.get("url")); } catch (error) { showToast(error.message); return; }
    const categoryId = String(form.get("categoryId"));
    if (editorMode === "add-site") {
      state.categories.find(item => item.id === categoryId)?.sites.push({ id: makeId("site"), name, url });
    } else {
      const originalCategory = state.categories.find(item => item.id === editing.categoryId);
      const index = originalCategory.sites.findIndex(item => item.id === editing.id);
      const updated = { ...originalCategory.sites[index], name, url };
      originalCategory.sites.splice(index, 1);
      state.categories.find(item => item.id === categoryId)?.sites.push(updated);
    }
  }
  saveState(); render(); closeEditor(true); showToast("已保存");
}

function handleManagerAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  const categoryElement = button.closest("[data-category-id]");
  const categoryId = categoryElement?.dataset.categoryId;
  const categoryIndex = state.categories.findIndex(item => item.id === categoryId);
  const category = state.categories[categoryIndex];
  const siteElement = button.closest("[data-site-id]");
  const siteId = siteElement?.dataset.siteId;
  const siteIndex = category?.sites.findIndex(item => item.id === siteId) ?? -1;

  if (action === "category-toggle") {
    if (collapsedCategories.has(categoryId)) collapsedCategories.delete(categoryId);
    else collapsedCategories.add(categoryId);
    renderManager();
    return;
  }
  if (action === "category-up" && categoryIndex > 0) [state.categories[categoryIndex - 1], state.categories[categoryIndex]] = [state.categories[categoryIndex], state.categories[categoryIndex - 1]];
  if (action === "category-down" && categoryIndex < state.categories.length - 1) [state.categories[categoryIndex + 1], state.categories[categoryIndex]] = [state.categories[categoryIndex], state.categories[categoryIndex + 1]];
  if (action === "category-edit") return openEditor("edit-category", category);
  if (action === "site-add") return openEditor("add-site", { categoryId });
  if (action === "site-edit") return openEditor("edit-site", { ...category.sites[siteIndex], categoryId });
  if (action === "category-delete") {
    const message = category.sites.length ? `分类内有 ${category.sites.length} 个网站，确认一并删除吗？` : "确认删除这个分类吗？";
    if (!confirm(message)) return;
    state.categories.splice(categoryIndex, 1);
  }
  if (action === "site-delete") {
    if (!confirm(`确认删除“${category.sites[siteIndex].name}”吗？`)) return;
    category.sites.splice(siteIndex, 1);
  }
  saveState(); render(); renderManager();
}

function beginSiteDrag(event) {
  const handle = event.target.closest("[data-drag-handle]");
  if (!handle) return;
  const row = handle.closest(".manager-site");
  const list = row?.closest(".manager-sites");
  const categoryId = row?.closest("[data-category-id]")?.dataset.categoryId;
  if (!row || !list || !categoryId) return;
  event.preventDefault();
  siteDrag = { pointerId: event.pointerId, handle, row, list, categoryId };
  handle.setPointerCapture?.(event.pointerId);
  row.classList.add("dragging");
  list.classList.add("drag-active");
  document.body.classList.add("dragging-sites");
}

function moveSiteDrag(event) {
  if (!siteDrag || event.pointerId !== siteDrag.pointerId) return;
  event.preventDefault();
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".manager-site");
  if (!target || target === siteDrag.row || target.parentElement !== siteDrag.list) return;
  const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
  siteDrag.list.insertBefore(siteDrag.row, after ? target.nextSibling : target);
}

function finishSiteDrag(event, commit = true) {
  if (!siteDrag || event.pointerId !== siteDrag.pointerId) return;
  if (siteDrag.handle.hasPointerCapture?.(event.pointerId)) siteDrag.handle.releasePointerCapture(event.pointerId);
  document.body.classList.remove("dragging-sites");
  if (commit) {
    const category = state.categories.find(item => item.id === siteDrag.categoryId);
    const sitesById = new Map(category.sites.map(site => [site.id, site]));
    const order = [...siteDrag.list.querySelectorAll(".manager-site")].map(row => row.dataset.siteId);
    category.sites = order.map(id => sitesById.get(id)).filter(Boolean);
    saveState(); renderCategories();
  }
  siteDrag = null;
  renderManager();
}

function keyboardSortSite(event) {
  const handle = event.target.closest("[data-drag-handle]");
  if (!handle || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const row = handle.closest(".manager-site");
  const categoryId = row.closest("[data-category-id]").dataset.categoryId;
  const category = state.categories.find(item => item.id === categoryId);
  const index = category.sites.findIndex(item => item.id === row.dataset.siteId);
  const next = event.key === "ArrowUp" ? index - 1 : index + 1;
  if (next < 0 || next >= category.sites.length) return;
  [category.sites[index], category.sites[next]] = [category.sites[next], category.sites[index]];
  saveState(); renderCategories(); renderManager();
  const moved = els.managerList.querySelector(`[data-site-id="${CSS.escape(row.dataset.siteId)}"] [data-drag-handle]`);
  moved?.focus();
}

const COUNTRY_NAMES = {
  HK: "Hong Kong", CN: "China", MO: "Macao", TW: "Taiwan", US: "United States",
  JP: "Japan", KR: "South Korea", SG: "Singapore", GB: "United Kingdom", DE: "Germany",
  FR: "France", CA: "Canada", AU: "Australia", MY: "Malaysia", TH: "Thailand", VN: "Vietnam",
  IN: "India", RU: "Russia", NL: "Netherlands", IT: "Italy", ES: "Spain"
};

async function lookupNetwork() {
  const providers = [
    { url: "https://ipwho.is/", ip: d => d.ip, country: d => d.country, city: d => d.city },
    { url: "https://speed.cloudflare.com/meta", ip: d => d.clientIp, country: d => COUNTRY_NAMES[d.country] || d.country, city: d => d.city },
    { url: "https://ipinfo.io/json", ip: d => d.ip, country: d => COUNTRY_NAMES[d.country] || d.country, city: d => d.city }
  ];
  for (const p of providers) {
    try {
      const response = await fetch(p.url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const ip = p.ip(data);
      if (!ip) throw new Error();
      $("#locationText").textContent = `${p.country(data) || "未知国家"} · ${p.city(data) || "未知城市"}`;
      $("#ipText").textContent = ip;
      $("#networkStatus").classList.remove("offline");
      return;
    } catch { /* 换下一个接口 */ }
  }
  $("#locationText").textContent = "位置暂不可用";
  $("#ipText").textContent = "获取失败";
  $("#networkStatus").classList.add("offline");
}

async function runSpeedTest() {
  const button = $("#speedButton");
  button.disabled = true; button.textContent = "测速中…"; $("#speedText").textContent = "正在下载 3 MB";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const bytes = 3_000_000;
    const start = performance.now();
    const response = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}&cache=${Date.now()}`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error();
    const blob = await response.blob();
    const seconds = (performance.now() - start) / 1000;
    $("#speedText").textContent = `${(blob.size * 8 / seconds / 1_000_000).toFixed(1)} Mbps`;
    button.textContent = "重新测速";
  } catch {
    $("#speedText").textContent = "测速失败";
    button.textContent = "重试测速";
  } finally { clearTimeout(timer); button.disabled = false; }
}

function saveEngines() {
  try {
    ["engine1", "engine2"].forEach(key => {
      const name = $(`#${key}Name`).value.trim();
      if (!name) throw new Error("请输入搜索引擎名称");
      const searchUrl = validateEngineUrl($(`#${key}Url`).value);
      state.engines[key] = { name, searchUrl, homeUrl: engineHome(searchUrl) };
    });
    saveState(); renderEngines(); syncSettings(); showToast("搜索引擎已保存");
  } catch (error) { showToast(error.message); }
}

function resizeBackground(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("请选择图片文件"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("图片无法使用"));
      img.onload = () => {
        const scale = Math.min(1, 1920 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", .82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function setBackgroundFile(file) {
  if (!file) return;
  try {
    state.preferences.backgroundImage = await resizeBackground(file);
    saveState(); applyAppearance(); showToast("背景图片已更新");
  } catch (error) { showToast(error.message); }
}

function exportConfig() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = `导航页配置-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
}

function sanitizeImport(parsed) {
  if (![1, 2].includes(parsed.version) || !Array.isArray(parsed.categories) || !parsed.engines || !parsed.preferences) throw new Error();
  const fresh = cloneDefaults();
  const oldGoogle = parsed.engines.google;
  const oldBing = parsed.engines.bing;
  const rawEngine1 = parsed.engines.engine1 || oldGoogle || fresh.engines.engine1;
  const rawEngine2 = parsed.engines.engine2 || oldBing || fresh.engines.engine2;
  const cleanEngine = (raw, fallback) => {
    const searchUrl = validateEngineUrl(raw.searchUrl || fallback.searchUrl);
    return { name: String(raw.name || fallback.name).slice(0, 20), searchUrl, homeUrl: engineHome(searchUrl) };
  };
  const categories = parsed.categories.map(category => ({
    id: String(category.id || makeId("category")),
    name: String(category.name || "未命名分类").slice(0, 20),
    sites: Array.isArray(category.sites) ? category.sites.map(site => ({
      id: String(site.id || makeId("site")), name: String(site.name || "未命名网站").slice(0, 30), url: normalizeUrl(site.url)
    })) : []
  }));
  const backgroundImage = typeof parsed.preferences.backgroundImage === "string" && parsed.preferences.backgroundImage.startsWith("data:image/") ? parsed.preferences.backgroundImage : "";
  return {
    ...fresh,
    motto: String(parsed.motto || fresh.motto).slice(0, 40),
    engines: { engine1: cleanEngine(rawEngine1, fresh.engines.engine1), engine2: cleanEngine(rawEngine2, fresh.engines.engine2) },
    preferences: {
      newTab: Boolean(parsed.preferences.newTab),
      backgroundColor: /^#[0-9a-f]{6}$/i.test(parsed.preferences.backgroundColor) ? parsed.preferences.backgroundColor : fresh.preferences.backgroundColor,
      backgroundImage,
      overlay: Math.max(0, Math.min(70, Number(parsed.preferences.overlay) || 0))
    },
    categories,
    recent: []
  };
}

async function importConfig(file) {
  if (!file) return;
  try { state = sanitizeImport(JSON.parse(await file.text())); saveState(); render(); showToast("配置已导入"); }
  catch { showToast("配置文件无效"); }
}

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  try {
    context.registerTool({
      name: "add_navigation_site", title: "添加导航网站",
      description: "在导航页的指定分类中添加一个网站，并立即更新页面。",
      inputSchema: { type: "object", properties: { name: { type: "string" }, url: { type: "string" }, categoryName: { type: "string" } }, required: ["name", "url", "categoryName"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const category = state.categories.find(item => item.name === input.categoryName);
        if (!category) throw new Error("未找到指定分类");
        const site = { id: makeId("site"), name: String(input.name).trim(), url: normalizeUrl(input.url) };
        if (!site.name) throw new Error("网站名称不能为空");
        category.sites.push(site); saveState(); render(); if (els.managerDialog.open) renderManager();
        return { added: true, site: { name: site.name, url: site.url }, category: category.name };
      }
    });
  } catch {}
}

function bindEvents() {
  document.addEventListener("error", event => {
    if (!(event.target instanceof HTMLImageElement) || !event.target.dataset.fallback) return;
    if (["engine1Preview", "engine2Preview"].includes(event.target.id)) {
      event.target.style.visibility = "hidden";
      return;
    }
    const fallback = document.createElement("span");
    fallback.className = event.target.closest(".engine") ? "engine-fallback" : "";
    fallback.textContent = event.target.dataset.fallback;
    if (event.target.parentElement?.classList.contains("site-icon")) event.target.parentElement.textContent = event.target.dataset.fallback;
    else event.target.replaceWith(fallback);
  }, true);
  els.searchForm.addEventListener("submit", event => { event.preventDefault(); search(); });
  els.engineSwitch.addEventListener("click", event => {
    const button = event.target.closest("[data-engine]");
    if (!button) return;
    state.selectedEngine = button.dataset.engine; saveState(); renderEngines(); search(button.dataset.engine);
  });
  $("#settingsButton").addEventListener("click", openSettings);
  $("#closeSettings").addEventListener("click", closeSettings);
  els.backdrop.addEventListener("click", closeSettings);
  document.addEventListener("keydown", event => { if (event.key === "Escape" && els.settingsPanel.classList.contains("open")) closeSettings(); });
  $("#manageButton").addEventListener("click", openManager);
  $("#managerClose").addEventListener("click", () => els.managerDialog.close());
  $("#managerAddCategory").addEventListener("click", () => openEditor("add-category"));
  els.managerList.addEventListener("click", handleManagerAction);
  els.managerList.addEventListener("pointerdown", beginSiteDrag);
  els.managerList.addEventListener("pointermove", moveSiteDrag);
  els.managerList.addEventListener("pointerup", event => finishSiteDrag(event, true));
  els.managerList.addEventListener("pointercancel", event => finishSiteDrag(event, false));
  els.managerList.addEventListener("keydown", keyboardSortSite);
  els.editorForm.addEventListener("submit", submitEditor);
  $("#dialogClose").addEventListener("click", () => closeEditor(true));
  $("#dialogCancel").addEventListener("click", () => closeEditor(true));
  els.categoryList.addEventListener("click", event => {
    const link = event.target.closest("[data-site-link]");
    if (!link) return;
    event.preventDefault();
    const category = state.categories.find(item => item.id === link.dataset.categoryId);
    const site = category.sites.find(item => item.id === link.dataset.siteId);
    recordRecent(site); navigate(site.url, state.preferences.newTab);
    if (state.preferences.newTab) renderRecent();
  });
  els.recentList.addEventListener("click", event => {
    const link = event.target.closest("[data-recent-link]");
    if (!link) return;
    event.preventDefault();
    const site = state.recent.find(item => item.id === link.dataset.siteId);
    recordRecent(site); navigate(site.url, state.preferences.newTab);
    if (state.preferences.newTab) renderRecent();
  });
  $("#clearRecent").addEventListener("click", () => { state.recent = []; saveState(); renderRecent(); showToast("最近访问已清空"); });
  $("#speedButton").addEventListener("click", runSpeedTest);
  $("#saveEnginesButton").addEventListener("click", saveEngines);
  $("#saveMottoButton").addEventListener("click", () => {
    const motto = $("#mottoInput").value.trim();
    if (!motto) return showToast("请输入首页文字");
    state.motto = motto; saveState(); render(); showToast("首页文字已保存");
  });
  ["engine1", "engine2"].forEach(key => {
    $(`#${key}Url`).addEventListener("input", event => {
      const preview = $(`#${key}Preview`);
      const src = faviconUrl(event.target.value.replace("{query}", ""));
      preview.src = src;
      preview.style.visibility = src ? "visible" : "hidden";
    });
  });
  document.querySelectorAll(".preset").forEach(button => button.addEventListener("click", () => {
    state.preferences.backgroundColor = button.dataset.color; state.preferences.backgroundImage = ""; saveState(); render();
  }));
  $("#backgroundColor").addEventListener("input", event => { state.preferences.backgroundColor = event.target.value; state.preferences.backgroundImage = ""; saveState(); applyAppearance(); });
  $("#backgroundFile").addEventListener("change", event => setBackgroundFile(event.target.files[0]));
  $("#overlayRange").addEventListener("input", event => {
    state.preferences.overlay = Number(event.target.value); $("#overlayValue").textContent = `${state.preferences.overlay}%`; saveState(); applyAppearance();
  });
  $("#removeBackgroundImage").addEventListener("click", () => { state.preferences.backgroundImage = ""; saveState(); applyAppearance(); showToast("已移除背景图片"); });
  $("#newTabToggle").addEventListener("change", event => { state.preferences.newTab = event.target.checked; saveState(); });
  $("#exportButton").addEventListener("click", exportConfig);
  $("#importFile").addEventListener("change", event => importConfig(event.target.files[0]));
  $("#resetButton").addEventListener("click", () => {
    if (!confirm("确认恢复默认设置吗？自定义分类和网址也会被清除。")) return;
    state = cloneDefaults(); saveState(); render(); showToast("已恢复默认设置");
  });
}

bindEvents(); render(); lookupNetwork(); registerWebMcp();
