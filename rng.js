/*
 * Günlük Meydan Okuma'nın belirlenimli çekirdeği.
 *
 * Bu dosya `script.js`ten ayrı duruyor, çünkü test edilebilmesi gereken tek
 * parça burası ve `script.js` içinde test edilemiyordu: o modül en üst
 * seviyede Three.js'e ve DOM'a dokunuyor, yani onu içe aktarmak bir tarayıcı
 * istiyor. Sonuç olarak `test/prng.spec.js` uzun süre bu fonksiyonların bir
 * KOPYASINI sınadı ve dosyanın başında "script.js'i değiştirirsen burayı da
 * değiştir" yazıyordu.
 *
 * Bu bir sınama değil, bir dilek. Kopya, aslından sessizce ayrılabilir: RNG
 * değişir, testler yeşil kalır, ve aynı günde oynayan iki oyuncu farklı
 * dizilerle oynarken skor tablosu hâlâ karşılaştırılabilir görünür. Günlük
 * modun tek vaadi tam olarak buydu.
 *
 * Burada DOM yok, Three yok, yan etki yok - sadece saf fonksiyonlar. Böylece
 * oyunun yüklediği dosyanın ta kendisi Node'dan da içe aktarılabiliyor, ve
 * test artık kopyayı değil gönderilen kodu ölçüyor.
 */

/** Küçük, hızlı, tohumlanabilir üreteç (mulberry32). [0, 1) aralığı. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Takvim günü, UTC'ye göre: `20260831`.
 *
 * UTC, yerel saat değil - iki oyuncunun "aynı gün" oynamış sayılması için
 * ortak bir gün tanımı gerekiyor ve yerel gün sınırı saat dilimine göre
 * kayıyor.
 */
export function todayUTCStamp(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/** O günün tohumu. Örn. 20260831. */
export function dailySeed(date = new Date()) {
  return Number(todayUTCStamp(date));
}

/** O güne ait en iyi skorun saklandığı anahtar. */
export function dailyStorageKey(date = new Date()) {
  return `novaDriftDaily-${todayUTCStamp(date)}`;
}

/*
 * Run codes: any run, not only today's, can be replayed by someone else.
 *
 * Every run is seeded (endless runs from a fresh random seed), and the seed
 * is shown on the game-over card as an 8-character code, `K7Q2-M9XA`. A
 * link with `?run=K7Q2-M9XA` replays that exact spawn sequence: same rocks,
 * same orbs, same power-ups in the same order, which is what makes "beat my
 * score" a fair challenge without a server.
 *
 * Crockford base32 (no I, L, O, U), so a code read aloud or retyped from a
 * screenshot survives: lower case, dashes and spaces are ignored, and I/L/O
 * are read as 1/1/0. Eight characters carry 40 bits: the 32-bit seed plus an
 * 8-bit check, so a mistyped code is rejected instead of quietly starting a
 * different run (about 255 single-character slips in 256 are caught;
 * test/run-code.spec.js measures it).
 */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function check8(seed) {
  // FNV-1a over the four seed bytes, folded to 8 bits.
  let h = 0x811c9dc5;
  for (let i = 0; i < 4; i += 1) {
    h ^= (seed >>> (i * 8)) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h ^ (h >>> 8) ^ (h >>> 16) ^ (h >>> 24)) & 0xff;
}

/** A fresh 32-bit seed for an endless run. `random` is injectable for tests. */
export function randomSeed(random = Math.random) {
  return Math.floor(random() * 4294967296) >>> 0;
}

/** 32-bit seed -> `XXXX-XXXX`. */
export function encodeRunCode(seed) {
  const s = seed >>> 0;
  // 40 bits = seed (32) then check (8); BigInt keeps it exact.
  let v = (BigInt(s) << 8n) | BigInt(check8(s));
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out = CODE_ALPHABET[Number(v & 31n)] + out;
    v >>= 5n;
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** `XXXX-XXXX` (forgivingly typed) -> seed, or null if it is not a valid code. */
export function decodeRunCode(text) {
  if (typeof text !== 'string') return null;
  const clean = text.toUpperCase().replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1').replace(/O/g, '0');
  if (clean.length !== 8) return null;
  let v = 0n;
  for (const ch of clean) {
    const k = CODE_ALPHABET.indexOf(ch);
    if (k < 0) return null;
    v = (v << 5n) | BigInt(k);
  }
  const seed = Number(v >> 8n) >>> 0;
  const check = Number(v & 0xffn);
  return check === check8(seed) ? seed : null;
}
