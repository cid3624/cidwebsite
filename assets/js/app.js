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
    video.controls = false; // Disable native controls to prevent fullscreen zoom issue
    video.preload = "metadata";
    video.playsInline = true;
    video.muted = true;
    video.style.cursor = 'pointer';

    // Use poster_url if available
    if (item.poster_url) {
      video.poster = item.poster_url;
      const posterImg = new Image();
      posterImg.src = item.poster_url;
      posterImg.onload = markLoaded;
      posterImg.onerror = () => {
        video.addEventListener("loadedmetadata", markLoaded, { once: true });
      };
    } else {
      video.addEventListener("loadedmetadata", markLoaded, { once: true });
    }

    const source = document.createElement("source");
    source.src = item.original_url;
    video.appendChild(source);
    media.appendChild(video);

    // Custom play/pause on click
    video.addEventListener('click', (e) => {
      e.stopPropagation();
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });

    // Double click opens preview modal (our custom fullscreen)
    video.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      openPreview(item);
    });
  } else {
    const img = document.createElement("img");
    // Use poster_url as thumbnail if available for images too
    img.src = item.poster_url || item.original_url;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";

    // Handle load error - fallback to original_url
    img.addEventListener("error", () => {
      if (img.src !== item.original_url) {
        img.src = item.original_url;
      }
      markLoaded();
    });

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

// Link extraction system - handles various URL types including adult hosts
const LinkExtractor = {
  // Standard video platforms
  youtubeRegex: /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  vimeoRegex: /vimeo\.com\/(\d+)/,

  // Adult video platforms - extract video IDs
  xvideosRegex: /xvideos\.com\/video([a-zA-Z0-9]+)/i,
  xnxxRegex: /xnxx\.com\/video-([a-zA-Z0-9]+)/i,
  redtubeRegex: /redtube\.com\/(\d+)/i,
  youpornRegex: /youporn\.com\/watch\/([\d]+)/i,
  spankbangRegex: /spankbang\.com\/([a-zA-Z0-9]+)\/video/i,
  xhamsterRegex: /xhamster\.com\/videos\/([a-zA-Z0-9_-]+)/i,
  pornhubRegex: /pornhub\.com\/view_video\.php\?viewkey=([a-zA-Z0-9]+)/i,

  // GIF/Image platforms
  redgifsRegex: /redgifs\.com\/watch\/([a-zA-Z0-9_-]+)/i,
  gfycatRegex: /gfycat\.com\/([a-zA-Z0-9_-]+)/i,
  imgurRegex: /imgur\.com\/(?:gallery\/|a\/)?([a-zA-Z0-9]+)/i,

  // Other adult platforms
  beegRegex: /beeg\.com\/([\d-]+)/i,
  thumbzillaRegex: /thumbzilla\.com\/video\/([a-zA-Z0-9_-]+)/i,
  tube8Regex: /tube8\.com\/video\/([a-zA-Z0-9_-]+)/i,
  drtuberRegex: /drtuber\.com\/video\/([\d]+)/i,
  txxxRegex: /txxx\.com\/video\/([\d]+)/i,
  sunpornoRegex: /sunporno\.com\/video\/([\d]+)/i,
  porntrexRegex: /porntrex\.com\/video\/([\d]+)/i,
  epornerRegex: /eporner\.com\/video-([a-zA-Z0-9_-]+)/i,

  // Direct video extensions
  videoExtensions: ['.mp4', '.webm', '.ogg', '.mov', '.mkv', '.avi', '.m3u8'],
  imageExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'],

  // Extract and normalize URL
  extract(url) {
    if (!url) return null;
    url = url.trim();

    // YouTube
    const youtubeMatch = url.match(this.youtubeRegex);
    if (youtubeMatch) {
      const videoId = youtubeMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        posterUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        posterUrlFallback: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        source: 'youtube',
        videoId
      };
    }

    // Vimeo
    const vimeoMatch = url.match(this.vimeoRegex);
    if (vimeoMatch) {
      const videoId = vimeoMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: `https://vimeo.com/${videoId}`,
        embedUrl: `https://player.vimeo.com/video/${videoId}`,
        posterUrl: null,
        source: 'vimeo',
        videoId
      };
    }

    // Adult platforms - detect and provide embed URLs where possible
    const adultMatch = this.matchAdultPlatform(url);
    if (adultMatch) {
      return adultMatch;
    }

    // Direct file detection
    const lowerUrl = url.toLowerCase();
    const isVideo = this.videoExtensions.some(ext => lowerUrl.endsWith(ext));
    const isImage = this.imageExtensions.some(ext => lowerUrl.endsWith(ext));

    if (isVideo) {
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: url,
        posterUrl: null,
        source: 'direct'
      };
    }

    if (isImage) {
      return {
        type: 'IMAGE',
        originalUrl: url,
        embedUrl: url,
        posterUrl: url,
        source: 'direct'
      };
    }

    // GIF detection
    if (lowerUrl.endsWith('.gif')) {
      return {
        type: 'ANIMATION',
        originalUrl: url,
        embedUrl: url,
        posterUrl: null,
        source: 'direct'
      };
    }

    // Default: assume it's a direct video link
    return {
      type: 'VIDEO',
      originalUrl: url,
      embedUrl: url,
      posterUrl: null,
      source: 'unknown'
    };
  },

  // Match adult video platforms
  matchAdultPlatform(url) {
    const lowerUrl = url.toLowerCase();

    // SpankBang (provides embed)
    const spankbangMatch = url.match(this.spankbangRegex);
    if (spankbangMatch) {
      const videoId = spankbangMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://spankbang.com/${videoId}/embed/`,
        posterUrl: null,
        source: 'spankbang',
        videoId,
        isAdult: true
      };
    }

    // XHamster (provides embed)
    const xhamsterMatch = url.match(this.xhamsterRegex);
    if (xhamsterMatch) {
      const videoId = xhamsterMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://xhamster.com/embed/${videoId}`,
        posterUrl: null,
        source: 'xhamster',
        videoId,
        isAdult: true
      };
    }

    // XVideos (direct video URL preferred, embed available)
    const xvideosMatch = url.match(this.xvideosRegex);
    if (xvideosMatch) {
      const videoId = xvideosMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://www.xvideos.com/embedframe/${videoId}`,
        posterUrl: null,
        source: 'xvideos',
        videoId,
        isAdult: true
      };
    }

    // XNXX
    const xnxxMatch = url.match(this.xnxxRegex);
    if (xnxxMatch) {
      const videoId = xnxxMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://www.xnxx.com/embedframe/${videoId}`,
        posterUrl: null,
        source: 'xnxx',
        videoId,
        isAdult: true
      };
    }

    // RedTube
    const redtubeMatch = url.match(this.redtubeRegex);
    if (redtubeMatch) {
      const videoId = redtubeMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://embed.redtube.com/?id=${videoId}`,
        posterUrl: null,
        source: 'redtube',
        videoId,
        isAdult: true
      };
    }

    // YouPorn
    const youpornMatch = url.match(this.youpornRegex);
    if (youpornMatch) {
      const videoId = youpornMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://www.youporn.com/embed/${videoId}`,
        posterUrl: null,
        source: 'youporn',
        videoId,
        isAdult: true
      };
    }

    // Pornhub
    const pornhubMatch = url.match(this.pornhubRegex);
    if (pornhubMatch) {
      const videoId = pornhubMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://www.pornhub.com/embed/${videoId}`,
        posterUrl: null,
        source: 'pornhub',
        videoId,
        isAdult: true
      };
    }

    // RedGIFs (NSFW Gfycat successor)
    const redgifsMatch = url.match(this.redgifsRegex);
    if (redgifsMatch) {
      const gifId = redgifsMatch[1];
      return {
        type: 'ANIMATION',
        originalUrl: url,
        embedUrl: `https://www.redgifs.com/ifr/${gifId}`,
        posterUrl: `https://thumbs2.redgifs.com/${gifId}-mobile.jpg`,
        source: 'redgifs',
        videoId: gifId,
        isAdult: true
      };
    }

    // Gfycat
    const gfycatMatch = url.match(this.gfycatRegex);
    if (gfycatMatch) {
      const gifId = gfycatMatch[1];
      return {
        type: 'ANIMATION',
        originalUrl: url,
        embedUrl: `https://gfycat.com/ifr/${gifId}`,
        posterUrl: `https://thumbs.gfycat.com/${gifId}-mobile.jpg`,
        source: 'gfycat',
        videoId: gifId,
        isAdult: false
      };
    }

    // Imgur
    const imgurMatch = url.match(this.imgurRegex);
    if (imgurMatch) {
      const imgId = imgurMatch[1];
      return {
        type: 'IMAGE',
        originalUrl: url,
        embedUrl: `https://i.imgur.com/${imgId}.jpg`,
        posterUrl: `https://i.imgur.com/${imgId}l.jpg`, // l = large thumbnail
        source: 'imgur',
        videoId: imgId,
        isAdult: false
      };
    }

    // Beeg
    const beegMatch = url.match(this.beegRegex);
    if (beegMatch) {
      const videoId = beegMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://beeg.com/${videoId}`,
        posterUrl: null,
        source: 'beeg',
        videoId,
        isAdult: true
      };
    }

    // Thumbzilla
    const thumbzillaMatch = url.match(this.thumbzillaRegex);
    if (thumbzillaMatch) {
      const videoId = thumbzillaMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://www.thumbzilla.com/embed/${videoId}`,
        posterUrl: null,
        source: 'thumbzilla',
        videoId,
        isAdult: true
      };
    }

    // Tube8
    const tube8Match = url.match(this.tube8Regex);
    if (tube8Match) {
      const videoId = tube8Match[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://www.tube8.com/embed/adult/${videoId}`,
        posterUrl: null,
        source: 'tube8',
        videoId,
        isAdult: true
      };
    }

    // DrTuber
    const drtuberMatch = url.match(this.drtuberRegex);
    if (drtuberMatch) {
      const videoId = drtuberMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://www.drtuber.com/embed/${videoId}`,
        posterUrl: null,
        source: 'drtuber',
        videoId,
        isAdult: true
      };
    }

    // TXXX
    const txxxMatch = url.match(this.txxxRegex);
    if (txxxMatch) {
      const videoId = txxxMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://www.txxx.com/embed/${videoId}`,
        posterUrl: null,
        source: 'txxx',
        videoId,
        isAdult: true
      };
    }

    // SunPorno
    const sunpornoMatch = url.match(this.sunpornoRegex);
    if (sunpornoMatch) {
      const videoId = sunpornoMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://www.sunporno.com/embed/${videoId}`,
        posterUrl: null,
        source: 'sunporno',
        videoId,
        isAdult: true
      };
    }

    // PornTrex
    const porntrexMatch = url.match(this.porntrexRegex);
    if (porntrexMatch) {
      const videoId = porntrexMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://www.porntrex.com/embed/${videoId}`,
        posterUrl: null,
        source: 'porntrex',
        videoId,
        isAdult: true
      };
    }

    // EPorner
    const epornerMatch = url.match(this.epornerRegex);
    if (epornerMatch) {
      const videoId = epornerMatch[1];
      return {
        type: 'VIDEO',
        originalUrl: url,
        embedUrl: `https://www.eporner.com/embed/${videoId}`,
        posterUrl: null,
        source: 'eporner',
        videoId,
        isAdult: true
      };
    }

    return null;
  },

  // Auto-detect best poster URL
  async getBestPoster(url, type) {
    const extracted = this.extract(url);
    if (!extracted) return null;

    // For YouTube, try maxres first, fallback to hq
    if (extracted.source === 'youtube') {
      const img = new Image();
      img.src = extracted.posterUrl;

      return new Promise((resolve) => {
        img.onload = () => resolve(extracted.posterUrl);
        img.onerror = () => resolve(extracted.posterUrlFallback);
        setTimeout(() => resolve(extracted.posterUrlFallback), 3000);
      });
    }

    // For adult platforms, we can't easily get thumbnails without scraping
    return extracted.posterUrl;
  },

  // Check if URL is from adult platform
  isAdultContent(url) {
    const adultDomains = [
      'xvideos.com', 'xnxx.com', 'redtube.com', 'youporn.com',
      'spankbang.com', 'xhamster.com', 'pornhub.com',
      'tube8.com', 'drtuber.com', 'txxx.com', 'sunporno.com',
      'redgifs.com', 'beeg.com', 'thumbzilla.com',
      'porntrex.com', 'eporner.com'
    ];
    const lowerUrl = url.toLowerCase();
    return adultDomains.some(domain => lowerUrl.includes(domain));
  }
};

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

  // Mobile filter toggle
  const filterBtn = document.getElementById("btn-filters");
  const filterPanel = document.getElementById("toolbar-filters");
  if (filterBtn && filterPanel) {
    filterBtn.addEventListener("click", () => {
      filterPanel.classList.toggle("is-visible");
      filterBtn.classList.toggle("is-active");
    });
  }
}

function setupModal() {
  const close = () => els.modal.classList.add("hidden");
  document.getElementById("btn-add")?.addEventListener("click", () => els.modal.classList.remove("hidden"));
  els.modal.querySelectorAll("[data-close]").forEach((n) => n.addEventListener("click", close));

  // Auto-detect type and poster when URL changes
  const urlInput = els.formAdd.querySelector('[name="original_url"]');
  const typeSelect = els.formAdd.querySelector('[name="type"]');
  const posterInput = els.formAdd.querySelector('[name="poster_url"]');

  if (urlInput) {
    urlInput.addEventListener("input", async (e) => {
      const url = e.target.value.trim();
      if (!url) return;

      // Use LinkExtractor to detect type and poster
      const extracted = LinkExtractor.extract(url);
      if (extracted) {
        // Auto-select type
        if (typeSelect && extracted.type) {
          typeSelect.value = extracted.type;
        }

        // Auto-fill poster for YouTube
        if (posterInput && extracted.source === 'youtube' && extracted.posterUrl) {
          const bestPoster = await LinkExtractor.getBestPoster(url);
          if (bestPoster) {
            posterInput.value = bestPoster;
          }
        }
      }
    });
  }

  els.formAdd.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!supabase) return alert("Configure Supabase dans assets/js/config.js");
    const fd = new FormData(els.formAdd);
    const mediaFile = fd.get("media_file");
    let originalUrl = String(fd.get("original_url") || "").trim();
    let storagePath = null;
    let posterUrl = String(fd.get("poster_url") || "").trim() || null;
    let detectedType = String(fd.get("type"));

    try {
      if (mediaFile && mediaFile.size > 0) {
        const uploaded = await uploadIfNeeded(mediaFile);
        originalUrl = uploaded.publicUrl;
        storagePath = uploaded.path;
      }
      if (!originalUrl) return alert("Ajoute une URL ou un fichier.");

      // Use LinkExtractor to get poster if not provided
      const extracted = LinkExtractor.extract(originalUrl);
      if (extracted && !posterUrl) {
        posterUrl = await LinkExtractor.getBestPoster(originalUrl);
        // Update type if auto-detected
        if (extracted.type && detectedType === 'IMAGE') {
          detectedType = extracted.type;
        }
      }

      const payload = {
        type: detectedType,
        original_url: originalUrl,
        poster_url: posterUrl,
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
      console.error("Error inserting media:", err);
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

// Global error handling to prevent "message channel closed" and other uncaught errors
window.addEventListener('error', (e) => {
  // Suppress known non-critical errors
  const suppressedMessages = [
    'message channel closed',
    'extension',
    'chrome-extension',
    'ResizeObserver',
    'Script error'
  ];

  const shouldSuppress = suppressedMessages.some(msg =>
    e.message?.toLowerCase().includes(msg.toLowerCase()) ||
    e.filename?.toLowerCase().includes('extension')
  );

  if (shouldSuppress) {
    e.preventDefault();
    console.warn('Suppressed non-critical error:', e.message);
    return false;
  }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
  const suppressedMessages = [
    'message channel closed',
    'extension',
    'chrome-extension'
  ];

  const shouldSuppress = suppressedMessages.some(msg =>
    e.reason?.message?.toLowerCase().includes(msg.toLowerCase()) ||
    String(e.reason).toLowerCase().includes(msg.toLowerCase())
  );

  if (shouldSuppress) {
    e.preventDefault();
    console.warn('Suppressed unhandled promise:', e.reason);
    return false;
  }
});
