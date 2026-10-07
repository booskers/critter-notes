// Critter Setup: the one installer for Critter VTT, Critter Sounds and Critter Notes (the same file in all three apps).
// It never needs changing for a new release: everything about the app (name, colour, logo, version, files) comes from
// the payload that installer/pack.mjs appends to this program, so a release only packs new data behind the same engine.
//
// Setup file layout:  [this program][payload][trailer: "CRITPAK1", int64 payload start, int64 payload length]
//   payload = int32 manifest length, the manifest (UTF-8 JSON), then each file as raw deflate.
//   manifest = { format, app: {...}, assets: [{n,o,c,s,crc}], files: [{p,o,c,s,crc}] }   (o = offset after the manifest)
//
// How it runs:
//   (no arguments)          the installer window: install, update or reinstall
//   /S                      the same without a window; /D=<folder> picks the folder (the last argument, as with NSIS);
//                           --no-desktop leaves out the desktop shortcut
//   --updated               an update started by an older version of the app: a small progress window, then the app
//                           starts again with --updated (older versions hand over to the installer this way)
//   --apply --dir= --staged= --pid=   an update the app has already unpacked (updater.js): no window at all; waits for
//                           the app to close, swaps the files in, writes .critter\result.json, starts the app again
//                           and removes its own download (<updater cache>\pending); a failed update keeps it for Try again
//   --uninstall             the uninstaller (the copy in the app's folder is this program with only the app's details)
// Testing: --shot=<png> --page=<welcome|progress|done|error|uninstall|updating> draws one page to a picture and quits.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace CritterSetup
{
    static class Program
    {
        public static Pack Pack;
        public static Opts O;
        public static string Self;

        [STAThread]
        static int Main(string[] argv)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            O = Opts.Parse(argv);
            Self = Application.ExecutablePath;
            try { Pack = Pack.Open(Self); }
            catch (Exception e)
            {
                if (!O.Silent && !O.Apply) MessageBox.Show("This setup file is incomplete or damaged, so nothing was installed.\n\nDownload it again and try once more.\n\n(" + e.Message + ")", "Critter Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 2;
            }
            if (O.Shot != null) return Ui.Shot(O.Shot, O.ShotPage);
            if (O.Apply) return Engine.ApplyStaged() ? 0 : 1;
            if (O.Uninstall) return RunUninstall();
            return RunInstall();
        }

        static int RunInstall()
        {
            if (Pack.Files.Count == 0) { if (!O.Silent) MessageBox.Show("This is the uninstaller. Run Critter's setup file to install.", Pack.App.Name); return 2; }
            var found = Engine.FindExisting();
            string dir = O.Dir ?? (found != null ? found.Dir : Engine.DefaultDir());
            string scope = found != null && O.Dir == null ? found.Scope : "user";
            // a folder this user can't write to (an older install for everyone, in Program Files) needs administrator rights once
            if (!Engine.CanWrite(dir) && !Engine.IsAdmin() && !O.Elevated) return Engine.Elevate(dir) ? 0 : 1;
            if (O.Silent)
            {
                try
                {
                    Engine.Install(dir, scope, found, O.NoDesktop ? false : O.Updated ? (bool?)null : (found == null ? true : (bool?)null), O.Updated ? 30000 : 8000, null);
                    if (O.Updated || O.ForceRun) Engine.Launch(dir, O.Updated);
                    if (O.Updated) Engine.RemoveDownloadLater();
                    return 0;
                }
                catch (Exception e) { Engine.WriteResult(dir, false, found, e.Message); if (O.Updated) Engine.Launch(dir, true); return 1; }
            }
            var ui = new Ui(O.Updated ? Ui.Mode.Updating : Ui.Mode.Install, dir, scope, found);
            Application.Run(ui);
            return ui.ExitCode;
        }

        static int RunUninstall()
        {
            string dir = O.Dir ?? Path.GetDirectoryName(Self);
            // the uninstaller can't remove itself while it runs, so a copy in the temp folder does the work
            if (!O.FromTemp)
            {
                string tmp = Path.Combine(Path.GetTempPath(), "critter-uninstall-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".exe");
                File.Copy(Self, tmp, true);
                var args = new List<string> { "--uninstall", "--from-temp", "--dir=" + dir };
                if (O.Silent) args.Add("/S");
                if (O.RemoveData) args.Add("--remove-data");
                var psi = new ProcessStartInfo(tmp, Opts.Join(args)) { UseShellExecute = false };
                if (!Engine.CanWrite(dir) && !Engine.IsAdmin()) { psi.UseShellExecute = true; psi.Verb = "runas"; }
                try { Process.Start(psi); return 0; } catch { return 1; }
            }
            int code = 0;
            if (O.Silent) { try { Engine.Uninstall(dir, O.RemoveData, null); } catch { code = 1; } }
            else { var ui = new Ui(Ui.Mode.Uninstall, dir, null, null); Application.Run(ui); code = ui.ExitCode; }
            Engine.DeleteSelfLater();
            return code;
        }
    }

    // ---------- the command line ----------
    class Opts
    {
        public bool Silent, Updated, ForceRun, Apply, Uninstall, FromTemp, RemoveData, Elevated, NoDesktop;
        public string Dir, Staged, From, Shot, ShotPage, Theme;
        public int Pid;
        public List<string> Raw = new List<string>();
        public static Opts Parse(string[] a)
        {
            var o = new Opts();
            foreach (var s in a)
            {
                o.Raw.Add(s);
                if (s == "/S" || s == "--silent") o.Silent = true;
                else if (s == "--updated") o.Updated = true;
                else if (s == "--force-run") o.ForceRun = true;
                else if (s == "--apply") o.Apply = true;
                else if (s == "--uninstall") o.Uninstall = true;
                else if (s == "--from-temp") o.FromTemp = true;
                else if (s == "--remove-data") o.RemoveData = true;
                else if (s == "--elevated") o.Elevated = true;
                else if (s == "--no-desktop") o.NoDesktop = true;
                else if (s.StartsWith("/D=")) o.Dir = Clean(s.Substring(3));
                else if (s.StartsWith("--dir=")) o.Dir = Clean(s.Substring(6));
                else if (s.StartsWith("--staged=")) o.Staged = Clean(s.Substring(9));
                else if (s.StartsWith("--from=")) o.From = s.Substring(7);
                else if (s.StartsWith("--pid=")) int.TryParse(s.Substring(6), out o.Pid);
                else if (s.StartsWith("--shot=")) o.Shot = s.Substring(7);
                else if (s.StartsWith("--page=")) o.ShotPage = s.Substring(7);
                else if (s.StartsWith("--theme=")) o.Theme = s.Substring(8);
            }
            return o;
        }
        static string Clean(string p) { p = p.Trim().Trim('"'); return p.Length > 3 ? p.TrimEnd('\\') : p; }
        public static string Join(IEnumerable<string> args)
        {
            var sb = new StringBuilder();
            foreach (var a in args)
            {
                if (sb.Length > 0) sb.Append(' ');
                if (a.IndexOfAny(new[] { ' ', '\t', '"' }) < 0 && a.Length > 0) sb.Append(a);
                else sb.Append('"').Append(a.Replace("\"", "\\\"")).Append('"');
            }
            return sb.ToString();
        }
    }

    // ---------- the payload ----------
    class Entry { public string P; public long O, C, S; public uint Crc; }
    class AppInfo
    {
        public string Id, Name, Exe, Folder, Shortcut, Version, Publisher, Url, Description, Accent, RegKey, UpdaterCache;
        public string[] DataDirs;
    }
    class Pack
    {
        public string FilePath;
        public long Start, Length, DataStart;
        public Dictionary<string, object> M;
        public AppInfo App;
        public List<Entry> Files = new List<Entry>(), Assets = new List<Entry>();
        public long TotalSize;

        public static Pack Open(string file)
        {
            var p = new Pack { FilePath = file };
            using (var fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                if (fs.Length < 32) throw new InvalidDataException("no payload");
                var br = new BinaryReader(fs);
                fs.Position = fs.Length - 24;
                if (Encoding.ASCII.GetString(br.ReadBytes(8)) != "CRITPAK1") throw new InvalidDataException("no Critter payload");
                p.Start = br.ReadInt64(); p.Length = br.ReadInt64();
                if (p.Start <= 0 || p.Start + p.Length > fs.Length) throw new InvalidDataException("payload out of range");
                fs.Position = p.Start;
                int ml = br.ReadInt32();
                if (ml <= 0 || ml > 64 << 20) throw new InvalidDataException("bad manifest");
                var json = Encoding.UTF8.GetString(br.ReadBytes(ml));
                p.DataStart = p.Start + 4 + ml;
                p.M = (Dictionary<string, object>)new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.DeserializeObject(json);
            }
            var a = (Dictionary<string, object>)p.M["app"];
            p.App = new AppInfo
            {
                Id = J.S(a, "id"), Name = J.S(a, "name"), Exe = J.S(a, "exe"), Folder = J.S(a, "folder"), Shortcut = J.S(a, "shortcut"),
                Version = J.S(a, "version"), Publisher = J.S(a, "publisher"), Url = J.S(a, "url"), Description = J.S(a, "description"),
                Accent = J.S(a, "accent") ?? "#ff5c00", RegKey = J.S(a, "regKey"), UpdaterCache = J.S(a, "updaterCache"),
                DataDirs = J.Arr(a, "dataDirs").Select(x => x as string).Where(x => !string.IsNullOrEmpty(x)).ToArray()
            };
            if (string.IsNullOrEmpty(p.App.Folder)) p.App.Folder = p.App.Name;
            if (string.IsNullOrEmpty(p.App.Shortcut)) p.App.Shortcut = p.App.Name;
            foreach (var o in J.Arr(p.M, "files")) { var e = J.E(o); p.Files.Add(e); p.TotalSize += e.S; }
            foreach (var o in J.Arr(p.M, "assets")) p.Assets.Add(J.E(o));
            return p;
        }

        public byte[] Asset(string name)
        {
            var e = Assets.FirstOrDefault(x => string.Equals(x.P, name, StringComparison.OrdinalIgnoreCase));
            if (e == null) return null;
            try
            {
                using (var fs = new FileStream(FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    fs.Position = DataStart + e.O;
                    using (var inf = new DeflateStream(new Sub(fs, e.C), CompressionMode.Decompress))
                    using (var ms = new MemoryStream()) { inf.CopyTo(ms); return ms.ToArray(); }
                }
            }
            catch { return null; }
        }

        // every file into a folder, checked against its size and CRC-32
        public void Extract(string dest, Action<long> onBytes)
        {
            var buf = new byte[1 << 16];
            using (var fs = new FileStream(FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 1 << 16))
            {
                foreach (var f in Files)
                {
                    string target = Engine.Inside(dest, f.P);
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    fs.Position = DataStart + f.O;
                    long n = 0; uint crc = 0xFFFFFFFF;
                    using (var inf = new DeflateStream(new Sub(fs, f.C), CompressionMode.Decompress, true))
                    using (var o = new FileStream(target, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 16))
                    {
                        int r;
                        while ((r = inf.Read(buf, 0, buf.Length)) > 0) { o.Write(buf, 0, r); crc = Crc.Update(crc, buf, r); n += r; if (onBytes != null) onBytes(r); }
                    }
                    if (n != f.S || (crc ^ 0xFFFFFFFF) != f.Crc) throw new InvalidDataException(f.P + " didn't unpack intact");
                }
            }
        }

        // the uninstaller: this program again, with only the app's details and artwork (no files)
        public void WriteUninstaller(string outPath)
        {
            string tmp = outPath + ".new";
            using (var src = new FileStream(FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var dst = new FileStream(tmp, FileMode.Create))
            {
                Engine.CopyN(src, dst, Start);
                var assets = new List<object>(); var blobs = new List<byte[]>(); long off = 0;
                foreach (var e in Assets)
                {
                    var b = new byte[e.C]; src.Position = DataStart + e.O; Engine.ReadFull(src, b);
                    blobs.Add(b);
                    assets.Add(new Dictionary<string, object> { { "n", e.P }, { "o", off }, { "c", e.C }, { "s", e.S }, { "crc", e.Crc } });
                    off += e.C;
                }
                var m = new Dictionary<string, object>(M); m["files"] = new object[0]; m["assets"] = assets.ToArray();
                var json = Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(m));
                var bw = new BinaryWriter(dst);
                long start = dst.Position;
                bw.Write(json.Length); bw.Write(json);
                foreach (var b in blobs) bw.Write(b);
                long len = dst.Position - start;
                bw.Write(Encoding.ASCII.GetBytes("CRITPAK1")); bw.Write(start); bw.Write(len);
            }
            Engine.Replace(tmp, outPath);
        }
    }

    // a window onto part of a stream, so the decompressor stops at the end of one file
    class Sub : Stream
    {
        readonly Stream s; long left;
        public Sub(Stream s, long len) { this.s = s; left = len; }
        public override int Read(byte[] b, int o, int c) { if (left <= 0) return 0; int r = s.Read(b, o, (int)Math.Min(c, left)); left -= r; return r; }
        public override bool CanRead { get { return true; } }
        public override bool CanSeek { get { return false; } }
        public override bool CanWrite { get { return false; } }
        public override long Length { get { throw new NotSupportedException(); } }
        public override long Position { get { throw new NotSupportedException(); } set { throw new NotSupportedException(); } }
        public override void Flush() { }
        public override long Seek(long o, SeekOrigin so) { throw new NotSupportedException(); }
        public override void SetLength(long v) { throw new NotSupportedException(); }
        public override void Write(byte[] b, int o, int c) { throw new NotSupportedException(); }
    }

    static class Crc
    {
        static readonly uint[] T = Make();
        static uint[] Make() { var t = new uint[256]; for (uint i = 0; i < 256; i++) { uint c = i; for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1; t[i] = c; } return t; }
        public static uint Update(uint crc, byte[] b, int n) { for (int i = 0; i < n; i++) crc = T[(crc ^ b[i]) & 0xFF] ^ (crc >> 8); return crc; }
    }

    static class J
    {
        public static string S(Dictionary<string, object> d, string k) { object v; return d != null && d.TryGetValue(k, out v) && v != null ? Convert.ToString(v) : null; }
        public static long L(Dictionary<string, object> d, string k) { object v; return d != null && d.TryGetValue(k, out v) && v != null ? Convert.ToInt64(v) : 0; }
        public static object[] Arr(Dictionary<string, object> d, string k)
        {
            object v; if (d == null || !d.TryGetValue(k, out v) || v == null) return new object[0];
            var a = v as object[]; if (a != null) return a;
            var l = v as System.Collections.ArrayList; return l != null ? l.ToArray() : new object[0];
        }
        public static Entry E(object o)
        {
            var d = (Dictionary<string, object>)o;
            return new Entry { P = S(d, "p") ?? S(d, "n"), O = L(d, "o"), C = L(d, "c"), S = L(d, "s"), Crc = (uint)L(d, "crc") };
        }
        public static Dictionary<string, object> Read(string file)
        {
            try { return new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.DeserializeObject(File.ReadAllText(file, Encoding.UTF8)) as Dictionary<string, object>; }
            catch { return null; }
        }
        public static void Write(string file, object o) { File.WriteAllText(file, new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.Serialize(o), new UTF8Encoding(false)); }
    }

    // ---------- installing, updating and removing ----------
    class Existing { public string Dir, Scope, Version; public bool Legacy, Desktop; }

    static class Engine
    {
        static AppInfo A { get { return Program.Pack.App; } }
        const string UninstallRoot = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\";
        public static string Meta(string dir) { return Path.Combine(dir, ".critter"); }
        public static string UninstallerName { get { return "Uninstall " + A.Shortcut + ".exe"; } }

        public static string DefaultDir()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", A.Folder);
        }

        // an earlier install: ours (.critter\install.json) or the NSIS installer's from before, found through its uninstall entry
        public static Existing FindExisting()
        {
            foreach (var hive in new[] { Registry.CurrentUser, Registry.LocalMachine })
            {
                string dir = null, ver = null;
                using (var k = hive.OpenSubKey(UninstallRoot + A.RegKey))
                {
                    if (k != null)
                    {
                        dir = k.GetValue("InstallLocation") as string;
                        if (string.IsNullOrEmpty(dir)) dir = DirOf(k.GetValue("UninstallString") as string);
                        ver = k.GetValue("DisplayVersion") as string;
                    }
                }
                if (string.IsNullOrEmpty(dir))
                    using (var k = hive.OpenSubKey(@"Software\" + A.RegKey)) { if (k != null) dir = k.GetValue("InstallLocation") as string; }
                if (string.IsNullOrEmpty(dir)) continue;
                dir = dir.TrimEnd('\\');
                if (!File.Exists(Path.Combine(dir, A.Exe))) continue;
                var info = J.Read(Path.Combine(Meta(dir), "install.json"));
                return new Existing
                {
                    Dir = dir, Scope = hive == Registry.LocalMachine ? "machine" : "user",
                    Version = info != null ? J.S(info, "version") : ver, Legacy = info == null,
                    Desktop = File.Exists(DesktopLink(hive == Registry.LocalMachine))
                };
            }
            string d = DefaultDir();
            if (File.Exists(Path.Combine(d, A.Exe)))
            {
                var info = J.Read(Path.Combine(Meta(d), "install.json"));
                return new Existing { Dir = d, Scope = "user", Version = info != null ? J.S(info, "version") : null, Legacy = info == null, Desktop = File.Exists(DesktopLink(false)) };
            }
            return null;
        }
        static string DirOf(string cmd)
        {
            if (string.IsNullOrEmpty(cmd)) return null;
            cmd = cmd.Trim();
            string exe = cmd.StartsWith("\"") ? cmd.Substring(1, Math.Max(0, cmd.IndexOf('"', 1) - 1)) : cmd.Split(' ')[0];
            try { return Path.GetDirectoryName(exe); } catch { return null; }
        }

        public static string StartMenuLink(bool machine)
        {
            return Path.Combine(Environment.GetFolderPath(machine ? Environment.SpecialFolder.CommonPrograms : Environment.SpecialFolder.Programs), A.Shortcut + ".lnk");
        }
        public static string DesktopLink(bool machine)
        {
            return Path.Combine(Environment.GetFolderPath(machine ? Environment.SpecialFolder.CommonDesktopDirectory : Environment.SpecialFolder.DesktopDirectory), A.Shortcut + ".lnk");
        }

        // The whole install: unpack beside the app, close it if it's open, swap the files in (everything moved aside comes
        // back if anything fails), then the uninstaller, the Apps entry and the shortcuts.
        // desktop: true = make the desktop shortcut, false = remove it, null = keep whatever is there.
        public static void Install(string dir, string scope, Existing found, bool? desktop, int closeWaitMs, Action<double, string> progress)
        {
            Action<double, string> P = (v, s) => { if (progress != null) progress(v, s); };
            Directory.CreateDirectory(dir);
            string meta = Meta(dir), stage = Path.Combine(meta, "stage");
            Directory.CreateDirectory(meta);
            try { new DirectoryInfo(meta).Attributes |= FileAttributes.Hidden; } catch { }
            Wipe(stage);
            long done = 0, total = Math.Max(1, Program.Pack.TotalSize), lastTick = 0;
            P(0, "Unpacking");
            Program.Pack.Extract(stage, n =>
            {
                done += n;
                if (done - lastTick > (1 << 20) || done == total) { lastTick = done; P(0.86 * done / total, "Unpacking"); }
            });
            if (Running(dir).Count > 0) { P(0.87, "Closing " + A.Name); CloseRunning(dir, closeWaitMs); }
            P(0.9, "Putting the files in place");
            Swap(dir, stage, Program.Pack.Files.Select(f => f.P).ToList(), OldFiles(dir, found));
            P(0.96, "Finishing");
            Finish(dir, scope, found, desktop);
            Tidy(dir);
            WriteResult(dir, true, found, null);
            P(1, "Done");
        }

        // An update that updater.js has already unpacked into .critter\staged-<version> while the app was running:
        // wait for the app to close, swap, finish, and start it again. Runs without a window.
        public static bool ApplyStaged()
        {
            var o = Program.O;
            string dir = o.Dir, staged = o.Staged;
            if (string.IsNullOrEmpty(dir) || string.IsNullOrEmpty(staged) || !Directory.Exists(staged)) return false;
            var info = J.Read(Path.Combine(Meta(dir), "install.json"));
            var found = new Existing { Dir = dir, Scope = info != null ? (J.S(info, "scope") ?? "user") : "user", Version = o.From ?? (info != null ? J.S(info, "version") : null), Legacy = info == null };
            bool ok = false; string err = null;
            try
            {
                if (o.Pid > 0) { try { using (var p = Process.GetProcessById(o.Pid)) p.WaitForExit(25000); } catch { } }
                CloseRunning(dir, 8000);
                foreach (var f in Program.Pack.Files)
                {
                    var fi = new FileInfo(Inside(staged, f.P));
                    if (!fi.Exists || fi.Length != f.S) throw new InvalidDataException(f.P + " is missing from the unpacked update");
                }
                Swap(dir, staged, Program.Pack.Files.Select(f => f.P).ToList(), OldFiles(dir, found));
                Finish(dir, found.Scope, found, null);
                ok = true;
            }
            catch (Exception e) { err = e.Message; }
            try { Wipe(staged); } catch { }
            Tidy(dir);
            WriteResult(dir, ok, found, err);
            Launch(dir, true);
            if (ok) RemoveDownloadLater();   // a failed update keeps its download, so Try again is quick
            return ok;
        }

        // An update's setup file was downloaded by the app's updater into <updater cache>\pending and runs from there:
        // once it's done, that folder goes (the copy kept as <updater cache>\installer.exe stays, for the next update's
        // small download). A setup file the user downloaded and started themselves is never touched.
        public static void RemoveDownloadLater()
        {
            try
            {
                string d = Path.GetDirectoryName(Program.Self), cache = Path.GetDirectoryName(d);
                if (!string.Equals(Path.GetFileName(d), "pending", StringComparison.OrdinalIgnoreCase)) return;
                if (string.IsNullOrEmpty(A.UpdaterCache) || !string.Equals(Path.GetFileName(cache), A.UpdaterCache, StringComparison.OrdinalIgnoreCase)) return;
                Process.Start(new ProcessStartInfo("cmd.exe", "/c ping -n 4 127.0.0.1 >nul & rd /s /q \"" + d + "\"") { CreateNoWindow = true, UseShellExecute = false, WindowStyle = ProcessWindowStyle.Hidden, WorkingDirectory = Path.GetTempPath() });
            }
            catch { }
        }

        // what an interrupted update could leave in .critter (unpacked files, the old files set aside)
        public static void Tidy(string dir)
        {
            string meta = Meta(dir);
            if (!Directory.Exists(meta)) return;
            foreach (var d in Directory.GetDirectories(meta))
            {
                string n = Path.GetFileName(d);
                if (n == "stage" || n == "old" || n.StartsWith("staged-", StringComparison.OrdinalIgnoreCase)) { try { Wipe(d); } catch { } }
            }
        }

        static List<string> OldFiles(string dir, Existing found)
        {
            var info = J.Read(Path.Combine(Meta(dir), "install.json"));
            if (info != null) return J.Arr(info, "files").Select(x => x as string).Where(x => x != null).ToList();
            // an install from the NSIS installer: its folder is the app's alone (its own uninstaller removed it whole),
            // so everything in it goes, the old uninstaller included
            var list = new List<string>();
            if (found != null && found.Legacy && Directory.Exists(dir) && Directory.GetFiles(dir, "Uninstall *.exe").Length > 0)
                foreach (var f in Directory.GetFiles(dir, "*", SearchOption.AllDirectories))
                {
                    string rel = f.Substring(dir.Length + 1);
                    if (!rel.StartsWith(".critter\\", StringComparison.OrdinalIgnoreCase)) list.Add(rel.Replace('\\', '/'));
                }
            return list;
        }

        static void Swap(string dir, string stage, List<string> files, List<string> old)
        {
            string bak = Path.Combine(Meta(dir), "old");
            Wipe(bak);
            var moved = new List<KeyValuePair<string, string>>();   // where a file was -> where it went
            var placed = new List<string>();
            var keep = new HashSet<string>(files.Select(x => x.Replace('\\', '/')), StringComparer.OrdinalIgnoreCase);
            try
            {
                foreach (var rel in old)
                {
                    if (keep.Contains(rel)) continue;
                    string from = Inside(dir, rel);
                    if (!File.Exists(from)) continue;
                    string to = Inside(bak, rel); Directory.CreateDirectory(Path.GetDirectoryName(to));
                    Move(from, to); moved.Add(new KeyValuePair<string, string>(from, to));
                }
                foreach (var rel in files)
                {
                    string target = Inside(dir, rel);
                    if (File.Exists(target))
                    {
                        string to = Inside(bak, rel); Directory.CreateDirectory(Path.GetDirectoryName(to));
                        Move(target, to); moved.Add(new KeyValuePair<string, string>(target, to));
                    }
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    Move(Inside(stage, rel), target); placed.Add(target);
                }
            }
            catch
            {
                foreach (var p in placed) { try { File.Delete(p); } catch { } }
                for (int i = moved.Count - 1; i >= 0; i--) { try { Move(moved[i].Value, moved[i].Key); } catch { } }
                throw;
            }
            try { Wipe(bak); } catch { }
            try { Wipe(stage); } catch { }
            foreach (var rel in old) { try { PruneEmpty(dir, Path.GetDirectoryName(Inside(dir, rel))); } catch { } }
        }

        static void Finish(string dir, string scope, Existing found, bool? desktop)
        {
            var pk = Program.Pack;
            bool machine = scope == "machine";
            string meta = Meta(dir);
            pk.WriteUninstaller(Path.Combine(dir, UninstallerName));
            J.Write(Path.Combine(meta, "install.json"), new Dictionary<string, object> {
                { "id", A.Id }, { "name", A.Name }, { "version", A.Version }, { "exe", A.Exe }, { "scope", scope },
                { "installed", DateTime.UtcNow.ToString("o") }, { "files", pk.Files.Select(f => f.P).ToArray() } });
            // the entry in Settings › Apps (the same key the NSIS installer used, so it updates in place)
            var hive = machine ? Registry.LocalMachine : Registry.CurrentUser;
            try { hive.DeleteSubKeyTree(@"Software\" + A.RegKey, false); } catch { }
            using (var k = hive.CreateSubKey(UninstallRoot + A.RegKey))
            {
                foreach (var n in k.GetValueNames()) k.DeleteValue(n, false);
                string un = "\"" + Path.Combine(dir, UninstallerName) + "\" --uninstall";
                k.SetValue("DisplayName", A.Name);
                k.SetValue("DisplayVersion", A.Version ?? "");
                k.SetValue("Publisher", A.Publisher ?? "");
                k.SetValue("DisplayIcon", "\"" + Path.Combine(dir, A.Exe) + "\",0");
                k.SetValue("InstallLocation", dir);
                k.SetValue("UninstallString", un);
                k.SetValue("QuietUninstallString", un + " /S");
                k.SetValue("Comments", A.Description ?? "");
                if (!string.IsNullOrEmpty(A.Url)) { k.SetValue("URLInfoAbout", A.Url); k.SetValue("HelpLink", A.Url); }
                k.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
                k.SetValue("EstimatedSize", (int)Math.Min(int.MaxValue, pk.TotalSize / 1024), RegistryValueKind.DWord);
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
            // shortcuts carry the app's id, so a pinned taskbar icon and the running app are one button
            string exe = Path.Combine(dir, A.Exe);
            try { Shortcut.Make(StartMenuLink(machine), exe, dir, A.Description, A.Id); } catch { }
            string dl = DesktopLink(machine);
            bool wantDesktop = desktop.HasValue ? desktop.Value : File.Exists(dl);
            try { if (wantDesktop) Shortcut.Make(dl, exe, dir, A.Description, A.Id); else if (File.Exists(dl)) File.Delete(dl); } catch { }
            Shortcut.Refresh();
            // the app's updater keeps the installer it came from, so the next update downloads only what changed
            if (pk.Files.Count > 0 && !string.IsNullOrEmpty(A.UpdaterCache))
                try
                {
                    string cache = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), A.UpdaterCache);
                    Directory.CreateDirectory(cache);
                    string dst = Path.Combine(cache, "installer.exe");
                    if (!string.Equals(Path.GetFullPath(dst), Path.GetFullPath(pk.FilePath), StringComparison.OrdinalIgnoreCase)) File.Copy(pk.FilePath, dst, true);
                }
                catch { }
        }

        // what the app reads when it starts again: "Update successful", or why not
        public static void WriteResult(string dir, bool ok, Existing found, string error)
        {
            string from = found != null ? found.Version : null;
            if (Program.O.From != null) from = Program.O.From;
            if (ok && (from == null || from == A.Version) && !Program.O.Updated && !Program.O.Apply) return;   // a first install or a reinstall
            try
            {
                Directory.CreateDirectory(Meta(dir));
                J.Write(Path.Combine(Meta(dir), "result.json"), new Dictionary<string, object> {
                    { "ok", ok }, { "version", A.Version }, { "from", from }, { "error", error }, { "at", DateTime.UtcNow.ToString("o") } });
            }
            catch { }
        }

        public static void Uninstall(string dir, bool removeData, Action<double, string> progress)
        {
            Action<double, string> P = (v, s) => { if (progress != null) progress(v, s); };
            P(0.02, "Closing " + A.Name);
            CloseRunning(dir, 8000);
            var info = J.Read(Path.Combine(Meta(dir), "install.json"));
            bool machine = info != null && J.S(info, "scope") == "machine";
            string exe = Path.Combine(dir, A.Exe);
            foreach (var m in new[] { machine, !machine })
                foreach (var l in new[] { StartMenuLink(m), DesktopLink(m) })
                    try { if (File.Exists(l) && Shortcut.Points(l, exe)) File.Delete(l); } catch { }
            Shortcut.Refresh();
            var files = info != null ? J.Arr(info, "files").Select(x => x as string).Where(x => x != null).ToList() : new List<string>();
            for (int i = 0; i < files.Count; i++)
            {
                try { string f = Inside(dir, files[i]); if (File.Exists(f)) { File.SetAttributes(f, FileAttributes.Normal); File.Delete(f); } } catch { }
                if (i % 10 == 0) P(0.05 + 0.8 * i / Math.Max(1, files.Count), "Removing files");
            }
            foreach (var f in files) { try { PruneEmpty(dir, Path.GetDirectoryName(Inside(dir, f))); } catch { } }
            try { Wipe(Meta(dir)); } catch { }
            try { File.Delete(Path.Combine(dir, UninstallerName)); } catch { }
            try { if (Directory.Exists(dir) && !Directory.EnumerateFileSystemEntries(dir).Any()) Directory.Delete(dir); } catch { }
            P(0.9, "Removing the Apps entry");
            foreach (var hive in new[] { Registry.CurrentUser, Registry.LocalMachine })
            {
                try
                {
                    string loc = null;
                    using (var k = hive.OpenSubKey(UninstallRoot + A.RegKey)) { if (k != null) loc = k.GetValue("InstallLocation") as string; }
                    if (loc != null && string.Equals(loc.TrimEnd('\\'), dir.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) hive.DeleteSubKeyTree(UninstallRoot + A.RegKey, false);
                }
                catch { }
            }
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (!string.IsNullOrEmpty(A.UpdaterCache)) { try { Wipe(Path.Combine(local, A.UpdaterCache)); } catch { } }
            if (removeData)
            {
                P(0.95, "Removing settings and data");
                string roaming = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                foreach (var d in A.DataDirs ?? new string[0])
                    if (d.IndexOfAny(new[] { '\\', '/', ':' }) < 0 && d.Trim('.').Length > 0) { try { Wipe(Path.Combine(roaming, d)); } catch { } }
            }
            P(1, "Done");
        }

        // ---- the app's processes ----
        [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder name, ref int size);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
        static string ImagePath(int pid)
        {
            IntPtr h = OpenProcess(0x1000, false, pid);
            if (h == IntPtr.Zero) return null;
            try { var sb = new StringBuilder(1024); int n = sb.Capacity; return QueryFullProcessImageName(h, 0, sb, ref n) ? sb.ToString() : null; }
            finally { CloseHandle(h); }
        }
        public static List<Process> Running(string dir)
        {
            var list = new List<Process>();
            string pre = dir.TrimEnd('\\') + "\\";
            // Windows' Restart Manager also knows the helper processes the app's own check can't read the path of
            // (a background process can outlive the app's window, and would keep the old files locked after an update)
            var lockers = Lockers(Path.Combine(dir, A.Exe));
            int me = Process.GetCurrentProcess().Id;
            foreach (var p in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(A.Exe)))
            {
                string img = ImagePath(p.Id);
                bool ours = (img != null && img.StartsWith(pre, StringComparison.OrdinalIgnoreCase)) || lockers.Contains(p.Id);
                if (ours && p.Id != me) list.Add(p); else p.Dispose();
            }
            return list;
        }

        [StructLayout(LayoutKind.Sequential)] struct RmUnique { public int Pid; public System.Runtime.InteropServices.ComTypes.FILETIME Start; }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct RmInfo
        {
            public RmUnique Process;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string App;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string Service;
            public int Type, Status, Session; [MarshalAs(UnmanagedType.Bool)] public bool Restartable;
        }
        [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmStartSession(out uint h, int flags, string key);
        [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint h);
        [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmRegisterResources(uint h, uint nFiles, string[] files, uint nApps, IntPtr apps, uint nSvc, string[] svc);
        [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint h, out uint needed, ref uint n, [In, Out] RmInfo[] info, ref uint reasons);
        // the processes that have this file open
        static HashSet<int> Lockers(string file)
        {
            var set = new HashSet<int>();
            if (!File.Exists(file)) return set;
            uint h;
            try
            {
                if (RmStartSession(out h, 0, Guid.NewGuid().ToString("N")) != 0) return set;
                try
                {
                    if (RmRegisterResources(h, 1, new[] { file }, 0, IntPtr.Zero, 0, null) != 0) return set;
                    uint need, n = 64, reasons = 0; var info = new RmInfo[64];
                    if (RmGetList(h, out need, ref n, info, ref reasons) == 0)
                        for (int i = 0; i < n; i++) set.Add(info[i].Process.Pid);
                }
                finally { RmEndSession(h); }
            }
            catch { }
            return set;
        }
        // ask nicely first (the apps save on close), then end whatever is left
        public static void CloseRunning(string dir, int graceMs)
        {
            var ps = Running(dir);
            if (ps.Count == 0) return;
            foreach (var p in ps) { try { p.CloseMainWindow(); } catch { } }
            var sw = Stopwatch.StartNew();
            while (sw.ElapsedMilliseconds < graceMs && Running(dir).Count > 0) Thread.Sleep(200);
            foreach (var p in Running(dir)) { try { p.Kill(); p.WaitForExit(3000); } catch { } }
            Thread.Sleep(300);
        }

        public static void Launch(string dir, bool updated)
        {
            string exe = Path.Combine(dir, A.Exe);
            if (!File.Exists(exe)) return;
            try
            {
                // an administrator's process would start the app as administrator too: Explorer starts it as the user instead
                if (IsAdmin()) Process.Start(new ProcessStartInfo("explorer.exe", "\"" + exe + "\"") { UseShellExecute = false });
                else Process.Start(new ProcessStartInfo(exe, updated ? "--updated" : "") { WorkingDirectory = dir, UseShellExecute = false });
            }
            catch { }
        }

        // ---- files ----
        public static string Inside(string root, string rel)
        {
            string full = Path.GetFullPath(Path.Combine(root, rel.Replace('/', '\\')));
            string r = Path.GetFullPath(root).TrimEnd('\\') + "\\";
            if (!full.StartsWith(r, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("a file outside the app's folder: " + rel);
            return full;
        }
        static void Move(string from, string to)
        {
            for (int i = 0; ; i++)
            {
                try { File.Move(from, to); return; }
                catch (IOException) { if (i >= 40) throw; Thread.Sleep(250); }          // a virus scanner still looking at it
                catch (UnauthorizedAccessException) { if (i >= 40) throw; try { File.SetAttributes(from, FileAttributes.Normal); } catch { } Thread.Sleep(250); }
            }
        }
        public static void Replace(string tmp, string dst)
        {
            for (int i = 0; ; i++)
            {
                try { if (File.Exists(dst)) File.Delete(dst); File.Move(tmp, dst); return; }
                catch { if (i >= 20) throw; Thread.Sleep(250); }
            }
        }
        public static void Wipe(string d)
        {
            if (!Directory.Exists(d)) return;
            foreach (var f in Directory.GetFiles(d, "*", SearchOption.AllDirectories)) { try { File.SetAttributes(f, FileAttributes.Normal); } catch { } }
            for (int i = 0; ; i++) { try { Directory.Delete(d, true); return; } catch { if (i >= 8) throw; Thread.Sleep(250); } }
        }
        static void PruneEmpty(string root, string d)
        {
            string r = root.TrimEnd('\\');
            while (d != null && d.Length > r.Length && d.StartsWith(r + "\\", StringComparison.OrdinalIgnoreCase) && Directory.Exists(d) && !Directory.EnumerateFileSystemEntries(d).Any())
            { Directory.Delete(d); d = Path.GetDirectoryName(d); }
        }
        public static void CopyN(Stream s, Stream d, long n) { var b = new byte[1 << 16]; s.Position = 0; while (n > 0) { int r = s.Read(b, 0, (int)Math.Min(b.Length, n)); if (r <= 0) throw new EndOfStreamException(); d.Write(b, 0, r); n -= r; } }
        public static void ReadFull(Stream s, byte[] b) { int o = 0; while (o < b.Length) { int r = s.Read(b, o, b.Length - o); if (r <= 0) throw new EndOfStreamException(); o += r; } }

        public static bool CanWrite(string dir)
        {
            string d = dir;
            while (d != null && !Directory.Exists(d)) d = Path.GetDirectoryName(d);
            if (d == null) return false;
            try { string t = Path.Combine(d, ".critter-write-test-" + Guid.NewGuid().ToString("N")); File.WriteAllText(t, ""); File.Delete(t); return true; }
            catch { return false; }
        }
        public static bool IsAdmin() { try { return new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator); } catch { return false; } }
        public static bool Elevate(string dir)
        {
            var args = new List<string>(Program.O.Raw.Where(a => !a.StartsWith("/D=") && !a.StartsWith("--dir=")));
            args.Add("--elevated"); args.Add("--dir=" + dir);
            try { using (var p = Process.Start(new ProcessStartInfo(Program.Self, Opts.Join(args)) { UseShellExecute = true, Verb = "runas" })) { } return true; }
            catch { if (!Program.O.Silent) MessageBox.Show(A.Name + " is installed for everyone on this computer, so updating it needs an administrator's permission.", A.Name); return false; }
        }
        public static void DeleteSelfLater()
        {
            try { Process.Start(new ProcessStartInfo("cmd.exe", "/c ping -n 3 127.0.0.1 >nul & del /f /q \"" + Program.Self + "\"") { CreateNoWindow = true, UseShellExecute = false, WindowStyle = ProcessWindowStyle.Hidden }); } catch { }
        }
    }

    // ---------- shortcuts (with the app's id, through the shell's own interfaces) ----------
    static class Shortcut
    {
        [ComImport, Guid("00021401-0000-0000-C000-000000000046")] class CShellLink { }
        [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
        interface IShellLinkW
        {
            void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder f, int cch, IntPtr fd, int flags);
            void GetIDList(out IntPtr p); void SetIDList(IntPtr p);
            void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch);
            void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string s);
            void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch);
            void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string s);
            void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch);
            void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string s);
            void GetHotkey(out short k); void SetHotkey(short k);
            void GetShowCmd(out int c); void SetShowCmd(int c);
            void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch, out int i);
            void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string s, int i);
            void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string s, int r);
            void Resolve(IntPtr hwnd, int flags);
            void SetPath([MarshalAs(UnmanagedType.LPWStr)] string s);
        }
        [StructLayout(LayoutKind.Sequential, Pack = 4)] struct PropKey { public Guid fmt; public uint pid; }
        [StructLayout(LayoutKind.Explicit)] struct PropVar { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; [FieldOffset(16)] public IntPtr p2; }
        [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
        interface IPropertyStore
        {
            void GetCount(out uint c); void GetAt(uint i, out PropKey k); void GetValue(ref PropKey k, out PropVar v);
            void SetValue(ref PropKey k, ref PropVar v); void Commit();
        }
        [DllImport("shell32.dll")] static extern void SHChangeNotify(int e, int f, IntPtr a, IntPtr b);

        public static void Make(string lnk, string target, string dir, string desc, string aumid)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(lnk));
            var link = (IShellLinkW)new CShellLink();
            link.SetPath(target); link.SetWorkingDirectory(dir); link.SetIconLocation(target, 0);
            if (!string.IsNullOrEmpty(desc)) link.SetDescription(desc.Length > 250 ? desc.Substring(0, 250) : desc);
            if (!string.IsNullOrEmpty(aumid))
            {
                var store = (IPropertyStore)link;
                var key = new PropKey { fmt = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
                var v = new PropVar { vt = 31, p = Marshal.StringToCoTaskMemUni(aumid) };
                try { store.SetValue(ref key, ref v); store.Commit(); } finally { Marshal.FreeCoTaskMem(v.p); }
            }
            ((System.Runtime.InteropServices.ComTypes.IPersistFile)link).Save(lnk, true);
            Marshal.ReleaseComObject(link);
        }
        public static bool Points(string lnk, string target)
        {
            try
            {
                var link = (IShellLinkW)new CShellLink();
                ((System.Runtime.InteropServices.ComTypes.IPersistFile)link).Load(lnk, 0);
                var sb = new StringBuilder(1024); link.GetPath(sb, sb.Capacity, IntPtr.Zero, 0x4);
                Marshal.ReleaseComObject(link);
                return string.Equals(sb.ToString(), target, StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }
        }
        public static void Refresh() { try { SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero); } catch { } }
    }

    // ---------- the look: Critter's colours, flat 8px buttons, no outlines, the accent's glow in the corner ----------
    class Theme
    {
        public bool Light;
        public Color Bg, Ink, Ink2, Ink3, Hover, Hover2, Press, Track, Accent, OnAccent, AccentText, AccentUi, OnAccentUi, Danger, Warn, Ok, Error, Edge;
        public bool HighContrast;
        public static Theme Make(string accentHex, bool light)
        {
            var a = Parse(accentHex);
            var t = new Theme { Light = light, Accent = a };
            if (light)
            {
                t.Bg = Color.FromArgb(0xf4, 0xf3, 0xf1); t.Ink = Color.FromArgb(0x1d, 0x1c, 0x1a); t.Ink2 = Color.FromArgb(0x4a, 0x49, 0x45); t.Ink3 = Color.FromArgb(0x5f, 0x5e, 0x5a);
                t.Hover = Color.FromArgb(15, 0, 0, 0); t.Hover2 = Color.FromArgb(26, 0, 0, 0); t.Press = Color.FromArgb(36, 0, 0, 0); t.Track = Color.FromArgb(20, 0, 0, 0);
                t.AccentText = Mix(a, Color.Black, 0.5); t.Warn = Color.FromArgb(0x65, 0x3a, 0x03); t.Ok = Color.FromArgb(0x09, 0x4f, 0x25);
            }
            else
            {
                t.Bg = Color.FromArgb(0x16, 0x17, 0x1b); t.Ink = Color.FromArgb(0xec, 0xeb, 0xe8); t.Ink2 = Color.FromArgb(0xb9, 0xb8, 0xb4); t.Ink3 = Color.FromArgb(0x8d, 0x8c, 0x88);
                t.Hover = Color.FromArgb(18, 255, 255, 255); t.Hover2 = Color.FromArgb(28, 255, 255, 255); t.Press = Color.FromArgb(38, 255, 255, 255); t.Track = Color.FromArgb(23, 255, 255, 255);
                t.AccentText = Mix(a, Color.White, 0.45); t.Warn = Color.FromArgb(0xfb, 0xbf, 0x24); t.Ok = Color.FromArgb(0x4a, 0xde, 0x80);
            }
            t.OnAccent = Lum(a) > 0.2 ? Color.FromArgb(0x11, 0x11, 0x11) : Color.White;
            t.Danger = Color.FromArgb(0xc4, 0x2b, 0x38);
            t.Error = light ? Color.FromArgb(0xa3, 0x23, 0x1a) : Color.FromArgb(0xff, 0x8b, 0x7f);
            t.Edge = t.Ink3;   // outlines that carry meaning (an empty checkbox) stay at 3:1 or more
            // the progress bar and a ticked box are shapes, not text, but still need 3:1 against the window (WCAG 1.4.11)
            t.AccentUi = a;
            for (int i = 1; i <= 10 && Contrast(t.AccentUi, t.Bg) < 3.0; i++) t.AccentUi = Mix(a, light ? Color.Black : Color.White, i * 0.08);
            t.OnAccentUi = Lum(t.AccentUi) > 0.2 ? Color.FromArgb(0x11, 0x11, 0x11) : Color.White;
            return t;
        }
        // Windows high contrast: the user's own colours, nothing decorative
        public static Theme System()
        {
            var t = new Theme { HighContrast = true, Light = Lum(SystemColors.Window) > 0.5 };
            t.Bg = SystemColors.Window; t.Ink = t.Ink2 = t.Ink3 = t.Edge = SystemColors.WindowText;
            t.Hover = t.Hover2 = t.Press = t.Track = SystemColors.Window;
            t.Accent = t.AccentUi = t.Danger = SystemColors.Highlight; t.OnAccent = t.OnAccentUi = SystemColors.HighlightText;
            t.AccentText = SystemColors.HotTrack; t.Warn = t.Ok = t.Error = SystemColors.WindowText;
            return t;
        }
        public static Color Parse(string hex)
        {
            try { hex = (hex ?? "").Trim().TrimStart('#'); if (hex.Length == 6) return Color.FromArgb(Convert.ToInt32(hex.Substring(0, 2), 16), Convert.ToInt32(hex.Substring(2, 2), 16), Convert.ToInt32(hex.Substring(4, 2), 16)); }
            catch { }
            return Color.FromArgb(0xff, 0x5c, 0x00);
        }
        public static Color Mix(Color a, Color b, double t) { return Color.FromArgb((int)(a.R + (b.R - a.R) * t), (int)(a.G + (b.G - a.G) * t), (int)(a.B + (b.B - a.B) * t)); }
        static double Lin(int c) { double v = c / 255.0; return v <= 0.04045 ? v / 12.92 : Math.Pow((v + 0.055) / 1.055, 2.4); }
        public static double Lum(Color c) { return 0.2126 * Lin(c.R) + 0.7152 * Lin(c.G) + 0.0722 * Lin(c.B); }
        public static double Contrast(Color a, Color b) { double x = Lum(a), y = Lum(b); return (Math.Max(x, y) + 0.05) / (Math.Min(x, y) + 0.05); }
        [DllImport("user32.dll")] static extern bool SystemParametersInfo(int action, int param, ref bool v, int ini);
        // Settings › Accessibility › Visual effects › Animation effects
        public static bool Animate() { bool on = true; try { SystemParametersInfo(0x1042, 0, ref on, 0); } catch { } return on; }
        // Settings › Accessibility › Text size (100 to 225 %)
        public static float TextScale() { try { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Accessibility")) { var v = k == null ? null : k.GetValue("TextScaleFactor"); if (v is int) return Math.Max(1f, Math.Min(2.25f, (int)v / 100f)); } } catch { } return 1f; }
        public static bool SystemLight()
        {
            try { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")) { var v = k == null ? null : k.GetValue("AppsUseLightTheme"); return v is int && (int)v == 1; } }
            catch { return false; }
        }
    }

    static class G
    {
        public static GraphicsPath Round(RectangleF r, float rad)
        {
            var p = new GraphicsPath(); float d = Math.Min(rad * 2, Math.Min(r.Width, r.Height));
            if (d <= 0) { p.AddRectangle(r); return p; }
            p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure(); return p;
        }
        public static void Hq(Graphics g) { g.SmoothingMode = SmoothingMode.AntiAlias; g.PixelOffsetMode = PixelOffsetMode.HighQuality; g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit; g.InterpolationMode = InterpolationMode.HighQualityBicubic; }
    }

    // everything on the window paints the window's own background under itself, so the glow runs behind them
    abstract class Part : Control
    {
        protected Ui U { get { return (Ui)FindForm(); } }
        protected Part()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
        }
        protected override void OnPaintBackground(PaintEventArgs e)
        {
            var u = FindForm() as Ui;
            if (u == null) { base.OnPaintBackground(e); return; }
            var st = e.Graphics.Save();
            e.Graphics.TranslateTransform(-Left, -Top);
            u.PaintBack(e.Graphics, new Rectangle(Left, Top, Width, Height));
            e.Graphics.Restore(st);
        }
    }

    // text and pictures: read by screen readers, but not something to move focus to
    class StaticAcc : Control.ControlAccessibleObject
    {
        public StaticAcc(Control c) : base(c) { }
        public override AccessibleStates State { get { return AccessibleStates.ReadOnly; } }
    }

    class Txt : Part
    {
        public Font F; public Func<Theme, Color> Col; public bool Ellipsis;
        public Txt(string text, Font f, Func<Theme, Color> col) { Text = text; F = f; Col = col; SetStyle(ControlStyles.Selectable, false); TabStop = false; AccessibleRole = AccessibleRole.StaticText; }
        protected override void OnTextChanged(EventArgs e) { base.OnTextChanged(e); AccessibleName = Text; if (IsHandleCreated) AccessibilityNotifyClients(AccessibleEvents.NameChange, -1); Invalidate(); }
        protected override AccessibleObject CreateAccessibilityInstance() { return new StaticAcc(this); }
        public int HeightFor(int w) { using (var g = CreateGraphics()) { G.Hq(g); return (int)Math.Ceiling(g.MeasureString(Text, F, w, Fmt()).Height) + 2; } }
        StringFormat Fmt()
        {
            var f = new StringFormat(Ellipsis ? StringFormatFlags.NoWrap : 0) { Trimming = Ellipsis ? StringTrimming.EllipsisPath : StringTrimming.Word };
            return f;
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; G.Hq(g);
            using (var b = new SolidBrush(Col(U.T))) using (var f = Fmt()) g.DrawString(Text, F, b, new RectangleF(0, 0, Width, Height), f);
        }
    }

    class Pic : Part
    {
        public Image Img;
        public Pic(Image i, string name) { Img = i; TabStop = false; SetStyle(ControlStyles.Selectable, false); AccessibleRole = AccessibleRole.Graphic; AccessibleName = name; }
        protected override AccessibleObject CreateAccessibilityInstance() { return new StaticAcc(this); }
        protected override void OnPaint(PaintEventArgs e) { if (Img == null) return; G.Hq(e.Graphics); e.Graphics.DrawImage(Img, new Rectangle(0, 0, Width, Height)); }
    }

    enum Kind { Primary, Plain, Ghost, Danger, Link, Close }

    class Btn : Part, IButtonControl
    {
        public Kind K; bool hover, down; public Font F;
        public DialogResult DialogResult { get; set; }
        public Btn(string text, Kind k, Font f)
        {
            Text = text; K = k; F = f; TabStop = true; Cursor = Cursors.Hand;
            SetStyle(ControlStyles.Selectable | ControlStyles.StandardClick, true);
            AccessibleRole = k == Kind.Link ? AccessibleRole.Link : AccessibleRole.PushButton;
            AccessibleName = k == Kind.Close ? "Close" : text;
        }
        public int Pad { get { return U == null ? 3 : U.S(3); } }   // room for the focus ring around the face
        public void NotifyDefault(bool v) { }
        public void PerformClick() { if (Enabled && Visible) OnClick(EventArgs.Empty); }
        protected override bool IsInputKey(Keys k) { return k == Keys.Space || base.IsInputKey(k); }
        protected override void OnKeyDown(KeyEventArgs e) { if (e.KeyCode == Keys.Space) { PerformClick(); e.Handled = true; } base.OnKeyDown(e); }
        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = down = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { down = true; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnGotFocus(EventArgs e) { Invalidate(); base.OnGotFocus(e); }
        protected override void OnLostFocus(EventArgs e) { Invalidate(); base.OnLostFocus(e); }
        protected override void OnEnabledChanged(EventArgs e) { Invalidate(); base.OnEnabledChanged(e); }
        public int WidthFor()
        {
            using (var g = CreateGraphics()) return (int)Math.Ceiling(g.MeasureString(Text, F).Width) + (K == Kind.Link ? U.S(4) : U.S(30)) + Pad * 2;
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; G.Hq(g); var t = U.T; int p = Pad;
            var face = new RectangleF(p, p, Width - 2 * p, Height - 2 * p);
            float r = U.S(8);
            Color fill = Color.Transparent, ink = t.Ink;
            switch (K)
            {
                case Kind.Primary: fill = down ? Theme.Mix(t.Accent, Color.Black, 0.06) : hover ? Theme.Mix(t.Accent, Color.White, 0.07) : t.Accent; ink = t.OnAccent; break;
                case Kind.Danger: fill = down ? Theme.Mix(t.Danger, Color.Black, 0.08) : hover ? Theme.Mix(t.Danger, Color.White, 0.08) : t.Danger; ink = Color.White; break;
                case Kind.Plain: fill = down ? t.Press : hover ? Color.FromArgb(Math.Min(255, t.Hover2.A + 12), t.Hover2) : t.Hover2; break;
                case Kind.Ghost: case Kind.Close: fill = down ? t.Hover2 : hover ? t.Hover : Color.Transparent; ink = hover ? t.Ink : t.Ink2; break;
                case Kind.Link: ink = hover ? t.Ink : t.AccentText; break;
            }
            if (!Enabled) ink = Color.FromArgb(120, ink);
            if (fill.A > 0) using (var path = G.Round(face, r)) using (var b = new SolidBrush(fill)) g.FillPath(b, path);
            if (K == Kind.Primary || K == Kind.Danger)   // the light from above
                using (var pen = new Pen(Color.FromArgb(56, 255, 255, 255), Math.Max(1, U.S(1))))
                    g.DrawLine(pen, face.X + r * 0.7f, face.Y + 0.5f, face.Right - r * 0.7f, face.Y + 0.5f);
            if (K == Kind.Close)
            {
                float c = U.S(5.5f), cx = face.X + face.Width / 2, cy = face.Y + face.Height / 2;
                using (var pen = new Pen(ink, U.S(1.4f))) { g.DrawLine(pen, cx - c, cy - c, cx + c, cy + c); g.DrawLine(pen, cx + c, cy - c, cx - c, cy + c); }
            }
            else
            {
                using (var f = new StringFormat { Alignment = K == Kind.Link ? StringAlignment.Near : StringAlignment.Center, LineAlignment = StringAlignment.Center, FormatFlags = StringFormatFlags.NoWrap })
                using (var b = new SolidBrush(ink))
                {
                    Font font = K == Kind.Link ? U.FontLink : F;
                    g.DrawString(Text, font, b, face, f);
                }
            }
            if (Focused && ShowFocusCues)
                using (var path = G.Round(new RectangleF(1, 1, Width - 2, Height - 2), r + p - 1)) using (var pen = new Pen(t.AccentText, U.S(2))) g.DrawPath(pen, path);
        }
    }

    class Check : Part
    {
        bool on, hover; public Font F;
        public event EventHandler Changed;
        public bool Checked { get { return on; } set { on = value; Invalidate(); AccessibilityNotifyClients(AccessibleEvents.StateChange, -1); if (Changed != null) Changed(this, EventArgs.Empty); } }
        public Check(string text, bool v, Font f)
        {
            Text = text; on = v; F = f; TabStop = true; Cursor = Cursors.Hand;
            SetStyle(ControlStyles.Selectable | ControlStyles.StandardClick, true);
            AccessibleRole = AccessibleRole.CheckButton; AccessibleName = text;
        }
        protected override AccessibleObject CreateAccessibilityInstance() { return new Acc(this); }
        class Acc : ControlAccessibleObject
        {
            readonly Check c; public Acc(Check c) : base(c) { this.c = c; }
            public override AccessibleRole Role { get { return AccessibleRole.CheckButton; } }
            public override AccessibleStates State { get { return base.State | (c.on ? AccessibleStates.Checked : AccessibleStates.None); } }
            public override string DefaultAction { get { return c.on ? "Uncheck" : "Check"; } }
            public override void DoDefaultAction() { c.Checked = !c.on; }
        }
        protected override bool IsInputKey(Keys k) { return k == Keys.Space || base.IsInputKey(k); }
        protected override void OnKeyDown(KeyEventArgs e) { if (e.KeyCode == Keys.Space) { Checked = !on; e.Handled = true; } base.OnKeyDown(e); }
        protected override void OnClick(EventArgs e) { Checked = !on; base.OnClick(e); }
        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnGotFocus(EventArgs e) { Invalidate(); base.OnGotFocus(e); }
        protected override void OnLostFocus(EventArgs e) { Invalidate(); base.OnLostFocus(e); }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; G.Hq(g); var t = U.T;
            float sz = U.S(18), y = (Height - sz) / 2f, x = U.S(3);
            var box = new RectangleF(x, y, sz, sz);
            using (var path = G.Round(box, U.S(5)))
            {
                using (var b = new SolidBrush(on ? t.AccentUi : (hover ? t.Press : t.Hover2))) g.FillPath(b, path);
                if (!on || t.HighContrast) using (var pen = new Pen(t.Edge, U.S(1.5f))) g.DrawPath(pen, path);
            }
            if (on)
                using (var pen = new Pen(t.OnAccentUi, U.S(2)) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round })
                    g.DrawLines(pen, new[] { new PointF(x + sz * 0.26f, y + sz * 0.53f), new PointF(x + sz * 0.43f, y + sz * 0.70f), new PointF(x + sz * 0.75f, y + sz * 0.33f) });
            var tr = new RectangleF(x + sz + U.S(10), 0, Width - sz - U.S(14), Height);
            using (var f = new StringFormat { LineAlignment = StringAlignment.Center, FormatFlags = StringFormatFlags.NoWrap, Trimming = StringTrimming.EllipsisCharacter })
            using (var b = new SolidBrush(t.Ink)) g.DrawString(Text, F, b, tr, f);
            if (Focused && ShowFocusCues)
                using (var path = G.Round(new RectangleF(1, 1, Width - 2, Height - 2), U.S(8))) using (var pen = new Pen(t.AccentText, U.S(2))) g.DrawPath(pen, path);
        }
    }

    class Bar : Part
    {
        double shown, target; bool indet; float phase;
        readonly System.Windows.Forms.Timer tick = new System.Windows.Forms.Timer { Interval = 16 };
        readonly bool anim = Theme.Animate();
        public Bar() { TabStop = false; SetStyle(ControlStyles.Selectable, false); AccessibleRole = AccessibleRole.ProgressBar; AccessibleName = "Progress"; tick.Tick += (s, e) => Step(); tick.Start(); }
        public double Value { get { return target; } set { target = Math.Max(0, Math.Min(1, value)); indet = false; string n = "Progress " + Math.Round(target * 100) + " %"; if (n != AccessibleName) { AccessibleName = n; if (IsHandleCreated) AccessibilityNotifyClients(AccessibleEvents.NameChange, -1); } if (!anim) Jump(); } }
        public bool Indeterminate { get { return indet; } set { indet = value; Invalidate(); } }
        public void Jump() { shown = target; Invalidate(); }
        void Step()
        {
            if (indet) { if (anim) { phase = (phase + 0.012f) % 1.34f; Invalidate(); } return; }
            if (Math.Abs(shown - target) > 0.0005) { shown += (target - shown) * 0.18; Invalidate(); }
        }
        protected override void Dispose(bool d) { if (d) tick.Dispose(); base.Dispose(d); }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; G.Hq(g); var t = U.T;
            var r = new RectangleF(0, 0, Width, Height);
            using (var path = G.Round(r, Height / 2f)) using (var b = new SolidBrush(t.Track)) g.FillPath(b, path);
            RectangleF f;
            if (indet && !anim) f = new RectangleF(0, 0, Width, Height);          // no sliding: a still, full bar
            else if (indet) { float w = Width * 0.34f; f = new RectangleF(-w + phase * Width, 0, w, Height); }
            else f = new RectangleF(0, 0, (float)(Width * shown), Height);
            if (f.Width < 1) return;
            var clip = g.Clip; using (var path = G.Round(r, Height / 2f)) g.SetClip(path);
            using (var path = G.Round(f, Height / 2f)) using (var b = new SolidBrush(indet && !anim ? Color.FromArgb(150, t.AccentUi) : t.AccentUi)) g.FillPath(b, path);
            g.Clip = clip;
        }
    }

    // ---------- the window ----------
    class Ui : Form
    {
        public enum Mode { Install, Updating, Uninstall }
        public Theme T; public float Zoom; public int ExitCode;
        public Font FontTitle, FontBody, FontSmall, FontBtn, FontLink, FontCaps;
        readonly Mode mode; string dir; readonly string scope; readonly Existing found;
        Image logo; bool busy, desktop = true, removeData;
        Bar bar; Txt status;
        Btn closeX;
        PrivateFontCollection pfc;

        public int S(float v) { return (int)Math.Round(v * Zoom); }
        AppInfo A { get { return Program.Pack.App; } }

        public Ui(Mode m, string dir, string scope, Existing found)
        {
            mode = m; this.dir = dir; this.scope = scope; this.found = found;
            if (found != null) desktop = found.Desktop;
            if (Program.O.NoDesktop) desktop = false;
            bool light = Program.O.Theme == "light" || (Program.O.Theme != "dark" && Theme.SystemLight());
            T = SystemInformation.HighContrast ? Theme.System() : Theme.Make(A.Accent, light);
            // Windows' text size setting makes the whole window larger, so longer lines still fit (kept within the screen)
            using (var g = CreateGraphics()) Zoom = g.DpiX / 96f;
            var wa = Screen.PrimaryScreen.WorkingArea;
            Zoom *= Math.Max(1f, Math.Min(Theme.TextScale(), Math.Min(wa.Width * 0.9f / (540 * Zoom), wa.Height * 0.9f / (372 * Zoom))));
            FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.CenterScreen;
            AutoScaleMode = AutoScaleMode.None; KeyPreview = true; ShowInTaskbar = true; DoubleBuffered = true;
            Text = m == Mode.Uninstall ? "Uninstall " + A.Name : A.Name + " Setup";
            BackColor = T.Bg;
            try { Icon = Icon.ExtractAssociatedIcon(Program.Self); } catch { }
            ClientSize = m == Mode.Updating ? new Size(S(440), S(176)) : new Size(S(540), S(372));
            Fonts();
            try { var b = Program.Pack.Asset("logo.png"); if (b != null) logo = Image.FromStream(new MemoryStream(b)); } catch { }
            if (m == Mode.Install) PageWelcome();
            else if (m == Mode.Uninstall) PageUninstall();
            else PageUpdating();
        }

        void Fonts()
        {
            FontFamily body = null, disp = null;
            // a font shipped in the payload (font.ttf / font-bold.ttf) comes first, then Windows 11's and 10's own
            try
            {
                var r = Program.Pack.Asset("font.ttf");
                if (r != null)
                {
                    pfc = new PrivateFontCollection();
                    foreach (var name in new[] { "font.ttf", "font-bold.ttf" })
                    {
                        var bytes = name == "font.ttf" ? r : Program.Pack.Asset(name); if (bytes == null) continue;
                        IntPtr mem = Marshal.AllocCoTaskMem(bytes.Length); Marshal.Copy(bytes, 0, mem, bytes.Length);
                        pfc.AddMemoryFont(mem, bytes.Length);
                    }
                    if (pfc.Families.Length > 0) body = disp = pfc.Families[0];
                }
            }
            catch { }
            if (body == null) body = Family("Segoe UI Variable Text", "Segoe UI");
            if (disp == null) disp = Family("Segoe UI Variable Display", "Segoe UI");
            FontTitle = new Font(disp, S(22), FontStyle.Bold, GraphicsUnit.Pixel);
            FontBody = new Font(body, S(14), FontStyle.Regular, GraphicsUnit.Pixel);
            FontSmall = new Font(body, S(12.5f), FontStyle.Regular, GraphicsUnit.Pixel);
            FontBtn = new Font(body, S(14), FontStyle.Bold, GraphicsUnit.Pixel);
            FontLink = new Font(body, S(13.5f), FontStyle.Bold | FontStyle.Underline, GraphicsUnit.Pixel);
            FontCaps = new Font(body, S(13), FontStyle.Bold, GraphicsUnit.Pixel);
        }
        static FontFamily Family(params string[] names)
        {
            foreach (var n in names) { try { var f = new FontFamily(n); if (f.IsStyleAvailable(FontStyle.Regular)) return f; } catch { } }
            return SystemFonts.MessageBoxFont.FontFamily;
        }

        protected override CreateParams CreateParams
        {
            get { var cp = base.CreateParams; cp.ClassStyle |= 0x20000; cp.Style |= 0x00020000; return cp; }   // a shadow; minimise from the taskbar
        }
        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int v, int size);
        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            try { int round = 2; DwmSetWindowAttribute(Handle, 33, ref round, 4); } catch { }       // Windows 11's rounded corners
            try { int dark = T.Light ? 0 : 1; DwmSetWindowAttribute(Handle, 20, ref dark, 4); } catch { }
        }
        // the top strip moves the window, like the apps' own title bars
        protected override void WndProc(ref Message m)
        {
            base.WndProc(ref m);
            if (m.Msg == 0x84 && (int)m.Result == 1)
            {
                var p = PointToClient(new Point((short)((long)m.LParam & 0xFFFF), (short)(((long)m.LParam >> 16) & 0xFFFF)));
                if (p.Y < S(46)) m.Result = (IntPtr)2;
            }
        }
        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Escape && !busy) { e.Handled = true; Quit(); }
            base.OnKeyDown(e);
        }
        protected override void OnFormClosing(FormClosingEventArgs e) { if (busy && e.CloseReason == CloseReason.UserClosing) e.Cancel = true; base.OnFormClosing(e); }
        void Quit() { if (!busy) Close(); }

        public void PaintBack(Graphics g, Rectangle clip)
        {
            using (var b = new SolidBrush(T.Bg)) g.FillRectangle(b, clip);
            if (T.HighContrast) return;
            float rx = S(mode == Mode.Updating ? 300 : 420), ry = S(mode == Mode.Updating ? 150 : 200), cx = ClientSize.Width, cy = -ClientSize.Height * 0.1f;
            var rc = new RectangleF(cx - rx, cy - ry, rx * 2, ry * 2);
            if (!rc.IntersectsWith(clip)) return;
            using (var path = new GraphicsPath())
            {
                path.AddEllipse(rc);
                using (var pb = new PathGradientBrush(path) { CenterColor = Color.FromArgb(T.Light ? 34 : 44, T.Accent), SurroundColors = new[] { Color.FromArgb(0, T.Accent) } })
                {
                    var blend = new Blend { Factors = new[] { 0f, 0.55f, 1f }, Positions = new[] { 0f, 0.5f, 1f } };
                    pb.Blend = blend;
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.FillPath(pb, path);
                }
            }
        }
        protected override void OnPaintBackground(PaintEventArgs e) { PaintBack(e.Graphics, e.ClipRectangle); }
        protected override void OnPaint(PaintEventArgs e)
        {
            // the app's mark, top left (the title bars show the mark only)
            if (logo != null) { G.Hq(e.Graphics); e.Graphics.DrawImage(logo, new Rectangle(S(18), S(13), S(20), S(20))); }
        }

        // ---- building pages ----
        T0 Add<T0>(T0 c, int x, int y, int w, int h) where T0 : Control { c.SetBounds(S(x), S(y), S(w), S(h)); Controls.Add(c); return c; }
        void Clear()
        {
            var keep = new List<Control>();
            foreach (Control c in Controls) keep.Add(c);
            Controls.Clear();
            foreach (var c in keep) c.Dispose();
            bar = null; status = null;
            closeX = new Btn("", Kind.Close, FontBtn); closeX.SetBounds(ClientSize.Width - S(46), S(8), S(36), S(36)); closeX.Click += (s, e) => Quit();
            closeX.TabIndex = 99; Controls.Add(closeX);
            Invalidate(true);
        }
        Btn Button(string text, Kind k, int right, int y, EventHandler click)
        {
            var b = new Btn(text, k, FontBtn); Controls.Add(b);
            int w = Math.Max(b.WidthFor(), S(92)), h = S(42);
            b.SetBounds(right - w, S(y), w, h); b.Click += click; return b;
        }
        Txt Text0(string text, Font f, Func<Theme, Color> col, int x, int y, int w)
        {
            var t = new Txt(text, f, col); Controls.Add(t);
            t.SetBounds(S(x), S(y), S(w), 10); t.Height = t.HeightFor(S(w)); return t;
        }
        Pic Logo(int x, int y, int size) { return Add(new Pic(logo, A.Name + " logo"), x, y, size, size); }
        int W { get { return (int)(ClientSize.Width / Zoom); } }
        static string Mb(long b) { return b >= 1 << 30 ? (b / 1073741824.0).ToString("0.0") + " GB" : Math.Round(b / 1048576.0) + " MB"; }

        string Verb()
        {
            if (found == null || found.Version == null) return found == null ? "Install" : "Update";
            int c = CompareVersions(found.Version, A.Version);
            return c < 0 ? "Update" : c == 0 ? "Reinstall" : "Install";
        }
        static int CompareVersions(string a, string b)
        {
            Func<string, int[]> parse = s => (s ?? "0").Split('-')[0].Split('.').Select(x => { int n; return int.TryParse(x, out n) ? n : 0; }).Concat(new[] { 0, 0, 0 }).Take(3).ToArray();
            var x1 = parse(a); var y1 = parse(b);
            for (int i = 0; i < 3; i++) if (x1[i] != y1[i]) return x1[i] < y1[i] ? -1 : 1;
            return 0;
        }

        void PageWelcome()
        {
            Clear();
            string verb = Verb();
            Logo(28, 62, 68);
            string title = verb == "Install" ? "Install " + A.Name : verb == "Update" ? "Update " + A.Name : verb == "Reinstall" ? "Reinstall " + A.Name : "Install " + A.Name;
            var t = Text0(title, FontTitle, x => x.Ink, 112, 66, W - 140);
            string sub = "Version " + A.Version + "  ·  " + Mb(Program.Pack.TotalSize);
            if (found != null && found.Version != null && verb != "Reinstall") sub = (verb == "Update" ? "Updates " + found.Version + " to " + A.Version : "Replaces " + found.Version + " with " + A.Version) + "  ·  " + Mb(Program.Pack.TotalSize);
            Text0(sub, FontBody, x => x.Ink2, 112, 66 + (int)(t.Height / Zoom) + 2, W - 140);
            int y = 150;
            if (!string.IsNullOrEmpty(A.Description)) { var d = Text0(A.Description, FontBody, x => x.Ink2, 28, y, W - 56); y += (int)(d.Height / Zoom) + 14; } else y += 6;
            // where it goes; a fresh install can choose
            Text0("Installs in", FontCaps, x => x.Ink2, 28, y, 200);
            y += 18;
            var path = Text0(dir, FontBody, x => x.Ink, 28, y, W - 56 - (found == null ? 90 : 0));
            path.Ellipsis = true; path.Height = S(22);
            if (found == null)
            {
                var ch = new Btn("Change…", Kind.Link, FontLink); Controls.Add(ch);
                ch.SetBounds(ClientSize.Width - S(28) - ch.WidthFor(), S(y - 2), ch.WidthFor(), S(26));
                ch.Click += (s, e) =>
                {
                    using (var fb = new FolderBrowserDialog { Description = "Where should " + A.Name + " go? It gets its own folder there.", SelectedPath = Path.GetDirectoryName(dir), ShowNewFolderButton = true })
                        if (fb.ShowDialog(this) == DialogResult.OK)
                        {
                            string pick = fb.SelectedPath;
                            dir = string.Equals(Path.GetFileName(pick), A.Folder, StringComparison.OrdinalIgnoreCase) ? pick : Path.Combine(pick, A.Folder);
                            path.Text = dir;
                        }
                };
            }
            y += 34;
            var cb = Add(new Check("Put a shortcut on the desktop", desktop, FontBody), 25, y, 320, 30);
            cb.Changed += (s, e) => desktop = cb.Checked;
            if (Engine.Running(dir).Count > 0)
                Text0(A.Name + " is open. It closes when you press " + verb + ".", FontSmall, x => x.Warn, 28, y + 34, W - 56);
            int by = (int)(ClientSize.Height / Zoom) - 64;
            Text0("MIT licence  ·  " + (A.Publisher ?? ""), FontSmall, x => x.Ink3, 28, by + 13, 220);
            var go = Button(verb, Kind.Primary, ClientSize.Width - S(25), by, (s, e) => StartInstall());
            var cancel = Button("Cancel", Kind.Ghost, go.Left - S(4), by, (s, e) => Quit());
            AcceptButton = go; CancelButton = cancel;
            cb.TabIndex = 1; go.TabIndex = 2; cancel.TabIndex = 3;
            ActiveControl = go;
        }

        void PageProgress(string title, string sub)
        {
            Clear();
            closeX.Visible = false;
            Logo(28, 62, 68);
            var t = Text0(title, FontTitle, x => x.Ink, 112, 66, W - 140);
            Text0(sub, FontBody, x => x.Ink2, 112, 66 + (int)(t.Height / Zoom) + 2, W - 140);
            int y = 196;
            status = Text0("Getting ready…", FontBody, x => x.Ink2, 28, y, W - 56);
            bar = Add(new Bar(), 28, y + 30, W - 56, 8);
        }

        void SetProgress(double v, string what)
        {
            if (IsDisposed) return;
            if (InvokeRequired) { BeginInvoke(new Action<double, string>(SetProgress), v, what); return; }
            if (bar != null) bar.Value = v;
            if (status != null) status.Text = what + (v > 0 && v < 1 ? "  ·  " + Math.Round(v * 100) + " %" : v >= 1 ? "" : "…");
        }

        void StartInstall()
        {
            busy = true;
            string verb = Verb();
            PageProgress((verb == "Update" ? "Updating " : "Installing ") + A.Name, "Version " + A.Version);
            bool? d = desktop;
            Work(() => Engine.Install(dir, scope ?? "user", found, d, 10000, SetProgress), () => PageDone(verb), err => PageError(err));
        }

        void Work(Action job, Action ok, Action<string> fail)
        {
            var th = new Thread(() =>
            {
                string err = null;
                try { job(); } catch (Exception e) { err = e.Message; }
                try { BeginInvoke(new Action(() => { busy = false; if (err == null) ok(); else fail(err); })); } catch { }
            });
            th.IsBackground = true; th.Start();
        }

        void PageDone(string verb)
        {
            Clear();
            ExitCode = 0;
            Logo(28, 62, 68);
            var t = Text0(verb == "Update" ? "Update successful" : A.Name + " is ready", FontTitle, x => x.Ink, 112, 66, W - 140);
            Text0(verb == "Update" ? A.Name + " is now on " + A.Version + "." : "Version " + A.Version + " is installed.", FontBody, x => x.Ink2, 112, 66 + (int)(t.Height / Zoom) + 2, W - 140);
            Text0("You'll find it in the Start menu" + (desktop ? " and on the desktop" : "") + ". It keeps itself up to date: new versions download and install from inside the app.", FontBody, x => x.Ink2, 28, 160, W - 56);
            int by = (int)(ClientSize.Height / Zoom) - 64;
            var go = Button("Start " + A.Name, Kind.Primary, ClientSize.Width - S(25), by, (s, e) => { Engine.Launch(dir, false); Close(); });
            var close = Button("Close", Kind.Ghost, go.Left - S(4), by, (s, e) => Close());
            AcceptButton = go; CancelButton = close; ActiveControl = go;
        }

        void PageError(string err)
        {
            Clear();
            ExitCode = 1;
            Logo(28, 62, 68);
            var t = Text0("Setup didn't finish", FontTitle, x => x.Ink, 112, 66, W - 140);
            Text0("Nothing was changed: " + A.Name + " is as it was.", FontBody, x => x.Ink2, 112, 66 + (int)(t.Height / Zoom) + 2, W - 140);
            Text0(err, FontBody, x => x.Error, 28, 160, W - 56);
            int by = (int)(ClientSize.Height / Zoom) - 64;
            var again = Button("Try again", Kind.Primary, ClientSize.Width - S(25), by, (s, e) => PageWelcome());
            var close = Button("Close", Kind.Ghost, again.Left - S(4), by, (s, e) => Close());
            AcceptButton = again; CancelButton = close; ActiveControl = again;
        }

        void PageUninstall()
        {
            Clear();
            Logo(28, 62, 68);
            var t = Text0("Uninstall " + A.Name + "?", FontTitle, x => x.Ink, 112, 66, W - 140);
            Text0("Version " + A.Version, FontBody, x => x.Ink2, 112, 66 + (int)(t.Height / Zoom) + 2, W - 140);
            var d = Text0("This removes the app, its shortcuts and its entry in Settings. Your settings, profiles and saves stay, ready for when you install it again.", FontBody, x => x.Ink2, 28, 160, W - 56);
            int y = 160 + (int)(d.Height / Zoom) + 12;
            var cb = Add(new Check("Also delete my settings and data", false, FontBody), 25, y, 360, 30);
            cb.Changed += (s, e) => removeData = cb.Checked;
            if (Engine.Running(dir).Count > 0) Text0(A.Name + " is open. It closes when you press Uninstall.", FontSmall, x => x.Warn, 28, y + 34, W - 56);
            int by = (int)(ClientSize.Height / Zoom) - 64;
            var go = Button("Uninstall", Kind.Danger, ClientSize.Width - S(25), by, (s, e) =>
            {
                busy = true;
                PageProgress("Uninstalling " + A.Name, "Version " + A.Version);
                bool rd = removeData;
                Work(() => Engine.Uninstall(dir, rd, SetProgress), PageUninstalled, PageError);
            });
            var cancel = Button("Cancel", Kind.Ghost, go.Left - S(4), by, (s, e) => { ExitCode = 1; Close(); });
            cb.TabIndex = 1; go.TabIndex = 2; cancel.TabIndex = 3;
            AcceptButton = go; CancelButton = cancel; ActiveControl = cancel;
        }

        void PageUninstalled()
        {
            Clear();
            ExitCode = 0;
            Logo(28, 62, 68);
            var t = Text0(A.Name + " was uninstalled", FontTitle, x => x.Ink, 112, 66, W - 140);
            Text0(removeData ? "Its settings and data are gone too." : "Your settings and saves are still here.", FontBody, x => x.Ink2, 112, 66 + (int)(t.Height / Zoom) + 2, W - 140);
            int by = (int)(ClientSize.Height / Zoom) - 64;
            var close = Button("Close", Kind.Primary, ClientSize.Width - S(25), by, (s, e) => Close());
            AcceptButton = close; CancelButton = close; ActiveControl = close;
        }

        // an older version of the app handed over to this installer: only a progress bar, then the app opens again
        void PageUpdating()
        {
            Clear();
            closeX.Visible = false;
            busy = true;
            Logo(24, 58, 44);
            var t = Text0("Updating " + A.Name, FontTitle, x => x.Ink, 82, 56, W - 106);
            t.F = new Font(FontTitle.FontFamily, S(18), FontStyle.Bold, GraphicsUnit.Pixel); t.Height = t.HeightFor(t.Width);
            Text0("It opens again by itself when it's done.", FontBody, x => x.Ink2, 82, 56 + (int)(t.Height / Zoom) + 2, W - 106);
            bar = Add(new Bar(), 24, 136, W - 48, 8);
            if (Program.O.Shot != null) return;
            Shown += (s, e) => Work(() =>
            {
                bool ok = false;
                try { Engine.Install(dir, scope ?? "user", found, null, 30000, SetProgress); ok = true; }
                catch (Exception ex) { Engine.WriteResult(dir, false, found, ex.Message); throw; }
                finally { Engine.Launch(dir, true); if (ok) Engine.RemoveDownloadLater(); }
            }, () => { ExitCode = 0; Close(); }, err => { ExitCode = 1; Close(); });
        }

        // ---- a picture of one page, for checking the look without installing anything ----
        public static int Shot(string file, string page)
        {
            var o = Program.O;
            var found = page == "update" ? new Existing { Dir = Engine.DefaultDir(), Scope = "user", Version = "1.1.0" } : null;
            var ui = new Ui(page == "uninstall" || page == "uninstalled" ? Mode.Uninstall : page == "updating" ? Mode.Updating : Mode.Install, Engine.DefaultDir(), "user", found);
            ui.CreateControl();
            if (page == "progress") { ui.PageProgress("Installing " + ui.A.Name, "Version " + ui.A.Version); ui.SetProgress(0.42, "Unpacking"); ui.bar.Jump(); }
            else if (page == "done") ui.PageDone("Install");
            else if (page == "updated") ui.PageDone("Update");
            else if (page == "error") ui.PageError("Couldn't move Critter.exe into place: the file is in use.");
            else if (page == "uninstalled") ui.PageUninstalled();
            else if (page == "updating") { ui.bar.Value = 0.63; ui.bar.Jump(); }
            ui.Show(); Application.DoEvents();
            if (ui.bar != null) ui.bar.Jump();
            using (var bmp = new Bitmap(ui.ClientSize.Width, ui.ClientSize.Height))
            {
                ui.DrawToBitmap(bmp, new Rectangle(Point.Empty, ui.ClientSize));
                bmp.Save(file, ImageFormat.Png);
            }
            ui.Close();
            return 0;
        }
    }
}
