import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const png = new Resvg(await fs.readFile(new URL('public/emblem.svg', root)), {fitTo:{mode:'width',value:256}}).render().asPng();
await fs.writeFile(new URL('desktop/icon.png',root),png);
const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
await fs.writeFile(new URL('desktop/icon.ico',root),Buffer.concat([header,png]));
console.log('Emblème Windows généré.');
