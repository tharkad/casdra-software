import { h } from '../dom.js';

// Simple text screens: how to play, and placeholders for features that are not built yet.
export const HELP = [
    ['The day', 'Each day has up to four phases: two basic, and two more in daylight if you stay out of the caves. In the morning you plan every phase secretly; then the day plays out. Anything impossible at its turn is simply lost.'],
    ['Moving', 'One Move phase takes you one clearing along a road. Mountains cost two Move phases in a row. You can only carry what your strongest Move chit (or horse) can carry; anything heavier is dropped where you stand.'],
    ['Hiding', 'A Hide phase may hide you (a roll of 1 to 5). Hidden, monsters cannot block you. You are revealed when blocked, when you attack, or when your turn comes round.'],
    ['Searching', 'Peer finds hidden paths and the identity of chits in your tile. Locate finds secret passages and sites in your clearing. Loot takes a treasure from a site you have found, or from things lying on the ground.'],
    ['Trading and hiring', 'Natives buy anything at its price. To buy from them or to hire them you roll on the Meeting Table: a better relationship gives a better price. The Black Knight rolls one die, not two.'],
    ['Blocking and summoning', 'At the end of each phase any monster in your clearing blocks you and ends your turn. When your turn ends, creatures that prowl today in your tile come to you, the chits in your tile turn up, and they call monsters out of the Appearance Chart.'],
    ['Evening combat', 'Each evening you fight whoever is in your clearing. Each round: one action; then secretly choose your attack direction and chit, your maneuver direction and chit, and which way your shield faces; the dice then shuffle the creatures. A blow hits if its speed is lower than the target\'s maneuver speed, or if the direction matches.'],
    ['Chits', 'Fight chits strike, Move chits maneuver and carry. A star is effort: you may play at most two stars a round, and you fatigue one fewer than you played. Wounded chits are out of play until rested back. When every chit is wounded, you are dead.'],
    ['Winning', 'You spend victory points on goals before the game: Fame, Notoriety, Gold, great treasures and spells. At the end each goal is scored as what you earned minus what you set; a shortfall counts triple.'],
];

export function helpScreen(ctx) {
    return h('main', { class: 'screen', 'data-screen': 'rules' },
        h('header', { class: 'bar' }, h('button', { class: 'back', onclick: () => ctx.go('title') }, '‹'), h('h1', {}, 'How to play')),
        h('div', { class: 'body' }, ...HELP.flatMap(([t, x]) => [h('h3', { class: 'helph' }, t), h('p', { class: 'helpp' }, x)])));
}

export const stub = (title, text) => ctx => h('main', { class: 'screen', 'data-screen': title.toLowerCase() },
    h('header', { class: 'bar' }, h('button', { class: 'back', onclick: () => ctx.go('title') }, '‹'), h('h1', {}, title)),
    h('div', { class: 'body' }, h('div', { class: 'note' }, text)));
