**XR-18 Live-Mix Web Control – Product Spec Sheet (v 0.9)**
*(para entregar al equipo de desarrollo)*

---

## 1. Visión general

| Item                    | Detalle                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Objetivo**            | Controlar mezcla **en vivo** de una Behringer **XR-18** desde hasta **5 navegadores** dentro de una red Wi-Fi cerrada. |
| **Rol de la consola**   | La XR-18 es el *server OSC* (UDP 10024). La app sólo actúa como *bridge* y UI.                                         |
| **Plataformas cliente** | Navegadores modernos (Chromium/WebKit/Firefox) en **móvil** y desktop.                                                 |
| **Internet**            | **No**. La LAN está totalmente aislada.                                                                                |
| **Límites de latencia** | < **100 ms** E2E (UI ↔ XR-18).                                                                                         |
| **Usuarios**            | Máx. 5 simultáneos, sin autenticación.                                                                                 |

---

## 2. Arquitectura

```
┌─────────────────────────────┐
│ Browser UI (React + TS)     │
│ • WebSocket (socket.io-client) ────────┐
│ • Web MIDI API (opcional)             │
└─────────────────────────────┘          │
                                         │ WSS (LAN, :4000)
┌─────────────────────────────┐          │
│ Node/Express “Bridge”       │<─────────┘
│ • socket.io server          │
│ • osc UDPPort (local :12000)│───── UDP OSC → XR-18 (10024)
│ • Throttle 100 ms           │
│ • Per-client param registry │
│ • Optional OSC API in (:9000) for ext. SW ↔───── OSC
└─────────────────────────────┘
```

### 2.1. Módulos principales

| Módulo               | Responsabilidad                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Web UI**           | Renderizar sliders + VU; permitir que cada usuario *añada* o *quite* parámetros a su Workspace.                |
| **Param Registry**   | Estructura en memoria `{ socketId → Set<oscAddress> }`. Sólo re-emite updates a sockets que están suscritos.   |
| **Throttle Engine**  | Agrupa cambios por socketId+address a **100 ms**; envía sólo el último valor del lote al XR-18 y al broadcast. |
| **OSC Bridge**       | • UDP fijo (local :12000) para recibir feedback de la consola. • Keep-alive `/xremote` cada 5 s.               |
| **MIDI Handler**     | En cliente; mapea mensajes MIDI CC/Note → `set-param` vía WebSocket.                                           |
| **External OSC API** | (Opc.) Servidor OSC en :9000 expuesto por Node para que otro software lan-local dispare `/set <addr> <val>`.   |

---

## 3. Flujo operacional

1. **Boot**

   * Al abrir `http://<bridge-ip>:4000` se muestra un *splash* para ingresar la **IP de la XR-18** → guardada en `sessionStorage`.
2. **Handshake**

   * El cliente envía `join {ip}` → servidor responde con `joined`.
3. **Workspace**

   * El usuario toca **“Add control”** → elige un address (`/ch/01/mix/fader`, etc.).
   * El cliente envía `add-param {address}`; el servidor agrega al *registry* y devuelve el **snapshot** actual *(pull inmediato a la XR-18 si no existe en cache)*.
4. **Control**

   * Mover slider dispara `localUIUpdate` (suavidad total).
   * Se invoca `set-param {address, value}` → entra al Throttle 100 ms → envía OSC → re-emite `xr18-update` a clientes suscritos.
   * Consola envía feedback → Bridge → `xr18-update` → UI se asegura de quedar alineada.
5. **Disconnect**

   * El servidor limpia la entrada `registry[socketId]`.

---

## 4. Requisitos funcionales

| ID       | Descripción                                                         | Prioridad |
| -------- | ------------------------------------------------------------------- | --------- |
| **F-01** | Conexión sin login; basta con estar en la misma LAN.                | Must      |
| **F-02** | Input para la IP de la XR-18 (persistente por pestaña).             | Must      |
| **F-03** | Añadir/Eliminar controles dinamicamente por dispositivo.            | Must      |
| **F-04** | Sliders y VU meters actualizados en tiempo real (<100 ms).          | Must      |
| **F-05** | Throttle a 100 ms por control y usuario.                            | Must      |
| **F-06** | Broadcast selectivo (solo a suscriptores).                          | Must      |
| **F-07** | Compatibilidad con Web MIDI → OSC (mapping JSON local).             | Should    |
| **F-08** | Exponer puerto OSC local :9000 (`/set`, `/get`) para integraciones. | Should    |
| **F-09** | Consola de logs en vivo (panel ocultable).                          | Should    |
| **F-10** | Guardado de escena / presets.                                       | Future    |

---

## 5. Requisitos no funcionales

| Área              | Meta                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| **Desempeño**     | ≤ 10 ms (cliente → bridge) + ≤ 50 ms (bridge → XR-18) en 5 usuarios.                                      |
| **Confiabilidad** | Reintento de socket.io y UDP hasta 5 veces antes de marcar XR-18 como *offline*.                          |
| **Seguridad**     | Tráfico HTTP/WSS plano aceptado (LAN aislada). Sin CORS restrictivo.                                      |
| **Portabilidad**  | Node ≥ 20; sin dependencias nativas para facilitar empaquetar en un `.exe` (pkg / Electron **opcional**). |

---

## 6. Detalles de implementación

### 6.1. Tecnologías

* **Backend**: Node + Express + socket.io (v 4), osc (**node-osc** o **osc-js**).
* **Frontend**: Next.js 14 (App Router), React 18, Zustand (global state), Tailwind.
* **Bundling**: `turbo` monorepo opcional.
* **Empaquetado offline**: `pkg` / `nexe` para generar ejecutable Win/Mac.

### 6.2. Eventos WebSocket

| Evento         | Payload                              | Emisor → Receptor      |
| -------------- | ------------------------------------ | ---------------------- |
| `join`         | `{ ip: string }`                     | Client → Server        |
| `add-param`    | `{ address: string }`                | Client → Server        |
| `remove-param` | `{ address: string }`                | Client → Server        |
| `set-param`    | `{ address: string, value: number }` | Client → Server        |
| `xr18-update`  | `{ address, value }`                 | Server → *Subscribers* |
| `snapshot`     | `{ address, value }[]`               | Server → Client        |

### 6.3. Throttle pseudocódigo

```ts
const buckets = new Map<string, NodeJS.Timeout>();

function handleSetParam(sockId, addr, val) {
  const key = `${sockId}|${addr}`;
  lastVal[key] = val;
  if (!buckets.has(key)) {
    buckets.set(key, setTimeout(() => {
      const v = lastVal[key];
      sendOsc(addr, v);
      io.emit('xr18-update', { address: addr, value: v });
      buckets.delete(key);
    }, 100 /* ms */));
  }
}
```

### 6.4. MIDI mapping (cliente)

```ts
const midiMap = {
  'cc:12': '/ch/01/mix/fader',
  'noteon:60': '/ch/01/mix/on',
  // editable via UI (localStorage)
};
navigator.requestMIDIAccess().then(ac => {
  ac.inputs.forEach(inp => {
    inp.onmidimessage = ev => {
      const key = `${ev.data[0] & 0xf0 === 0x90 ? 'noteon':'cc'}:${ev.data[1]}`;
      const addr = midiMap[key];
      if (addr) socket.emit('set-param',{address: addr, value: parseMidi(ev)});
    };
  });
});
```

---

## 7. Entregables

1. **Repo Git** con dos carpetas `/bridge` (Node) y `/ui` (Next.js) o monorepo.
2. Script `npm run dev` que arranque ambos (con `concurrently`).
3. **README**: instalación, mapeo de puertos, troubleshooting XR-18.
4. Ejecutable “one-click” Windows (.exe) *opcional*.

---

## 8. Pendientes / decisiones abiertas

| Código   | Pregunta                                                                                                | Necesita decisión |
| -------- | ------------------------------------------------------------------------------------------------------- | ----------------- |
| **P-01** | ¿Se guardará config de *mappings MIDI* y *workspaces* en `localStorage` o en archivo JSON en el bridge? | Sí                |
| **P-02** | ¿Conviene empaquetar un `.pwa` para instalación offline?                                                | Evaluar           |
| **P-03** | ¿Se soportarán envíos de FX y EQ en la primera versión?                                                 | Definir           |

---

Con este documento el developer dispone de una guía completa para iniciar la construcción del MVP. Cualquier aclaración o ajuste que surja, lo iteramos.
