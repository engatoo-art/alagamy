using System.Reflection;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Alagamy;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}

/// <summary>
/// برنامج ويندوز مستقل: صفحات البرنامج جوه الملف نفسه، والبيانات بتتحفظ في قاعدة البيانات أونلاين
/// </summary>
public class MainForm : Form
{
    private const string Host = "app.alagamy.local";
    private readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    private readonly string _root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Alagamy");

    public MainForm()
    {
        Text = "العجمي للخضروات والفاكهة";
        Size = new Size(1360, 860);
        MinimumSize = new Size(900, 600);
        StartPosition = FormStartPosition.CenterScreen;
        WindowState = FormWindowState.Maximized;
        try { Icon = Icon.ExtractAssociatedIcon(Environment.ProcessPath); } catch { }
        BackColor = Color.FromArgb(244, 246, 241);
        Controls.Add(_web);
        Load += async (s, e) => await StartAsync();
    }

    private string ExtractSite()
    {
        // بنطلّع الصفحات من جوه الـ exe في كل تشغيل، علشان أي نسخة جديدة تاخد مكان القديمة
        string site = Path.Combine(_root, "site");
        if (Directory.Exists(site)) Directory.Delete(site, true);
        var asm = Assembly.GetExecutingAssembly();
        foreach (var name in asm.GetManifestResourceNames())
        {
            if (!name.StartsWith("site/")) continue;
            string rel = name.Substring(5).Replace('\\', '/');
            string path = Path.Combine(site, rel.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            using var src = asm.GetManifestResourceStream(name)!;
            using var dst = File.Create(path);
            src.CopyTo(dst);
        }
        return site;
    }

    private async Task StartAsync()
    {
        try
        {
            string site = ExtractSite();
            var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(_root, "webview"));
            await _web.EnsureCoreWebView2Async(env);
            var core = _web.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping(Host, site, CoreWebView2HostResourceAccessKind.Allow);
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = true;
            // أي رابط خارجي يفتح في المتصفح العادي
            core.NewWindowRequested += (s, e) =>
            {
                e.Handled = true;
                try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(e.Uri) { UseShellExecute = true }); } catch { }
            };
            core.Navigate($"https://{Host}/index.html");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            var r = MessageBox.Show(
                "البرنامج محتاج مكوّن من مايكروسوفت اسمه WebView2 (مجاني وبيتسطّب في دقيقة).\n\nتحب تفتح صفحة التحميل دلوقتي؟",
                Text, MessageBoxButtons.YesNo, MessageBoxIcon.Information, MessageBoxDefaultButton.Button1,
                MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
            if (r == DialogResult.Yes)
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("https://go.microsoft.com/fwlink/p/?LinkId=2124703") { UseShellExecute = true });
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show("حصلت مشكلة وهو بيفتح:\n" + ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Error,
                MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
            Close();
        }
    }
}
