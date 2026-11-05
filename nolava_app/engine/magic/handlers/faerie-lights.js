import { chitAlterSpell } from '../helpers.js';
// Faerie Lights (III / Gold / Day, any of the caster's Type III and Type VII Magic chits): each targeted Type III chit becomes Type II and each Type VII
// chit becomes Type VI (4.6.10c). Spec: 02-day-spells.md section 6.
export default chitAlterSpell({ id: 'faerie-lights', map: { III: 'II', VII: 'VI' }, name: 'Faerie Lights', flavour: 'They can cast Type II and Type VI spells.' });
