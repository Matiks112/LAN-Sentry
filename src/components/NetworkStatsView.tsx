/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { NetworkStats } from "../types";
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  ShieldAlert, 
  Cpu, 
  Network, 
  CalendarDays 
} from "lucide-react";

interface StatsProps {
  stats: NetworkStats | null;
}

export default function NetworkStatsView({ stats }: StatsProps) {
  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-slate-900 border border-slate-800 rounded-xl p-5" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 font-sans">
      {/* Total Active Connected Card */}
      <div id="stats-total-card" className="bg-slate-900/65 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden group hover:border-indigo-500/50 transition-all duration-300">
        <div className="absolute right-3 top-3 opacity-15 group-hover:opacity-25 transition-opacity text-indigo-400">
          <Wifi className="w-16 h-16" />
        </div>
        <p className="text-xs uppercase tracking-wider font-mono text-slate-400">Active Inventory</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-bold font-display text-white">{stats.totalDevices}</span>
          <span className="text-xs font-mono text-indigo-400">devices recognized</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span>Subnet: {stats.subnet}</span>
        </div>
      </div>

      {/* Online Devices Count Card */}
      <div id="stats-online-card" className="bg-slate-900/65 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-all duration-300">
        <div className="absolute right-3 top-3 opacity-15 group-hover:opacity-25 transition-opacity text-emerald-400">
          <Activity className="w-16 h-16 animate-pulse" />
        </div>
        <p className="text-xs uppercase tracking-wider font-mono text-slate-400">Online Status</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-bold font-display text-emerald-400">{stats.onlineDevices}</span>
          <span className="text-xs font-mono text-emerald-500">/{stats.totalDevices} active live</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400/90 font-mono">
          <span>● Interface: {stats.interfaceName}</span>
        </div>
      </div>

      {/* Warning/Offline Card */}
      <div id="stats-offline-card" className="bg-slate-900/65 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden group hover:border-amber-500/50 transition-all duration-300">
        <div className="absolute right-3 top-3 opacity-15 group-hover:opacity-25 transition-opacity text-amber-400">
          <WifiOff className="w-16 h-16" />
        </div>
        <p className="text-xs uppercase tracking-wider font-mono text-slate-400">Offline Devices</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-bold font-display text-amber-500">{stats.offlineDevices}</span>
          <span className="text-xs font-mono text-slate-400">current idle hosts</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
          <span>Gateway IP: {stats.gatewayIp}</span>
        </div>
      </div>

      {/* Security Alerts or 24h count Card */}
      <div id="stats-security-card" className="bg-slate-900/65 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden group hover:border-rose-500/50 transition-all duration-300">
        <div className="absolute right-3 top-3 opacity-15 group-hover:opacity-25 transition-opacity text-rose-400">
          <ShieldAlert className="w-16 h-16" />
        </div>
        <p className="text-xs uppercase tracking-wider font-mono text-slate-400">New Devices (24h)</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className={`text-3xl font-bold font-display ${stats.newDevicesLast24h > 0 ? "text-rose-500 animate-bounce" : "text-white"}`}>
            {stats.newDevicesLast24h}
          </span>
          <span className="text-xs font-mono text-slate-400">novel MACs added</span>
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
          <Cpu className="w-3.5 h-3.5 text-slate-500" />
          <span>Device Pool: IoT ({stats.iotCount}), Router ({stats.routerCount})</span>
        </div>
      </div>
    </div>
  );
}
