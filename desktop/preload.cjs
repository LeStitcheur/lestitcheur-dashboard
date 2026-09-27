const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopSetup',{platform:process.platform,chooseProjectsFolder:()=>ipcRenderer.invoke('setup:folder')});
contextBridge.exposeInMainWorld('remoteDesktop',{
  ...Object.fromEntries(['status','save','remove','connect','disconnect','focus','fullscreen'].map(action=>[action,(...args)=>ipcRenderer.invoke('remote:'+action,...args)])),
  layout:input=>ipcRenderer.send('remote:layout',input),
  onStatus:callback=>{const fn=(_e,value)=>callback(value);ipcRenderer.on('remote:status',fn);return()=>ipcRenderer.removeListener('remote:status',fn);},
});
contextBridge.exposeInMainWorld('panelUpdates',Object.fromEntries(['status','configure','check','download','install'].map(action=>[action,(...args)=>ipcRenderer.invoke('updates:'+action,...args)])));
contextBridge.exposeInMainWorld('localTerminal', {
  open: input => ipcRenderer.invoke('terminal:open', input),
  snapshot: slot => ipcRenderer.invoke('terminal:snapshot', slot),
  list: () => ipcRenderer.invoke('terminal:list'),
  remove: slot => ipcRenderer.invoke('terminal:remove',slot),
  write: (id, data) => ipcRenderer.invoke('terminal:write', id, data),
  ack: (id, count) => ipcRenderer.send('terminal:ack', id, count),
  resize: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
  stop: id => ipcRenderer.invoke('terminal:stop', id),
  focus: focused => ipcRenderer.send('terminal:focus', focused),
  copy: text => ipcRenderer.invoke('terminal:copy', text),
  paste: () => ipcRenderer.invoke('terminal:paste'),
  onData: callback => { const listener = (_event, data) => callback(data); ipcRenderer.on('terminal:data', listener); return () => ipcRenderer.removeListener('terminal:data', listener); },
});

contextBridge.exposeInMainWorld('socialSurface', {
  mount: accountId => ipcRenderer.invoke('social:mount', accountId),
  layout: input => ipcRenderer.send('social:layout', input),
  close: () => ipcRenderer.send('social:close'),
  refresh: target => ipcRenderer.invoke('social:refresh', target),
  onStatus: callback => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('social:status', listener);
    return () => ipcRenderer.removeListener('social:status', listener);
  },
});
