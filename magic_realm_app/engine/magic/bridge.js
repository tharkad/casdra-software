// The combat engine's own operations that spell handlers need (kill a denizen, name a target, end the combat, strike the hero). combat.js fills this in when it loads.
// It is a leaf module on purpose: a handler that imported combat.js directly would make an import cycle through the registry.
export const B = {};
