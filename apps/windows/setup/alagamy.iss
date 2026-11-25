; برنامج تسطيب العجمي (Inno Setup 6)
#ifndef MyVersion
  #define MyVersion "1.0.0"
#endif
#define MyName "محل عبده العجمي وأولاده"

[Setup]
AppId={{6C1E7D52-3A4B-4D1E-9A55-2B7E0A9C4E11}
AppName={#MyName}
AppVersion={#MyVersion}
AppVerName={#MyName} - {#MyVersion}
AppPublisher=محلات عبده العجمي وأولاده محمد وعبدالرحمن
DefaultDirName={autopf}\Alagamy
DefaultGroupName=العجمي
DisableProgramGroupPage=yes
DisableWelcomePage=no
DisableDirPage=no
DisableReadyPage=no
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\..\out
OutputBaseFilename=AlagamySetup
SetupIconFile=..\app.ico
UninstallDisplayIcon={app}\Alagamy.exe
UninstallDisplayName={#MyName}
WizardStyle=modern
WizardSizePercent=110
WizardImageFile=wizard.bmp,wizard@2x.bmp
WizardSmallImageFile=small.bmp,small@2x.bmp
InfoBeforeFile=before.txt
InfoAfterFile=after.txt
Compression=lzma2/max
SolidCompression=yes
CloseApplications=yes
RestartApplications=no
ShowLanguageDialog=no
MinVersion=10.0

[Languages]
Name: "ar"; MessagesFile: "compiler:Default.isl,ar.isl"

[Files]
Source: "..\..\..\out\Alagamy.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\..\out\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: NeedsWebView2

[Dirs]
Name: "{code:GetBackupDir}"; Flags: uninsneveruninstall

[Icons]
Name: "{autodesktop}\العجمي - حسابات المحل"; Filename: "{app}\Alagamy.exe"; Comment: "حسابات محل عبده العجمي وأولاده"
Name: "{autoprograms}\العجمي - حسابات المحل"; Filename: "{app}\Alagamy.exe"

[Registry]
Root: HKLM; Subkey: "Software\Alagamy"; ValueType: string; ValueName: "BackupDir"; ValueData: "{code:GetBackupDir}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Alagamy"; ValueType: string; ValueName: "BackupDir"; ValueData: "{code:GetBackupDir}"
Root: HKCU; Subkey: "Software\Alagamy"; ValueType: string; ValueName: "LastBackup"; ValueData: ""

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "بينزّل مكوّن WebView2 من مايكروسوفت (محتاج نت)..."; Check: NeedsWebView2; Flags: waituntilterminated
Filename: "{app}\Alagamy.exe"; Description: "افتح البرنامج دلوقتي"; Flags: nowait postinstall skipifsilent

[Code]
var
  BackupPage: TInputDirWizardPage;

function GetBackupDir(Param: String): String;
begin
  if Assigned(BackupPage) then
    Result := BackupPage.Values[0]
  else
    Result := ExpandConstant('{userdocs}\العجمي - نسخ احتياطية');
end;

function WebView2Version(): String;
var V: String;
begin
  Result := '';
  if RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V) then Result := V
  else if RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V) then Result := V
  else if RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V) then Result := V;
end;

function NeedsWebView2(): Boolean;
var V: String;
begin
  V := WebView2Version();
  Result := (V = '') or (V = '0.0.0.0');
end;

procedure InitializeWizard();
var Old: String;
begin
  BackupPage := CreateInputDirPage(wpSelectDir,
    'مكان حفظ ملفات Excel',
    'البرنامج هيحفظ نسخة Excel من كل البيانات هنا كل 24 ساعة لوحده.',
    'اختار الفولدر اللي ملفات Excel تتحفظ فيه:' + #13#10 +
    '• العجمي - كل البيانات   • العجمي - الزمامات   • العجمي - العملاء' + #13#10 +
    'ونسخة كل يوم في فولدر "نسخ قديمة" لمدة 60 يوم.' + #13#10#13#10 +
    'نصيحة: اختار فولدر جوه OneDrive أو Google Drive أو على هارد خارجي، علشان النسخة تبقى بره الجهاز كمان.' + #13#10 +
    'تقدر تغيره بعدين من البرنامج: الإعدادات ← النسخة الاحتياطية.',
    False, 'العجمي - نسخ احتياطية');
  BackupPage.Add('فولدر الحفظ:');
  if RegQueryStringValue(HKCU, 'Software\Alagamy', 'BackupDir', Old) and (Old <> '') then
    BackupPage.Values[0] := Old
  else
    BackupPage.Values[0] := ExpandConstant('{userdocs}\العجمي - نسخ احتياطية');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = BackupPage.ID) and (Trim(BackupPage.Values[0]) = '') then
  begin
    MsgBox('لازم تختار فولدر لحفظ ملفات Excel.', mbError, MB_OK);
    Result := False;
  end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := MemoDirInfo + NewLine + NewLine +
    'مكان حفظ ملفات Excel:' + NewLine + Space + BackupPage.Values[0] + NewLine + NewLine +
    'أيقونة على سطح المكتب:' + NewLine + Space + 'العجمي - حسابات المحل';
  if NeedsWebView2() then
    Result := Result + NewLine + NewLine + 'هيتنزل كمان:' + NewLine + Space + 'مكوّن WebView2 من مايكروسوفت';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var Lines: TArrayOfString;
begin
  if CurStep = ssPostInstall then
  begin
    SetArrayLength(Lines, 1);
    Lines[0] := BackupPage.Values[0];
    SaveStringsToUTF8File(ExpandConstant('{app}\backup-folder.txt'), Lines, False);
  end;
end;
