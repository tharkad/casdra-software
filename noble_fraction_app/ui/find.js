// Finds a card by uid anywhere in the game and says where it is: { card, where, pid }.
export function findCard(s, uid) {
    const hit = (list, where, pid) => { const card = list?.find(c => c.uid === uid); return card ? { card, where, pid } : null; };
    for (const p of s.players) {
        const found = hit(p.hand, 'hand', p.id) ?? hit(p.installed, 'installed', p.id) ?? hit(p.completed, 'completed', p.id)
            ?? hit(p.pipelines, 'pipeline', p.id) ?? hit(p.contract ? [p.contract] : [], 'contract', p.id);
        if (found) return found;
    }
    return hit(s.market.contractLine, 'contractLine') ?? hit(s.market.upgradeLine, 'upgradeLine')
        ?? hit(s.turn.f.ppe?.drawn, 'purgeDraw');
}
