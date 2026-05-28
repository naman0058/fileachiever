/**
 * Ensures GTM container snippet is present on every HTML response.
 * Safety net for templates that omit Includes/gtm-head or Includes/gtm-body.
 */
function createGtmInjectMiddleware(gtmContainerId) {
  const gtmId = gtmContainerId || 'GTM-T6C299QC';
  if (!gtmId) {
    return (req, res, next) => next();
  }

  const headSnippet = [
    '<!-- Google Tag Manager -->',
    '<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({\'gtm.start\':',
    'new Date().getTime(),event:\'gtm.js\'});var f=d.getElementsByTagName(s)[0],',
    'j=d.createElement(s),dl=l!=\'dataLayer\'?\'&l=\'+l:\'\';j.async=true;j.src=',
    '\'https://www.googletagmanager.com/gtm.js?id=\'+i+dl;f.parentNode.insertBefore(j,f);',
    '})(window,document,\'script\',\'dataLayer\',\'' + gtmId + '\');</script>',
    '<!-- End Google Tag Manager -->'
  ].join('\n');

  const bodySnippet = [
    '<!-- Google Tag Manager (noscript) -->',
    '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=' + gtmId + '"',
    'height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>',
    '<!-- End Google Tag Manager (noscript) -->'
  ].join('\n');

  function injectGtm(html) {
    if (!html || typeof html !== 'string') return html;
    if (!/<html[\s>]|<head[\s>]/i.test(html)) return html;
    if (html.includes('googletagmanager.com/gtm.js') || html.includes(gtmId)) return html;

    let out = html;
    if (/<head[\s>]/i.test(out)) {
      out = out.replace(/<head(\s[^>]*)?>/i, (match) => match + '\n' + headSnippet);
    }
    if (/<body(\s[^>]*)?>/i.test(out)) {
      out = out.replace(/<body(\s[^>]*)?>/i, (match) => match + '\n' + bodySnippet);
    }
    return out;
  }

  return function gtmInjectMiddleware(req, res, next) {
    const originalSend = res.send.bind(res);
    res.send = function sendWithGtm(body) {
      if (typeof body === 'string') {
        body = injectGtm(body);
      }
      return originalSend(body);
    };
    next();
  };
}

module.exports = { createGtmInjectMiddleware };
