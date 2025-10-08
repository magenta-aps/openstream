// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import translations from "./translations.json";

export function translateHTML() {
  const lang = document.documentElement.lang;

  function replaceTransTags(textNode) {
    const regex = /{%\s*trans\s+(["'])(.*?)\1\s*%}/g;
    let text = textNode.nodeValue;
    let match;
    let newText = text;
    while ((match = regex.exec(text)) !== null) {
      const key = match[2];
      const translated = gettext(key);
      newText = newText.replace(match[0], translated);
    }
    if (newText !== text) {
      textNode.nodeValue = newText;
    }
  }
  function walkDOM(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      replaceTransTags(node);
    } else {
      for (let child of node.childNodes) {
        walkDOM(child);
      }
    }
  }
  walkDOM(document.documentElement);

  function replaceTransInAttributes() {
    const elements = document.querySelectorAll("*");
    elements.forEach((element) => {
      for (let attr of element.attributes) {
        const value = attr.value;
        const newValue = value.replace(
          /{%\s*trans\s+(["'])(.*?)\1\s*%}/g,
          (match, quote, key) => {
            return gettext(key);
          },
        );
        if (newValue !== value) {
          attr.value = newValue;
        }
      }
    });
  }

  replaceTransInAttributes();
}

export function gettext(key) {
  const lang = document.documentElement.lang;

  if (lang === "en") return key;

  if (!translations[key]) {
    console.error(`Translation not found for key: "${key}"`);
    return key;
  }
  const translated = translations[key][lang];
  if (!translated) {
    // don't log errors for keys that are just numbers
    if (!/^\s*\d+\s*$/.test(String(key))) {
      console.error(`Translation not found for key: "${key}" in language: "${lang}"`); 
    }
    return key;
  }
  return translated;
}

export async function fetchUserLangugage() {
  document.documentElement.lang = localStorage.getItem("userLanguage") || "en";
}
