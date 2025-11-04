// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const srcDir = 'src';
const translationsFile = 'src/assets/utils/translations.json';

// List of variables that are commonly translatable
const translatableVars = ['title', 'description', 'pageTitle'];

// Regex to match {% trans "key" %} or {% trans 'key' %}
const transRegex = /{%\s*trans\s+["']([^"']+)["']\s*%}/g;

// Regex to match gettext("key") or gettext('key')
const gettextRegex = /gettext\s*\(\s*["']([^"']+)["']\s*\)/g;

// Regex to match {{variable}} in Handlebars templates
const variableRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

// Regex to match partial calls with translatable parameters, e.g., {{> partial param="value"}} or {{#> partial param="value"}}
const partialRegex = /\{\{[#>]?\s*([^}]+)\}\}/g;

async function extractTransTags() {
  const files = await glob(`${srcDir}/**/*`, { nodir: true });
  const keys = new Set();

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    let match;
    
    // Search for trans tags
    while ((match = transRegex.exec(content)) !== null) {
      keys.add(match[1]);
    }
    
    // Reset regex lastIndex for next search
    transRegex.lastIndex = 0;
    
    // Search for gettext calls
    while ((match = gettextRegex.exec(content)) !== null) {
      keys.add(match[1]);
    }
    
    // Reset regex lastIndex for next file
    gettextRegex.lastIndex = 0;
    
    // Search for translatable variables
    while ((match = variableRegex.exec(content)) !== null) {
      if (translatableVars.includes(match[1])) {
        keys.add(match[1]);
      }
    }
    
    // Reset regex lastIndex for next file
    variableRegex.lastIndex = 0;
    
    // Search for translatable parameters in partial calls
    while ((match = partialRegex.exec(content)) !== null) {
      const params = match[1];
      const paramRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"([^"]+)"/g;
      let paramMatch;
      while ((paramMatch = paramRegex.exec(params)) !== null) {
        if (translatableVars.includes(paramMatch[1])) {
          keys.add(paramMatch[2]);
        }
      }
    }
    
    // Reset regex lastIndex for next file
    partialRegex.lastIndex = 0;
  }

  return Array.from(keys);
}

function updateTranslations(keys) {
  let translations = {};
  if (fs.existsSync(translationsFile)) {
    translations = JSON.parse(fs.readFileSync(translationsFile, 'utf-8'));
  }

  // Remove keys that contain {{ or }}
  for (const key in translations) {
    if (key.includes('{{') || key.includes('}}')) {
      delete translations[key];
    }
  }

  for (const key of keys) {
    if (!translations[key]) {
      translations[key] = {
        da: '',
      };
    }
  }

  fs.writeFileSync(translationsFile, JSON.stringify(translations, null, 2));
  console.log(`Updated translations.json with ${keys.length} keys.`);
}

async function main() {
  const keys = await extractTransTags();
  const filteredKeys = keys.filter(key => !key.includes('{{') && !key.includes('}}'));
  updateTranslations(filteredKeys);
}

main().catch(console.error);
