// Address boxes (realm:state, realm:state:seat): a space types ":" instead, so "1 3 5" becomes 1:3:5. One listener
// for the whole page finds them by their hint ("r:s", "r:s:seat", "realm:state:seat", "1:3"), or by data-addr.
const ADDR_HINT = /^\s*(r:s|realm:state|\d+:\d+)/i;
const isAddr = (el) => el instanceof HTMLInputElement && (el.dataset.addr != null || ADDR_HINT.test(el.placeholder || ''));

export function installAddressSpace(doc = document) {
  doc.addEventListener('beforeinput', (ev) => {
    const el = ev.target;
    if (ev.inputType !== 'insertText' || ev.data !== ' ' || !isAddr(el)) return;
    ev.preventDefault();
    const at = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? at;
    // A space right after a ":" (or at the start) adds nothing: no "::".
    if (at === 0 || el.value[at - 1] === ':') return;
    el.setRangeText(':', at, end, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, true);
}
