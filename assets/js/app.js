import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.APP_CONFIG || {};
const PAGE_SIZE = Math.max(4, Number(cfg.pageSize) || 12);

const els = {
  gallery: document.getElementById("gallery"),
  status: document.getElementById("status-line"),
  search: document.getElementById("tag-search"),
  typeFilter: document.getElementById("type-filter"),
  sortFilter: document.getElementById("sort-filter"),
  sentinel: document.getElementById("sentinel"),
  ageGate: document.getElementById("age-gate"),
  modal: document.getElementById("modal"),
  formAdd: document.getElementById("form-add"),
  emptyState: document.getElementById("empty-state"),
  preview: document.getElementById("preview"),
  previewBody: document.getElementById("preview-body")
};

let supabase = null;
let offset = 0;
let loaded = [];
let exhausted = false;
let loading = false;

const likeStore = new Set(JSON.parse(localStorage.getItem("liked_media_ids") || "[]"));

function initTheme() {
  const saved = localStorage.getItem("theme");
  document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("theme", next);
}

function initAgeGate() {
  const ok = sessionStorage.getItem("age_ok") === "1";
  if (!els.ageGate) return;
  if (ok) {
    els.ageGate.classList.add("hidden");
    els.ageGate.setAttribute("aria-hidden", "true");
    return;
  }
  document.getElementById("age-confirm")?.addEventListener("click", () => {
    sessionStorage.setItem("age_ok", "1");
    els.ageGate.classList.add("hidden");
    els.ageGate.setAttribute("aria-hidden", "true");
  });
  document.getElementById("age-leave")?.addEventListener("click", () => {
    window.location.href = "about:blank";
  });
}

function setStatus(msg) {
  els.status.textContent = msg;
}

function setupSupabase() {
  const url = (cfg.supabaseUrl || "").trim();
  const key = (cfg.supabaseAnonKey || "").trim();
  if (!url || !key) {
    setStatus("Configure assets/js/config.js pour connecter Supabase.");
    render();
    return;
  }
  supabase = createClient(url, key);
  setStatus("Supabase connecté · chargement…");
  resetAndLoad();
}

function resetAndLoad() {
  offset = 0;
  exhausted = false;
  loaded = [];
  els.gallery.innerHTML = "";
  loadNextPage();
}

function normalizeSearch(input) {
  return input
    .split(/\s+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function itemMatches(item, queries, typeFilter) {
  if (typeFilter !== "ALL" && item.type !== typeFilter) return false;
  if (queries.length === 0) return true;
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const cats = Array.isArray(item.category_slugs) ? item.category_slugs : [];
  const pool = [...tags, ...cats].map((v) => String(v).toLowerCase());
  return queries.every((q) => pool.some((t) => t.includes(q) || q.includes(t)));
}

function getFilteredItems() {
  const queries = normalizeSearch(els.search.value);
  const typeFilter = els.typeFilter.value;
  let out = loaded.filter((row) => itemMatches(row, queries, typeFilter));
  const sortBy = els.sortFilter.value;
  if (sortBy === "likes") {
    out = out.slice().sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
  } else if (sortBy === "views") {
    out = out.slice().sort((a, b) => (b.views_count || 0) - (a.views_count || 0));
  } else {
    out = out
      .slice()
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }
  return out;
}

function updateStats(list) {
  document.getElementById("stat-total").textContent = String(list.length);
  document.getElementById("stat-image").textContent = String(list.filter((x) => x.type === "IMAGE").length);
  document.getElementById("stat-video").textContent = String(list.filter((x) => x.type === "VIDEO").length);
  document.getElementById("stat-animation").textContent = String(
    list.filter((x) => x.type === "ANIMATION").length
  );
}

function render() {
  const items = getFilteredItems();
  updateStats(items);
  els.gallery.innerHTML = "";
  items.forEach((item) => els.gallery.appendChild(createCard(item)));
  els.emptyState.classList.toggle("hidden", items.length > 0);
  setStatus(
    `${loaded.length} chargé(s) · ${items.length} affiché(s)${exhausted ? " · fin de liste" : ""}`
  );
}

function persistLikes() {
  localStorage.setItem("liked_media_ids", JSON.stringify([...likeStore]));
}

function toggleLike(item, button) {
  const key = String(item.id);
  if (likeStore.has(key)) {
    likeStore.delete(key);
    item.likes_count = Math.max(0, Number(item.likes_count || 0) - 1);
  } else {
    likeStore.add(key);
    item.likes_count = Number(item.likes_count || 0) + 1;
  }
  persistLikes();
  button.classList.toggle("is-active", likeStore.has(key));
  button.textContent = `♥ ${item.likes_count || 0}`;
  render();
}

function openPreview(item) {
  els.preview.classList.remove("hidden");
  els.previewBody.innerHTML = "";
  const isVideo = item.type === "VIDEO" || item.type === "ANIMATION";
  if (isVideo) {
    const v = document.createElement("video");
    v.controls = true;
    v.autoplay = true;
    v.playsInline = true;
    v.poster = item.poster_url || "";
    const source = document.createElement("source");
    source.src = item.original_url;
    v.appendChild(source);
    els.previewBody.appendChild(v);
  } else {
    const img = document.createElement("img");
    img.src = item.original_url;
    img.alt = "";
    els.previewBody.appendChild(img);
  }
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = "card";

  const media = document.createElement("div");
  media.className = "card__media";
  const skeleton = document.createElement("div");
  skeleton.className = "card__skeleton";
  media.appendChild(skeleton);

  const isVideo = item.type === "VIDEO" || item.type === "ANIMATION";
  const markLoaded = () => media.classList.add("is-loaded");

  if (isVideo) {
    const video = document.createElement("video");
    video.controls = true;
    video.preload = "none";
    video.playsInline = true;
    if (item.poster_url) video.poster = item.poster_url;
    const source = document.createElement("source");
    source.src = item.original_url;
    video.appendChild(source);
    video.addEventListener("loadeddata", markLoaded, { once: true });
    media.appendChild(video);
  } else {
    const img = document.createElement("img");
    img.src = item.original_url;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("load", markLoaded, { once: true });
    media.appendChild(img);
  }

  media.addEventListener("dblclick", () => openPreview(item));

  const meta = document.createElement("div");
  meta.className = "card__meta";
  const tags = document.createElement("div");
  tags.className = "card__tags";
  (item.tags || []).slice(0, 8).forEach((t) => {
    const chip = document.createElement("span");
    chip.className = "tag-pill";
    chip.textContent = t;
    tags.appendChild(chip);
  });

  const actions = document.createElement("div");
  actions.className = "card__actions";

  const counts = document.createElement("span");
  counts.textContent = `vues ${item.views_count || 0}`;

  const like = document.createElement("button");
  like.type = "button";
  like.className = "btn-like";
  like.classList.toggle("is-active", likeStore.has(String(item.id)));
  like.textContent = `♥ ${item.likes_count || 0}`;
  like.addEventListener("click", () => toggleLike(item, like));

  actions.append(counts, like);
  meta.append(tags, actions);
  card.append(media, meta);
  return card;
}

async function loadNextPage() {
  if (!supabase || exhausted || loading) return;
  loading = true;
  setStatus("Chargement…");
  const { data, error } = await supabase
    .from("media")
    .select("id, type, original_url, poster_url, tags, category_slugs, likes_count, views_count, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  loading = false;
  if (error) {
    setStatus(`Erreur Supabase: ${error.message}`);
    return;
  }
  if (!data || data.length === 0) {
    exhausted = true;
    render();
    return;
  }
  loaded.push(...data);
  offset += data.length;
  if (data.length < PAGE_SIZE) exhausted = true;
  render();
}

async function uploadIfNeeded(file) {
  if (!file) return null;
  const ext = file.name.split(".").pop() || "bin";
  const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });
  if (error) throw error;
  const { data } = supabase.storage.from("media").getPublicUrl(path);
  return { publicUrl: data.publicUrl, path };
}

function setupInfiniteScroll() {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && !exhausted) loadNextPage();
    },
    { rootMargin: "500px" }
  );
  io.observe(els.sentinel);
}

function setupFilters() {
  let t = 0;
  const debounce = () => {
    clearTimeout(t);
    t = setTimeout(() => render(), 100);
  };
  els.search.addEventListener("input", debounce);
  els.typeFilter.addEventListener("change", render);
  els.sortFilter.addEventListener("change", render);
}

function setupModal() {
  const close = () => els.modal.classList.add("hidden");
  document.getElementById("btn-add")?.addEventListener("click", () => els.modal.classList.remove("hidden"));
  els.modal.querySelectorAll("[data-close]").forEach((n) => n.addEventListener("click", close));
  els.formAdd.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!supabase) return alert("Configure Supabase dans assets/js/config.js");
    const fd = new FormData(els.formAdd);
    const mediaFile = fd.get("media_file");
    let originalUrl = String(fd.get("original_url") || "").trim();
    let storagePath = null;
    try {
      if (mediaFile && mediaFile.size > 0) {
        const uploaded = await uploadIfNeeded(mediaFile);
        originalUrl = uploaded.publicUrl;
        storagePath = uploaded.path;
      }
      if (!originalUrl) return alert("Ajoute une URL ou un fichier.");
      const payload = {
        type: String(fd.get("type")),
        original_url: originalUrl,
        poster_url: String(fd.get("poster_url") || "").trim() || null,
        tags: String(fd.get("tags") || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        category_slugs: String(fd.get("categories") || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        storage_path: storagePath
      };
      const { error } = await supabase.from("media").insert(payload);
      if (error) throw error;
      close();
      els.formAdd.reset();
      resetAndLoad();
    } catch (err) {
      alert(`Insertion impossible: ${err.message}`);
    }
  });
}

function setupPreviewModal() {
  const close = () => {
    els.preview.classList.add("hidden");
    els.previewBody.innerHTML = "";
  };
  document.querySelectorAll("[data-preview-close]").forEach((n) => n.addEventListener("click", close));
}

document.getElementById("btn-theme")?.addEventListener("click", toggleTheme);
initTheme();
initAgeGate();
setupSupabase();
setupInfiniteScroll();
setupFilters();
setupModal();
setupPreviewModal();
