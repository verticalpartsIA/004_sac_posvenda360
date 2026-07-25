// Rastro de acesso cross-sistema: emite eventos "enter"/"exit" para a edge
// function pública do portal central (vpsistema), que agrega uma timeline de
// quando cada colaborador entra e sai de cada sistema satélite.
//
// Fire-and-forget por design: nunca deve travar nem quebrar a UI se o
// endpoint estiver fora do ar, com CORS bloqueado, ou se a env var da chave
// não estiver configurada (nesse caso as funções são no-op silencioso).
//
// Endpoint: https://ubdkoqxfwcraftesgmbw.supabase.co/functions/v1/track-activity
// (projeto Supabase do portal vpsistema — não confundir com o Supabase deste app)

const TRACK_ACTIVITY_URL = "https://ubdkoqxfwcraftesgmbw.supabase.co/functions/v1/track-activity";

const APP_KEY = "posvenda360";

const SESSION_STORAGE_KEY = "vp_track_activity_session_id";

type TrackEventType = "enter" | "exit";

interface TrackActivityPayload {
  app: string;
  event_type: TrackEventType;
  user_email: string;
  user_name: string;
  session_id: string;
  track_key: string;
}

function getTrackKey(): string | null {
  const key = import.meta.env.VITE_TRACK_ACTIVITY_KEY as string | undefined;
  return key && key.trim().length > 0 ? key : null;
}

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(SESSION_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // sessionStorage indisponível (modo privado etc.) — gera um id efêmero,
    // válido apenas para esta chamada.
    return crypto.randomUUID();
  }
}

function peekSessionId(): string | null {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function buildPayload(
  eventType: TrackEventType,
  userEmail: string,
  userName: string,
  sessionId: string,
  trackKey: string,
): TrackActivityPayload {
  return {
    app: APP_KEY,
    event_type: eventType,
    user_email: userEmail,
    user_name: userName,
    session_id: sessionId,
    track_key: trackKey,
  };
}

/**
 * Deve ser chamada uma única vez, assim que a sessão autenticada resolver
 * (não antes disso, e nunca em loop/a cada render).
 */
export function trackEnter(userEmail: string, userName: string): void {
  try {
    const trackKey = getTrackKey();
    if (!trackKey || !userEmail) return;

    const sessionId = getOrCreateSessionId();
    const payload = buildPayload("enter", userEmail, userName, sessionId, trackKey);

    // Fire-and-forget: não bloqueia render, erros são silenciados.
    fetch(TRACK_ACTIVITY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Falha de rede/CORS/endpoint fora do ar — ignorada intencionalmente.
    });
  } catch {
    // Nunca deixar o rastro de acesso quebrar a aplicação.
  }
}

/**
 * Deve ser registrada em um listener de `pagehide` (preferível a
 * `beforeunload` por causa do bfcache). Reusa o session_id já gerado por
 * trackEnter; se nenhuma sessão de rastreio foi iniciada, não faz nada.
 */
export function trackExit(userEmail: string, userName: string): void {
  try {
    const trackKey = getTrackKey();
    if (!trackKey || !userEmail) return;

    const sessionId = peekSessionId();
    if (!sessionId) return;

    const payload = buildPayload("exit", userEmail, userName, sessionId, trackKey);

    if (typeof navigator.sendBeacon === "function") {
      // sendBeacon não aceita headers customizados — por isso o track_key
      // vai no corpo do payload.
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon(TRACK_ACTIVITY_URL, blob);
    } else {
      // Fallback para navegadores sem sendBeacon: fetch com keepalive.
      fetch(TRACK_ACTIVITY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Nunca deixar o rastro de acesso quebrar a aplicação.
  }
}
