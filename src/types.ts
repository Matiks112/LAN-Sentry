/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DeviceType = 'mobile' | 'laptop' | 'desktop' | 'smart-tv' | 'iot' | 'router' | 'other';

export interface Device {
  id: string; // usually MAC address
  mac: string;
  ip: string;
  hostname: string | null;
  nickname: string | null;
  vendor: string | null;
  discoveryMethod: 'ARP' | 'mDNS' | 'manual';
  status: 'online' | 'offline';
  isAlertsEnabled: boolean;
  firstSeen: string; // ISO String
  lastSeen: string; // ISO String
  notes: string | null;
  deviceType: DeviceType;
  latency?: number | null; // latency in ms
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface NetworkAlert {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  deviceId: string | null;
  read: boolean;
}

export interface WebhookConfig {
  enabled: boolean;
  provider: 'slack' | 'discord';
  url: string;
}

export type AlertTrigger = 'new_device' | 'device_offline' | 'device_online' | 'ip_changed';

export interface AlertRule {
  id: string;
  name: string;
  trigger: AlertTrigger;
  targetId: string; // 'all' or specific Device.id (MAC)
  enabled: boolean;
}

export interface NetworkStats {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  newDevicesLast24h: number;
  iotCount: number;
  routerCount: number;
  otherCount: number;
  subnet: string;
  gatewayIp: string;
  interfaceName: string;
  dbType?: string;
  rulesCount?: number;
  unreadAlertsCount?: number;
  systemUptime?: number;
  memoryUsage?: string;
}

export interface ScanStatus {
  isScanning: boolean;
  progress: number;
  currentIP: string;
  lastScanTime: string | null;
}

export interface SentryVersionInfo {
  name: string;
  version: string;
  githubRepo: string;
  author: string;
  license: string;
  licenseText: string;
  credits: string;
  latestGitHubVersion?: string | null;
  latestGitHubReleaseUrl?: string | null;
  hasUpdate?: boolean;
  gitHubFetchError?: string;
}

