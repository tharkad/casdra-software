import { handlers, settlers, canon } from './registry.js';
import { legalActions } from './legal.js';
import { cloneState } from './clone.js';

// Returns a NEW state. The action must be one legalActions(state) offers (compared by canonical
// form), which is the single place legality is decided; handlers then just carry it out.
export function apply(state, action) {
    const key = canon(action);
    if (!legalActions(state).some(a => canon(a) === key)) {
        throw new Error(`illegal action in phase "${state.turn.phase}": ${key}`);
    }
    const draft = cloneState(state);
    handlers[action.type](draft, action);
    settlers.forEach(rule => rule(draft));
    return draft;
}
