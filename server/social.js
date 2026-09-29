export const DEFAULT_ACCOUNTS = [
  {
    id: "tiktok-lestitcheurfou",
    platform: "tiktok",
    handle: "lestitcheurfou",
    label: "LeStitcheurFou",
  },
  {
    id: "tiktok-sourires",
    platform: "tiktok",
    handle: "ledistributeurdesourire",
    label: "Le distributeur de sourires",
  },
  {
    id: "instagram-lestitcheur",
    platform: "instagram",
    handle: "lestitcheur",
    label: "LeStitcheur",
  },
  {
    id: "instagram-laholyfolle",
    platform: "instagram",
    handle: "laholyfolle",
    label: "La Holy Folle",
  },
];
export function validateAccounts(accounts) {
  if (!Array.isArray(accounts) || accounts.length > 12)
    throw new Error("Maximum 12 comptes sociaux.");
  const ids = new Set();
  return accounts.map((account) => {
    if (!/^[a-z0-9-]{1,60}$/.test(account.id) || ids.has(account.id) || account.id.startsWith("creator-") || account.id === "discord-personal")
      throw new Error("Identifiant de compte invalide.");
    ids.add(account.id);
    const handle = String(account.handle || "").replace(/^@/, "");
    if (
      !["instagram", "tiktok", "facebook", "youtube", "x"].includes(account.platform) ||
      !/^[a-zA-Z0-9_.-]{1,64}$/.test(handle)
    )
      throw new Error("Pseudo ou réseau invalide.");
    if (typeof account.label !== "string" || account.label.length > 80)
      throw new Error("Nom du compte invalide.");
    return {
      id: account.id,
      platform: account.platform,
      handle,
      label: account.label.trim() || handle,
    };
  });
}
export const SOCIAL_CATALOG = [
 {id:'instagram',name:'Instagram',home:'https://www.instagram.com/',help:'Utilise Créer pour publier une image ou une vidéo. Les statistiques dépendent du type de compte.'},
 {id:'tiktok',name:'TikTok',home:'https://www.tiktok.com/',help:'TikTok Studio permet de téléverser des vidéos. Pour les publications photo non proposées sur le Web, utilise l’application TikTok.'},
 {id:'facebook',name:'Facebook',home:'https://www.facebook.com/',help:'Choisis Photo/vidéo dans le compositeur. Pour une Page, sélectionne son identité avant de publier.'},
 {id:'youtube',name:'YouTube',home:'https://www.youtube.com/',help:'YouTube Studio permet de publier des vidéos. Les images passent par les posts de communauté, selon leur disponibilité sur ta chaîne.'},
 {id:'x',name:'X',home:'https://x.com/',help:'Utilise Publier puis ajoute tes images ou ta vidéo. Les limites dépendent de ton compte.'},
];
export const CREATOR_ACCOUNTS = [
 {id:'creator-chatgpt',platform:'chatgpt',label:'ChatGPT Images',handle:'images'},
 {id:'creator-suno',platform:'suno',label:'Suno',handle:'music'},
];
export function socialUrl(account, target = 'profile') {
 if(CREATOR_ACCOUNTS.some(a=>a.id===account.id&&a.platform===account.platform)) {
  if(!['create','home','profile','activity','analytics','messages','publish'].includes(target)) throw Error('Vue inconnue.');
  return account.platform==='chatgpt'?'https://chatgpt.com/':'https://suno.com/create';
 }
 account=validateAccounts([account])[0];
 const home=SOCIAL_CATALOG.find(p=>p.id===account.platform).home;
 const routes={home,profile:home,messages:home,activity:home,analytics:home,publish:home};
 if(account.platform==='instagram')Object.assign(routes,{profile:`${home}${account.handle}/`,messages:home+'direct/inbox/',activity:home+'accounts/activity/',analytics:home+'accounts/insights/'});
 if(account.platform==='tiktok')Object.assign(routes,{profile:home+'@'+account.handle,messages:home+'messages',analytics:home+'tiktokstudio/analytics',publish:home+'tiktokstudio/upload'});
 if(account.platform==='youtube')Object.assign(routes,{profile:home+'@'+account.handle,analytics:'https://studio.youtube.com/',publish:'https://www.youtube.com/upload'});
 if(account.platform==='x')Object.assign(routes,{profile:home+account.handle,messages:home+'messages',activity:home+'notifications'});
 if(!Object.hasOwn(routes,target))throw Error('Vue sociale inconnue.');
 return routes[target];
}
