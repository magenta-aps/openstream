// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only

export function addChip(containerId, chipText, deleteCallBack, chipClass="",) {
    const chipContainer = document.getElementById(containerId);
    if (!chipContainer) return;

    const chip = document.createElement('button');
    chip.className = `${chipClass} d-flex align-items-center gap-1 p-1 border rounded bg-secondary-accent-hover`;
    // fs-small 
    chip.innerText = chipText;
    
    chipContainer.appendChild(chip);
}