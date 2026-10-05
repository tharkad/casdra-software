import { providers } from './registry.js';

export function legalActions(state) {
    if (state.turn.phase === 'over') return [];
    return providers.flatMap(provide => provide(state));
}
