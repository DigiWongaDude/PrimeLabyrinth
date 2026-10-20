// Windows-only, handle-bound storage. No network or credentials in this helper.
// Local administrators and code running as the operator are outside the boundary.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;

public sealed class BetweenPrivateStore : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct SA {
        public int size; public IntPtr descriptor; public int inherit;
    }
    [StructLayout(LayoutKind.Sequential)] struct Info {
        public uint attributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME creation, access, write;
        public uint volume, sizeHigh, sizeLow, links, indexHigh, indexLow;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFileW(string path, uint access, uint share,
        ref SA security, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool CreateDirectoryW(string path, ref SA security);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool GetFileInformationByHandle(SafeFileHandle handle, out Info info);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, StringBuilder path, uint length, uint flags);
    [DllImport("advapi32.dll", SetLastError=true)]
    static extern uint GetSecurityInfo(SafeFileHandle handle, int type, uint flags,
        out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
    [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string sddl, uint revision, out IntPtr sd, out uint size);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool SetFileInformationByHandle(SafeFileHandle handle, int type, ref int value, uint size);

    readonly List<SafeFileHandle> ancestors = new List<SafeFileHandle>();
    readonly List<string> ancestorPaths = new List<string>();
    readonly string sid = WindowsIdentity.GetCurrent().User.Value;
    readonly string root;
    SafeFileHandle rootHandle, lockHandle;
    bool disposed;
    const uint DirectoryFlag=0x02000000, ReparseFlag=0x00200000, WriteThrough=0x80000000;
    const uint ReadControl=0x00020000, ReadAttributes=0x80, Read=0x80000000, Write=0x40000000;
    static void Require(bool value) { if (!value) throw new IOException("private_store_rejected"); }
    static bool Under(string path, string parent) {
        return path.Equals(parent, StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith(parent.TrimEnd('\\')+"\\", StringComparison.OrdinalIgnoreCase);
    }
    static string Full(string path) {
        Require(path != null && Regex.IsMatch(path, @"^[A-Za-z]:\\") &&
            path.IndexOf(':',2)<0 && !path.Contains("/") && !path.Contains("..") &&
            !Regex.IsMatch(path, @"[ .](\\|\z)") && !Regex.IsMatch(path, @"[\x00-\x1f<>""|?*]"));
        return Path.GetFullPath(path).TrimEnd('\\');
    }
    SA Security(bool directory) {
        IntPtr sd; uint size;
        Require(ConvertStringSecurityDescriptorToSecurityDescriptorW(
            "O:"+sid+"D:P(A;"+(directory?"OICI":"")+";FA;;;"+sid+")",1,out sd,out size));
        return new SA { size=Marshal.SizeOf(typeof(SA)), descriptor=sd, inherit=0 };
    }
    SafeFileHandle Open(string path, bool directory, uint access, uint disposition, uint share) {
        SA sa=Security(directory);
        try {
            var handle=CreateFileW(path,access,share,ref sa,disposition,
                ReparseFlag|(directory?DirectoryFlag:WriteThrough),IntPtr.Zero);
            if (handle.IsInvalid) { handle.Dispose(); throw new IOException("private_store_rejected"); }
            return handle;
        } finally { LocalFree(sa.descriptor); }
    }
    static Info CheckPath(SafeFileHandle handle, string path, bool directory) {
        Info info; Require(GetFileInformationByHandle(handle,out info));
        // Reparse, offline, recall-on-open/data-access files are never acceptable.
        Require((info.attributes & (0x400u|0x1000u|0x40000u|0x400000u))==0);
        Require(((info.attributes & 0x10)!=0)==directory);
        if (!directory) Require(info.links==1);
        var finalPath=new StringBuilder(32768);
        uint length=GetFinalPathNameByHandleW(handle,finalPath,(uint)finalPath.Capacity,0);
        Require(length>0 && length<finalPath.Capacity);
        string actual=finalPath.ToString();
        Require(actual.StartsWith(@"\\?\"));
        Require(actual.Substring(4).TrimEnd('\\').Equals(path.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase));
        return info;
    }
    void CheckAcl(SafeFileHandle handle, bool directory) {
        IntPtr owner,group,dacl,sacl,sd;
        Require(GetSecurityInfo(handle,1,5,out owner,out group,out dacl,out sacl,out sd)==0);
        try {
            uint length=GetSecurityDescriptorLength(sd); Require(length>0 && length<65536);
            byte[] bytes=new byte[length]; Marshal.Copy(sd,bytes,0,(int)length);
            var security=new RawSecurityDescriptor(bytes,0);
            Require(security.Owner!=null && security.Owner.Value==sid);
            Require((security.ControlFlags & ControlFlags.DiscretionaryAclProtected)!=0);
            Require(security.DiscretionaryAcl!=null && security.DiscretionaryAcl.Count==1);
            var ace=security.DiscretionaryAcl[0] as CommonAce;
            Require(ace!=null && !ace.IsCallback && ace.AceQualifier==AceQualifier.AccessAllowed &&
                ace.SecurityIdentifier.Value==sid && ace.AccessMask==0x1f01ff &&
                ace.AceFlags==(directory?(AceFlags.ContainerInherit|AceFlags.ObjectInherit):AceFlags.None));
        } finally { LocalFree(sd); }
    }
    public BetweenPrivateStore(string requestedRoot, string repository) {
        root=Full(requestedRoot);
        string local=Full(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));
        string repo=Full(repository);
        Require(Under(root,local) && root!=local && !Under(root,repo));
        Require(!Regex.IsMatch(root,@"(?i)(onedrive|dropbox|google drive|icloud)"));
        // Fixed operational location; alternate roots are only unique disposable tests.
        Require(root.Equals(local+@"\Between-Staging-Invitations",StringComparison.OrdinalIgnoreCase) ||
            Regex.IsMatch(root.Substring(local.Length),@"^\\Temp\\between-hosted-test-[0-9a-f-]{36}\z"));
        var drive=new DriveInfo(Path.GetPathRoot(root));
        Require(drive.DriveType==DriveType.Fixed && drive.DriveFormat=="NTFS");
        try {
            var parents=new List<string>();
            for (string p=Path.GetDirectoryName(root);p!=null;p=Path.GetDirectoryName(p)) parents.Add(p);
            parents.Reverse();
            foreach (string p in parents) {
                var h=Open(p,true,ReadAttributes|ReadControl,3,3);
                ancestors.Add(h); ancestorPaths.Add(p); CheckPath(h,p,true);
            }
            // Security is applied atomically at creation, never after writing plaintext.
            SA sa=Security(true);
            try { if (!CreateDirectoryW(root,ref sa)) Require(Marshal.GetLastWin32Error()==183); }
            finally { LocalFree(sa.descriptor); }
            rootHandle=Open(root,true,ReadAttributes|ReadControl,3,3);
            CheckPath(rootHandle,root,true); CheckAcl(rootHandle,true);
            // OPEN_ALWAYS, share NONE. A process exit releases the lock; no stale-lock deletion.
            lockHandle=Open(root+@"\operator.lock",false,Read|Write|ReadControl,4,0);
            CheckPath(lockHandle,root+@"\operator.lock",false); CheckAcl(lockHandle,false);
            Check();
        } catch { Dispose(); throw; }
    }
    public void Check() {
        Require(!disposed && rootHandle!=null && lockHandle!=null);
        for (int i=0;i<ancestors.Count;i++) CheckPath(ancestors[i],ancestorPaths[i],true);
        CheckPath(rootHandle,root,true); CheckAcl(rootHandle,true);
        CheckPath(lockHandle,root+@"\operator.lock",false); CheckAcl(lockHandle,false);
    }
    string FilePath(string name) {
        Require(Regex.IsMatch(name,@"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(token|[0-9]{6}\.json)\z"));
        return root+"\\"+name;
    }
    public void Create(string name,string text) {
        Check(); string path=FilePath(name);
        Require(text!=null && Encoding.UTF8.GetByteCount(text)<=65536);
        using(var h=Open(path,false,Read|Write|ReadControl,1,0)) {
            Info before=CheckPath(h,path,false); CheckAcl(h,false);
            using(var stream=new FileStream(h,FileAccess.ReadWrite)) {
                byte[] bytes=Encoding.UTF8.GetBytes(text);
                stream.Write(bytes,0,bytes.Length); stream.Flush(true);
                Info after=CheckPath(h,path,false); CheckAcl(h,false);
                Require(before.volume==after.volume && before.indexHigh==after.indexHigh && before.indexLow==after.indexLow);
            }
        }
        Check();
    }
    public string ReadFile(string name) {
        Check(); string path=FilePath(name);
        using(var h=Open(path,false,Read|ReadControl,3,0)) {
            Info info=CheckPath(h,path,false); CheckAcl(h,false);
            Require(info.sizeHigh==0 && info.sizeLow<=65536);
            using(var stream=new FileStream(h,FileAccess.Read)) {
                using(var reader=new StreamReader(stream,new UTF8Encoding(false,true))) {
                    string text=reader.ReadToEnd(); CheckPath(h,path,false); CheckAcl(h,false);
                    return text;
                }
            }
        }
    }
    public string[] List() {
        Check();
        var names=new List<string>();
        foreach(string path in Directory.GetFileSystemEntries(root)) {
            string name=Path.GetFileName(path);
            if(name=="operator.lock") continue;
            FilePath(name); names.Add(name);
        }
        names.Sort(StringComparer.Ordinal); return names.ToArray();
    }
    public void DeleteToken(string name) {
        Check(); Require(name.EndsWith(".token",StringComparison.Ordinal));
        string path=FilePath(name);
        if (!File.Exists(path)) return;
        using(var h=Open(path,false,Read|ReadControl|0x10000,3,0)) {
            CheckPath(h,path,false); CheckAcl(h,false);
            int delete=1; Require(SetFileInformationByHandle(h,4,ref delete,4));
        }
        Check(); Require(!File.Exists(path));
    }
    public void Dispose() {
        disposed=true;
        if(lockHandle!=null) lockHandle.Dispose();
        if(rootHandle!=null) rootHandle.Dispose();
        foreach(var h in ancestors) h.Dispose();
    }
}
