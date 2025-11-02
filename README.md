# OSC Control Interface

Interfaz web para controlar un mixer Behringer XR-18 mediante protocolo OSC (Open Sound Control). Incluye mapeo MIDI y organización por páginas.

## Estructura del Proyecto

- **`/bridge`**: Servidor Node.js que actúa como puente entre la UI web y el mixer XR-18 mediante OSC
- **`/ui`**: Aplicación Next.js/React que proporciona la interfaz de usuario

## Requisitos Previos

- Node.js (versión 16 o superior)
- npm o pnpm
- Un mixer Behringer XR-18 conectado a la misma red

## Instalación

### 1. Instalar dependencias del Bridge

```bash
cd bridge
npm install
```

### 2. Instalar dependencias de la UI

```bash
cd ui
npm install
# o si usas pnpm:
pnpm install
```

## Uso

### Desarrollo (Recomendado: HTTPS)

HTTPS es necesario para usar MIDI mapping desde una IP local y es la opción recomendada.

**Terminal 1 - Bridge:**
```bash
cd bridge
npm run start:https
```

**Terminal 2 - UI:**
```bash
cd ui
npm run dev:https
```

El servidor HTTPS generará certificados SSL automáticamente. Accede a la aplicación en:
- `https://localhost:3000` (desde la misma máquina)
- `https://<tu-ip-local>:3000` (desde otro dispositivo en la misma red)

**⚠️ Importante:** El navegador mostrará una advertencia de seguridad porque el certificado es autofirmado. Esto es normal en desarrollo. Haz clic en "Avanzado" → "Continuar al sitio" para aceptar el certificado.

### Desarrollo Alternativo: HTTP

Si no necesitas MIDI mapping desde IP local, puedes usar HTTP:

**Terminal 1 - Bridge:**
```bash
cd bridge
npm start
```

**Terminal 2 - UI:**
```bash
cd ui
npm run dev
```

Accede a la aplicación en `http://localhost:3000`

**Nota:** Con HTTP, el mapeo MIDI solo funcionará desde `localhost`, no desde una IP local.

### Producción

**Terminal 1 - Bridge (HTTPS recomendado):**
```bash
cd bridge
npm run start:https
# o si prefieres HTTP:
npm start
```

**Terminal 2 - UI:**
```bash
cd ui
npm run build
npm start
```

**Nota:** Para producción, considera usar certificados SSL válidos en lugar de autofirmados.

## Configuración

### Bridge

El bridge por defecto escucha en:
- **Puerto HTTPS**: `4001` (modo recomendado, `npm run start:https`)
- **Puerto HTTP**: `4000` (modo alternativo, `npm start`)

Para cambiar la IP del mixer XR-18, edita `bridge/index.js` o configura la variable de entorno correspondiente.

**Certificados SSL:** En modo HTTPS, los certificados se generan automáticamente y se guardan en `bridge/.cert/`. Se copian automáticamente desde `ui/.cert/` si se generan primero en la UI.

### UI

#### Configuración de IP del Bridge

1. Abre la aplicación en el navegador
2. Haz clic en el indicador de conexión (punto verde/rojo)
3. Ingresa la IP del bridge en el modal de configuración

Por defecto intentará conectarse a:
- `localhost:4001` (HTTPS recomendado) o `localhost:4000` (HTTP)
- O la IP del host si accedes desde otro dispositivo en la misma red
- El protocolo (HTTP/HTTPS) se detecta automáticamente según el protocolo usado para acceder a la UI

#### MIDI Mapping

Para usar MIDI mapping desde una IP local:

1. **Usa HTTPS** - Ejecuta el bridge y la UI en modo HTTPS (ver sección "Desarrollo" arriba)
2. **Acepta el certificado SSL** - El navegador mostrará una advertencia. Haz clic en "Avanzado" → "Continuar al sitio"
3. Haz clic en "Map" en cualquier strip
4. Mueve el control MIDI que quieres mapear
5. Presiona ESC para cancelar el modo mapping o haz clic en la "×" en el botón

**Importante:** MIDI mapping desde IP local requiere HTTPS. Si usas HTTP, solo funcionará desde `localhost`.

## Características

- ✅ Control OSC de canales, buses, master y FX sends
- ✅ Control EQ (3 bandas: Low, Mid, High)
- ✅ Mapeo MIDI para todos los parámetros
- ✅ Organización por páginas
- ✅ Macros para controlar múltiples parámetros simultáneamente
- ✅ Colores automáticos basados en la configuración del mixer
- ✅ Arrastrar y soltar para reordenar strips
- ✅ Reordenamiento persistente

## Desarrollo

### Scripts Disponibles

#### Bridge
- `npm run start:https` - Inicia el servidor HTTPS (recomendado)
- `npm start` - Inicia el servidor HTTP (alternativa)

#### UI
- `npm run dev:https` - Inicia el servidor de desarrollo HTTPS con generación automática de certificados (recomendado)
- `npm run dev` - Inicia el servidor de desarrollo HTTP (alternativa)
- `npm run build` - Construye la aplicación para producción
- `npm start` - Inicia el servidor de producción
- `npm run lint` - Ejecuta el linter

## Notas Importantes

- **HTTPS es necesario para MIDI mapping desde IP local** - Si planeas usar MIDI desde otro dispositivo o necesitas todas las funcionalidades, usa siempre el modo HTTPS
- Los certificados SSL se generan automáticamente en `ui/.cert/` y se copian a `bridge/.cert/` cuando se inicia el bridge en modo HTTPS
- Los datos se guardan en `localStorage` del navegador (parámetros, macros, mapeos MIDI, páginas)
- El bridge necesita acceso a la red donde está conectado el mixer XR-18
- Los certificados autofirmados son seguros para desarrollo, pero los navegadores mostrarán advertencias que debes aceptar manualmente

