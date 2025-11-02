# OSC Control Interface

**[Versión en Español](README.md)** | English version

Web interface to control a Behringer XR-18 mixer via OSC (Open Sound Control) protocol. Includes MIDI mapping and page organization.

## Project Structure

- **`/bridge`**: Node.js server that acts as a bridge between the web UI and the XR-18 mixer via OSC
- **`/ui`**: Next.js/React application that provides the user interface

## Prerequisites

- Node.js (version 16 or higher)
- npm or pnpm
- A Behringer XR-18 mixer connected to the same network

## Installation

### 1. Install Bridge Dependencies

```bash
cd bridge
npm install
```

### 2. Configure the Bridge

Create a `.env` file in the `bridge/` directory with your XR-18 mixer IP:

```bash
cd bridge
echo "XR18_IP=192.168.0.100" > .env
```

**Important:** Replace `192.168.0.100` with the actual IP of your XR-18/XAir mixer. You can find this IP in the mixer's network settings or by using the official Behringer app.

### 3. Install UI Dependencies

```bash
cd ui
npm install
# or if you use pnpm:
pnpm install
```

## Usage

### Development (Recommended: HTTPS)

HTTPS is required for MIDI mapping from a local IP and is the recommended option.

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

The HTTPS server will automatically generate SSL certificates. Access the application at:
- `https://localhost:3000` (from the same machine)
- `https://<your-local-ip>:3000` (from another device on the same network)

**⚠️ Important:** The browser will show a security warning because the certificate is self-signed. This is normal in development. Click "Advanced" → "Continue to site" to accept the certificate.

### Alternative Development: HTTP

If you don't need MIDI mapping from a local IP, you can use HTTP:

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

Access the application at `http://localhost:3000`

**Note:** With HTTP, MIDI mapping will only work from `localhost`, not from a local IP.

### Production

**Terminal 1 - Bridge (HTTPS recommended):**
```bash
cd bridge
npm run start:https
# or if you prefer HTTP:
npm start
```

**Terminal 2 - UI:**
```bash
cd ui
npm run build
npm start
```

**Note:** For production, consider using valid SSL certificates instead of self-signed ones.

## Configuration

### Bridge

The bridge listens on by default:
- **HTTPS Port**: `4001` (recommended mode, `npm run start:https`)
- **HTTP Port**: `4000` (alternative mode, `npm start`)

The XR-18 mixer IP is configured in the `bridge/.env` file via the `XR18_IP` variable. If you haven't created this file, the bridge will not start.

To change the mixer IP, edit `bridge/.env` and modify the `XR18_IP` value.

**SSL Certificates:** In HTTPS mode, certificates are automatically generated and saved in `bridge/.cert/`. They are automatically copied from `ui/.cert/` if generated first in the UI.

### UI

#### Bridge IP Configuration

1. Open the application in your browser
2. Click on the connection indicator (green/red dot)
3. Enter the bridge IP in the configuration modal

By default it will try to connect to:
- `localhost:4001` (HTTPS recommended) or `localhost:4000` (HTTP)
- Or the host IP if accessing from another device on the same network
- The protocol (HTTP/HTTPS) is automatically detected based on the protocol used to access the UI

#### MIDI Mapping

To use MIDI mapping from a local IP:

1. **Use HTTPS** - Run the bridge and UI in HTTPS mode (see "Development" section above)
2. **Accept the SSL certificate** - The browser will show a warning. Click "Advanced" → "Continue to site"
3. Click "Map" on any strip
4. Move the MIDI control you want to map
5. Press ESC to cancel mapping mode or click the "×" on the button

**Important:** MIDI mapping from a local IP requires HTTPS. If you use HTTP, it will only work from `localhost`.

## Features

- ✅ OSC control of channels, buses, master and FX sends
- ✅ EQ control (3 bands: Low, Mid, High)
- ✅ MIDI mapping for all parameters
- ✅ Page organization
- ✅ Macros to control multiple parameters simultaneously
- ✅ Automatic colors based on mixer configuration
- ✅ Drag and drop to reorder strips
- ✅ Persistent reordering

## Development

### Available Scripts

#### Bridge
- `npm run start:https` - Starts HTTPS server (recommended)
- `npm start` - Starts HTTP server (alternative)

#### UI
- `npm run dev:https` - Starts HTTPS development server with automatic certificate generation (recommended)
- `npm run dev` - Starts HTTP development server (alternative)
- `npm run build` - Builds the application for production
- `npm start` - Starts production server
- `npm run lint` - Runs the linter

## Important Notes

- **`.env` file required** - The bridge requires a `bridge/.env` file with `XR18_IP` configured. Without this file, the bridge will not start
- **HTTPS is necessary for MIDI mapping from local IP** - If you plan to use MIDI from another device or need all functionalities, always use HTTPS mode
- SSL certificates are automatically generated in `ui/.cert/` and copied to `bridge/.cert/` when starting the bridge in HTTPS mode
- Data is saved in browser `localStorage` (parameters, macros, MIDI mappings, pages)
- The bridge needs access to the network where the XR-18 mixer is connected
- Self-signed certificates are safe for development, but browsers will show warnings that you must accept manually

