// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
// Decide BASE_URL in this priority:
// 1. If a build-time VITE_BASE_URL is provided use it (import.meta.env)
// 2. Otherwise derive from current page hostname (runtime):
//    - localhost -> http://localhost:8000
//    - test.openstream.dk -> https://api.test.openstream.dk
//    - staging.openstream.dk -> https://api.staging.openstream.dk
//    - openstream.dk -> https://api.openstream.dk
// 3. Fallback to http://localhost:8000

function deriveBaseFromHostname() {
  if (typeof window === "undefined" || !window.location) return null;
  const host = window.location.hostname;


  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:8000";
  }

  if (host === "192.168.1.178") {
    return "http://192.168.1.178:8000";
  }

  // handle subdomains like app.test.openstream.dk by matching suffix
  if (host.endsWith(".test.openstream.dk") || host === "test.openstream.dk") {
    return "https://api.test.openstream.dk";
  }

  if (
    host.endsWith(".staging.openstream.dk") ||
    host === "staging.openstream.dk"
  ) {
    return "https://api.staging.openstream.dk";
  }

  if (host === "openstream.dk" || host.endsWith(".openstream.dk")) {
    // For production and other subdomains, point to api.openstream.dk
    return "https://api.openstream.dk";
  }

  return null;
}

export function derivePollingServiceFromHostname() {
  const host = window.location.hostname;

  if (host === "test.openstream.dk"){
    return "https://polling.test.openstream.dk/events";
  }

  if (host === "staging.openstream.dk"){
    return "https://polling.staging.openstream.dk/events";
  }

  if (host === "openstream.dk"){
    return "https://polling.openstream.dk/events";
  }

  else return `http://${window.location.hostname}:3000/events`
}



export const BASE_URL =
  //import.meta.env.VITE_BASE_URL ||
  deriveBaseFromHostname() ||
  "http://localhost:8000";

// Converter service base URL (same derivation pattern, default port 8001)
function deriveConverterBaseFromHostname() {
  if (typeof window === "undefined" || !window.location) return null;
  const host = window.location.hostname;

  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:8001";
  }

  if (host.endsWith(".test.openstream.dk") || host === "test.openstream.dk") {
    return "https://converter.test.openstream.dk";
  }

  if (
    host.endsWith(".staging.openstream.dk") ||
    host === "staging.openstream.dk"
  ) {
    return "https://converter.staging.openstream.dk";
  }

  if (host === "openstream.dk" || host.endsWith(".openstream.dk")) {
    return "https://converter.openstream.dk";
  }

  return null;
}

export const CONVERTER_BASE =
  import.meta.env.VITE_CONVERTER_BASE ||
  deriveConverterBaseFromHostname() ||
  "http://localhost:8001";
