'use strict';

const BLOG_LISTING_HERO =
  'https://res.cloudinary.com/npuap6la/image/upload/v1787657312/Untitled_4.webp';

/** LCP candidate for blog listing (fixed hero). Width 720 matches template. */
function blogListingLcpPreloadUrl(cloudinaryUrlFn) {
  const raw = BLOG_LISTING_HERO;
  if (typeof cloudinaryUrlFn === 'function') {
    return cloudinaryUrlFn(raw, { width: 720 });
  }
  return raw;
}

function blogDetailLcpPreloadUrl(post, cloudinaryUrlFn) {
  const raw = String((post && post.thumbnail_url) || '').trim() || BLOG_LISTING_HERO;
  if (typeof cloudinaryUrlFn === 'function') {
    return cloudinaryUrlFn(raw, { width: 720 });
  }
  return raw;
}

module.exports = {
  BLOG_LISTING_HERO,
  blogListingLcpPreloadUrl,
  blogDetailLcpPreloadUrl,
};
