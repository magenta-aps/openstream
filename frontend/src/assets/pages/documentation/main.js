// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import "bootstrap";
import "./style.scss";
import { marked } from "marked";
import MiniSearch from "minisearch";
import { initOrgQueryParams, makeActiveInNav } from "../../utils/utils.js";
import {
  translateHTML,
  fetchUserLangugage,
  gettext,
} from "../../utils/locales.js";

// Documentation configuration
const DOCS_CONFIG = {
  chapters: [
    {
      slug: "01_Introduction",
      title: "Introduction",
      order: 1,
    },
    {
      slug: "02_Organisation_Structure",
      title: "Organisation Structure",
      order: 2,
    },
    {
      slug: "03_Organisation_Overview",
      title: "Organisation Overview",
      order: 3,
    },
    {
      slug: "04_Branch_Subpages",
      title: "Branch Subpages",
      order: 4,
    },
    {
      slug: "05_User_And_Organisation",
      title: "User and Organisation",
      order: 5,
    },
    {
      slug: "06_Admin_Settings",
      title: "Admin Settings",
      order: 6,
    },
    {
      slug: "07_Downloads_And_Documentation",
      title: "Downloads and Documentation",
      order: 7,
    },
  ],
};

class DocumentationApp {
  constructor() {
    this.chapters = DOCS_CONFIG.chapters;
    this.currentChapterIndex = -1;
    this.loadedChapters = {}; // Cache for chapter content
    this.searchIndex = null;
    this.searchData = [];
    this.scrollListener = null; // Track scroll listener for cleanup

    // Scroll offset for section navigation - ensures headings are clearly visible
    this.SECTION_SCROLL_OFFSET = 20;

    // DOM elements
    this.docContainer = document.querySelector(".documentation-container");
    this.tocContent = document.querySelector(".toc-content");
    this.nextChapterBtn = document.getElementById("next-chapter-btn");
    this.nextChapterTitle = document.getElementById("next-chapter-title");
    this.searchInput = document.getElementById("doc-search");
    this.searchResults = document.getElementById("search-results");
    this.loadingOverlay = document.getElementById("loading-overlay");

    this.init();
  }

  async init() {
    // Initialize navbar functionality (with error handling)
    try {
      makeActiveInNav("/documentation");
    } catch (error) {
      console.warn("Navbar initialization failed:", error);
      // Continue without navbar functionality
    }

    // Initialize documentation functionality
    this.renderTableOfContents();
    await this.buildSearchIndex();
    this.setupSearch();
    this.setupNavigation();

    // Load the first chapter by default or handle hash navigation
    const urlHash = window.location.hash.substring(1);
    if (urlHash) {
      this.handleHashNavigation(urlHash);
    } else {
      await this.loadChapter(this.chapters[0].slug);
    }

    // Hide loading overlay
    this.hideLoadingOverlay();
  }

  renderTableOfContents() {
    if (!this.tocContent) return;

    const tocHTML = this.chapters
      .map((chapter) => {
        const displayTitle =
          chapter.localizedTitle || gettext(chapter.title) || chapter.title;
        return `
      <div class="toc-chapter">
        <a href="#${chapter.slug}" class="chapter-link" data-chapter="${chapter.slug}">
          ${chapter.order}. ${displayTitle}
        </a>
        <div class="chapter-sections" id="sections-${chapter.slug}">
          <!-- Sections will be populated when chapter is loaded -->
        </div>
      </div>
    `;
      })
      .join("");

    this.tocContent.innerHTML = tocHTML;

    // Add click handlers for chapter links
    this.tocContent.querySelectorAll(".chapter-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const chapterSlug = link.getAttribute("data-chapter");
        this.loadChapter(chapterSlug);
        window.location.hash = chapterSlug;
      });
    });
  }

  async fetchChapterContent(slug) {
    if (this.loadedChapters[slug]) {
      return this.loadedChapters[slug];
    }

    const lang = document.documentElement.lang || "en";
    const urls = [`/docs/${lang}/${slug}.md`];
    if (lang !== "en") {
      urls.push(`/docs/en/${slug}.md`); // Fallback to English
    }

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const markdownContent = await response.text();
          const htmlContent = marked.parse(markdownContent);
          this.loadedChapters[slug] = htmlContent;

          // Extract H1 from the fetched content to use as localized chapter title
          try {
            const doc = new DOMParser().parseFromString(
              htmlContent,
              "text/html",
            );
            const h1 = doc.querySelector("h1");
            if (h1 && h1.textContent.trim()) {
              // Store localized title on the chapter object for later use
              const chapter = this.chapters.find((c) => c.slug === slug);
              if (chapter) {
                chapter.localizedTitle = h1.textContent.trim();
              }
            }
          } catch (e) {
            // ignore parsing errors and keep original title
            console.warn("Could not parse localized title for", slug, e);
          }
          return htmlContent;
        }
      } catch (error) {
        console.warn(`Failed to fetch ${url}:`, error);
      }
    }

    console.error("Error fetching chapter:", slug);
    return `<h1>Error Loading Chapter</h1><p>Could not load chapter: ${slug}</p>`;
  }

  async loadChapter(slug) {
    const chapterIndex = this.chapters.findIndex((ch) => ch.slug === slug);
    if (chapterIndex === -1) return;

    this.currentChapterIndex = chapterIndex;
    const chapter = this.chapters[chapterIndex];

    // Show loading state
    this.docContainer.innerHTML =
      '<div class="text-center p-5"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';

    // Fetch and render content
    const content = await this.fetchChapterContent(slug);
    this.docContainer.innerHTML = content;

    // Update table of contents
    this.updateTocActive(slug);
    this.updateChapterSections(slug);

    // Update next chapter button
    this.updateNextChapterButton();

    // Scroll to top
    this.docContainer.scrollTop = 0;
  }

  updateTocActive(activeSlug) {
    // Remove active class from all chapter links
    this.tocContent.querySelectorAll(".chapter-link").forEach((link) => {
      link.classList.remove("active");
    });

    // Add active class to current chapter
    const activeLink = this.tocContent.querySelector(
      `[data-chapter="${activeSlug}"]`,
    );
    if (activeLink) {
      activeLink.classList.add("active");
    }
  }

  updateChapterSections(slug) {
    const sectionsContainer = document.getElementById(`sections-${slug}`);
    if (!sectionsContainer) return;

    // Hide all chapter sections first
    this.tocContent
      .querySelectorAll(".chapter-sections")
      .forEach((sections) => {
        sections.classList.remove("show");
      });

    // Extract headings from the current chapter content
    const headings = this.docContainer.querySelectorAll("h2, h3, h4");
    const sectionsHTML = Array.from(headings)
      .map((heading) => {
        const id = this.generateSectionId(heading.textContent);
        heading.id = id; // Add ID to the heading for navigation

        return `
        <a href="#${id}" class="section-link" data-section="${id}">
          ${heading.textContent}
        </a>
      `;
      })
      .join("");

    sectionsContainer.innerHTML = sectionsHTML;
    sectionsContainer.classList.add("show");

    // Add click handlers for section links
    sectionsContainer.querySelectorAll(".section-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const sectionId = link.getAttribute("data-section");
        const targetElement = document.getElementById(sectionId);
        if (targetElement) {
          // Update URL to include both chapter and section
          window.location.hash = `${slug}#${sectionId}`;

          // Scroll with some space above the heading
          const elementTop = targetElement.offsetTop;
          const scrollTop = elementTop - this.SECTION_SCROLL_OFFSET;
          this.docContainer.scrollTo({
            top: scrollTop,
            behavior: "smooth",
          });
        }
      });
    });

    // Set up scroll tracking for active sections
    this.setupSectionScrollTracking(slug);
  }

  generateSectionId(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "") // Remove special characters
      .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
      .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
  }

  updateNextChapterButton() {
    const nextChapterIndex = this.currentChapterIndex + 1;

    if (nextChapterIndex < this.chapters.length) {
      const nextChapter = this.chapters[nextChapterIndex];
      const nextTitle =
        nextChapter.localizedTitle ||
        gettext(nextChapter.title) ||
        nextChapter.title;
      this.nextChapterTitle.textContent = nextTitle;
      this.nextChapterBtn.style.display = "inline-flex";

      // Remove existing click handlers and add new one
      this.nextChapterBtn.replaceWith(this.nextChapterBtn.cloneNode(true));
      this.nextChapterBtn = document.getElementById("next-chapter-btn");
      this.nextChapterTitle = document.getElementById("next-chapter-title");
      this.nextChapterTitle.textContent = nextTitle;

      this.nextChapterBtn.addEventListener("click", () => {
        this.loadChapter(nextChapter.slug);
        window.location.hash = nextChapter.slug;
      });
    } else {
      this.nextChapterBtn.style.display = "none";
    }
  }

  async buildSearchIndex() {
    this.searchIndex = new MiniSearch({
      idField: "id",
      fields: ["heading", "text", "chapterTitle"],
      storeFields: [
        "chapterSlug",
        "chapterTitle",
        "heading",
        "text",
        "sectionId",
      ],
    });

    let searchId = 0;

    for (const chapter of this.chapters) {
      const content = await this.fetchChapterContent(chapter.slug);
      const doc = new DOMParser().parseFromString(content, "text/html");

      // Index the chapter title (use localized title if available)
      const chapterTitleForIndex =
        chapter.localizedTitle || gettext(chapter.title) || chapter.title;
      this.searchData.push({
        id: searchId++,
        chapterSlug: chapter.slug,
        chapterTitle: chapterTitleForIndex,
        heading: chapterTitleForIndex,
        text: "",
        sectionId: null,
      });

      // Index headings and their content
      const headings = doc.querySelectorAll("h1, h2, h3, h4, h5, h6");
      headings.forEach((heading) => {
        const headingText = heading.textContent.trim();
        const sectionId = this.generateSectionId(headingText);

        // Get text content following this heading until the next heading
        let textContent = "";
        let nextElement = heading.nextElementSibling;
        while (nextElement && !nextElement.matches("h1, h2, h3, h4, h5, h6")) {
          textContent += nextElement.textContent + " ";
          nextElement = nextElement.nextElementSibling;
        }

        this.searchData.push({
          id: searchId++,
          chapterSlug: chapter.slug,
          chapterTitle: chapter.title,
          heading: headingText,
          text: textContent.trim(),
          sectionId: sectionId,
        });
      });
    }

    this.searchIndex.addAll(this.searchData);
  }

  setupSearch() {
    if (!this.searchInput || !this.searchResults) return;

    let searchTimeout;
    this.searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();

      if (query.length < 2) {
        this.searchResults.classList.remove("show");
        return;
      }

      searchTimeout = setTimeout(() => {
        this.performSearch(query);
      }, 300);
    });

    // Hide search results when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".toc-search")) {
        this.searchResults.classList.remove("show");
      }
    });
  }

  performSearch(query) {
    if (!this.searchIndex) return;

    try {
      const results = this.searchIndex.search(query, {
        limit: 10,
        fuzzy: 0.2,
        prefix: true,
      });

      this.renderSearchResults(results);
    } catch (error) {
      console.error("Search error:", error);
      this.searchResults.classList.remove("show");
    }
  }

  renderSearchResults(results) {
    if (results.length === 0) {
      this.searchResults.innerHTML =
        '<div class="search-result-item"><div class="result-title">No results found</div></div>';
      this.searchResults.classList.add("show");
      return;
    }

    const resultsHTML = results
      .map((result) => {
        const item = this.searchData.find((d) => d.id === result.id);
        if (!item) return "";

        const contextText =
          item.text.length > 100
            ? item.text.substring(0, 100) + "..."
            : item.text;

        return `
        <div class="search-result-item" data-chapter="${item.chapterSlug}" data-section="${item.sectionId}">
          <div class="result-title">${item.heading}</div>
          <div class="result-context">${item.chapterTitle}${contextText ? " - " + contextText : ""}</div>
        </div>
      `;
      })
      .join("");

    this.searchResults.innerHTML = resultsHTML;
    this.searchResults.classList.add("show");

    // Add click handlers for search results
    this.searchResults
      .querySelectorAll(".search-result-item")
      .forEach((item) => {
        item.addEventListener("click", () => {
          const chapterSlug = item.getAttribute("data-chapter");
          const sectionId = item.getAttribute("data-section");

          this.loadChapter(chapterSlug).then(() => {
            if (sectionId && sectionId !== "null") {
              // Update URL to include both chapter and section
              window.location.hash = `${chapterSlug}#${sectionId}`;

              setTimeout(() => {
                const targetElement = document.getElementById(sectionId);
                if (targetElement) {
                  // Scroll with some space above the heading
                  const elementTop = targetElement.offsetTop;
                  const scrollTop = elementTop - this.SECTION_SCROLL_OFFSET;
                  this.docContainer.scrollTo({
                    top: scrollTop,
                    behavior: "smooth",
                  });
                }
              }, 100);
            } else {
              // Just chapter navigation
              window.location.hash = chapterSlug;
            }
          });

          this.searchResults.classList.remove("show");
          this.searchInput.value = "";
        });
      });
  }

  setupSectionScrollTracking(slug) {
    // Remove any existing scroll listeners
    if (this.scrollListener) {
      this.docContainer.removeEventListener("scroll", this.scrollListener);
    }

    // Create new scroll listener
    this.scrollListener = () => {
      const headings = this.docContainer.querySelectorAll("h2, h3, h4");
      const sectionsContainer = document.getElementById(`sections-${slug}`);
      if (!sectionsContainer) return;

      let activeSection = null;
      const containerRect = this.docContainer.getBoundingClientRect();
      const containerTop = containerRect.top;
      const containerHeight = containerRect.height;

      // Find the heading that's currently in view
      headings.forEach((heading) => {
        const headingRect = heading.getBoundingClientRect();
        const headingTop = headingRect.top - containerTop;

        // Consider a heading active if it's near the top of the container
        // Account for our scroll offset to match the actual scroll behavior
        if (
          headingTop >= -this.SECTION_SCROLL_OFFSET &&
          headingTop <= this.SECTION_SCROLL_OFFSET + 20
        ) {
          activeSection = heading.id;
        }
      });

      // If no heading is in the ideal position, find the last one that's above the viewport
      if (!activeSection) {
        for (let i = headings.length - 1; i >= 0; i--) {
          const heading = headings[i];
          const headingRect = heading.getBoundingClientRect();
          const headingTop = headingRect.top - containerTop;

          // Use our scroll offset here too for consistency
          if (headingTop <= this.SECTION_SCROLL_OFFSET) {
            activeSection = heading.id;
            break;
          }
        }
      }

      // Update active section in TOC
      sectionsContainer.querySelectorAll(".section-link").forEach((link) => {
        link.classList.remove("active");
      });

      if (activeSection) {
        const activeLink = sectionsContainer.querySelector(
          `[data-section="${activeSection}"]`,
        );
        if (activeLink) {
          activeLink.classList.add("active");
        }
      }
    };

    // Add the scroll listener
    this.docContainer.addEventListener("scroll", this.scrollListener);

    // Initial call to set active section
    setTimeout(() => this.scrollListener(), 100);
  }

  setupNavigation() {
    // Handle browser back/forward navigation
    window.addEventListener("hashchange", () => {
      const hash = window.location.hash.substring(1);
      this.handleHashNavigation(hash);
    });

    // Handle keyboard navigation
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" && e.ctrlKey) {
        // Ctrl + Left Arrow - Previous chapter
        if (this.currentChapterIndex > 0) {
          const prevChapter = this.chapters[this.currentChapterIndex - 1];
          this.loadChapter(prevChapter.slug);
          window.location.hash = prevChapter.slug;
        }
      } else if (e.key === "ArrowRight" && e.ctrlKey) {
        // Ctrl + Right Arrow - Next chapter
        if (this.currentChapterIndex < this.chapters.length - 1) {
          const nextChapter = this.chapters[this.currentChapterIndex + 1];
          this.loadChapter(nextChapter.slug);
          window.location.hash = nextChapter.slug;
        }
      }
    });
  }

  handleHashNavigation(hash) {
    if (!hash) return;

    // Check if hash contains both chapter and section (format: chapter#section)
    const parts = hash.split("#");
    const chapterSlug = parts[0];
    const sectionId = parts[1];

    // Verify chapter exists
    if (this.chapters.find((ch) => ch.slug === chapterSlug)) {
      this.loadChapter(chapterSlug).then(() => {
        // If there's a section ID, scroll to it after chapter loads
        if (sectionId) {
          setTimeout(() => {
            const targetElement = document.getElementById(sectionId);
            if (targetElement) {
              const elementTop = targetElement.offsetTop;
              const scrollTop = elementTop - this.SECTION_SCROLL_OFFSET;
              this.docContainer.scrollTo({
                top: scrollTop,
                behavior: "smooth",
              });
            }
          }, 100);
        }
      });
    }
  }

  hideLoadingOverlay() {
    if (this.loadingOverlay) {
      setTimeout(() => {
        this.loadingOverlay.classList.add("hidden");
        setTimeout(() => {
          this.loadingOverlay.remove();
        }, 500);
      }, 1000);
    }
  }
}

// Initialize the documentation app when DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  // Set up translations first
  fetchUserLangugage();
  translateHTML();
  initOrgQueryParams();
  // Then initialize the app
  new DocumentationApp();
});
