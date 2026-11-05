import { chitAlterSpell } from '../helpers.js';
// Witch's Brew (II / Grey / Day, any of the caster's Type II and Type VIII Magic chits): each targeted Type II chit becomes Type IV and each Type VIII
// chit becomes Type III (4.6.10c). The numeral VIII is lost from the extracted card text; RealmSpeak's data confirms it. Spec: 02-day-spells.md section 5.
export default chitAlterSpell({ id: 'witch-s-brew', map: { II: 'IV', VIII: 'III' }, name: "Witch's Brew", flavour: 'They can cast Type IV spells and be enchanted accordingly.' });
