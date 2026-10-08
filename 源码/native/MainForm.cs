// Native WinForms UI for the GRAU index (no browser, no HTML).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace GrauIndex
{
    public class MainForm : Form
    {
        Data D;
        bool Zh = true;                 // interface + description language
        public bool Dark = true;
        List<Rec> view = new List<Rec>();
        string fSeries = "", fType = "", fOrg = "", fFam = "";   // filter keys ("" = no filter)
        int fSource = 0;                              // 0 all, 2 only supplementary, 1 only core
        int fCard = 0;                                // 0 all, 1 has card, 2 no card
        string q = "";
        int qField = 0;
        bool onlyNames;                               // search only index / codes, not descriptions
        bool Lat = false;                             // show index designations in Latin script
        string[] qtok = new string[0];
        Dictionary<string, string> fTypeLbl = new Dictionary<string, string>();
        Dictionary<string, string> fOrgLbl = new Dictionary<string, string>();
        string shotFile = null, selfTest = null, diagFile = null, csvFile = null;
        int startTab = 0;

        TextBox txtSearch, txtTree;
        ComboBox cmbField, cmbCat, cmbRef, cmbBib;
        CheckBox chkName;
        ComboBox cmbSeries, cmbFam, cmbType, cmbOrg, cmbLit, cmbWiki;
        List<int> cSeries = new List<int>();          // combo index -> D.Series index
        List<string> cFam = new List<string>();       // combo index -> prefix
        List<string> cType = new List<string>();      // combo index -> type key
        List<string> cOrg = new List<string>();       // combo index -> org key
        Button btnClear, btnExport, btnLang, btnTheme, btnScript, btnConv, btnJump, btnResetF, btnAbout;
        Label lblStat;
        TabControl tabs;
        TabPage tabMain, tabCat, tabRef, tabBib;
        TreeView tv;
        DataGridView dgv, dgvCat, dgvRef, dgvBib;
        RichTextBox rtb, rtbCat, rtbRef, rtbBib;
        PictureBox pic;
        ListBox lstEd;
        FlowLayoutPanel relBar;
        ListBox sugg;                                 // live index suggestions under the search box
        int suggSel = -1;
        List<WikiRec> edList = new List<WikiRec>();
        Timer debounce;
        StatusStrip status; ToolStripStatusLabel sl;
        ToolTip tip = new ToolTip();
        Font fPhrase = null;                          // 详情页首行「一句话中文」的字体
        ContextMenuStrip ctxRow;
        SplitContainer outer, inner, catSplit, refSplit, bibSplit;
        Panel topBar, filterBar;
        bool splitsOuter, splitsInner, splitsCat, splitsRef, splitsBib;
        bool syncing;                                 // guards combo<->tree feedback loops
        string catMode = "b", refMode = "abbr", bibCat = "";
        bool bibSync;
        List<string> cBib = new List<string>();       // bibliography combo index -> category

        static readonly Color BgDark = Color.FromArgb(24, 26, 30);
        static readonly Color BgDark2 = Color.FromArgb(32, 35, 40);
        static readonly Color FgDark = Color.FromArgb(226, 230, 236);
        static readonly Color DimDark = Color.FromArgb(150, 158, 170);
        static readonly Color Accent = Color.FromArgb(90, 165, 235);

        // WinForms ignores the exe icon unless Form.Icon is set explicitly: load the embedded badge.
        void SetWindowIcon()
        {
            try
            {
                System.Reflection.Assembly asm = System.Reflection.Assembly.GetExecutingAssembly();
                using (Stream st = asm.GetManifestResourceStream("grau.ico"))
                {
                    if (st != null) Icon = new Icon(st, 32, 32);
                }
            }
            catch { }
        }

        public MainForm(Data d, int tab, string search, int field, bool zh)
        {
            D = d; startTab = tab; Zh = zh;
            BuildSearchLabels();
            SetWindowIcon();
            Text = "ГРАУ / ГАУ 索引号总表  ·  " + (d.Recs.Count) + " 条  ·  " + d.ByLine;
            StartPosition = FormStartPosition.CenterScreen;
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            ClientSize = new Size(Math.Min(1720, wa.Width - 80), Math.Min(1040, wa.Height - 80));
            MinimumSize = new Size(1000, 640);
            Font = new Font("Microsoft YaHei UI", 9F);
            BuildUi();
            ApplyTheme();
            Load += delegate
            {
                tabs.SelectedIndex = startTab;
                FillFilters();
                BuildTree();
                if (search != null && search.Length > 0) { txtSearch.Text = search; q = search; }
                qField = field; cmbField.SelectedIndex = field;
                SyncFromFilter();
                FixSplits();
                LayoutFilters();
                ApplyFilter();
                Shown += delegate { FixSplits(); };
                if (shotFile != null) { Timer t = new Timer(); t.Interval = 1800; t.Tick += delegate { t.Stop(); if (CtxForShot) ShowRowMenu(); Shoot(); }; t.Start(); }
                if (csvFile != null) { Timer tc = new Timer(); tc.Interval = 900; tc.Tick += delegate { tc.Stop(); WriteCsv(csvFile); Close(); }; tc.Start(); }
                if (selfTest != null) { Timer t2 = new Timer(); t2.Interval = 400; t2.Tick += delegate { t2.Stop(); SelfTest(); }; t2.Start(); }
                if (diagFile != null)
                {
                    Timer t3 = new Timer(); t3.Interval = 1500;
                    int n = 0;
                    t3.Tick += delegate
                    {
                        n++;
                        DumpBounds(diagFile + "." + n + ".txt");
                        if (n >= 3) t3.Stop();
                    };
                    t3.Start();
                }
            };
        }

        public void SetModes(string shot, string selftest) { shotFile = shot; selfTest = selftest; }
        public bool CtxForShot = false;
        public void ShowRowMenu()
        {
            if (view.Count == 0) return;
            if (dgv.CurrentCell == null || dgv.CurrentCell.RowIndex < 0) dgv.CurrentCell = dgv.Rows[0].Cells[0];
            BuildRowMenu();
            ctxRow.Show(dgv, new Point(160, 90));
        }
        public void SetDiag(string f) { diagFile = f; }
        public void SetCsv(string f) { csvFile = f; }
        public void ApplyThemePublic() { ApplyTheme(); }

        // preset filters (used by the command line for testing / scripting)
        public void SetFilter(string ser, string fam, string typ, string org, int lit, int card)
        {
            if (ser != null) fSeries = ser;
            if (fam != null) fFam = fam;
            if (typ != null) fType = typ;
            if (org != null) fOrg = org;
            if (lit >= 0) fSource = lit;
            if (card >= 0) fCard = card;
        }

        // ------------------------------------------------- remembered settings
        static string CfgPath()
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "grau_index");
            try { Directory.CreateDirectory(dir); } catch { }
            return Path.Combine(dir, "settings.txt");
        }
        void SaveCfg()
        {
            try { File.WriteAllText(CfgPath(), "lang=" + (Zh ? "zh" : "ru") + "\r\ndark=" + (Dark ? "1" : "0") + "\r\nlat=" + (Lat ? "1" : "0") + "\r\n"); }
            catch { }
        }
        void LoadCfg()
        {
            try
            {
                if (!File.Exists(CfgPath())) return;
                foreach (string ln in File.ReadAllLines(CfgPath()))
                {
                    int i = ln.IndexOf('='); if (i < 0) continue;
                    string k = ln.Substring(0, i).Trim(), v = ln.Substring(i + 1).Trim();
                    if (k == "lang") Zh = (v != "ru");
                    else if (k == "dark") Dark = (v == "1");
                    else if (k == "lat") Lat = (v == "1");
                }
            }
            catch { }
        }
        public void SetPrefs(bool zhGiven, bool zh, bool lightGiven, bool light)
        {
            LoadCfg();
            if (zhGiven) Zh = zh;
            if (lightGiven) Dark = !light;
            if (btnLang != null) btnLang.Text = Zh ? "Русский" : "中文";
            if (btnTheme != null) btnTheme.Text = Dark ? "浅色" : "深色";
            UpdateScriptBtn();
            ApplyTheme();
        }

        static Button MkBtn(string text, EventHandler onClick)
        {            Button b = new Button();
            b.Text = text; b.AutoSize = true; b.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            b.Height = 27; b.Margin = new Padding(6, 0, 0, 0);
            b.Click += onClick;
            return b;
        }

        // ------------------------------------------------- cyrillic <-> latin helpers
        // the index column, the detail header and the CSV export follow this switch
        public void SetLat(bool lat)
        {
            Lat = lat;
            UpdateScriptBtn();
            if (dgv != null) dgv.Invalidate();
            ShowDetail();
        }

        void UpdateScriptBtn()
        {
            if (btnScript == null) return;
            btnScript.Text = Lat ? (Zh ? "西里尔" : "кириллица") : (Zh ? "拉丁" : "латиница");
        }

        void ToggleScript()
        {
            Lat = !Lat;
            UpdateScriptBtn(); LayoutTop();
            dgv.Invalidate(); ShowDetail(); SaveCfg();
        }

        // convert the text in the search box to the other script and search with it
        void FlipQuery()
        {
            string src = txtSearch.Text;
            if (src.Trim().Length == 0) return;
            string dst = Data.Flip(src);
            if (dst == src) return;
            txtSearch.Text = dst;
            txtSearch.SelectionStart = txtSearch.Text.Length;
            q = Data.Sq(dst);
            ApplyFilter();
        }

        // Lay the toolbar buttons out from the right edge so nothing is clipped at 150% DPI.
        void LayoutTop()
        {
            if (topBar == null) return;
            int x = topBar.ClientSize.Width - 10;
            x = Place(btnAbout, x);
            x = Place(btnTheme, x);
            x = Place(btnScript, x);
            x = Place(btnLang, x);
            x = Place(btnConv, x);
            x = Place(btnExport, x);
            x = Place(btnClear, x);
            lblStat.Location = new Point(Math.Max(650, x - lblStat.Width - 14), 14);
        }

        int Place(Control c, int right)
        {
            c.Location = new Point(right - c.Width, 9);
            return c.Left - 6;
        }

        // ------------------------------------------------------- filter bar
        ComboBox MkFilter(EventHandler onSel)
        {
            ComboBox c = new ComboBox();
            c.DropDownStyle = ComboBoxStyle.DropDownList;
            c.DropDownHeight = 420;
            c.IntegralHeight = false;
            c.SelectedIndexChanged += onSel;
            filterBar.Controls.Add(c);
            return c;
        }

        // the six filter combos share the bar width; the reset button sits at the right
        void LayoutFilters()
        {
            if (filterBar == null) return;
            ComboBox[] cs = new ComboBox[] { cmbSeries, cmbFam, cmbType, cmbOrg, cmbLit, cmbWiki };
            double[] wt = new double[] { 1.30, 1.15, 1.25, 1.35, 0.95, 0.85 };
            int n = cs.Length;
            if (btnResetF != null) btnResetF.Location = new Point(filterBar.ClientSize.Width - 8 - btnResetF.Width, 3);
            int right = (btnResetF != null ? btnResetF.Left : filterBar.ClientSize.Width) - 12;
            int avail = right - 8 - 6 * (n - 1);
            if (avail < 300) avail = 300;
            double tot = 0; foreach (double d in wt) tot += d;
            int x = 8;
            for (int i = 0; i < n; i++)
            {
                int w = (int)Math.Round(avail * wt[i] / tot);
                if (w < 90) w = 90;
                cs[i].Location = new Point(x, 4);
                cs[i].Width = w;
                x += w + 6;
            }
        }

        void PickSeries() { if (syncing) return; int i = cmbSeries.SelectedIndex; fSeries = (i <= 0 || i - 1 >= cSeries.Count) ? "" : D.Series[cSeries[i - 1]].Key; fFam = ""; fType = ""; fOrg = ""; SyncFromFilter(); ApplyFilter(); }
        void PickFam() { if (syncing) return; int i = cmbFam.SelectedIndex; fFam = (i <= 0 || i - 1 >= cFam.Count) ? "" : cFam[i - 1]; fSeries = ""; fType = ""; fOrg = ""; SyncFromFilter(); ApplyFilter(); }
        void PickType() { if (syncing) return; int i = cmbType.SelectedIndex; fType = (i <= 0 || i - 1 >= cType.Count) ? "" : cType[i - 1]; fSeries = ""; fFam = ""; fOrg = ""; SyncFromFilter(); ApplyFilter(); }
        void PickOrg() { if (syncing) return; int i = cmbOrg.SelectedIndex; fOrg = (i <= 0 || i - 1 >= cOrg.Count) ? "" : cOrg[i - 1]; fSeries = ""; fFam = ""; fType = ""; SyncFromFilter(); ApplyFilter(); }

        // build the item lists (labels are filled in by RelabelFilters so they follow the language)
        void FillFilters()
        {
            cSeries.Clear(); cFam.Clear(); cType.Clear(); cOrg.Clear();
            foreach (ComboBox c in new ComboBox[] { cmbSeries, cmbFam, cmbType, cmbOrg, cmbLit, cmbWiki }) c.Items.Clear();

            cmbSeries.Items.Add("");
            for (int i = 0; i < D.Series.Count; i++)
            {
                if (D.Series[i].N == 0) continue;
                cSeries.Add(i); cmbSeries.Items.Add("");
            }
            // v1.4.4: 字头按大类分组排序（先大类，再索引自然序），标签里带大类，不再是一长串平铺
            Dictionary<string, int> fam = new Dictionary<string, int>();
            foreach (Rec r in D.Recs) { if (r.Prefix.Length == 0) continue; int v; fam.TryGetValue(r.Prefix, out v); fam[r.Prefix] = v + 1; }
            famSeriesIdx.Clear();
            for (int i = 0; i < D.Series.Count; i++)
            {
                SerInfo s = D.Series[i];
                if (s.Prefixes == null || s.Prefixes.Length == 0) continue;
                foreach (string p in s.Prefixes.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries))
                    if (!famSeriesIdx.ContainsKey(p)) famSeriesIdx[p] = i;
            }
            List<string> famKeys = new List<string>(fam.Keys);
            famKeys.Sort(delegate(string a, string b)
            {
                int sa = 9999, sb = 9999;
                famSeriesIdx.TryGetValue(a, out sa); famSeriesIdx.TryGetValue(b, out sb);
                if (sa != sb) return sa < sb ? -1 : 1;
                int c = CmpIdx(a, b);
                return c != 0 ? c : string.Compare(a, b, StringComparison.Ordinal);
            });
            cmbFam.Items.Add("");
            foreach (string p in famKeys) { cFam.Add(p); cmbFam.Items.Add(""); }
            cmbFamCount = new Dictionary<string, int>(fam);

            List<string> tk = new List<string>(D.Types.Keys);
            tk.Sort(delegate(string a, string b) { return string.Compare(D.TypeLabel(a, false), D.TypeLabel(b, false), StringComparison.Ordinal); });
            cmbType.Items.Add("");
            foreach (string k in tk) { cType.Add(k); cmbType.Items.Add(""); }
            List<string> ok = new List<string>(D.Orgs.Keys);
            ok.Sort(delegate(string a, string b) { return string.Compare(D.OrgLabel(a, false), D.OrgLabel(b, false), StringComparison.Ordinal); });
            cmbOrg.Items.Add("");
            foreach (string k in ok) { cOrg.Add(k); cmbOrg.Items.Add(""); }

            cmbLit.Items.AddRange(new object[] { "", "", "" });
            cmbWiki.Items.AddRange(new object[] { "", "", "" });
            syncing = true;                       // do not let the reset fire the Pick* handlers
            cmbSeries.SelectedIndex = 0; cmbFam.SelectedIndex = 0; cmbType.SelectedIndex = 0; cmbOrg.SelectedIndex = 0;
            cmbLit.SelectedIndex = 0; cmbWiki.SelectedIndex = 0;
            syncing = false;
            RelabelFilters();
        }

        Dictionary<string, int> cmbFamCount = new Dictionary<string, int>();
        Dictionary<string, int> famSeriesIdx = new Dictionary<string, int>();   // 字头 -> 大类序号

        // (re)write every item text for the current interface language, keeping the selection
        // v1.4.6: 第一级「索引体系组」的短标签（数据层由 sys_classify.GROUP 写入 #S 第 10/11 字段）
        string GrpShort(SerInfo s)
        {
            string g = Zh ? s.GrpZh : s.GrpRu;
            if (g.Length == 0) g = s.GrpZh.Length > 0 ? s.GrpZh : s.GrpRu;
            return g;
        }

        // v1.4.2.1: 字头含义的「短形」——仅在足够短时内联到树上（长句只留在悬停提示与详情面板）
        string ShortMean(PrefNote p, bool zh)
        {
            if (p == null) return "";
            string s = zh ? p.Zh : p.Ru;
            if (s.Length == 0) s = zh ? p.Ru : p.Zh;
            if (s.Length == 0) return "";
            int max = zh ? 14 : 30;
            if (s.Length > max) return "";
            return s;
        }

        void RelabelFilters()
        {
            if (cmbSeries == null || cmbSeries.Items.Count == 0) return;
            syncing = true;
            int s0 = cmbSeries.SelectedIndex, f0 = cmbFam.SelectedIndex, t0 = cmbType.SelectedIndex, o0 = cmbOrg.SelectedIndex, l0 = cmbLit.SelectedIndex, w0 = cmbWiki.SelectedIndex;
            cmbSeries.Items[0] = Zh ? "序列：全部" : "Серия: все";
            for (int i = 0; i < cSeries.Count; i++)
            {
                SerInfo s = D.Series[cSeries[i]];
                // v1.4.5: 大类＝索引体系，标签取数据层的短标签（短标签缺失时退回 key）
                string lbl = (Zh ? s.ShortZh : s.ShortRu);
                if (lbl.Length == 0) lbl = s.Kind == "l" ? s.Letter : s.Key;
                // v1.4.6: 三级标签——「索引体系组 · 大类」与「索引体系组 · 大类 · 字头」
                string g0 = GrpShort(s); if (g0.Length > 0) lbl = g0 + " · " + lbl;
                cmbSeries.Items[i + 1] = lbl + "  " + (Zh ? s.Zh : s.Ru);
            }
            cmbFam.Items[0] = Zh ? "索引族：全部（按大类分组）" : "Семейство: все (по группам)";
            for (int i = 0; i < cFam.Count; i++)
            {
                int n; cmbFamCount.TryGetValue(cFam[i], out n);
                int si; string grp = "";
                if (famSeriesIdx.TryGetValue(cFam[i], out si) && si >= 0 && si < D.Series.Count)
                {
                    SerInfo g = D.Series[si];
                    string gl = (Zh ? g.ShortZh : g.ShortRu);
                    if (gl.Length == 0) gl = g.Kind == "l" ? (Zh ? "字母族 " : "Серия ") + g.Letter : (Zh ? "第" + g.N + "类" : "Гр." + g.N);
                    string g2 = GrpShort(g);
                    grp = (g2.Length > 0 ? g2 + " · " : "") + gl + " · ";
                }
                cmbFam.Items[i + 1] = grp + cFam[i] + "  (" + n + ")";
            }
            cmbType.Items[0] = Zh ? "器材类型：全部" : "Тип: все";
            for (int i = 0; i < cType.Count; i++) cmbType.Items[i + 1] = D.TypeLabel(cType[i], Zh) + "  (" + D.Types[cType[i]].N + ")";
            cmbOrg.Items[0] = Zh ? "研制／生产单位：全部" : "Организация: все";
            for (int i = 0; i < cOrg.Count; i++) cmbOrg.Items[i + 1] = D.OrgLabel(cOrg[i], Zh) + "  (" + D.Orgs[cOrg[i]].N + ")";
            cmbLit.Items[0] = Zh ? "来源：全部" : "Источник: все";
            cmbLit.Items[1] = Zh ? "来源：仅三源 (" + D.Recs.Count + ")" : "Источник: только основные";
            cmbLit.Items[2] = Zh ? "来源：仅补充" : "Источник: только доп.";
            cmbWiki.Items[0] = Zh ? "卡片：全部" : "Статья: все";
            cmbWiki.Items[1] = Zh ? "卡片：有条目" : "Статья: есть";
            cmbWiki.Items[2] = Zh ? "卡片：无条目" : "Статья: нет";
            if (s0 >= 0) cmbSeries.SelectedIndex = s0;
            if (f0 >= 0) cmbFam.SelectedIndex = f0;
            if (t0 >= 0) cmbType.SelectedIndex = t0;
            if (o0 >= 0) cmbOrg.SelectedIndex = o0;
            if (l0 >= 0) cmbLit.SelectedIndex = l0;
            if (w0 >= 0) cmbWiki.SelectedIndex = w0;
            syncing = false;
            LayoutFilters();
        }

        // set the combos from the current filter keys (used when the tree drives the filter)
        void SyncFromFilter()
        {
            syncing = true;
            cmbSeries.SelectedIndex = IndexOfSeries(fSeries);
            cmbFam.SelectedIndex = fFam.Length == 0 ? 0 : cFam.IndexOf(fFam) + 1;
            cmbType.SelectedIndex = fType.Length == 0 ? 0 : cType.IndexOf(fType) + 1;
            cmbOrg.SelectedIndex = fOrg.Length == 0 ? 0 : cOrg.IndexOf(fOrg) + 1;
            cmbLit.SelectedIndex = fSource;
            cmbWiki.SelectedIndex = fCard;
            syncing = false;
        }

        int IndexOfSeries(string key)
        {
            if (key == null || key.Length == 0) return 0;
            for (int i = 0; i < cSeries.Count; i++) if (D.Series[cSeries[i]].Key == key) return i + 1;
            return 0;
        }

        class PrefixOrder : IComparer<string>
        {
            // 旧版：只比较开头数字串——已由 CmpIdx 的完整自然序取代，保留作历史参照
            public int Compare(string a, string b)
            {
                int i = 0;
                while (i < a.Length && i < b.Length && char.IsDigit(a[i]) && char.IsDigit(b[i])) i++;
                if (i > 0)
                {
                    int x = int.Parse(a.Substring(0, i)), y = int.Parse(b.Substring(0, i));
                    if (x != y) return x < y ? -1 : 1;
                }
                return string.Compare(a, b, StringComparison.OrdinalIgnoreCase);
            }
        }
        // SplitterDistance must be applied after the containers have their real size,
        // otherwise WinForms clamps it to the tiny default size (300 -> 121).
        void FixSplits()
        {
            if (!splitsOuter && outer.Width > 500)
            {
                outer.Panel1MinSize = 170; outer.Panel2MinSize = 340;
                outer.SplitterDistance = 400;
                splitsOuter = true;
            }
            if (!splitsInner && inner.Height > 450)
            {
                inner.Panel1MinSize = 220; inner.Panel2MinSize = 170;
                int detH = 320;
                if (detH > inner.Height - inner.Panel1MinSize - inner.SplitterWidth) detH = inner.Height - inner.Panel1MinSize - inner.SplitterWidth;
                inner.SplitterDistance = inner.Height - detH - inner.SplitterWidth;
                splitsInner = true;
            }
            if (!splitsCat && catSplit.Height > 200)
            {
                catSplit.Panel1MinSize = 120; catSplit.Panel2MinSize = 100;
                int d = catSplit.Height - 280 - catSplit.SplitterWidth;
                if (d > catSplit.Panel1MinSize) { catSplit.SplitterDistance = d; splitsCat = true; }
            }
            if (!splitsRef && refSplit.Height > 200)
            {
                refSplit.Panel1MinSize = 120; refSplit.Panel2MinSize = 100;
                int d = refSplit.Height - 280 - refSplit.SplitterWidth;
                if (d > refSplit.Panel1MinSize) { refSplit.SplitterDistance = d; splitsRef = true; }
            }
            if (!splitsBib && bibSplit.Height > 200)
            {
                bibSplit.Panel1MinSize = 120; bibSplit.Panel2MinSize = 100;
                int d = bibSplit.Height - 280 - bibSplit.SplitterWidth;
                if (d > bibSplit.Panel1MinSize) { bibSplit.SplitterDistance = d; splitsBib = true; }
            }
        }

        void DumpBounds(string f)
        {
            StringBuilder b = new StringBuilder();
            b.AppendLine("dpi=" + CreateGraphics().DpiX + " autoscale=" + AutoScaleFactor + " autoMode=" + AutoScaleMode);
            b.AppendLine("VirtualScreen=" + SystemInformation.VirtualScreen + " Primary=" + Screen.PrimaryScreen.Bounds + " PrimaryWA=" + Screen.PrimaryScreen.WorkingArea);
            b.AppendLine("FromControl=" + Screen.FromControl(this).Bounds + " WA=" + Screen.FromControl(this).WorkingArea);
            b.AppendLine("form ClientSize=" + ClientSize + " Bounds=" + Bounds);
            b.AppendLine("tabs=" + tabs.Bounds + " tabMain=" + tabMain.Bounds);
            b.AppendLine("outer=" + outer.Bounds + " panel1=" + outer.Panel1.Bounds + " panel2=" + outer.Panel2.Bounds + " split=" + outer.SplitterDistance);
            b.AppendLine("inner=" + inner.Bounds + " panel1=" + inner.Panel1.Bounds + " panel2=" + inner.Panel2.Bounds + " split=" + inner.SplitterDistance);
            b.AppendLine("dgv=" + dgv.Bounds + " rows=" + dgv.RowCount);
            b.AppendLine("pic=" + pic.Bounds + " rtb=" + rtb.Bounds + " lstEd=" + lstEd.Bounds + " rtbLen=" + rtb.TextLength);
            b.AppendLine("status=" + status.Bounds + " visible=" + status.Visible);
            File.WriteAllText(f, b.ToString(), new UTF8Encoding(false));
        }

        // ---------------------------------------------------------------- UI
        void BuildUi()
        {
            topBar = new Panel(); topBar.Dock = DockStyle.Top; topBar.Height = 44; topBar.Padding = new Padding(8, 6, 8, 4);
            Controls.Add(topBar);

            txtSearch = new TextBox(); txtSearch.Width = 320; txtSearch.Location = new Point(8, 11);
            txtSearch.TextChanged += delegate { debounce.Stop(); debounce.Start(); UpdateSuggest(); };
            txtSearch.KeyDown += SearchKey;
            txtSearch.Leave += delegate { if (!sugg.Focused) HideSuggest(); };
            topBar.Controls.Add(txtSearch);

            sugg = new ListBox();
            sugg.Visible = false; sugg.TabStop = false; sugg.Width = 430; sugg.Height = 0;
            sugg.Font = new Font("Segoe UI", 9F);
            sugg.MouseDown += delegate(object s, MouseEventArgs e)
            {
                int i = sugg.IndexFromPoint(e.Location);
                if (i >= 0) { sugg.SelectedIndex = i; ApplySuggest(); }
            };
            Controls.Add(sugg);

            cmbField = new ComboBox(); cmbField.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbField.Width = 130; cmbField.Location = new Point(336, 10); cmbField.Items.AddRange(new object[] { "全部字段", "索引号", "中文说明", "俄文说明", "北约代号" }); cmbField.SelectedIndex = 0;
            cmbField.SelectedIndexChanged += delegate { qField = cmbField.SelectedIndex; ApplyFilter(); UpdateSuggest(); };
            topBar.Controls.Add(cmbField);

            chkName = new CheckBox(); chkName.AutoSize = true; chkName.Location = new Point(474, 13);
            chkName.Text = "仅索引/代号";
            chkName.CheckedChanged += delegate { onlyNames = chkName.Checked; ApplyFilter(); };
            topBar.Controls.Add(chkName);

            btnClear = MkBtn("重置", delegate { ResetFilters(); });
            btnExport = MkBtn("导出 CSV", delegate { ExportCsv(); });
            btnLang = MkBtn("Русский", delegate { Zh = !Zh; btnLang.Text = Zh ? "Русский" : "中文"; ApplyLang(); LayoutTop(); SaveCfg(); });
            btnTheme = MkBtn("浅色", delegate { Dark = !Dark; btnTheme.Text = Dark ? "浅色" : "深色"; ApplyTheme(); LayoutTop(); SaveCfg(); });
            btnScript = MkBtn("拉丁", delegate { ToggleScript(); });
            btnConv = MkBtn("转写", delegate { FlipQuery(); });
            btnAbout = MkBtn("关于 / 免责声明", delegate { ShowAbout(); });
            foreach (Button bb in new Button[] { btnClear, btnExport, btnConv, btnLang, btnScript, btnTheme, btnAbout }) topBar.Controls.Add(bb);
            tip.SetToolTip(btnScript, "索引号显示：西里尔 ⇄ 拉丁\nИндексы: кириллица ⇄ латиница");
            tip.SetToolTip(btnConv, "把搜索框里的文字在两种字母间转换\nПеревести запрос: кириллица ⇄ латиница");

            lblStat = new Label(); lblStat.AutoSize = true; lblStat.Location = new Point(760, 14);
            topBar.Controls.Add(lblStat);
            topBar.Resize += delegate { LayoutTop(); };

            // ---- filter bar (second row)
            filterBar = new Panel(); filterBar.Dock = DockStyle.Top; filterBar.Height = 36; filterBar.Padding = new Padding(8, 4, 8, 4);
            Controls.Add(filterBar);
            cmbSeries = MkFilter(delegate { PickSeries(); });
            cmbFam = MkFilter(delegate { PickFam(); });
            cmbType = MkFilter(delegate { PickType(); });
            cmbOrg = MkFilter(delegate { PickOrg(); });
            cmbLit = MkFilter(delegate { if (!syncing) { fSource = cmbLit.SelectedIndex; ApplyFilter(); } });
            cmbWiki = MkFilter(delegate { if (!syncing) { fCard = cmbWiki.SelectedIndex; ApplyFilter(); } });
            btnResetF = MkBtn("重置筛选", delegate { ResetFilters(); });
            filterBar.Controls.Add(btnResetF);
            filterBar.Resize += delegate { LayoutFilters(); };

            tabs = new TabControl(); tabs.Dock = DockStyle.Fill;
            tabMain = new TabPage("索引总表"); tabCat = new TabPage("其他总局目录"); tabRef = new TabPage("详查索引");
            tabBib = new TabPage("参考文献");
            tabs.TabPages.Add(tabMain); tabs.TabPages.Add(tabCat); tabs.TabPages.Add(tabRef); tabs.TabPages.Add(tabBib);
            Controls.Add(tabs);
            // docking runs in reverse z-order: tabs (fill) last, filterBar above it, topBar on top
            Controls.SetChildIndex(tabs, 0);
            Controls.SetChildIndex(filterBar, 1);
            Controls.SetChildIndex(topBar, 2);

            // --- main tab
            outer = new SplitContainer(); outer.Dock = DockStyle.Fill; outer.SplitterDistance = 400; outer.FixedPanel = FixedPanel.Panel1;
            tabMain.Controls.Add(outer);

            txtTree = new TextBox(); txtTree.Dock = DockStyle.Top; txtTree.TextChanged += delegate { BuildTree(); };
            outer.Panel1.Controls.Add(txtTree);
            tv = new TreeView(); tv.Dock = DockStyle.Fill; tv.HideSelection = false;
            tv.ShowNodeToolTips = true;   // v1.4.2.1: 字头含义以悬停提示显示
            tv.AfterSelect += delegate { OnTreeSelect(); };
            outer.Panel1.Controls.Add(tv); tv.BringToFront();

            inner = new SplitContainer(); inner.Dock = DockStyle.Fill; inner.Orientation = Orientation.Horizontal; inner.FixedPanel = FixedPanel.Panel2;
            outer.Panel2.Controls.Add(inner);

            dgv = new DataGridView();
            StyleGrid(dgv);
            dgv.VirtualMode = true;
            dgv.Columns.Add(MkCol("索引", 88));
            dgv.Columns.Add(MkCol("类型", 118));
            dgv.Columns.Add(MkCol("中文说明", 520));
            dgv.Columns.Add(MkCol("俄文说明", 340));
            dgv.Columns.Add(MkCol("北约代号", 150));
            dgv.Columns.Add(MkCol("单位", 140));
            dgv.Columns.Add(MkCol("来源", 60));
            dgv.CellValueNeeded += delegate(object s, DataGridViewCellValueEventArgs e) { e.Value = CellText(e.RowIndex, e.ColumnIndex); };
            dgv.SelectionChanged += delegate { ShowDetail(); };
            dgv.CellDoubleClick += delegate(object s, DataGridViewCellEventArgs e) { if (e.RowIndex >= 0) ShowCard(); };
            dgv.CellPainting += HighlightCell;
            dgv.CellMouseDown += delegate(object s, DataGridViewCellMouseEventArgs e)
            {
                if (e.Button == MouseButtons.Right && e.RowIndex >= 0 && e.RowIndex < view.Count) dgv.CurrentCell = dgv.Rows[e.RowIndex].Cells[e.ColumnIndex < 0 ? 0 : e.ColumnIndex];
            };
            ctxRow = new ContextMenuStrip();
            ctxRow.Opening += delegate { BuildRowMenu(); };
            dgv.ContextMenuStrip = ctxRow;
            dgv.ColumnHeaderMouseClick += delegate(object s, DataGridViewCellMouseEventArgs e) { SortBy(e.ColumnIndex); };
            inner.Panel1.Controls.Add(dgv);

            Panel det = new Panel(); det.Dock = DockStyle.Fill;
            inner.Panel2.Controls.Add(det);
            pic = new PictureBox(); pic.Dock = DockStyle.Left; pic.Width = 340; pic.SizeMode = PictureBoxSizeMode.Zoom; pic.BackColor = Color.FromArgb(16, 17, 20);
            det.Controls.Add(pic);
            Panel detR = new Panel(); detR.Dock = DockStyle.Fill;
            det.Controls.Add(detR); detR.BringToFront();
            lstEd = new ListBox(); lstEd.Dock = DockStyle.Bottom; lstEd.Height = 84; lstEd.IntegralHeight = false;
            lstEd.DoubleClick += delegate { OpenEdition(); };
            detR.Controls.Add(lstEd);
            // component layer: clickable designations of the related rows (aka / used on / parts)
            relBar = new FlowLayoutPanel(); relBar.Dock = DockStyle.Bottom; relBar.Height = 30;
            relBar.WrapContents = false; relBar.AutoScroll = true; relBar.FlowDirection = FlowDirection.LeftToRight;
            relBar.Padding = new Padding(4, 3, 4, 0);
            detR.Controls.Add(relBar);
            rtb = new RichTextBox(); rtb.Dock = DockStyle.Fill; rtb.ReadOnly = true; rtb.BorderStyle = BorderStyle.None; rtb.WordWrap = true;
            rtb.DetectUrls = false;
            detR.Controls.Add(rtb); rtb.BringToFront();

            // --- catalogue tab
            Panel catTop = new Panel(); catTop.Dock = DockStyle.Top; catTop.Height = 34;
            tabCat.Controls.Add(catTop);
            cmbCat = new ComboBox(); cmbCat.DropDownStyle = ComboBoxStyle.DropDownList; cmbCat.Width = 260; cmbCat.Location = new Point(8, 5);
            cmbCat.Items.AddRange(new object[] { "装甲兵总局 ГБТУ 对象目录", "工兵总局 工程器材目录 (СИВ)", "旧 ГАУ 部门号 56 / 57", "МО.NN.NN 索引" });
            cmbCat.SelectedIndex = 0;
            cmbCat.SelectedIndexChanged += delegate { FillCat(); };
            catTop.Controls.Add(cmbCat);
            btnJump = new Button(); btnJump.Text = "在主表里查找"; btnJump.Location = new Point(276, 4); btnJump.Size = new Size(110, 25);
            btnJump.Click += delegate { JumpFromCat(); };
            catTop.Controls.Add(btnJump);
            catSplit = new SplitContainer(); catSplit.Dock = DockStyle.Fill; catSplit.Orientation = Orientation.Horizontal; catSplit.FixedPanel = FixedPanel.Panel2;
            tabCat.Controls.Add(catSplit); catSplit.BringToFront();
            dgvCat = new DataGridView(); StyleGrid(dgvCat); dgvCat.ReadOnly = true; dgvCat.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            dgvCat.MultiSelect = false; dgvCat.AllowUserToAddRows = false; dgvCat.RowHeadersVisible = false; dgvCat.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None;
            dgvCat.SelectionChanged += delegate { ShowCatDetail(); };
            catSplit.Panel1.Controls.Add(dgvCat);
            rtbCat = new RichTextBox(); rtbCat.Dock = DockStyle.Fill; rtbCat.ReadOnly = true; rtbCat.BorderStyle = BorderStyle.None;
            catSplit.Panel2.Controls.Add(rtbCat);

            // --- refs tab
            Panel refTop = new Panel(); refTop.Dock = DockStyle.Top; refTop.Height = 34;
            tabRef.Controls.Add(refTop);
            cmbRef = new ComboBox(); cmbRef.DropDownStyle = ComboBoxStyle.DropDownList; cmbRef.Width = 260; cmbRef.Location = new Point(8, 5);
            cmbRef.Items.AddRange(new object[] { "缩写对照", "专名与代号", "研制生产单位", "器材类型", "补充来源" });
            cmbRef.SelectedIndex = 0;
            cmbRef.SelectedIndexChanged += delegate { FillRef(); };
            refTop.Controls.Add(cmbRef);
            refSplit = new SplitContainer(); refSplit.Dock = DockStyle.Fill; refSplit.Orientation = Orientation.Horizontal; refSplit.FixedPanel = FixedPanel.Panel2;
            tabRef.Controls.Add(refSplit); refSplit.BringToFront();
            dgvRef = new DataGridView(); StyleGrid(dgvRef); dgvRef.ReadOnly = true; dgvRef.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            dgvRef.MultiSelect = false; dgvRef.AllowUserToAddRows = false; dgvRef.RowHeadersVisible = false;
            dgvRef.CellDoubleClick += delegate(object s, DataGridViewCellEventArgs e) { JumpFromRef(e.RowIndex); };
            dgvRef.SelectionChanged += delegate { ShowRefDetail(); };
            refSplit.Panel1.Controls.Add(dgvRef);
            rtbRef = new RichTextBox(); rtbRef.Dock = DockStyle.Fill; rtbRef.ReadOnly = true; rtbRef.BorderStyle = BorderStyle.None;
            refSplit.Panel2.Controls.Add(rtbRef);

            // --- bibliography tab (complete reference list, v1.4.1)
            Panel bibTop = new Panel(); bibTop.Dock = DockStyle.Top; bibTop.Height = 34;
            tabBib.Controls.Add(bibTop);
            cmbBib = new ComboBox(); cmbBib.DropDownStyle = ComboBoxStyle.DropDownList; cmbBib.Width = 320; cmbBib.Location = new Point(8, 5);
            cmbBib.DropDownHeight = 420; cmbBib.IntegralHeight = false;
            cmbBib.SelectedIndexChanged += delegate { FillBib(); };
            bibTop.Controls.Add(cmbBib);
            Label bibHint = new Label(); bibHint.AutoSize = true; bibHint.Location = new Point(340, 10);
            bibHint.Text = "双击一行：在浏览器里打开来源链接。";
            bibTop.Controls.Add(bibHint);
            bibSplit = new SplitContainer(); bibSplit.Dock = DockStyle.Fill; bibSplit.Orientation = Orientation.Horizontal; bibSplit.FixedPanel = FixedPanel.Panel2;
            tabBib.Controls.Add(bibSplit); bibSplit.BringToFront();
            dgvBib = new DataGridView(); StyleGrid(dgvBib); dgvBib.ReadOnly = true; dgvBib.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            dgvBib.MultiSelect = false; dgvBib.AllowUserToAddRows = false; dgvBib.RowHeadersVisible = false; dgvBib.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None;
            dgvBib.CellDoubleClick += delegate(object s, DataGridViewCellEventArgs e) { OpenBib(e.RowIndex); };
            dgvBib.SelectionChanged += delegate { ShowBibDetail(); };
            bibSplit.Panel1.Controls.Add(dgvBib);
            rtbBib = new RichTextBox(); rtbBib.Dock = DockStyle.Fill; rtbBib.ReadOnly = true; rtbBib.BorderStyle = BorderStyle.None;
            bibSplit.Panel2.Controls.Add(rtbBib);

            status = new StatusStrip(); sl = new ToolStripStatusLabel(""); status.Items.Add(sl); status.SizingGrip = false;
            Controls.Add(status);

            debounce = new Timer(); debounce.Interval = 250;
            debounce.Tick += delegate { debounce.Stop(); q = txtSearch.Text.Trim(); ApplyFilter(); };
            tabs.SelectedIndexChanged += delegate
            {
                FixSplits();
                if (tabs.SelectedIndex == 1 && dgvCat.Columns.Count == 0) FillCat();
                if (tabs.SelectedIndex == 2 && dgvRef.Columns.Count == 0) FillRef();
                if (tabs.SelectedIndex == 3 && dgvBib.Columns.Count == 0) FillBib();
            };
            // A hidden tab page gets its real size only when it becomes visible (and the
            // first layout of the window happens after the ctor), so watch the containers.
            outer.Resize += delegate { FixSplits(); };
            inner.Resize += delegate { FixSplits(); };
            catSplit.Resize += delegate { FixSplits(); };
            refSplit.Resize += delegate { FixSplits(); };
            bibSplit.Resize += delegate { FixSplits(); };
        }

        static DataGridViewTextBoxColumn MkCol(string h, int w)
        {
            DataGridViewTextBoxColumn c = new DataGridViewTextBoxColumn();
            c.HeaderText = h; c.Width = w; c.SortMode = DataGridViewColumnSortMode.Programmatic;
            c.ReadOnly = true;
            return c;
        }

        static void StyleGrid(DataGridView g)
        {
            g.Dock = DockStyle.Fill;
            g.AllowUserToAddRows = false; g.AllowUserToDeleteRows = false; g.AllowUserToResizeRows = false;
            g.RowHeadersVisible = false; g.MultiSelect = false; g.ReadOnly = true;
            g.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            g.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None;
            g.EnableHeadersVisualStyles = false;
            g.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;
            g.ColumnHeadersHeight = 26;
            g.RowTemplate.Height = 20;
            g.BorderStyle = BorderStyle.None;
            g.CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal;
        }

        void ApplyTheme()
        {
            Color bg = Dark ? BgDark : Color.White, bg2 = Dark ? BgDark2 : Color.FromArgb(246, 247, 249);
            Color fg = Dark ? FgDark : Color.FromArgb(28, 30, 34), dim = Dark ? DimDark : Color.FromArgb(110, 116, 126);
            BackColor = bg; ForeColor = fg;
            foreach (Control c in Controls) ApplyPaint(c, bg, bg2, fg, dim);
            dgv.BackgroundColor = bg; dgv.GridColor = Dark ? Color.FromArgb(48, 52, 58) : Color.FromArgb(224, 227, 232);
            dgvCat.BackgroundColor = bg; dgvRef.BackgroundColor = bg; dgvBib.BackgroundColor = bg;
            dgvCat.GridColor = dgv.GridColor; dgvRef.GridColor = dgv.GridColor; dgvBib.GridColor = dgv.GridColor;
            dgv.DefaultCellStyle.BackColor = bg; dgv.DefaultCellStyle.ForeColor = fg;
            dgv.DefaultCellStyle.SelectionBackColor = Dark ? Color.FromArgb(48, 78, 118) : Color.FromArgb(206, 226, 248);
            dgv.DefaultCellStyle.SelectionForeColor = Dark ? Color.White : Color.Black;
            dgvCat.DefaultCellStyle.BackColor = bg; dgvCat.DefaultCellStyle.ForeColor = fg;
            dgvCat.DefaultCellStyle.SelectionBackColor = dgv.DefaultCellStyle.SelectionBackColor;
            dgvCat.DefaultCellStyle.SelectionForeColor = dgv.DefaultCellStyle.SelectionForeColor;
            dgvRef.DefaultCellStyle.BackColor = bg; dgvRef.DefaultCellStyle.ForeColor = fg;
            dgvRef.DefaultCellStyle.SelectionBackColor = dgv.DefaultCellStyle.SelectionBackColor;
            dgvRef.DefaultCellStyle.SelectionForeColor = dgv.DefaultCellStyle.SelectionForeColor;
            dgvBib.DefaultCellStyle.BackColor = bg; dgvBib.DefaultCellStyle.ForeColor = fg;
            dgvBib.DefaultCellStyle.SelectionBackColor = dgv.DefaultCellStyle.SelectionBackColor;
            dgvBib.DefaultCellStyle.SelectionForeColor = dgv.DefaultCellStyle.SelectionForeColor;
            foreach (DataGridView g in new DataGridView[] { dgv, dgvCat, dgvRef, dgvBib })
            {
                g.ColumnHeadersDefaultCellStyle.BackColor = Dark ? Color.FromArgb(38, 41, 47) : Color.FromArgb(232, 235, 240);
                g.ColumnHeadersDefaultCellStyle.ForeColor = fg;
                g.ColumnHeadersDefaultCellStyle.SelectionBackColor = g.ColumnHeadersDefaultCellStyle.BackColor;
            }
            pic.BackColor = Dark ? Color.FromArgb(16, 17, 20) : Color.FromArgb(240, 241, 244);
            status.BackColor = bg2; status.ForeColor = dim;
            sl.ForeColor = dim;
            tabs.Appearance = TabAppearance.Normal;
            ApplyLang();
        }

        void ApplyPaint(Control c, Color bg, Color bg2, Color fg, Color dim)
        {
            if (c is TextBox || c is ComboBox || c is ListBox) { c.BackColor = Dark ? bg2 : Color.White; c.ForeColor = fg; }
            else if (c is RichTextBox) { c.BackColor = bg; c.ForeColor = fg; }
            else if (c is TreeView) { TreeView t = (TreeView)c; t.BackColor = bg2; t.ForeColor = fg; t.LineColor = dim; }
            else if (c is Button)
            {
                Button b = (Button)c;
                b.BackColor = Dark ? Color.FromArgb(44, 48, 55) : Color.FromArgb(236, 238, 242);
                b.ForeColor = fg; b.FlatStyle = FlatStyle.Flat;
                b.FlatAppearance.BorderColor = Dark ? Color.FromArgb(66, 72, 82) : Color.FromArgb(196, 202, 212);
            }
            else if (c is Label || c is CheckBox) { c.BackColor = Color.Transparent; c.ForeColor = fg; }
            else if (c is TabPage) { c.BackColor = bg; c.ForeColor = fg; }
            else if (c is SplitContainer || c is Panel || c is StatusStrip) { c.BackColor = bg; c.ForeColor = fg; }
            foreach (Control k in c.Controls) ApplyPaint(k, bg, bg2, fg, dim);
        }

        // ------------------------------------------------------------- search labels
        void BuildSearchLabels()
        {
            fTypeLbl.Clear(); fOrgLbl.Clear();
            foreach (KeyValuePair<string, CatInfo> kv in D.Types) fTypeLbl[kv.Key] = Data.Sq(Zh ? kv.Value.Zh : kv.Value.Ru);
            foreach (KeyValuePair<string, CatInfo> kv in D.Orgs) fOrgLbl[kv.Key] = Data.Sq(Zh ? kv.Value.Zh : kv.Value.Ru);
        }

        void ApplyLang()
        {
            if (dgv.Columns.Count >= 7)
            {
                dgv.Columns[0].HeaderText = Zh ? "索引" : "Индекс";
                dgv.Columns[1].HeaderText = Zh ? "类型" : "Тип";
                dgv.Columns[2].HeaderText = Zh ? "中文说明" : "Описание (кит.)";
                dgv.Columns[3].HeaderText = Zh ? "俄文说明" : "Описание (рус.)";
                dgv.Columns[4].HeaderText = Zh ? "北约代号" : "НАТО";
                dgv.Columns[5].HeaderText = Zh ? "单位" : "Организация";
                dgv.Columns[6].HeaderText = Zh ? "来源" : "Источник";
            }
            if (tabs.TabPages.Count >= 3)
            {
                tabs.TabPages[0].Text = Zh ? "索引总表" : "Указатель";
                tabs.TabPages[1].Text = Zh ? "其他总局目录" : "Другие управления";
                tabs.TabPages[2].Text = Zh ? "详查索引" : "Справочник";
                if (tabs.TabPages.Count >= 4) tabs.TabPages[3].Text = Zh ? "参考文献" : "Библиография";
            }
            if (btnAbout != null) btnAbout.Text = Zh ? "关于 / 免责声明" : "О программе / отказ";
            if (cmbBib != null && D.Refs.Count > 0)
            {
                // category labels are language dependent: rebuild them and restore the selection
                string keep = bibCat;
                FillBibCats();
                int ci2 = cBib.IndexOf(keep);
                if (ci2 > 0 && ci2 < cmbBib.Items.Count) cmbBib.SelectedIndex = ci2;
                if (dgvBib.Columns.Count > 0) FillBib();
            }
            cmbField.Items[0] = Zh ? "全部字段" : "Все поля";
            cmbField.Items[1] = Zh ? "索引号" : "Индекс";
            cmbField.Items[2] = Zh ? "中文说明" : "Описание (кит.)";
            cmbField.Items[3] = Zh ? "俄文说明" : "Описание (рус.)";
            cmbField.Items[4] = Zh ? "北约代号" : "НАТО";
            cmbField.SelectedIndex = qField;
            if (cmbCat.Items.Count == 4)
            {
                int ci = cmbCat.SelectedIndex;
                cmbCat.Items[0] = Zh ? "装甲兵总局 ГБТУ 对象目录" : "Каталог объектов ГБТУ";
                cmbCat.Items[1] = Zh ? "工兵总局 工程器材目录 (СИВ)" : "Каталог инженерного вооружения (СИВ)";
                cmbCat.Items[2] = Zh ? "旧 ГАУ 部门号 56 / 57" : "Старые номера ГАУ 56 / 57";
                cmbCat.Items[3] = Zh ? "МО.NN.NN 索引" : "Индексы МО.NN.NN";
                cmbCat.SelectedIndex = -1; cmbCat.SelectedIndex = ci < 0 ? 0 : ci;
            }
            if (cmbRef.Items.Count == 5)
            {
                int ri = cmbRef.SelectedIndex;
                cmbRef.Items[0] = Zh ? "缩写对照" : "Сокращения";
                cmbRef.Items[1] = Zh ? "专名与代号" : "Названия и обозначения";
                cmbRef.Items[2] = Zh ? "研制生产单位" : "Организации";
                cmbRef.Items[3] = Zh ? "器材类型" : "Типы";
                cmbRef.Items[4] = Zh ? "补充来源" : "Источники";
                cmbRef.SelectedIndex = -1; cmbRef.SelectedIndex = ri < 0 ? 0 : ri;
            }
            btnClear.Text = Zh ? "重置" : "Сброс";
            btnExport.Text = Zh ? "导出 CSV" : "Экспорт CSV";
            btnConv.Text = Zh ? "转写" : "Транслит";
            btnLang.Text = Zh ? "Русский" : "中文";
            btnTheme.Text = Dark ? (Zh ? "浅色" : "Светлая") : (Zh ? "深色" : "Тёмная");
            UpdateScriptBtn();
            btnJump.Text = Zh ? "在主表里查找" : "Найти в указателе";
            btnResetF.Text = Zh ? "重置筛选" : "Сброс фильтра";
            chkName.Text = Zh ? "仅索引/代号" : "только индекс";
            BuildSearchLabels();
            if (qtok.Length > 0) ApplyFilter();
            RelabelFilters();
            LayoutTop();            if (tabs.SelectedIndex == 0) ShowDetail(); else if (tabs.SelectedIndex == 1) ShowCatDetail(); else ShowRefDetail();
        }

        // ------------------------------------------------------------- tree
        void BuildTree()
        {
            string f = txtTree.Text.Trim().ToLowerInvariant();
            tv.BeginUpdate();
            tv.Nodes.Clear();
            int[] countSeries = new int[D.Series.Count];
            foreach (Rec r in D.Recs) if (r.Series >= 0 && r.Series < countSeries.Length) countSeries[r.Series]++;
            Dictionary<string, int> typeN = new Dictionary<string, int>(), orgN = new Dictionary<string, int>();
            foreach (Rec r in D.Recs)
            {
                if (r.Type.Length > 0) typeN[r.Type] = (typeN.ContainsKey(r.Type) ? typeN[r.Type] : 0) + 1;
                if (r.Org.Length > 0)
                {
                    string[] op = r.Org.Split(' ');
                    for (int oi = 0; oi < op.Length; oi++)
                    {
                        if (op[oi].Length == 0) continue;
                        orgN[op[oi]] = (orgN.ContainsKey(op[oi]) ? orgN[op[oi]] : 0) + 1;
                    }
                }
            }
            TreeNode all = new TreeNode((Zh ? "全部序列" : "Все серии") + "  (" + D.Recs.Count + ")");
            all.Tag = "all";
            tv.Nodes.Add(all);

            TreeNode num = new TreeNode((Zh ? "按索引体系" : "По системам индексов")); num.Tag = "none";
            TreeNode let = new TreeNode((Zh ? "字母序列" : "Буквенные серии")); let.Tag = "none";
            // v1.4.6: 三级树——第一级「索引体系组」（ГРАУ / Р 无线电 / ПВО / ВВС / ВМФ / РВСН·航天 /
            // 设计局 / 老 ГАУ / 其他），第二级大类（第N类 / ПВО 反序6 …），第三级字头（1А / 9К …，带条数）。
            // 数据层已按「组 → 大类」顺序排好，这里不再自行排序，只在组号变化时新建组节点。
            Dictionary<string, int> prefN = new Dictionary<string, int>();
            foreach (Rec r in D.Recs) if (r.Prefix.Length > 0) prefN[r.Prefix] = (prefN.ContainsKey(r.Prefix) ? prefN[r.Prefix] : 0) + 1;
            Dictionary<string, int> grpN = new Dictionary<string, int>();
            Dictionary<string, string> grpZh = new Dictionary<string, string>(), grpRu = new Dictionary<string, string>();
            for (int gi = 0; gi < D.Series.Count; gi++)
            {
                SerInfo gs = D.Series[gi];
                string gk = gs.GrpZh + "|" + gs.GrpRu;
                if (!grpN.ContainsKey(gk)) { grpN[gk] = 0; grpZh[gk] = gs.GrpZh; grpRu[gk] = gs.GrpRu; }
                grpN[gk] += countSeries[gi];
            }
            TreeNode curGrp = null; string curGrpKey = "\u0000";
            for (int i = 0; i < D.Series.Count; i++)
            {
                SerInfo s = D.Series[i];
                string sh = (Zh ? s.ShortZh : s.ShortRu);
                if (sh.Length == 0) sh = (s.Key == "n" + s.N ? s.N.ToString() : s.Key);
                string lbl = sh + "  " + (Zh ? s.Zh : s.Ru) + "  (" + countSeries[i] + ")";
                bool selfHit = f.Length == 0 || lbl.ToLowerInvariant().IndexOf(f) >= 0;
                List<string> heads = new List<string>();
                string[] pf = (s.Prefixes ?? "").Split(' ');
                for (int pi = 0; pi < pf.Length; pi++)
                {
                    if (pf[pi].Length == 0) continue;
                    if (f.Length > 0 && pf[pi].ToLowerInvariant().IndexOf(f) < 0) continue;
                    heads.Add(pf[pi]);
                }
                heads.Sort(CmpIdx);
                if (!selfHit && heads.Count == 0) continue;
                string gk = s.GrpZh + "|" + s.GrpRu;
                if (curGrpKey != gk)
                {
                    curGrpKey = gk;
                    string gl = (Zh ? grpZh[gk] : grpRu[gk]); if (gl.Length == 0) gl = grpZh[gk];
                    curGrp = new TreeNode(gl + "  (" + grpN[gk] + ")"); curGrp.Tag = "none";
                    num.Nodes.Add(curGrp);
                }
                TreeNode sn = new TreeNode(lbl); sn.Tag = "s:" + i;
                if (s.Kind != "l")
                {
                    PrefNote dp = D.DeptOf(s.N);
                    if (dp != null) sn.ToolTipText = (Zh ? "序列 " : "Серия ") + s.N + " — " + dp.Text(Zh) + (dp.Src.Length > 0 ? "\n" + dp.Src : "");
                }
                for (int hi = 0; hi < heads.Count; hi++)
                {
                    // v1.4.2.1: 字头后直接跟字母类别注解（wiki 上有；过长者只留悬停提示）
                    PrefNote hp = D.PrefOf(heads[hi]);
                    string hme = ShortMean(hp, Zh);
                    TreeNode hn = new TreeNode(heads[hi] + "  (" + (prefN.ContainsKey(heads[hi]) ? prefN[heads[hi]] : 0) + ")" + (hme.Length > 0 ? "  " + hme : ""));
                    hn.Tag = "f:" + heads[hi];
                    if (hp != null) hn.ToolTipText = heads[hi] + " — " + hp.Text(Zh) + (hp.Src.Length > 0 ? "\n" + hp.Src : "");
                    sn.Nodes.Add(hn);
                }
                // v1.4.6: 选中的大类默认展开（显示其字头），并展开它所属的体系组
                if (heads.Count > 0 && s.Key == fSeries) { sn.Expand(); if (s.Kind != "l" && curGrp != null) curGrp.Expand(); }
                (s.Kind == "l" ? let : curGrp).Nodes.Add(sn);
            }
            tv.Nodes.Add(num);
            // v1.4.6: 第一级展开到第二级（9 个体系组各自展开，露出 28 个大类；大类的字头仍需点击展开）
            for (int ni = 0; ni < num.Nodes.Count; ni++) num.Nodes[ni].Expand();
            if (let.Nodes.Count > 0) tv.Nodes.Add(let);

            TreeNode ty = new TreeNode(Zh ? "按器材类型" : "По типу"); ty.Tag = "none";
            foreach (KeyValuePair<string, CatInfo> kv in D.Types)
            {
                string lbl = (Zh ? kv.Value.Zh : kv.Value.Ru) + "  (" + (typeN.ContainsKey(kv.Key) ? typeN[kv.Key] : 0) + ")";
                if (f.Length > 0 && lbl.ToLowerInvariant().IndexOf(f) < 0) continue;
                TreeNode n = new TreeNode(lbl); n.Tag = "t:" + kv.Key; ty.Nodes.Add(n);
            }
            tv.Nodes.Add(ty);

            TreeNode og = new TreeNode(Zh ? "按研制／生产单位" : "По организации"); og.Tag = "none";
            foreach (KeyValuePair<string, CatInfo> kv in D.Orgs)
            {
                string lbl = (Zh ? kv.Value.Zh : kv.Value.Ru) + "  (" + (orgN.ContainsKey(kv.Key) ? orgN[kv.Key] : 0) + ")";
                if (f.Length > 0 && lbl.ToLowerInvariant().IndexOf(f) < 0) continue;
                TreeNode n = new TreeNode(lbl); n.Tag = "o:" + kv.Key; og.Nodes.Add(n);
            }
            tv.Nodes.Add(og);
            all.Expand(); num.Expand(); ty.Expand();
            tv.EndUpdate();
        }

        void OnTreeSelect()
        {
            if (syncing) return;
            TreeNode n = tv.SelectedNode;
            fSeries = ""; fType = ""; fOrg = ""; fFam = "";
            if (n != null && n.Tag is string)
            {
                string t = (string)n.Tag;
                if (t.StartsWith("s:")) fSeries = D.Series[int.Parse(t.Substring(2))].Key;
                else if (t.StartsWith("f:")) fFam = t.Substring(2);      // v1.4.6: 左侧树第三级＝字头
                else if (t.StartsWith("t:")) fType = t.Substring(2);
                else if (t.StartsWith("o:")) fOrg = t.Substring(2);
            }
            SyncFromFilter();
            ApplyFilter();
        }

        void ResetFilters()
        {
            txtSearch.Text = ""; q = ""; fSeries = ""; fType = ""; fOrg = ""; fFam = "";
            fSource = 0; fCard = 0;
            SyncFromFilter();
            if (tv.Nodes.Count > 0) tv.SelectedNode = tv.Nodes[0];
            BuildTree();
            ApplyFilter();
        }

        // ----------------------------------------------------------- filter

        // one record may carry several organisation keys separated by spaces
        bool HasOrg(Rec r, string key)
        {
            if (r.Org.Length == 0) return false;
            string[] p = r.Org.Split(' ');
            for (int i = 0; i < p.Length; i++) if (p[i] == key) return true;
            return false;
        }

        bool OrgHit(string keys, string t)
        {
            string[] p = keys.Split(' ');
            for (int i = 0; i < p.Length; i++)
            {
                string lbl;
                if (p[i].Length > 0 && fOrgLbl.TryGetValue(p[i], out lbl) && lbl.IndexOf(t) >= 0) return true;
            }
            return false;
        }

        string OrgText(string keys, bool zh, bool shortForm)
        {
            if (keys == null || keys.Length == 0) return "";
            string[] p = keys.Split(' ');
            List<string> o = new List<string>();
            for (int i = 0; i < p.Length; i++)
            {
                if (p[i].Length == 0) continue;
                string lbl = D.OrgLabel(p[i], zh);
                if (lbl.Length > 0 && !o.Contains(lbl)) o.Add(lbl);
            }
            if (o.Count == 0) return "";
            if (shortForm && o.Count > 3) return string.Join(" · ", o.GetRange(0, 3).ToArray()) + " +" + (o.Count - 3);
            return string.Join(" · ", o.ToArray());
        }

        void ApplyFilter()
        {
            qtok = Tokenize(q);
            List<Rec> v = new List<Rec>(D.Recs.Count);
            for (int i = 0; i < D.Recs.Count; i++)
            {
                Rec r = D.Recs[i];
                if (fSeries.Length > 0 && D.Series[r.Series].Key != fSeries) continue;
                if (fFam.Length > 0 && r.Prefix != fFam) continue;
                if (fType.Length > 0 && r.Type != fType) continue;
                if (fOrg.Length > 0 && !HasOrg(r, fOrg)) continue;
                if (fSource == 1 && r.HasLit) continue;
                if (fSource == 2 && !r.HasLit) continue;
                if (fCard == 1 && !D.Wiki.ContainsKey(r.Idx)) continue;
                if (fCard == 2 && D.Wiki.ContainsKey(r.Idx)) continue;
                int sc = 0;
                if (qtok.Length > 0 && !ScoreRec(r, qtok, out sc)) continue;
                r.Score = sc;
                v.Add(r);
            }
            SortView(v);
            view = v;
            dgv.RowCount = 0;
            dgv.RowCount = view.Count;
            dgv.Invalidate();
            lblStat.Text = (Zh ? "命中 " : "найдено ") + view.Count + " / " + D.Recs.Count +
                (qtok.Length > 0 && sortCol < 0 ? (Zh ? " · 按相关度" : " · по релевантности") : "");
            LayoutTop();
            sl.Text = (Zh ? "共 " : "всего ") + D.Recs.Count + (Zh ? " 条索引 · 卡片 " : " записей · статей ") + D.Wiki.Count +
                (Zh ? " · 图片 " : " · фото ") + D.ImageCount + " · " + D.ByLine;
            if (view.Count > 0 && dgv.CurrentCell == null) dgv.CurrentCell = dgv.Rows[0].Cells[0];
            ShowDetail();
        }

        int sortCol = -1; bool sortAsc = true;
        void SortBy(int col)
        {
            if (sortCol == col) { if (sortAsc) sortAsc = false; else { sortCol = -1; sortAsc = true; } }
            else { sortCol = col; sortAsc = true; }
            SortView(view);
            dgv.Invalidate();
            ApplyFilterLabel();
        }

        void ApplyFilterLabel()
        {
            lblStat.Text = (Zh ? "命中 " : "найдено ") + view.Count + " / " + D.Recs.Count +
                (qtok.Length > 0 && sortCol < 0 ? (Zh ? " · 按相关度" : " · по релевантности") : "");
            LayoutTop();
        }

        void SortView(List<Rec> v)
        {
            Comparison<Rec> cmp;
            if (sortCol == 1) cmp = delegate(Rec a, Rec b) { return string.Compare(D.TypeLabel(a.Type, Zh), D.TypeLabel(b.Type, Zh), StringComparison.Ordinal); };
            else if (sortCol == 2) cmp = delegate(Rec a, Rec b) { return string.Compare(a.Zh, b.Zh, StringComparison.Ordinal); };
            else if (sortCol == 3) cmp = delegate(Rec a, Rec b) { return string.Compare(a.Ru, b.Ru, StringComparison.Ordinal); };
            else if (sortCol == 4) cmp = delegate(Rec a, Rec b) { return string.Compare(a.Nato, b.Nato, StringComparison.Ordinal); };
            else if (sortCol < 0 && qtok.Length > 0) cmp = delegate(Rec a, Rec b)
            {
                if (a.Score != b.Score) return b.Score - a.Score;
                return a.Series != b.Series ? a.Series - b.Series : CmpIdx(a.Idx, b.Idx);
            };
            else cmp = delegate(Rec a, Rec b) { return a.Series != b.Series ? a.Series - b.Series : CmpIdx(a.Idx, b.Idx); };
            v.Sort(cmp);
            if (!sortAsc && sortCol >= 0) v.Reverse();
        }

        // 索引的自然序：数字段按数值比较，其余按字符序 —— 1А2 必须排在 1А11 之前，
        // 而不是字典序（旧实现只比第一段数字，1А11 < 1А2 是反直觉的根源）。
        static int CmpIdx(string a, string b)
        {
            int i = 0, j = 0;
            while (i < a.Length && j < b.Length)
            {
                if (char.IsDigit(a[i]) && char.IsDigit(b[j]))
                {
                    int i0 = i, j0 = j;
                    while (i < a.Length && char.IsDigit(a[i])) i++;
                    while (j < b.Length && char.IsDigit(b[j])) j++;
                    string da = a.Substring(i0, i - i0).TrimStart('0');
                    string db = b.Substring(j0, j - j0).TrimStart('0');
                    if (da.Length != db.Length) return da.Length < db.Length ? -1 : 1;
                    int c = string.CompareOrdinal(da, db);
                    if (c != 0) return c < 0 ? -1 : 1;
                    continue;
                }
                char ca = char.ToUpperInvariant(a[i]), cb = char.ToUpperInvariant(b[j]);
                if (ca != cb) return ca < cb ? -1 : 1;
                i++; j++;
            }
            if (i < a.Length) return 1;
            if (j < b.Length) return -1;
            return 0;
        }

        // 条目的一句显眼中文：中文说明的第一句（无中文时退回俄文），过长则截断
        static string ZhPhrase(Rec r)
        {
            string s = (r.Zh == null ? "" : r.Zh).Trim();
            if (s.Length == 0) s = (r.Ru == null ? "" : r.Ru).Trim();
            if (s.Length == 0) return "";
            s = System.Text.RegularExpressions.Regex.Replace(s, "\\s+", " ");
            int cut = -1;
            for (int i = 0; i < s.Length && i < 140; i++)
            {
                char c = s[i];
                if (c == '。' || c == '；' || c == ';') { if (i >= 4) cut = i + 1; break; }
            }
            if (cut > 0) s = s.Substring(0, cut);
            if (s.Length > 52) s = s.Substring(0, 52).TrimEnd(' ', ',', '，', '、', '.', '。', ';', '；', ':', '：', '-', '—') + "…";
            return s;
        }

        // ------------------------------------------------------------ search engine
        // The query is split into tokens (whitespace separated, "quoted phrase" kept
        // whole); every token must hit something, and the record score decides the
        // default order, so an exact index match always floats to the top.
        static string[] Tokenize(string text)
        {
            List<string> list = new List<string>();
            int i = 0;
            while (i < text.Length)
            {
                while (i < text.Length && char.IsWhiteSpace(text[i])) i++;
                if (i >= text.Length) break;
                string t;
                if (text[i] == '"' || text[i] == '«' || text[i] == '\u201c')
                {
                    char close = text[i] == '«' ? '»' : text[i] == '\u201c' ? '\u201d' : '"';
                    int j = text.IndexOf(close, i + 1);
                    if (j < 0) { t = text.Substring(i + 1); i = text.Length; }
                    else { t = text.Substring(i + 1, j - i - 1); i = j + 1; }
                }
                else
                {
                    int j = i;
                    while (j < text.Length && !char.IsWhiteSpace(text[j])) j++;
                    t = text.Substring(i, j - i); i = j;
                }
                t = Data.Sq(t);
                if (t.Length > 0 && !list.Contains(t)) list.Add(t);
            }
            return list.ToArray();
        }

        static int Rank(string hay, string t, int exact, int prefix, int sub)
        {
            if (hay.Length == 0) return 0;
            if (hay == t) return exact;
            if (hay.StartsWith(t)) return prefix;
            if (hay.IndexOf(t) >= 0) return sub;
            return 0;
        }

        // compare against a latin-transliterated field: a cyrillic query still finds the row when
        // several cyrillic letters share one latin spelling (1ЕЦ10М / 1ЭЦ10М -> 1ETs10M)
        static int RankLat(string hay, string t, int exact, int prefix, int sub)
        {
            if (hay.Length == 0) return 0;
            int v = Rank(hay, t, exact, prefix, sub);
            if (v == 0)
            {
                string tl = Data.Sq(Data.Tr(t));
                if (tl != t) v = Rank(hay, tl, exact, prefix, sub);
            }
            return v;
        }

        // relation lists (установлен на / комплектующие) are stored in Cyrillic, so a latin query is
        // transliterated back before comparing: "SD-44" has to hit the rows whose list holds "СД-44"
        static int RankRel(string hay, string t, int exact, int prefix, int sub)
        {
            if (hay.Length == 0) return 0;
            int v = Rank(hay, t, exact, prefix, sub);
            if (v == 0)
            {
                string tc = Data.Sq(Data.UnTr(t));
                if (tc.Length > 0 && tc != t) v = Rank(hay, tc, exact, prefix, sub);
            }
            return v;
        }

        int ScoreTok(Rec r, string t)
        {
            if (qField == 1)
            {
                int si = Rank(r.SIdx, t, 4000, 2000, 900);
                if (si == 0) si = RankLat(r.SIdxLat, t, 4000, 2000, 900);
                if (si == 0) si = RankLat(r.SIdxGost, t, 3400, 1700, 760);
                if (si == 0 && r.SAka.Length > 0) si = Rank(r.SAka, t, 3000, 1800, 800);
                if (si == 0 && r.SAkaLat.Length > 0) si = RankLat(r.SAkaLat, t, 3000, 1800, 800);
                if (si == 0 && r.SAkaGost.Length > 0) si = RankLat(r.SAkaGost, t, 2600, 1600, 700);
                return si;
            }
            if (qField == 2) return Rank(r.SZh, t, 1000, 600, 300);
            if (qField == 3)
            {
                int vv = Rank(r.SRu, t, 1000, 600, 300);
                if (vv == 0) vv = RankLat(r.SRuLat, t, 1000, 600, 300);
                return vv;
            }
            if (qField == 4) return Rank(r.SNato, t, 1000, 600, 300);
            int s = Rank(r.SIdx, t, 4000, 2000, 900);
            // a latin keyboard finds the same rows: TKN-3B for ТКН-3Б, BU-25-2S for БУ-25-2С
            if (s == 0) s = RankLat(r.SIdxLat, t, 4000, 2000, 900);
            if (s == 0) s = RankLat(r.SIdxGost, t, 3400, 1700, 760);
            // alternative designations (aka) of the row rank just below the index itself
            if (s == 0 && r.SAka.Length > 0) s = Rank(r.SAka, t, 3000, 1800, 800);
            if (s == 0 && r.SAkaLat.Length > 0) s = RankLat(r.SAkaLat, t, 3000, 1800, 800);
            if (s == 0 && r.SAkaGost.Length > 0) s = RankLat(r.SAkaGost, t, 2600, 1600, 700);
            if (s == 0) s = Rank(r.SNato, t, 800, 500, 200);
            // relation layer: "9С13" also lists its sub-units, "Т-72" the optics/units fitted to it
            if (s == 0 && r.SUsedOn.Length > 0) s = RankRel(r.SUsedOn, t, 700, 700, 600);
            if (s == 0 && r.SParts.Length > 0) s = RankRel(r.SParts, t, 700, 700, 600);
            if (s == 0 && r.Prefix.Length > 0 && Data.Sq(r.Prefix).StartsWith(t)) s = 150;
            if (s == 0)
            {
                string lbl;
                if (r.Type.Length > 0 && fTypeLbl.TryGetValue(r.Type, out lbl) && lbl.IndexOf(t) >= 0) s = 60;
                else if (r.Org.Length > 0 && OrgHit(r.Org, t)) s = 60;
            }
            if (s == 0 && !onlyNames)
            {
                if (r.SZh.IndexOf(t) >= 0) s = 40;
                else if (r.SRu.IndexOf(t) >= 0) s = 30;
                else if (RankLat(r.SRuLat, t, 30, 30, 30) > 0) s = 30;
            }
            return s;
        }

        bool Match(Rec r, string needle)
        {
            string[] toks = needle.Length == 0 ? new string[0] : Tokenize(needle);
            int dummy = 0;
            return ScoreRec(r, toks, out dummy);
        }

        bool ScoreRec(Rec r, string[] toks, out int score)
        {
            int sum = 0;
            for (int i = 0; i < toks.Length; i++)
            {
                int s = ScoreTok(r, toks[i]);
                if (s == 0) { score = 0; return false; }
                sum += s;
            }
            score = sum;
            return true;
        }

        // ------------------------------------------------------- suggestions popup
        void UpdateSuggest()
        {
            if (sugg == null) return;
            string t = Data.Sq(txtSearch.Text);
            if (t.Length < 1 || !txtSearch.Focused) { HideSuggest(); return; }
            sugg.BeginUpdate();
            sugg.Items.Clear();
            for (int pass = 0; pass < 2; pass++)
            {
                for (int i = 0; i < D.Recs.Count && sugg.Items.Count < 12; i++)
                {
                    Rec r = D.Recs[i];
                    if (r.SIdx.Length == 0) continue;
                    bool hit = pass == 0 ? r.SIdx.StartsWith(t) : r.SIdx.IndexOf(t) >= 0;
                    if (!hit) continue;
                    string extra = Zh ? r.Zh : r.Ru;
                    string line = r.Idx + "   " + (extra.Length > 60 ? extra.Substring(0, 60) + "…" : extra);
                    if (!sugg.Items.Contains(line)) sugg.Items.Add(line);
                }
                if (sugg.Items.Count > 0) break;
            }
            sugg.EndUpdate();
            if (sugg.Items.Count == 0) { HideSuggest(); return; }
            suggSel = -1;
            sugg.Left = topBar.Left + txtSearch.Left;
            sugg.Top = topBar.Bottom + 1;
            sugg.Width = 430;
            sugg.Height = sugg.Items.Count * (sugg.ItemHeight + 1) + 3;
            sugg.Visible = true;
            sugg.BringToFront();
        }

        void HideSuggest()
        {
            if (sugg != null) { sugg.Visible = false; suggSel = -1; }
        }

        void ApplySuggest()
        {
            if (suggSel < 0 || suggSel >= sugg.Items.Count) return;
            string line = (string)sugg.Items[suggSel];
            int cut = line.IndexOf("   ");
            string idx = cut > 0 ? line.Substring(0, cut) : line;
            HideSuggest();
            txtSearch.Text = idx;
            txtSearch.SelectionStart = txtSearch.Text.Length;
            debounce.Stop();
            q = idx.Trim();
            ApplyFilter();
        }

        void SearchKey(object s, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Down || e.KeyCode == Keys.Up)
            {
                if (!sugg.Visible || sugg.Items.Count == 0) { UpdateSuggest(); if (!sugg.Visible) return; }
                suggSel += e.KeyCode == Keys.Down ? 1 : -1;
                if (suggSel < 0) suggSel = sugg.Items.Count - 1;
                if (suggSel >= sugg.Items.Count) suggSel = 0;
                sugg.SelectedIndex = suggSel;
                e.Handled = true; e.SuppressKeyPress = true;
            }
            else if (e.KeyCode == Keys.Enter)
            {
                if (sugg.Visible && suggSel >= 0) { ApplySuggest(); e.Handled = true; e.SuppressKeyPress = true; }
                else { HideSuggest(); }
            }
            else if (e.KeyCode == Keys.Escape) { HideSuggest(); e.Handled = true; }
        }

        // ---------------------------------------------------------- match highlight
        void HighlightCell(object sender, DataGridViewCellPaintingEventArgs e)
        {
            if (e.RowIndex < 0 || e.ColumnIndex < 0 || qtok.Length == 0) return;
            if (e.ColumnIndex != 0 && e.ColumnIndex != 2 && e.ColumnIndex != 3) return;
            string text = CellText(e.RowIndex, e.ColumnIndex);
            if (text.Length == 0) return;
            e.PaintBackground(e.CellBounds, true);
            e.PaintContent(e.CellBounds);

            List<int> map = new List<int>(text.Length);
            string sq = Data.Squash(Data.Fold(text), map);
            if (sq.Length == 0) { e.Handled = true; return; }
            List<int> starts = new List<int>(), ends = new List<int>();
            for (int t = 0; t < qtok.Length; t++)
            {
                string tok = qtok[t];
                if (tok.Length == 0) continue;
                int from = 0, guard = 0;
                while (from <= sq.Length - tok.Length && guard++ < 6)
                {
                    int at = sq.IndexOf(tok, from, StringComparison.Ordinal);
                    if (at < 0) break;
                    int o0 = map[at], o1 = map[at + tok.Length - 1] + 1;
                    bool merged = false;
                    for (int k = 0; k < starts.Count; k++)
                    {
                        if (o0 <= ends[k] && o1 >= starts[k])
                        {
                            if (o0 < starts[k]) starts[k] = o0;
                            if (o1 > ends[k]) ends[k] = o1;
                            merged = true; break;
                        }
                    }
                    if (!merged) { starts.Add(o0); ends.Add(o1); }
                    from = at + tok.Length;
                }
            }
            if (starts.Count == 0) { e.Handled = true; return; }

            TextFormatFlags fl = TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix;
            int baseX = e.CellBounds.X + 4, baseY = e.CellBounds.Y + (e.CellBounds.Height - e.CellBounds.Height) / 2;
            using (SolidBrush b = new SolidBrush(Color.FromArgb(e.State.HasFlag(DataGridViewElementStates.Selected) ? 90 : 70, 255, 196, 60)))
            {
                for (int k = 0; k < starts.Count; k++)
                {
                    int x0 = TextRenderer.MeasureText(e.Graphics, text.Substring(0, starts[k]), dgv.Font, new Size(int.MaxValue, int.MaxValue), fl).Width;
                    int w = TextRenderer.MeasureText(e.Graphics, text.Substring(starts[k], ends[k] - starts[k]), dgv.Font, new Size(int.MaxValue, int.MaxValue), fl).Width;
                    if (baseX + x0 + w > e.CellBounds.Right - 1) w = e.CellBounds.Right - 1 - (baseX + x0);
                    if (w > 0 && baseX + x0 < e.CellBounds.Right)
                        e.Graphics.FillRectangle(b, new Rectangle(baseX + x0, e.CellBounds.Y + 1, w, e.CellBounds.Height - 2));
                }
            }
            e.Handled = true;
        }

        string CellText(int row, int col)
        {
            if (row < 0 || row >= view.Count) return "";
            Rec r = view[row];
            switch (col)
            {
                case 0: return Lat ? Data.Tr(r.Idx) : r.Idx;
                case 1: return D.TypeLabel(r.Type, Zh);
                case 2: { string ph = ZhPhrase(r); return ph.Length > 0 ? ph : (r.Zh.Length > 0 ? r.Zh : (Zh ? "（无中文说明）" : "")); }
                case 3: return r.Ru;
                case 4: return r.Nato;
                case 5: return OrgText(r.Org, Zh, true) + (r.Roles.StartsWith("c") && r.Org.Length > 0 ? (Zh ? " · 底盘" : " · шасси") : "");
                case 6: return r.HasLit ? (r.LitKind == "fix" ? (Zh ? "改" : "испр") : r.LitKind == "enrich" ? (Zh ? "补" : "доп") : (Zh ? "增" : "доб")) : "";
            }
            return "";
        }

        // ----------------------------------------------------------- detail
        Rec Cur() { if (dgv.CurrentCell == null) return null; int i = dgv.CurrentCell.RowIndex; return i >= 0 && i < view.Count ? view[i] : null; }

        void ShowDetail()
        {
            Rec r = Cur();
            if (r == null) { rtb.Text = ""; pic.Image = null; lstEd.Items.Clear(); if (relBar != null) relBar.Controls.Clear(); return; }
            StringBuilder b = new StringBuilder();
            string phrase = ZhPhrase(r);
            int phLen = 0;
            if (phrase.Length > 0) { b.AppendLine(phrase); phLen = phrase.Length; }   // 第一行 = 显眼中文
            b.AppendLine((Lat ? Data.Tr(r.Idx) : r.Idx) + "    " + D.TypeLabel(r.Type, Zh));
            if (r.Series >= 0 && r.Series < D.Series.Count)
            {
                SerInfo si = D.Series[r.Series];
                b.AppendLine((Zh ? "大类：" : "Группа: ") + (Zh ? si.Zh : si.Ru));
            }
            if (Data.HasCyr(r.Idx))
                b.AppendLine((Lat ? (Zh ? "西里尔：" : "Кириллица: ") : (Zh ? "拉丁转写：" : "Латиница: ")) +
                    (Lat ? r.Idx : Data.Tr(r.Idx)));
            if (r.Org.Length > 0) b.AppendLine((Zh ? "单位：" : "Организация: ") + OrgText(r.Org, Zh, false));
            if (r.Prefix.Length > 0)
            {
                b.AppendLine((Zh ? "序列：" : "Серия: ") + r.Prefix);
                // v1.4.2.1: 字头含义（用户问「1PN 是什么」）——来源与证据强度一并列出
                PrefNote pn = D.PrefOf(r.Prefix);
                if (pn != null)
                {
                    string conf = pn.Conf == "A" ? (Zh ? "权威" : "авторитетный") : pn.Conf == "C" ? (Zh ? "待考" : "предположительно") : (Zh ? "公开" : "публичный");
                    string line = (Zh ? "字头含义：" : "Значение префикса: ") + r.Prefix + " — " + pn.Text(Zh) + "（" + conf + "）";
                    b.AppendLine(line);
                    if (pn.Src.Length > 0) b.AppendLine((Zh ? "含义来源：" : "Источник значения: ") + pn.Src);
                    if (pn.Quote.Length > 0) b.AppendLine("«" + pn.Quote + "»");
                }
            }
            if (r.Nato.Length > 0) b.AppendLine("NATO: " + r.Nato);
            if (r.Aka.Length > 0) b.AppendLine((Zh ? "代号：" : "Обозначения: ") + r.Aka);
            if (r.UsedOn.Length > 0) b.AppendLine((Zh ? "所属装备：" : "Установлен на: ") + r.UsedOn);
            if (r.Parts.Length > 0) b.AppendLine((Zh ? "构成部件：" : "Комплектующие: ") + r.Parts);
            b.AppendLine();
            b.AppendLine("RU: " + r.Ru);
            if (r.Zh.Length > 0) b.AppendLine("ZH: " + r.Zh);
            if (r.HasLit)
            {
                string k = r.LitKind == "fix" ? (Zh ? "修订" : "исправление") : r.LitKind == "enrich" ? (Zh ? "补充" : "дополнение") : (Zh ? "新增" : "добавление");
                string lbl;
                D.LS.TryGetValue(r.LitSrc, out lbl);
                b.AppendLine();
                b.AppendLine((Zh ? "来源：" : "Источник: ") + k + " · " + (lbl == null ? r.LitSrc : lbl));
                if (r.LitQuote.Length > 0) b.AppendLine("«" + r.LitQuote + "»");
                if (r.LitUrl.Length > 0) b.AppendLine(r.LitUrl);
            }
            WikiRec w; D.Wiki.TryGetValue(r.Idx, out w);
            if (w != null)
            {
                b.AppendLine();
                b.AppendLine((Zh ? "维基条目：" : "Статья: ") + w.Title);
                b.AppendLine((Zh ? "匹配：" : "Совпадение: ") + (w.Tier == "v" ? (Zh ? "条目正文出现该编号" : "индекс в тексте статьи") : (Zh ? "按名称匹配" : "по названию")));
                if (w.Extract.Length > 0) b.AppendLine(w.Extract);
                b.AppendLine(w.Url);
                string lic = (w.Lic + " " + w.By).Trim();
                if (lic.Length > 0) b.AppendLine((Zh ? "许可：" : "Лицензия: ") + lic);
            }
            WikiRec owner = null;
            string thumb = D.PictureOf(r.Idx, out owner);
            if (thumb != null)
            {
                pic.Image = D.GetImage(thumb);
                if (owner != null && w != null && owner != w) b.AppendLine((Zh ? "配图取自 " : "фото из ") + owner.Lang);
                if (owner != null && w == null) b.AppendLine((Zh ? "配图取自 " : "фото из ") + owner.Lang + " · " + (owner.Title == null ? "" : owner.Title));
            }
            else pic.Image = null;
            pic.Visible = pic.Image != null;
            Dictionary<string, WikiRec> alt;
            bool hasEd = D.WikiAlt.TryGetValue(r.Idx, out alt) && alt.Count > 0;
            if (w != null || hasEd)
            {
                b.AppendLine();
                b.AppendLine(Zh ? "双击该行打开维基条目。" : "Двойной щелчок — открыть статью.");
            }
            rtb.Text = b.ToString();
            rtb.Select(0, 0);
            if (phLen > 0 && phLen <= rtb.TextLength)
            {
                if (fPhrase == null) fPhrase = new Font(rtb.Font.FontFamily, rtb.Font.Size + 1.5F, FontStyle.Bold);
                rtb.Select(0, phLen);
                rtb.SelectionFont = fPhrase;
                rtb.SelectionColor = rtb.ForeColor;
                rtb.Select(0, 0);
            }

            lstEd.Items.Clear(); edList.Clear();
            Dictionary<string, WikiRec> m;
            if (D.WikiAlt.TryGetValue(r.Idx, out m))
            {
                foreach (KeyValuePair<string, WikiRec> kv in m)
                {
                    edList.Add(kv.Value);
                    lstEd.Items.Add(kv.Key + "  —  " + kv.Value.Title);
                }
            }
            if (edList.Count == 0) lstEd.Items.Add(Zh ? "（无其他语言版本）" : "(других языков нет)");

            FillRelBar(r);
        }

        // component layer: one click on a designation searches it (aka / belongs-to / contains)
        void FillRelBar(Rec r)
        {
            if (relBar == null) return;
            relBar.Controls.Clear();
            if (r == null) return;
            AddRelGroup(Zh ? "代号：" : "Обозначения:", r.Aka);
            AddRelGroup(Zh ? "所属装备：" : "Установлен на:", r.UsedOn);
            AddRelGroup(Zh ? "构成部件：" : "Комплектующие:", r.Parts);
        }

        void AddRelGroup(string label, string list)
        {
            if (list == null || list.Length == 0) return;
            string[] ids = list.Split(new char[] { ' ', ';', ',' }, StringSplitOptions.RemoveEmptyEntries);
            if (ids.Length == 0) return;
            Label lb = new Label(); lb.Text = label; lb.AutoSize = true; lb.ForeColor = Color.FromArgb(150, 170, 200);
            lb.Margin = new Padding(4, 5, 2, 0);
            relBar.Controls.Add(lb);
            for (int i = 0; i < ids.Length; i++)
            {
                string id = ids[i];
                LinkLabel lk = new LinkLabel(); lk.Text = id; lk.AutoSize = true;
                lk.LinkColor = Color.FromArgb(160, 195, 255); lk.ActiveLinkColor = Color.White; lk.VisitedLinkColor = Color.FromArgb(160, 195, 255);
                lk.Margin = new Padding(0, 4, 8, 0);
                lk.LinkClicked += delegate { SearchFor(id); };
                relBar.Controls.Add(lk);
            }
        }

        void SearchFor(string id)
        {
            if (id == null || id.Length == 0) return;
            if (txtSearch != null) txtSearch.Text = id;
            q = id.Trim();
            ApplyFilter();
        }

        // filter straight from a result row (context menu) and clear the tree highlight
        void ApplyRowFilter(string ser, string fam, string typ, string org)
        {
            fSeries = ser; fFam = fam; fType = typ; fOrg = org;
            syncing = true;
            tv.SelectedNode = null;
            syncing = false;
            SyncFromFilter();
            ApplyFilter();
        }

        void BuildRowMenu()
        {
            ctxRow.Items.Clear();
            Rec r = Cur();
            if (r == null) return;
            ctxRow.Items.Add(new ToolStripMenuItem((Zh ? "复制索引号  " : "Копировать индекс  ") + (Lat ? Data.Tr(r.Idx) : r.Idx), null,
                delegate { try { Clipboard.SetText(Lat ? Data.Tr(r.Idx) : r.Idx); } catch { } }));
            if (Data.HasCyr(r.Idx))
            {
                string other = Lat ? r.Idx : Data.Tr(r.Idx);
                ctxRow.Items.Add(new ToolStripMenuItem((Lat ? (Zh ? "复制西里尔写法  " : "Копировать кириллицу  ")
                    : (Zh ? "复制拉丁转写  " : "Копировать латиницу  ")) + other, null,
                    delegate { try { Clipboard.SetText(other); } catch { } }));
            }
            ctxRow.Items.Add(new ToolStripMenuItem(Zh ? "索引号显示：西里尔 ⇄ 拉丁" : "Индексы: кириллица ⇄ латиница", null,
                delegate { ToggleScript(); }));
            ctxRow.Items.Add(new ToolStripSeparator());
            ctxRow.Items.Add(new ToolStripMenuItem((Zh ? "只看此索引族： " : "Только это семейство: ") + r.Prefix, null,
                delegate { ApplyRowFilter("", r.Prefix, "", ""); }));
            ctxRow.Items.Add(new ToolStripMenuItem((Zh ? "只看此器材类型： " : "Только этот тип: ") + D.TypeLabel(r.Type, Zh), null,
                delegate { ApplyRowFilter("", "", r.Type, ""); }));
            if (r.Org.Length > 0)
                ctxRow.Items.Add(new ToolStripMenuItem((Zh ? "只看此单位： " : "Только эта организация: ") + OrgText(r.Org, Zh, true), null,
                    delegate { ApplyRowFilter("", "", "", r.Org); }));
            ctxRow.Items.Add(new ToolStripSeparator());
            ctxRow.Items.Add(new ToolStripMenuItem(Zh ? "复制说明" : "Копировать описание", null,
                delegate { try { Clipboard.SetText(r.Idx + "\t" + r.Ru + "\t" + r.Zh); } catch { } }));
            if (r.HasLit && r.LitUrl.Length > 0)
                ctxRow.Items.Add(new ToolStripMenuItem(Zh ? "打开来源链接" : "Открыть ссылку-источник", null, delegate { Open(r.LitUrl); }));
            WikiRec w;
            bool hasWiki = D.Wiki.TryGetValue(r.Idx, out w) || D.WikiAlt.ContainsKey(r.Idx);
            if (hasWiki) ctxRow.Items.Add(new ToolStripMenuItem(Zh ? "打开维基条目" : "Открыть статью", null, delegate { ShowCard(); }));
            ctxRow.Items.Add(new ToolStripSeparator());
            ctxRow.Items.Add(new ToolStripMenuItem(Zh ? "重置筛选" : "Сбросить фильтр", null, delegate { ResetFilters(); }));
        }

        void ShowCard()
        {
            Rec r = Cur();
            if (r == null) return;
            WikiRec w;
            if (D.Wiki.TryGetValue(r.Idx, out w) && w.Url.Length > 0) Open(w.Url);
            else { Dictionary<string, WikiRec> m; if (D.WikiAlt.TryGetValue(r.Idx, out m)) foreach (KeyValuePair<string, WikiRec> kv in m) { Open(kv.Value.Url); return; } }
        }

        void OpenEdition()
        {
            int i = lstEd.SelectedIndex;
            if (i >= 0 && i < edList.Count && edList[i].Url.Length > 0) Open(edList[i].Url);
        }

        static void Open(string url)
        {
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
        }

        // -------------------------------------------------------- catalogues
        string CatTitle()
        {
            if (catMode == "b") return Zh ? "装甲兵总局（ГБТУ）对象目录" : "Каталог объектов ГБТУ";
            if (catMode == "i") return Zh ? "工兵器材目录（СИВ，俄国防部 436 页）" : "Каталог средств инженерного вооружения";
            if (catMode == "a") return Zh ? "旧 ГАУ 部门号 56 / 57" : "Старые индексы ГАУ 56 / 57";
            return "МО.NN.NN";
        }

        void FillCat()
        {
            catMode = cmbCat.SelectedIndex == 0 ? "b" : cmbCat.SelectedIndex == 1 ? "i" : cmbCat.SelectedIndex == 2 ? "a" : "m";
            dgvCat.Columns.Clear(); dgvCat.Rows.Clear();
            if (catMode == "b")
            {
                dgvCat.Columns.Add(MkCol(Zh ? "对象号" : "Объект", 110));
                dgvCat.Columns.Add(MkCol(Zh ? "代号" : "Обозначение", 130));
                dgvCat.Columns.Add(MkCol(Zh ? "说明" : "Описание", 900));
                dgvCat.Columns.Add(MkCol(Zh ? "来源" : "Источники", 150));
                foreach (GbtuRec g in D.Gbtu)
                {
                    string note = Zh ? (D.Tz(g.Note).Length > 0 ? D.Tz(g.Note) : g.Note) : g.Note;
                    StringBuilder s = new StringBuilder();
                    foreach (SrcSeg sg in g.Srcs) { if (s.Length > 0) s.Append(", "); s.Append(sg.Src); }
                    dgvCat.Rows.Add(g.Key, g.Desig, note, s.ToString());
                }
            }
            else if (catMode == "i")
            {
                dgvCat.Columns.Add(MkCol(Zh ? "名称" : "Наименование", 330));
                dgvCat.Columns.Add(MkCol(Zh ? "代号" : "Обозначение", 110));
                dgvCat.Columns.Add(MkCol(Zh ? "类别" : "Раздел", 150));
                dgvCat.Columns.Add(MkCol(Zh ? "用途" : "Назначение", 620));
                dgvCat.Columns.Add(MkCol("ЕКПС", 130));
                dgvCat.Columns.Add(MkCol(Zh ? "列装" : "Принят", 200));
                foreach (GiuRec g in D.Giu)
                    dgvCat.Rows.Add(Zh ? D.Tz(g.Title) : g.Title, g.Desig, Zh ? D.Tz(g.Section) : g.Section,
                        Zh ? D.Tz(g.Purpose) : g.Purpose, g.Ekps, Zh ? D.Tz(g.Adopted) : g.Adopted);
            }
            else if (catMode == "a")
            {
                dgvCat.Columns.Add(MkCol(Zh ? "索引" : "Индекс", 150));
                dgvCat.Columns.Add(MkCol(Zh ? "说明" : "Описание", 1000));
                dgvCat.Columns.Add(MkCol(Zh ? "工程弹药" : "Инженерный", 100));
                foreach (AmmoRec a in D.Gau)
                    dgvCat.Rows.Add(a.Key, Zh ? (D.Tz(a.Note).Length > 0 ? D.Tz(a.Note) : a.Note) : a.Note, a.Eng ? (Zh ? "是" : "да") : "");
            }
            else
            {
                dgvCat.Columns.Add(MkCol(Zh ? "索引" : "Индекс", 160));
                dgvCat.Columns.Add(MkCol(Zh ? "说明" : "Описание", 1000));
                foreach (AmmoRec a in D.Mo) dgvCat.Rows.Add(a.Key, Zh ? (D.Tz(a.Note).Length > 0 ? D.Tz(a.Note) : a.Note) : a.Note);
            }
            dgvCat.AutoResizeColumn(0);
            ShowCatDetail();
        }

        void ShowCatDetail()
        {
            StringBuilder b = new StringBuilder();
            b.AppendLine(CatTitle());
            b.AppendLine();
            if (catMode == "b")
            {
                int i = dgvCat.CurrentCell == null ? -1 : dgvCat.CurrentCell.RowIndex;
                if (i >= 0 && i < D.Gbtu.Count)
                {
                    GbtuRec g = D.Gbtu[i];
                    b.AppendLine((Zh ? "对象 " : "Объект ") + g.Key + "    " + g.Desig);
                    b.AppendLine();
                    b.AppendLine("RU: " + g.Note);
                    if (Zh && D.Tz(g.Note).Length > 0) b.AppendLine("ZH: " + D.Tz(g.Note));
                    b.AppendLine();
                    foreach (SrcSeg sg in g.Srcs)
                    {
                        b.AppendLine("[ " + sg.Src + " ]  " + sg.Desig);
                        if (sg.Note.Length > 0) b.AppendLine("    " + sg.Note);
                        if (Zh && D.Tz(sg.Note).Length > 0) b.AppendLine("    " + D.Tz(sg.Note));
                    }
                    b.AppendLine();
                    b.AppendLine(Zh ? "来源有冲突时并列显示，不做取舍。" : "Противоречия источников показаны как есть.");
                }
            }
            else if (catMode == "i")
            {
                int i = dgvCat.CurrentCell == null ? -1 : dgvCat.CurrentCell.RowIndex;
                if (i >= 0 && i < D.Giu.Count)
                {
                    GiuRec g = D.Giu[i];
                    b.AppendLine(g.Title + "    " + g.Desig);
                    b.AppendLine((Zh ? "类别：" : "Раздел: ") + (Zh ? D.Tz(g.Section) : g.Section));
                    if (g.Ekps.Length > 0) b.AppendLine("ЕКПС: " + g.Ekps);
                    if (g.Kvt.Length > 0) b.AppendLine("КВТ: " + g.Kvt);
                    if (g.Okp.Length > 0) b.AppendLine("ОКП: " + g.Okp);
                    b.AppendLine();
                    b.AppendLine("RU: " + g.Purpose);
                    if (Zh && D.Tz(g.Purpose).Length > 0) b.AppendLine("ZH: " + D.Tz(g.Purpose));
                    b.AppendLine();
                    if (g.Adopted.Length > 0) b.AppendLine((Zh ? "列装：" : "Принят: ") + (Zh ? D.Tz(g.Adopted) : g.Adopted));
                    if (g.Dev.Length > 0) b.AppendLine((Zh ? "研制：" : "Разработчик: ") + (Zh ? D.Tz(g.Dev) : g.Dev));
                    b.AppendLine();
                    b.AppendLine(Zh ? "工兵器材按 КД 代号与 КВТ／ОКП／ЕКПС 分类码编目，没有 ГРАУ 式索引。"
                                    : "Средства инженерного вооружения каталогизированы по КД и кодам КВТ/ОКП/ЕКПС.");
                }
            }
            else
            {
                b.AppendLine(Zh ? "旧 ГАУ 部门号 56（步兵武器）与 57（步兵弹药）的完整索引，含 55 条工程弹药。"
                                : "Старые индексы ГАУ отделов 56 и 57 (в том числе 55 инженерных боеприпасов).");
            }
            rtbCat.Text = b.ToString();
        }

        void JumpFromCat()
        {
            int i = dgvCat.CurrentCell == null ? -1 : dgvCat.CurrentCell.RowIndex;
            string needle = "";
            if (catMode == "b" && i >= 0 && i < D.Gbtu.Count) needle = D.Gbtu[i].Desig;
            else if (catMode == "a" && i >= 0 && i < D.Gau.Count) needle = D.Gau[i].Key;
            else if (catMode == "m" && i >= 0 && i < D.Mo.Count) needle = D.Mo[i].Key;
            else if (catMode == "i" && i >= 0 && i < D.Giu.Count) needle = D.Giu[i].Desig;
            if (needle.Length == 0) return;
            foreach (Rec r in D.Recs) if (r.Idx == needle) { JumpTo(r.Idx); return; }
            tabs.SelectedIndex = 0; txtSearch.Text = needle; q = needle; ApplyFilter();
        }

        void JumpTo(string idx)
        {
            tabs.SelectedIndex = 0;
            ResetFilters();
            txtSearch.Text = idx; q = idx;
            ApplyFilter();
        }

        // -------------------------------------------------------------- refs
        // ------------------------------------------------------------- bibliography tab
        // Complete reference list, generated by _raw/build_biblio.cjs (see README).
        const string ABOUT_ZH =
            "ГРАУ / ГАУ 索引号总表  ·  v1.4.2.2\r\n" +
            "ГРАУ / ГАУ — индексные обозначения\r\n\r\n" +
            "整理：@科夫罗夫机械（防空妖精哥特羊） · @Deepseek · 三陆问题研究中心\r\n\r\n" +
            "检索：拉丁与西里尔两种输入通用（TKN-3B = ТКН-3Б，BU-25-2S = БУ-25-2С）；工具栏「拉丁／西里尔」切换索引号的显示字母，「转写」把搜索框里的文字在两种字母间转换。搜索引号或代号时也会带出相关条目（该装备的构成部件、该部件装在哪些装备上）。\r\n" +
            "Поиск: латиница и кириллица равнозначны (TKN-3B = ТКН-3Б); кнопка «латиница / кириллица» переключает написание индексов, «Транслит» переводит запрос. Поиск по индексу или обозначению выводит и связанные записи (комплектующие изделия и установка на технике).\r\n" +
            "数据层：ГРАУ／ГАУ 编号条目 + 按产品代号收录的整机装备层（如 СД-44、БРМ-1К）+ 光学／机电部件层，三者以「代号／所属装备／构成部件」双向关联。\r\n" +
            "Слои: индексы ГРАУ/ГАУ + изделия по обозначению (СД-44, БРМ-1К) + комплектующие (оптика/электромеханика), связанные в обе стороны.\r\n\r\n" +
            "免责声明\r\n" +
            "1. 性质与用途：本表是基于公开渠道整理的个人资料汇编，仅供检索、参考与研究使用，不构成任何官方名录、技术文件、采购或作战依据；与俄罗斯国防部、总火箭炮兵部（ГРАУ／ГАУ）及任何军工企业、政府机构均无隶属或合作关系。\r\n" +
            "2. 数据来源：russiansila.ru、500maketov.ru、SALIS3 公开 PDF 目录，以及维基百科与公开网页；未使用任何非公开资料。\r\n" +
            "3. 准确性与完整性：索引号、序列归属、器材类型、研制单位等可能存在错漏、重复、推断或过时之处；中文说明多为机器辅助翻译并经人工润色。一切以俄方原始来源与官方文件为准。\r\n" +
            "4. 图片与版权：缩略图与卡片文字取自公开网页与维基百科（多为 CC 授权），版权归原作者／权利人，仅用于条目识别与说明；如认为使用不当请联系删除。转载须保留来源标注与整理者署名。\r\n" +
            "5. 使用限制与合规：本表不提供任何制造、改装、操作或规避法律的技术指导；使用者应自行遵守所在国家／地区法律法规（含出口管制与武器相关法规）。若认为某条目不宜公开传播，将及时删除。\r\n" +
            "6. 责任限制：本表按「现状」提供，不附带任何明示或默示担保；因使用或依赖本表内容造成的直接或间接损失，整理者不承担责任。\r\n" +
            "7. 纠错与署名：欢迎指出错误与补充资料，将在后续版本中更正。主要参考源见「参考文献」页签与 README。\r\n\r\n" +
            "Отказ от ответственности: неофициальный справочник, составленный по открытым источникам; " +
            "возможны ошибки, пропуски и неточности перевода — сверяйтесь с первоисточниками. " +
            "Изображения и тексты взяты из открытых источников, права принадлежат их авторам.";

        void ShowAbout()
        {
            Form f = new Form();
            f.Text = Zh ? "关于 / 免责声明" : "О программе / отказ от ответственности";
            f.Size = new Size(720, 560);
            f.StartPosition = FormStartPosition.CenterParent;
            f.MinimizeBox = false; f.MaximizeBox = false;
            RichTextBox t = new RichTextBox();
            t.Dock = DockStyle.Fill; t.ReadOnly = true; t.BorderStyle = BorderStyle.None;
            t.WordWrap = true; t.ScrollBars = RichTextBoxScrollBars.Vertical;
            t.BackColor = Dark ? BgDark : Color.White; t.ForeColor = Dark ? FgDark : Color.Black;
            t.Text = ABOUT_ZH;
            Button ok = new Button(); ok.Text = Zh ? "关闭" : "Закрыть"; ok.DialogResult = DialogResult.OK;
            ok.Dock = DockStyle.Bottom; ok.Height = 32;
            f.Controls.Add(t); f.Controls.Add(ok); ok.BringToFront();
            f.AcceptButton = ok;
            f.ShowDialog(this);
        }

        void FillBibCats()
        {
            if (bibSync) return;
            bibSync = true;
            try
            {
                cBib.Clear(); cmbBib.Items.Clear();
                List<string> order = new List<string>();
                Dictionary<string, int> n = new Dictionary<string, int>();
                foreach (RefInfo r in D.Refs)
                {
                    if (!n.ContainsKey(r.Cat)) { n[r.Cat] = 0; order.Add(r.Cat); }
                    n[r.Cat] = n[r.Cat] + 1;
                }
                cmbBib.Items.Add((Zh ? "全部" : "Все") + " (" + D.Refs.Count + ")");
                cBib.Add("");
                foreach (string c in order) { cmbBib.Items.Add(c + " (" + n[c] + ")"); cBib.Add(c); }
                if (cmbBib.Items.Count > 0) cmbBib.SelectedIndex = 0;
            }
            finally { bibSync = false; }
        }

        void FillBib()
        {
            if (bibSync) return;
            if (cmbBib.Items.Count == 0) { FillBibCats(); if (cmbBib.Items.Count == 0) return; }
            int ci = cmbBib.SelectedIndex < 0 ? 0 : cmbBib.SelectedIndex;
            bibCat = ci < cBib.Count ? cBib[ci] : "";
            dgvBib.Columns.Clear(); dgvBib.Rows.Clear();
            dgvBib.Columns.Add(MkCol(Zh ? "分类" : "Категория", 170));
            dgvBib.Columns.Add(MkCol(Zh ? "名称 / 标题" : "Название", 520));
            dgvBib.Columns.Add(MkCol(Zh ? "说明" : "Примечание", 320));
            dgvBib.Columns.Add(MkCol(Zh ? "引用" : "Ссылок", 70));
            foreach (RefInfo r in D.Refs)
            {
                if (bibCat != "" && r.Cat != bibCat) continue;
                int i = dgvBib.Rows.Add(r.Cat, r.Title, r.Note, r.N);
                dgvBib.Rows[i].Tag = r;
            }
            if (dgvBib.Rows.Count > 0) dgvBib.CurrentCell = dgvBib.Rows[0].Cells[0];
            ShowBibDetail();
        }

        void ShowBibDetail()
        {
            StringBuilder b = new StringBuilder();
            b.AppendLine(Zh ? "参考文献目录：共 " + D.Refs.Count + " 条来源，双击一行可在浏览器里打开链接。"
                            : "Библиография: всего " + D.Refs.Count + " источников; двойной щелчок открывает ссылку.");
            b.AppendLine();
            foreach (RefInfo r in D.Refs)
            {
                if (r.Cat == "基础目录" || r.Cat == "网络补充层" || r.Cat == "构建用参考资料")
                    b.AppendLine("  · " + r.Cat + " — " + r.Title);
            }
            int row = dgvBib.CurrentCell == null ? -1 : dgvBib.CurrentCell.RowIndex;
            if (row >= 0 && row < dgvBib.Rows.Count && dgvBib.Rows[row].Tag is RefInfo)
            {
                RefInfo r = (RefInfo)dgvBib.Rows[row].Tag;
                b.AppendLine();
                b.AppendLine(r.Cat + "  —  " + r.Title);
                if (r.N > 0) b.AppendLine((Zh ? "引用条目：" : "Записей: ") + r.N);
                if (r.Url != "") b.AppendLine(r.Url);
                if (r.Note != "") b.AppendLine(r.Note);
            }
            rtbBib.Text = b.ToString();
        }

        void OpenBib(int row)
        {
            if (row < 0 || row >= dgvBib.Rows.Count) return;
            RefInfo r = dgvBib.Rows[row].Tag as RefInfo;
            if (r != null && r.Url != "") Open(r.Url);
        }

        void FillRef()
        {
            refMode = cmbRef.SelectedIndex == 0 ? "abbr" : cmbRef.SelectedIndex == 1 ? "nick" : cmbRef.SelectedIndex == 2 ? "org" : cmbRef.SelectedIndex == 3 ? "type" : "src";
            dgvRef.Columns.Clear(); dgvRef.Rows.Clear();
            if (refMode == "abbr" || refMode == "nick")
            {
                dgvRef.Columns.Add(MkCol(Zh ? "俄文" : "Русский", 260));
                dgvRef.Columns.Add(MkCol(Zh ? "中文" : "Китайский", 300));
                dgvRef.Columns.Add(MkCol(Zh ? "条目" : "Записей", 90));
                List<CatInfo> list = refMode == "abbr" ? D.Abbr : D.Nicks;
                foreach (CatInfo c in list) dgvRef.Rows.Add(c.Key, c.Zh, c.N);
            }
            else if (refMode == "org")
            {
                dgvRef.Columns.Add(MkCol(Zh ? "单位" : "Организация", 340));
                dgvRef.Columns.Add(MkCol("ID", 140));
                dgvRef.Columns.Add(MkCol(Zh ? "俄文" : "Русский", 220));
                dgvRef.Columns.Add(MkCol(Zh ? "城市" : "Город", 130));
                dgvRef.Columns.Add(MkCol(Zh ? "条目" : "Записей", 80));
                foreach (KeyValuePair<string, CatInfo> kv in D.Orgs)
                    dgvRef.Rows.Add(Zh ? kv.Value.Zh : kv.Value.Ru, kv.Key, kv.Value.Ru, kv.Value.City, kv.Value.N);
            }
            else if (refMode == "type")
            {
                dgvRef.Columns.Add(MkCol(Zh ? "类型" : "Тип", 220));
                dgvRef.Columns.Add(MkCol(Zh ? "俄文" : "Русский", 320));
                dgvRef.Columns.Add(MkCol("key", 120));
                dgvRef.Columns.Add(MkCol(Zh ? "条目" : "Записей", 90));
                foreach (KeyValuePair<string, CatInfo> kv in D.Types)
                    dgvRef.Rows.Add(Zh ? kv.Value.Zh : kv.Value.Ru, kv.Value.Ru, kv.Key, kv.Value.N);
            }
            else
            {
                dgvRef.Columns.Add(MkCol("key", 130));
                dgvRef.Columns.Add(MkCol(Zh ? "说明" : "Описание", 1000));
                foreach (KeyValuePair<string, string> kv in D.LS) dgvRef.Rows.Add(kv.Key, kv.Value);
            }
            if (dgvRef.Rows.Count > 0) dgvRef.CurrentCell = dgvRef.Rows[0].Cells[0];
            ShowRefDetail();
        }

        void ShowRefDetail()
        {
            StringBuilder b = new StringBuilder();
            if (refMode == "type" || refMode == "org" || refMode == "src")
                b.AppendLine(Zh ? "双击一行 → 在索引总表中筛选该分类。" : "Двойной щелчок — фильтр в указателе.");
            else
                b.AppendLine(Zh ? "双击一行 → 在索引总表中搜索该词。" : "Двойной щелчок — поиск в указателе.");
            b.AppendLine();
            b.AppendLine(Zh ? "详查索引共 " + (D.Abbr.Count + D.Nicks.Count + D.Orgs.Count + D.Types.Count) + " 条。"
                            : "Всего в справочнике " + (D.Abbr.Count + D.Nicks.Count + D.Orgs.Count + D.Types.Count) + " записей.");
            int row = dgvRef.CurrentCell == null ? -1 : dgvRef.CurrentCell.RowIndex;
            if (row >= 0 && row < dgvRef.Rows.Count && (refMode == "abbr" || refMode == "nick"))
            {
                string needle = Convert.ToString(dgvRef.Rows[row].Cells[0].Value);
                string mean = Convert.ToString(dgvRef.Rows[row].Cells[1].Value);
                b.AppendLine();
                b.AppendLine(needle + "  —  " + mean);
                b.AppendLine(Zh ? "含该词的条目：" : "Записи с этим словом:");
                int c = 0;
                foreach (Rec r in D.Recs)
                {
                    bool hit = r.Ru.IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0
                            || (r.Zh.Length > 0 && r.Zh.IndexOf(needle, StringComparison.Ordinal) >= 0);
                    if (!hit) continue;
                    b.AppendLine("  " + r.Idx + "   " + (r.Zh.Length > 0 ? r.Zh : r.Ru));
                    if (++c >= 20) { b.AppendLine("  …"); break; }
                }
                if (c == 0) b.AppendLine("  —");
            }
            rtbRef.Text = b.ToString();
            rtbRef.Select(0, 0);
        }

        void JumpFromRef(int row)
        {
            if (row < 0) return;
            string needle = "";
            if (refMode == "abbr" || refMode == "nick") needle = row < dgvRef.Rows.Count ? Convert.ToString(dgvRef.Rows[row].Cells[0].Value) : "";
            else if (refMode == "org") { if (row < dgvRef.Rows.Count) { fOrg = Convert.ToString(dgvRef.Rows[row].Cells[1].Value); tabs.SelectedIndex = 0; fSeries = ""; fType = ""; q = ""; txtSearch.Text = ""; ApplyFilter(); } return; }
            else if (refMode == "type") { if (row < dgvRef.Rows.Count) { fType = Convert.ToString(dgvRef.Rows[row].Cells[2].Value); tabs.SelectedIndex = 0; fSeries = ""; fOrg = ""; q = ""; txtSearch.Text = ""; ApplyFilter(); } return; }
            if (needle.Length > 0) JumpTo(needle);
        }

        // ------------------------------------------------------------ export
        void ExportCsv()
        {
            SaveFileDialog s = new SaveFileDialog();
            s.Filter = "CSV|*.csv"; s.FileName = "grau_index_view.csv";
            if (s.ShowDialog() != DialogResult.OK) return;
            WriteCsv(s.FileName);
            MessageBox.Show((Zh ? "已导出 " : "Экспортировано ") + view.Count, "CSV");
        }

        void WriteCsv(string file)
        {
            StringBuilder b = new StringBuilder();
            b.AppendLine("索引;类型;中文说明;俄文说明;北约代号;单位;序列;来源");
            foreach (Rec r in view)
            {
                b.Append(Csv(Lat ? Data.Tr(r.Idx) : r.Idx)).Append(';').Append(Csv(D.TypeLabel(r.Type, Zh))).Append(';').Append(Csv(r.Zh)).Append(';')
                 .Append(Csv(r.Ru)).Append(';').Append(Csv(r.Nato)).Append(';').Append(Csv(OrgText(r.Org, Zh, false))).Append(';')
                 .Append(Csv(r.Prefix)).Append(';').Append(Csv(r.HasLit ? r.LitSrc : "")).AppendLine();
            }
            File.WriteAllText(file, b.ToString(), new UTF8Encoding(true));
        }

        static string Csv(string s)
        {
            if (s == null) return "";
            if (s.IndexOf(';') >= 0 || s.IndexOf('"') >= 0 || s.IndexOf('\n') >= 0) return "\"" + s.Replace("\"", "\"\"") + "\"";
            return s;
        }

        // ------------------------------------------------------------- tests
        void Shoot()
        {
            try
            {
                StringBuilder dbg = new StringBuilder();
                dbg.AppendLine("rtb.TextLength=" + rtb.TextLength + " bounds=" + rtb.Bounds + " fore=" + rtb.ForeColor + " back=" + rtb.BackColor + " font=" + rtb.Font);
                dbg.AppendLine("pic=" + pic.Bounds + " lstEd=" + lstEd.Bounds + " det=" + pic.Parent.Bounds);
                dbg.AppendLine("view=" + view.Count + " rows=" + dgv.RowCount + " cur=" + (dgv.CurrentCell == null ? "null" : dgv.CurrentCell.RowIndex.ToString()));
                dbg.AppendLine("text[0..120]=" + rtb.Text.Substring(0, Math.Min(120, rtb.Text.Length)).Replace("\n", "\\n").Replace("\r", ""));
                File.WriteAllText(shotFile + ".txt", dbg.ToString(), new UTF8Encoding(false));
                BringToFront(); Activate();
                TopMost = true;
                if (txtSearch.Text.Length > 0) { txtSearch.Focus(); UpdateSuggest(); }
                Application.DoEvents();
                System.Threading.Thread.Sleep(900);
                Application.DoEvents();
                Bitmap bmp = new Bitmap(Width, Height);
                using (Graphics g = Graphics.FromImage(bmp)) g.CopyFromScreen(Location, Point.Empty, new Size(Width, Height));
                bmp.Save(shotFile, System.Drawing.Imaging.ImageFormat.Png);
                bmp.Dispose();
                TopMost = false;
            }
            catch (Exception ex) { File.WriteAllText(shotFile + ".err.txt", ex.ToString()); }
            Close();
        }

        void SelfTest()
        {
            StringBuilder b = new StringBuilder();
            b.AppendLine("entries=" + D.Recs.Count);
            b.AppendLine("series=" + D.Series.Count + " types=" + D.Types.Count + " orgs=" + D.Orgs.Count);
            b.AppendLine("wiki=" + D.Wiki.Count + " altRows=" + D.WikiAlt.Count + " abbr=" + D.Abbr.Count + " nicks=" + D.Nicks.Count);
            b.AppendLine("gbtu=" + D.Gbtu.Count + " giu=" + D.Giu.Count + " gau=" + D.Gau.Count + " mo=" + D.Mo.Count);
            b.AppendLine("tz=" + D.TZ.Count + " dz=" + D.DZ.Count);
            int withLit = 0; foreach (Rec r in D.Recs) if (r.HasLit) withLit++;
            b.AppendLine("withLit=" + withLit + " view=" + view.Count);
            int pics = 0, miss = 0;
            foreach (Rec r in D.Recs)
            {
                WikiRec o;
                string t = D.PictureOf(r.Idx, out o);
                if (t == null) continue;
                if (D.GetImage(t) != null) pics++; else miss++;
            }
            b.AppendLine("pictures resolved=" + pics + " missing=" + miss);
            b.AppendLine("first=" + D.Recs[0].Idx + " / " + D.Recs[0].Ru.Substring(0, Math.Min(40, D.Recs[0].Ru.Length)));
            File.WriteAllText(selfTest, b.ToString(), new UTF8Encoding(false));
            Close();
        }
    }
}
