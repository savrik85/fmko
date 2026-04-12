"use client";

import { useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API}/api/push/vapid-key`, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json() as { publicKey?: string };
    return data.publicKey ?? null;
  } catch (e) {
    console.error("PushNotificationManager: failed to fetch VAPID key:", e);
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function registerAndSubscribe(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

    const stored = localStorage.getItem("push_enabled");
    if (stored !== "true") return;

    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) return;

    const existing = await registration.pushManager.getSubscription();
    if (existing) return; // already subscribed

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    });

    await fetch(`${API}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(subscription.toJSON()),
    });
  } catch (e) {
    console.error("PushNotificationManager: registration failed:", e);
  }
}

export function PushNotificationManager() {
  useEffect(() => {
    registerAndSubscribe();
  }, []);

  return null;
}
