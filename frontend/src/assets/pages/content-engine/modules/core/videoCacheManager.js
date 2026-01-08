// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { BASE_URL } from "../../../../utils/constants.js";
import {
  token,
  queryParams,
  selectedBranchID,
  parentOrgID,
} from "../../../../utils/utils.js";

class VideoCacheManager {
  constructor() {
    this.cache = new Map(); // videoId -> blob URL
    this.fetchPromises = new Map(); // videoId -> Promise (to avoid duplicate fetches)
  }

  _buildAuthHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (queryParams.apiKey) {
      headers["X-API-KEY"] = queryParams.apiKey;
    } else if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  async fetchTokenizedFileUrl(videoId) {
    const headers = this._buildAuthHeaders();
    const response = await fetch(
      `${BASE_URL}/api/documents/file-token/${videoId}/?branch_id=${selectedBranchID}&id=${queryParams.displayWebsiteId}&organisation_id=${parentOrgID}`,
      {
        method: "GET",
        headers,
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get video token: ${response.status}`);
    }

    const data = await response.json();
    if (!data.file_url) {
      throw new Error("No file URL in token response");
    }

    return data.file_url;
  }

  // Get video URL, either from cache or fetch it
  async getVideoUrl(videoId) {
    // Return cached blob URL if available
    if (this.cache.has(videoId)) {
      return this.cache.get(videoId);
    }

    // Return existing fetch promise if already fetching
    if (this.fetchPromises.has(videoId)) {
      return await this.fetchPromises.get(videoId);
    }

    // Create new fetch promise
    const fetchPromise = this.fetchAndCacheVideo(videoId);
    this.fetchPromises.set(videoId, fetchPromise);

    try {
      const result = await fetchPromise;
      this.fetchPromises.delete(videoId);
      return result;
    } catch (error) {
      this.fetchPromises.delete(videoId);
      throw error;
    }
  }

  // Fetch video and create blob URL
  async fetchAndCacheVideo(videoId) {
    try {
      const fileUrl = await this.fetchTokenizedFileUrl(videoId);

      // Fetch the actual video file
      const videoResponse = await fetch(fileUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to fetch video: ${videoResponse.status}`);
      }

      const videoBlob = await videoResponse.blob();
      const blobUrl = URL.createObjectURL(videoBlob);

      // Cache the blob URL
      this.cache.set(videoId, blobUrl);

      console.log(`Video ${videoId} cached successfully`);
      return blobUrl;
    } catch (error) {
      console.error(`Failed to cache video ${videoId}:`, error);
      // Fallback: try to get the tokenized URL directly
      return this.getFallbackUrl(videoId);
    }
  }

  // Fallback to tokenized URL if blob caching fails
  async getFallbackUrl(videoId) {
    try {
      return await this.fetchTokenizedFileUrl(videoId);
    } catch (error) {
      console.error("Fallback URL fetch failed:", error);
    }

    return null;
  }

  // Pre-cache videos for better slideshow performance
  async preCacheVideos(slides) {
    const videoIds = new Set();

    // Collect all video IDs from slides
    slides.forEach((slide) => {
      slide.elements.forEach((element) => {
        if (element.type === "video" && element.content) {
          videoIds.add(element.content);
        }
      });
    });

    // Pre-cache all videos
    const cachePromises = Array.from(videoIds).map(async (videoId) => {
      try {
        await this.getVideoUrl(videoId);
        console.log(`Pre-cached video: ${videoId}`);
      } catch (error) {
        console.warn(`Failed to pre-cache video ${videoId}:`, error);
      }
    });

    await Promise.allSettled(cachePromises);
    console.log(
      `Video pre-caching completed. Cached ${this.cache.size} videos.`,
    );
  }

  async attachVideoToElement(videoElement, videoId) {
    if (!videoElement || !videoId) {
      return;
    }

    const sourceKey = String(videoId);
    videoElement.dataset.videoSourceId = sourceKey;

    try {
      const directUrl = await this.fetchTokenizedFileUrl(videoId);
      if (directUrl && videoElement.dataset.videoSourceId === sourceKey) {
        videoElement.src = directUrl;
      }
    } catch (error) {
      console.error(`Failed to fetch direct video URL for ${videoId}:`, error);
    }

    try {
      const cachedUrl = await this.getVideoUrl(videoId);
      if (!cachedUrl) {
        return;
      }
      if (videoElement.dataset.videoSourceId !== sourceKey) {
        return;
      }
      if (cachedUrl === videoElement.src) {
        return;
      }

      const resumeTime = videoElement.currentTime || 0;
      const wasPaused = videoElement.paused;
      const wasMuted = videoElement.muted;

      const handleLoaded = () => {
        if (!Number.isNaN(resumeTime)) {
          try {
            videoElement.currentTime = resumeTime;
          } catch (err) {
            console.warn("Failed to restore video playback position", err);
          }
        }
        videoElement.muted = wasMuted;
        if (!wasPaused) {
          videoElement
            .play()
            .catch((err) =>
              console.warn("Failed to resume cached video playback", err),
            );
        }
      };

      videoElement.addEventListener("loadeddata", handleLoaded, {
        once: true,
      });
      videoElement.src = cachedUrl;
    } catch (error) {
      console.warn(`Failed to upgrade video ${videoId} to cached version`, error);
    }
  }

  // Clear cache and revoke blob URLs to free memory
  clearCache() {
    this.cache.forEach((blobUrl) => {
      URL.revokeObjectURL(blobUrl);
    });
    this.cache.clear();
    this.fetchPromises.clear();
    console.log("Video cache cleared");
  }

  // Get cache status
  getCacheStatus() {
    return {
      cachedVideos: this.cache.size,
      pendingFetches: this.fetchPromises.size,
      cachedVideoIds: Array.from(this.cache.keys()),
    };
  }
}

// Export singleton instance
export const videoCacheManager = new VideoCacheManager();
