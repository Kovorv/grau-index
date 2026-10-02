// Data model + loader for the native GRAU index app.
// Reads two embedded resources: grau_data.tsv.gz (tab separated) and img.bin.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;

namespace GrauIndex
{
    public class Rec
    {
        public string Idx = "", Type = "", Org = "", Prefix = "", Roles = "", Nato = "", Ru = "", Zh = "";
        public string LitKind = "", LitSrc = "", LitUrl = "", LitQuote = "";
        // component layer: alternative designations / the equipment this part fits / the parts of a row
        public string Aka = "", UsedOn = "", Parts = "";
        // pre-folded search forms (homoglyph-folded, punctuation/dashes removed)
        public string SIdx = "", SZh = "", SRu = "", SNato = "", SAka = "", SUsedOn = "", SParts = "";
        // the same forms transliterated to Latin, so a Latin keyboard finds Cyrillic rows too
        public string SIdxLat = "", SIdxGost = "", SAkaLat = "", SAkaGost = "", SRuLat = "";
        public int Score = 0;
        public int Series;
        public bool HasLit { get { return LitKind.Length > 0; } }
        public bool HasRel { get { return Aka.Length > 0 || UsedOn.Length > 0 || Parts.Length > 0; } }
    }

    public class CatInfo
    {
        public string Key = "", Zh = "", Ru = "", City = "", Note = "";
        public int N;
    }

    // one line of the complete bibliography (参考文献目录)
    public class RefInfo
    {
        public string Cat = "", Title = "", Url = "", Note = "";
        public int N;
    }

    public class SerInfo
    {
        public string Key = "", Letter = "", Zh = "", Ru = "", Kind = "n", Prefixes = "";
        // v1.4.5: 大类短标签（«ПВО 反序6»、«第1类»、«产品代号»…），用于左侧序列树
        public string ShortZh = "", ShortRu = "";
        // v1.4.6: 第一级「索引体系组」（ГРАУ / Р 无线电 / ПВО / ВВС / ВМФ / РВСН·航天 / 设计局 / 老 ГАУ / 其他）
        public string GrpZh = "", GrpRu = "";
        public int N;
    }

    public class WikiRec
    {
        public string Idx = "", Lang = "", Title = "", Url = "", Extract = "", Thumb = "", Lic = "", By = "", Tier = "";
    }

    public class SrcSeg { public string Src = "", Desig = "", Note = ""; }

    public class GbtuRec
    {
        public string Key = "", Desig = "", Note = "";
        public List<SrcSeg> Srcs = new List<SrcSeg>();
    }

    public class GiuRec
    {
        public string Title = "", Desig = "", Section = "", Purpose = "", Kvt = "", Okp = "", Ekps = "", Adopted = "", Dev = "";
    }

    public class AmmoRec { public string Key = "", Note = ""; public bool Eng; }

    // v1.4.2.1: 索引字头／序列（局号）的含义，逐条带来源（读者问「1ПН 是什么意思」）
    public class PrefNote
    {
        public string Key = "", Kind = "L", Zh = "", Ru = "", Src = "", Quote = "", Conf = "B";
        public string Text(bool zh)
        {
            string a = zh ? Zh : Ru, b = zh ? Ru : Zh;
            return string.IsNullOrEmpty(a) ? b : a;
        }
    }

    public class Data
    {
        public string Title = "", ByLine = "";
        public List<Rec> Recs = new List<Rec>();
        public Dictionary<string, CatInfo> Types = new Dictionary<string, CatInfo>();
        public Dictionary<string, CatInfo> Orgs = new Dictionary<string, CatInfo>();
        public List<SerInfo> Series = new List<SerInfo>();
        public Dictionary<string, WikiRec> Wiki = new Dictionary<string, WikiRec>();
        public Dictionary<string, Dictionary<string, WikiRec>> WikiAlt = new Dictionary<string, Dictionary<string, WikiRec>>();
        public Dictionary<string, string> LS = new Dictionary<string, string>();
        public Dictionary<string, string> TZ = new Dictionary<string, string>();
        public Dictionary<string, string> DZ = new Dictionary<string, string>();
        // v1.4.2.1: 字头含义（L＝字头、D＝序列／局号、X＝通用正则规则）
        public Dictionary<string, PrefNote> PrefixNotes = new Dictionary<string, PrefNote>();
        public Dictionary<string, PrefNote> DeptNotes = new Dictionary<string, PrefNote>();
        public List<PrefNote> PrefGeneric = new List<PrefNote>();
        public List<GbtuRec> Gbtu = new List<GbtuRec>();
        public List<GiuRec> Giu = new List<GiuRec>();
        public List<AmmoRec> Gau = new List<AmmoRec>();
        public List<AmmoRec> Mo = new List<AmmoRec>();
        public List<CatInfo> Abbr = new List<CatInfo>();
        public List<CatInfo> Nicks = new List<CatInfo>();
        public List<RefInfo> Refs = new List<RefInfo>();
        public Dictionary<string, SrcSeg> ByMaster = new Dictionary<string, SrcSeg>();
        private Dictionary<string, int[]> imgIndex = new Dictionary<string, int[]>();
        public int ImageCount { get { return imgIndex.Count; } }
        private byte[] imgBlob;
        private Dictionary<string, Image> imgCache = new Dictionary<string, Image>();
        private List<string> imgLru = new List<string>();

        // v1.4.2.1: 字头含义查询——先查逐字头词条，再退回通用规则（正则）
        public PrefNote PrefOf(string prefix)
        {
            if (string.IsNullOrEmpty(prefix)) return null;
            PrefNote p;
            if (PrefixNotes.TryGetValue(prefix, out p)) return p;
            for (int i = 0; i < PrefGeneric.Count; i++)
            {
                try { if (Regex.IsMatch(prefix, PrefGeneric[i].Key)) return PrefGeneric[i]; }
                catch { }
            }
            return null;
        }
        public PrefNote DeptOf(int n)
        {
            PrefNote p;
            return DeptNotes.TryGetValue(n.ToString(), out p) ? p : null;
        }

        static string Unesc(string s) { return s; }

        // ------------------------------------------------------------- search folding
        // Fold() keeps the length identical to the input, so positions found in the
        // folded/squashed text can be mapped back onto the original string.
        // Cyrillic letters that look like Latin ones are folded to the Latin form, so
        // "9k37", "2c19", "t-90" (typed on a Latin keyboard) find "9К37", "2С19", "Т-90".
        public static string Fold(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            char[] a = s.ToLowerInvariant().ToCharArray();
            for (int i = 0; i < a.Length; i++)
            {
                switch (a[i])
                {
                    case 'ё': a[i] = 'е'; break;
                    case 'а': a[i] = 'a'; break;
                    case 'в': a[i] = 'b'; break;
                    case 'е': a[i] = 'e'; break;
                    case 'к': a[i] = 'k'; break;
                    case 'м': a[i] = 'm'; break;
                    case 'н': a[i] = 'h'; break;
                    case 'о': a[i] = 'o'; break;
                    case 'р': a[i] = 'p'; break;
                    case 'с': a[i] = 'c'; break;
                    case 'т': a[i] = 't'; break;
                    case 'у': a[i] = 'y'; break;
                    case 'х': a[i] = 'x'; break;
                    case 'і': a[i] = 'i'; break;
                    case 'ј': a[i] = 'j'; break;
                    case 'ѕ': a[i] = 's'; break;
                    case '-': case '\u2010': case '\u2011': case '\u2012': case '\u2013': case '\u2014': case '\u2015': case '\u2212':
                    case '«': case '»': case '\u201e': case '\u201c': case '\u201d': case '"': case '\'':
                    case '(': case ')': case '[': case ']': case '{': case '}':
                    case ',': case '.': case ';': case ':': case '/': case '\\': case '|': case '*': case '!': case '?':
                    case '\t': case '\r': case '\n':
                        a[i] = ' '; break;
                }
            }
            return new string(a);
        }

        // remove the spaces that Fold() introduced, keeping a map back to the original index
        public static string Squash(string folded, List<int> map)
        {
            if (string.IsNullOrEmpty(folded)) return "";
            System.Text.StringBuilder b = new System.Text.StringBuilder(folded.Length);
            for (int i = 0; i < folded.Length; i++)
            {
                if (folded[i] == ' ') continue;
                b.Append(folded[i]);
                if (map != null) map.Add(i);
            }
            return b.ToString();
        }

        public static string Sq(string s) { return Squash(Fold(s), null); }

        // ------------------------------------------------- cyrillic <-> latin transliteration
        // Same tables as the web page (translit_client.js): the common English convention for
        // display (OTs-14, Kh-31, Yak-9), plus the literal GOST 7.79-2000 B spelling accepted on
        // input, so either spelling can be typed.
        static readonly Dictionary<char, string> TR_UP = new Dictionary<char, string> {
            {'А',"A"},{'Б',"B"},{'В',"V"},{'Г',"G"},{'Д',"D"},{'Е',"E"},{'Ё',"Yo"},{'Ж',"Zh"},{'З',"Z"},{'И',"I"},
            {'Й',"Y"},{'К',"K"},{'Л',"L"},{'М',"M"},{'Н',"N"},{'О',"O"},{'П',"P"},{'Р',"R"},{'С',"S"},{'Т',"T"},
            {'У',"U"},{'Ф',"F"},{'Х',"Kh"},{'Ц',"Ts"},{'Ч',"Ch"},{'Ш',"Sh"},{'Щ',"Shch"},{'Ъ',""},{'Ы',"Y"},
            {'Ь',""},{'Э',"E"},{'Ю',"Yu"},{'Я',"Ya"} };
        static readonly Dictionary<char, string> TR_UP_GOST = new Dictionary<char, string> {
            {'А',"A"},{'Б',"B"},{'В',"V"},{'Г',"G"},{'Д',"D"},{'Е',"E"},{'Ё',"Yo"},{'Ж',"Zh"},{'З',"Z"},{'И',"I"},
            {'Й',"J"},{'К',"K"},{'Л',"L"},{'М',"M"},{'Н',"N"},{'О',"O"},{'П',"P"},{'Р',"R"},{'С',"S"},{'Т',"T"},
            {'У',"U"},{'Ф',"F"},{'Х',"X"},{'Ц',"Cz"},{'Ч',"Ch"},{'Ш',"Sh"},{'Щ',"Shh"},{'Ъ',""},{'Ы',"Y"},
            {'Ь',""},{'Э',"E"},{'Ю',"Yu"},{'Я',"Ya"} };
        static readonly Dictionary<char, string> TR_LO = new Dictionary<char, string>();
        static readonly Dictionary<char, string> TR_LO_GOST = new Dictionary<char, string>();
        static bool trReady = false;

        static void TrInit()
        {
            if (trReady) return;
            trReady = true;
            foreach (KeyValuePair<char, string> p in TR_UP)
                TR_LO[p.Key.ToString().ToLowerInvariant()[0]] = p.Value.ToLowerInvariant();
            foreach (KeyValuePair<char, string> p in TR_UP_GOST)
                TR_LO_GOST[p.Key.ToString().ToLowerInvariant()[0]] = p.Value.ToLowerInvariant();
        }

        static string TrMap(string s, Dictionary<char, string> up, Dictionary<char, string> lo)
        {
            if (string.IsNullOrEmpty(s)) return "";
            StringBuilder b = new StringBuilder(s.Length + 8);
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                string v;
                if (up.TryGetValue(c, out v)) b.Append(v);
                else if (lo.TryGetValue(c, out v)) b.Append(v);
                else b.Append(c);
            }
            return b.ToString();
        }

        public static string Tr(string s) { TrInit(); return TrMap(s, TR_UP, TR_LO); }
        public static string TrGost(string s) { TrInit(); return TrMap(s, TR_UP_GOST, TR_LO_GOST); }

        // latin -> cyrillic, greedy longest match (the query converter button)
        static readonly string[] UN_L = { "shch", "shh", "cz", "yo", "zh", "kh", "ts", "ch", "sh", "ya", "yu", "ye", "j", "x" };
        static readonly string[] UN_C = { "щ", "щ", "ц", "ё", "ж", "х", "ц", "ч", "ш", "я", "ю", "е", "й", "х" };
        static readonly Dictionary<char, char> UN1 = new Dictionary<char, char> {
            {'a','а'},{'b','б'},{'c','ц'},{'d','д'},{'e','е'},{'f','ф'},{'g','г'},{'h','х'},{'i','и'},{'k','к'},
            {'l','л'},{'m','м'},{'n','н'},{'o','о'},{'p','п'},{'q','к'},{'r','р'},{'s','с'},{'t','т'},{'u','у'},
            {'v','в'},{'w','в'},{'y','ы'},{'z','з'} };

        public static string UnTr(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            string low = s.ToLowerInvariant();
            StringBuilder b = new StringBuilder(s.Length);
            int i = 0;
            while (i < s.Length)
            {
                bool hit = false;
                for (int k = 0; k < UN_L.Length; k++)
                {
                    string p = UN_L[k];
                    if (i + p.Length <= low.Length && low.Substring(i, p.Length) == p)
                    {
                        string cy = UN_C[k];
                        b.Append(char.IsUpper(s[i]) ? cy.ToUpperInvariant() : cy);
                        i += p.Length; hit = true; break;
                    }
                }
                if (hit) continue;
                char ch = low[i], cyc;
                if (UN1.TryGetValue(ch, out cyc))
                    b.Append(char.IsUpper(s[i]) ? char.ToUpperInvariant(cyc) : cyc);
                else b.Append(s[i]);
                i++;
            }
            return b.ToString();
        }

        public static bool HasCyr(string s)
        {
            if (string.IsNullOrEmpty(s)) return false;
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                if (c >= '\u0410' && c <= '\u044f') return true;
                if (c == '\u0401' || c == '\u0451') return true;
            }
            return false;
        }

        // convert a typed query to the other script (cyrillic <-> latin)
        public static string Flip(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            if (HasCyr(s))
            {
                // mixed input: transliterate only the cyrillic characters, keep the rest as is
                StringBuilder b = new StringBuilder(s.Length + 8);
                StringBuilder run = new StringBuilder();
                for (int i = 0; i < s.Length; i++)
                {
                    char c = s[i];
                    bool cyr = (c >= '\u0410' && c <= '\u044f') || c == '\u0401' || c == '\u0451';
                    if (cyr || (run.Length > 0 && (char.IsLetter(c))))
                    {
                        if (cyr) run.Append(c);
                        else { if (run.Length > 0) { b.Append(Tr(run.ToString())); run.Length = 0; } b.Append(c); }
                    }
                    else { if (run.Length > 0) { b.Append(Tr(run.ToString())); run.Length = 0; } b.Append(c); }
                }
                if (run.Length > 0) b.Append(Tr(run.ToString()));
                return b.ToString();
            }
            return UnTr(s);
        }

        public static Data Load()
        {
            Data d = new Data();
            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream s = asm.GetManifestResourceStream("grau_data.tsv.gz"))
            using (GZipStream gz = new GZipStream(s, CompressionMode.Decompress))
            using (StreamReader sr = new StreamReader(gz, Encoding.UTF8))
            {
                string line;
                while ((line = sr.ReadLine()) != null)
                {
                    if (line.Length == 0) continue;
                    string[] f = line.Split('\t');
                    switch (f[0])
                    {
                        case "#T": if (f.Length > 1) d.Title = f[1]; break;
                        case "#L": if (f.Length > 1) d.ByLine = f[1]; break;
                        case "#S":
                            {
                                SerInfo x = new SerInfo();
                                x.Key = f[1]; x.Kind = f[2]; x.N = int.Parse(f[3]); x.Letter = f[4];
                                x.Zh = f[5]; x.Ru = f[6]; if (f.Length > 7) x.Prefixes = f[7];
                                if (f.Length > 8) x.ShortZh = f[8]; if (f.Length > 9) x.ShortRu = f[9];
                                if (f.Length > 10) x.GrpZh = f[10]; if (f.Length > 11) x.GrpRu = f[11];
                                d.Series.Add(x); break;
                            }
                        case "#C":
                            {
                                CatInfo c = new CatInfo(); c.Key = f[1]; c.Zh = f[2]; c.Ru = f[3];
                                c.N = f.Length > 4 ? int.Parse(f[4]) : 0; d.Types[c.Key] = c; break;
                            }
                        case "#G":
                            {
                                // v1.4.2.1: 字头含义 L＝字头 D＝序列（局号） X＝通用正则规则
                                PrefNote pn = new PrefNote();
                                pn.Key = f[1]; pn.Kind = f.Length > 2 ? f[2] : "L";
                                pn.Zh = f.Length > 3 ? f[3] : ""; pn.Ru = f.Length > 4 ? f[4] : "";
                                pn.Src = f.Length > 5 ? f[5] : ""; pn.Quote = f.Length > 6 ? f[6] : "";
                                pn.Conf = f.Length > 7 && f[7].Length > 0 ? f[7] : "B";
                                if (pn.Kind == "D") d.DeptNotes[pn.Key] = pn;
                                else if (pn.Kind == "X") d.PrefGeneric.Add(pn);
                                else d.PrefixNotes[pn.Key] = pn;
                                break;
                            }
                        case "#O":
                            {
                                CatInfo c = new CatInfo(); c.Key = f[1]; c.Zh = f[2]; c.Ru = f[3];
                                c.City = f.Length > 4 ? f[4] : ""; c.Note = f.Length > 5 ? f[5] : "";
                                c.N = f.Length > 6 ? int.Parse(f[6]) : 0; d.Orgs[c.Key] = c; break;
                            }
                        case "#E":
                            {
                                Rec r = new Rec();
                                r.Idx = f[1]; r.Type = f[2]; r.Org = f[3]; r.Prefix = f[4];
                                r.Series = int.Parse(f[5]); r.Roles = f[6]; r.Nato = f[7]; r.Ru = f[8]; r.Zh = f[9];
                                r.SIdx = Sq(r.Idx); r.SZh = Sq(r.Zh); r.SRu = Sq(r.Ru); r.SNato = Sq(r.Nato);
                                if (f.Length > 10) r.LitKind = f[10];
                                if (f.Length > 11) r.LitSrc = f[11];
                                if (f.Length > 12) r.LitUrl = f[12];
                                if (f.Length > 13) r.LitQuote = f[13];
                                if (f.Length > 14) r.Aka = f[14].Replace(';', ' ');
                                if (f.Length > 15) r.UsedOn = f[15].Replace(';', ' ');
                                if (f.Length > 16) r.Parts = f[16].Replace(';', ' ');
                                r.SAka = Sq(r.Aka);
                                r.SUsedOn = Sq(r.UsedOn); r.SParts = Sq(r.Parts);
                                r.SIdxLat = Sq(Tr(r.Idx)); r.SIdxGost = Sq(TrGost(r.Idx));
                                r.SAkaLat = Sq(Tr(r.Aka)); r.SAkaGost = Sq(TrGost(r.Aka));
                                r.SRuLat = Sq(Tr(r.Ru));
                                d.Recs.Add(r); break;
                            }
                        case "#W": d.AddWiki(null, f); break;
                        case "#WL": d.AddWiki(f[1], f); break;
                        case "#K": d.LS[f[1]] = f.Length > 2 ? f[2] : ""; break;
                        case "#B":
                            {
                                GbtuRec g = new GbtuRec();
                                g.Key = f[1]; g.Desig = f[2]; g.Note = f[3];
                                int n = f.Length > 4 ? int.Parse(f[4]) : 0;
                                int p = 5;
                                for (int i = 0; i < n; i++)
                                {
                                    if (p + 2 >= f.Length + 1 && p + 1 > f.Length - 1) break;
                                    SrcSeg sg = new SrcSeg();
                                    sg.Src = p < f.Length ? f[p] : "";
                                    sg.Desig = p + 1 < f.Length ? f[p + 1] : "";
                                    sg.Note = p + 2 < f.Length ? f[p + 2] : "";
                                    g.Srcs.Add(sg); p += 3;
                                }
                                d.Gbtu.Add(g); break;
                            }
                        case "#I":
                            {
                                GiuRec g = new GiuRec();
                                g.Title = f[1]; g.Desig = f[2]; g.Section = f[3]; g.Purpose = f[4];
                                g.Kvt = f.Length > 5 ? f[5] : ""; g.Okp = f.Length > 6 ? f[6] : "";
                                g.Ekps = f.Length > 7 ? f[7] : ""; g.Adopted = f.Length > 8 ? f[8] : "";
                                g.Dev = f.Length > 9 ? f[9] : "";
                                d.Giu.Add(g); break;
                            }
                        case "#A": d.Gau.Add(new AmmoRec { Key = f[1], Note = f.Length > 2 ? f[2] : "", Eng = f.Length > 3 && f[3] == "1" }); break;
                        case "#M": d.Mo.Add(new AmmoRec { Key = f[1], Note = f.Length > 2 ? f[2] : "" }); break;
                        case "#Z": d.TZ[f[1]] = f.Length > 2 ? f[2] : ""; break;
                        case "#D": d.DZ[f[1]] = f.Length > 2 ? f[2] : ""; break;
                        case "#N": d.Abbr.Add(new CatInfo { Key = f[1], Zh = f.Length > 2 ? f[2] : "", N = f.Length > 3 ? int.Parse(f[3]) : 0 }); break;
                        case "#P": d.Nicks.Add(new CatInfo { Key = f[1], Zh = f.Length > 2 ? f[2] : "", N = f.Length > 3 ? int.Parse(f[3]) : 0 }); break;
                        case "#R":
                            {
                                RefInfo r = new RefInfo();
                                r.Cat = f[1]; r.Title = f.Length > 2 ? f[2] : "";
                                r.Url = f.Length > 3 ? f[3] : ""; r.Note = f.Length > 4 ? f[4] : "";
                                r.N = f.Length > 5 ? int.Parse(f[5]) : 0;
                                d.Refs.Add(r); break;
                            }
                    }
                }
            }
            d.LoadImages(asm);
            d.BuildIndex();
            return d;
        }

        void AddWiki(string idx, string[] f)
        {
            WikiRec w = new WikiRec();
            int o = idx == null ? 1 : 2;                 // #W: idx at 1; #WL: idx,lang then the same
            w.Idx = f[1]; w.Lang = idx == null ? "ru" : f[2];
            w.Title = f[o + 1]; w.Url = f[o + 2]; w.Extract = f[o + 3]; w.Thumb = f[o + 4];
            w.Lic = f.Length > o + 5 ? f[o + 5] : ""; w.By = f.Length > o + 6 ? f[o + 6] : "";
            w.Tier = f.Length > o + 7 ? f[o + 7] : "";
            if (idx == null) Wiki[w.Idx] = w;
            else
            {
                Dictionary<string, WikiRec> m;
                if (!WikiAlt.TryGetValue(w.Idx, out m)) { m = new Dictionary<string, WikiRec>(); WikiAlt[w.Idx] = m; }
                m[w.Lang] = w;
            }
        }

        void BuildIndex()
        {
            // master row a catalogue designation can jump to (used by the tree/search)
            foreach (Rec r in Recs)
            {
                SrcSeg s;
                if (!ByMaster.TryGetValue(Norm(r.Idx), out s))
                {
                    s = new SrcSeg(); s.Src = r.Idx; ByMaster[Norm(r.Idx)] = s;
                }
            }
        }

        public static string Norm(string s)
        {
            StringBuilder b = new StringBuilder();
            foreach (char c in s.ToUpperInvariant())
            {
                if (c == ' ' || c == '-' || c == '.' || c == 'Ё') continue;
                b.Append(c == 'Ё' ? 'Е' : c);
            }
            return b.ToString();
        }

        void LoadImages(Assembly asm)
        {
            using (Stream s = asm.GetManifestResourceStream("img.bin"))
            {
                if (s == null) return;
                byte[] all = new byte[s.Length];
                int read = 0;
                while (read < all.Length) { int n = s.Read(all, read, all.Length - read); if (n <= 0) break; read += n; }
                imgBlob = all;
                int count = BitConverter.ToInt32(all, 6);
                int p = 14;
                for (int i = 0; i < count; i++)
                {
                    int nameLen = BitConverter.ToInt32(all, p); p += 4;
                    int dataLen = BitConverter.ToInt32(all, p); p += 4;
                    string name = Encoding.UTF8.GetString(all, p, nameLen); p += nameLen;
                    imgIndex[name] = new int[] { p, dataLen };
                    p += dataLen;
                }
            }
        }

        public Image GetImage(string thumb)
        {
            if (thumb == null || thumb.Length == 0 || imgBlob == null) return null;
            string name = thumb;
            int i = name.LastIndexOf('/');
            if (i >= 0) name = name.Substring(i + 1);
            Image img;
            if (imgCache.TryGetValue(name, out img)) return img;
            int[] off;
            if (!imgIndex.TryGetValue(name, out off)) return null;
            try
            {
                MemoryStream ms = new MemoryStream(imgBlob, off[0], off[1], false);
                img = Image.FromStream(ms);
            }
            catch { return null; }
            imgCache[name] = img;
            imgLru.Add(name);
            while (imgLru.Count > 60) { imgCache.Remove(imgLru[0]); imgLru.RemoveAt(0); }
            return img;
        }

        // The picture actually shown for an entry: its own, else the first foreign edition that has one.
        public string PictureOf(string idx, out WikiRec owner)
        {
            owner = null;
            WikiRec w;
            if (Wiki.TryGetValue(idx, out w)) { owner = w; if (w.Thumb.Length > 0) return w.Thumb; }
            Dictionary<string, WikiRec> m;
            if (WikiAlt.TryGetValue(idx, out m))
            {
                foreach (KeyValuePair<string, WikiRec> kv in m)
                    if (kv.Value.Thumb.Length > 0) { owner = kv.Value; return kv.Value.Thumb; }
            }
            return null;
        }

        public string Tz(string ru)
        {
            if (ru == null || ru.Length == 0) return "";
            string v;
            if (TZ.TryGetValue(ru, out v)) return v;
            string key = ru.Replace('\t', ' ').Replace('\n', ' ').Replace('\r', ' ');
            if (TZ.TryGetValue(key, out v)) return v;
            return "";
        }

        public string TypeLabel(string key, bool zh)
        {
            CatInfo c;
            if (key != null && Types.TryGetValue(key, out c)) return zh ? c.Zh : c.Ru;
            return key == null ? "" : key;
        }

        public string OrgLabel(string key, bool zh)
        {
            if (key == null || key.Length == 0) return "";
            CatInfo c;
            if (Orgs.TryGetValue(key, out c)) return zh ? c.Zh : c.Ru;
            return key;
        }
    }
}
