/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ScanStatus } from "../types";
import { Radio, Server, CheckCircle2 } from "lucide-react";

interface ScannerControlsProps {
  status: ScanStatus | null;
  onStartScan: () => void;
  subnet?: string;
}

export default function ScannerControls({ status, onStartScan, subnet }: ScannerControlsProps) {
  if (!status) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 animate-pulse h-32" />
    );
  }

  return (
    <div className="bg-slate-900/65 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Title and Scanner Description */}
        <div className="flex items-start gap-3">
          <div className={`p-3.5 rounded-xl ${status.isScanning ? "bg-indigo-500/15 text-indigo-400 animate-pulse" : "bg-slate-800 text-slate-400"}`}>
            {status.isScanning ? (
              <Radio className="w-6 h-6 animate-spin" />
            ) : (
              <Server className="w-6 h-6" />
            )}
          </div>
          <div>
            <h3 className="text-md font-bold font-display text-white flex items-center gap-2">
              Internal LAN Query Scanner
              {status.isScanning && (
                <span className="text-xs bg-indigo-500/20 text-indigo-300 font-mono px-2 py-0.5 rounded-full animate-bounce">
                  Scanning Subnet...
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Triggers ARP and multicast DNS (mDNS) packet broadcasts over local interface <span className="font-mono text-indigo-400 bg-indigo-500/10 px-1 py-0.5 rounded">{subnet || "192.168.1.0/24"}</span> to catalog hardware leases and hostnames.
            </p>
          </div>
        </div>
      </div>

      {/* Progress Monitor Layout */}
      {status.isScanning && (
        <div id="scan-progress-monitor" className="mt-5 pt-4 border-t border-slate-800/80 animate-fadeIn text-xs">
          <div className="flex justify-between font-mono text-slate-300 mb-2">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
              Probing Target IP: <code className="text-indigo-400 font-bold ml-1">{status.currentIP}</code>
            </span>
            <span className="font-bold text-indigo-400">{status.progress}%</span>
          </div>

          <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden p-0.5 border border-slate-850">
            <div 
              style={{ width: `${status.progress}%` }}
              className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-full rounded-full transition-all duration-100 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>Query Mode: Broadcom ARP & Avahi UDP Multicast</span>
            <span>Est. Remaining: ~{Math.ceil((100 - status.progress) / 10)}s</span>
          </div>
        </div>
      )}

      {!status.isScanning && status.lastScanTime && (
        <div className="mt-4 pt-3 border-t border-slate-850 flex items-center gap-2 text-[11px] font-mono text-slate-500">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span>Last full audit swipe was executed at: <span className="text-slate-400">{new Date(status.lastScanTime).toLocaleString()}</span></span>
        </div>
      )}
    </div>
  );
}
