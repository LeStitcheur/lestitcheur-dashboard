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
    if (!/^[a-z0-9-]{1,60}$/.test(account.id) || ids.has(account.id))
      throw new Error("Identifiant de compte invalide.");
    ids.add(account.id);
    const handle = String(account.handle || "").replace(/^@/, "");
    if (
      !["instagram", "tiktok"].includes(account.platform) ||
      !/^[a-zA-Z0-9_.]{1,32}$/.test(handle)
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
export function socialUrl(account, target = "profile") {
  account = validateAccounts([account])[0];
  const routes =
    account.platform === "instagram"
      ? {
          home: "https://www.instagram.com/",
          profile: `https://www.instagram.com/${account.handle}/`,
          messages: "https://www.instagram.com/direct/inbox/",
          activity: "https://www.instagram.com/accounts/activity/",
          analytics: "https://www.instagram.com/accounts/insights/",
        }
      : {
          home: "https://www.tiktok.com/",
          profile: `https://www.tiktok.com/@${account.handle}`,
          messages: "https://www.tiktok.com/messages",
          activity: "https://www.tiktok.com/",
          analytics: "https://www.tiktok.com/tiktokstudio/analytics",
        };
  if (!Object.hasOwn(routes, target)) throw new Error("Vue sociale inconnue.");
  return routes[target];
}
