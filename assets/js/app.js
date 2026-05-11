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
  onboarding: document.getElementById("onboarding"),
  modal: document.getElementById("modal"),
  formAdd: document.getElementById("form-add"),
  emptyState: document.getElementById("empty-state"),
  preview: document.getElementById("preview"),
  previewBody: document.getElementById("preview-body"),
  modalEdit: document.getElementById("modal-edit"),
  formEdit: document.getElementById("form-edit"),
  posterPreview: document.getElementById("poster-preview"),
  posterPreviewImg: document.querySelector(".poster-preview__img")
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

function initOnboarding() {
  const ok = sessionStorage.getItem("age_ok") === "1";
  if (!els.onboarding) return;
  if (ok) {
    els.onboarding.classList.add("hidden");
    els.onboarding.setAttribute("aria-hidden", "true");
    return;
  }

  let currentStep = 1;
  const totalSteps = 3;
  const steps = els.onboarding.querySelectorAll(".onboarding__step");

  function showStep(step) {
    steps.forEach((s, i) => {
      s.classList.toggle("hidden", i + 1 !== step);
    });
    // Update dots
    els.onboarding.querySelectorAll(".dot").forEach((d, i) => {
      d.classList.toggle("active", i + 1 === step);
    });
  }

  // Next buttons for steps 1 and 2
  els.onboarding.querySelectorAll(".onboarding__next").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (currentStep < totalSteps) {
        currentStep++;
        showStep(currentStep);
      }
    });
  });

  // Confirm age on step 3
  document.getElementById("age-confirm")?.addEventListener("click", () => {
    sessionStorage.setItem("age_ok", "1");
    els.onboarding.classList.add("hidden");
    els.onboarding.setAttribute("aria-hidden", "true");
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
  card.dataset.id = item.id;

  const media = document.createElement("div");
  media.className = "card__media";

  // Admin buttons
  const admin = document.createElement("div");
  admin.className = "card__admin";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "card__admin-btn";
  editBtn.title = "Modifier";
  editBtn.textContent = "✏️";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openEditModal(item);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "card__admin-btn card__admin-btn--delete";
  deleteBtn.title = "Supprimer";
  deleteBtn.textContent = "🗑";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteMedia(item, card);
  });

  admin.append(editBtn, deleteBtn);
  media.appendChild(admin);

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
    // Use poster_url if available
    if (item.poster_url) {
      video.poster = item.poster_url;
    }
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

// Open edit modal with item data
function openEditModal(item) {
  if (!els.modalEdit || !els.formEdit) return;

  // Populate form
  els.formEdit.querySelector('[name="id"]').value = item.id;
  els.formEdit.querySelector('[name="type"]').value = item.type;
  els.formEdit.querySelector('[name="original_url"]').value = item.original_url || "";
  els.formEdit.querySelector('[name="poster_url"]').value = item.poster_url || "";
  els.formEdit.querySelector('[name="tags"]').value = (item.tags || []).join(", ");
  els.formEdit.querySelector('[name="categories"]').value = (item.category_slugs || []).join(", ");

  // Update poster preview
  updatePosterPreview(item.poster_url);

  // Show modal
  els.modalEdit.classList.remove("hidden");
}

// Update poster preview image
function updatePosterPreview(url) {
  if (!els.posterPreviewImg) return;
  if (url) {
    els.posterPreviewImg.src = url;
    els.posterPreviewImg.classList.remove("hidden");
    els.posterPreviewImg.onload = () => els.posterPreviewImg.classList.remove("hidden");
    els.posterPreviewImg.onerror = () => els.posterPreviewImg.classList.add("hidden");
  } else {
    els.posterPreviewImg.classList.add("hidden");
    els.posterPreviewImg.src = "";
  }
}

// Delete media item
async function deleteMedia(item, cardElement) {
  if (!confirm("Êtes-vous sûr de vouloir supprimer ce média ? Cette action est irréversible.")) {
    return;
  }

  if (!supabase) {
    alert("Supabase non configuré");
    return;
  }

  try {
    const { error } = await supabase.from("media").delete().eq("id", item.id);
    if (error) throw error;

    // Remove from UI
    cardElement.style.transform = "scale(0)";
    cardElement.style.opacity = "0";
    setTimeout(() => {
      cardElement.remove();
      loaded = loaded.filter((x) => x.id !== item.id);
      render();
    }, 300);

    setStatus("Média supprimé");
  } catch (err) {
    alert(`Erreur lors de la suppression: ${err.message}`);
  }
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

function setupEditModal() {
  if (!els.modalEdit || !els.formEdit) return;

  const close = () => els.modalEdit.classList.add("hidden");

  // Close buttons
  els.modalEdit.querySelectorAll("[data-edit-close]").forEach((n) => n.addEventListener("click", close));

  // Poster URL input - live preview
  const posterUrlInput = els.formEdit.querySelector('[name="poster_url"]');
  posterUrlInput?.addEventListener("input", (e) => {
    updatePosterPreview(e.target.value);
  });

  // Poster file upload - preview
  const posterFileInput = els.formEdit.querySelector('[name="poster_file"]');
  posterFileInput?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => updatePosterPreview(ev.target.result);
    reader.readAsDataURL(file);
  });

  // Form submission
  els.formEdit.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!supabase) return alert("Supabase non configuré");

    const fd = new FormData(els.formEdit);
    const id = fd.get("id");
    const posterFile = fd.get("poster_file");

    try {
      let posterUrl = String(fd.get("poster_url") || "").trim() || null;

      // Upload new poster if provided
      if (posterFile && posterFile.size > 0) {
        const ext = posterFile.name.split(".").pop() || "jpg";
        const path = `posters/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("media").upload(path, posterFile, {
          cacheControl: "3600",
          upsert: false
        });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("media").getPublicUrl(path);
        posterUrl = data.publicUrl;
      }

      const payload = {
        type: String(fd.get("type")),
        original_url: String(fd.get("original_url") || "").trim(),
        poster_url: posterUrl,
        tags: String(fd.get("tags") || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        category_slugs: String(fd.get("categories") || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      };

      const { error } = await supabase.from("media").update(payload).eq("id", id);
      if (error) throw error;

      close();
      els.formEdit.reset();
      resetAndLoad();
      setStatus("Média mis à jour");
    } catch (err) {
      alert(`Erreur lors de la mise à jour: ${err.message}`);
    }
  });

  // Delete button
  document.getElementById("btn-delete")?.addEventListener("click", async () => {
    const id = els.formEdit.querySelector('[name="id"]').value;
    const item = loaded.find((x) => String(x.id) === String(id));
    if (item) {
      // Find the card element
      const card = els.gallery.querySelector(`[data-id="${id}"]`);
      await deleteMedia(item, card);
      close();
    }
  });

  // Swipe to close
  setupSwipeToClose(els.modalEdit, close);
}

function setupPreviewModal() {
  const close = () => {
    els.preview.classList.add("hidden");
    els.previewBody.innerHTML = "";
  };
  document.querySelectorAll("[data-preview-close]").forEach((n) => n.addEventListener("click", close));

  // Swipe down to close on mobile
  setupSwipeToClose(els.preview, close);
}

// Swipe to close for modals (mobile)
function setupSwipeToClose(element, closeFn) {
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  const panel = element.querySelector('.modal__panel, .preview-panel');
  if (!panel) return;

  const onTouchStart = (e) => {
    const touch = e.touches[0];
    startY = touch.clientY;
    isDragging = true;
    panel.style.transition = 'none';
  };

  const onTouchMove = (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    currentY = touch.clientY;
    const diff = currentY - startY;

    // Only allow dragging down
    if (diff > 0) {
      panel.style.transform = `translateY(${diff}px)`;
    }
  };

  const onTouchEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    panel.style.transition = 'transform 0.3s ease-out';

    const diff = currentY - startY;
    if (diff > 100) {
      // Swiped far enough, close
      panel.style.transform = 'translateY(100%)';
      setTimeout(closeFn, 200);
    } else {
      // Snap back
      panel.style.transform = '';
    }
  };

  panel.addEventListener('touchstart', onTouchStart, { passive: true });
  panel.addEventListener('touchmove', onTouchMove, { passive: true });
  panel.addEventListener('touchend', onTouchEnd, { passive: true });
}

// Keyboard handling for mobile
function setupKeyboardHandling() {
  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  if (!isMobile) return;

  // Adjust layout when keyboard opens/closes
  const inputs = document.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    input.addEventListener('focus', () => {
      document.body.classList.add('keyboard-open');
    });
    input.addEventListener('blur', () => {
      document.body.classList.remove('keyboard-open');
    });
  });
}

// Double tap to like on mobile
function setupDoubleTapLike() {
  let lastTap = 0;
  const gallery = els.gallery;

  gallery.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;

    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;

    if (tapLength < 300 && tapLength > 0) {
      // Double tap detected
      const likeBtn = card.querySelector('.btn-like');
      if (likeBtn) {
        likeBtn.click();
        // Visual feedback
        card.style.transform = 'scale(0.98)';
        setTimeout(() => card.style.transform = '', 150);
      }
    }
    lastTap = currentTime;
  });
}

document.getElementById("btn-theme")?.addEventListener("click", toggleTheme);
initTheme();
initOnboarding();
setupSupabase();
setupInfiniteScroll();
setupFilters();
setupModal();
setupEditModal();
setupPreviewModal();
setupKeyboardHandling();
setupDoubleTapLike();

// Handle visibility change (pause videos when app is backgrounded)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    document.querySelectorAll('video').forEach(v => v.pause());
  }
});
