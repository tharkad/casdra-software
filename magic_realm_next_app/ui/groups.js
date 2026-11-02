// groups.js: how one native group is told from another now that every native counter is the rulebook's own black-and-white one (art switch, 2026-11-02).
// The box counters of a Company Pikeman and a Soldier Pikeman are the same picture; the group is the difference. Each group gets one colour of OUR OWN choosing (not taken from any counter set),
// drawn as a ring round the counter's frame: a stroke in monsterCounter (counter.js) and the `grp` class on an HTML tile (css/core.css, `.ds-counter.grp`). The group's name is always printed
// beside the counter as well, so the colour is never the only signal. Pure data and one DOM helper.

export const GROUP_TINT = {
    Bashkars: '#b8793a', Company: '#35d0dc', Guard: '#46a03c', Lancers: '#ffd31a', Order: '#ee8a2e',
    Patrol: '#9a6fe0', Rogues: '#e0463c', Soldiers: '#3d6fe8', Woodfolk: '#ee6fa8',
};
export const groupTint = g => GROUP_TINT[g] ?? null;

/** Ring an HTML counter tile (.ds-counter) in its native group's colour; returns the element (a monster, or an unknown group, is left as it is). */
export function markGroup(el, group) {
    const t = groupTint(group);
    if (el && t) { el.classList.add('grp'); el.style.setProperty('--grp', t); el.dataset.group = group; }
    return el;
}
