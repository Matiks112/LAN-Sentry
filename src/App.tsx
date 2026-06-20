/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { 
  Device, 
  NetworkAlert, 
  WebhookConfig, 
  AlertRule, 
  NetworkStats, 
  ScanStatus,
  DeviceType,
  AlertTrigger,
  SentryVersionInfo,
} from "./types";
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  ShieldAlert, 
  Cpu, 
  RefreshCw, 
  Trash2, 
  Edit3, 
  Plus, 
  X, 
  Check, 
  Slack, 
  Download, 
  Bell, 
  Sliders, 
  Terminal, 
  Info, 
  Settings, 
  Sparkles, 
  Search, 
  Save, 
  AlertTriangle,
  Github,
  BookOpen,
  Tag,
  ShieldCheck
} from "lucide-react";
import logo from "./assets/logo.svg";
import NetworkStatsView from "./components/NetworkStatsView";
import ScannerControls from "./components/ScannerControls";

export default function App() {
  // Application Data States
  const [devices, setDevices] = useState<Device[]>([]);
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [alerts, setAlerts] = useState<NetworkAlert[]>([]);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookConfig>({ enabled: false, provider: "discord", url: "" });
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [versionInfo, setVersionInfo] = useState<SentryVersionInfo | null>(null);

  // UI Control States
  const [filter, setFilter] = useState<"all" | "online" | "offline" | "iot" | "flagged">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"devices" | "webhooks" | "rules" | "history" | "settings">("devices");

  // Settings Panel Config (Persistent)
  const [pollingInterval, setPollingInterval] = useState<number>(() => {
    return Number(localStorage.getItem("sentry_polling_interval") || "4");
  });
  const [soundOnAlert, setSoundOnAlert] = useState<boolean>(() => {
    return localStorage.getItem("sentry_sound_on_alert") !== "false";
  });
  const [uiDensity, setUiDensity] = useState<"comfortable" | "compact">(() => {
    return (localStorage.getItem("sentry_ui_density") as "comfortable" | "compact") || "comfortable";
  });
  const [accentColor, setAccentColor] = useState<"indigo" | "emerald" | "amber" | "rose" | "purple">(() => {
    return (localStorage.getItem("sentry_accent_color") as any) || "indigo";
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Modals & Editors
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [testWebhookLoading, setTestWebhookLoading] = useState(false);
  const [webhookMessage, setWebhookMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [saveWebhookLoading, setSaveWebhookLoading] = useState(false);

  // New Device Form state
  const [newDeviceForm, setNewDeviceForm] = useState({
    mac: "",
    ip: "",
    nickname: "",
    hostname: "",
    vendor: "",
    deviceType: "other" as DeviceType,
    notes: ""
  });

  // Edit Device Form state
  const [editForm, setEditForm] = useState({
    nickname: "",
    deviceType: "other" as DeviceType,
    isAlertsEnabled: true,
    status: "online" as "online" | "offline",
    ip: "",
    notes: ""
  });

  // New Rule Form state
  const [newRuleForm, setNewRuleForm] = useState({
    name: "",
    trigger: "new_device" as AlertTrigger,
    targetId: "all"
  });

  // Simulation feedback alert
  const [simFeedback, setSimFeedback] = useState<string | null>(null);

  // Helper to play synthesized C5/A5 buzzer alert
  const playAlertBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc1.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.12); // A5

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(349.23, audioCtx.currentTime); // F4
      osc2.frequency.exponentialRampToValueAtTime(659.25, audioCtx.currentTime + 0.18); // E5

      gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(audioCtx.currentTime + 0.25);
      osc2.stop(audioCtx.currentTime + 0.25);
    } catch (err) {
      console.warn("Chime blocked by browser user-interaction policy:", err);
    }
  };

  // Fetch all core system data
  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      const [devsRes, statsRes, alertsRes, scanRes, rulesRes, webhooksRes, logsRes] = await Promise.all([
        fetch("/api/devices"),
        fetch("/api/stats"),
        fetch("/api/alerts"),
        fetch("/api/scan/status"),
        fetch("/api/alerts/rules"),
        fetch("/api/webhooks"),
        fetch("/api/history/logs")
      ]);

      if (devsRes.ok) setDevices(await devsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (alertsRes.ok) setAlerts(await alertsRes.json());
      if (scanRes.ok) setScanStatus(await scanRes.json());
      if (rulesRes.ok) setRules(await rulesRes.json());
      if (webhooksRes.ok) setWebhooks(await webhooksRes.json());
      if (logsRes.ok) setHistoryLogs(await logsRes.json());
    } catch (err) {
      console.error("Failed to sync system data from server endpoints:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Load version metadata on mount
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const res = await fetch("/api/version");
        if (res.ok) {
          setVersionInfo(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch version profile info:", err);
      }
    };
    fetchVersion();
  }, []);

  // Initial and periodic refresh with dynamic interval
  useEffect(() => {
    fetchData();
    if (pollingInterval > 0) {
      const interval = setInterval(fetchData, pollingInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [pollingInterval]);

  // Handle local warning sound triggers on alert updates
  useEffect(() => {
    if (alerts.length > 0 && soundOnAlert) {
      const unreadAlerts = alerts.filter(a => !a.read);
      if (unreadAlerts.length > 0) {
        const lastAlertCount = Number(localStorage.getItem("sentry_last_alert_count") || "0");
        if (unreadAlerts.length > lastAlertCount) {
          playAlertBeep();
        }
        localStorage.setItem("sentry_last_alert_count", String(unreadAlerts.length));
      } else {
        localStorage.setItem("sentry_last_alert_count", "0");
      }
    } else {
      localStorage.setItem("sentry_last_alert_count", "0");
    }
  }, [alerts, soundOnAlert]);

  // Poll more aggressively when scan is running
  useEffect(() => {
    let scanPoll: NodeJS.Timeout;
    if (scanStatus?.isScanning) {
      scanPoll = setInterval(async () => {
        const res = await fetch("/api/scan/status");
        if (res.ok) {
          const statusObj: ScanStatus = await res.json();
          setScanStatus(statusObj);
          if (!statusObj.isScanning) {
            // scan finished, fully refresh
            fetchData();
          }
        }
      }, 1000);
    }
    return () => {
      if (scanPoll) clearInterval(scanPoll);
    };
  }, [scanStatus?.isScanning]);

  // Network manual Scan Triggers
  const startFullScan = async () => {
    try {
      const res = await fetch("/api/scan/start", { method: "POST" });
      if (res.ok) {
        setScanStatus(prev => prev ? { ...prev, isScanning: true, progress: 0 } : null);
        fetchData();
      }
    } catch (err) {
      console.error("Scan init failed:", err);
    }
  };

  // Toggle alert rule
  const handleToggleRule = async (ruleId: string) => {
    const updatedRules = rules.map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r);
    setRules(updatedRules);
    try {
      await fetch("/api/alerts/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedRules)
      });
      fetchData();
    } catch (err) {
      console.error("Failed to commit rules toggles:", err);
    }
  };

  // Create new custom Sentry rule
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleForm.name.trim()) return;

    const newRule: AlertRule = {
      id: "rule_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      name: newRuleForm.name.trim(),
      trigger: newRuleForm.trigger,
      targetId: newRuleForm.targetId,
      enabled: true
    };

    const updatedRules = [...rules, newRule];
    setRules(updatedRules);

    try {
      await fetch("/api/alerts/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedRules)
      });
      setNewRuleForm({
        name: "",
        trigger: "new_device",
        targetId: "all"
      });
      fetchData();
    } catch (err) {
      console.error("Failed to create rule:", err);
    }
  };

  // Delete custom Sentry rule
  const handleDeleteRule = async (ruleId: string) => {
    const updatedRules = rules.filter(r => r.id !== ruleId);
    setRules(updatedRules);

    try {
      await fetch("/api/alerts/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedRules)
      });
      fetchData();
    } catch (err) {
      console.error("Failed to delete rule:", err);
    }
  };

  // Add manually enrolled network device
  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceForm.mac || !newDeviceForm.ip) return;

    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newDeviceForm)
      });

      if (res.ok) {
        setIsAddModalOpen(false);
        setNewDeviceForm({
          mac: "",
          ip: "",
          nickname: "",
          hostname: "",
          vendor: "",
          deviceType: "other",
          notes: ""
        });
        fetchData();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to enrol item");
      }
    } catch (err) {
      console.error("Enrolment error:", err);
    }
  };

  // Open Device attributes Editor
  const openEditModal = (dev: Device) => {
    setEditingDevice(dev);
    setEditForm({
      nickname: dev.nickname || "",
      deviceType: dev.deviceType,
      isAlertsEnabled: dev.isAlertsEnabled,
      status: dev.status,
      ip: dev.ip,
      notes: dev.notes || ""
    });
  };

  // Save updated device attributes
  const handleSaveDeviceEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice) return;

    try {
      const res = await fetch(`/api/devices/${editingDevice.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm)
      });

      if (res.ok) {
        setEditingDevice(null);
        fetchData();
      }
    } catch (err) {
      console.error("Failed storing device inventory modifications:", err);
    }
  };

  // Forget device
  const handleForgetDevice = async (id: string) => {
    if (!confirm("Are you sure you want to scrub this device MAC address and all its recorded notes from the inventory?")) {
      return;
    }

    try {
      const res = await fetch(`/api/devices/${id}`, { method: "DELETE" });
      if (res.ok) {
        setEditingDevice(null);
        fetchData();
      }
    } catch (err) {
      console.error("Delete device failure:", err);
    }
  };

  // Prune offline devices
  const handlePruneOffline = async () => {
    if (!confirm("Are you sure you want to remove all offline devices from the inventory? This cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch("/api/devices/offline", { method: "DELETE" });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Prune devices failure:", err);
    }
  };

  // Test Webhook configurations
  const handleTestWebhook = async () => {
    setTestWebhookLoading(true);
    setWebhookMessage(null);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: webhooks.provider,
          url: webhooks.url,
          enabled: webhooks.enabled,
          isTest: true
        })
      });

      const data = await res.json();
      if (res.ok) {
        setWebhookMessage({ type: "success", text: "Webhook validated! Mock notification posted to Discord/Slack channel." });
      } else {
        setWebhookMessage({ type: "error", text: data.error || "Integration verification failed" });
      }
    } catch (err: any) {
      setWebhookMessage({ type: "error", text: err.message || "Failed to reach endpoint target" });
    } finally {
      setTestWebhookLoading(false);
    }
  };

  // Save general Webhook triggers configuration
  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveWebhookLoading(true);
    setWebhookMessage(null);

    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: webhooks.provider,
          url: webhooks.url,
          enabled: webhooks.enabled,
          isTest: false
        })
      });

      if (res.ok) {
        setWebhookMessage({ type: "success", text: "Channel criteria changes successfully applied to monitoring server." });
        fetchData();
      } else {
        const err = await res.json();
        setWebhookMessage({ type: "error", text: err.error || "Failed storing rules" });
      }
    } catch (err) {
      setWebhookMessage({ type: "error", text: "Failed storing general settings" });
    } finally {
      setSaveWebhookLoading(false);
    }
  };

  // Mark alerts read
  const markAlertsRead = async (id?: string) => {
    try {
      await fetch("/api/alerts/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // Clear alerts list
  const clearAlertLogs = async () => {
    if (!confirm("Remove all recorded security warnings? This does not alter physical CSV history audits.")) return;
    try {
      await fetch("/api/alerts", { method: "DELETE" });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // Filter device lists
  const filteredDevices = devices.filter(d => {
    // Text search
    const textStr = `${d.ip} ${d.mac} ${d.hostname || ""} ${d.nickname || ""} ${d.vendor || ""} ${d.notes || ""}`.toLowerCase();
    const matchesSearch = textStr.includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filter === "online") return d.status === "online";
    if (filter === "offline") return d.status === "offline";
    if (filter === "iot") return d.deviceType === "iot";
    if (filter === "flagged") return d.isAlertsEnabled;
    return true; 
  });

  return (
    <div className="flex flex-col min-h-screen bg-[#06080e] text-slate-300 font-sans antialiased selection:bg-indigo-500/30 selection:text-white">
      {/* HEADER SECTION LAYOUT */}
      <header className="flex flex-col md:flex-row items-stretch md:items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0c0d12] gap-4">
        <div className="flex items-center gap-3">
        <img src={logo} alt="LAN Sentry Logo" className="w-10 h-10 object-contain rounded-full" />
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              LAN Sentry <span 
                id="header-version-badge"
                onClick={() => setActiveTab("settings")}
                className={`text-[10px] sm:text-[11px] font-mono px-2 py-0.5 rounded-md border transition-all duration-300 cursor-pointer shadow-sm select-none ${
                  versionInfo?.hasUpdate 
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/35 hover:bg-amber-500/20 shadow-amber-500/5 hover:border-amber-400/50" 
                    : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20 clickable"
                }`}
                title={versionInfo?.hasUpdate ? `GitHub update available: ${versionInfo.latestGitHubVersion}! Click to preview.` : "LAN Sentry - Local diagnostic release info"}
              >
                {versionInfo?.version || "Unknown Version"}
                {versionInfo?.hasUpdate && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 px-1 py-0.2 text-[8px] tracking-tight bg-amber-500 text-slate-950 font-sans font-extrabold rounded">
                    NEW RELEASE
                  </span>
                )}
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-widest flex items-center gap-1.5">
              <span>Local Self-Host Mode</span>
              <span>•</span>
              <span className="text-slate-400">{stats?.subnet || "192.168.1.0/24"} Subnet</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Scanning status indicator banner */}
          {scanStatus?.isScanning ? (
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 bg-indigo-505/10 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></span>
              <span className="text-xs font-mono font-medium text-indigo-400 uppercase tracking-wider">SCANNING DEV_POOL...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-xs font-mono font-medium text-green-400 uppercase tracking-wider">Sentry Monitoring Active</span>
            </div>
          )}

          {/* Prune Offline Hosts action button */}
          <button
            onClick={handlePruneOffline}
            disabled={scanStatus?.isScanning || !devices.some(d => d.status === "offline")}
            className="px-4 py-2 border rounded-lg text-xs font-mono transition-all duration-250 flex items-center gap-1.5 hover:scale-102 cursor-pointer bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20 shadow-md shadow-rose-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Remove all offline devices from inventory"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Prune Offline Hosts
          </button>

          {/* Core manual trigger action button */}
          <button
            id="header-scan-trigger-btn"
            onClick={startFullScan}
            disabled={scanStatus?.isScanning}
            className={`px-4 py-2 border rounded-lg text-xs font-mono transition-all duration-250 flex items-center gap-1.5 hover:scale-102 cursor-pointer ${
              scanStatus?.isScanning
                ? "bg-slate-900 border-white/5 text-slate-500 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-500 border-indigo-500/30 text-white shadow-md shadow-indigo-900/10"
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanStatus?.isScanning ? "animate-spin" : ""}`} />
            Quick Refresh
          </button>
        </div>
      </header>

      {/* CORE WORKSPACE ENVIRONMENT */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* ASIDE SIDEBAR COLUMN */}
        <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-white/5 bg-[#090b10] p-6 space-y-6 shrink-0">
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">DASHBOARD NAVIGATION</h2>
            <nav className="flex flex-col gap-1.5">
              <button
                id="tab-devices"
                onClick={() => setActiveTab("devices")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium tracking-tight transition-all cursor-pointer ${
                  activeTab === "devices"
                    ? "bg-white/10 text-white border border-white/10"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Cpu className="w-4 h-4 text-indigo-400" /> Device Network Pool
                </span>
                <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-mono">
                  {devices.length}
                </span>
              </button>

              <button
                id="tab-webhooks"
                onClick={() => setActiveTab("webhooks")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium tracking-tight transition-all cursor-pointer ${
                  activeTab === "webhooks"
                    ? "bg-white/10 text-white border border-white/10"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Slack className="w-4 h-4 text-purple-400" /> Webhook Alert Rules
                </span>
                <span className={`w-1.5 h-1.5 rounded-full ${webhooks.enabled ? "bg-green-500" : "bg-slate-700"}`}></span>
              </button>

              <button
                id="tab-rules"
                onClick={() => setActiveTab("rules")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium tracking-tight transition-all cursor-pointer ${
                  activeTab === "rules"
                    ? "bg-white/10 text-white border border-white/10"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Sliders className="w-4 h-4 text-emerald-400" /> Subnet Rules
                </span>
                <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] font-mono">
                  {rules.filter(r => r.enabled).length} ON
                </span>
              </button>

              <button
                id="tab-history"
                onClick={() => setActiveTab("history")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium tracking-tight transition-all cursor-pointer ${
                  activeTab === "history"
                    ? "bg-white/10 text-white border border-white/10"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Terminal className="w-4 h-4 text-amber-400" /> Historic CSV Log Auditing
                </span>
                <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] font-mono">
                  {historyLogs.length} events
                </span>
              </button>

              <button
                id="tab-settings"
                onClick={() => setActiveTab("settings")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium tracking-tight transition-all cursor-pointer ${
                  activeTab === "settings"
                    ? "bg-white/10 text-white border border-white/10"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Settings className="w-4 h-4 text-pink-400 animate-spin-slow" /> Diagnostic Settings
                </span>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-pink-500"></span>
                </span>
              </button>
            </nav>
          </div>

          {/* Quick interactive parameters */}
          <div className="pt-4 border-t border-white/5 space-y-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">INTEGRATION RECOVERY</h2>
            <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
              <div className="flex items-center gap-2 text-slate-400 text-[11px] font-mono">
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Audit backup: CSV format</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
                Appends network sweeps, new hardware connections, status offline occurrences, and IP lease modifications inside server database CSV file logs.
              </p>
              <a
                href="/api/history/download"
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-white/5 border border-white/10 text-white hover:bg-white/10 text-xs font-medium rounded-lg transition-colors font-mono"
              >
                <Download className="w-3.5 h-3.5" />
                DOWNLOAD CSV FILE
              </a>
            </div>
          </div>

        </aside>

        {/* MAIN BODY AREA PANEL */}
        <section className="flex-1 p-6 md:p-8 space-y-6 overflow-y-auto max-w-full">
          {/* Top Network Sweeps Indicator panel */}
          <ScannerControls status={scanStatus} onStartScan={startFullScan} subnet={stats?.subnet} />

          {/* Stats Bar */}
          <NetworkStatsView stats={stats} />

          {/* Tab Content 1: Devices Network Pool */}
          {activeTab === "devices" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white font-display">Inventory Database</h3>
                  <p className="text-xs text-slate-400">Manage device designations, static notes, and connectivity rules</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Search input bar */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search MAC, IP, Name or Vendor..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-white/5 border border-white/5 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 w-56 font-mono"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery("")} className="absolute right-2 top-2.5 text-slate-500 hover:text-white">
                        <X className="w-3.1 h-3.1" />
                      </button>
                    )}
                  </div>

                  {/* Device List Filter buttons */}
                  <div className="flex bg-white/5 p-1 rounded-lg border border-white/5 text-[11px] font-mono leading-none">
                    <button
                      id="filter-all"
                      onClick={() => setFilter("all")}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        filter === "all" ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      All ({devices.length})
                    </button>
                    <button
                      id="filter-online"
                      onClick={() => setFilter("online")}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        filter === "online" ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Online ({devices.filter(d => d.status === "online").length})
                    </button>
                    <button
                      id="filter-iot"
                      onClick={() => setFilter("iot")}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        filter === "iot" ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      IoT ({devices.filter(d => d.deviceType === "iot").length})
                    </button>
                    <button
                      id="filter-flagged"
                      onClick={() => setFilter("flagged")}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        filter === "flagged" ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Sentry Alert ({devices.filter(d => d.isAlertsEnabled).length})
                    </button>
                  </div>

                  {/* Add manual device button */}
                  <button
                    id="add-manual-device-btn"
                    onClick={() => setIsAddModalOpen(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/20 text-white text-xs font-mono font-medium rounded-lg flex items-center gap-1 hover:scale-102 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Enrol Host
                  </button>
                </div>
              </div>

              {/* Devices Grid View/Table Container */}
              {(() => {
                const cellPadding = uiDensity === "compact" ? "px-4 py-2" : "px-6 py-4";
                return (
                  <div className="overflow-x-auto rounded-xl border border-white/5 bg-white/1">
                    {filteredDevices.length === 0 ? (
                      <div className="py-12 text-center">
                        <AlertTriangle className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400 text-sm font-semibold">No hosts found matching filtering criteria</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">Try clearing your text query state, or start a network sweep scan to map active IP ranks.</p>
                      </div>
                    ) : (
                      <table className="w-full text-sm text-left border-collapse">
                        <thead>
                          <tr className="bg-white/5 text-slate-500 font-mono text-[10px] uppercase tracking-widest border-b border-white/5">
                            <th className={cellPadding}>State</th>
                            <th className={cellPadding}>Host designation (Nickname)</th>
                            <th className={cellPadding}>Subnet Lease IP</th>
                            <th className={cellPadding}>ICMP Ping</th>
                            <th className={cellPadding}>Physical MAC Address</th>
                            <th className={cellPadding}>vendor</th>
                            <th className={`${cellPadding} text-right`}>Inventory Edits</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {filteredDevices.map(device => {
                            return (
                              <tr 
                                key={device.id} 
                                className={`hover:bg-white/3 transition-colors group ${
                                  device.status === "offline" ? "opacity-60 bg-slate-950/25" : ""
                                }`}
                              >
                                {/* State Indicator */}
                                <td className={cellPadding}>
                                  <div className="flex items-center gap-3">
                                    {device.status === "online" ? (
                                      <div className="relative">
                                        <div className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_8px_#10b981]"></div>
                                        <div className="absolute inset-0 w-2.5 h-2.5 bg-green-500 rounded-full animate-ping opacity-60"></div>
                                      </div>
                                    ) : (
                                      <div className="w-2.5 h-2.5 bg-slate-700 rounded-full"></div>
                                    )}
                                    <span className={`text-[10px] font-mono tracking-wider uppercase font-extrabold ${
                                      device.status === "online" ? "text-green-400" : "text-slate-500"
                                    }`}>
                                      {device.status}
                                    </span>
                                  </div>
                                </td>

                                {/* Designation */}
                                <td className={cellPadding}>
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-white tracking-wide">
                                        {device.nickname || device.hostname || "Unlabeled hardware client"}
                                      </span>

                                      {/* Custom Device Type Badge info */}
                                      <span className="text-[9px] bg-slate-800 text-slate-400 border border-slate-700/60 px-1.5 py-0.2 rounded font-mono uppercase">
                                        {device.deviceType}
                                      </span>
                                    </div>
                                    <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                                      <span>Hostname: <code className="text-indigo-400/80">{device.hostname || "unknown"}</code></span>
                                      {device.notes && (
                                        <>
                                          <span>•</span>
                                          <span className="truncate max-w-xs text-slate-500 italic" title={device.notes}>"{device.notes}"</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* Subnet Lease IP */}
                                <td className={cellPadding}>
                                  <code className="text-xs font-mono text-slate-200 bg-slate-900 px-1.5 py-0.5 rounded border border-white/5">
                                    {device.ip}
                                  </code>
                                </td>

                                {/* ICMP Latency Ping */}
                                <td className={cellPadding}>
                                  {device.status === "online" && device.latency !== undefined && device.latency !== null ? (
                                    <div className="flex items-center gap-1.5 font-mono text-xs">
                                      <span className={`w-1.5 h-1.5 rounded-full ${
                                        device.latency < 5 ? "bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse" :
                                        device.latency < 15 ? "bg-green-400" :
                                        device.latency < 35 ? "bg-amber-400" :
                                        "bg-rose-400"
                                      }`} />
                                      <span className="text-white font-semibold">{device.latency}</span>
                                      <span className="text-[10px] text-slate-500">ms</span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-600 font-mono text-xs select-none">-</span>
                                  )}
                                </td>

                                {/* MAC Address physical */}
                                <td className={cellPadding}>
                                  <code className="text-xs font-mono text-slate-500 uppercase tracking-widest">{device.mac}</code>
                                </td>

                                {/* Hardware Vendor */}
                                <td className={cellPadding}>
                                  <div className="flex flex-col">
                                    <span className="text-slate-400 text-xs font-mono">{device.vendor || "Unknown Vendor"}</span>
                                    <span className="text-[10px] text-slate-500 font-mono">Via: {device.discoveryMethod}</span>
                                  </div>
                                </td>

                                {/* Inventory actions */}
                                <td className={`${cellPadding} text-right`}>
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      id={`edit-device-${device.id.replace(/:/g, '-')}`}
                                      onClick={() => openEditModal(device)}
                                      className="p-1 px-2.5 bg-slate-800 hover:bg-slate-705 border border-slate-700/50 text-slate-200 hover:text-white rounded-lg text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer"
                                      title="Edit labeling criteria"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" /> Edit
                                    </button>
                                    <button
                                      id={`forget-device-${device.id.replace(/:/g, '-')}`}
                                      onClick={() => handleForgetDevice(device.id)}
                                      className="p-1.5 bg-slate-950 hover:bg-rose-950/40 text-slate-600 hover:text-rose-400 rounded-lg text-xs transition-colors border border-white/5 hover:border-rose-900/40 cursor-pointer"
                                      title="Scrub device records"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Tab Content 2: Webhook criteria credentials & configurations */}
          {activeTab === "webhooks" && (
            <div className="bg-[#12141a]/85 backdrop-blur-md border border-white/5 p-6 md:p-8 rounded-xl space-y-6 animate-fadeIn">
              <div>
                <h3 className="text-md md:text-lg font-bold text-white font-display">Provider Outbound Integration Settings</h3>
                <p className="text-xs text-slate-400">Broadcasting network state warning alerts directly into diagnostic communication streams</p>
              </div>

              <form onSubmit={handleSaveWebhook} className="space-y-6 max-w-2xl font-mono text-xs">
                <div className="bg-[#0c0d12] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-white font-semibold">Allow Webhook Submissions</p>
                    <p className="text-[11px] text-slate-500">Enable posting rule breaches, unrecognized intruders matching MAC boundaries</p>
                  </div>
                  <div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={webhooks.enabled}
                        onChange={(e) => setWebhooks({ ...webhooks, enabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-2 uppercase tracking-wide">Select Communication Webhook Provider</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setWebhooks({ ...webhooks, provider: "discord" })}
                        className={`p-4 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                          webhooks.provider === "discord"
                            ? "bg-slate-850 border-indigo-505 border-indigo-500/50 text-white"
                            : "bg-[#0c0d12] border-white/5 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#5865F2]/20 flex items-center justify-center text-[#5865F2]">
                          <Wifi className="w-5 h-5" />
                        </div>
                        <div className="text-left leading-tight">
                          <p className="font-semibold text-xs">Discord Integration</p>
                          <p className="text-[10px] text-slate-500">JSON Embed formatting</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setWebhooks({ ...webhooks, provider: "slack" })}
                        className={`p-4 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                          webhooks.provider === "slack"
                            ? "bg-slate-850 border-purple-500/50 text-white"
                            : "bg-[#0c0d12] border-white/5 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center text-pink-400">
                          <Slack className="w-5 h-5" />
                        </div>
                        <div className="text-left leading-tight">
                          <p className="font-semibold text-xs">Slack API incoming</p>
                          <p className="text-[10px] text-slate-500">Standard Slack text block blocks</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-slate-400 font-semibold uppercase tracking-wide">Incoming URL Destination Endpoint</label>
                    <input
                      type="url"
                      placeholder={
                        webhooks.provider === "discord"
                          ? "https://discord.com/api/webhooks/..."
                          : "https://hooks.slack.com/services/..."
                      }
                      value={webhooks.url}
                      onChange={(e) => setWebhooks({ ...webhooks, url: e.target.value })}
                      required={webhooks.enabled}
                      className="w-full bg-[#0c0d12] border border-white/5 rounded-lg px-4 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
                    />
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Generated inside the channel integrations section of your Slack app workspace or Discord server channel parameters.
                    </p>
                  </div>
                </div>

                {webhookMessage && (
                  <div className={`p-4 rounded-lg flex items-start gap-2.5 text-xs border ${
                    webhookMessage.type === "success"
                      ? "bg-emerald-950/40 border-emerald-900/50 text-emerald-300"
                      : "bg-rose-950/40 border-rose-900/50 text-rose-300"
                  }`}>
                    <Info className="w-4 h-4 shrink-0" />
                    <span>{webhookMessage.text}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saveWebhookLoading}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-550 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-950/25 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    {saveWebhookLoading ? "Saving Configurations..." : "SAVE INTEGRATION CRITERIA"}
                  </button>

                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={testWebhookLoading || !webhooks.url}
                    className="py-2.5 px-6 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Activity className={`w-4 h-4 ${testWebhookLoading ? "animate-spin" : ""}`} />
                    RUN CHANNEL CONNECTION TEST
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tab Content 3: Alert Rules state logic */}
          {activeTab === "rules" && (
            <div className="space-y-6 animate-fadeIn font-mono text-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-md md:text-lg font-bold text-white font-display">Active Subnet Sentry Protection Rules</h3>
                  <p className="text-xs text-slate-400 font-sans">Manage automation filters that evaluate status updates inside ARP packets</p>
                </div>
              </div>

              {/* Custom Rule Creation Panel */}
              <div className="bg-[#0b0d12] border border-white/5 rounded-xl p-5 md:p-6 space-y-4">
                <div className="flex items-center gap-2 text-indigo-400 font-bold tracking-wider">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>ADD CUSTOM SECURITY RULE</span>
                </div>
                <form onSubmit={handleCreateRule} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className="space-y-1.5 col-span-1 md:col-span-1">
                    <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Rule Friendly Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Critical Camera Offline"
                      value={newRuleForm.name}
                      onChange={e => setNewRuleForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-[#12141a] border border-white/5 rounded-lg py-2 px-3 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Evaluation Trigger</label>
                    <select
                      value={newRuleForm.trigger}
                      onChange={e => setNewRuleForm(prev => ({ ...prev, trigger: e.target.value as AlertTrigger }))}
                      className="w-full bg-[#12141a] border border-white/5 rounded-lg py-2 px-3 text-white text-xs focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
                    >
                      <option value="new_device">New Unrecognized Device Detected</option>
                      <option value="device_offline">Inventory Device Went Offline</option>
                      <option value="device_online">Monitored Host Came Back Online</option>
                      <option value="ip_changed">DHCP Lease IP Address Changed</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Target Domain Mapping</label>
                    <select
                      value={newRuleForm.targetId}
                      onChange={e => setNewRuleForm(prev => ({ ...prev, targetId: e.target.value }))}
                      className="w-full bg-[#12141a] border border-white/5 rounded-lg py-2 px-3 text-white text-xs focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
                    >
                      <option value="all">Every connected hosts</option>
                      {devices.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.nickname || d.hostname || d.mac} ({d.ip})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 h-9 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    CREATE SENTRY RULE
                  </button>
                </form>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {rules.map(rule => (
                  <div 
                    key={rule.id} 
                    className={`p-5 rounded-xl border transition-all flex flex-col justify-between ${
                      rule.enabled 
                        ? "bg-[#12141a] border-white/5 shadow-md" 
                        : "bg-slate-950/30 border-white/5 opacity-50"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                            {rule.trigger}
                          </span>
                          <h4 className="text-sm font-semibold text-white mt-2 line-clamp-2">{rule.name}</h4>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 pt-1">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={rule.enabled}
                              onChange={() => handleToggleRule(rule.id)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1 text-slate-500 hover:text-rose-455 hover:text-rose-400 hover:bg-white/5 rounded transition-all cursor-pointer"
                            title="Delete Rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
                        {rule.trigger === "new_device" && `Triggers a Critical notification containing host MAC address parameters whenever an unmapped lease connects to the ${stats?.subnet || "192.168.1.0/24"} subnet is detected by live scanners.`}
                        {rule.trigger === "device_offline" && "Checks physical active records for the target host during scheduled sweep probes. Flags warning alert if heartbeat pings drop."}
                        {rule.trigger === "device_online" && "Registers automated notifications as soon as the target host responds to network echo packet inquiries."}
                        {rule.trigger === "ip_changed" && "Monitors DHCP leasing dynamics. Resolves alerts if host IP mapping rotates to mitigate MITM vector risks."}
                      </p>
                    </div>

                    <div className="text-[10px] text-slate-500 pt-3 border-t border-white/5 flex items-center justify-between">
                      <span className="truncate max-w-42.5" title={rule.targetId === "all" ? "Every connected hosts" : `Host ID: ${rule.targetId}`}>
                        Target: {rule.targetId === "all" ? "Every connected hosts" : `Host: ${rule.targetId}`}
                      </span>
                      <span>{rule.enabled ? "Active Protected" : "Inactive"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab Content 4: Historic CSV Log Auditing */}
          {activeTab === "history" && (
            <div className="space-y-4 animate-fadeIn font-mono text-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-md md:text-lg font-bold text-white font-display">Server Audit Log Events</h3>
                  <p className="text-xs text-slate-400 font-sans">CSV parsed data stream, containing hardware registrations, ARP scanning cycles, and alert triggers</p>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href="/api/history/download"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download raw CSV
                  </a>
                </div>
              </div>

              {/* History list parser */}
              <div className="overflow-hidden rounded-xl border border-white/5 bg-white/1">
                <div className="bg-white/5 px-6 py-3 border-b border-white/5 text-[10px] uppercase font-bold tracking-widest text-slate-500">
                  Last 100 System Events Log entries
                </div>
                <div className="divide-y divide-white/5 max-h-120 overflow-y-auto">
                  {historyLogs.length === 0 ? (
                    <div className="py-12 text-center text-slate-500">
                      No events registered in CSV database
                    </div>
                  ) : (
                    historyLogs.map(log => {
                      let colorClass = "text-slate-400";
                      if (log.action?.toLowerCase().includes("unrecognized") || log.action?.toLowerCase().includes("security")) {
                        colorClass = "text-rose-400 font-semibold";
                      } else if (log.action?.toLowerCase().includes("discovered") || log.action?.toLowerCase().includes("manual")) {
                        colorClass = "text-emerald-400";
                      } else if (log.action?.toLowerCase().includes("scan")) {
                        colorClass = "text-indigo-400";
                      }

                      return (
                        <div key={log.id} className="px-6 py-3.5 hover:bg-white/2 flex items-start justify-between md:items-center gap-4 transition-colors">
                          <div className="space-y-1">
                            <span className={`text-[11px] px-2 py-0.5 rounded font-bold uppercase ${
                              log.action?.toLowerCase().includes("security") || log.action?.toLowerCase().includes("warning")
                                ? "bg-rose-500/10 text-rose-400 border border-rose-900/40"
                                : log.action?.toLowerCase().includes("discovered")
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-900/40"
                                : "bg-slate-800 text-slate-400 border border-slate-700/50"
                            }`}>
                              {log.action || "Event Flagged"}
                            </span>
                            <p className="text-slate-300 text-[11px] leading-relaxed pt-1 max-w-2xl">{log.details}</p>
                            <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
                              {log.deviceId && <span>MAC: <code className="text-indigo-400/80">{log.deviceId}</code></span>}
                              {log.ip && <span>• IP: <code className="text-slate-400">{log.ip}</code></span>}
                              {log.nickname && <span>• Nickname: <span className="text-slate-400 italic">"{log.nickname}"</span></span>}
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-500 shrink-0 select-none">
                            {new Date(log.timestamp).toLocaleTimeString() || "Live Time"}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab Content 5: Sentry Diagnostic Profile Settings */}
          {activeTab === "settings" && (
            <div className="space-y-6 animate-fadeIn text-xs">
              <div className="border-b border-white/5 pb-4">
                <h3 className="text-md md:text-lg font-bold text-white font-display">System Settings & Diagnostic Profile</h3>
                <p className="text-xs text-slate-400 font-sans">Configure local background pooling rates, audio beacons, inventory list density, and security visual profiles</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Panel 1: Sentry Watcher Settings */}
                <div className="bg-[#12141a]/65 backdrop-blur-md p-6 rounded-xl border border-white/5 space-y-5">
                  <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                    <Activity className="w-4 h-4 text-pink-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Heartbeat & Watchdog Scan Rates</h4>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center text-[11px] mb-1.5 font-mono">
                        <span className="text-slate-400 uppercase tracking-tight">Active Background Polling Rate</span>
                        <span className="text-pink-400 font-bold bg-pink-500/10 px-2 py-0.5 rounded">
                          {pollingInterval > 0 ? `${pollingInterval} Seconds` : "Manual Updates Only"}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="30"
                        step="1"
                        value={pollingInterval}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setPollingInterval(val);
                          localStorage.setItem("sentry_polling_interval", String(val));
                        }}
                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                      />
                      <p className="text-[10px] text-slate-500 mt-1 font-sans">
                        Controls how frequently Sentry pulls ARP databases and alert buffers. Set to 0 to suspend automatic synchronization.
                      </p>
                    </div>

                    <div className="pt-2">
                      <div className="flex justify-between items-center text-[11px] mb-2 font-mono">
                        <span className="text-slate-400 uppercase tracking-tight">Subnet Scanning Coverage</span>
                        <span className="text-slate-300 font-bold bg-white/5 px-2 py-0.5 rounded">ARP Sweep Mode</span>
                      </div>
                      <select 
                        disabled
                        className="w-full bg-[#161921] border border-white/5 rounded-lg p-2.5 text-[11px] text-slate-400 font-mono focus:border-indigo-500/30 outline-none cursor-not-allowed"
                        defaultValue="fast_sweep"
                      >
                        <option value="fast_sweep">Standard Gateway Scan (Class C: /24 sweep)</option>
                        <option value="deep_full" disabled>Deep Port Scan (Full broadcast probe)</option>
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1.5 font-sans">
                        Sweeps IP mappings sequentially up to 254 active leases. Port scanning is set to stealth mode.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Panel 2: Preferences & Signals */}
                <div className="bg-[#12141a]/65 backdrop-blur-md p-6 rounded-xl border border-white/5 space-y-5">
                  <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                    <Bell className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Audio Alerts & Density Preference</h4>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-white/2 border border-white/5 rounded-lg">
                      <div className="space-y-0.5">
                        <span className="text-slate-300 font-bold block">Synthesizer Warning Beacon</span>
                        <span className="text-[10px] text-slate-500 font-sans block">Plays dual sine C5/A5 chime upon unrecognized intruder detection.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const val = !soundOnAlert;
                          setSoundOnAlert(val);
                          localStorage.setItem("sentry_sound_on_alert", String(val));
                          if (val) {
                            setTimeout(playAlertBeep, 100);
                          }
                        }}
                        className={`font-mono text-[10px] px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                          soundOnAlert 
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                            : "bg-slate-800 text-slate-400 border border-transparent"
                        }`}
                      >
                        {soundOnAlert ? "ACTIVE CHIME" : "MUTED"}
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-white/2 border border-white/5 rounded-lg">
                      <div className="space-y-0.5">
                        <span className="text-slate-300 font-bold block">Terminal List Density</span>
                        <span className="text-[10px] text-slate-500 font-sans block">Adjust spatial dimensions of the physical mac address list grid.</span>
                      </div>
                      <div className="flex bg-slate-900 p-0.5 rounded border border-white/5">
                        <button
                          type="button"
                          onClick={() => {
                            setUiDensity("comfortable");
                            localStorage.setItem("sentry_ui_density", "comfortable");
                          }}
                          className={`font-mono text-[10px] px-2 py-1 rounded transition-all cursor-pointer ${
                            uiDensity === "comfortable" ? "bg-white/10 text-white font-semibold" : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          Norm
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setUiDensity("compact");
                            localStorage.setItem("sentry_ui_density", "compact");
                          }}
                          className={`font-mono text-[10px] px-2 py-1 rounded transition-all cursor-pointer ${
                            uiDensity === "compact" ? "bg-white/10 text-white font-semibold" : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          Compact
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2.5: Licensing & Repository Sync */}
              <div className="bg-[#12141a]/65 backdrop-blur-md p-6 rounded-xl border border-white/5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Open-Source Licensing & Credits</h4>
                  </div>
                  {versionInfo?.githubRepo && (
                    <a 
                      href={versionInfo.githubRepo}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 bg-indigo-500/5 hover:bg-indigo-500/10 px-2.5 py-1 rounded transition-colors"
                    >
                      <Github className="w-3.5 h-3.5" /> github repository
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  {/* Left block: Release sync state */}
                  <div className="space-y-3 bg-white/1 p-4 rounded-lg border border-white/5">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300">
                      <Tag className="w-3.5 h-3.5 text-[#a5b4fc]" />
                      <span>Release Synchronization</span>
                    </div>

                    <div className="space-y-2 select-none">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-slate-500">Local Release:</span>
                        <span className="text-white font-bold bg-slate-800 px-1.5 py-0.5 rounded">{versionInfo?.version || "v1.2.4-stable"}</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-slate-500">GitHub Remote:</span>
                        <span className="text-white font-bold">
                          {versionInfo?.latestGitHubVersion ? (
                            <span className="bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/10">{versionInfo.latestGitHubVersion}</span>
                          ) : versionInfo?.gitHubFetchError ? (
                            <span className="text-slate-550 text-slate-400 italic text-[9px]">{versionInfo.gitHubFetchError}</span>
                          ) : (
                            <span className="text-indigo-300 font-medium animate-pulse">Checking remote...</span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-slate-500">Update Available:</span>
                        <span>
                          {versionInfo?.hasUpdate ? (
                            <span className="text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 animate-pulse">Yes (Patch ready)</span>
                          ) : (
                            <span className="text-green-405 text-emerald-400 font-semibold bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/15">Latest release active</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {versionInfo?.hasUpdate && versionInfo?.latestGitHubReleaseUrl && (
                      <div className="pt-2">
                        <a 
                          href={versionInfo.latestGitHubReleaseUrl}
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-mono font-extrabold rounded-md transition-all text-center uppercase"
                        >
                          Pull Release Updates
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Middle block: Credits */}
                  <div className="space-y-2 xl:col-span-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300">
                      <Info className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Host Credits & Ecosystem</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-400 font-sans">
                      {versionInfo?.credits || "LAN Sentry is a self-hosted client-side device manager with automated network audits, active ARP broad sweeps, and notification webhooks built by the community."}
                    </p>
                    <div className="text-[10px] text-slate-500 pt-1 font-mono">
                      Maintained by: <a href={versionInfo?.githubRepo || "https://github.com/mati23032006"} target="_blank" rel="noopener noreferrer" className="text-indigo-400 font-semibold hover:underline">@{versionInfo?.author || "mati23032006"}</a>
                    </div>
                  </div>

                  {/* Right block: License */}
                  <div className="space-y-2 xl:col-span-1">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                        <span>{versionInfo?.license || "MIT License"} Terms</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">OSI Compliant</span>
                    </div>
                    <div className="bg-[#0b0c10] border border-white/5 p-3 rounded-lg text-[9px] font-mono text-slate-500 h-28 overflow-y-auto leading-relaxed whitespace-pre-line select-text">
                      {versionInfo?.licenseText || "Permission is hereby granted MIT License..."}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Danger Zone Actions */}
              <div className="bg-[#1a0f12]/40 backdrop-blur-md p-6 rounded-xl border border-rose-950/30 space-y-5">
                <div className="flex items-center gap-2 border-b border-rose-950/40 pb-3">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider font-mono">System Recovery & Purges</h4>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans text-xs">
                  <div className="space-y-1">
                    <span className="font-semibold font-mono block uppercase text-[10px] tracking-wider text-rose-300/80">Wipe Notification alert records</span>
                    <p className="text-[11px] text-slate-400 max-w-xl">
                      Resets diagnostic warning buffers. This clears all security warnings in active memory and logs. This operation cannot be undone.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm("Are you sure you want to clear all active network alert events?")) {
                        await clearAlertLogs();
                        playAlertBeep();
                        alert("Diagnostic notification logs cleared successfully.");
                      }
                    }}
                    className="sm:self-center px-4 py-2 bg-rose-950 hover:bg-rose-900 border border-rose-900/40 text-rose-300 rounded-lg font-medium transition-all font-mono text-[10px] cursor-pointer text-center"
                  >
                    PURGE ALL WARNINGS
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Alerts & Environment Grid layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            {/* Warning log box */}
            <div className="bg-[#12141a]/65 backdrop-blur-md p-5 rounded-xl border border-white/5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-rose-500" />
                    Security Event Log Warning history
                  </h4>
                  {alerts.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => markAlertsRead()}
                        className="text-[10px] font-mono text-indigo-400 hover:text-white cursor-pointer"
                      >
                        Mark all read
                      </button>
                      <span className="text-slate-700">|</span>
                      <button
                        onClick={clearAlertLogs}
                        className="text-[10px] font-mono text-rose-400 hover:text-white cursor-pointer"
                        title="Scrub alert cache on server"
                      >
                        Scrub
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4 max-h-56 overflow-y-auto pr-1">
                  {alerts.length === 0 ? (
                    <div className="py-6 text-center text-slate-500 text-xs font-mono">
                      No warning alert triggers recorded
                    </div>
                  ) : (
                    alerts.map(a => (
                      <div 
                        key={a.id} 
                        className={`text-xs font-mono p-3 rounded-lg border flex gap-3 transition-colors ${
                          a.read 
                            ? "bg-[#0c0d12]/45 border-white/5 opacity-60" 
                            : "bg-indigo-950/20 border-indigo-900/30 text-indigo-200"
                        }`}
                      >
                        <div className="shrink-0 pt-0.5">
                          {a.severity === "critical" ? (
                            <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
                          ) : (
                            <Info className="w-4 h-4 text-indigo-400" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-100 flex items-center gap-1.5 flex-wrap">
                            {a.title}
                            {!a.read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                            )}
                          </p>
                          <p className="text-[11px] text-slate-400 leading-relaxed font-sans">{a.message}</p>
                          <p className="text-[9px] text-slate-500">
                            {new Date(a.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Server diagnostic telemetry & memory diagnostics */}
            <div id="diagnostics-telemetry-box" className="bg-[#12141a]/65 backdrop-blur-md p-5 rounded-xl border border-white/5 flex flex-col justify-between font-mono text-xs hover:border-indigo-500/30 transition-all duration-300">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    Diagnostics & Live Telemetry
                  </h4>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 text-[11px] select-none">
                  <div>
                    <span className="text-slate-500 block uppercase text-[10px] tracking-widest mb-0.5">Heap memory load</span>
                    <span className="text-white font-semibold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                      {stats?.memoryUsage?.split(' ')[0] || "Computing..."}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase text-[10px] tracking-widest mb-0.5">Process RSS memory</span>
                    <span className="text-indigo-300 font-semibold">
                      {stats?.memoryUsage?.split(' ')[1]?.replace('RSS:', '') || "Computing..."}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase text-[10px] tracking-widest mb-0.5">Database storage</span>
                    <span className="text-white font-semibold font-mono flex items-center gap-1">
                      {devices.length} Hosts
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase text-[10px] tracking-widest mb-0.5">Active Rules count</span>
                    <span className="text-white font-semibold">
                      {rules.filter(r => r.enabled).length} Alert Rules
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase text-[10px] tracking-widest mb-0.5">Server runtime uptime</span>
                    <span className="text-[#e2e8f0] font-medium flex items-center gap-1">
                      {(() => {
                        if (stats?.systemUptime === undefined) return "Connecting...";
                        const sec = stats.systemUptime;
                        const h = Math.floor(sec / 3600);
                        const m = Math.floor((sec % 3600) / 60);
                        const s = sec % 60;
                        if (h > 0) return `${h}h ${m}m ${s}s`;
                        if (m > 0) return `${m}m ${s}s`;
                        return `${s}s`;
                      })()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase text-[10px] tracking-widest mb-0.5">Subnet Gateway interface</span>
                    <span className="text-slate-300">
                      {(() => {
                        if (!stats?.interfaceName) return "Calculating...";
                        const match = stats.interfaceName.match(/^([^(]+)/);
                        return match ? match[1].trim() : stats.interfaceName;
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-4 mt-4 border-t border-white/5 text-[10px]">
                <div className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/10 rounded-md text-emerald-400 font-semibold flex items-center gap-1 select-none">
                  <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse"></span>
                  ARP: {scanStatus?.isScanning ? "PROBING HARDWARE" : "POLLING LIVE"}
                </div>
                <div className="px-2.5 py-1 bg-white/3 border border-white/5 rounded-md text-slate-400 flex items-center gap-1">
                  <span className="text-slate-600 select-none">•</span>
                  DB Engine: Synced JSON Storage
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* RE-USABLE MODAL: ENROL DEVICE FORM */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0d12] border border-white/10 p-6 md:p-8 rounded-xl max-w-md w-full space-y-5 shadow-2xl uppercase tracking-wide font-mono text-xs animate-scaleIn">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-md font-bold text-white font-display uppercase">Enrol hardware lease manually</h3>
              <button 
                onClick={() => setIsAddModalOpen(false)} 
                className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddDevice} className="space-y-4 text-left">
              <div className="space-y-1">
                <label className="text-slate-400 uppercase block tracking-wider font-semibold">MAC Address designation (ID)</label>
                <input
                  type="text"
                  placeholder="e.g. AA:BB:CC:00:11:22"
                  value={newDeviceForm.mac}
                  onChange={(e) => setNewDeviceForm({ ...newDeviceForm, mac: e.target.value })}
                  required
                  className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-slate-200 uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-400 uppercase block tracking-wider font-semibold">IP Address lease</label>
                  <input
                    type="text"
                    placeholder="e.g. 192.168.56.50"
                    value={newDeviceForm.ip}
                    onChange={(e) => setNewDeviceForm({ ...newDeviceForm, ip: e.target.value })}
                    required
                    className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-slate-200"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 uppercase block tracking-wider font-semibold">Device category</label>
                  <select
                    value={newDeviceForm.deviceType}
                    onChange={(e) => setNewDeviceForm({ ...newDeviceForm, deviceType: e.target.value as DeviceType })}
                    className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-slate-200"
                  >
                    <option value="other">Other/Generic</option>
                    <option value="mobile">Mobile/Tablet</option>
                    <option value="laptop">Laptop/Notebook</option>
                    <option value="desktop">Desktop Terminal</option>
                    <option value="smart-tv">Smart TV / Screen</option>
                    <option value="iot">IoT / Smart-home hub</option>
                    <option value="router">Core Router/Switch</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 uppercase block tracking-wider font-semibold">Manual Nickname / Label</label>
                <input
                  type="text"
                  placeholder="e.g. Kitchen Smart Speaker"
                  value={newDeviceForm.nickname}
                  onChange={(e) => setNewDeviceForm({ ...newDeviceForm, nickname: e.target.value })}
                  className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-slate-200"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 uppercase block tracking-wider font-semibold">Hardware Vendor info</label>
                <input
                  type="text"
                  placeholder="e.g. Raspberry Pi / Sonos"
                  value={newDeviceForm.vendor}
                  onChange={(e) => setNewDeviceForm({ ...newDeviceForm, vendor: e.target.value })}
                  className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-slate-200"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 uppercase block tracking-wider font-semibold">Admin Static notes</label>
                <textarea
                  placeholder="Static security details..."
                  value={newDeviceForm.notes}
                  onChange={(e) => setNewDeviceForm({ ...newDeviceForm, notes: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-slate-200 text-xs font-sans"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium border border-indigo-500/20 shadow-md cursor-pointer"
                >
                  ADD CLIENT
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-705 border border-white/5 text-slate-300 rounded-lg transition-colors cursor-pointer"
                >
                  CANCEL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RE-USABLE MODAL: EDIT DEVICE DETAILS FORM */}
      {editingDevice && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0d12] border border-white/10 p-6 md:p-8 rounded-xl max-w-md w-full space-y-5 shadow-2xl uppercase tracking-wide font-mono text-xs animate-scaleIn">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-md font-bold text-white font-display text-left">Modify Device attributes</h3>
              <button 
                onClick={() => setEditingDevice(null)} 
                className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDeviceEdits} className="space-y-4 text-left">
              <div className="space-y-2 bg-[#12141a]/60 p-3 rounded-lg border border-white/5 mb-2 leading-relaxed text-[11px] font-sans">
                <p className="font-mono text-slate-300 font-bold uppercase text-xs">Device details:</p>
                <p className="text-slate-400">
                  MAC address: <code className="text-indigo-400 font-semibold">{editingDevice.mac}</code>
                </p>
                <p className="text-slate-400">
                  Current Vendor profile: <span className="text-indigo-400">{editingDevice.vendor || "No vendor string parsed"}</span>
                </p>
                <p className="text-slate-400">
                  Discovery type: <span className="text-indigo-400 font-mono text-[10px]">{editingDevice.discoveryMethod} connection</span>
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 uppercase block tracking-wider font-semibold">Nickname / Label</label>
                <input
                  type="text"
                  placeholder="Assign custom name..."
                  value={editForm.nickname}
                  onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                  className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-300 uppercase block tracking-wider font-semibold">Lease IP</label>
                  <input
                    type="text"
                    value={editForm.ip}
                    onChange={(e) => setEditForm({ ...editForm, ip: e.target.value })}
                    required
                    className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-slate-200"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 uppercase block tracking-wider font-semibold">Device Category</label>
                  <select
                    value={editForm.deviceType}
                    onChange={(e) => setEditForm({ ...editForm, deviceType: e.target.value as DeviceType })}
                    className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-slate-200"
                  >
                    <option value="other">Other/Generic</option>
                    <option value="mobile">Mobile/Tablet</option>
                    <option value="laptop">Laptop/Notebook</option>
                    <option value="desktop">Desktop Terminal</option>
                    <option value="smart-tv">Smart TV / Screen</option>
                    <option value="iot">IoT / Smart-home hub</option>
                    <option value="router">Core Router/Switch</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-400 uppercase block tracking-wider font-semibold">Live status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as "online" | "offline" })}
                    className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-slate-200"
                  >
                    <option value="online">Online State</option>
                    <option value="offline">Offline State</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 uppercase block tracking-wider font-semibold">Sentry Protection</label>
                  <select
                    value={editForm.isAlertsEnabled ? "true" : "false"}
                    onChange={(e) => setEditForm({ ...editForm, isAlertsEnabled: e.target.value === "true" })}
                    className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-slate-200"
                  >
                    <option value="true">Enable State Alerts</option>
                    <option value="false">Mute Alerts</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 uppercase block tracking-wider font-semibold">Notes / Maintenance Log</label>
                <textarea
                  placeholder="Attach notes about ownership or interface ports..."
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-slate-200 text-xs font-sans"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-550 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium border border-indigo-500/20 shadow-md cursor-pointer"
                >
                  SAVE DETAILS
                </button>
                <button
                  type="button"
                  onClick={() => handleForgetDevice(editingDevice.id)}
                  className="flex-1 py-2.5 bg-rose-950 hover:bg-rose-900 hover:text-white border border-rose-900 text-rose-300 rounded-lg transition-all cursor-pointer"
                >
                  SCRUB CLIENT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FOOTER BAR SPECS SECTION */}
      <footer className="bg-[#07080c] border-t border-white/5 py-4 px-6 md:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[10px] text-slate-500">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1.5 text-slate-400">
          <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/10">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            <span>SYSTEM ACTIVE</span>
          </div>
          <span className="text-slate-700 select-none">•</span>
          <span className="text-slate-500">STORE:</span>
          <span className="text-slate-300">{stats?.dbType || "JSON DB Engine"}</span>
          <span className="text-slate-700 select-none">•</span>
          <span className="text-slate-500">ACTIVE RULES:</span>
          <span className="text-slate-300">{stats?.rulesCount ?? 0} Loaded</span>
          <span className="text-slate-700 select-none">•</span>
          <span className="font-bold text-indigo-400/90">HEAP MEM:</span>
          <span className="text-slate-300 font-semibold">{stats?.memoryUsage || "Computing..."}</span>
          <span className="text-slate-700 select-none">•</span>
          <span className="text-slate-500">UPTIME:</span>
          <span className="text-slate-300">
            {(() => {
              if (stats?.systemUptime === undefined) return "N/A";
              const sec = stats.systemUptime;
              const h = Math.floor(sec / 3600);
              const m = Math.floor((sec % 3600) / 60);
              const s = sec % 60;
              if (h > 0) return `${h}h ${m}m ${s}s`;
              if (m > 0) return `${m}m ${s}s`;
              return `${s}s`;
            })()}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-[10px] text-slate-500 flex items-center gap-2 bg-white/2 hover:bg-white/4 px-3 py-1.5 rounded-lg border border-white/5 transition-all">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
            </span>
            <span className="text-slate-400 tracking-wider font-semibold">GATEWAY SCANNER</span>
            <span className="text-slate-700 select-none">•</span>
            <span className="text-indigo-400 font-bold">
              {(() => {
                if (!stats?.interfaceName) return "127.0.0.1";
                const match = stats.interfaceName.match(/\(([^)]+)\)/);
                return match ? match[1] : "127.0.0.1";
              })()}:3000
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
