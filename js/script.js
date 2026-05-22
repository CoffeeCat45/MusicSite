// DOM элементы
const cardsGrid = document.getElementById("cardsGrid");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const sectionTitle = document.getElementById("sectionTitle");
const artistDetailSection = document.getElementById("artistDetail");
const albumsSection = document.querySelector(".albums-section");
const backBtn = document.getElementById("backToAlbumsBtn");
const artistInfoDiv = document.getElementById("artistInfo");
const tracksListDiv = document.getElementById("tracksList");
const subscribeForm = document.getElementById("subscribeForm");
const loadMoreTracksWrapper = document.getElementById("loadMoreTracksWrapper");
const loadMoreTracksBtn = document.getElementById("loadMoreTracksBtn");

// Состояния для альбомов и поиска
let currentSearchMode = "album";
let currentQuery = "";
let currentOffset = 0;
const defaultLimit = 12;
const loadMoreLimit = 6;
let isLoading = false;
let hasMore = true;

// Состояния для треков артиста
let currentArtistId = null;
let currentArtistObj = null;
let currentTracksOffset = 0;
let currentTracksLimit = 10;
let tracksHasMore = true;
let isLoadingTracks = false;

// Аудиоплеер для треков артиста
let currentAudio = null;
let currentTrackElement = null;
let currentVolume = 0.7;

// Временный плеер для превью в поиске треков
let tempAudio = null;
let tempCard = null;

// Прокси для обхода CORS
const PROXY = "https://corsproxy.io/?url=";

async function fetchDeezer(url, retries = 2) {
  const proxiedUrl = PROXY + encodeURIComponent(url);
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(proxiedUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`Попытка ${i + 1} не удалась:`, err);
      if (i === retries - 1) return null;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
}

// Загрузка популярных альбомов
async function loadPopularAlbums(reset = true) {
  if (reset) {
    currentOffset = 0;
    cardsGrid.innerHTML = "";
    hasMore = true;
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = "Загрузить ещё";
  }
  if (isLoading || !hasMore) return;
  isLoading = true;

  const limit = reset ? defaultLimit : loadMoreLimit;
  const url = `https://api.deezer.com/chart/0/albums?limit=${limit}&index=${currentOffset}`;
  const data = await fetchDeezer(url);
  if (data && data.data) {
    const newAlbums = data.data;
    if (newAlbums.length === 0) {
      hasMore = false;
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = "Больше нет";
    } else {
      renderCards(newAlbums, "album");
      currentOffset += newAlbums.length;
      if (newAlbums.length < limit) hasMore = false;
    }
  } else {
    cardsGrid.innerHTML =
      "<p>Не удалось загрузить альбомы. Попробуйте позже.</p>";
  }
  isLoading = false;
}

function renderCards(items, type) {
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card";
    if (type === "album") {
      const album = item.album || item;
      const title = album.title;
      const artist = album.artist.name;
      const nbTracks = album.nb_tracks || "—";
      const cover = album.cover_medium;
      card.innerHTML = `
        <img class="card__image" src="${cover}" alt="${escapeHtml(title)}">
        <div class="card__content">
          <div class="card__title">${escapeHtml(title)}</div>
          <div class="card__subtitle">${escapeHtml(artist)}</div>
          <div class="card__meta">${nbTracks === "—" ? "нет данных" : nbTracks + " треков"}</div>
        </div>
      `;
      card.addEventListener("click", () =>
        showArtistFromAlbum(album.artist.id),
      );
    } else if (type === "artist") {
      const artist = item;
      const name = artist.name;
      const picture = artist.picture_medium;
      const nbFan = artist.nb_fan;
      card.innerHTML = `
        <img class="card__image" src="${picture}" alt="${escapeHtml(name)}">
        <div class="card__content">
          <div class="card__title">${escapeHtml(name)}</div>
          <div class="card__subtitle">⭐ ${formatNumber(nbFan)} фанатов</div>
        </div>
      `;
      card.addEventListener("click", () => showArtistDetail(artist.id));
    } else if (type === "track") {
      const track = item;
      const title = track.title;
      const artist = track.artist.name;
      const albumCover = track.album.cover_medium;
      const previewUrl = track.preview || "";
      card.innerHTML = `
        <img class="card__image" src="${albumCover}" alt="${escapeHtml(title)}">
        <div class="card__content">
          <div class="card__title">${escapeHtml(title)}</div>
          <div class="card__subtitle">${escapeHtml(artist)}</div>
          <div class="card__meta">🎵 трек</div>
          <button class="track-play-preview" data-preview="${previewUrl}">▶ Превью</button>
          <div class="track-volume-control">
            <button class="track-volume-icon">
              <img src="assets/icons/volume.png" alt="Громкость" width="18" height="18">
            </button>
            <input type="range" class="track-volume-slider" min="0" max="1" step="0.01" value="${currentVolume}">
          </div>
        </div>
      `;

      // Блок управления громкостью – предотвращаем переход к артисту
      const volumeControlDiv = card.querySelector(".track-volume-control");
      if (volumeControlDiv) {
        volumeControlDiv.addEventListener("click", (e) => e.stopPropagation());
      }

      const playBtn = card.querySelector(".track-play-preview");
      if (playBtn && previewUrl) {
        playBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          playTrackPreview(previewUrl, card);
        });
      } else if (playBtn) {
        playBtn.textContent = "❌ Превью нет";
        playBtn.disabled = true;
      }

      const volSlider = card.querySelector(".track-volume-slider");
      const volIcon = card.querySelector(".track-volume-icon");
      if (volSlider) {
        volSlider.addEventListener("input", (e) => {
          e.stopPropagation();
          const newVol = parseFloat(e.target.value);
          currentVolume = newVol;
          if (tempAudio) tempAudio.volume = currentVolume;
          document
            .querySelectorAll(".track-volume-slider, .volume-slider")
            .forEach((sl) => {
              if (sl !== volSlider) sl.value = currentVolume;
            });
          const iconImg = volIcon?.querySelector("img");
          if (iconImg)
            iconImg.style.opacity = currentVolume === 0 ? "0.5" : "1";
        });
      }
      if (volIcon) {
        volIcon.addEventListener("click", (e) => {
          e.stopPropagation();
          const slider = card.querySelector(".track-volume-slider");
          if (slider) {
            if (currentVolume > 0) {
              slider.dataset.prevVolume = currentVolume;
              slider.value = 0;
              slider.dispatchEvent(new Event("input"));
            } else {
              const prev = parseFloat(slider.dataset.prevVolume || 0.7);
              slider.value = prev;
              slider.dispatchEvent(new Event("input"));
            }
          }
        });
      }

      card.addEventListener("click", () => {
        if (track.artist) showArtistDetail(track.artist.id);
      });
    }
    cardsGrid.appendChild(card);
  });
}

function playTrackPreview(previewUrl, cardElement) {
  const btn = cardElement.querySelector(".track-play-preview");
  if (tempAudio && tempCard === cardElement && !tempAudio.paused) {
    tempAudio.pause();
    btn.textContent = "▶ Превью";
    tempAudio = null;
    tempCard = null;
    return;
  }
  if (tempAudio) {
    tempAudio.pause();
    const oldBtn = tempCard?.querySelector(".track-play-preview");
    if (oldBtn) oldBtn.textContent = "▶ Превью";
    tempAudio = null;
    tempCard = null;
  }
  const audio = new Audio(previewUrl);
  audio.volume = currentVolume;
  audio.play();
  btn.textContent = "⏸ Превью";
  tempAudio = audio;
  tempCard = cardElement;

  audio.addEventListener("ended", () => {
    btn.textContent = "▶ Превью";
    if (tempAudio === audio) tempAudio = null;
    tempCard = null;
  });
  audio.addEventListener("pause", () => {
    if (tempAudio === audio) btn.textContent = "▶ Превью";
  });
}

async function showArtistFromAlbum(artistId) {
  const artist = await fetchDeezer(`https://api.deezer.com/artist/${artistId}`);
  if (artist) showArtistDetail(artist.id, artist);
  else showArtistDetail(artistId);
}

async function showArtistDetail(artistId, preloaded = null) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
    if (currentTrackElement) {
      currentTrackElement.classList.remove("playing");
      currentTrackElement = null;
    }
  }
  if (tempAudio) {
    tempAudio.pause();
    tempAudio = null;
    tempCard = null;
  }
  let artist = preloaded;
  if (!artist)
    artist = await fetchDeezer(`https://api.deezer.com/artist/${artistId}`);
  if (!artist) return;

  currentArtistId = artist.id;
  currentArtistObj = artist;
  currentTracksOffset = 0;
  tracksHasMore = true;
  tracksListDiv.innerHTML = "";
  loadMoreTracksWrapper.style.display = "none";

  artistInfoDiv.innerHTML = `
    <img class="artist-avatar" src="${artist.picture_big || artist.picture_medium}" alt="${artist.name}">
    <div>
      <div class="artist-name">${escapeHtml(artist.name)}</div>
      <div class="artist-fans">⭐ ${formatNumber(artist.nb_fan)} фанатов</div>
      <div>🎵 ${artist.nb_album} альбомов</div>
    </div>
  `;
  await loadMoreTracks(true);
  albumsSection.style.display = "none";
  artistDetailSection.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadMoreTracks(reset = false) {
  if (isLoadingTracks) return;
  if (reset) {
    currentTracksOffset = 0;
    tracksHasMore = true;
    tracksListDiv.innerHTML = "";
    loadMoreTracksWrapper.style.display = "none";
  }
  if (!tracksHasMore) return;
  isLoadingTracks = true;
  const url = `https://api.deezer.com/artist/${currentArtistId}/top?limit=${currentTracksLimit}&index=${currentTracksOffset}`;
  const data = await fetchDeezer(url);
  if (data && data.data) {
    const newTracks = data.data;
    if (newTracks.length === 0) {
      tracksHasMore = false;
      loadMoreTracksWrapper.style.display = "none";
    } else {
      renderTracks(newTracks, currentTracksOffset === 0);
      currentTracksOffset += newTracks.length;
      if (newTracks.length < currentTracksLimit) tracksHasMore = false;
      loadMoreTracksWrapper.style.display = tracksHasMore ? "block" : "none";
    }
  } else if (reset) {
    tracksListDiv.innerHTML = "<p>Не удалось загрузить треки</p>";
  }
  isLoadingTracks = false;
}

function renderTracks(tracks, isFirstPage) {
  const startIndex = isFirstPage ? 0 : tracksListDiv.children.length;
  tracks.forEach((track, idx) => {
    const globalIndex = startIndex + idx;
    const trackEl = document.createElement("div");
    trackEl.className = "track-item";
    const minutes = Math.floor(track.duration / 60);
    const seconds = track.duration % 60;
    const duration = `${minutes}:${seconds.toString().padStart(2, "0")}`;
    const previewUrl = track.preview || null;
    trackEl.innerHTML = `
      <div class="track-left">
        <button class="play-btn" data-preview="${previewUrl || ""}" data-index="${globalIndex}">
          <img src="assets/icons/play-button.png" alt="Play" width="20" height="20">
        </button>
        <div class="track-info">
          <div class="track-name">${escapeHtml(track.title)}</div>
          <div class="track-meta">
            <span class="track-duration">${duration}</span>
            <div class="equalizer"><span></span><span></span><span></span><span></span></div>
            <span class="track-time" id="time-${globalIndex}">00:00</span>
          </div>
        </div>
      </div>
      <div class="volume-control">
        <button class="volume-icon" data-index="${globalIndex}">
          <img src="assets/icons/volume.png" alt="Volume" width="18" height="18">
        </button>
        <input type="range" class="volume-slider" min="0" max="1" step="0.01" value="${currentVolume}" data-index="${globalIndex}">
      </div>
    `;
    tracksListDiv.appendChild(trackEl);
  });
  attachTrackEvents();
}

function attachTrackEvents() {
  document.querySelectorAll(".play-btn").forEach((btn) => {
    btn.removeEventListener("click", handlePlayClick);
    btn.addEventListener("click", handlePlayClick);
  });
  document.querySelectorAll(".volume-slider").forEach((slider) => {
    slider.removeEventListener("input", handleVolumeInput);
    slider.addEventListener("input", handleVolumeInput);
  });
  document.querySelectorAll(".volume-icon").forEach((icon) => {
    icon.removeEventListener("click", handleVolumeIconClick);
    icon.addEventListener("click", handleVolumeIconClick);
  });
}

function handlePlayClick(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const previewUrl = btn.dataset.preview;
  const trackDiv = btn.closest(".track-item");
  const trackIndex = btn.dataset.index;
  if (!previewUrl) {
    alert("Превью недоступно");
    return;
  }
  togglePlay(trackDiv, previewUrl, trackIndex);
}

function handleVolumeInput(e) {
  e.stopPropagation();
  const newVolume = parseFloat(e.target.value);
  currentVolume = newVolume;
  if (currentAudio) currentAudio.volume = currentVolume;
  const parent = e.target.closest(".track-item");
  if (parent) {
    const volumeIcon = parent.querySelector(".volume-icon img");
    if (volumeIcon)
      volumeIcon.style.opacity = currentVolume === 0 ? "0.5" : "1";
  }
  // Синхронизация с ползунками в карточках поиска
  document.querySelectorAll(".track-volume-slider").forEach((sl) => {
    if (sl.value != currentVolume) sl.value = currentVolume;
  });
}

function handleVolumeIconClick(e) {
  e.stopPropagation();
  const iconBtn = e.currentTarget;
  const slider = iconBtn
    .closest(".volume-control")
    .querySelector(".volume-slider");
  if (slider) {
    if (currentVolume > 0) {
      slider.dataset.prevVolume = currentVolume;
      slider.value = 0;
      slider.dispatchEvent(new Event("input"));
    } else {
      const prev = parseFloat(slider.dataset.prevVolume || 0.7);
      slider.value = prev;
      slider.dispatchEvent(new Event("input"));
    }
  }
}

function togglePlay(trackElement, previewUrl, index) {
  const timeSpan = document.getElementById(`time-${index}`);
  const playImg = trackElement.querySelector(".play-btn img");
  if (
    currentAudio &&
    currentTrackElement === trackElement &&
    !currentAudio.paused
  ) {
    currentAudio.pause();
    if (playImg) playImg.src = "assets/icons/play-button.png";
    trackElement.classList.remove("playing");
    currentAudio = null;
    currentTrackElement = null;
    if (timeSpan) timeSpan.textContent = "00:00";
    return;
  }
  if (currentAudio) {
    currentAudio.pause();
    if (currentTrackElement) {
      const prevImg = currentTrackElement.querySelector(".play-btn img");
      if (prevImg) prevImg.src = "assets/icons/play-button.png";
      currentTrackElement.classList.remove("playing");
      const prevTimeSpan = currentTrackElement.querySelector(".track-time");
      if (prevTimeSpan) prevTimeSpan.textContent = "00:00";
    }
  }
  const audio = new Audio(previewUrl);
  audio.volume = currentVolume;
  currentAudio = audio;
  currentTrackElement = trackElement;
  if (playImg) playImg.src = "assets/icons/pause.png";
  trackElement.classList.add("playing");
  audio.addEventListener("timeupdate", () => {
    if (timeSpan) {
      const cur = audio.currentTime;
      const mins = Math.floor(cur / 60);
      const secs = Math.floor(cur % 60);
      timeSpan.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
    }
  });
  audio.addEventListener("ended", () => {
    if (playImg) playImg.src = "assets/icons/play-button.png";
    trackElement.classList.remove("playing");
    if (timeSpan) timeSpan.textContent = "00:00";
    currentAudio = null;
    currentTrackElement = null;
  });
  audio.play().catch(() => {
    alert("Не удалось воспроизвести превью");
    if (playImg) playImg.src = "assets/icons/play-button.png";
    trackElement.classList.remove("playing");
    currentAudio = null;
    currentTrackElement = null;
  });
}

function backToAlbums() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
    if (currentTrackElement) currentTrackElement.classList.remove("playing");
  }
  if (tempAudio) {
    tempAudio.pause();
    tempAudio = null;
    tempCard = null;
  }
  albumsSection.style.display = "block";
  artistDetailSection.style.display = "none";
  refreshContent();
}

async function refreshContent() {
  cardsGrid.innerHTML = "";
  if (currentQuery.trim() === "") {
    sectionTitle.textContent = "Популярные альбомы";
    await loadPopularAlbums(true);
  } else {
    let title = "";
    if (currentSearchMode === "album") title = "Результаты поиска альбомов";
    else if (currentSearchMode === "artist")
      title = "Результаты поиска артистов";
    else title = "Результаты поиска треков";
    sectionTitle.textContent = title;
    await performSearch(currentQuery, true);
  }
}

async function performSearch(query, reset = true) {
  if (!query.trim()) return;
  if (reset) {
    currentOffset = 0;
    cardsGrid.innerHTML = "";
    hasMore = true;
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = "Загрузить ещё";
  }
  if (isLoading) return;
  isLoading = true;
  const limit = reset ? defaultLimit : loadMoreLimit;
  let url = "";
  if (currentSearchMode === "album") {
    url = `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=${limit}&index=${currentOffset}`;
  } else if (currentSearchMode === "artist") {
    url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=${limit}&index=${currentOffset}`;
  } else {
    url = `https://api.deezer.com/search/track?q=${encodeURIComponent(query)}&limit=${limit}&index=${currentOffset}`;
  }
  const data = await fetchDeezer(url);
  if (data && data.data) {
    const items = data.data;
    if (items.length === 0 && reset) {
      cardsGrid.innerHTML = "<p>Ничего не найдено</p>";
      hasMore = false;
      loadMoreBtn.disabled = true;
    } else {
      renderCards(items, currentSearchMode);
      currentOffset += items.length;
      if (items.length < limit) hasMore = false;
    }
  } else if (reset) {
    cardsGrid.innerHTML = "<p>Ошибка поиска</p>";
  }
  isLoading = false;
}

async function loadMore() {
  if (currentQuery.trim() === "") await loadPopularAlbums(false);
  else await performSearch(currentQuery, false);
}

function formatNumber(num) {
  if (!num) return "0";
  if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
  return num.toString();
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(
    /[&<>]/g,
    (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[m] || m,
  );
}

// Обработчик поиска (обновляет интерфейс и контент)
searchBtn.addEventListener("click", () => {
  const q = searchInput.value.trim();
  if (!q) return;
  // Останавливаем все плееры
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
    if (currentTrackElement) {
      currentTrackElement.classList.remove("playing");
      currentTrackElement = null;
    }
  }
  if (tempAudio) {
    tempAudio.pause();
    tempAudio = null;
    tempCard = null;
  }
  // Переключаемся на режим альбомов/поиска
  albumsSection.style.display = "block";
  artistDetailSection.style.display = "none";
  currentQuery = q;
  const selected = document.querySelector('input[name="searchType"]:checked');
  currentSearchMode = selected ? selected.value : "album";
  let title = "";
  if (currentSearchMode === "album") title = "Результаты поиска альбомов";
  else if (currentSearchMode === "artist") title = "Результаты поиска артистов";
  else title = "Результаты поиска треков";
  sectionTitle.textContent = title;
  // Сброс пагинации и загрузка
  currentOffset = 0;
  cardsGrid.innerHTML = "";
  hasMore = true;
  loadMoreBtn.disabled = false;
  loadMoreBtn.textContent = "Загрузить ещё";
  performSearch(currentQuery, true);
});

searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") searchBtn.click();
});
loadMoreBtn.addEventListener("click", loadMore);
backBtn.addEventListener("click", backToAlbums);
if (loadMoreTracksBtn)
  loadMoreTracksBtn.addEventListener("click", () => loadMoreTracks());

subscribeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("subEmail").value.trim();
  const regex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
  if (!regex.test(email)) {
    alert("Введите корректный email");
    return;
  }
  console.log("Подписка:", email);
  alert(`Спасибо, ${email}!`);
  subscribeForm.reset();
});

// Бургер-меню
// Бургер-меню (простое переключение класса active)
const burger = document.getElementById("burgerBtn");
const mobileMenu = document.getElementById("mobileMenu");
if (burger && mobileMenu) {
  // Открыть/закрыть при клике на бургер
  burger.addEventListener("click", (e) => {
    e.stopPropagation();
    mobileMenu.classList.toggle("active");
  });

  // Закрыть меню при клике на любую ссылку внутри меню
  const menuLinks = mobileMenu.querySelectorAll("a");
  menuLinks.forEach((link) => {
    link.addEventListener("click", () => {
      mobileMenu.classList.remove("active");
    });
  });

  // Закрыть меню при клике вне его области
  document.addEventListener("click", (e) => {
    if (
      mobileMenu.classList.contains("active") &&
      !mobileMenu.contains(e.target) &&
      !burger.contains(e.target)
    ) {
      mobileMenu.classList.remove("active");
    }
  });
}

// Запуск
loadPopularAlbums(true);
