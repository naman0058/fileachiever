/**
 * PRM bulk paste: parse markdown-style report text into sections/subheadings (Quill HTML).
 * Exposes window.PrmBulkImport { parse, mergeIntoSections, normalizeMatchKey, normalizeMainHeading }
 */
(function (global) {
  'use strict';

  function stripHeadingNumber(heading) {
    return (heading || '')
      .toString()
      .trim()
      .replace(/^(chapter\s+)?\d+(\.\d+)*\s*[\.\):-]?\s*/i, '')
      .trim();
  }

  function normalizeMainHeading(raw) {
    let t = (raw || '').toString().trim();
    t = t.replace(/^chapter\s+\d+\s*[:\u2014\-–]\s*/i, '');
    t = t.replace(/^chapter\s+\d+\s*:\s*/i, '');
    t = t.replace(/^chapter\s+\d+\s*$/i, '');
    t = stripHeadingNumber(t);
    return t.trim();
  }

  function normalizeMatchKey(title) {
    return normalizeMainHeading(title)
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Singular/plural for titles like Reference(s). */
  function singularMatchKey(key) {
    if (!key || key.length < 4) return key;
    if (key === 'references') return 'reference';
    if (key.endsWith('s') && !key.endsWith('ss') && key.length > 5) return key.slice(0, -1);
    return key;
  }

  var FUZZY_MATCH_MIN = 85;

  /** Titles treated as the same subheading (normalized keys). */
  var SUBHEADING_EQUIVALENCE_GROUPS = [
    [
      'major functional modules',
      'module wise implementation',
      'module-wise implementation',
      'modules wise implementation',
      'functional modules',
      'system modules',
    ],
  ];

  var OVERVIEW_SUFFIX_RE = /^( overview| summary| introduction)$/i;

  function keyInAliasGroup(key, groupKeys) {
    if (groupKeys.indexOf(key) >= 0) return true;
    for (var i = 0; i < groupKeys.length; i++) {
      if (titleMatchScoreBase(key, groupKeys[i]) >= 90) return true;
    }
    return false;
  }

  function keysShareAliasGroup(k1, k2) {
    for (var gi = 0; gi < SUBHEADING_EQUIVALENCE_GROUPS.length; gi++) {
      var groupKeys = SUBHEADING_EQUIVALENCE_GROUPS[gi].map(normalizeMatchKey);
      if (keyInAliasGroup(k1, groupKeys) && keyInAliasGroup(k2, groupKeys)) return true;
    }
    return false;
  }

  /**
   * Score how well a pasted title matches an existing title (0–100), without alias groups.
   */
  function titleMatchScoreBase(pasteKey, existingKey) {
    if (!pasteKey || !existingKey) return 0;
    if (pasteKey === existingKey) return 100;
    if (singularMatchKey(pasteKey) === singularMatchKey(existingKey)) return 98;

    if (existingKey.indexOf(pasteKey) === 0) {
      var tail = existingKey.slice(pasteKey.length);
      if (OVERVIEW_SUFFIX_RE.test(tail)) return 97;
      var after = existingKey.charAt(pasteKey.length);
      if (!after || after === ' ') {
        if (pasteKey.length >= 4 || pasteKey.split(' ').filter(Boolean).length >= 2) return 95;
      }
    }
    if (pasteKey.indexOf(existingKey) === 0) {
      var after2 = pasteKey.charAt(existingKey.length);
      if (!after2 || after2 === ' ') {
        if (existingKey.length >= 4 || existingKey.split(' ').filter(Boolean).length >= 2) return 93;
      }
    }

    var short = pasteKey.length <= existingKey.length ? pasteKey : existingKey;
    var long = pasteKey.length <= existingKey.length ? existingKey : pasteKey;
    var sw = short.split(' ').filter(Boolean);
    var lw = long.split(' ').filter(Boolean);
    if (sw.length >= 2 && lw.length >= sw.length) {
      var prefixOk = true;
      for (var wi = 0; wi < sw.length; wi++) {
        if (sw[wi] !== lw[wi]) {
          prefixOk = false;
          break;
        }
      }
      if (prefixOk) return 90;
    }
    return 0;
  }

  function titleMatchScore(pasteKey, existingKey) {
    var score = titleMatchScoreBase(pasteKey, existingKey);
    if (keysShareAliasGroup(pasteKey, existingKey)) score = Math.max(score, 96);
    return score;
  }

  function pickBestSubheadingCandidate(candidates, pasteKey) {
    var viable = candidates.filter(function (c) {
      return c.score >= FUZZY_MATCH_MIN;
    });
    if (!viable.length) return null;

    var longerPrefix = viable.filter(function (c) {
      return c.key.indexOf(pasteKey) === 0 && c.key.length > pasteKey.length;
    });
    if (longerPrefix.length) {
      longerPrefix.sort(function (a, b) {
        return b.keyLen - a.keyLen || b.score - a.score;
      });
      return longerPrefix[0];
    }

    viable.sort(function (a, b) {
      return b.score - a.score || b.keyLen - a.keyLen;
    });
    return viable[0];
  }

  function findBestSubheadingIndex(subheadings, pasteKey) {
    var candidates = [];
    (subheadings || []).forEach(function (sh, j) {
      if (isBlankSubTitle(sh.subheading)) return;
      var sk = normalizeMatchKey(sh.subheading);
      if (!sk) return;
      candidates.push({
        subIndex: j,
        score: titleMatchScore(pasteKey, sk),
        key: sk,
        keyLen: sk.length,
      });
    });
    var best = pickBestSubheadingCandidate(candidates, pasteKey);
    return best ? best.subIndex : -1;
  }

  function findGlobalBestSubheading(existingSections, parsedHeading) {
    var key = normalizeMatchKey(parsedHeading);
    if (!key) return null;
    var candidates = [];
    existingSections.forEach(function (sec, si) {
      (sec.subheadings || []).forEach(function (sh, sj) {
        if (isBlankSubTitle(sh.subheading)) return;
        var sk = normalizeMatchKey(sh.subheading);
        if (!sk) return;
        candidates.push({
          mode: 'subheading',
          sectionIndex: si,
          subIndex: sj,
          score: titleMatchScore(key, sk),
          key: sk,
          keyLen: sk.length,
        });
      });
    });
    var best = pickBestSubheadingCandidate(candidates, key);
    if (!best) return null;
    return {
      mode: 'subheading',
      sectionIndex: best.sectionIndex,
      subIndex: best.subIndex,
      score: best.score,
    };
  }

  /**
   * Best match anywhere. Subheadings are checked before main sections (avoids duplicate subs).
   */
  function findGlobalBestTarget(existingSections, parsedHeading) {
    var key = normalizeMatchKey(parsedHeading);
    if (!key) return null;

    var sub = findGlobalBestSubheading(existingSections, parsedHeading);
    if (sub) return sub;

    var bestSec = null;
    existingSections.forEach(function (sec, si) {
      var hk = normalizeMatchKey(sec.heading);
      if (!hk) return;
      var score = titleMatchScore(key, hk);
      if (score < FUZZY_MATCH_MIN) return;
      if (!bestSec || score > bestSec.score) {
        bestSec = { mode: 'section', sectionIndex: si, score: score };
      }
    });
    return bestSec;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatInlineMarkdown(text) {
    let s = escapeHtml(text);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, function (_, pre, inner) {
      return pre + '<em>' + inner + '</em>';
    });
    s = s.replace(/(^|[^_])_([^_\n]+?)_(?!_)/g, function (_, pre, inner) {
      return pre + '<em>' + inner + '</em>';
    });
    return s;
  }

  function markdownBlockToHtml(block) {
    const src = (block || '').replace(/\r\n/g, '\n').trim();
    if (!src) return '';

    const lines = src.split('\n');
    const parts = [];
    let para = [];
    let listType = null;
    let listItems = [];

    function flushPara() {
      const t = para.join(' ').replace(/\s+/g, ' ').trim();
      if (t) parts.push('<p>' + formatInlineMarkdown(t) + '</p>');
      para = [];
    }

    function flushList() {
      if (!listItems.length) return;
      const tag = listType === 'ol' ? 'ol' : 'ul';
      parts.push(
        '<' + tag + '>' +
          listItems.map(function (li) {
            return '<li>' + formatInlineMarkdown(li) + '</li>';
          }).join('') +
          '</' + tag + '>'
      );
      listItems = [];
      listType = null;
    }

    lines.forEach(function (line) {
      const trimmed = line.trim();
      if (!trimmed) {
        flushPara();
        flushList();
        return;
      }
      if (/^-{3,}$/.test(trimmed)) {
        flushPara();
        flushList();
        return;
      }
      const ul = trimmed.match(/^[-*•]\s+(.+)$/);
      if (ul) {
        flushPara();
        if (listType && listType !== 'ul') flushList();
        listType = 'ul';
        listItems.push(ul[1]);
        return;
      }
      const ol = trimmed.match(/^\d+\.\s+(.+)$/);
      if (ol) {
        flushPara();
        if (listType && listType !== 'ol') flushList();
        listType = 'ol';
        listItems.push(ol[1]);
        return;
      }
      flushList();
      para.push(trimmed);
    });

    flushPara();
    flushList();
    return parts.join('');
  }

  /**
   * @param {string} raw
   * @returns {{ sections: Array<{heading:string, subheadings:Array<{subheading:string, body:string}>}> }}
   */
  function parse(raw) {
    const text = (raw || '').toString().replace(/\r\n/g, '\n');
    const lines = text.split('\n');
    const sections = [];
    let currentSection = null;
    let currentSub = null;

    function flushSub() {
      if (!currentSection || !currentSub) return;
      const body = markdownBlockToHtml((currentSub.bodyLines || []).join('\n'));
      const subTitle = (currentSub.subheading || '').trim();
      if (body || subTitle) {
        currentSection.subheadings.push({ subheading: subTitle, body: body });
      }
      currentSub = null;
    }

    function flushSection() {
      if (!currentSection) return;
      flushSub();
      if (!currentSection.subheadings.length) {
        currentSection.subheadings.push({ subheading: '', body: '' });
      }
      sections.push(currentSection);
      currentSection = null;
    }

    function ensureSection() {
      if (!currentSection) {
        currentSection = { heading: '', subheadings: [] };
      }
    }

    function pushLine(line) {
      ensureSection();
      if (!currentSub) currentSub = { subheading: '', bodyLines: [] };
      currentSub.bodyLines.push(line);
    }

    lines.forEach(function (line) {
      const h2 = line.match(/^##\s+(.+)$/);
      if (h2) {
        ensureSection();
        flushSub();
        currentSub = { subheading: h2[1].trim(), bodyLines: [] };
        return;
      }
      const h1 = line.match(/^#\s+(.+)$/);
      if (h1) {
        flushSection();
        const heading = normalizeMainHeading(h1[1]);
        if (!heading) return;
        currentSection = { heading: heading, subheadings: [] };
        currentSub = null;
        return;
      }
      if (currentSection) pushLine(line);
    });

    flushSection();
    return { sections: sections };
  }

  function isBlankSubTitle(title) {
    const t = (title || '').trim();
    return !t || t === '(Untitled)';
  }

  function isGenericSectionHeading(heading) {
    const k = normalizeMatchKey(heading);
    if (!k) return true;
    if (k === 'untitled' || k === 'untitled section') return true;
    if (/^(section|chapter|part)\s*\d+$/.test(k)) return true;
    if (/^(section|chapter|part)$/.test(k)) return true;
    return false;
  }

  /** @deprecated use findGlobalBestTarget */
  function findMergeTarget(existingSections, parsedHeading) {
    return findGlobalBestTarget(existingSections, parsedHeading);
  }

  function ensureSectionSubs(section) {
    if (!Array.isArray(section.subheadings) || !section.subheadings.length) {
      section.subheadings = [{ subheading: '', body: '' }];
    }
    return section;
  }

  function resolveSubheadingIndex(subheadings, pasteTitle) {
    var key = normalizeMatchKey(pasteTitle);
    if (!key) return -1;
    return findBestSubheadingIndex(subheadings, key);
  }

  function applyParsedSubsToSection(target, parsedSubs, stats, parsedSectionHeading, allSections) {
    ensureSectionSubs(target);
    var pasteKey = normalizeMatchKey(parsedSectionHeading || '');
    var singleBlank =
      parsedSubs.length === 1 && isBlankSubTitle(parsedSubs[0].subheading);

      if (singleBlank) {
        var body = parsedSubs[0].body || '';
        var matchIdx = pasteKey ? resolveSubheadingIndex(target.subheadings, parsedSectionHeading) : -1;
        if (matchIdx < 0 && pasteKey && allSections) {
          var globalHit = findGlobalBestSubheading(allSections, parsedSectionHeading);
          if (globalHit) {
            var gParent = allSections[globalHit.sectionIndex];
            ensureSectionSubs(gParent);
            gParent.subheadings[globalHit.subIndex].body = body;
            stats.subheadingsUpdated += 1;
            return;
          }
        }
        if (matchIdx >= 0) {
          target.subheadings[matchIdx].body = body;
          stats.subheadingsUpdated += 1;
          return;
        }
      var blankIdx = -1;
      (target.subheadings || []).forEach(function (sh, j) {
        if (blankIdx >= 0) return;
        if (isBlankSubTitle(sh.subheading) && !String(sh.body || '').replace(/<[^>]+>/g, '').trim()) {
          blankIdx = j;
        }
      });
      if (blankIdx >= 0) {
        target.subheadings[blankIdx].body = body;
        stats.subheadingsUpdated += 1;
        return;
      }
      if (target.subheadings.length === 1 && isBlankSubTitle(target.subheadings[0].subheading)) {
        target.subheadings[0].body = body;
        stats.subheadingsUpdated += 1;
        return;
      }
      var onlyUntitled = target.subheadings.every(function (sh) {
        return isBlankSubTitle(sh.subheading);
      });
      if (onlyUntitled && target.subheadings.length) {
        target.subheadings[0].body = body;
        if (parsedSectionHeading && String(parsedSectionHeading).trim()) {
          target.subheadings[0].subheading = String(parsedSectionHeading).trim();
        }
        stats.subheadingsUpdated += 1;
        return;
      }
      return;
    }

    parsedSubs.forEach(function (ps) {
      var body = ps.body || '';
      var psTitle = (ps.subheading || '').trim();
      var j = resolveSubheadingIndex(target.subheadings, psTitle);
      if (j >= 0) {
        target.subheadings[j].body = body;
        stats.subheadingsUpdated += 1;
      } else if (psTitle && allSections) {
        var globalSub = findGlobalBestSubheading(allSections, psTitle);
        if (globalSub) {
          var gSec = allSections[globalSub.sectionIndex];
          ensureSectionSubs(gSec);
          gSec.subheadings[globalSub.subIndex].body = body;
          stats.subheadingsUpdated += 1;
        } else {
          target.subheadings.push({ subheading: psTitle, body: body });
          stats.subheadingsCreated += 1;
        }
      } else if (psTitle) {
        target.subheadings.push({ subheading: psTitle, body: body });
        stats.subheadingsCreated += 1;
      } else if (body) {
        var blankSlot = -1;
        target.subheadings.forEach(function (sh, idx) {
          if (blankSlot >= 0) return;
          if (isBlankSubTitle(sh.subheading)) blankSlot = idx;
        });
        if (blankSlot >= 0) {
          target.subheadings[blankSlot].body = body;
          stats.subheadingsUpdated += 1;
        }
      }
    });
  }

  /**
   * Merge parsed sections into existing in-memory structure (mutates target array).
   * @returns {{ sectionsCreated, sectionsUpdated, subheadingsCreated, subheadingsUpdated, matchedAsSubheading }}
   */
  function mergeIntoSections(existingSections, parsedSections) {
    const stats = {
      sectionsCreated: 0,
      sectionsUpdated: 0,
      subheadingsCreated: 0,
      subheadingsUpdated: 0,
      matchedAsSubheading: 0,
    };

    parsedSections.forEach(function (parsed) {
      var key = normalizeMatchKey(parsed.heading);
      if (!key) return;

      var parsedSubs = parsed.subheadings || [];
      var located = findGlobalBestTarget(existingSections, parsed.heading);
      var singleBlank =
        parsedSubs.length === 1 && isBlankSubTitle(parsedSubs[0].subheading);

      if (located && located.mode === 'subheading') {
        var parent = existingSections[located.sectionIndex];
        ensureSectionSubs(parent);
        if (singleBlank) {
          parent.subheadings[located.subIndex].body = parsedSubs[0].body || '';
          stats.subheadingsUpdated += 1;
        } else {
          applyParsedSubsToSection(parent, parsedSubs, stats, parsed.heading, existingSections);
        }
        stats.matchedAsSubheading += 1;
        return;
      }

      if (located && located.mode === 'section') {
        var targetSec = existingSections[located.sectionIndex];
        stats.sectionsUpdated += 1;
        applyParsedSubsToSection(targetSec, parsedSubs, stats, parsed.heading, existingSections);
        return;
      }

      var target = {
        heading: parsed.heading,
        subheadings: [{ subheading: '', body: '' }],
      };
      existingSections.push(target);
      stats.sectionsCreated += 1;
      applyParsedSubsToSection(target, parsedSubs, stats, parsed.heading, existingSections);
    });

    return stats;
  }

  global.PrmBulkImport = {
    parse: parse,
    mergeIntoSections: mergeIntoSections,
    findMergeTarget: findMergeTarget,
    findGlobalBestTarget: findGlobalBestTarget,
    findBestSubheadingIndex: findBestSubheadingIndex,
    titleMatchScore: titleMatchScore,
    normalizeMatchKey: normalizeMatchKey,
    normalizeMainHeading: normalizeMainHeading,
    markdownBlockToHtml: markdownBlockToHtml,
  };
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
