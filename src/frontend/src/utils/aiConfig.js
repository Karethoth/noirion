import { useEffect, useState } from 'react';

const STORAGE_KEYS = {
  enabled: 'aiEnabled',
  model: 'aiModel',
  host: 'aiHost',
};

export const AI_CONFIG_EVENT = 'noirion:ai-config-changed';

export function loadAiEnabled() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.enabled);
    if (raw == null) return true;
    const v = String(raw).trim().toLowerCase();
    if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
    if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  } catch {
    // ignore
  }
  return true;
}

export function loadAiModel() {
  try {
    return (localStorage.getItem(STORAGE_KEYS.model) || '').trim();
  } catch {
    return '';
  }
}

export function loadAiHost() {
  try {
    return (localStorage.getItem(STORAGE_KEYS.host) || '').trim();
  } catch {
    return '';
  }
}

export function getAiConfig() {
  return {
    enabled: loadAiEnabled(),
    model: loadAiModel(),
    host: loadAiHost(),
  };
}

export function setAiConfig(partial) {
  const current = getAiConfig();
  const next = {
    enabled: typeof partial?.enabled === 'boolean' ? partial.enabled : current.enabled,
    model: typeof partial?.model === 'string' ? partial.model : current.model,
    host: typeof partial?.host === 'string' ? partial.host : current.host,
  };

  try {
    localStorage.setItem(STORAGE_KEYS.enabled, String(next.enabled));
    localStorage.setItem(STORAGE_KEYS.model, String(next.model || ''));
    localStorage.setItem(STORAGE_KEYS.host, String(next.host || ''));
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new CustomEvent(AI_CONFIG_EVENT, { detail: next }));
  } catch {
    // ignore
  }

  return next;
}

export function useAiConfig() {
  const [config, setConfigState] = useState(() => getAiConfig());

  useEffect(() => {
    const update = () => setConfigState(getAiConfig());

    const onCustom = () => update();
    const onStorage = (e) => {
      if (!e || !e.key) return;
      if (e.key === STORAGE_KEYS.enabled || e.key === STORAGE_KEYS.model || e.key === STORAGE_KEYS.host) update();
    };

    window.addEventListener(AI_CONFIG_EVENT, onCustom);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener(AI_CONFIG_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return config;
}
