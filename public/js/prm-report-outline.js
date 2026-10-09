/**
 * Standard FileMakr PRM report skeleton (main headings + subheadings).
 * Use before bulk paste so content maps to subheadings, not extra main sections.
 */
(function (global) {
  'use strict';

  var STANDARD_REPORT_OUTLINE = [
    {
      heading: 'Abstract',
      subheadings: [],
    },
    {
      heading: 'Introduction',
      subheadings: [
        'Background of the Project',
        'Problem Statement',
        'Objectives of the System',
        'Scope of the Project',
        'Existing System Overview',
        'Proposed System Overview',
        'Technologies Used',
        'Overview',
        'Limitations',
        'Advantages',
        'Disadvantages',
      ],
    },
    {
      heading: 'Literature Review / System Study',
      subheadings: [
        'Introduction',
        'Review of Similar Systems',
        'Comparative Analysis',
        'Software Development Models',
      ],
    },
    {
      heading: 'System Analysis',
      subheadings: [
        'Introduction',
        'Functional Requirements',
        'Non-Functional Requirements',
        'User Requirements',
        'Feasibility Study',
        'Technical Feasibility',
        'Economic Feasibility',
        'Operational Feasibility',
        'System Architecture',
        'Data Flow Diagram (Level 0)',
        'Data Flow Diagram (Level 1)',
        'Data Flow Diagram (Level 2)',
      ],
    },
    {
      heading: 'System Design',
      subheadings: [
        'Introduction',
        'Use Case Diagram',
        'Class Diagram',
        'Sequence Diagram',
        'Activity Diagram',
        'ER Diagram',
        'Database Schema',
        'Table Structures',
      ],
    },
    {
      heading: 'System Implementation',
      subheadings: [
        'Introduction',
        'Development Environment',
        'Tools and Technologies Used',
        'Hardware Requirements',
        'Software Requirements',
        'Module-wise Implementation',
      ],
    },
    {
      heading: 'Testing',
      subheadings: [
        'Introduction',
        'Testing Strategy',
        'Unit Testing',
        'Integration Testing',
        'System Testing',
        'Test Cases',
        'Bug Reports',
      ],
    },
    {
      heading: 'Results and Discussion',
      subheadings: ['All screenshots'],
    },
    {
      heading: 'Conclusion and Future Enhancements',
      subheadings: ['Conclusion', 'Future Enhancements'],
    },
    {
      heading: 'References',
      subheadings: [],
    },
  ];

  function cloneSection(sec) {
    return {
      heading: sec.heading || '',
      subheadings: (sec.subheadings || []).map(function (sh) {
        return { subheading: sh.subheading || '', body: sh.body || '' };
      }),
    };
  }

  function findExistingSectionIndex(sections, heading, matchApi) {
    var key = matchApi.normalizeMatchKey(heading);
    if (!key) return -1;
    var bestIdx = -1;
    var bestScore = 0;
    sections.forEach(function (sec, i) {
      var hk = matchApi.normalizeMatchKey(sec.heading);
      if (!hk) return;
      var score = matchApi.titleMatchScore(key, hk);
      if (score >= 90 && score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    });
    return bestIdx;
  }

  function subheadingExists(sec, title, matchApi) {
    if (!title || !String(title).trim()) return false;
    var key = matchApi.normalizeMatchKey(title);
    if (matchApi.findBestSubheadingIndex && matchApi.findBestSubheadingIndex(sec.subheadings, key) >= 0) {
      return true;
    }
    return false;
  }

  function ensureMinOneSub(section) {
    if (!section.subheadings || !section.subheadings.length) {
      section.subheadings = [{ subheading: '', body: '' }];
    }
  }

  /**
   * Apply catalog outline to in-memory sections (mutates array).
   * Preserves body content; skips existing headings/subs; orders sections to match outline.
   */
  function applyStandardOutline(existingSections, matchApi) {
    matchApi = matchApi || global.PrmBulkImport;
    if (!matchApi || !matchApi.normalizeMatchKey) {
      throw new Error('PrmBulkImport required');
    }

    var stats = {
      sectionsCreated: 0,
      sectionsSkipped: 0,
      subheadingsCreated: 0,
      subheadingsSkipped: 0,
    };

    var source = existingSections.map(cloneSection);
    var usedSource = {};
    var ordered = [];

    STANDARD_REPORT_OUTLINE.forEach(function (chapter) {
      var srcIdx = findExistingSectionIndex(source, chapter.heading, matchApi);
      var sec;
      if (srcIdx >= 0) {
        usedSource[srcIdx] = true;
        sec = cloneSection(source[srcIdx]);
        stats.sectionsSkipped += 1;
      } else {
        sec = { heading: chapter.heading, subheadings: [] };
        stats.sectionsCreated += 1;
      }

      (chapter.subheadings || []).forEach(function (subTitle) {
        if (subheadingExists(sec, subTitle, matchApi)) {
          stats.subheadingsSkipped += 1;
          return;
        }
        sec.subheadings.push({ subheading: subTitle, body: '' });
        stats.subheadingsCreated += 1;
      });

      ensureMinOneSub(sec);
      ordered.push(sec);
    });

    source.forEach(function (sec, i) {
      if (usedSource[i]) return;
      var key = matchApi.normalizeMatchKey(sec.heading);
      var inOutline = STANDARD_REPORT_OUTLINE.some(function (ch) {
        return matchApi.titleMatchScore(key, matchApi.normalizeMatchKey(ch.heading)) >= 90;
      });
      if (!inOutline) ordered.push(cloneSection(sec));
    });

    existingSections.length = 0;
    existingSections.push.apply(existingSections, ordered);

    return stats;
  }

  global.PrmReportOutline = {
    STANDARD_REPORT_OUTLINE: STANDARD_REPORT_OUTLINE,
    applyStandardOutline: applyStandardOutline,
  };
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
