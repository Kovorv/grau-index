// Entry point + splash for the native GRAU index app.
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace GrauIndex
{
    public class SplashForm : Form
    {
        Image cover;
        public SplashForm()
        {
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(900, 580);
            ShowInTaskbar = false;
            TopMost = true;
            DoubleBuffered = true;
            try
            {
                Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("cover.jpg");
                if (s != null) cover = Image.FromStream(s);
            }
            catch { }
            Click += delegate { Close(); };
            KeyDown += delegate { Close(); };
            Timer t = new Timer(); t.Interval = 1500; t.Tick += delegate { t.Stop(); Close(); }; t.Start();
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            if (cover != null) e.Graphics.DrawImage(cover, 0, 0, ClientSize.Width, ClientSize.Height);
            else e.Graphics.Clear(Color.FromArgb(20, 22, 26));
            // author + disclaimer strip (v1.4.1)
            int bandH = 96;
            using (SolidBrush sb = new SolidBrush(Color.FromArgb(178, 12, 13, 16)))
                e.Graphics.FillRectangle(sb, 0, ClientSize.Height - bandH, ClientSize.Width, bandH);
            using (SolidBrush sb = new SolidBrush(Color.FromArgb(232, 236, 242)))
            using (Font f1 = new Font("Microsoft YaHei", 11.5f, FontStyle.Bold))
            using (Font f2 = new Font("Microsoft YaHei", 9f))
            {
                e.Graphics.DrawString("整理：@科夫罗夫机械（防空妖精哥特羊） · @Deepseek · 三陆问题研究中心", f1, sb, 18, ClientSize.Height - bandH + 10);
                e.Graphics.DrawString("本索引为个人整理的非官方公开资料汇编，仅供检索参考，不代表任何官方名录；", f2, sb, 18, ClientSize.Height - bandH + 40);
                e.Graphics.DrawString("编号、描述与译名可能存在错漏，请以原始来源为准。  ·  Неофициальный справочник по открытым источникам.", f2, sb, 18, ClientSize.Height - bandH + 62);
            }
            using (Pen p = new Pen(Color.FromArgb(70, 78, 90)))
                e.Graphics.DrawRectangle(p, 0, 0, ClientSize.Width - 1, ClientSize.Height - 1);
            base.OnPaint(e);
        }
        protected override void OnPaintBackground(PaintEventArgs e) { }
    }

    public static class Program
    {
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        static extern bool SetProcessDPIAware();

        [STAThread]
        public static void Main(string[] args)
        {
            try { SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.CurrentCulture = CultureInfo.InvariantCulture;

            bool noSplash = false, zh = true, light = false, zhGiven = false, lightGiven = false, lat = false;
            string search = null, shot = null, selftest = null, diag = null, csv = null; bool ctx = false;
            string fser = null, ffam = null, ftyp = null, forg = null;
            int flit = -1, fcard = -1;
            int field = 0, tab = 0;
            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i];
                if (a == "--no-splash" || a == "-n") noSplash = true;
                else if (a == "--search" && i + 1 < args.Length) search = args[++i];
                else if (a == "--field" && i + 1 < args.Length) field = int.Parse(args[++i]);
                else if (a == "--tab" && i + 1 < args.Length) tab = int.Parse(args[++i]);
                else if (a == "--fser" && i + 1 < args.Length) fser = args[++i];
                else if (a == "--ffam" && i + 1 < args.Length) ffam = args[++i];
                else if (a == "--ftype" && i + 1 < args.Length) ftyp = args[++i];
                else if (a == "--forg" && i + 1 < args.Length) forg = args[++i];
                else if (a == "--flit" && i + 1 < args.Length) flit = int.Parse(args[++i]);
                else if (a == "--fcard" && i + 1 < args.Length) fcard = int.Parse(args[++i]);
                else if (a == "--ru") { zh = false; zhGiven = true; }
                else if (a == "--light") { light = true; lightGiven = true; }
                else if (a == "--lat") lat = true;
                else if (a == "--shot" && i + 1 < args.Length) shot = args[++i];
                else if (a == "--ctx") ctx = true;
                else if (a == "--csv" && i + 1 < args.Length) csv = args[++i];
                else if (a == "--selftest" && i + 1 < args.Length) selftest = args[++i];
                else if (a == "--diag" && i + 1 < args.Length) diag = args[++i];
                else if (a == "-h" || a == "--help")
                {
                    MessageBox.Show(
                        "ГРАУ / ГАУ 索引号总表 — 原生版\n\n" +
                        "  --no-splash          跳过封面\n" +
                        "  --search <文本>      启动时搜索\n" +
                        "  --field <0-4>        搜索字段（0 全部 / 1 索引 / 2 中文 / 3 俄文 / 4 北约）\n" +
                        "  --tab <0-2>          起始标签页\n" +
                        "  --ru                 俄文界面\n" +
                        "  --light              浅色主题\n" +
                        "  --lat                索引号用拉丁转写显示\n" +
                        "  --csv <文件>         导出当前筛选结果并退出\n" +
                        "  --fser <序列>        预选序列（如 9）\n" +
                        "  --ffam <索引族>      预选索引族（如 9К）\n" +
                        "  --ftype <类型代码>   预选器材类型（如 sam）\n" +
                        "  --forg <单位代码>    预选研制单位\n" +
                        "  --flit <0|1|2>       来源筛选（0 全部 / 1 仅三源 / 2 仅补充）\n" +
                        "  --fcard <0|1|2>      卡片筛选（0 全部 / 1 有条目 / 2 无条目）\n" +
                        "  --shot <png>         渲染后截图并退出（自检用）\n" +
                        "  --selftest <txt>     写出数据自检报告并退出\n", "GRAU 索引");
                    return;
                }
            }

            SplashForm sp = null;
            DateTime t0 = DateTime.Now;
            if (!noSplash && shot == null && selftest == null && csv == null)
            {
                sp = new SplashForm();
                sp.Show();
                sp.Refresh();
                Application.DoEvents();
            }
            Data d = Data.Load();
            if (sp != null)
            {
                // keep the cover on screen for a moment even though loading is fast
                int rest = 1200 - (int)(DateTime.Now - t0).TotalMilliseconds;
                while (rest > 0) { Application.DoEvents(); System.Threading.Thread.Sleep(50); rest -= 50; }
                sp.Close(); sp.Dispose();
            }

            MainForm f = new MainForm(d, tab, search, field, zh);
            f.SetPrefs(zhGiven, zh, lightGiven, light);
            if (lat) f.SetLat(true);
            f.SetFilter(fser, ffam, ftyp, forg, flit, fcard);
            f.CtxForShot = ctx;
            f.SetModes(shot, selftest);
            f.SetDiag(diag);
            f.SetCsv(csv);
            Application.Run(f);
        }
    }
}
