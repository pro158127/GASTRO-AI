import type { AnalisisEvent } from "../types";

export function subscribeAnalisis(
  id: string,
  onMessage: (data: AnalisisEvent) => void
): () => void {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(
    `${proto}://${window.location.host}/ws/analisis/${id}`
  );

  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data) as AnalisisEvent);
    } catch {
      // Ignore malformed frames.
    }
  };

  return () => ws.close();
}
