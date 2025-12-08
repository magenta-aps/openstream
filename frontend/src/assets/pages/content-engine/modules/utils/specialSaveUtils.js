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

const imageUrlCache = new Map();

export function isDirectImageUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function elementNeedsInlineUrl(element) {
  return (
    element &&
    element.type === "image" &&
    element.content &&
    !isDirectImageUrl(element.content)
  );
}

export async function resolveSlidesForSpecialSave(slides) {
  if (!SPECIAL_SAVE_ENABLED) {
    return slides;
  }

  const slidesCopy = JSON.parse(JSON.stringify(slides));
  const resolverPromises = [];

  slidesCopy.forEach((slide) => {
    slide.elements?.forEach((element) => {
      if (elementNeedsInlineUrl(element)) {
        const resolver = resolveImageContentToUrl(element.content).then(
          (url) => {
            element.content = url;
          },
        );
        resolverPromises.push(resolver);
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

async function resolveImageContentToUrl(imageId) {
  if (imageUrlCache.has(imageId)) {
    return imageUrlCache.get(imageId);
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
    ? `${BASE_URL}/api/documents/file-token/${imageId}/?${queryString}`
    : `${BASE_URL}/api/documents/file-token/${imageId}/`;

  const resp = await fetch(url, { method: "GET", headers });
  if (!resp.ok) {
    throw new Error(
      gettext("Unable to resolve image asset for export") + ` (${resp.status})`,
    );
  }

  const data = await resp.json();
  if (!data.file_url) {
    throw new Error(
      gettext("Image asset response missing file_url; cannot complete special save"),
    );
  }

  imageUrlCache.set(imageId, data.file_url);
  return data.file_url;
}
