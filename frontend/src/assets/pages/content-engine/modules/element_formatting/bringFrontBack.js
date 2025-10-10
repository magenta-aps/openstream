// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { showToast } from "../../../../utils/utils.js";
import { pushCurrentSlideState } from "../core/undoRedo.js";
import { store } from "../core/slideStore.js";
import { getAllRelevantElements } from "../utils/domUtils.js";
import { gettext } from "../../../../utils/locales.js";

// Helper function for the render engine to the styling
export function _renderZIndex(container, el) {
  // Ensure zIndex is applied as a string and clamp to a practical maximum
  let z = Number(el.zIndex) || 0;
  // Prevent non-finite values and keep within a sane range for browsers
  if (!isFinite(z) || z < 0) z = 0;
  const MAX_Z = 10000000;
  if (z > MAX_Z) z = MAX_Z;
  container.style.zIndex = String(z);
}
