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
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr child);
    [DllImport("user32.dll")] static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll")] static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
        [DllImport("user32.dll", SetLastError=true)] static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int command);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
    [DllImport("user32.dll")] static extern IntPtr GetWindowDpiAwarenessContext(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    readonly RdpControl control = new RdpControl();
    readonly Button exitFullscreen = new Button();
    bool fullscreen;
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly IntPtr parent;
    readonly uint parentPid;
    dynamic client;
    bool started,closing,wantsVisible;
    int surfaceX,surfaceY,surfaceWidth=100,surfaceHeight=100;
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
        exitFullscreen.Text="Quitter le plein écran";exitFullscreen.AccessibleName="Quitter le plein écran";
        exitFullscreen.Size=new Size(190,38);exitFullscreen.FlatStyle=FlatStyle.Flat;
        exitFullscreen.BackColor=Color.FromArgb(25,35,48);exitFullscreen.ForeColor=Color.White;
        exitFullscreen.Visible=false;exitFullscreen.Click+=delegate{SetFullscreen(false);};Controls.Add(exitFullscreen);
        timer.Interval=40;timer.Tick+=delegate {
            uint owner;GetWindowThreadProcessId(parent,out owner);
            if(!IsWindow(parent)||owner!=parentPid){Close();return;}
            SyncSurface();
            if(client==null||!started)return;
            try { int state=(int)client.Connected;if(state!=lastState){lastState=state;phase=state==1?"connected":state==2?"connecting":"disconnected";Send(new {phase=phase,extendedReason=state==0?(int)client.ExtendedDisconnectReason:0});} } catch { }
        };
    }
    protected override void OnLoad(EventArgs e) {
        base.OnLoad(e);
        try {
            long style=GetWindowLongPtr(Handle,-16).ToInt64();
            // An owned popup is composed independently from Chromium's no-redirection surface.
            // A WS_CHILD HWND can report visible while Chromium completely covers its pixels.
            SetWindowLongPtr(Handle,-16,new IntPtr((style & ~0x40000000L) | 0x80000000L | 0x04000000L));
            SetWindowLongPtr(Handle,-8,parent);
            SetWindowPos(Handle,IntPtr.Zero,0,0,0,0,0x0020|0x0010|0x0004|0x0002|0x0001);
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
    protected override bool ShowWithoutActivation { get { return true; } }
    void SyncSurface() {
        // Owned windows automatically stay above their owner, without being always-on-top.
        // Track native moves as well as DOM scrolling; the owner may move without a resize event.
        bool show=wantsVisible&&IsWindowVisible(parent)&&!IsIconic(parent);
        if(!show){if(Visible)Hide();return;}
        Point origin=new Point(surfaceX,surfaceY);
        if(!ClientToScreen(parent,ref origin))return;
        Rectangle bounds=fullscreen?Screen.FromHandle(parent).Bounds:new Rectangle(origin.X,origin.Y,surfaceWidth,surfaceHeight);
        bool changed=Left!=bounds.X||Top!=bounds.Y||Width!=bounds.Width||Height!=bounds.Height;
        if(changed)SetWindowPos(Handle,IntPtr.Zero,bounds.X,bounds.Y,bounds.Width,bounds.Height,0x0010|0x0004);
        exitFullscreen.Visible=fullscreen;
        if(fullscreen){exitFullscreen.Location=new Point(Math.Max(0,(ClientSize.Width-exitFullscreen.Width)/2),12);exitFullscreen.BringToFront();}
        if(!Visible){Visible=true;control.Visible=true;}
    }
    void SetFullscreen(bool enabled) {fullscreen=enabled;SyncSurface();}
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
                    surfaceWidth=Math.Max(100,Math.Min(16000,Number(d,"width")));
                    surfaceHeight=Math.Max(100,Math.Min(16000,Number(d,"height")));
                    surfaceX=Number(d,"x");surfaceY=Number(d,"y");
                    wantsVisible=d.ContainsKey("visible")&&(bool)d["visible"];
                    SyncSurface();
                    break;
                case "fullscreen": SetFullscreen(d.ContainsKey("enabled")?(bool)d["enabled"]:!fullscreen);break;
                case "focus": control.Focus();break;
                case "disconnect": Close();break;
                case "probe": Send(new {phase="diagnostic",embedded=GetParent(Handle)==parent,fullscreen=fullscreen,exitButtonVisible=exitFullscreen.Visible,ownedPopup=(GetWindowLongPtr(Handle,-16).ToInt64()&0x40000000L)==0,hostVisible=IsWindowVisible(Handle),controlVisible=IsWindowVisible(control.Handle),managedVisible=Visible,x=Left,y=Top,width=ClientSize.Width,height=ClientSize.Height,controlWidth=control.Width,controlHeight=control.Height});break;
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
