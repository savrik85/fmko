/**
 * Upozornění do telefonu (web push): zjištění podpory, zapnutí, vypnutí a obnova odběru.
 *
 * Zapnout jde jen kliknutím (prohlížeč jinak žádost o povolení zahodí, iPhone vždycky).
 * Po startu aplikace se odběr jen obnoví, o povolení se tam nikdy nežádá.
 */

import { apiFetch } from "@/lib/api";

export type PushAvailability = "supported" | "ios_install" | "unsupported";
export type EnablePushResult = "enabled" | "denied" | "dismissed" | "unsupported" | "failed";

const ENABLED_KEY = "push_enabled";
const SYNC_KEY = "push_synced";
const SYNC_EVERY_MS = 24 * 3600 * 1000;

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS se hlásí jako Mac, pozná se podle dotykové obrazovky.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Jde tady upozornění zapnout? Na iPhonu jen v Pralesu přidaném na plochu. */
export function pushAvailability(): PushAvailability {
  if (typeof window === "undefined") return "unsupported";
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "supported";
  return isIos() && !isStandalone() ? "ios_install" : "unsupported";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from([...atob(base64)].map((c) => c.charCodeAt(0)));
}

async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  // Odběr potřebuje aktivní service worker, čerstvě registrovaný se teprve instaluje.
  return navigator.serviceWorker.ready;
}

async function subscribe(reg: ServiceWorkerRegistration): Promise<PushSubscription> {
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  const { publicKey } = await apiFetch<{ publicKey: string }>("/api/push/vapid-key");
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  await apiFetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  const token = localStorage.getItem("om_token") ?? "";
  localStorage.setItem(ENABLED_KEY, "true");
  localStorage.setItem(SYNC_KEY, JSON.stringify({ token: token.slice(0, 12), at: Date.now() }));
}

/** Odběr, který má tenhle prohlížeč, nebo `null`. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (pushAvailability() !== "supported") return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Zapne upozornění. Volat jen z kliknutí. */
export async function enablePush(): Promise<EnablePushResult> {
  if (pushAvailability() !== "supported") return "unsupported";
  try {
    // Žádost o povolení musí jít hned z kliknutí, před čímkoli dalším, jinak ji Safari zahodí.
    const permission = await Notification.requestPermission();
    if (permission === "denied") return "denied";
    if (permission !== "granted") return "dismissed";
    const reg = await activeRegistration();
    await saveSubscription(await subscribe(reg));
    return "enabled";
  } catch (e) {
    console.error("Zapnutí upozornění selhalo:", e);
    return "failed";
  }
}

/** Vypne upozornění v tomhle prohlížeči. Chybu nechá volajícímu. */
export async function disablePush(): Promise<void> {
  const sub = await currentPushSubscription();
  if (sub) {
    await apiFetch("/api/push/unsubscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  }
  localStorage.setItem(ENABLED_KEY, "false");
}

/**
 * Po startu aplikace pošle serveru odběr, který prohlížeč má. Server ho mohl smazat
 * (push služba hlásila 410), nebo se v prohlížeči přihlásil jiný klub. Jednou denně
 * a po každém novém přihlášení; o povolení nežádá.
 */
export async function syncPushSubscription(): Promise<void> {
  if (pushAvailability() !== "supported" || Notification.permission !== "granted") return;
  const token = localStorage.getItem("om_token");
  if (!token) return;
  try {
    const last = JSON.parse(localStorage.getItem(SYNC_KEY) ?? "null") as { token?: string; at?: number } | null;
    if (last?.token === token.slice(0, 12) && Date.now() - (last.at ?? 0) < SYNC_EVERY_MS) return;
  } catch (e) {
    console.warn("Upozornění: neplatný záznam o obnově odběru:", e);
  }
  const reg = await activeRegistration();
  const existing = await reg.pushManager.getSubscription();
  // Kdo si upozornění v Nastavení vypnul, tomu je potichu znovu nezapínat.
  if (!existing && localStorage.getItem(ENABLED_KEY) !== "true") return;
  await saveSubscription(existing ?? await subscribe(reg));
}
