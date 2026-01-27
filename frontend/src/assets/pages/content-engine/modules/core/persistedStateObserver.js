// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
const listeners = new Set();
const targetToProxy = new WeakMap();
const proxyToTarget = new WeakMap();
let suspensionDepth = 0;

function isTrackable(value) {
  return typeof value === "object" && value !== null;
}

function notifyListeners() {
  if (suspensionDepth > 0) {
    return;
  }

  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error("Persisted state listener failed", err);
    }
  });
}

export function observeValue(value) {
  if (!isTrackable(value)) {
    return value;
  }

  // If it's already a proxy, return it
  if (proxyToTarget.has(value)) {
    return value;
  }

  // If we already have a proxy for this target, return it
  if (targetToProxy.has(value)) {
    return targetToProxy.get(value);
  }

  // Deeply observe children of Arrays and Objects immediately ---
  // This ensures nested values are wrapped even before a 'get' is triggered.
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = observeValue(value[i]);
    }
  } else {
    Object.keys(value).forEach(key => {
      value[key] = observeValue(value[key]);
    });
  }

  const proxy = new Proxy(value, {
    get(target, prop, receiver) {
      const result = Reflect.get(target, prop, receiver);
      // Still recursive on access for safety
      return observeValue(result);
    },
    set(target, prop, newValue, receiver) {
      const wrappedValue = observeValue(newValue);
      const previous = target[prop];
      const changed = !Object.is(previous, wrappedValue);
      const outcome = Reflect.set(target, prop, wrappedValue, receiver);
      if (changed) {
        notifyListeners();
      }
      return outcome;
    },
    deleteProperty(target, prop) {
      const hadProperty = Object.prototype.hasOwnProperty.call(target, prop);
      const outcome = Reflect.deleteProperty(target, prop);
      if (hadProperty) {
        notifyListeners();
      }
      return outcome;
    },
  });

  targetToProxy.set(value, proxy);
  proxyToTarget.set(proxy, value);
  return proxy;
}

export function definePersistedProperty(target, key) {
  // Ensure the initial value is deeply observed
  let currentValue = observeValue(target[key]);

  Object.defineProperty(target, key, {
    get() {
      return currentValue;
    },
    set(newValue) {
      // Deeply wrap the new object being assigned
      const wrappedValue = observeValue(newValue);
      if (!Object.is(currentValue, wrappedValue)) {
        currentValue = wrappedValue;
        notifyListeners();
      }
    },
    enumerable: true,
    configurable: true,
  });
  
  // Update the original target with the proxy to ensure 
  // direct access to store.slides is also proxied.
  target[key] = currentValue;
}

export function subscribeToPersistedStateChanges(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function suspendPersistedStateNotifications() {
  suspensionDepth += 1;
  return () => resumePersistedStateNotifications();
}

export function resumePersistedStateNotifications() {
  suspensionDepth = Math.max(0, suspensionDepth - 1);
}

export function runWithPersistedStateSilenced(callback) {
  const resume = suspendPersistedStateNotifications();
  try {
    const maybePromise = callback();
    if (maybePromise && typeof maybePromise.then === "function") {
      return maybePromise.finally(() => {
        resume();
      });
    }
    resume();
    return maybePromise;
  } catch (err) {
    resume();
    throw err;
  }
}

export function notifyPersistedStateChange() {
  notifyListeners();
}
