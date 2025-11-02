# Acceso MIDI en IP Local

La **Web MIDI API** requiere HTTPS o localhost para funcionar. Si estás accediendo a la aplicación desde una IP local (ej: `192.168.0.101:3000`), necesitas usar HTTPS.

## Solución Rápida

### Paso 1: Iniciar el Bridge con HTTPS

```bash
cd bridge
npm run start:https
```

### Paso 2: Iniciar el Frontend con HTTPS

En otra terminal:

```bash
cd ui
npm run dev:https
```

El servidor HTTPS del frontend generará certificados automáticamente y los copiará al bridge.

### Paso 3: Acceder a la aplicación

Accede a:
- `https://localhost:3000` 
- `https://tu-ip-local:3000` (ej: `https://192.168.0.101:3000`)

El navegador mostrará una advertencia de seguridad. Debes:
1. Haz clic en **"Avanzado"** o **"Advanced"**
2. Haz clic en **"Continuar al sitio"** o **"Proceed to site"**
3. El certificado es autofirmado, pero es seguro para uso local

**Nota:** El frontend detectará automáticamente que está en HTTPS y se conectará al bridge usando HTTPS también.

## Generación Automática de Certificados

El script `server-https.js` intentará generar certificados automáticamente usando:
1. **mkcert** (recomendado) - Crea certificados confiables
2. **openssl** (fallback) - Crea certificados autofirmados

### Instalar mkcert (Recomendado)

**macOS:**
```bash
brew install mkcert
mkcert -install
```

**Windows:**
```bash
choco install mkcert
mkcert -install
```

**Linux:**
Ver instrucciones en: https://github.com/FiloSottile/mkcert

Una vez instalado, los certificados se generarán automáticamente la próxima vez que ejecutes `npm run dev:https`.

## Permiso Manual en Chrome (Alternativa)

Si no puedes usar HTTPS, puedes permitir MIDI manualmente en Chrome:

1. Abre `chrome://settings/content/midiDevices`
2. Busca tu IP local (ej: `192.168.0.101:3000`)
3. Cambia "MIDI device control & reprogram" de "Block" a "Allow"

O directamente:
1. Abre `chrome://settings/content/siteDetails?site=http://192.168.0.101:3000`
2. Cambia "MIDI device control & reprogram" a "Allow"

⚠️ **Nota:** Esta opción requiere configuración manual cada vez y puede no funcionar en todos los navegadores.

## Verificación

Para verificar que MIDI funciona:
1. Conecta tu controlador MIDI
2. Abre la consola del navegador (F12)
3. Haz clic en "Map" en cualquier strip
4. Deberías ver logs como:
   ```
   [MIDI Mapping] Input disponible: [nombre del dispositivo]
   [MIDI] Mensaje recibido...
   ```

Si ves `[MIDI] Web MIDI API no está disponible`, significa que el navegador no tiene acceso MIDI. Usa HTTPS como se describe arriba.

