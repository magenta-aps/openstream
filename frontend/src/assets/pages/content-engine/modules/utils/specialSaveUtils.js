// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { BASE_URL } from "../../../../utils/constants.js";
import { gettext } from "../../../../utils/locales.js";
import {
  parentOrgID,
  queryParams,
  selectedBranchID,
  token,
} from "../../../../utils/utils.js";

export const SPECIAL_SAVE_ENABLED =
  queryParams.special_save === "true" || queryParams.special_save === "1";

const assetUrlCache = new Map();

export function isDirectImageUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function enqueueAssetResolution(target, fieldName, resolverPromises) {
  if (!target || !fieldName) {
    return;
  }
  const assetId = target[fieldName];
  if (!assetId || isDirectImageUrl(assetId)) {
    return;
  }
  const resolver = resolveAssetContentToUrl(assetId).then((url) => {
    target[fieldName] = url;
  });
  resolverPromises.push(resolver);
}

function enqueueMaskAssetResolutions(element, resolverPromises) {
  if (!element || element.type !== "mask") {
    return;
  }

  if (element.maskSourceType === "image") {
    enqueueAssetResolution(element, "maskSourceId", resolverPromises);
  }

  if (
    element.contentMediaId &&
    (element.contentType === "image" || element.contentType === "video")
  ) {
    enqueueAssetResolution(element, "contentMediaId", resolverPromises);
  }
}

export async function resolveSlidesForSpecialSave(slides) {
  if (!SPECIAL_SAVE_ENABLED) {
    return slides;
  }

  const slidesCopy = JSON.parse(JSON.stringify(slides));
  const resolverPromises = [];

  slidesCopy.forEach((slide) => {
    slide.elements?.forEach((element) => {
      if (!element) {
        return;
      }

      if (element.type === "image") {
        enqueueAssetResolution(element, "content", resolverPromises);
        return;
      }

      if (element.type === "mask") {
        enqueueMaskAssetResolutions(element, resolverPromises);
      }
    });
  });

  await Promise.all(resolverPromises);
  return slidesCopy;
}

export async function resolveSingleSlideForSpecialSave(slide) {
  if (!SPECIAL_SAVE_ENABLED) {
    return slide;
  }
  const [resolvedSlide] = await resolveSlidesForSpecialSave([slide]);
  return resolvedSlide;
}

async function resolveAssetContentToUrl(assetId) {
  if (assetUrlCache.has(assetId)) {
    return assetUrlCache.get(assetId);
  }

  const params = new URLSearchParams();
  if (selectedBranchID) params.set("branch_id", selectedBranchID);
  if (parentOrgID) params.set("organisation_id", parentOrgID);
  if (queryParams.displayWebsiteId) {
    params.set("id", queryParams.displayWebsiteId);
  }

  const headers = { "Content-Type": "application/json" };
  if (queryParams.apiKey) {
    headers["X-API-KEY"] = queryParams.apiKey;
  } else if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const queryString = params.toString();
  const url = queryString
    ? `${BASE_URL}/api/documents/file-token/${assetId}/?${queryString}`
    : `${BASE_URL}/api/documents/file-token/${assetId}/`;

  const resp = await fetch(url, { method: "GET", headers });
  if (!resp.ok) {
    throw new Error(
      gettext("Unable to resolve media asset for export") + ` (${resp.status})`,
    );
  }

  const data = await resp.json();
  if (!data.file_url) {
    throw new Error(
      gettext("Media asset response missing file_url; cannot complete special save"),
    );
  }

  assetUrlCache.set(assetId, data.file_url);
  return data.file_url;
}
