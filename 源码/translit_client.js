// ---------------------------------------------------------------------------------------
// transliteration (client side).
// Display uses the common English convention (OTs-14, Kh-31, Yak-9); search additionally
// accepts the literal GOST 7.79-2000 B spelling (OCz-14, X-31) so either can be typed.
// ---------------------------------------------------------------------------------------
var UP = { А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'Yo', Ж: 'Zh', З: 'Z', И: 'I',
  Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T',
  У: 'U', Ф: 'F', Х: 'Kh', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh', Щ: 'Shch', Ъ: '', Ы: 'Y',
  Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya' };
var UP_GOST = { А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'Yo', Ж: 'Zh', З: 'Z', И: 'I',
  Й: 'J', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T',
  У: 'U', Ф: 'F', Х: 'X', Ц: 'Cz', Ч: 'Ch', Ш: 'Sh', Щ: 'Shh', Ъ: '', Ы: 'Y',
  Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya' };
var LO = {}, LO_GOST = {};
for (var _k in UP) { LO[_k.toLowerCase()] = UP[_k].toLowerCase(); }
for (var _k2 in UP_GOST) { LO_GOST[_k2.toLowerCase()] = UP_GOST[_k2].toLowerCase(); }
function _map(s, up, lo) {
  if (!s) return '';
  var o = '';
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    o += up[c] !== undefined ? up[c] : (lo[c] !== undefined ? lo[c] : c);
  }
  return o;
}
function tr(s) { return _map(s, UP, LO); }
function trGost(s) { return _map(s, UP_GOST, LO_GOST); }
function key2(s) { return tr(String(s || '')).toLowerCase(); }
function keyGost(s) { return trGost(String(s || '')).toLowerCase(); }
