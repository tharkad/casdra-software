import { chooseAction } from './policy.js';
import { DEFAULT_WEIGHTS } from './weights.js';
import { TUNED_WEIGHTS } from './tuned.js';
import { expertPolicy } from '../ai/expert.js';

export const LEVELS = [
    { id: 'easy', label: 'Easy' },
    { id: 'normal', label: 'Normal' },
    { id: 'hard', label: 'Hard' },
    { id: 'expert', label: 'Expert' },
];
export const DEFAULT_LEVEL = 'normal';

// Easy is a cost-averse hoarder: it overvalues cash and cost, so it under-buys (Normal beats it ~70%; it beats random play)
// yet still finishes games on its own. Hard is the self-play-tuned champion (sim/tune.mjs).
const EASY_WEIGHTS = { ...DEFAULT_WEIGHTS, money: 1, costWeight: 0.8 };

const play = weights => (state, actions) => chooseAction(state, actions, weights);
const POLICIES = { easy: play(EASY_WEIGHTS), normal: play(DEFAULT_WEIGHTS), hard: play(TUNED_WEIGHTS) };
POLICIES.expert = expertPolicy(POLICIES.hard);                // a search-guided neural net; see ai/expert.js

export const policyFor = level => POLICIES[level] ?? POLICIES[DEFAULT_LEVEL];
