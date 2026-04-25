type EventHandler = (payload: any) => void;

export class EventBus {
  private listeners: Map<string, EventHandler[]> = new Map();

  on(event: string, handler: EventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(handler);
  }

  emit(event: string, payload: any) {
    const handlers = this.listeners.get(event) || [];
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error in handler for event ${event}:`, err);
      }
    }
  }
}
