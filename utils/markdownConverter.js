const TurndownService = require('turndown');
const turndownService = new TurndownService();

function htmlToMarkdown(htmlContent) {
  return turndownService.turndown(htmlContent);
}

module.exports = htmlToMarkdown;
