require('dotenv').config();
const osc = require('osc');

const XR18_IP = process.env.XR18_IP;
if (!XR18_IP) {
  console.error('XR18_IP is not set in .env');
  process.exit(1);
}

const XR18_PORT = 10024;
const LOCAL_PORT = 12000;

const udpPort = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: LOCAL_PORT,
  remoteAddress: XR18_IP,
  remotePort: XR18_PORT,
  metadata: true
});

function checkReachability() {
  return new Promise((resolve, reject) => {
    let responded = false;
    udpPort.on('message', msg => {
      if (!responded && [
        '/xinfo', '/info', '/status', '/ch/01/mix/fader'
      ].includes(msg.address)) {
        responded = true;
        console.log(`[OSC] Received ${msg.address}:`, msg.args.map(a => a.value).join(' | '));
        resolve();
      } else {
        console.log('[OSC] Received message:', msg.address, msg.args.map(a => a.value).join(' | '));
      }
    });
    udpPort.on('ready', () => {
      console.log(`[OSC] UDP socket opened on port ${LOCAL_PORT}`);
      setTimeout(() => {
        console.log(`[OSC] Sending /status to ${XR18_IP}:${XR18_PORT}`);
        udpPort.send({ address: '/status', args: [] });
      }, 100);
      setTimeout(() => {
        console.log(`[OSC] Sending /info to ${XR18_IP}:${XR18_PORT}`);
        udpPort.send({ address: '/info', args: [] });
      }, 250);
      setTimeout(() => {
        console.log(`[OSC] Sending /ch/01/mix/fader to ${XR18_IP}:${XR18_PORT}`);
        udpPort.send({ address: '/ch/01/mix/fader', args: [] });
      }, 400);
    });
    udpPort.open();
    setTimeout(() => {
      if (!responded) {
        reject(new Error('XR18 not reachable at ' + XR18_IP));
      }
    }, 1200);
  });
}

checkReachability()
  .then(() => {
    console.log('XR18 reachable at', XR18_IP);
    // Express + socket.io skeleton
    const express = require('express');
    const fs = require('fs');
    const path = require('path');
    const { Server } = require('socket.io');

    const app = express();
    
    // Determinar si usar HTTPS basado en variable de entorno
    const useHttps = process.env.USE_HTTPS === 'true';
    let server;
    
    if (useHttps) {
      const https = require('https');
      const certDir = path.join(__dirname, '.cert');
      const keyPath = path.join(certDir, 'localhost-key.pem');
      const certPath = path.join(certDir, 'localhost.pem');
      
      if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        console.error('ERROR: Certificados HTTPS no encontrados en', certDir);
        console.error('Ejecuta el servidor HTTPS del frontend primero para generar los certificados,');
        console.error('o crea los certificados manualmente.');
        process.exit(1);
      }
      
      const options = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };
      
      server = https.createServer(options, app);
      console.log('🔒 Servidor HTTPS habilitado');
    } else {
      const http = require('http');
      server = http.createServer(app);
      console.log('📡 Servidor HTTP habilitado');
    }
    
    const io = new Server(server, {
      cors: { origin: '*', methods: ['GET', 'POST'] }
    });

    app.get('/', (req, res) => {
      res.send('Bridge running');
    });

    // Param registry: { socketId -> Set<oscAddress> }
    const paramRegistry = new Map();

    // Throttle engine: agrupa cambios por socketId+address a 16ms (~60fps para respuesta fluida)
    const throttleBuckets = new Map(); // key: `${socketId}|${address}` -> timeout
    const lastValues = new Map(); // key: `${socketId}|${address}` -> value

    io.on('connection', socket => {
      console.log(`[WS] Client connected: ${socket.id}`);
      paramRegistry.set(socket.id, new Set());

      socket.on('add-param', async ({ address }) => {
        if (typeof address !== 'string') return;
        paramRegistry.get(socket.id).add(address);
        console.log(`[WS] ${socket.id} subscribed to ${address}`);
        // Snapshot inmediato: pedir valor actual a la XR-18
        try {
          const value = await requestOscValue(address);
          socket.emit('snapshot', [{ address, value }]);
          console.log(`[WS] Sent snapshot to ${socket.id}: ${address} = ${value}`);
        } catch (err) {
          console.log(`[WS] Snapshot failed for ${address}:`, err.message);
        }
      });

      socket.on('remove-param', ({ address }) => {
        if (typeof address !== 'string') return;
        paramRegistry.get(socket.id).delete(address);
        console.log(`[WS] ${socket.id} unsubscribed from ${address}`);
      });

      socket.on('set-param', ({ address, value }) => {
        if (typeof address !== 'string' || typeof value !== 'number') return;
        const key = `${socket.id}|${address}`;
        lastValues.set(key, value);
        if (!throttleBuckets.has(key)) {
          throttleBuckets.set(key, setTimeout(() => {
            const v = lastValues.get(key);
            // Enviar a la XR-18
            udpPort.send({ address, args: [ { type: 'f', value: v } ] });
            console.log(`[OSC] Sent to XR-18: ${address} = ${v}`);
            throttleBuckets.delete(key);
          }, 16)); // 16ms = ~60fps para respuesta fluida
        }
      });

      socket.on('get-color', async ({ colorAddress }) => {
        if (typeof colorAddress !== 'string') return;
        try {
          const color = await requestOscValue(colorAddress);
          // El color debe ser un entero 0-15
          const colorInt = Math.round(color);
          socket.emit('color-response', { colorAddress, color: colorInt });
          console.log(`[WS] Sent color to ${socket.id}: ${colorAddress} = ${colorInt}`);
        } catch (err) {
          console.log(`[WS] Color request failed for ${colorAddress}:`, err.message);
          socket.emit('color-response', { colorAddress, color: null });
        }
      });

      socket.on('disconnect', () => {
        console.log(`[WS] Client disconnected: ${socket.id}`);
        
        // Limpiar timeouts pendientes de throttle
        const subscribedAddresses = paramRegistry.get(socket.id) || new Set();
        for (const address of subscribedAddresses) {
          const key = `${socket.id}|${address}`;
          const timeout = throttleBuckets.get(key);
          if (timeout) {
            clearTimeout(timeout);
            throttleBuckets.delete(key);
          }
          // Limpiar lastValues también
          lastValues.delete(key);
        }
        
        paramRegistry.delete(socket.id);
      });
    });

    // Feedback loop: reenviar OSC de XR-18 a clientes suscritos
    udpPort.on('message', msg => {
      const address = msg.address;
      if (typeof address !== 'string') return;
      // Solo reenviar si es un address relevante (ej: /ch/xx/mix/fader, etc)
      if (msg.args && msg.args.length > 0 && typeof msg.args[0].value === 'number') {
        const value = msg.args[0].value;
        // Broadcast selectivo
        for (const [socketId, addrSet] of paramRegistry.entries()) {
          if (addrSet.has(address)) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
              socket.emit('xr18-update', { address, value });
              console.log(`[WS] Broadcast to ${socketId}: ${address} = ${value}`);
            }
          }
        }
      }
    });

    // Estado de XR-18 online/offline
    let xr18Online = true;
    let missedKeepAlives = 0;
    const MAX_MISSED = 3;

    function notifyStatus(online) {
      if (online) {
        console.log('[XR18] ONLINE');
      } else {
        console.log('[XR18] OFFLINE');
      }
      io.emit('xr18-status', { online });
    }

    // Keep-alive: enviar /status y /xremote cada 1s y chequear respuesta
    let lastStatusTs = Date.now();
    setInterval(() => {
      udpPort.send({ address: '/status', args: [] });
      udpPort.send({ address: '/xremote', args: [] });
      console.log('[OSC] Keep-alive: sent /status and /xremote');
      // Chequear si hubo respuesta reciente
      if (Date.now() - lastStatusTs > 2000) {
        missedKeepAlives++;
        if (xr18Online && missedKeepAlives >= MAX_MISSED) {
          xr18Online = false;
          notifyStatus(false);
        }
      } else {
        missedKeepAlives = 0;
      }
    }, 1000);

    const PORT = 4000;
    const protocol = useHttps ? 'https' : 'http';
    server.listen(PORT, () => {
      console.log(`Bridge listening on ${protocol}://0.0.0.0:${PORT}`);
    });
  })
  .catch(err => {
    console.error(err.message);
    process.exit(1);
  });

// Función para pedir valor actual a la XR-18 y esperar respuesta
function requestOscValue(address) {
  return new Promise((resolve, reject) => {
    let timeout;
    const handler = msg => {
      if (msg.address === address && msg.args && msg.args.length > 0) {
        udpPort.removeListener('message', handler);
        clearTimeout(timeout);
        // Soporte para float (fader), int/bool (mute/on)
        const arg = msg.args[0];
        if (arg.type === 'f' || arg.type === 'i') {
          resolve(arg.value);
        } else if (arg.type === 'T') {
          resolve(true);
        } else if (arg.type === 'F') {
          resolve(false);
        } else {
          resolve(arg.value);
        }
      }
    };
    udpPort.on('message', handler);
    udpPort.send({ address, args: [] });
    timeout = setTimeout(() => {
      udpPort.removeListener('message', handler);
      reject(new Error('Timeout waiting for OSC response'));
    }, 500);
  });
}
