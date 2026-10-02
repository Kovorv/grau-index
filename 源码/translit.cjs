// Cyrillic -> Latin transliteration.
//
// The common English-language convention for Russian designations is used (OTs-14, Kh-31,
// Yak-9, Su-27 …) rather than the literal GOST 7.79-2000 System B spelling (OCz-14, X-31).
// The GOST variant is still produced by `translitGost` so search can accept both spellings.
const MAP = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'Yo', Ж: 'Zh', З: 'Z', И: 'I',
  Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T',
  У: 'U', Ф: 'F', Х: 'Kh', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh', Щ: 'Shch', Ъ: '', Ы: 'Y',
  Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya',
};
// GOST 7.79-2000 system B, kept for search compatibility
const MAP_GOST = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'Yo', Ж: 'Zh', З: 'Z', И: 'I',
  Й: 'J', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T',
  У: 'U', Ф: 'F', Х: 'X', Ц: 'Cz', Ч: 'Ch', Ш: 'Sh', Щ: 'Shh', Ъ: '', Ы: 'Y',
  Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya',
};
function make(map) {
  const lower = {};
  for (const [k, v] of Object.entries(map)) lower[k.toLowerCase()] = v.toLowerCase();
  return (str) => {
    if (!str) return '';
    let out = '';
    for (const ch of String(str)) {
      if (map[ch] !== undefined) out += map[ch];
      else if (lower[ch] !== undefined) out += lower[ch];
      else out += ch;
    }
    return out;
  };
}
const translit = make(MAP);
const translitGost = make(MAP_GOST);

module.exports = { translit, translitGost, MAP, MAP_GOST };
