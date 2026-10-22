/** Counts network bytes in each direction and turns them into KB/s for the dev overlay. */
export class TrafficMeter {
  private received = 0;
  private sent = 0;

  addReceived(bytes: number): void {
    this.received += bytes;
  }

  addSent(bytes: number): void {
    this.sent += bytes;
  }

  /** Average KB/s over the last `seconds`, then starts counting again. */
  sample(seconds: number): { downKBps: number; upKBps: number } {
    const perSecond = seconds > 0 ? 1 / (seconds * 1024) : 0;
    const rates = { downKBps: this.received * perSecond, upKBps: this.sent * perSecond };
    this.received = 0;
    this.sent = 0;
    return rates;
  }
}

/** Size in bytes of a WebSocket message (binary, or text as an estimate). */
export function byteSize(data: unknown): number {
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data.size;
  if (typeof data === 'string') return data.length;
  return 0;
}

const metered = new WeakSet<WebSocket>();

/**
 * Dev only: counts the bytes on a room's WebSocket. This reaches into the Colyseus SDK's
 * internals (`room.connection.transport.ws`), so it returns false instead of failing if they
 * change. Safe to call again after a reconnect (a new socket gets counted, an old one isn't
 * counted twice).
 */
export function meterRoomTraffic(room: { connection: unknown }, meter: TrafficMeter): boolean {
  const transport = (room.connection as { transport?: { ws?: unknown } } | null)?.transport;
  const ws = transport?.ws;
  if (typeof WebSocket === 'undefined' || !(ws instanceof WebSocket)) return false;
  if (metered.has(ws)) return true;
  metered.add(ws);
  ws.addEventListener('message', (event: MessageEvent) => meter.addReceived(byteSize(event.data)));
  const send = ws.send.bind(ws);
  ws.send = (data) => {
    meter.addSent(byteSize(data));
    send(data);
  };
  return true;
}
