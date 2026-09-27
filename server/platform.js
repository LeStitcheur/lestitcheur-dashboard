import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);
let desktopPlatform;
export function configureDesktopPlatform(value) { desktopPlatform=value; }
export const psQuote = (value) => `'${String(value).replaceAll("'", "''")}'`;
export const psEncoded = (code) => Buffer.from(code, 'utf16le').toString('base64');
// Windows PowerShell cannot import PowerShell 7 modules inherited through Node.
const powershellEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'psmodulepath'));
export async function powershell(code, options = {}) {
  if (process.platform !== 'win32') throw new Error('Cette commande nécessite Windows.');
  return execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', psEncoded(`$ErrorActionPreference='Stop'; ${code}`)], { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024, env: powershellEnv(), ...options });
}
export async function run(file, args, cwd, options = {}) {
  return execFileAsync(file, args, { cwd, windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024, ...options });
}
export async function terminal(cwd, admin = false) {
  if(process.platform!=='win32')throw Error('Utilise le terminal intégré. Pour les droits administrateur, exécute sudo dans ce terminal.');
  const command = psEncoded(`Set-Location -LiteralPath ${psQuote(cwd)}`);
  // A visible window is intentional: this is the terminal requested by the user.
  await powershell(`Start-Process -FilePath 'powershell.exe' -WorkingDirectory ${psQuote(cwd)} -ArgumentList @('-NoLogo','-NoExit','-EncodedCommand','${command}') ${admin ? '-Verb RunAs' : ''}`);
}
export async function editor(cwd) {
  if(process.platform!=='win32') {
    const file=process.platform==='darwin'?'open':'code';const args=process.platform==='darwin'?['-a','Visual Studio Code',cwd]:[cwd];
    const child=spawn(file,args,{detached:true,stdio:'ignore'});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(Error('Installe VS Code et sa commande code pour ouvrir les projets.')));});child.unref();return;
  }
  const candidates = [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe'), 'C:\\Program Files\\Microsoft VS Code\\Code.exe'];
  const exe = candidates.find(existsSync);
  if (!exe) throw new Error('VS Code est introuvable. Installe-le dans son emplacement standard.');
  const child = spawn(exe, [cwd], { detached: true, stdio: 'ignore', windowsHide: true });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
}
export async function recycle(folder) {
  if(desktopPlatform?.trashItem){await desktopPlatform.trashItem(folder);return;}
  if(process.platform!=='win32')throw Error('La Corbeille nécessite la version bureau de l’application.');
  await powershell(`Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(${psQuote(folder)}, 'OnlyErrorDialogs', 'SendToRecycleBin', 'ThrowException')`, { timeout: 120000 });
}
export async function seal(value) {
  if (!value) return '';
  if(process.platform!=='win32') {
    if(!desktopPlatform?.vaultAvailable())throw Error('Active le trousseau du système pour enregistrer les identifiants (Keychain / Secret Service / KWallet).');
    return 'safe:v1:'+desktopPlatform.encrypt(value).toString('base64');
  }
  // Windows DPAPI binds the ciphertext to the signed-in Windows account.
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', psEncoded("$ErrorActionPreference='Stop'; $v=[Console]::In.ReadToEnd(); ConvertFrom-SecureString (ConvertTo-SecureString $v -AsPlainText -Force)")], { windowsHide: true, env: powershellEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  return collectSecret(child, value);
}
export async function unseal(value) {
  if (!value) return '';
  if(value.startsWith('safe:v1:')) {
    if(!desktopPlatform?.vaultAvailable())throw Error('Le trousseau du système est verrouillé ou indisponible.');
    return desktopPlatform.decrypt(Buffer.from(value.slice(8),'base64'));
  }
  if(process.platform!=='win32')throw Error('Cette clé appartient à un compte Windows. Renseigne-la à nouveau sur cet ordinateur.');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', psEncoded("$ErrorActionPreference='Stop'; $s=ConvertTo-SecureString ([Console]::In.ReadToEnd()); $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }")], { windowsHide: true, env: powershellEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  return collectSecret(child, value);
}
function collectSecret(child, input) {
  return new Promise((resolve, reject) => {
    let out = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Le coffre Windows ne répond pas.')); }, 15000);
    child.stdout.on('data', (data) => { out += data; });
    child.once('error', () => { clearTimeout(timeout); reject(new Error('Le coffre Windows est indisponible.')); });
    child.once('close', (code) => { clearTimeout(timeout); code === 0 ? resolve(out.trim()) : reject(new Error('Impossible de lire le secret avec ce compte Windows.')); });
    child.stdin.end(input);
  });
}
