export interface SvgWallpaperPresetInput {
  id: string;
  name: string;
  svg: string;
}

export const SVG_WALLPAPER_PRESET_INPUTS: readonly SvgWallpaperPresetInput[] = [
  {
    id: 'crimson-wave',
    name: 'Crimson Wave',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#7f1d1d" />
            <stop offset="0.5" stop-color="#dc2626" />
            <stop offset="1" stop-color="#fca5a5" />
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />
        <path
          d="M0 320C120 280 240 260 360 280C480 300 600 360 800 340V600H0Z"
          fill="#0f172a" opacity="0.2"
        />
        <path
          d="M0 180C160 140 320 140 480 180C640 220 720 280 800 260V0H0Z"
          fill="#fef2f2" opacity="0.15"
        />
        
      </svg>
    `,
  },
  {
    id: 'forest-glow',
    name: 'Forest Glow',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <defs>
          <radialGradient id="bg" cx="0.3" cy="0.7" r="0.9">
            <stop offset="0" stop-color="#4ade80" />
            <stop offset="0.5" stop-color="#166534" />
            <stop offset="1" stop-color="#052e16" />
          </radialGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />
        
        <path
          d="M0 480C140 440 280 440 400 470C520 500 680 560 800 540V600H0Z"
          fill="#0f172a" opacity="0.25"
        />
        
      </svg>
    `,
  },
  {
    id: 'violet-dune',
    name: 'Violet Dune',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#1e1b4b" />
            <stop offset="0.5" stop-color="#6366f1" />
            <stop offset="1" stop-color="#f472b6" />
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />
        <path
          d="M0 380C140 320 260 300 360 320C470 346 560 420 800 420V600H0Z"
          fill="#f8fafc" opacity="0.15"
        />
        <path
          d="M0 250C120 190 230 190 330 220C450 258 580 330 800 300V0H0Z"
          fill="#0f172a" opacity="0.2"
        />
        <circle cx="140" cy="160" r="90" fill="#fde68a" opacity="0.2" />
        <circle cx="640" cy="480" r="140" fill="#22d3ee" opacity="0.2" />
      </svg>
    `,
  },
  {
    id: 'ocean-depth',
    name: 'Ocean Depth',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#0c4a6e" />
            <stop offset="0.5" stop-color="#0369a1" />
            <stop offset="1" stop-color="#0ea5e9" />
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />
        <path
          d="M0 200C100 180 200 200 300 220C400 240 500 200 600 180C700 160 800 180 800 180V0H0Z"
          fill="#bae6fd" opacity="0.2"
        />
        
        <path
          d="M60 120C160 100 260 120 360 140"
          stroke="#f8fafc" stroke-width="4" opacity="0.4" fill="none"
        />
      </svg>
    `,
  },
  {
    id: 'rose-garden',
    name: 'Rose Garden',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <defs>
          <radialGradient id="bg" cx="0.5" cy="0.3" r="0.8">
            <stop offset="0" stop-color="#fdf2f8" />
            <stop offset="0.5" stop-color="#f472b6" />
            <stop offset="1" stop-color="#831843" />
          </radialGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />
        
        <path
          d="M0 500C160 460 320 460 480 490C640 520 720 580 800 560V600H0Z"
          fill="#0f172a" opacity="0.15"
        />
      </svg>
    `,
  },
  {
    id: 'amber-ridge',
    name: 'Amber Ridge',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <defs>
          <linearGradient id="bg" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stop-color="#0f172a" />
            <stop offset="0.6" stop-color="#ea580c" />
            <stop offset="1" stop-color="#fde68a" />
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />
        <path
          d="M0 420C150 360 260 350 360 370C480 394 590 460 800 460V600H0Z"
          fill="#0f172a" opacity="0.35"
        />
        <path
          d="M0 300C120 260 230 250 330 270C450 300 560 340 800 330"
          stroke="#f8fafc" stroke-width="8" opacity="0.4" fill="none"
        />
        <path
          d="M0 220C140 200 260 210 360 230C470 250 600 270 800 240"
          stroke="#fde68a" stroke-width="6" opacity="0.45" fill="none"
        />
        
      </svg>
    `,
  },
  {
    id: 'mint-frost',
    name: 'Mint Frost',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#f0fdfa" />
            <stop offset="0.5" stop-color="#5eead4" />
            <stop offset="1" stop-color="#0f766e" />
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />
        
        <path
          d="M640 80C680 120 700 180 680 240"
          stroke="#0f172a" stroke-width="6" opacity="0.15" fill="none"
        />
      </svg>
    `,
  },
  {
    id: 'electric-kite',
    name: 'Electric Kite',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#0f172a" />
            <stop offset="0.5" stop-color="#2563eb" />
            <stop offset="1" stop-color="#22d3ee" />
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />
        
        <path
          d="M80 520C180 470 280 470 380 500C480 530 600 590 760 560"
          stroke="#f8fafc" stroke-width="6" opacity="0.4" fill="none"
        />
      </svg>
    `,
  },
  {
    id: 'slate-minimal',
    name: 'Slate Minimal',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#f8fafc" />
            <stop offset="0.5" stop-color="#94a3b8" />
            <stop offset="1" stop-color="#1e293b" />
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />
        
        <path
          d="M0 480C200 440 400 440 600 470C700 490 800 520 800 520V600H0Z"
          fill="#0f172a" opacity="0.15"
        />
      </svg>
    `,
  },
  {
    id: 'nebula-threads',
    name: 'Nebula Threads',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <defs>
          <radialGradient id="bg" cx="0.2" cy="0.8" r="1">
            <stop offset="0" stop-color="#1d4ed8" />
            <stop offset="0.6" stop-color="#0f172a" />
            <stop offset="1" stop-color="#020617" />
          </radialGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />
        <path
          d="M40 140C140 120 240 140 320 180C400 220 470 300 560 320C660 340 730 300 780 240"
          stroke="#f472b6" stroke-width="6" opacity="0.5" fill="none"
        />
        <path
          d="M20 260C140 240 260 260 350 300C450 344 540 420 660 440C720 450 760 440 790 430"
          stroke="#22d3ee" stroke-width="7" opacity="0.45" fill="none"
        />
        <path
          d="M60 360C180 320 300 330 420 380C520 420 620 500 760 520"
          stroke="#a78bfa" stroke-width="6" opacity="0.4" fill="none"
        />
        
      </svg>
    `,
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <defs>
          <linearGradient id="bg" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stop-color="#1c1917" />
            <stop offset="0.4" stop-color="#b45309" />
            <stop offset="0.7" stop-color="#fbbf24" />
            <stop offset="1" stop-color="#fef3c7" />
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />
        
        <path
          d="M0 400C160 360 320 360 480 390C640 420 720 480 800 460V600H0Z"
          fill="#0f172a" opacity="0.3"
        />
        <path
          d="M0 320C140 300 280 300 400 320C520 340 680 380 800 360"
          stroke="#fde68a" stroke-width="4" opacity="0.5" fill="none"
        />
      </svg>
    `,
  },
  {
    id: 'lavender-mist',
    name: 'Lavender Mist',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <defs>
          <radialGradient id="bg" cx="0.7" cy="0.3" r="0.9">
            <stop offset="0" stop-color="#f5f3ff" />
            <stop offset="0.5" stop-color="#c4b5fd" />
            <stop offset="1" stop-color="#4c1d95" />
          </radialGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />
        
        <path
          d="M80 120C180 100 280 120 380 140"
          stroke="#f8fafc" stroke-width="4" opacity="0.4" fill="none"
        />
      </svg>
    `,
  },
  {
    id: 'terra-mosaic',
    name: 'Terra Mosaic',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#fef3c7" />
            <stop offset="0.5" stop-color="#fb923c" />
            <stop offset="1" stop-color="#1f2937" />
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />
        
      </svg>
    `,
  },
  {
    id: 'arctic-aurora',
    name: 'Arctic Aurora',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#0f172a" />
            <stop offset="0.5" stop-color="#1e3a5f" />
            <stop offset="1" stop-color="#0c4a6e" />
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />
        <path
          d="M0 200C100 160 200 180 300 200C400 220 500 180 600 160C700 140 800 180 800 180"
          stroke="#4ade80" stroke-width="20" opacity="0.4" fill="none"
        />
        <path
          d="M0 260C120 220 240 240 360 260C480 280 600 240 800 220"
          stroke="#22d3ee" stroke-width="16" opacity="0.35" fill="none"
        />
        <path
          d="M0 320C140 280 280 300 420 320C560 340 700 300 800 280"
          stroke="#a78bfa" stroke-width="12" opacity="0.3" fill="none"
        />
        
      </svg>
    `,
  },
];
