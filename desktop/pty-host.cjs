// Isolate native ConPTY and its worker handles from the Electron main process.
const pty = require('node-pty');
let terminal;
const send = value => { if (process.connected) process.send(value); };
process.on('message', message => {
  try {
    if (message.type === 'spawn') {
      terminal = pty.spawn(message.file, message.args, message.options);
      terminal.onData(data => send({type:'data',data}));
      terminal.onExit(event => {send({type:'exit',...event});setTimeout(()=>process.exit(0),25);});
    } else if(message.type === 'write') terminal?.write(message.data);
    else if(message.type === 'resize') terminal?.resize(message.cols,message.rows);
    else if(message.type === 'pause') terminal?.pause();
    else if(message.type === 'resume') terminal?.resume();
    else if(message.type === 'kill') { terminal?.kill();setTimeout(()=>process.exit(0),1800); }
  } catch { send({type:'data',data:'\r\nImpossible de démarrer ou de piloter PowerShell.\r\n'});send({type:'exit',exitCode:1});process.exitCode=1;setTimeout(()=>process.exit(1),25); }
});
process.on('disconnect',()=>{try{terminal?.kill();}finally{setTimeout(()=>process.exit(0),1800);}});
