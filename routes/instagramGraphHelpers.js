/**
 * Instagram Graph API helpers (shared by affiliate routes and daily-attendance team flow).
 */
const axios = require('axios');
const util = require('util');
const pool = require('./pool');
const queryAsync = util.promisify(pool.query).bind(pool);

const IG_API_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
let lastInstagramTokenRotation = 0;
const IG_TOKEN_ROTATION_MS = 24 * 60 * 60 * 1000;

function facebookAppCredentials() {
  const clientId = process.env.FACEBOOK_APP_ID || process.env.META_APP_ID;
  const clientSecret = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET;
  return { clientId, clientSecret };
}

async function refreshInstagramLongLivedToken(accessToken) {
  const { clientId, clientSecret } = facebookAppCredentials();
  if (!clientId || !clientSecret || !accessToken) return null;
  const url = `https://graph.facebook.com/${IG_API_VERSION}/oauth/access_token`;
  const { data } = await axios.get(url, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: accessToken
    }
  });
  return data.access_token || null;
}

async function saveInstagramAccessToken(token) {
  await queryAsync('UPDATE config SET instagramAccessToken = ? WHERE id = 1', [token]);
}

function isInstagramOAuthError(err) {
  const e = err.response?.data?.error;
  if (!e) return false;
  if (e.code === 190) return true;
  if (e.code === 102) return true;
  if (e.code === 4 || e.code === 17) return false;
  return /access token|session has expired|OAuthException/i.test(e.message || '');
}

function isInstagramTokenHardExpired(err) {
  const e = err.response?.data?.error;
  if (!e) return false;
  if (e.error_subcode === 463) return true;
  const msg = `${e.message || ''} ${e.error_user_msg || ''}`;
  return (
    /session has expired/i.test(msg) ||
    /session has been invalidated/i.test(msg) ||
    /user has not authorized/i.test(msg)
  );
}

function instagramApiUserFacingMessage(err) {
  if (isInstagramTokenHardExpired(err)) {
    return (
      'This Instagram access token has already expired. FACEBOOK_APP_ID and FACEBOOK_APP_SECRET only extend tokens that are still valid — they cannot replace a dead token. ' +
      'In Meta for Developers → your app → Graph API Explorer (or Business settings), generate a new long‑lived User or Page token with the Instagram permissions you need, then paste it into Affiliate → Config.'
    );
  }
  const e = err.response?.data?.error;
  return e?.message || err.message || 'Instagram API error';
}

async function rotateInstagramTokenIfDue(accessToken) {
  const { clientId, clientSecret } = facebookAppCredentials();
  if (!clientId || !clientSecret) return accessToken;
  const now = Date.now();
  if (now - lastInstagramTokenRotation < IG_TOKEN_ROTATION_MS) return accessToken;
  lastInstagramTokenRotation = now;
  try {
    const newTok = await refreshInstagramLongLivedToken(accessToken);
    if (newTok) {
      await saveInstagramAccessToken(newTok);
      return newTok;
    }
  } catch (err) {
    console.warn('Instagram scheduled token extend failed:', err.response?.data || err.message);
  }
  return accessToken;
}

async function fetchInstagramMedia(userId, token, tryRefreshOnError = true) {
  let active = await rotateInstagramTokenIfDue(token);
  const url = `https://graph.facebook.com/${IG_API_VERSION}/${userId}/media`;
  const params = {
    fields: 'id,caption,timestamp,media_type,media_url,permalink',
    access_token: active
  };
  try {
    const response = await axios.get(url, { params });
    return response.data;
  } catch (error) {
    if (
      tryRefreshOnError &&
      isInstagramOAuthError(error) &&
      !isInstagramTokenHardExpired(error)
    ) {
      const newTok = await refreshInstagramLongLivedToken(active);
      if (newTok) {
        await saveInstagramAccessToken(newTok);
        return fetchInstagramMedia(userId, newTok, false);
      }
    }
    console.error('Error fetching Instagram media:', error.response?.data || error.message);
    throw error;
  }
}

async function fetchInstagramComments(mediaId, token, tryRefreshOnError = true) {
  let active = await rotateInstagramTokenIfDue(token);
  const url = `https://graph.facebook.com/${IG_API_VERSION}/${mediaId}`;
  const params = {
    fields: 'comments.limit(100){username,text}',
    access_token: active
  };
  try {
    const response = await axios.get(url, { params });
    return response.data;
  } catch (error) {
    if (
      tryRefreshOnError &&
      isInstagramOAuthError(error) &&
      !isInstagramTokenHardExpired(error)
    ) {
      const newTok = await refreshInstagramLongLivedToken(active);
      if (newTok) {
        await saveInstagramAccessToken(newTok);
        return fetchInstagramComments(mediaId, newTok, false);
      }
    }
    console.error('Error fetching comments:', error.response?.data || error.message);
    throw error;
  }
}

function escapeHtmlForTask(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildInstagramDailyTaskDescription(latest, brandUsername = '') {
  const link = latest.permalink || '#';
  const cap = latest.caption
    ? `<p><strong>Post caption:</strong> ${escapeHtmlForTask(latest.caption)}</p>`
    : '';
  const handleRaw = brandUsername ? String(brandUsername).replace(/^@/, '').trim() : '';
  const tagLine = handleRaw
    ? ` Tag <strong>${escapeHtmlForTask('@' + handleRaw)}</strong> when you share or repost.`
    : ' Tag our Instagram account when you share or repost.';
  const verifyLine =
    '<p><strong>Attendance verification:</strong> Comment on this post from the Instagram username in your profile. We check the comment automatically; the team then approves attendance in the affiliate dashboard. Please also <strong>like</strong> and share the post — apps cannot verify likes.</p>';
  return (
    `<p><strong>Task link:</strong> <a href="${escapeHtmlForTask(link)}" target="_blank" rel="noopener noreferrer">${escapeHtmlForTask(link)}</a></p>` +
    cap +
    verifyLine +
    `<p><strong>Please complete on Instagram:</strong></p>` +
    `<ul><li>Like the post</li><li>Comment on the post</li>` +
    `<li>Share (e.g. to your story)</li><li>Repost to feed or reel if you can</li></ul>` +
    `<p>${tagLine}</p>`
  );
}

function normalizeIgUsername(u) {
  return String(u || '')
    .replace(/^@/, '')
    .trim()
    .toLowerCase();
}

/** Profile may store @handle, URL, or instagram.com/username — normalize to compare with API username. */
function normalizeAmbassadorInstagramHandle(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  const urlMatch = s.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch) s = urlMatch[1];
  return normalizeIgUsername(s);
}

/** Daily task HTML produced by buildInstagramDailyTaskDescription / affiliate “Instagram” template */
function isInstagramTemplateDailyTask(description) {
  if (!description) return false;
  const s = String(description);
  return (
    /instagram\.com\//i.test(s) &&
    /Task link/i.test(s) &&
    (/Attendance verification:/i.test(s) || /Complete all of the following on this post/i.test(s))
  );
}

function extractInstagramPermalinkFromTaskDescription(html) {
  const s = String(html);
  const hrefMatch = s.match(/href="(https?:\/\/(?:www\.)?instagram\.com\/[^"]+)"/i);
  if (hrefMatch) return hrefMatch[1].trim();
  const plain = s.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[a-zA-Z0-9_-]+/i);
  return plain ? plain[0].trim() : null;
}

function permalinkPathKey(url) {
  if (!url) return '';
  const raw = String(url).split('?')[0].split('#')[0];
  const m = raw.match(/instagram\.com(\/.+?)\/?$/i);
  return m ? m[1].replace(/\/$/, '') : '';
}

async function collectInstagramCommentUsernames(mediaId, token, tryRefreshOnError = true) {
  let active = await rotateInstagramTokenIfDue(token);
  const names = new Set();
  let url = `https://graph.facebook.com/${IG_API_VERSION}/${mediaId}`;
  let axiosConfig = {
    params: {
      fields: 'comments.limit(100){username}',
      access_token: active
    }
  };
  try {
    for (let i = 0; i < 30; i++) {
      const response = axiosConfig ? await axios.get(url, axiosConfig) : await axios.get(url);
      const body = response.data;
      const chunk = body.comments?.data || [];
      chunk.forEach((c) => {
        if (c.username) names.add(normalizeIgUsername(c.username));
      });
      const next = body.comments?.paging?.next;
      if (!next) break;
      url = next;
      axiosConfig = null;
    }
    return names;
  } catch (error) {
    if (
      tryRefreshOnError &&
      isInstagramOAuthError(error) &&
      !isInstagramTokenHardExpired(error)
    ) {
      const newTok = await refreshInstagramLongLivedToken(active);
      if (newTok) {
        await saveInstagramAccessToken(newTok);
        return collectInstagramCommentUsernames(mediaId, newTok, false);
      }
    }
    console.error('collectInstagramCommentUsernames:', error.response?.data || error.message);
    throw error;
  }
}

async function verifyAmbassadorCommentOnMedia(mediaId, token, ambassadorUsername) {
  const want = normalizeAmbassadorInstagramHandle(ambassadorUsername);
  if (!want) return { found: false, scanned: 0 };
  const names = await collectInstagramCommentUsernames(mediaId, token);
  return { found: names.has(want), scanned: names.size };
}

async function findMediaIdByPermalink(igUserId, token, permalink, tryRefreshOnError = true) {
  const target = permalinkPathKey(permalink);
  if (!target || !igUserId) return null;
  let active = await rotateInstagramTokenIfDue(token);
  let url = `https://graph.facebook.com/${IG_API_VERSION}/${igUserId}/media`;
  let axiosConfig = {
    params: { fields: 'id,permalink', access_token: active }
  };
  try {
    for (let page = 0; page < 25; page++) {
      const response = axiosConfig ? await axios.get(url, axiosConfig) : await axios.get(url);
      const items = response.data?.data || [];
      for (const item of items) {
        if (item.permalink && permalinkPathKey(item.permalink) === target) {
          return item.id;
        }
      }
      const next = response.data?.paging?.next;
      if (!next) break;
      url = next;
      axiosConfig = null;
    }
    return null;
  } catch (error) {
    if (
      tryRefreshOnError &&
      isInstagramOAuthError(error) &&
      !isInstagramTokenHardExpired(error)
    ) {
      const newTok = await refreshInstagramLongLivedToken(active);
      if (newTok) {
        await saveInstagramAccessToken(newTok);
        return findMediaIdByPermalink(igUserId, newTok, permalink, false);
      }
    }
    console.error('findMediaIdByPermalink:', error.response?.data || error.message);
    throw error;
  }
}

const FEED_REPOST_MEDIA_TYPES = new Set(['REELS', 'VIDEO', 'IMAGE', 'CAROUSEL_ALBUM']);

function permalinkLooksLikeStory(p) {
  return String(p || '')
    .toLowerCase()
    .includes('/stories/');
}

function permalinkLooksLikeFeedOrReel(p) {
  const u = String(p || '').toLowerCase();
  if (u.includes('/stories/')) return false;
  return /instagram\.com\/(p|reel|reels|tv)\//.test(u);
}

/** Meta returns STORY or STORIES; some story tags arrive as IMAGE/VIDEO with a /stories/ permalink. */
function isStoryTaggedMedia(m) {
  const mt = String(m.media_type || '').toUpperCase();
  if (mt === 'STORY' || mt === 'STORIES') return true;
  return permalinkLooksLikeStory(m.permalink);
}

function isFeedOrReelTaggedMedia(m) {
  if (permalinkLooksLikeStory(m.permalink)) return false;
  const mt = String(m.media_type || '').toUpperCase();
  if (mt && FEED_REPOST_MEDIA_TYPES.has(mt)) return true;
  return permalinkLooksLikeFeedOrReel(m.permalink);
}

function evaluateStoryAndRepostTags(tagMatches) {
  const hasStoryTag = tagMatches.some((m) => isStoryTaggedMedia(m));
  const hasFeedRepostTag = tagMatches.some((m) => isFeedOrReelTaggedMedia(m));
  return { hasStoryTag, hasFeedRepostTag };
}

async function collectTaggedMediaFromAmbassadorOnBusiness(
  igBusinessUserId,
  token,
  ambassadorUsername,
  sinceMs,
  tryRefreshOnError = true
) {
  const want = normalizeAmbassadorInstagramHandle(ambassadorUsername);
  if (!want) return [];
  let active = await rotateInstagramTokenIfDue(token);
  const matches = [];
  const baseUrl = `https://graph.facebook.com/${IG_API_VERSION}/${igBusinessUserId}/tags`;
  const tagFields = 'id,username,media_type,timestamp,permalink';
  let url = baseUrl;
  let requestConfig = {
    params: {
      fields: tagFields,
      limit: 100,
      access_token: active
    }
  };
  try {
    for (let page = 0; page < 60; page++) {
      const response = requestConfig
        ? await axios.get(url, requestConfig)
        : await axios.get(url);
      const items = response.data?.data || [];
      for (const item of items) {
        if (normalizeIgUsername(item.username) !== want) continue;
        if (sinceMs != null && item.timestamp) {
          if (new Date(item.timestamp).getTime() < sinceMs) continue;
        }
        matches.push(item);
      }
      const next = response.data?.paging?.next;
      const after = response.data?.paging?.cursors?.after;
      if (next) {
        url = next;
        requestConfig = null;
      } else if (after) {
        url = baseUrl;
        requestConfig = {
          params: {
            fields: tagFields,
            limit: 100,
            after,
            access_token: active
          }
        };
      } else {
        break;
      }
    }
    return matches;
  } catch (error) {
    if (
      tryRefreshOnError &&
      isInstagramOAuthError(error) &&
      !isInstagramTokenHardExpired(error)
    ) {
      const newTok = await refreshInstagramLongLivedToken(active);
      if (newTok) {
        await saveInstagramAccessToken(newTok);
        return collectTaggedMediaFromAmbassadorOnBusiness(
          igBusinessUserId,
          newTok,
          ambassadorUsername,
          sinceMs,
          false
        );
      }
    }
    console.error(
      'collectTaggedMediaFromAmbassadorOnBusiness:',
      error.response?.data || error.message
    );
    throw error;
  }
}

async function getLatestInstagramDailyTaskPayload() {
  const [config] = await queryAsync(
    'SELECT instagramAccessToken, instagramUserId FROM config LIMIT 1'
  );
  if (!config?.instagramAccessToken || !config?.instagramUserId) {
    throw Object.assign(new Error('INSTAGRAM_NOT_CONFIGURED'), { code: 'INSTAGRAM_NOT_CONFIGURED' });
  }
  const mediaData = await fetchInstagramMedia(config.instagramUserId, config.instagramAccessToken);
  const items = mediaData?.data || [];
  if (!items.length) {
    throw Object.assign(new Error('NO_MEDIA'), { code: 'NO_MEDIA' });
  }
  const sorted = [...items].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const latest = sorted[0];
  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const title = `Today attendance task - ${dateStr}`;
  let brandUsername = '';
  try {
    const active = await rotateInstagramTokenIfDue(config.instagramAccessToken);
    const u = await axios.get(
      `https://graph.facebook.com/${IG_API_VERSION}/${config.instagramUserId}`,
      { params: { fields: 'username', access_token: active } }
    );
    brandUsername = u.data?.username || '';
  } catch (e) {
    console.warn('getLatestInstagramDailyTaskPayload: could not load IG username', e.message);
  }
  const descriptionHtml = buildInstagramDailyTaskDescription(latest, brandUsername);
  return {
    title,
    descriptionHtml,
    taskLink: latest.permalink || '',
    caption: latest.caption || '',
    mediaType: latest.media_type,
    timestamp: latest.timestamp,
    mediaId: latest.id
  };
}

module.exports = {
  IG_API_VERSION,
  fetchInstagramMedia,
  fetchInstagramComments,
  buildInstagramDailyTaskDescription,
  escapeHtmlForTask,
  instagramApiUserFacingMessage,
  isInstagramTokenHardExpired,
  isInstagramOAuthError,
  getLatestInstagramDailyTaskPayload,
  normalizeIgUsername,
  isInstagramTemplateDailyTask,
  extractInstagramPermalinkFromTaskDescription,
  permalinkPathKey,
  collectInstagramCommentUsernames,
  verifyAmbassadorCommentOnMedia,
  findMediaIdByPermalink,
  FEED_REPOST_MEDIA_TYPES,
  evaluateStoryAndRepostTags,
  collectTaggedMediaFromAmbassadorOnBusiness,
  normalizeAmbassadorInstagramHandle,
  isStoryTaggedMedia,
  isFeedOrReelTaggedMedia
};
