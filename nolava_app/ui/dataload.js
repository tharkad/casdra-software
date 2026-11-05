// dataload.js: the browser's loader for the rules data. The engine never fetches (CONTRACT D12): this fetches the 16 JSON tables (and the optional art manifests) and hands them to the API,
// which returns the engine's indexed data (`api.data`). The server has its own (server/engine.mjs `loadData`).
import { createApi, FILES } from '../engine/api.js';

export async function loadData(base = 'data/') {
    const raw = {};
    await Promise.all(FILES.map(async f => { raw[f] = await (await fetch(`${base}${f}.json`)).json(); }));
    const extra = {};
    try { extra.art = await (await fetch(`${base}../art/manifest.json`)).json(); } catch { extra.art = null; }      // the pictures are optional
    try { extra.kinds = await (await fetch(`${base}../art/kinds.json`)).json(); } catch { extra.kinds = null; }
    return createApi(raw, extra).data;
}
