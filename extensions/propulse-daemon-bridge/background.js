const connections = new Map();

function closeWs(entry) {
  if (!entry?.ws) return;
  try {
    entry.ws.close(1000, "Client disconnect");
  } catch {
    // ignore
  }
  entry.ws = null;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "propulse-daemon-bridge") return;

  const entry = { ws: null, sessionId: null };
  connections.set(port, entry);

  const post = (msg) => {
    try {
      port.postMessage(msg);
    } catch {
      // ignore
    }
  };

  port.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object") return;
    const { type, url, text, sessionId } = msg;

    if (type === "connect") {
      entry.sessionId = sessionId ?? null;
      closeWs(entry);

      try {
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        entry.ws = ws;

        ws.onopen = () => post({ type: "open", sessionId: entry.sessionId });
        ws.onclose = (e) =>
          post({
            type: "close",
            sessionId: entry.sessionId,
            code: e.code,
            reason: e.reason || "",
          });
        ws.onerror = () => post({ type: "error", sessionId: entry.sessionId, message: "WebSocket error" });
        ws.onmessage = (e) => {
          const data = e.data;
          if (typeof data === "string") {
            post({ type: "message", sessionId: entry.sessionId, text: data });
            return;
          }
          if (data instanceof ArrayBuffer) {
            post({ type: "binary", sessionId: entry.sessionId, data });
          }
        };
      } catch (err) {
        post({ type: "error", sessionId: entry.sessionId, message: String(err || "Failed to connect") });
      }
      return;
    }

    if (type === "disconnect") {
      closeWs(entry);
      post({ type: "close", sessionId: entry.sessionId, code: 1000, reason: "Disconnected" });
      return;
    }

    if (type === "send") {
      if (!entry.ws || entry.ws.readyState !== WebSocket.OPEN) return;
      try {
        entry.ws.send(text);
      } catch {
        // ignore
      }
    }
  });

  port.onDisconnect.addListener(() => {
    closeWs(entry);
    connections.delete(port);
  });
});

