/**
 * DimDash Command Palette (F3)
 * High-performance subsequence search with Persian/Arabic character folding,
 * keyboard navigation, and instant camera/action execution.
 * Universal Module (Node.js & Browser)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DimDashCommandPalette = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Persian & Arabic Diacritics regex
  const DIACRITICS_REGEX = /[\u064B-\u065F\u0670\u0617-\u061A]/g;
  const ZWNJ_REGEX = /[\u200C\u200B\uFEFF]/g;

  /**
   * Normalizes Persian and Arabic text for tolerant search:
   * - Folds Arabic Yeh (ي, ى) to Persian Yeh (ی)
   * - Folds Arabic Kaf (ك) to Persian Kaf (ک)
   * - Strips diacritics (aerab / vowels)
   * - Strips Zero-Width Non-Joiner (ZWNJ)
   * - Lowercases Latin characters
   */
  function foldText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .toLowerCase()
      .replace(DIACRITICS_REGEX, '')
      .replace(ZWNJ_REGEX, '')
      .replace(/[\u064A\u0649]/g, '\u06CC') // ي, ى -> ی
      .replace(/[\u0643]/g, '\u06A9')     // ك -> ک
      .replace(/[\u0629]/g, '\u0647')     // ة -> ه
      .replace(/[\u0622\u0623\u0625]/g, '\u0627') // آ, أ, إ -> ا
      .trim();
  }

  /**
   * Subsequence fuzzy scoring algorithm:
   * Returns positive score on match, or -1 if no match.
   */
  function scoreMatch(queryNorm, targetNorm) {
    if (!queryNorm) return 100;
    if (queryNorm === targetNorm) return 1000;
    if (targetNorm.startsWith(queryNorm)) return 500 + (queryNorm.length / targetNorm.length) * 100;
    const subIdx = targetNorm.indexOf(queryNorm);
    if (subIdx !== -1) {
      return 300 - subIdx * 5 + (queryNorm.length / targetNorm.length) * 50;
    }

    // Subsequence match
    let qIdx = 0;
    let tIdx = 0;
    let score = 0;
    let consecutive = 0;

    while (qIdx < queryNorm.length && tIdx < targetNorm.length) {
      if (queryNorm[qIdx] === targetNorm[tIdx]) {
        score += 10 + consecutive * 5;
        consecutive++;
        qIdx++;
      } else {
        consecutive = 0;
      }
      tIdx++;
    }

    if (qIdx === queryNorm.length) {
      return score;
    }
    return -1;
  }

  class CommandPalette {
    constructor(options = {}) {
      this.entries = [];
      this.maxResults = options.maxResults || 15;
      this.onExecute = options.onExecute || null;
      this.isOpen = false;
      this.selectedIndex = 0;
      this.filtered = [];
    }

    setCatalog(catalog = {}) {
      const items = catalog.items || [];
      const islands = catalog.islands || [];
      const actions = catalog.actions || [];
      const scenes = catalog.scenes || [];

      const list = [];

      for (const it of items) {
        list.push({
          id: it.id,
          type: 'item',
          title: it.title || it.id,
          subtitle: it.url || it.kind || 'Service Tile',
          icon: it.icon || 'globe',
          data: it
        });
      }

      for (const isl of islands) {
        list.push({
          id: isl.id,
          type: 'island',
          title: isl.title || isl.id,
          subtitle: `Island (${isl.layout || 'grid'})`,
          icon: 'layers',
          data: isl
        });
      }

      for (const sc of scenes) {
        list.push({
          id: sc.id,
          type: 'scene',
          title: sc.name || sc.id,
          subtitle: 'Display Scene',
          icon: 'monitor',
          data: sc
        });
      }

      for (const act of actions) {
        list.push({
          id: act.id,
          type: 'action',
          title: act.title,
          subtitle: act.category || 'Action',
          shortcut: act.shortcut || '',
          icon: act.icon || 'zap',
          action: act.run
        });
      }

      // Pre-compute normalized search fields for ultra-fast query latency
      this.entries = list.map((entry) => ({
        ...entry,
        _normTitle: foldText(entry.title),
        _normSubtitle: foldText(entry.subtitle)
      }));
    }

    search(query) {
      const qNorm = foldText(query);
      if (!qNorm) {
        this.filtered = this.entries.slice(0, this.maxResults);
        this.selectedIndex = 0;
        return this.filtered;
      }

      const firstChar = qNorm[0];
      const results = [];
      const len = this.entries.length;

      for (let i = 0; i < len; i++) {
        const item = this.entries[i];
        const tNorm = item._normTitle;
        const sNorm = item._normSubtitle;

        // Ultra-fast rejection: if neither title nor subtitle contain the first search char, skip immediately
        if (tNorm.indexOf(firstChar) === -1 && sNorm.indexOf(firstChar) === -1) {
          continue;
        }

        const sTitle = scoreMatch(qNorm, tNorm);
        const sSub = scoreMatch(qNorm, sNorm);
        const bestScore = Math.max(sTitle, sSub > 0 ? sSub * 0.7 : -1);

        if (bestScore > 0) {
          results.push({ item, score: bestScore });
        }
      }

      results.sort((a, b) => b.score - a.score);
      this.filtered = results.slice(0, this.maxResults).map((r) => r.item);
      this.selectedIndex = 0;
      return this.filtered;
    }

    selectNext() {
      if (this.filtered.length === 0) return;
      this.selectedIndex = (this.selectedIndex + 1) % this.filtered.length;
    }

    selectPrev() {
      if (this.filtered.length === 0) return;
      this.selectedIndex = (this.selectedIndex - 1 + this.filtered.length) % this.filtered.length;
    }

    getSelected() {
      return this.filtered[this.selectedIndex] || null;
    }

    executeSelected() {
      const selected = this.getSelected();
      if (!selected) return null;
      if (typeof this.onExecute === 'function') {
        this.onExecute(selected);
      }
      return selected;
    }
  }

  return {
    foldText,
    scoreMatch,
    CommandPalette
  };
});
