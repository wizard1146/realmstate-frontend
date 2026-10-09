// Straightline's Truths & Quests: your quest, the age's Truths, and transmutation. At a glance; your quest as a card
// (its seeker, the episode, the ask and whether you can pay it, Commit or Decline, a window to confirm declining); the
// Truths as cards (yours or not yet; which one a quest seeks stays hidden); and a Transmute sheet. Data: /me, /rules.
import { store, say } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, askText } from '../../core/words.js';
import { canPay, transmuteRate } from '../../core/truths.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const inTicks = (t) => (t > store.tick ? `in ${fmt(t - store.tick)} ticks` : 'now');

export function mountTruths(host, on) {
  const P = store.rules.params;
  host.innerHTML = `<div class="lpart ltru">
    <dl class="st-glance tq-glance" id="lt-glance"></dl>
    <div class="atk-layout">
      <div class="atk-main">
        <h3 class="sub">Your quest</h3><div id="lt-quest"></div>
        <h3 class="sub">The Truths <span class="dim">uncovered by quests; each a breakthrough or a wonder's plan</span></h3><div class="ac-cards" id="lt-truths"></div>
      </div>
      <aside class="atk-sheet" aria-label="Transmute">
        <h3 class="sub">Transmute</h3>
        <p class="what" id="lt-xwhat"></p>
        <form id="lt-x" class="lform atk-grid" novalidate>
          <label for="lt-xf">From</label><select id="lt-xf"></select>
          <label for="lt-xt">Into</label><select id="lt-xt"></select>
          <label for="lt-xn">Make</label><input id="lt-xn" type="number" min="1" step="1" inputmode="numeric" placeholder="0">
        </form>
        <p class="doing" id="lt-xdoing" aria-live="polite"></p>
        <div class="atk-go"><button type="button" class="btn primary" id="lt-xgo">Transmute</button></div>
      </aside>
    </div>
    <dialog class="ldlg tq-dlg" id="lt-dlg" aria-labelledby="lt-dlg-h">
      <header><h2 id="lt-dlg-h">Decline the ask?</h2><button type="button" class="x" data-close aria-label="Cancel (Esc)">×</button></header>
      <div class="body"><p>Declining ends the quest: your seeker turns back, and the Truth it sought stays hidden from you.</p>
        <div class="atk-btns"><button type="button" class="btn" data-close>Keep the quest</button><button type="button" class="btn danger" id="lt-dyes">Decline</button></div></div></dialog>
  </div>`;
  const $ = (id) => host.querySelector(`#lt-${id}`);

  function glance() {
    const h = store.house, q = h.quest, x = transmuteRate();
    const card = (k, v, note = '') => `<div><dt>${k}</dt><dd>${v}</dd>${note ? `<dd class="rank"><span>${note}</span></dd>` : ''}</div>`;
    $('glance').innerHTML = card('Quest', q ? `Episode ${q.episode} of ${q.of}` : 'None', q ? (q.ask ? 'an ask awaits your answer' : `next ask ${inTicks(q.next_ask_tick)}`) : 'an invitation comes to your news')
      + card('Truths known', fmt((h.truths || []).length), `of ${fmt((P.truths || []).length)} this age`)
      + card('Transmute', x.rate ? `${x.rate} to 1` : 'No', x.rate ? (x.lesser ? 'the lesser rite' : 'the Transmutation Rite') : x.age ? 'needs the Transmutation Rite' : 'not this age')
      + card('Subscriber', h.subscriber ? 'Yes' : 'No', h.subscriber ? 'lesser breakthroughs are yours' : '');
  }
  function quest() {
    const q = store.house.quest;
    if (!q) { $('quest').innerHTML = '<p class="dim tq-none">No quest. A character, or your scientists, may be invited to seek a Truth; the invitation comes to your news.</p>'; return; }
    const [ok, short] = canPay(q.ask);
    $('quest').innerHTML = `<article class="ac-card tq-card"><header><h4>${esc(cap(q.seeker || 'Your seeker'))}</h4><span class="gn-badge">Episode ${q.episode} of ${q.of}</span></header>
      ${q.ask ? `<p class="tq-ask"><b>Asks:</b> ${esc(askText(q.ask))}</p><p class="${ok ? 'tq-ok' : 'short'}">${ok ? 'You can pay this.' : `Short: ${esc(short)}.`} Answer by tick ${fmt(q.answer_by_tick)} (${inTicks(q.answer_by_tick)}), or it lapses.</p>`
        : `<p class="dim">The next ask comes at tick ${fmt(q.next_ask_tick)} (${inTicks(q.next_ask_tick)}).</p>`}
      <p class="dim small">The quest ends by tick ${fmt(q.deadline_tick)}. Each paid episode, the trail may go cold or the seeker may die; after the last, the quest may find nothing.</p>
      <div class="gn-acts"><button type="button" class="btn primary" id="lt-commit"${q.ask && ok ? '' : ' disabled'}>Commit and pay</button><button type="button" class="btn" id="lt-decline">Decline</button></div></article>`;
  }
  function truths() {
    const mine = new Map((store.house.truths || []).map((t) => [t.id, t]));
    $('truths').innerHTML = (P.truths || []).map((t) => {
      const k = mine.get(t.id);
      return `<article class="ac-card tq-truth${k ? ' known' : ''}"><header><h4>${esc(t.name)}</h4><span class="hr-kind">${t.kind === 'wonder' ? 'wonder plan' : 'breakthrough'}</span></header>
        <p class="${k ? 'tq-ok' : 'dim'}">${k ? (k.ours ? 'Yours: your state uncovered it' : 'Yours') : 'Not yet'}</p></article>`;
    }).join('') || '<p class="dim">No Truths this age.</p>';
  }
  function transmute() {
    const h = store.house, x = transmuteRate(), mats = Object.keys(h.materials || {});
    for (const id of ['xf', 'xt']) if ($(id).options.length !== mats.length) { const v = $(id).value; $(id).innerHTML = mats.map((m) => `<option value="${esc(m)}">${esc(cap(m))}</option>`).join(''); if (v) $(id).value = v; }
    if ($('xt').value === $('xf').value && mats.length > 1) $('xt').value = mats.find((m) => m !== $('xf').value);
    $('xwhat').textContent = x.rate ? `${x.rate} of one material makes 1 of another, plus ${fmt(x.aether)} aether each; at most ${fmt(x.max)} a cast.${x.lesser ? ' (The lesser rite: a subscriber\'s.)' : ''}` : x.age ? 'Needs the Transmutation Rite, a Truth, or a subscription.' : 'Not this age.';
    host.querySelectorAll('#lt-x select, #lt-x input').forEach((e) => { e.disabled = !x.rate; });
    const n = n0($('xn').value), from = $('xf').value, to = $('xt').value, need = n * x.rate, aether = n * x.aether;
    const why = [!x.rate ? 'you can\'t transmute yet' : '', !n ? 'say how many to make' : '', from === to ? 'choose two different materials' : '', need > (h.materials?.[from] || 0) ? `it takes ${fmt(need)} ${from}; you have ${fmt(h.materials?.[from] || 0)}` : '', aether > h.aether ? `it takes ${fmt(aether)} aether; you have ${fmt(h.aether)}` : '', n > x.max ? `at most ${fmt(x.max)} a cast` : ''].filter(Boolean);
    $('xdoing').textContent = why.length ? `Can't yet: ${why.join('; ')}.` : `Turn ${fmt(need)} ${from} and ${fmt(aether)} aether into ${fmt(n)} ${to}.`;
    $('xdoing').classList.toggle('short', why.length > 0);
    $('xgo').disabled = why.length > 0;
  }
  on($('quest'), 'click', (ev) => {
    if (ev.target.closest('#lt-commit')) act.answerQuest(true, { button: ev.target.closest('button') });
    if (ev.target.closest('#lt-decline')) $('dlg').showModal();
  });
  on($('dlg'), 'click', (ev) => { if (ev.target === $('dlg') || ev.target.closest('[data-close]')) $('dlg').close(); });
  on($('dyes'), 'click', async () => { $('dlg').close(); await act.answerQuest(false, { button: $('dyes') }); });
  on(host.querySelector('.atk-sheet'), 'input', transmute);
  on(host.querySelector('.atk-sheet'), 'change', transmute);
  on($('x'), 'submit', (ev) => ev.preventDefault());
  on($('xgo'), 'click', async () => {
    if ($('xf').value === $('xt').value) { say('Transmute one material into another.', 'bad'); return; }
    if (await act.transmute($('xf').value, $('xt').value, n0($('xn').value), { button: $('xgo') })) $('xn').value = '';
    transmute();
  });

  function draw() { if (!store.house) return; glance(); quest(); truths(); transmute(); }
  draw();
  return {
    update(c) { if (!c || c.has('house') || c.has('rules')) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
