using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace Alagamy;

internal static class Program
{
    public const string AppName = "محل عبده العجمي وأولاده محمد وعبدالرحمن";

    [STAThread]
    private static void Main()
    {
        // نسخة واحدة بس من البرنامج تشتغل في نفس الوقت
        using var mutex = new Mutex(true, "Alagamy.Accounts.SingleInstance", out bool first);
        if (!first)
        {
            MessageBox.Show("البرنامج مفتوح بالفعل.", AppName, MessageBoxButtons.OK, MessageBoxIcon.Information,
                MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
            return;
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}

/// <summary>إعدادات البرنامج على الجهاز: مكان حفظ ملفات Excel وآخر مرة اتحفظت</summary>
internal static class Prefs
{
    private const string Key = @"Software\Alagamy";
    public static readonly string[] AllowedFiles = { "العجمي - كل البيانات.xlsx", "العجمي - الزمامات.xlsx", "العجمي - العملاء.xlsx" };

    private static string Get(string name)
    {
        try
        {
            using var k = Registry.CurrentUser.OpenSubKey(Key);
            if (k?.GetValue(name) is string v && v.Length > 0) return v;
            using var m = Registry.LocalMachine.OpenSubKey(Key); // اللي اتكتب وقت التسطيب
            if (m?.GetValue(name) is string mv && mv.Length > 0) return mv;
        }
        catch { }
        return null;
    }

    private static void Set(string name, string value)
    {
        using var k = Registry.CurrentUser.CreateSubKey(Key);
        k.SetValue(name, value);
    }

    public static string BackupDir
    {
        get
        {
            var d = Get("BackupDir");
            if (d != null) return d;
            // ملف جنب البرنامج بيكتبه برنامج التسطيب
            try
            {
                var f = Path.Combine(AppContext.BaseDirectory, "backup-folder.txt");
                if (File.Exists(f)) { var t = File.ReadAllText(f).Trim(); if (t.Length > 0) return t; }
            }
            catch { }
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "العجمي - نسخ احتياطية");
        }
        set => Set("BackupDir", value);
    }

    public static DateTime? LastBackup
    {
        get => DateTime.TryParse(Get("LastBackup"), null, System.Globalization.DateTimeStyles.RoundtripKind, out var d) ? d : null;
        set => Set("LastBackup", value?.ToString("o") ?? "");
    }
}

/// <summary>
/// برنامج ويندوز مستقل: صفحات البرنامج جوه الملف نفسه، والبيانات بتتحفظ في قاعدة البيانات أونلاين،
/// ونسخة Excel بتتحفظ على الجهاز كل 24 ساعة
/// </summary>
public class MainForm : Form
{
    // آخر نسخة من البرنامج على النت — البرنامج بيفتحها كل مرة علشان التحديثات توصل لوحدها
    // البرنامج على الاستضافة بتاعة المحل — بيتفتح كل مرة علشان التحديثات توصل لوحدها
    private const string Remote = "https://alagmy.com/shop/";

    // الدومين بتاع المحل (نسخة الاستضافة) — يوم النقل اللينك القديم بيحوّل عليه لوحده
    private static readonly string[] Domains = { "https://alagmy.com/", "https://www.alagmy.com/" };

    private static bool Ours(string uri) =>
        Array.Exists(Domains, d => uri.StartsWith(d, StringComparison.OrdinalIgnoreCase));

    // صفحة "مفيش اتصال": البرنامج مابيفتحش أي نسخة قديمة، علشان محدش يسجل في مكان غلط
    private static readonly string OfflinePage = @"<!DOCTYPE html><html lang=""ar"" dir=""rtl""><head><meta charset=""utf-8"">
<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#f2f5ef;font-family:'Segoe UI',Tahoma,sans-serif;color:#1d2a24}
.c{text-align:center;max-width:460px;padding:30px;background:#fff;border-radius:16px;box-shadow:0 8px 28px rgba(20,60,40,.12)}
h1{color:#17553a;margin:0 0 10px;font-size:24px}p{color:#5b6b62;line-height:1.8;margin:0 0 20px}
button{background:#17553a;color:#fff;border:0;border-radius:10px;padding:12px 30px;font-size:17px;font-weight:700;cursor:pointer}</style></head>
<body><div class=""c""><h1>مفيش اتصال بالإنترنت</h1><p>البرنامج محتاج نت علشان يوصل لحسابات المحل.<br>اتأكد من النت ودوس ""حاول تاني"" — وهو بيحاول لوحده كل 15 ثانية.</p>
<button onclick=""location.href='https://alagmy.com/shop/'"">حاول تاني</button></div>
<script>setTimeout(function(){location.href='https://alagmy.com/shop/'},15000)</script></body></html>";
    private readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    private readonly string _root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Alagamy");

    public MainForm()
    {
        Text = Program.AppName;
        Size = new Size(1360, 860);
        MinimumSize = new Size(900, 600);
        StartPosition = FormStartPosition.CenterScreen;
        WindowState = FormWindowState.Maximized;
        RightToLeft = RightToLeft.Yes;
        RightToLeftLayout = true;
        try { Icon = Icon.ExtractAssociatedIcon(Environment.ProcessPath); } catch { }
        BackColor = Color.FromArgb(244, 246, 241);
        Controls.Add(_web);
        Load += async (s, e) => await StartAsync();
    }

    private static void OpenExternal(string uri)
    {
        // بنفتح بس لينكات النت والإيميل والتليفون في برامجها — أي حاجة تانية بتترفض
        if (Uri.TryCreate(uri, UriKind.Absolute, out var u) && (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp
            || u.Scheme == Uri.UriSchemeMailto || u.Scheme == "tel"))
        {
            try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(u.AbsoluteUri) { UseShellExecute = true }); } catch { }
        }
    }

    private async Task StartAsync()
    {
        try
        {
            var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(_root, "webview"));
            await _web.EnsureCoreWebView2Async(env);
            var core = _web.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = true;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.AreHostObjectsAllowed = false;

            // البرنامج مايفتحش أي صفحة غير صفحاته هو
            core.NavigationStarting += (s, e) =>
            {
                if (Ours(e.Uri) || e.Uri == "about:blank" || e.Uri.StartsWith("data:text/html", StringComparison.OrdinalIgnoreCase)) return;
                e.Cancel = true;
                OpenExternal(e.Uri);
            };
            core.FrameNavigationStarting += (s, e) =>
            {
                if (Ours(e.Uri) || e.Uri.StartsWith("about:")) return;
                e.Cancel = true;
            };
            core.NewWindowRequested += (s, e) => { e.Handled = true; OpenExternal(e.Uri); };
            core.PermissionRequested += (s, e) => e.State = CoreWebView2PermissionState.Deny;
            core.WebMessageReceived += OnMessage;

            // لو النت أو الموقع مش شغال بنعرض صفحة "مفيش اتصال" وبنحاول تاني
            core.NavigationCompleted += (s, e) =>
            {
                if (!e.IsSuccess && e.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled && Ours(core.Source))
                    core.NavigateToString(OfflinePage);
            };
            try { await core.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache); } catch { }
            core.Navigate(Remote + "?v=" + DateTime.UtcNow.Ticks);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            var r = MessageBox.Show(
                "البرنامج محتاج مكوّن من مايكروسوفت اسمه WebView2 (مجاني وبيتسطّب في دقيقة).\n\nتحب تفتح صفحة التحميل دلوقتي؟",
                Text, MessageBoxButtons.YesNo, MessageBoxIcon.Information, MessageBoxDefaultButton.Button1,
                MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
            if (r == DialogResult.Yes) OpenExternal("https://go.microsoft.com/fwlink/p/?LinkId=2124703");
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show("حصلت مشكلة وهو بيفتح:\n" + ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Error,
                MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
            Close();
        }
    }

    // ===================== الكلام بين صفحات البرنامج والويندوز =====================
    private void Reply(JsonNode msg, JsonObject data)
    {
        data["id"] = msg?["id"]?.GetValue<int>() ?? 0;
        _web.CoreWebView2.PostWebMessageAsJson(data.ToJsonString());
    }

    private void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        // بنقبل رسايل من صفحات البرنامج بس
        if (!Ours(e.Source)) return;
        JsonNode msg = null;
        try
        {
            msg = JsonNode.Parse(e.WebMessageAsJson);
            switch (msg?["type"]?.GetValue<string>())
            {
                case "backup-config":
                    var last = Prefs.LastBackup;
                    Reply(msg, new JsonObject
                    {
                        ["dir"] = Prefs.BackupDir,
                        ["last"] = last?.ToString("o"),
                        ["due"] = last == null || DateTime.UtcNow - last.Value.ToUniversalTime() >= TimeSpan.FromHours(24),
                    });
                    break;
                case "save-backup":
                    Reply(msg, new JsonObject { ["dir"] = SaveBackup(msg["files"]!.AsArray()) });
                    break;
                case "pick-folder":
                    using (var dlg = new FolderBrowserDialog
                    {
                        Description = "اختار الفولدر اللي ملفات Excel تتحفظ فيه",
                        UseDescriptionForTitle = true,
                        SelectedPath = Prefs.BackupDir,
                        ShowNewFolderButton = true,
                    })
                    {
                        string dir = null;
                        if (dlg.ShowDialog(this) == DialogResult.OK && Directory.Exists(dlg.SelectedPath))
                        {
                            Prefs.BackupDir = dir = dlg.SelectedPath;
                            Prefs.LastBackup = null; // يحفظ في المكان الجديد على طول
                        }
                        Reply(msg, new JsonObject { ["dir"] = dir });
                    }
                    break;
                case "open-folder":
                    Directory.CreateDirectory(Prefs.BackupDir);
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", "\"" + Prefs.BackupDir + "\"") { UseShellExecute = true });
                    Reply(msg, new JsonObject());
                    break;
            }
        }
        catch (Exception ex)
        {
            try { Reply(msg, new JsonObject { ["error"] = ex.Message }); } catch { }
        }
    }

    private static string SaveBackup(JsonArray files)
    {
        string dir = Prefs.BackupDir;
        Directory.CreateDirectory(dir);
        string archive = Path.Combine(dir, "نسخ قديمة", DateTime.Now.ToString("yyyy-MM-dd"));
        Directory.CreateDirectory(archive);
        foreach (var f in files)
        {
            string name = f?["name"]?.GetValue<string>() ?? "";
            // أسماء الملفات ثابتة — أي اسم تاني بيترفض
            if (Array.IndexOf(Prefs.AllowedFiles, name) < 0) throw new InvalidOperationException("اسم ملف مش مسموح");
            byte[] bytes = Convert.FromBase64String(f["data"]!.GetValue<string>());
            if (bytes.Length < 100 || bytes[0] != 'P' || bytes[1] != 'K') throw new InvalidOperationException("الملف مش Excel سليم");

            File.WriteAllBytes(Path.Combine(archive, name), bytes);
            string target = Path.Combine(dir, name);
            string tmp = target + ".tmp";
            File.WriteAllBytes(tmp, bytes);
            try { File.Move(tmp, target, true); }
            catch (IOException)
            {
                // الملف مفتوح في Excel: بنسيبه ونحفظ نسخة جنبه
                File.Move(tmp, Path.Combine(dir, Path.GetFileNameWithoutExtension(name) + " (جديد).xlsx"), true);
            }
        }
        // بنمسح النسخ اليومية الأقدم من 60 يوم
        try
        {
            foreach (var old in Directory.GetDirectories(Path.Combine(dir, "نسخ قديمة")))
                if (DateTime.TryParse(Path.GetFileName(old), out var d) && d < DateTime.Today.AddDays(-60)) Directory.Delete(old, true);
        }
        catch { }
        Prefs.LastBackup = DateTime.UtcNow;
        return dir;
    }
}
