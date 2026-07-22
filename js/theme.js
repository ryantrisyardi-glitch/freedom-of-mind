// =========================================================
// THEME SWITCHER — ganti palet warna situs, tersimpan HANYA
// di localStorage browser pembaca (tidak dikirim ke server / Firestore).
// =========================================================

const STORAGE_KEY = "fom-theme";

// Setiap tema hanya berupa daftar CSS variable yang di-override.
// Variable yang tidak disebut otomatis memakai nilai default di :root (css/style.css).
export const THEMES = [
  {
    id: "terracotta",
    name: "Terracotta & Sage",
    desc: "Tema bawaan — krem hangat, terracotta, sage",
    swatch: ["#FAF7F0", "#C8763A", "#7A8B7F"],
    vars: null, // null = pakai default :root, tidak perlu override apa pun
  },
  {
    id: "sepia",
    name: "Kertas Tua",
    desc: "Sepia vintage, serasa buku lama",
    swatch: ["#F1E6D2", "#8A5A2B", "#6B6152"],
    vars: {
      "--paper": "#F3E9D6",
      "--paper-dim": "#E9DCC1",
      "--paper-card": "#FBF3E3",
      "--ink": "#3A2E1F",
      "--ink-soft": "#6B5D48",
      "--terracotta": "#8A5A2B",
      "--terracotta-dim": "#C79A5F",
      "--sticky": "#E4C878",
      "--sage": "#7C7147",
      "--line": "#D8C6A2",
      "--highlight": "#EBD48A",
      "--shadow": "rgba(58, 46, 31, 0.16)",
      "--danger": "#A5432E",
    },
  },
  {
    id: "night",
    name: "Malam Tenang",
    desc: "Gelap dan nyaman untuk membaca malam hari",
    swatch: ["#20211F", "#E3A876", "#8FA593"],
    vars: {
      "--paper": "#1C1D1B",
      "--paper-dim": "#242522",
      "--paper-card": "#26271F",
      "--ink": "#EDE7DC",
      "--ink-soft": "#B8B1A3",
      "--terracotta": "#E3A876",
      "--terracotta-dim": "#B87B45",
      "--sticky": "#7A6A38",
      "--sage": "#8FA593",
      "--line": "#3A3B36",
      "--highlight": "#6B5D2C",
      "--shadow": "rgba(0, 0, 0, 0.45)",
      "--danger": "#D9695A",
    },
  },
  {
    id: "forest",
    name: "Hutan Zamrud",
    desc: "Hijau tua tenang dengan aksen emas",
    swatch: ["#F1F4EE", "#B08A3C", "#3F6650"],
    vars: {
      "--paper": "#F3F6EF",
      "--paper-dim": "#E8EDE1",
      "--paper-card": "#FBFDF8",
      "--ink": "#22301F",
      "--ink-soft": "#4E5C46",
      "--terracotta": "#B08A3C",
      "--terracotta-dim": "#D2B876",
      "--sticky": "#DCCB7A",
      "--sage": "#3F6650",
      "--line": "#CEDAC2",
      "--highlight": "#E3D98A",
      "--shadow": "rgba(34, 48, 31, 0.16)",
      "--danger": "#B5483B",
    },
  },
  {
    id: "dusk",
    name: "Lavender Senja",
    desc: "Ungu-merah muda lembut, suasana senja reflektif",
    swatch: ["#F6F1F6", "#9C5A88", "#7C7396"],
    vars: {
      "--paper": "#F7F2F6",
      "--paper-dim": "#EEE3EC",
      "--paper-card": "#FDF9FC",
      "--ink": "#332B36",
      "--ink-soft": "#665A6B",
      "--terracotta": "#9C5A88",
      "--terracotta-dim": "#C393B4",
      "--sticky": "#E8C9E0",
      "--sage": "#7C7396",
      "--line": "#DFD0DC",
      "--highlight": "#E6D3EC",
      "--shadow": "rgba(51, 43, 54, 0.16)",
      "--danger": "#B5483B",
    },
  },
];

function getStoredThemeId() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "terracotta";
  } catch {
    return "terracotta";
  }
}

function storeThemeId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage tidak tersedia (mode privat dsb) — tema tetap berlaku
    // untuk sesi ini saja, tidak masalah.
  }
}

export function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  const root = document.documentElement;

  // Bersihkan override sebelumnya.
  THEMES.forEach((t) => {
    if (!t.vars) return;
    Object.keys(t.vars).forEach((k) => root.style.removeProperty(k));
  });

  if (theme.vars) {
    Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));
  }
  root.setAttribute("data-theme", theme.id);
  return theme;
}

// Terapkan tema tersimpan sesegera mungkin (dipanggil terpisah dari initThemeSwitcher
// supaya bisa dijalankan sebelum paint pertama dan mencegah "flash" warna default).
export function applyStoredTheme() {
  return applyTheme(getStoredThemeId());
}

function buildSwitcherMarkup(activeId) {
  return `
    <button type="button" class="theme-switcher__btn" id="themeSwitcherBtn" title="Ganti tema tampilan" aria-haspopup="true" aria-expanded="false">
      <span class="theme-switcher__icon">🎨</span>
    </button>
    <div class="theme-switcher__panel" id="themeSwitcherPanel" hidden>
      <div class="theme-switcher__panel-title">Tema tampilan</div>
      <div class="theme-switcher__list">
        ${THEMES.map((t) => `
          <button type="button" class="theme-option ${t.id === activeId ? "is-active" : ""}" data-theme-id="${t.id}" title="${t.desc}">
            <span class="theme-option__swatch">
              <span style="background:${t.swatch[0]}"></span><span style="background:${t.swatch[1]}"></span><span style="background:${t.swatch[2]}"></span>
            </span>
            <span class="theme-option__text">
              <span class="theme-option__name">${t.name}</span>
              <span class="theme-option__desc">${t.desc}</span>
            </span>
            ${t.id === activeId ? `<span class="theme-option__check">✓</span>` : ""}
          </button>
        `).join("")}
      </div>
      <div class="theme-switcher__note">Pilihan ini hanya disimpan di browser ini.</div>
    </div>
  `;
}

/**
 * Memasang tombol pemilih tema ke dalam topnav.
 * Aman dipanggil berkali-kali (mis. tiap renderTopnav) — akan reuse elemen yang ada.
 */
export function initThemeSwitcher() {
  const inner = document.querySelector(".topnav__inner");
  if (!inner) return;

  let mount = document.getElementById("themeSwitcherMount");
  if (!mount) {
    mount = document.createElement("div");
    mount.className = "theme-switcher";
    mount.id = "themeSwitcherMount";
    const actions = document.getElementById("topnavActions");
    inner.insertBefore(mount, actions || null);
  }

  const activeId = document.documentElement.getAttribute("data-theme") || getStoredThemeId();
  mount.innerHTML = buildSwitcherMarkup(activeId);

  const btn = document.getElementById("themeSwitcherBtn");
  const panel = document.getElementById("themeSwitcherPanel");

  const closePanel = () => {
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  };
  const togglePanel = () => {
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    btn.setAttribute("aria-expanded", String(willOpen));
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePanel();
  });
  panel.querySelectorAll(".theme-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      const id = opt.dataset.themeId;
      applyTheme(id);
      storeThemeId(id);
      initThemeSwitcher(); // re-render supaya centang/aktif pindah
      closePanel();
    });
  });
  document.addEventListener("click", (e) => {
    if (!mount.contains(e.target)) closePanel();
  }, { once: false });
}
