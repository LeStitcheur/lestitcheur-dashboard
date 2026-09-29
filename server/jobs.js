import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export function createJobs(onActivity = () => {}) {
  const jobs = [];
  const activities = [];
  const active = new Map();
  const addActivity = (message, type = 'info', details) => { const entry = { id: randomUUID(), time: new Date().toISOString(), message, type, details:details||{source:/GitHub|Git ·|publication/i.test(message)?'github':/DNS/.test(message)?'domains':'activity'} }; activities.unshift(entry); activities.splice(100); Promise.resolve(onActivity(entry)).catch(error=>console.error('Journal persistant :',error.message)); };
  function create(title, task, lock) {
    if (lock && active.has(lock)) throw new Error('Une opération est déjà en cours sur ce projet.');
    if (jobs.filter(j => j.status === 'running').length >= 4) throw new Error('Quatre opérations sont déjà en cours.');
    const job = { id: randomUUID(), title, status: 'running', started: new Date().toISOString(), output: '' };
    jobs.unshift(job); if (jobs.length > 50) { const index = jobs.findLastIndex(j => j.status !== 'running'); if (index >= 0) jobs.splice(index, 1); }
    const log = (text) => { job.output = (job.output + text).slice(-80000); };
    if (lock) active.set(lock, job.id);
    addActivity(title);
    Promise.resolve().then(() => task(log)).then(() => { job.status = 'success'; addActivity(`${title} : terminé`, 'success'); }).catch((error) => { job.status = 'error'; log(`\n${error.message}\n`); addActivity(`${title} : échec`, 'error'); }).finally(() => { job.finished = new Date().toISOString(); if (lock) active.delete(lock); });
    return { jobId: job.id };
  }
  function command(file, args, cwd, log, { timeout = 10 * 60000, env = {} } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(file, args, { cwd, windowsHide: true, shell: false, env: { ...process.env, CI: 'true', GIT_TERMINAL_PROMPT: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
      const timer = setTimeout(() => {
        if (process.platform === 'win32' && child.pid) { const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }); killer.on('error', () => {}); } else child.kill('SIGKILL');
        reject(new Error('Délai dépassé : opération interrompue.'));
      }, timeout);
      child.stdout.on('data', (data) => log(data.toString()));
      child.stderr.on('data', (data) => log(data.toString()));
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`La commande a échoué (code ${code}).`)); });
    });
  }
  return { create, command, list: () => jobs, find: id => jobs.find(j => j.id === id), active: key => active.has(key), activities: () => activities, addActivity };
}
