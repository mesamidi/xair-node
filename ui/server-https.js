// Servidor HTTPS personalizado para Next.js que permite Web MIDI API en IPs locales
const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

// Ruta para los certificados
const certDir = path.join(__dirname, '.cert');
const keyPath = path.join(certDir, 'localhost-key.pem');
const certPath = path.join(certDir, 'localhost.pem');

// Obtener IP local automáticamente
function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Crear certificados si no existen
function ensureCertificates() {
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.log('📜 No se encontraron certificados. Generando...\n');
    
    const localIP = getLocalIP();
    console.log(`Detectada IP local: ${localIP}\n`);

    // Intentar usar mkcert primero (mejor opción)
    try {
      console.log('Intentando usar mkcert (recomendado)...');
      execSync('mkcert --version', { stdio: 'ignore' });
      console.log('✓ mkcert encontrado');
      execSync(`mkcert -install`, { stdio: 'inherit' });
      execSync(`mkcert -key-file "${keyPath}" -cert-file "${certPath}" localhost 127.0.0.1 ${localIP} ::1`, { stdio: 'inherit' });
      console.log('✓ Certificados generados con mkcert (confiables por el navegador)\n');
      return;
    } catch (error) {
      console.log('mkcert no disponible, intentando openssl...\n');
    }

    // Fallback a openssl
    try {
      console.log('Generando certificado autofirmado con openssl...');
      const opensslCommand = `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" -addext "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:${localIP}"`;
      execSync(opensslCommand, { stdio: 'inherit' });
      console.log('✓ Certificados autofirmados generados\n');
    } catch (error) {
      console.error('\n❌ Error: No se pudo generar certificados automáticamente.\n');
      console.error('Opciones:');
      console.error('1. Instala mkcert (recomendado):');
      console.error('   macOS: brew install mkcert');
      console.error('   Windows: choco install mkcert');
      console.error('   Linux: Ver https://github.com/FiloSottile/mkcert\n');
      console.error('2. Instala openssl y ejecuta:');
      console.error(`   openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"`);
      console.error('\n3. O usa localhost en lugar de IP local para desarrollo\n');
      process.exit(1);
    }
  } else {
    console.log('✓ Certificados encontrados\n');
  }
}

// Verificar y generar certificados
ensureCertificates();

// Copiar certificados al bridge si existe
function copyCertsToBridge() {
  const bridgeCertDir = path.join(__dirname, '..', 'bridge', '.cert');
  if (!fs.existsSync(path.join(__dirname, '..', 'bridge'))) {
    return; // Bridge no existe en la estructura esperada
  }
  
  if (!fs.existsSync(bridgeCertDir)) {
    fs.mkdirSync(bridgeCertDir, { recursive: true });
  }
  
  try {
    fs.copyFileSync(keyPath, path.join(bridgeCertDir, 'localhost-key.pem'));
    fs.copyFileSync(certPath, path.join(bridgeCertDir, 'localhost.pem'));
    console.log('✓ Certificados copiados al bridge\n');
  } catch (error) {
    console.log('⚠️  No se pudieron copiar certificados al bridge (continúa sin problemas)\n');
  }
}

copyCertsToBridge();

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };

  createServer(options, async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, hostname, (err) => {
    if (err) throw err;
    const localIP = getLocalIP();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🚀 Servidor HTTPS iniciado');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n📍 URLs disponibles:`);
    console.log(`   • https://localhost:${port}`);
    console.log(`   • https://127.0.0.1:${port}`);
    if (localIP !== '127.0.0.1') {
      console.log(`   • https://${localIP}:${port}`);
    }
    console.log('\n⚠️  IMPORTANTE:');
    console.log('   El navegador mostrará una advertencia de seguridad.');
    console.log('   Para habilitar MIDI:');
    console.log('   1. Haz clic en "Avanzado" o "Advanced"');
    console.log('   2. Haz clic en "Continuar al sitio" o "Proceed to site"');
    console.log('   3. Acepta el certificado autofirmado\n');
    console.log('═══════════════════════════════════════════════════════════\n');
  });
});

