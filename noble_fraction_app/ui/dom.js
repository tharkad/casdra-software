// A tiny hyperscript helper: h('div', { class: 'x', 'data-uid': 3, onclick }, child, [children], 'text').
export function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props ?? {})) {
        if (value === false || value === null || value === undefined) continue;
        if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
        else if (key === 'class') el.className = value;
        else el.setAttribute(key, value === true ? '' : value);
    }
    append(el, children);
    return el;
}
function append(el, children) {
    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
}
export const clear = el => { el.replaceChildren(); return el; };
