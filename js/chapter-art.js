// =========================================================
// CHAPTER ART — ilustrasi sketsa bawaan, dipakai di homepage
// dan halaman chapter kalau chapter belum punya "gambar" sampul.
// =========================================================

export function defaultChapterArt(idx) {
  const motifs = [artCompass, artMountain, artWave];
  return motifs[idx % motifs.length]();
}

function artCompass() {
  return `<svg viewBox="0 0 300 220" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(190,110)" fill="none" stroke="var(--terracotta-dim)" stroke-width="1.4" opacity="0.6">
      <circle r="78" />
      <circle r="58" />
      <g stroke-width="1.1">
        <path d="M0 -78 L0 78 M-78 0 L78 0 M-55 -55 L55 55 M-55 55 L55 -55"/>
      </g>
      <path d="M0 -58 L10 0 L0 58 L-10 0 Z" fill="var(--terracotta-dim)" opacity="0.5" stroke="none"/>
      <circle r="5" fill="var(--ink-soft)" stroke="none"/>
    </g>
  </svg>`;
}

function artMountain() {
  return `<svg viewBox="0 0 300 220" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="var(--sage)" stroke-width="1.4" opacity="0.55">
      <path d="M40 170 L120 70 L150 110 L190 50 L260 170 Z"/>
      <path d="M70 170 L120 100 L150 130 L210 70 L260 170 Z" opacity="0.6"/>
      <line x1="20" y1="172" x2="280" y2="172"/>
      <circle cx="225" cy="55" r="16"/>
    </g>
  </svg>`;
}

function artWave() {
  return `<svg viewBox="0 0 300 220" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="var(--terracotta-dim)" stroke-width="1.4" opacity="0.55">
      <path d="M20 90 Q70 50 120 90 T220 90 T300 90"/>
      <path d="M20 120 Q70 80 120 120 T220 120 T300 120" opacity="0.7"/>
      <path d="M20 150 Q70 110 120 150 T220 150 T300 150" opacity="0.45"/>
    </g>
  </svg>`;
}
