# Compiling LAN Sentry for Production

LAN Sentry can be compiled into a standalone, single executable file (`.exe` on Windows, or binaries for Linux/macOS) using [pkg](https://github.com/vercel/pkg). This allows users to run the application without installing Node.js, and the `data/` folder will be dynamically generated right next to the executable wherever they place it.

## 1. Prerequisites

First, ensure you have all dependencies installed and the project is ready to be built:

```bash
npm install
```

Install `pkg` globally on your machine:

```bash
npm install -g pkg
```

## 2. Build the Static Assets

Before creating the executable, you must build the Vite React frontend and bundle the backend code so it can be injected into the binary:

```bash
npm run build
```

This command populates the `dist/` directory with `server.cjs` and your web assets.

## 3. Package the Executable

To compile the application into a single executable, run:

```bash
# For Windows
pkg package.json --targets node18-win-x64 --output LANSentry.exe

# For Linux
pkg package.json --targets node18-linux-x64 --output lansentry-linux

# For macOS
pkg package.json --targets node18-macos-x64 --output lansentry-mac
```

## 4. Distribution & First Run

You will receive your compiled executable file (e.g., `LANSentry.exe`). 

- You can move this file anywhere on your computer or distribute it to others.
- When executed, it will run the backend quietly on Port 3000. 
- You can access the dashboard by opening `http://localhost:3000` in your web browser.
- **Data Persistence:** Upon its first boot, the executable will automatically create a `data/` folder in the same directory it is located in. This folder holds `devices.json`, `alerts.json`, and other telemetry. Because it is created alongside the `.exe`, users have full access to view, edit, or backup their data.
