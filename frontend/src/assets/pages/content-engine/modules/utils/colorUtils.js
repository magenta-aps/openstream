// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import {
  token,
  selectedBranchID,
  genericFetch,
  showToast,
  parentOrgID,
} from "../../../../utils/utils.js";
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";

// Initialize baseColors with default black and white colors
export let baseColors = [
  {
    id: -2, // Using negative IDs to ensure they stay at the top when sorting
    name: "Black",
    hexValue: "#000000",
    type: "Standard",
    position: 0,
  },
  {
    id: -1,
    name: "White",
    hexValue: "#FFFFFF",
    type: "Standard",
    position: 1,
  },
];

/**
 * Fetches custom colors from the API based on the selected branch's organisation.
 */
async function fetchCustomColors() {
  if (!selectedBranchID) {
    console.warn("No branch selected, cannot fetch custom colors.");
    // Keep only the default black and white colors
    return;
  }

  try {
    const colors = await genericFetch(
      `${BASE_URL}/api/custom-colors/?organisation_id=${parentOrgID}`,
      "GET",
      null, // No body for GET
      { Authorization: `Bearer ${token}` }, // Pass token for auth
    );

    if (colors && Array.isArray(colors)) {
      // Get default colors
      const defaultColors = baseColors.filter((color) => color.id < 0);

      // Map the fetched data to include name, hexValue, and type.
      const customColors = colors.map((color) => ({
        id: color.id,
        name: color.name,
        hexValue: color.hexValue,
        type: color.type,
        position: typeof color.position === "number" ? color.position : null,
      }));

      customColors.sort((a, b) => {
        const posA =
          typeof a.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
        const posB =
          typeof b.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;
        return a.name.localeCompare(b.name);
      });

      // Combine default colors with custom colors
      baseColors = [...defaultColors, ...customColors];
    } else {
      console.warn("No custom colors returned from API or invalid format.");
      // Keep only the default black and white colors
    }
  } catch (error) {
    console.error("Error fetching custom colors:", error);
    showToast(gettext("Failed to load custom colors."), "Error");
    // Keep only the default black and white colors
    baseColors = baseColors.filter((color) => color.id < 0);
  }
}

// Fetch colors when the module loads.
// Consider if this needs to be awaited or handled differently depending on usage.
fetchCustomColors();

export function hexToRGBA(hex, alpha) {
  hex = hex.replace("#", "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function rgbToHex(rgb) {
  if (!rgb) return "#ffffff";
  if (rgb.indexOf("#") === 0) return rgb;
  const result = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(rgb);
  return result
    ? "#" +
        ("0" + parseInt(result[1], 10).toString(16)).slice(-2) +
        ("0" + parseInt(result[2], 10).toString(16)).slice(-2) +
        ("0" + parseInt(result[3], 10).toString(16)).slice(-2)
    : "#ffffff";
}

export function showColorPalette(button, callback, options = {}) {
  // Remove any existing palettes first
  document
    .querySelectorAll(".custom-color-palette.popover")
    .forEach((p) => p.remove());

  const palette = document.createElement("div");
  // Use list-group for Bootstrap styling
  palette.className = "custom-color-palette popover list-group";
  palette.style.position = "absolute"; // Ensure positioning context
  palette.style.zIndex = options.zIndex || "1060"; // Use custom z-index if provided
  palette.style.width = "250px"; // Adjust width as needed
  palette.style.maxHeight = "75vh"; // Limit height and allow scrolling
  palette.style.overflowY = "auto";

  baseColors.forEach((color) => {
    // Use list-group-item for each color entry
    const colorItem = document.createElement("a"); // Use <a> for list-group-item styling
    colorItem.href = "#"; // Prevent page jump
    colorItem.className =
      "list-group-item list-group-item-action d-flex align-items-center";
    colorItem.style.cursor = "pointer";

    // Color Swatch
    const swatch = document.createElement("span");
    swatch.style.display = "inline-block";
    swatch.style.width = "20px";
    swatch.style.height = "20px";
    swatch.style.backgroundColor = color.hexValue;
    swatch.style.border = "1px solid #ccc";
    swatch.style.marginRight = "10px";
    swatch.style.flexShrink = "0"; // Prevent swatch from shrinking

    // Color Info (Name, Hex, Type)
    const infoDiv = document.createElement("div");
    infoDiv.style.flexGrow = "1"; // Allow text to take remaining space
    infoDiv.style.overflow = "hidden"; // Prevent long text overflow
    infoDiv.style.whiteSpace = "nowrap";
    infoDiv.style.textOverflow = "ellipsis";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = color.name;
    nameSpan.style.fontWeight = "bold";
    nameSpan.style.display = "block"; // Ensure name is on its own line if needed

    const detailsSpan = document.createElement("span");
    // Format the type to have first letter capitalized and rest lowercase
    const formattedType = color.type
      ? color.type.toLowerCase().charAt(0).toUpperCase() +
        color.type.toLowerCase().slice(1)
      : "N/A";
    detailsSpan.textContent = `${color.hexValue} (${formattedType})`;
    detailsSpan.style.fontSize = "0.85em";
    detailsSpan.style.color = "#6c757d"; // Muted color for details
    detailsSpan.style.display = "block";

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(detailsSpan);

    colorItem.appendChild(swatch);
    colorItem.appendChild(infoDiv);

    colorItem.addEventListener("click", (e) => {
      e.preventDefault(); // Prevent default anchor action
      e.stopPropagation();
      callback(color.hexValue);
      if (document.body.contains(palette)) {
        document.body.removeChild(palette);
      }
    });
    palette.appendChild(colorItem);
  });

  if (options.allowRemove) {
    // Add a "Remove Color" option
    const removeLink = document.createElement("a");
    removeLink.href = "#";
    removeLink.className =
      "list-group-item list-group-item-action list-group-item-danger d-flex align-items-center";
    removeLink.style.cursor = "pointer";

    const removeIcon = document.createElement("i");
    removeIcon.className = "material-symbols-outlined me-2";
    removeIcon.textContent = "delete_forever";

    const removeText = document.createElement("span");
    removeText.textContent = gettext("Remove Color");

    removeLink.appendChild(removeIcon);
    removeLink.appendChild(removeText);

    removeLink.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      callback(null);
      if (document.body.contains(palette)) {
        document.body.removeChild(palette);
      }
    });
    palette.appendChild(removeLink);
  }

  // Positioning logic (simplified, adjust as needed)
  const rect = button.getBoundingClientRect();

  // Check if we're positioning to the right (custom positioning)
  if (rect.width === 0 && rect.left > window.innerWidth / 2) {
    // Position to the right side
    palette.style.top = rect.top + window.scrollY + "px";
    palette.style.left = rect.left + window.scrollX + "px";
  } else {
    // Default positioning (below button)
    palette.style.top = rect.bottom + window.scrollY + 5 + "px"; // Add some spacing
    palette.style.left = rect.left + window.scrollX + "px";
  }

  document.body.appendChild(palette);

  // Adjust positioning if overflowing viewport
  const paletteRect = palette.getBoundingClientRect();
  if (paletteRect.right > window.innerWidth) {
    palette.style.left =
      window.innerWidth - paletteRect.width - 10 + window.scrollX + "px";
  }
  if (paletteRect.left < 0) {
    palette.style.left = 10 + window.scrollX + "px";
  }

  // Adjust top if overflowing viewport
  if (paletteRect.bottom > window.innerHeight) {
    palette.style.top =
      window.innerHeight - paletteRect.height - 10 + window.scrollY + "px";
  }
  if (paletteRect.top < 0) {
    palette.style.top = 10 + window.scrollY + "px";
  }

  // Remove palette when clicking outside
  const removePalette = (e) => {
    if (!palette.contains(e.target) && e.target !== button) {
      if (document.body.contains(palette)) {
        document.body.removeChild(palette);
      }
      document.removeEventListener("click", removePalette, true); // Use capture phase
    }
  };

  // Use setTimeout to add listener after current event cycle
  setTimeout(() => {
    document.addEventListener("click", removePalette, true); // Use capture phase
  }, 0);
}
