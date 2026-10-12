// The Hall of Deeds' rules a page needs: what a bid or offer holds from you, and whether you have room for another
// character. Deposits follow the engine: price plus the out-of-realm premium (seller in another realm), held at once.
import { store } from './store.js';

/** What a bid or offer of `price` holds from you, against a seller house ref. */
export function deposit(price, seller) {
  const h = store.house, bp = store.hall?.out_of_realm_bp ?? store.rules.params.out_of_realm_bp;
  const premium = seller && seller.realm !== h.realm ? Math.floor(price * bp / 10000) : 0;
  return { premium, held: price + premium };
}
/** Why you can't take another character of this kind ('' if you can). */
export const roomFor = (kind) => (kind === 'general'
  ? (store.house.generals.length < store.rules.params.general_max ? '' : `you keep the most generals a house may (${store.rules.params.general_max})`)
  : (store.house.science.academics.length < store.house.science.academic_cap ? '' : 'no university room for another academic'));
