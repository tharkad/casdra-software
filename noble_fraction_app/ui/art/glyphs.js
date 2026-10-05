// Noble Fraction -- original flat line-art glyphs.
// Each value is INNER SVG markup for a 100x100 viewBox. Colours: stroke is
// currentColor; fills are none / currentColor / class "a" (accent) / class "b" (soft).

const f = (n) => Math.round(n * 10) / 10;
const G = (s) =>
  `<g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${s}</g>`;

// n-point star polygon points string
const star = (cx, cy, R, r, n = 5, a0 = -90) => {
  const p = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((a0 + (i * 180) / n) * Math.PI) / 180;
    const rad = i % 2 ? r : R;
    p.push(`${f(cx + rad * Math.cos(a))},${f(cy + rad * Math.sin(a))}`);
  }
  return p.join(' ');
};
// radiating rays as a path "d"
const rays = (cx, cy, r1, r2, n, a0 = -90) => {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = ((a0 + (i * 360) / n) * Math.PI) / 180;
    d += `M${f(cx + r1 * Math.cos(a))} ${f(cy + r1 * Math.sin(a))}L${f(cx + r2 * Math.cos(a))} ${f(cy + r2 * Math.sin(a))}`;
  }
  return d;
};
// repeat markup n times rotated around (cx,cy)
const spin = (n, cx, cy, s, a0 = 0) =>
  Array.from({ length: n }, (_, i) => `<g transform="rotate(${f(a0 + (i * 360) / n)} ${cx} ${cy})">${s}</g>`).join('');
// place markup at n points on a ring
const ring = (cx, cy, r, n, a0, fn) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((a0 + (i * 360) / n) * Math.PI) / 180;
    return fn(f(cx + r * Math.cos(a)), f(cy + r * Math.sin(a)));
  }).join('');

// open-end spanner, vertical, centred on x=50, spans y=10..90
const WRENCH =
  'M42 90 Q38 90 38 84 V48 Q30 44 30 30 Q30 18 38 12 L44 22 Q46 28 50 28 Q54 28 56 22 L62 12 Q70 18 70 30 Q70 44 62 48 V84 Q62 90 58 90 Z';

export const GLYPHS = {
  // ---------------------------------------------------------------- starters / upgrades
  intake_fan: G(
    `<circle cx="50" cy="50" r="40"/>` +
      spin(4, 50, 50, `<path class="b" d="M50 43 C40 32 42 17 56 14 C62 28 60 39 50 43Z"/>`) +
      `<circle class="a" cx="50" cy="50" r="7"/>`
  ),

  return_loop: G(
    `<path d="M10 28 H58 A23 23 0 0 1 58 74 H34"/>` +
      `<path d="M10 18 V38"/>` +
      `<polygon class="a" points="36,60 14,74 36,88"/>` +
      `<circle class="b" cx="52" cy="51" r="8"/>`
  ),

  floor_broker: G(
    `<path class="b" d="M10 90 C10 66 22 54 36 54 C50 54 62 66 62 90 Z"/>` +
      `<circle class="a" cx="36" cy="30" r="14"/>` +
      `<rect class="a" x="58" y="40" width="32" height="28" rx="4"/>` +
      `<polyline points="65,60 73,51 78,56 85,47"/>`
  ),

  cold_turbine: G(
    `<circle cx="42" cy="58" r="31"/>` +
      spin(6, 42, 58, `<path class="b" d="M42 50 Q54 42 50 30 Q42 38 42 50Z"/>`) +
      `<circle class="a" cx="42" cy="58" r="7"/>` +
      `<g transform="translate(79 21)"><path d="M0 -12 V12" /><g transform="rotate(60)"><path d="M0 -12 V12"/></g><g transform="rotate(120)"><path d="M0 -12 V12"/></g></g>`
  ),

  gas_reclaimer: G(
    `<rect x="42" y="8" width="16" height="12" rx="3"/>` +
      `<rect class="b" x="24" y="18" width="52" height="72" rx="16"/>` +
      `<path d="M57 46 A15 15 0 1 0 61 66"/>` +
      `<polygon class="a" points="67,57 66,72 53,63"/>`
  ),

  packed_tower: G(
    `<rect class="b" x="32" y="8" width="36" height="84" rx="12"/>` +
      `<path d="M32 28 H68 M32 50 H68 M32 72 H68"/>` +
      `<circle cx="42" cy="39" r="2" fill="currentColor"/><circle cx="58" cy="39" r="2" fill="currentColor"/>` +
      `<circle cx="50" cy="61" r="2" fill="currentColor"/><circle cx="42" cy="82" r="2" fill="currentColor"/><circle cx="58" cy="82" r="2" fill="currentColor"/>` +
      `<path d="M68 20 H88 M12 80 H32"/>`
  ),

  sampling_port: G(
    `<rect class="b" x="8" y="62" width="84" height="24" rx="4"/>` +
      `<path d="M30 62 V50"/><path d="M20 62 V86 M80 62 V86"/>` +
      `<circle class="a" cx="30" cy="36" r="14"/>` +
      `<path d="M30 36 L37 29"/>` +
      `<circle cx="68" cy="32" r="13"/>` +
      `<path d="M77 41 L88 52"/>`
  ),

  desiccant_bed: G(
    `<rect x="44" y="6" width="12" height="12" rx="2"/>` +
      `<rect class="b" x="20" y="16" width="60" height="74" rx="14"/>` +
      `<path d="M20 36 H80"/>` +
      [[34, 50], [50, 50], [66, 50], [42, 64], [58, 64], [34, 78], [50, 78], [66, 78]]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="currentColor"/>`)
        .join('')
  ),

  molecular_sieve: G(
    [[26, 14], [50, 14], [74, 14], [38, 27], [62, 27]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="currentColor"/>`)
      .join('') +
      `<path d="M26 14 L38 27 L50 14 L62 27 L74 14"/>` +
      `<polygon class="b" points="14,42 86,42 58,68 58,90 42,90 42,68"/>` +
      `<path d="M30 50 H70"/>`
  ),

  spotless_audit: G(
    `<rect class="b" x="10" y="14" width="52" height="76" rx="8"/>` +
      `<rect class="a" x="24" y="8" width="24" height="14" rx="5"/>` +
      `<polyline points="22,58 32,69 50,44"/>` +
      `<path class="a" d="M78 12 Q78 26 92 26 Q78 26 78 40 Q78 26 64 26 Q78 26 78 12Z"/>`
  ),

  flow_regulator: G(
    `<rect class="b" x="8" y="52" width="26" height="22" rx="3"/>` +
      `<rect class="b" x="66" y="52" width="26" height="22" rx="3"/>` +
      `<polygon class="a" points="34,48 34,78 66,48 66,78"/>` +
      `<path d="M50 63 V26"/>` +
      `<ellipse class="b" cx="50" cy="20" rx="20" ry="7"/>` +
      `<path d="M26 88 H70"/><polyline points="62,82 70,88 62,94"/>`
  ),

  shift_engineer: G(
    `<path class="a" d="M16 66 C16 36 32 22 50 22 C68 22 84 36 84 66 Z"/>` +
      `<path class="b" d="M42 66 V28 Q42 20 50 20 Q58 20 58 28 V66"/>` +
      `<rect class="b" x="8" y="66" width="84" height="15" rx="7.5"/>`
  ),

  freelance_fitter: G(
    `<g transform="rotate(45 50 50)">` +
      `<rect class="b" x="42" y="12" width="16" height="76" rx="3"/>` +
      `<rect class="b" x="34" y="38" width="32" height="24" rx="4"/>` +
      `<path d="M42 28 H58 M42 72 H58"/></g>` +
      `<g transform="rotate(-45 50 50)"><path class="a" d="${WRENCH}"/></g>`
  ),

  procurement_agent: G(
    `<rect class="b" x="10" y="62" width="38" height="28" rx="4"/>` +
      `<rect class="b" x="52" y="62" width="38" height="28" rx="4"/>` +
      `<rect class="a" x="26" y="32" width="38" height="28" rx="4"/>` +
      `<path d="M18 76 H40 M60 76 H82 M34 46 H56"/>` +
      `<polygon class="a" points="70,8 90,8 90,24 80,32 70,24"/>` +
      `<circle cx="80" cy="15" r="2" fill="currentColor"/>`
  ),

  reserve_fund: G(
    `<rect class="b" x="18" y="74" width="64" height="16" rx="8"/>` +
      `<rect class="b" x="18" y="58" width="64" height="16" rx="8"/>` +
      `<rect class="b" x="18" y="42" width="64" height="16" rx="8"/>` +
      `<polygon class="a" points="${star(50, 24, 19, 9)}"/>`
  ),

  cryo_chiller: G(
    `<g transform="translate(50 34)">` +
      spin(3, 0, 0, `<path d="M0 -26 V26 M-7 -18 L0 -11 L7 -18 M-7 18 L0 11 L7 18"/>`) +
      `</g>` +
      `<circle class="a" cx="50" cy="34" r="5"/>` +
      `<path d="M10 82 q10 -22 20 0 t20 0 t20 0 t20 0"/>`
  ),

  heat_exchanger: G(
    `<rect class="b" x="30" y="12" width="40" height="76" rx="8"/>` +
      `<path d="M38 28 H62 A8 8 0 0 1 62 44 H38 A8 8 0 0 0 38 60 H62 A8 8 0 0 1 62 76 H38"/>` +
      `<path d="M8 28 H24"/><polygon class="a" points="22,20 34,28 22,36"/>` +
      `<path d="M76 76 H86"/><polygon class="b" points="84,68 96,76 84,84" transform="translate(-4 0)"/>`
  ),

  sales_director: G(
    `<rect class="b" x="10" y="62" width="26" height="26" rx="3"/>` +
      `<rect class="a" x="37" y="50" width="26" height="38" rx="3"/>` +
      `<rect class="b" x="64" y="70" width="26" height="18" rx="3"/>` +
      `<polyline points="12,44 32,30 44,38 82,12"/>` +
      `<polyline points="68,12 82,12 82,26"/>`
  ),

  deal_maker: G(
    `<circle cx="38" cy="50" r="24"/><circle cx="62" cy="50" r="24"/>` +
      `<path class="a" d="M50 29.2 A24 24 0 0 1 50 70.8 A24 24 0 0 1 50 29.2Z"/>` +
      `<circle cx="38" cy="50" r="3" fill="currentColor"/><circle cx="62" cy="50" r="3" fill="currentColor"/>`
  ),

  account_manager: G(
    `<path d="M36 32 V24 Q36 18 42 18 H58 Q64 18 64 24 V32"/>` +
      `<rect class="b" x="10" y="32" width="80" height="54" rx="10"/>` +
      `<path d="M10 58 H90"/>` +
      `<polygon class="a" points="${star(50, 58, 15, 7)}"/>`
  ),

  // ---------------------------------------------------------------- contracts
  surgical_lights: G(
    `<path d="M14 90 V56 Q14 42 30 38"/>` +
      `<path d="M6 90 H26"/>` +
      `<circle class="b" cx="60" cy="34" r="26"/>` +
      ring(60, 34, 14, 6, -90, (x, y) => `<circle class="a" cx="${x}" cy="${y}" r="3.5"/>`) +
      `<circle class="a" cx="60" cy="34" r="4.5"/>` +
      `<path d="M44 70 L40 84 M60 72 V88 M76 70 L80 84"/>`
  ),

  lung_imaging: G(
    `<path class="b" d="M44 24 C34 22 14 48 14 70 C14 80 22 84 30 80 C40 76 44 66 44 54 Z"/>` +
      `<g transform="translate(100 0) scale(-1 1)"><path class="b" d="M44 24 C34 22 14 48 14 70 C14 80 22 84 30 80 C40 76 44 66 44 54 Z"/></g>` +
      `<path d="M50 8 V34 M50 34 L40 48 M50 34 L60 48"/>` +
      `<ellipse cx="50" cy="64" rx="40" ry="10"/>`
  ),

  eye_laser: G(
    `<path class="b" d="M8 62 Q50 22 92 62 Q50 102 8 62Z"/>` +
      `<circle class="a" cx="50" cy="62" r="15"/>` +
      `<circle cx="50" cy="62" r="5" fill="currentColor"/>` +
      `<path d="M16 14 L40 50"/>` +
      `<circle class="a" cx="14" cy="12" r="6"/>`
  ),

  isotope_gas: G(
    `<path class="b" d="M50 8 C50 8 20 44 20 62 A30 30 0 0 0 80 62 C80 44 50 8 50 8Z"/>` +
      `<circle cx="50" cy="63" r="17"/>` +
      ring(50, 63, 8, 3, -90, (x, y) => `<circle class="a" cx="${x}" cy="${y}" r="3"/>`)
  ),

  uv_sterilizer: G(
    `<path d="${rays(50, 36, 18, 30, 8)}"/>` +
      `<circle class="a" cx="50" cy="36" r="10"/>` +
      `<rect class="b" x="18" y="68" width="64" height="22" rx="6"/>` +
      `<path d="M30 79 H70"/>`
  ),

  anesthesia_unit: G(
    `<path class="b" d="M10 28 Q30 14 50 28 L44 62 Q30 74 16 62 Z"/>` +
      `<circle class="a" cx="30" cy="42" r="6"/>` +
      `<path d="M50 42 H66 Q76 42 76 52 V58"/>` +
      `<ellipse class="a" cx="76" cy="75" rx="14" ry="16"/>`
  ),

  stage_spotlight: G(
    `<polygon class="a" points="49,35 90,48 66,82 40,49"/>` +
      `<g transform="rotate(35 28 30)">` +
      `<rect class="b" x="8" y="18" width="38" height="24" rx="5"/>` +
      `<rect x="44" y="14" width="8" height="32" rx="3" fill="currentColor"/></g>` +
      `<path d="M28 30 L20 12 M10 12 H32"/>`
  ),

  gaming_display: G(
    `<rect class="b" x="8" y="14" width="84" height="54" rx="6"/>` +
      `<path d="M50 68 V82 M32 84 H68"/>` +
      `<ellipse cx="50" cy="55" rx="14" ry="4" fill="currentColor"/>` +
      `<path d="M50 52 V36"/>` +
      `<circle class="a" cx="50" cy="31" r="7"/>`
  ),

  sun_simulator: G(
    `<path d="${rays(50, 30, 17, 24, 8)}"/>` +
      `<circle class="a" cx="50" cy="30" r="11"/>` +
      `<polygon class="b" points="22,62 78,62 92,90 8,90"/>` +
      `<path d="M36 62 L30 90 M64 62 L70 90 M15 76 H85"/>`
  ),

  laser_cutting_line: G(
    `<rect class="b" x="8" y="82" width="84" height="8" rx="3"/>` +
      `<rect class="b" x="14" y="68" width="24" height="14" rx="3"/>` +
      `<polyline points="26,68 26,44 56,22 72,34"/>` +
      `<circle class="a" cx="26" cy="44" r="6"/><circle class="a" cx="56" cy="22" r="6"/>` +
      `<rect class="a" x="66" y="34" width="14" height="14" rx="3"/>` +
      `<path d="M73 50 V76 M60 76 L54 70 M86 76 L92 70"/>`
  ),

  bright_headlamp: G(
    `<path class="b" d="M52 16 Q10 16 10 50 Q10 84 52 84 Z"/>` +
      `<circle class="a" cx="36" cy="50" r="11"/>` +
      `<path d="M66 28 H92 M66 50 H92 M66 72 H92"/>`
  ),

  cinema_projector: G(
    `<circle class="b" cx="30" cy="26" r="15"/><circle class="b" cx="60" cy="26" r="15"/>` +
      `<circle cx="30" cy="26" r="3" fill="currentColor"/><circle cx="60" cy="26" r="3" fill="currentColor"/>` +
      `<rect class="a" x="12" y="50" width="54" height="28" rx="6"/>` +
      `<rect class="b" x="66" y="56" width="10" height="16" rx="3"/>` +
      `<polygon class="b" points="80,60 92,50 92,78 80,68"/>` +
      `<path d="M26 78 L20 90 M52 78 L58 90"/>`
  ),

  phone_flash: G(
    `<rect class="b" x="24" y="8" width="52" height="84" rx="11"/>` +
      `<path d="M44 17 H56"/>` +
      `<polygon class="a" points="56,26 34,56 48,56 42,80 66,46 52,46"/>`
  ),

  field_torch: G(
    `<rect class="b" x="8" y="40" width="40" height="22" rx="6"/>` +
      `<path d="M18 40 V62 M28 40 V62"/>` +
      `<polygon class="a" points="48,36 68,28 68,74 48,66"/>` +
      `<path d="M76 30 L90 20 M78 51 H92 M76 72 L90 82"/>`
  ),

  rugged_display: G(
    `<rect x="8" y="14" width="84" height="58" rx="8"/>` +
      `<rect class="b" x="20" y="26" width="60" height="36" rx="3"/>` +
      `<path d="M50 30 L62 34 V43 Q62 52 50 58 Q38 52 38 43 V34 Z"/>` +
      `<rect class="a" x="8" y="14" width="16" height="16" rx="4"/><rect class="a" x="76" y="14" width="16" height="16" rx="4"/>` +
      `<rect class="a" x="8" y="56" width="16" height="16" rx="4"/><rect class="a" x="76" y="56" width="16" height="16" rx="4"/>` +
      `<path d="M50 72 V84 M34 88 H66"/>`
  ),

  reactive_lab: G(
    `<path class="a" d="M23 62 H77 L84 80 Q88 90 76 90 H24 Q12 90 16 80 Z"/>` +
      `<path d="M42 10 H58 V38 L84 80 Q88 90 76 90 H24 Q12 90 16 80 L42 38 Z"/>` +
      `<circle class="b" cx="46" cy="50" r="4"/><circle class="b" cx="56" cy="42" r="3"/>` +
      `<circle class="b" cx="40" cy="76" r="4"/><circle class="b" cx="60" cy="74" r="3"/>`
  ),

  armored_searchlight: G(
    `<rect class="b" x="28" y="24" width="36" height="26" rx="5"/>` +
      `<rect class="a" x="64" y="20" width="8" height="34" rx="3"/>` +
      `<path d="M78 24 L92 16 M80 37 H94 M78 50 L92 58"/>` +
      `<rect class="b" x="40" y="50" width="12" height="8"/>` +
      `<polygon class="a" points="20,72 28,56 72,56 80,72"/>` +
      `<rect class="b" x="8" y="72" width="84" height="20" rx="10"/>` +
      `<circle cx="24" cy="82" r="3" fill="currentColor"/><circle cx="50" cy="82" r="3" fill="currentColor"/><circle cx="76" cy="82" r="3" fill="currentColor"/>`
  ),

  orbital_thruster: G(
    `<ellipse cx="50" cy="56" rx="44" ry="12" transform="rotate(-35 50 56)"/>` +
      `<circle class="a" cx="86" cy="31" r="4"/>` +
      `<polygon class="a" points="34,52 22,70 34,66"/><polygon class="a" points="66,52 78,70 66,66"/>` +
      `<path class="b" d="M50 10 Q66 24 66 52 V66 H34 V52 Q34 24 50 10Z"/>` +
      `<circle class="a" cx="50" cy="38" r="7"/>` +
      `<path class="a" d="M42 72 Q50 94 58 72 Z"/>`
  ),

  runway_lights: G(
    `<polygon class="b" points="40,10 60,10 90,90 10,90"/>` +
      `<path d="M50 20 V26 M50 38 V48 M50 62 V76"/>` +
      [[37, 20, 2], [31, 36, 2.5], [23, 58, 3], [13, 84, 4], [63, 20, 2], [69, 36, 2.5], [77, 58, 3], [87, 84, 4]]
        .map(([x, y, r]) => `<circle class="a" cx="${x}" cy="${y}" r="${r}" stroke-width="3"/>`)
        .join('')
  ),

  planetarium: G(
    `<path class="b" d="M8 72 A42 42 0 0 1 92 72 Z"/>` +
      `<rect class="a" x="6" y="72" width="88" height="16" rx="4"/>` +
      `<polygon class="a" stroke-width="3" points="${star(50, 50, 11, 5)}"/>` +
      `<polygon class="a" stroke-width="3" points="${star(28, 62, 6, 3)}"/>` +
      `<polygon class="a" stroke-width="3" points="${star(72, 60, 7, 3.5)}"/>`
  ),

  ion_engine: G(
    `<rect class="b" x="38" y="8" width="24" height="14" rx="3"/>` +
      `<path class="b" d="M40 22 H60 Q62 40 84 54 H16 Q38 40 40 22Z"/>` +
      `<ellipse cx="50" cy="69" rx="34" ry="8"/>` +
      `<ellipse cx="50" cy="69" rx="21" ry="5.5"/>` +
      `<ellipse class="a" cx="50" cy="69" rx="9" ry="2.5"/>` +
      `<circle cx="34" cy="88" r="2" fill="currentColor"/><circle cx="50" cy="90" r="2" fill="currentColor"/><circle cx="66" cy="88" r="2" fill="currentColor"/>`
  ),

  // ---------------------------------------------------------------- pipelines
  pipe_main: G(
    `<rect class="b" x="8" y="52" width="84" height="22" rx="3"/>` +
      `<rect class="a" x="22" y="44" width="9" height="38" rx="2"/><rect class="a" x="69" y="44" width="9" height="38" rx="2"/>` +
      `<rect class="a" x="40" y="48" width="20" height="30" rx="4"/>` +
      `<path d="M50 48 V30 M36 30 H64"/>`
  ),

  // ---------------------------------------------------------------- elements
  element_ring: G(
    spin(3, 50, 50, `<ellipse cx="50" cy="50" rx="41" ry="15"/>`, 0) +
      `<circle class="a" cx="50" cy="50" r="5"/>` +
      `<circle class="a" cx="91" cy="50" r="4"/>` +
      `<circle class="a" cx="29.5" cy="14.5" r="4"/>` +
      `<circle class="a" cx="29.5" cy="85.5" r="4"/>`
  ),

  // ---------------------------------------------------------------- phase badges
  ph_distill: G(
    `<path class="b" d="M42 6 H58 V30 L82 60 Q86 66 78 66 H22 Q14 66 18 60 L42 30 Z"/>` +
      `<path class="a" d="M50 72 Q66 82 61 89 Q50 95 39 89 Q34 82 50 72Z"/>`
  ),

  ph_intake: G(
    `<rect class="b" x="52" y="24" width="40" height="52" rx="6"/>` +
      `<path d="M8 50 H34 M12 32 H34 M12 68 H34"/>` +
      `<polygon class="a" points="32,34 56,50 32,66"/>`
  ),

  ph_purge: G(
    `<path d="M86 8 L52 48"/>` +
      `<polygon class="a" points="46.6,43.5 57.4,52.5 42.9,87.5 15.1,64.5"/>` +
      `<path d="M38 56 L28 72"/>` +
      `<circle cx="72" cy="80" r="3" fill="currentColor"/><circle cx="86" cy="64" r="3" fill="currentColor"/>`
  ),

  ph_bid: G(
    `<rect class="b" x="43" y="58" width="14" height="32" rx="5"/>` +
      `<circle class="a" cx="50" cy="36" r="28"/>` +
      `<polyline points="36,42 50,28 64,42"/>`
  ),

  ph_buy: G(
    `<path class="b" d="M12 58 H88 L78 90 H22 Z"/>` +
      `<path d="M38 68 V82 M62 68 V82"/>` +
      `<circle class="a" cx="50" cy="19" r="12"/>` +
      `<path d="M50 36 V52"/><polyline points="41,44 50,53 59,44"/>`
  ),

  ph_any: G(
    `<polygon class="a" points="${star(50, 50, 42, 20, 8)}"/>` +
      `<circle class="b" cx="50" cy="50" r="9"/>`
  ),

  ph_end: G(
    `<path d="M22 8 V92"/>` +
      `<rect x="24" y="14" width="60" height="42"/>` +
      [[26, 16], [56, 16], [41, 30], [71, 30], [26, 44], [56, 44]]
        .map(([x, y]) => `<rect x="${x}" y="${y}" width="${x > 60 ? 11 : 11}" height="9" fill="currentColor"/>`)
        .join('')
  ),

  ph_passive: G(
    `<path class="b" d="M50 8 L86 20 V48 Q86 76 50 92 Q14 76 14 48 V20 Z"/>` +
      `<path class="a" d="M50 48 C56 36 74 36 74 48 C74 60 56 60 50 48 C44 36 26 36 26 48 C26 60 44 60 50 48Z"/>`
  ),

  ph_noinstall: G(
    `<g transform="translate(50 50) rotate(45) scale(.62) translate(-50 -50)"><path class="b" stroke-width="6.5" d="${WRENCH}"/></g>` +
      `<circle cx="50" cy="50" r="40"/>` +
      `<path d="M22 22 L78 78"/>`
  ),

  // ---------------------------------------------------------------- sectors
  sec_health: G(
    `<rect class="b" x="10" y="10" width="80" height="80" rx="18"/>` +
      `<polygon class="a" points="40,24 60,24 60,40 76,40 76,60 60,60 60,76 40,76 40,60 24,60 24,40 40,40"/>`
  ),

  sec_showbiz: G(
    `<path d="${rays(50, 50, 36, 43, 5, -54)}"/>` +
      `<polygon class="a" points="${star(50, 50, 31, 14)}"/>`
  ),

  sec_aero: G(
    `<path class="b" d="M50 8 L58 34 L92 62 L92 72 L58 62 L56 80 L66 88 L66 92 L50 88 L34 92 L34 88 L44 80 L42 62 L8 72 L8 62 L42 34 Z"/>` +
      `<ellipse class="a" cx="50" cy="38" rx="3" ry="10" stroke-width="3"/>`
  ),
};
