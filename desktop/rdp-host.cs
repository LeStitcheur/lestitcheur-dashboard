using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

sealed class RdpControl : AxHost {
    public RdpControl() : base("8B918B82-7985-4C24-89DF-C33AD2BBFBCD") {}
    public object Client { get { return GetOcx(); } }
}

sealed class RdpHost : Form {
    [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr child);
    [DllImport("user32.dll")] static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll")] static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
    [DllImport("user32.dll")] static extern bool MoveWindow(IntPtr window,int x,int y,int width,int height,bool repaint);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int command);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
    [DllImport("user32.dll")] static extern IntPtr GetWindowDpiAwarenessContext(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    readonly RdpControl control = new RdpControl();
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly IntPtr parent;
    readonly uint parentPid;
    dynamic client;
    bool started,closing;
    string phase="ready";
    int lastState=-1;
    readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();

    public RdpHost(IntPtr parentWindow,uint processId) {
        parent=parentWindow;parentPid=processId;
        uint actual;GetWindowThreadProcessId(parent,out actual);
        if(!IsWindow(parent)||actual!=parentPid)throw new Exception("Fenêtre parente invalide.");
        SetThreadDpiAwarenessContext(GetWindowDpiAwarenessContext(parent));
        FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;AutoScaleMode=AutoScaleMode.None;
        StartPosition=FormStartPosition.Manual;Location=new Point(-20000,-20000);Size=new Size(900,600);BackColor=Color.FromArgb(11,18,27);
        control.Dock=DockStyle.Fill;Controls.Add(control);
        timer.Interval=400;timer.Tick+=delegate {
            uint owner;GetWindowThreadProcessId(parent,out owner);
            if(!IsWindow(parent)||owner!=parentPid){Close();return;}
            if(client==null||!started)return;
            try { int state=(int)client.Connected;if(state!=lastState){lastState=state;phase=state==1?"connected":state==2?"connecting":"disconnected";Send(new {phase=phase,extendedReason=state==0?(int)client.ExtendedDisconnectReason:0});} } catch { }
        };
    }
    protected override void OnLoad(EventArgs e) {
        base.OnLoad(e);
        try {
            long style=GetWindowLongPtr(Handle,-16).ToInt64();
            SetWindowLongPtr(Handle,-16,new IntPtr((style & ~unchecked((long)0x80000000)) | 0x40000000 | 0x04000000));
            SetParent(Handle,parent);
            if(GetParent(Handle)!=parent)throw new Exception("Intégration de la fenêtre impossible.");
            ShowWindow(Handle,0);
            client=control.Client;
            // Keep Windows' authentication warning; never silently accept a bad certificate.
            client.AdvancedSettings9.AuthenticationLevel=2;
            client.AdvancedSettings9.EnableCredSspSupport=true;
            client.AdvancedSettings9.SmartSizing=true;
            client.AdvancedSettings9.RedirectDrives=false;
            client.AdvancedSettings9.RedirectPrinters=false;
            client.AdvancedSettings9.RedirectPorts=false;
            client.AdvancedSettings9.RedirectSmartCards=false;
            client.AdvancedSettings9.RedirectClipboard=false;
            client.AdvancedSettings9.EnableAutoReconnect=true;
            client.AdvancedSettings9.overallConnectionTimeout=30;
            Send(new {phase="ready",version=(string)client.Version,embedded=GetParent(Handle)==parent});timer.Start();
            var reader=new Thread(ReadInput);reader.IsBackground=true;reader.Start();
        } catch(Exception ex) { Send(new {phase="error",message="Le composant Bureau à distance Windows est indisponible.",code=ex.HResult});Close(); }
    }
    void ReadInput() {
        try {string line;while((line=Console.ReadLine())!=null){if(line.Length>20000)continue;var data=json.Deserialize<Dictionary<string,object>>(line);BeginInvoke(new Action(()=>HandleMessage(data)));}}catch { }
        try{BeginInvoke(new Action(Close));}catch { }
    }
    static string ValueText(Dictionary<string,object> d,string key) {return d.ContainsKey(key)?Convert.ToString(d[key],CultureInfo.InvariantCulture):"";}
    static int Number(Dictionary<string,object> d,string key) {return Convert.ToInt32(d[key],CultureInfo.InvariantCulture);}
    void HandleMessage(Dictionary<string,object> d) {
        if(closing)return;
        try {
            switch(ValueText(d,"type")) {
                case "connect":
                    if(started)throw new Exception();
                    client.Server=ValueText(d,"host");client.UserName=ValueText(d,"username");client.Domain=ValueText(d,"domain");
                    client.AdvancedSettings9.RDPPort=Number(d,"port");
                    client.AdvancedSettings9.ClearTextPassword=ValueText(d,"password");d.Remove("password");
                    client.AdvancedSettings9.RedirectClipboard=d.ContainsKey("clipboard")&&(bool)d["clipboard"];
                    client.DesktopWidth=1440;client.DesktopHeight=900;client.ColorDepth=32;
                    started=true;phase="connecting";Send(new {phase=phase});client.Connect();break;
                case "layout":
                    int width=Math.Max(100,Math.Min(16000,Number(d,"width"))),height=Math.Max(100,Math.Min(16000,Number(d,"height")));
                    MoveWindow(Handle,Number(d,"x"),Number(d,"y"),width,height,true);
                    ShowWindow(Handle,d.ContainsKey("visible")&&(bool)d["visible"]?4:0);break;
                case "focus": control.Focus();break;
                case "disconnect": Close();break;
                case "probe": Send(new {phase="ready",version=(string)client.Version,embedded=true});break;
            }
        } catch(Exception ex){d.Remove("password");Send(new {phase="error",message="La connexion RDP a échoué. Vérifie les paramètres et l’accès au serveur.",code=ex.HResult});}
    }
    public static void Send(object value){try{Console.WriteLine(new JavaScriptSerializer().Serialize(value));Console.Out.Flush();}catch{}}
    protected override void OnFormClosing(FormClosingEventArgs e){closing=true;timer.Stop();try{if(client!=null&&(int)client.Connected!=0)client.Disconnect();}catch{}base.OnFormClosing(e);}
    [STAThread] static void Main(string[] args) {
        Console.InputEncoding=new System.Text.UTF8Encoding(false);Console.OutputEncoding=new System.Text.UTF8Encoding(false);
        try {if(args.Length!=2)throw new Exception();Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new RdpHost(new IntPtr(long.Parse(args[0],CultureInfo.InvariantCulture)),uint.Parse(args[1],CultureInfo.InvariantCulture)));}
        catch(Exception ex){Send(new {phase="error",message="Impossible d’initialiser le bureau distant Windows.",code=ex.HResult});Environment.ExitCode=1;}
    }
}
