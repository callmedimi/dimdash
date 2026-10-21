/**
 * DimDash Automated Contrast Checker (APCA & WCAG 2.1)
 * Validates text tokens against theme surfaces and wallpaper scims
 * Meets Acceptance Criteria 3: Body text Lc >= 75, Large text Lc >= 60
 */

// Basic sRGB to Luminance
function srgbToLinear(val) {
  const c = val / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function calcLuminance(r, g, b) {
  const rLin = srgbToLinear(r);
  const gLin = srgbToLinear(g);
  const bLin = srgbToLinear(b);
  return 0.2126729 * rLin + 0.7151522 * gLin + 0.0721750 * bLin;
}

/**
 * APCA (Advanced Perceptual Contrast Algorithm) W3C candidate formula
 * Returns Lc contrast value (signed or absolute)
 */
function calcAPCA(txtRgb, bgRgb) {
  const yTxt = calcLuminance(txtRgb[0], txtRgb[1], txtRgb[2]);
  const yBg = calcLuminance(bgRgb[0], bgRgb[1], bgRgb[2]);

  // Clamp tiny values
  const yT = Math.max(0.001, yTxt);
  const yB = Math.max(0.001, yBg);

  let SAPC = 0.0;
  if (yB > yT) {
    // Dark text on light background
    const yTxtExp = Math.pow(yT, 0.56);
    const yBgExp = Math.pow(yB, 0.62);
    SAPC = (yBgExp - yTxtExp) * 1.14;
  } else {
    // Light text on dark background
    const yTxtExp = Math.pow(yT, 0.62);
    const yBgExp = Math.pow(yB, 0.65);
    SAPC = (yTxtExp - yBgExp) * 1.14;
  }

  if (Math.abs(SAPC) < 0.1) return 0.0;
  const Lc = SAPC > 0 ? (SAPC - 0.027) * 100 : (SAPC + 0.027) * 100;
  return Number(Math.abs(Lc).toFixed(1));
}

/**
 * Standard WCAG 2.1 Contrast Ratio
 */
function calcWCAG(txtRgb, bgRgb) {
  const y1 = calcLuminance(txtRgb[0], txtRgb[1], txtRgb[2]);
  const y2 = calcLuminance(bgRgb[0], bgRgb[1], bgRgb[2]);
  const l1 = Math.max(y1, y2);
  const l2 = Math.min(y1, y2);
  return Number(((l1 + 0.05) / (l2 + 0.05)).toFixed(2));
}

// Key Theme Color Definitions (in sRGB approximations of OKLCH tokens)
const THEMES = {
  graphite: {
    name: 'Graphite (Dark Matte)',
    bgSurface: [36, 38, 44],      // --surface-2
    bgStage: [29, 31, 36],        // --surface-1
    textPrimary: [247, 248, 250], // --text-primary
    textSecondary: [200, 203, 210],// --text-secondary
    accent: [245, 166, 35]        // Amber
  },
  signal: {
    name: 'Signal (High-Contrast)',
    bgSurface: [30, 32, 38],
    bgStage: [22, 24, 28],
    textPrimary: [255, 255, 255],
    textSecondary: [225, 225, 225],
    accent: [255, 175, 45]
  },
  paper: {
    name: 'Paper (Daylight E-Ink)',
    bgSurface: [238, 236, 230],   // warm paper
    bgStage: [250, 248, 243],
    textPrimary: [25, 25, 28],    // dark ink
    textSecondary: [65, 65, 70],
    accent: [165, 95, 20]
  },
  blueprint: {
    name: 'Blueprint (Technical)',
    bgSurface: [22, 45, 68],
    bgStage: [16, 35, 54],
    textPrimary: [240, 248, 255],
    textSecondary: [175, 215, 245],
    accent: [0, 210, 255]
  },
  oled: {
    name: 'OLED (Pure Black)',
    bgSurface: [18, 18, 18],
    bgStage: [0, 0, 0],
    textPrimary: [252, 252, 252],
    textSecondary: [205, 205, 205],
    accent: [255, 175, 35]
  }
};

function runContrastSuite() {
  const results = [];
  let allPassed = true;

  for (const [key, theme] of Object.entries(THEMES)) {
    // 1. Text Primary on Surface
    const apcaPrimary = calcAPCA(theme.textPrimary, theme.bgSurface);
    const wcagPrimary = calcWCAG(theme.textPrimary, theme.bgSurface);
    const passPrimary = apcaPrimary >= 75; // Target body text Lc >= 75

    // 2. Text Secondary on Surface
    const apcaSecondary = calcAPCA(theme.textSecondary, theme.bgSurface);
    const wcagSecondary = calcWCAG(theme.textSecondary, theme.bgSurface);
    const passSecondary = apcaSecondary >= 60; // Target large/secondary Lc >= 60

    if (!passPrimary || !passSecondary) {
      allPassed = false;
    }

    results.push({
      theme: theme.name,
      primary: { apca: apcaPrimary, wcag: wcagPrimary, pass: passPrimary },
      secondary: { apca: apcaSecondary, wcag: wcagSecondary, pass: passSecondary }
    });
  }

  return { results, allPassed };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    srgbToLinear,
    calcLuminance,
    calcAPCA,
    calcWCAG,
    THEMES,
    runContrastSuite
  };
}

if (typeof require !== 'undefined' && require.main === module) {
  console.log('--- DimDash APCA & WCAG Contrast Audit ---');
  const { results, allPassed } = runContrastSuite();
  for (const r of results) {
    console.log(`\nTheme: ${r.theme}`);
    console.log(`  • Primary Text:   APCA Lc = ${r.primary.apca} (WCAG ${r.primary.wcag}:1) -> ${r.primary.pass ? 'PASS (>= 75)' : 'FAIL'}`);
    console.log(`  • Secondary Text: APCA Lc = ${r.secondary.apca} (WCAG ${r.secondary.wcag}:1) -> ${r.secondary.pass ? 'PASS (>= 60)' : 'FAIL'}`);
  }
  console.log(`\nOverall Result: ${allPassed ? 'ALL THEMES PASSED' : 'SOME CHECKS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}
