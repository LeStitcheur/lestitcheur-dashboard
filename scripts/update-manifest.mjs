import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {version}=JSON.parse(await fs.readFile('package.json','utf8'));
const name=`LeStitcheur-Control-Setup-${version}.exe`,data=await fs.readFile('release/'+name),sha512=createHash('sha512').update(data).digest('base64');
await fs.writeFile('release/latest.yml',`version: ${version}\nfiles:\n  - url: ${name}\n    sha512: ${sha512}\n    size: ${data.length}\npath: ${name}\nsha512: ${sha512}\nreleaseDate: '${new Date().toISOString()}'\nreleaseNotes: 'Comptes sociaux personnalisables, publication officielle, studios ChatGPT et Suno, nouvelle connexion et déconnexion Discord.'\n`);
await fs.writeFile('release/PUBLICATION.txt','Publier latest.yml, le Setup .exe et son .blockmap ensemble dans le même dossier HTTPS. Configurer cette adresse dans Mon espace > Mises à jour. Aucune publication effectuée automatiquement.\n');
