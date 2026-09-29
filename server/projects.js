import {snapshot,gitDetails,gitMutation} from './git-worktree.js';
import {releasePlan,githubCredential,githubClient,publishRelease} from './github-release.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { run, terminal, editor, recycle } from './platform.js';
import { projectPath, validName, githubRemote } from './security.js';
import { findNodeRuntime } from './node-runtime.js';

async function packageInfo(cwd) {
  try { return JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf8')); } catch { return null; }
}
async function git(cwd, args) { return (await run('git', args, cwd, { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).stdout.trim(); }
export async function deployPlan(cwd) {
  if (!existsSync(path.join(cwd, '.git'))) throw new Error('Aucun dépôt Git dans ce dossier.');
  const remotes = (await git(cwd, ['remote', 'get-url', '--push', '--all', 'origin'])).split(/\r?\n/);
  if (remotes.length !== 1 || !githubRemote(remotes[0])) throw new Error('Configure un unique remote origin GitHub (HTTPS ou SSH, sans jeton dans l’URL).');
  const branch = await git(cwd, ['symbolic-ref', '--short', 'HEAD']);
  const head = await git(cwd, ['rev-parse', 'HEAD']);
  const dirty = await git(cwd, ['status', '--porcelain']);
  if (dirty) throw new Error('Des modifications ne sont pas commitées. Crée un commit avant de publier.');
  const remote = remotes[0];
  return { branch, head, remote, fingerprint: createHash('sha256').update(JSON.stringify({ branch, head, remote })).digest('hex') };
}
export function createProjects(settings, jobs, appRoot) {
  const resolve = (name, mutation = false) => projectPath(settings.get().projectsRoot, name, appRoot, mutation);
  const checks=new Map();
  return {
    async gitDetails(name){return gitDetails(await resolve(name));},
    async list() {
      const root = settings.get().projectsRoot;
      const dirs = await fs.readdir(root, { withFileTypes: true });
      const result = [];
      // Keep filesystem and git probes bounded, even on large dev folders.
      for (const entry of dirs.filter(d => d.isDirectory() && !d.isSymbolicLink() && !d.name.startsWith('.'))) {
        try {
          const cwd = await resolve(entry.name);
          const pkg = await packageInfo(cwd);
          const info = await fs.stat(cwd);
          const isGit = existsSync(path.join(cwd, '.git'));
          let repository = '', branch = '', deployable = false, changedFiles = [], lastCommit = '', siteUrl = '';
          if (isGit) {
            branch = await git(cwd, ['branch', '--show-current']).catch(() => '');
            const remotes = await git(cwd, ['remote', 'get-url', '--push', '--all', 'origin']).catch(() => '');
            deployable = githubRemote(remotes);
            if(deployable)repository=remotes.replace(/^(?:https:\/\/github\.com\/|git@github\.com:)/,'').replace(/\.git$/,'');
            changedFiles = (await git(cwd, ['status', '--porcelain']).catch(()=> '')).split(/\r?\n/).filter(Boolean).slice(0,100);
            lastCommit = await git(cwd, ['log', '-1', '--format=%h · %s']).catch(()=> '');
          }
          try { const url=new URL(pkg?.homepage);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password)siteUrl=url.href; } catch {}
          const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
          const stack = deps.next ? 'Next.js' : deps.react ? 'React' : deps['discord.js'] ? 'Discord.js' : pkg ? 'Node.js' : existsSync(path.join(cwd, 'pyproject.toml')) || existsSync(path.join(cwd, 'requirements.txt')) ? 'Python' : 'Dossier';
          result.push({ name: entry.name, path: cwd, stack, description: pkg?.description || '', git: isGit, repository, branch, changedFiles, lastCommit, siteUrl, deployable, scripts: Object.keys(pkg?.scripts || {}), modified: info.mtime.toISOString(), protected: cwd.toLowerCase() === appRoot.toLowerCase() });
        } catch { /* Junctions, unavailable folders and invalid names are not managed. */ }
      }
      return result.sort((a, b) => a.name.localeCompare(b.name));
    },
    async plan(name) { return deployPlan(await resolve(name)); },
    async releasePlan(name) { const cwd=await resolve(name);const plan=await releasePlan(cwd,await deployPlan(cwd));return {...plan,verified:checks.get(cwd)===plan.fingerprint}; },
    async action(name, action, data) {
      const cwd = await resolve(name, ['rename', 'delete'].includes(action));
      const lock = cwd.toLowerCase();
      if (jobs.active(lock)) throw new Error('Attends la fin de l’opération en cours sur ce dossier.');
      if(action==='git'){return jobs.create('Git · '+name,async log=>{await gitMutation(cwd,data);log('Opération Git terminée.\n');},lock);}
      if(action==='preflight')return jobs.create('Vérification avant publication · '+name,async log=>{
        checks.delete(cwd);const original=await deployPlan(cwd),scan=await snapshot(cwd);log('Dépôt propre et version de travail contrôlés.\n');if(scan.findings.length)throw Error(scan.findings.map(f=>f.file+' : '+f.kind).join('\n'));
        log('Recherche de clés et fichiers sensibles terminée (contrôle heuristique).\n');const pkg=await packageInfo(cwd);if(!pkg?.scripts?.test||/no test specified/.test(pkg.scripts.test))throw Error('Un script test réel est requis.');const runtime=findNodeRuntime();
        await jobs.command(runtime.node,[runtime.npm,'run','test'],cwd,log,{env:runtime.env});if(pkg.scripts.build)await jobs.command(runtime.node,[runtime.npm,'run','build'],cwd,log,{env:runtime.env});
        const after=await deployPlan(cwd);if(after.head!==original.head||(await snapshot(cwd)).fingerprint!==scan.fingerprint)throw Error('Le code a changé pendant les vérifications.');const plan=await releasePlan(cwd,after);checks.set(cwd,plan.fingerprint);log('Version, tests et empreintes des fichiers de release validés. Tu peux préparer la publication.\n');
      },lock);
      if (action === 'terminal') { await terminal(cwd); jobs.addActivity(`Terminal ouvert · ${name}`); return {}; }
      if (action === 'vscode') { await editor(cwd); jobs.addActivity(`VS Code ouvert · ${name}`); return {}; }
      if (action === 'rename') {
        if (!validName(data.newName)) throw new Error('Le nouveau nom est invalide.');
        const target = path.join(path.dirname(cwd), data.newName);
        if (existsSync(target)) throw new Error('Un dossier porte déjà ce nom.');
        await fs.rename(cwd, target);
        jobs.addActivity(`Dossier renommé · ${name} → ${data.newName}`, 'success'); return {};
      }
      if (action === 'delete') {
        if (data.confirm !== name) throw new Error('Recopie le nom du dossier pour confirmer.');
        await recycle(cwd); jobs.addActivity(`Dossier déplacé dans la Corbeille · ${name}`, 'success'); return {};
      }
      if(action==='release'){
        const plan=await releasePlan(cwd,await deployPlan(cwd));
        if(checks.get(cwd)!==plan.fingerprint)throw Error('Lance la vérification avant publication pour cette version et ces fichiers.');
        if(data.fingerprint!==plan.fingerprint)throw Error('Le projet ou les fichiers ont changé. Vérifie à nouveau la release.');
        return jobs.create('Release GitHub · '+name,async log=>{
          const current=await releasePlan(cwd,await deployPlan(cwd));
          if(current.fingerprint!==plan.fingerprint)throw Error('Les fichiers ont changé avant publication.');
          const token=await githubCredential(cwd);
          await publishRelease({cwd,plan,client:githubClient(token),log});
        },lock);
      }
      if (action === 'deploy') {
        const plan = await deployPlan(cwd);
        if (data.fingerprint !== plan.fingerprint) throw new Error('Le dépôt a changé. Vérifie à nouveau la publication.');
        return jobs.create(`Publication GitHub · ${name}`, async (log) => {
          const current = await deployPlan(cwd);
          if (current.fingerprint !== plan.fingerprint) throw new Error('Le dépôt a changé avant la publication.');
          log(`Envoi du commit ${plan.head.slice(0, 8)} vers ${plan.branch}.\n`);
          await jobs.command('git', ['push', '--no-verify', plan.remote, `${plan.head}:refs/heads/${plan.branch}`], cwd, log, { timeout: 120000 });
          log('\nPublication GitHub terminée. Aucun hébergement web n’a été déclenché par le panel ; les workflows du dépôt peuvent s’exécuter.\n');
        }, lock);
      }
      if (action === 'analyze' || action === 'test-deploy') {
        const pkg = await packageInfo(cwd);
        const scripts = pkg?.scripts || {};
        const selected = action === 'analyze' ? ['lint', 'test'].filter(s => scripts[s] && !/no test specified/.test(scripts[s])) : ['build'].filter(s => scripts[s]);
        return jobs.create(`${action === 'analyze' ? 'Analyse' : 'Test de déploiement'} · ${name}`, async (log) => {
          log(`Projet : ${name}\nDossier : ${cwd}\n`);
          if (!pkg) throw new Error('Analyse automatique disponible pour les projets avec package.json uniquement.');
          log(`Scripts disponibles : ${Object.keys(scripts).join(', ') || 'aucun'}\n`);
          if (!selected.length) throw new Error(action === 'analyze' ? 'Aucun script lint ou test exploitable. Ajoute-les au package.json.' : 'Aucun script build. Ajoute un build local au package.json.');
          const runtime = findNodeRuntime();
          if (!existsSync(path.join(cwd, 'node_modules'))) throw new Error('Dépendances absentes. Installe-les depuis le terminal du projet.');
          for (const script of selected) {
            log(`\n> npm run ${script}\n`);
            await jobs.command(runtime.node, [runtime.npm, 'run', script], cwd, log, { env: runtime.env });
          }
          log(action === 'analyze' ? '\nVérifications configurées terminées.\n' : '\nBuild local réussi. Aucun fichier envoyé et aucun déploiement distant effectué.\n');
        }, lock);
      }
      throw new Error('Action inconnue.');
    },
  };
}
