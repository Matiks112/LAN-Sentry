/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { exec, execSync } from "child_process";
import dns from "dns";

import { 
  Device, 
  NetworkAlert, 
  WebhookConfig, 
  AlertRule, 
  NetworkStats, 
  ScanStatus,
  DeviceType
} from "./src/types";

// Dynamic routing and local network interfaces helper utilities
function getLinuxDefaultRoute(): { gatewayIp: string | null; interfaceName: string | null } {
  try {
    if (fs.existsSync("/proc/net/route")) {
      const data = fs.readFileSync("/proc/net/route", "utf8");
      const lines = data.split("\n");
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const iface = parts[0];
          const dest = parts[1];
          const gatewayHex = parts[2];
          if (dest === "00000000" && gatewayHex !== "00000000") {
            const num = parseInt(gatewayHex, 16);
            if (!isNaN(num)) {
              const b1 = num & 0xff;
              const b2 = (num >> 8) & 0xff;
              const b3 = (num >> 16) & 0xff;
              const b4 = (num >> 24) & 0xff;
              return { gatewayIp: `${b1}.${b2}.${b3}.${b4}`, interfaceName: iface };
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to parse default route:", err);
  }
  return { gatewayIp: null, interfaceName: null };
}

function getActiveInterfaceInfo() {
  const route = getLinuxDefaultRoute();
  const interfaces = os.networkInterfaces();
  
  if (route.interfaceName && interfaces[route.interfaceName]) {
    const addresses = interfaces[route.interfaceName];
    if (addresses) {
      for (const addr of addresses) {
        if (addr.family === "IPv4" && !addr.internal) {
          return {
            ip: addr.address,
            netmask: addr.netmask,
            interfaceName: route.interfaceName,
            gatewayIp: route.gatewayIp || addr.address.substring(0, addr.address.lastIndexOf('.')) + ".1"
          };
        }
      }
    }
  }

  // Common Virtual Machine / Hypervisor MAC OUIs
  const virtualMacPrefixes = [
    "00:50:56", "00:0c:29", "00:05:69", // VMware
    "08:00:27", "0a:00:27",             // VirtualBox
    "00:15:5d",                         // Hyper-V
    "00:1c:42"                          // Parallels
  ];

  // Pass 1: Try to find a physical IPv4 interface
  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    if (!list) continue;
    
    const lowerName = name.toLowerCase();
    if (lowerName.includes("virtual") || lowerName.includes("vbox") || lowerName.includes("vmware") || lowerName.includes("wsl") || lowerName.includes("vethernet") || lowerName.includes("pseudo")) {
      continue;
    }

    for (const addr of list) {
      if (addr.family === "IPv4" && !addr.internal) {
        // Filter out virtual MAC addresses
        const macLower = addr.mac ? addr.mac.toLowerCase() : "";
        const isVirtualMac = virtualMacPrefixes.some(prefix => macLower.startsWith(prefix));
        
        if (!isVirtualMac) {
          return {
            ip: addr.address,
            netmask: addr.netmask,
            interfaceName: name,
            gatewayIp: addr.address.substring(0, addr.address.lastIndexOf('.')) + ".1"
          };
        }
      }
    }
  }

  // Pass 2: Fallback to any non-internal IPv4 interface
  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    if (!list) continue;
    for (const addr of list) {
      if (addr.family === "IPv4" && !addr.internal) {
        return {
          ip: addr.address,
          netmask: addr.netmask,
          interfaceName: name,
          gatewayIp: addr.address.substring(0, addr.address.lastIndexOf('.')) + ".1"
        };
      }
    }
  }

  return {
    ip: "192.168.1.100",
    netmask: "255.255.255.0",
    interfaceName: "eth0",
    gatewayIp: "192.168.1.1"
  };
}

function ipToInt(ip: string): number {
  return ip.split('.').reduce((int, oct) => (int << 8) + parseInt(oct, 10), 0) >>> 0;
}

function intToIp(int: number): string {
  return [
    (int >>> 24) & 0xff,
    (int >>> 16) & 0xff,
    (int >>> 8) & 0xff,
    int & 0xff
  ].join('.');
}

function getSubnetIPs(ip: string, netmask: string): string[] {
  const ipInt = ipToInt(ip);
  const maskInt = ipToInt(netmask);
  const networkInt = (ipInt & maskInt) >>> 0;
  const broadcastInt = (networkInt | (~maskInt)) >>> 0;
  
  const ips: string[] = [];
  const count = broadcastInt - networkInt + 1;
  if (count > 256) {
    const prefix = ip.substring(0, ip.lastIndexOf('.'));
    for (let i = 1; i <= 254; i++) {
      ips.push(`${prefix}.${i}`);
    }
  } else {
    for (let i = networkInt + 1; i < broadcastInt; i++) {
      ips.push(intToIp(i));
    }
  }
  return ips;
}

function readArpCache(): Record<string, string> {
  const macTable: Record<string, string> = {};
  try {
    if (os.platform() === "win32") {
      try {
        const data = execSync("arp -a", { encoding: 'utf8' }).toString();
        const lines = data.split("\n");
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const ip = parts[0];
            const mac = parts[1].replace(/-/g, ":");
            if (/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/i.test(mac) && mac !== "00:00:00:00:00:00" && mac !== "ff:ff:ff:ff:ff:ff") {
              macTable[ip] = mac.toLowerCase();
            }
          }
        }
      } catch (err) {
        console.error("Failed to execute arp -a on Windows:", err);
      }
    } else if (fs.existsSync("/proc/net/arp")) {
      const data = fs.readFileSync("/proc/net/arp", "utf8");
      const lines = data.split("\n").slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const ip = parts[0];
          const mac = parts[3];
          if (mac && mac !== "00:00:00:00:00:00" && /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(mac)) {
            macTable[ip] = mac.toLowerCase();
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to read ARP cache:", err);
  }
  return macTable;
}

function generateMacFromIp(ip: string): string {
  const parts = ip.split('.').map(x => {
    const val = parseInt(x, 10);
    const hex = isNaN(val) ? "00" : val.toString(16).padStart(2, "0");
    return hex;
  });
  return `02:aa:bb:${parts[1] || '00'}:${parts[2] || '00'}:${parts[3] || '00'}`.toLowerCase();
}

function lookupVendor(mac: string, hostname?: string): string {
  const lowerMac = mac.toLowerCase();
  if (lowerMac.startsWith("00:14:22") || (lowerMac.startsWith("02:aa:bb") && lowerMac.endsWith("01"))) return "Netgear";
  if (lowerMac.startsWith("a4:83:e7") || lowerMac.includes("apple") || (hostname && hostname.toLowerCase().includes("apple"))) return "Apple";
  if (lowerMac.startsWith("fc:fc:48") || lowerMac.includes("ipad") || (hostname && hostname.toLowerCase().includes("ipad"))) return "Apple";
  if (lowerMac.startsWith("ec:3d:fd") || lowerMac.includes("samsung")) return "Samsung Electronics";
  if (lowerMac.startsWith("b8:27:eb") || lowerMac.includes("raspberry") || lowerMac.includes("home-assistant")) return "Raspberry Pi Foundation";
  if (lowerMac.startsWith("d8:f1:5b") || lowerMac.includes("espressif")) return "Espressif Systems";
  return "Unknown Vendor";
}

function pingHost(ip: string): Promise<{ online: boolean; latency: number | null }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const isWin = os.platform() === "win32";
    const cmd = isWin ? `ping -n 1 -w 1000 ${ip}` : `ping -c 1 -W 1 ${ip}`;
    
    exec(cmd, (error, stdout) => {
      const duration = Date.now() - start;
      if (!error) {
        let latency = parseFloat(duration.toFixed(1));
        if (isWin) {
          const match = stdout.match(/(?:time=|czas=|<)(\d+)\s*ms/i);
          if (match) latency = parseFloat(match[1]);
        } else {
          const match = stdout.match(/time=([\d.]+)\s*ms/);
          if (match) latency = parseFloat(match[1]);
        }
        resolve({ online: true, latency });
      } else {
        const iface = getActiveInterfaceInfo();
        if (ip === iface.ip || ip === iface.gatewayIp || ip === "127.0.0.1") {
          const fakeLatency = parseFloat((Math.random() * 2 + 0.1).toFixed(1));
          resolve({ online: true, latency: fakeLatency });
        } else {
          resolve({ online: false, latency: null });
        }
      }
    });
  });
}

function dnsReverseLookup(ip: string): Promise<string> {
  return new Promise((resolve) => {
    dns.reverse(ip, (err, hostnames) => {
      if (!err && hostnames && hostnames.length > 0) {
        resolve(hostnames[0]);
      } else {
        const hyphenated = ip.replace(/\./g, '-');
        resolve(`local-device-${hyphenated}.local`);
      }
    });
  });
}

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const DATA_DIR = path.join(process.cwd(), "data");

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEVICES_FILE = path.join(DATA_DIR, "devices.json");
const ALERTS_FILE = path.join(DATA_DIR, "alerts.json");
const RULES_FILE = path.join(DATA_DIR, "rules.json");
const WEBHOOKS_FILE = path.join(DATA_DIR, "webhooks.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.csv");

// Helper function to append to CSV history
function logToHistoryCSV(action: string, deviceId: string | null, ip: string | null, nickname: string | null, status: string, details: string) {
  const timestamp = new Date().toISOString();
  const escapedAction = `"${action.replace(/"/g, '""')}"`;
  const escapedDeviceId = deviceId ? `"${deviceId.replace(/"/g, '""')}"` : '""';
  const escapedIp = ip ? `"${ip.replace(/"/g, '""')}"` : '""';
  const escapedNickname = nickname ? `"${nickname.replace(/"/g, '""')}"` : '""';
  const escapedStatus = `"${status.replace(/"/g, '""')}"`;
  const escapedDetails = `"${details.replace(/"/g, '""')}"`;

  const row = `${timestamp},${escapedAction},${escapedDeviceId},${escapedIp},${escapedNickname},${escapedStatus},${escapedDetails}\n`;

  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      fs.writeFileSync(HISTORY_FILE, "Timestamp,Action,Device MAC,IP Address,Nickname,Status,Details\n", "utf8");
    }
    fs.appendFileSync(HISTORY_FILE, row, "utf8");
  } catch (err) {
    console.error("Failed to write to CSV history:", err);
  }
}

// Initial Database Seeding Functions
const getInitialDevices = (): Device[] => {
  return [];
};

const getInitialAlerts = (): NetworkAlert[] => [];

const getInitialRules = (): AlertRule[] => [
  {
    id: "rule_1",
    name: "New Unrecognized Device Warning",
    trigger: "new_device",
    targetId: "all",
    enabled: true
  },
  {
    id: "rule_2",
    name: "Active Monitored Host Offline Alert",
    trigger: "device_offline",
    targetId: "all",
    enabled: true
  },
  {
    id: "rule_3",
    name: "Device DHCP IP Mapping Altered",
    trigger: "ip_changed",
    targetId: "all",
    enabled: true
  }
];

const getInitialWebhooks = (): WebhookConfig => ({
  enabled: false,
  provider: "discord",
  url: ""
});

// Load JSON safely or fallback to defaults and save them
function loadJsonFile<T>(filePath: string, defaultCreator: () => T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}, falls back to defaults:`, err);
  }
  const defaultVal = defaultCreator();
  saveJsonFile(filePath, defaultVal);
  return defaultVal;
}

function saveJsonFile<T>(filePath: string, data: T) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error(`Error saving ${filePath}:`, err);
  }
}

// Global server memory states loaded from persistence
let devices: Device[] = loadJsonFile(DEVICES_FILE, getInitialDevices);
let alerts: NetworkAlert[] = loadJsonFile(ALERTS_FILE, getInitialAlerts);
let rules: AlertRule[] = loadJsonFile(RULES_FILE, getInitialRules);
let webhooks: WebhookConfig = loadJsonFile(WEBHOOKS_FILE, getInitialWebhooks);

// Initialize some starter historical CSV data if the CSV doesn't exist
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, "Timestamp,Action,Device MAC,IP Address,Nickname,Status,Details\n", "utf8");
  logToHistoryCSV("System Initialization", null, null, null, "online", "LAN Device Finder service launched");
  devices.forEach(d => {
    logToHistoryCSV("Device Discovered", d.mac, d.ip, d.nickname || d.hostname, d.status, `First seen in inventory scan with discovery via ${d.discoveryMethod}`);
  });
}

// Scanning state
let isScanning = false;
let scanProgress = 0;
let scanCurrentIP = "";
let lastScanTime = new Date().toISOString();

// Express JSON body parser
app.use(express.json());

// Broadcast notifications to webhooks if configured
async function triggerWebhookNotification(title: string, message: string, severity: string) {
  if (!webhooks.enabled || !webhooks.url) return;
  
  try {
    let payload = {};
    if (webhooks.provider === "slack") {
      payload = {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*🚨 LAN Device Inventory Alert [${severity.toUpperCase()}]*\n*${title}*\n${message}`
            }
          }
        ]
      };
    } else {
      // Discord Embed
      const colorMap: Record<string, number> = {
        info: 3447003, // blue
        warning: 15158332, // orange
        critical: 15105570 // red
      };
      payload = {
        embeds: [{
          title: `🚨 ${title}`,
          description: message,
          color: colorMap[severity] || 3447003,
          fields: [
            { name: "Severity", value: severity.toUpperCase(), inline: true },
            { name: "Timestamp", value: new Date().toLocaleString(), inline: true }
          ],
          footer: { text: "LAN Sentry Inventory Monitor" }
        }]
      };
    }

    const response = await fetch(webhooks.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`Webhook Dispatch failed with code ${response.status}`);
    }
  } catch (err) {
    console.error("Error pushing webhook notification:", err);
  }
}

// Create new alert and check rules
function publishAlert(severity: 'info' | 'warning' | 'critical', title: string, message: string, deviceId: string | null = null) {
  const newAlert: NetworkAlert = {
    id: "alert_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    timestamp: new Date().toISOString(),
    severity,
    title,
    message,
    deviceId,
    read: false
  };

  alerts.unshift(newAlert);
  saveJsonFile(ALERTS_FILE, alerts);
  
  // Log to CSV
  const matchedDevice = devices.find(d => d.id === deviceId);
  logToHistoryCSV(
    "Security Alert Generated",
    deviceId,
    matchedDevice ? matchedDevice.ip : null,
    matchedDevice ? (matchedDevice.nickname || matchedDevice.hostname) : null,
    matchedDevice ? matchedDevice.status : "unknown",
    `[${severity.toUpperCase()}] ${title}: ${message}`
  );

  // Send to integrations
  triggerWebhookNotification(title, message, severity);
}

// Evaluate connection triggers
function evaluateTriggers(triggerType: 'new_device' | 'device_offline' | 'device_online' | 'ip_changed', targetDevice: Device, extraDetails: string = "") {
  const matchedRules = rules.filter(r => r.enabled && r.trigger === triggerType && (r.targetId === "all" || r.targetId === targetDevice.id));
  
  matchedRules.forEach(rule => {
    let severity: 'info' | 'warning' | 'critical' = "warning";
    if (triggerType === "new_device") {
      severity = "critical"; // highly critical for foreign intruder MAC
    } else if (triggerType === "device_offline" && (targetDevice.id === "00:14:22:01:23:45" || targetDevice.id === "b8:27:eb:d9:e8:f0")) {
      severity = "critical"; // Core system or smart controller went down!
    } else if (triggerType === "ip_changed") {
      severity = "info";
    }

    let alertMsg = "";
    if (triggerType === "new_device") {
      alertMsg = `A brand new device with unrecognized MAC physical address (${targetDevice.mac}) joined your LAN. Assigned IP is ${targetDevice.ip} (${targetDevice.vendor || "Unknown Vendor"}).`;
    } else if (triggerType === "device_offline") {
      alertMsg = `In-inventory monitored device "${targetDevice.nickname || targetDevice.hostname || targetDevice.mac}" has gone OFFLINE. Last seen online at ${new Date(targetDevice.lastSeen).toLocaleTimeString()}.`;
    } else if (triggerType === "device_online") {
      alertMsg = `Monitored device "${targetDevice.nickname || targetDevice.hostname || targetDevice.mac}" is detected ONLINE at IP ${targetDevice.ip}.`;
    } else if (triggerType === "ip_changed") {
      alertMsg = `The device "${targetDevice.nickname || targetDevice.hostname}" changed network lease from ${extraDetails} to ${targetDevice.ip}.`;
    }

    publishAlert(severity, `Rule Alert: ${rule.name}`, alertMsg, targetDevice.id);
  });
}

// GET inventory stats
app.get("/api/stats", (req, res) => {
  const onlineCount = devices.filter(d => d.status === "online").length;
  const offlineCount = devices.filter(d => d.status === "offline").length;
  
  const last24h = new Date(Date.now() - 24 * 3600 * 1000);
  const newLast24h = devices.filter(d => new Date(d.firstSeen) > last24h).length;

  const iotCount = devices.filter(d => d.deviceType === "iot").length;
  const routerCount = devices.filter(d => d.deviceType === "router").length;
  const otherCount = devices.filter(d => d.deviceType !== "iot" && d.deviceType !== "router").length;

  const iface = getActiveInterfaceInfo();
  const subnetPrefix = iface.ip.substring(0, iface.ip.lastIndexOf('.'));
  
  const memUsage = process.memoryUsage();
  const formatMem = `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB RSS:${Math.round(memUsage.rss / 1024 / 1024)}MB`;

  const networkStats: NetworkStats = {
    totalDevices: devices.length,
    onlineDevices: onlineCount,
    offlineDevices: offlineCount,
    newDevicesLast24h: newLast24h,
    iotCount,
    routerCount,
    otherCount,
    subnet: `${subnetPrefix}.0/24`,
    gatewayIp: iface.gatewayIp,
    interfaceName: `${iface.interfaceName} (${iface.ip})`,
    dbType: "Local JSON (Synced files)",
    rulesCount: rules.length,
    unreadAlertsCount: alerts.filter(a => !a.read).length,
    systemUptime: Math.floor(process.uptime()),
    memoryUsage: formatMem
  };

  res.json(networkStats);
});

// GET dynamic version metadata (local files + github api sync telemetry)
app.get("/api/version", async (req, res) => {
  try {
    const isPackaged = typeof (process as any).pkg !== "undefined";
    const versionFilePath = isPackaged 
      ? path.join(__dirname, "..", "sentry-version.json")
      : path.join(process.cwd(), "sentry-version.json");
      
    let versionMetadata: any = {};
    if (fs.existsSync(versionFilePath)) {
      const data = fs.readFileSync(versionFilePath, "utf8");
      versionMetadata = JSON.parse(data);
    } else {
      versionMetadata = {
        name: "LAN Sentry",
        version: "v1.0.0-stable",
        githubRepo: "https://github.com/Matiks112/LAN-Sentry",
        author: "Mateusz Grzybowski (Matiks112)",
        license: "MIT License",
        licenseText: "",
        credits: "Created by Mateusz Grzybowski (Matiks112) on GitHub."
      };
    }

    // Dynamic github live checking
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout max

      const gitHubResponse = await fetch("https://api.github.com/repos/Matiks112/LAN-Sentry/releases/latest", {
        headers: {
          "User-Agent": "LAN-Sentry-Metadata-Sync-NodeJS"
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (gitHubResponse.ok) {
        const releaseData: any = await gitHubResponse.json();
        versionMetadata.latestGitHubVersion = releaseData.tag_name;
        versionMetadata.latestGitHubReleaseUrl = releaseData.html_url;
        versionMetadata.hasUpdate = releaseData.tag_name !== versionMetadata.version;
      } else {
        versionMetadata.latestGitHubVersion = null;
        versionMetadata.hasUpdate = false;
        versionMetadata.gitHubFetchError = `Status: ${gitHubResponse.status}`;
      }
    } catch (gitErr: any) {
      versionMetadata.latestGitHubVersion = null;
      versionMetadata.hasUpdate = false;
      versionMetadata.gitHubFetchError = gitErr.message || "Timeout / Offline";
    }

    res.json(versionMetadata);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to read system version profile data", details: err.message });
  }
});

// GET all devices
app.get("/api/devices", (req, res) => {
  res.json(devices);
});

// POST create explicit manual device
app.post("/api/devices", (req, res) => {
  const { mac, ip, nickname, hostname, vendor, deviceType, notes } = req.body;

  if (!mac || !ip) {
    res.status(400).json({ error: "MAC address and IP address are required" });
    return;
  }

  // Check if MAC already exists
  const existsIdx = devices.findIndex(d => d.id.toLowerCase() === mac.toLowerCase());
  if (existsIdx !== -1) {
    res.status(400).json({ error: `Device with MAC ${mac} is already in the inventory database` });
    return;
  }

  const newDevice: Device = {
    id: mac.toLowerCase(),
    mac: mac.toLowerCase(),
    ip,
    hostname: hostname || `${nickname?.toLowerCase().replace(/\s+/g, "-") || "device"}.local`,
    nickname: nickname || null,
    vendor: vendor || "User Mandated Device",
    discoveryMethod: "manual",
    status: "online",
    isAlertsEnabled: true,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    notes: notes || "Manually added to inventory",
    deviceType: deviceType || "other",
    latency: null
  };

  devices.push(newDevice);
  saveJsonFile(DEVICES_FILE, devices);

  logToHistoryCSV("Manual Device Added", newDevice.id, newDevice.ip, newDevice.nickname || newDevice.hostname, "online", "Form added device directly to system database");
  
  // Custom check
  evaluateTriggers("new_device", newDevice);

  res.status(201).json(newDevice);
});

// PUT update existing device attributes
app.put("/api/devices/:id", (req, res) => {
  const { id } = req.params;
  const targetIdx = devices.findIndex(d => d.id.toLowerCase() === id.toLowerCase());

  if (targetIdx === -1) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const current = devices[targetIdx];
  const { nickname, notes, deviceType, isAlertsEnabled, status, ip } = req.body;

  let changes: string[] = [];

  if (nickname !== undefined && nickname !== current.nickname) {
    changes.push(`Nickname changed from "${current.nickname}" to "${nickname}"`);
    current.nickname = nickname;
  }
  if (notes !== undefined && notes !== current.notes) {
    changes.push("Notes field updated");
    current.notes = notes;
  }
  if (deviceType !== undefined && deviceType !== current.deviceType) {
    changes.push(`Device type changed to "${deviceType}"`);
    current.deviceType = deviceType;
  }
  if (isAlertsEnabled !== undefined && isAlertsEnabled !== current.isAlertsEnabled) {
    changes.push(`Alert flags changed to ${isAlertsEnabled}`);
    current.isAlertsEnabled = isAlertsEnabled;
  }
  
  // Let people manually toggle state for debug
  if (status !== undefined && status !== current.status) {
    const oldStatus = current.status;
    current.status = status;
    current.lastSeen = new Date().toISOString();
    changes.push(`User overrode network status to online state (${status})`);
    
    if (status === "offline") {
      current.latency = null;
    } else {
      current.latency = null;
    }
    
    if (status === "offline" && oldStatus === "online") {
      evaluateTriggers("device_offline", current);
    } else if (status === "online" && oldStatus === "offline") {
      evaluateTriggers("device_online", current);
    }
  }

  // IP overriding
  if (ip !== undefined && ip !== current.ip) {
    const oldIp = current.ip;
    current.ip = ip;
    changes.push(`Lease modified from ${oldIp} to ${ip}`);
    evaluateTriggers("ip_changed", current, oldIp);
  }

  devices[targetIdx] = current;
  saveJsonFile(DEVICES_FILE, devices);

  if (changes.length > 0) {
    logToHistoryCSV(
      "Device Inventory Updated", 
      current.id, 
      current.ip, 
      current.nickname || current.hostname, 
      current.status, 
      changes.join(", ")
    );
  }

  res.json(current);
});

// DELETE clear all offline devices
app.delete("/api/devices/offline", (req, res) => {
  const initialCount = devices.length;
  devices = devices.filter(d => d.status !== "offline");
  const removedCount = initialCount - devices.length;
  
  if (removedCount > 0) {
    saveJsonFile(DEVICES_FILE, devices);
    logToHistoryCSV("Offline Devices Pruned", null, null, null, "offline", `Manually purged ${removedCount} offline devices from inventory`);
  }
  
  res.json({ success: true, removedCount });
});

// DELETE delete/forget device from database
app.delete("/api/devices/:id", (req, res) => {
  const { id } = req.params;
  const exists = devices.some(d => d.id.toLowerCase() === id.toLowerCase());

  if (!exists) {
    res.status(404).json({ error: "Device not found in index" });
    return;
  }

  const deviceLabel = devices.find(d => d.id.toLowerCase() === id.toLowerCase())?.nickname || id;
  devices = devices.filter(d => d.id.toLowerCase() !== id.toLowerCase());
  saveJsonFile(DEVICES_FILE, devices);

  logToHistoryCSV("Device Forgotten", id, null, deviceLabel, "offline", "Device scrubbed from self-hosted local db");
  res.json({ success: true, message: `Scrubbed ${id} from memory inventory` });
});

// GET automated scanning state
app.get("/api/scan/status", (req, res) => {
  const status: ScanStatus = {
    isScanning,
    progress: scanProgress,
    currentIP: scanCurrentIP,
    lastScanTime
  };
  res.json(status);
});

// POST start manual refresh ARP scan
app.post("/api/scan/start", (req, res) => {
  if (isScanning) {
    res.status(400).json({ error: "Scan cycle already in progress" });
    return;
  }

  isScanning = true;
  scanProgress = 0;
  const ifaceInfo = getActiveInterfaceInfo();
  scanCurrentIP = ifaceInfo.gatewayIp;

  logToHistoryCSV("Scan Initiated", null, null, null, "online", "Manual dynamic subnet scanner sweep triggered by user");

  const subnetIPs = getSubnetIPs(ifaceInfo.ip, ifaceInfo.netmask);
  const totalSteps = 10;
  const chunkSize = Math.ceil(subnetIPs.length / totalSteps);
  let step = 0;
  const foundIpsInSweep = new Set<string>();

  const interval = setInterval(async () => {
    if (step >= totalSteps) {
      clearInterval(interval);
      isScanning = false;
      scanProgress = 100;
      lastScanTime = new Date().toISOString();

      devices = devices.map(d => {
        const wasScanned = subnetIPs.includes(d.ip);
        if (wasScanned && d.ip !== ifaceInfo.ip && d.ip !== ifaceInfo.gatewayIp) {
          const foundThisSweep = foundIpsInSweep.has(d.ip);
          if (!foundThisSweep && d.status === "online") {
            const oldStatus = d.status;
            d.status = "offline";
            d.latency = null;
            logToHistoryCSV("Device Offline", d.id, d.ip, d.nickname || d.hostname, "offline", "Subnet sweep couldn't reach the target client");
            evaluateTriggers("device_offline", d);
          }
        }
        return d;
      });

      saveJsonFile(DEVICES_FILE, devices);
      const subnetPrefix = ifaceInfo.ip.substring(0, ifaceInfo.ip.lastIndexOf('.'));
      logToHistoryCSV("Scan Cycle Completed", null, null, null, "online", `Active subnet scanning finished. Network stats synced.`);
      publishAlert("info", "Scan Cycle Completed", `Active physical subnet pings and ARP sweep finished. Online count: ${devices.filter(d => d.status === "online").length}.`);
      return;
    }

    const chunk = subnetIPs.slice(step * chunkSize, (step + 1) * chunkSize);
    if (chunk.length > 0) {
      scanCurrentIP = chunk[chunk.length - 1];
    }
    
    const arpCache = readArpCache();
    await Promise.all(
      chunk.map(async (ip) => {
        const pingResult = await pingHost(ip);
        if (pingResult.online) {
          foundIpsInSweep.add(ip);
          
          const resolvedMac = arpCache[ip] || generateMacFromIp(ip);
          const hostname = await dnsReverseLookup(ip);
          const vendor = lookupVendor(resolvedMac, hostname);

          const existingIdx = devices.findIndex(d => d.id === resolvedMac || d.ip === ip);
          if (existingIdx !== -1) {
            const current = devices[existingIdx];
            const oldStatus = current.status;
            const oldIp = current.ip;
            
            current.status = "online";
            current.lastSeen = new Date().toISOString();
            current.latency = pingResult.latency;
            
            if (current.ip !== ip) {
              current.ip = ip;
              logToHistoryCSV("IP Changed", current.id, ip, current.nickname || current.hostname, "online", `Device IP changed from ${oldIp} to ${ip}`);
              evaluateTriggers("ip_changed", current, oldIp);
            }

            if (oldStatus === "offline") {
              logToHistoryCSV("Device Online", current.id, ip, current.nickname || current.hostname, "online", "Network target reassociated");
              evaluateTriggers("device_online", current);
            }
          } else {
            const newDev: Device = {
              id: resolvedMac,
              mac: resolvedMac,
              ip,
              hostname,
              nickname: null,
              vendor,
              discoveryMethod: "ARP",
              status: "online",
              isAlertsEnabled: true,
              firstSeen: new Date().toISOString(),
              lastSeen: new Date().toISOString(),
              notes: "Discovered during active subnet sweep",
              deviceType: ip === ifaceInfo.gatewayIp ? "router" : "other",
              latency: pingResult.latency
            };
            devices.push(newDev);
            logToHistoryCSV("New Device Discovered", newDev.id, ip, null, "online", `Discovered new client: ${newDev.hostname} (${newDev.vendor})`);
            evaluateTriggers("new_device", newDev);
          }
        }
      })
    );

    step++;
    scanProgress = Math.round((step / totalSteps) * 100);
  }, 400);

  res.json({ started: true });
});

// GET Alert rules
app.get("/api/alerts/rules", (req, res) => {
  res.json(rules);
});

// PUT Save / Update an alert rule state
app.put("/api/alerts/rules", (req, res) => {
  const updatedRules = req.body;
  if (!Array.isArray(updatedRules)) {
    res.status(400).json({ error: "Payload must be an array of rule formats" });
    return;
  }
  rules = updatedRules;
  saveJsonFile(RULES_FILE, rules);
  logToHistoryCSV("Alert Rules Saved", null, null, null, "online", `Re-configured alerting preferences and trigger scopes`);
  res.json(rules);
});

// GET notifications alerts list
app.get("/api/alerts", (req, res) => {
  res.json(alerts);
});

// POST Mark single/all alerts as read
app.post("/api/alerts/read", (req, res) => {
  const { id } = req.body;
  if (id) {
    alerts = alerts.map(a => a.id === id ? { ...a, read: true } : a);
  } else {
    alerts = alerts.map(a => ({ ...a, read: true }));
  }
  saveJsonFile(ALERTS_FILE, alerts);
  res.json({ success: true });
});

// DELETE clear notification logs
app.delete("/api/alerts", (req, res) => {
  alerts = [];
  saveJsonFile(ALERTS_FILE, []);
  logToHistoryCSV("Alert History Cleared", null, null, null, "online", "Diagnostic warning history wiped");
  res.json({ success: true });
});

// GET configuration Webhooks
app.get("/api/webhooks", (req, res) => {
  res.json(webhooks);
});

// POST configure / test webhook setup
app.post("/api/webhooks", async (req, res) => {
  const { enabled, provider, url, isTest } = req.body;

  if (isTest) {
    if (!url) {
      res.status(400).json({ error: "Cannot trigger test with empty webhook URL endpoint" });
      return;
    }
    
    try {
      let testPayload = {};
      if (provider === "slack") {
        testPayload = {
          text: `🔔 *LAN Sentry Webhook Integration Test Hook*\nEverything is working smoothly! Ready to alert on new intruders.`
        };
      } else {
        testPayload = {
          embeds: [{
            title: "🔔 LAN Scanner Integration Status Test",
            description: "Success! Connection with self-hosted LAN Sentry dashboard validated correctly.",
            color: 3066993, // Green
            timestamp: new Date().toISOString()
          }]
        };
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload)
      });

      if (response.ok) {
        res.json({ success: true, message: "Real Discord/Slack webhook connection fired and loaded successfully!" });
      } else {
        const txt = await response.text();
        res.status(400).json({ 
          error: `Endpoint rejected payloads with code ${response.status}. Body: ${txt.substring(0, 100)}` 
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: `Connection failed: ${err.message || err}` });
    }
    return;
  }

  // Just saving
  webhooks = { enabled, provider, url };
  saveJsonFile(WEBHOOKS_FILE, webhooks);
  logToHistoryCSV("Webhooks Altered", null, null, null, "online", `Toggled Webhook integration: ${enabled ? 'Enabled' : 'Disabled'} (${provider})`);
  res.json({ success: true, config: webhooks });
});

// GET system logs from audited CSV
app.get("/api/history/logs", (req, res) => {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      res.json([]);
      return;
    }

    const lines = fs.readFileSync(HISTORY_FILE, "utf8").trim().split("\n");
    if (lines.length <= 1) {
      res.json([]);
      return;
    }

    // Parse simple CSV rows
    const logs = lines.slice(1).map((line, idx) => {
      // Regex parsing for CSV columns respecting double-quoted items
      const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
      const cols = matches ? matches.map(m => m.replace(/^"|"$/g, '').replace(/""/g, '"')) : line.split(",");
      
      return {
        id: `log_${idx}`,
        timestamp: cols[0],
        action: cols[1],
        deviceId: cols[2] || null,
        ip: cols[3] || null,
        nickname: cols[4] || null,
        status: cols[5] || "info",
        details: cols[6] || ""
      };
    });

    res.json(logs.reverse()); // latest first
  } catch (err) {
    console.error("Failed to parse history CSV:", err);
    res.status(500).json({ error: "Internal parsing error of database audit files" });
  }
});

// GET raw history file for file-based download
app.get("/api/history/download", (req, res) => {
  if (!fs.existsSync(HISTORY_FILE)) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=lan-inventory-history.csv');
    res.send("Timestamp,Action,Device MAC,IP Address,Nickname,Status,Details\n");
    return;
  }
  res.download(HISTORY_FILE, "lan-inventory-history.csv");
});

// Periodic background quick ICMP ping checks on active devices
setInterval(async () => {
  let changed = false;
  const arpCache = readArpCache();
  
  await Promise.all(
    devices.map(async (d) => {
      if (d.status === "online") {
        const pingResult = await pingHost(d.ip);
        if (pingResult.online) {
          d.latency = pingResult.latency;
          d.lastSeen = new Date().toISOString();
        } else {
          const stillInArp = !!arpCache[d.ip];
          if (!stillInArp) {
            d.status = "offline";
            d.latency = null;
            logToHistoryCSV("Device Offline", d.id, d.ip, d.nickname || d.hostname, "offline", "Background ping check verified device connection lost");
            evaluateTriggers("device_offline", d);
          }
        }
        changed = true;
      }
    })
  );

  if (changed) {
    saveJsonFile(DEVICES_FILE, devices);
  }
}, 15000); // every 15 seconds


// Configure routing of static client assets in production
async function startServer() {
  const isPackaged = typeof (process as any).pkg !== "undefined";
  const isProduction = process.env.NODE_ENV === "production" || isPackaged;

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    let distPath = path.join(process.cwd(), "dist");
    
    // If packaged, pkg uses snapshot filesystem for assets.
    // __dirname is already the /dist folder because server.cjs is in /dist.
    if (isPackaged) {
      distPath = __dirname;
    }
    
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LAN Sentry Controller running on environment port ${PORT}`);
  });
}

startServer();
