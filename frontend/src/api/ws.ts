import type { WsMessage } from "@/types";
import { api } from "./client";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";

type MessageHandler = (msg: WsMessage) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private shouldReconnect = false;

  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      const { ticket } = await api.post<{ ticket: string }>(
        "/auth/ws-ticket"
      );
      this.ws = new WebSocket(`${WS_URL}?ticket=${ticket}`);
      this.shouldReconnect = true;

      this.ws.onopen = () => {
        this.reconnectDelay = 1000;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WsMessage;
          this.handlers.forEach((h) => h(data));
        } catch {
          console.warn("[WS] Malformed message");
        }
      };

      this.ws.onclose = () => {
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  send(data: WsMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        this.maxReconnectDelay
      );
      this.connect();
    }, this.reconnectDelay);
  }
}

export const wsClient = new WebSocketClient();
