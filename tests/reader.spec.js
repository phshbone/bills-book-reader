const { test, expect } = require('@playwright/test');
const JSZip = require('jszip');

async function makeEpub() {
  const zip = new JSZip();
  const longParagraphs = Array.from({ length: 70 }, (_, i) =>
    `<p data-test-paragraph="${i + 1}">Pagination test paragraph ${i + 1}. A stable reader should keep this text locked to one viewport page while moving between columns.</p>`
  ).join('');
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
    </container>`);
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
    <package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:identifier id="uid">smoke-book</dc:identifier>
        <dc:title>Smoke Test Book</dc:title>
        <dc:creator>Bill Reader Test</dc:creator>
        <dc:language>en</dc:language>
        <meta property="dcterms:modified">2026-09-21T00:00:00Z</meta>
      </metadata>
      <manifest>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
        <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine><itemref idref="c1"/><itemref idref="c2"/></spine>
    </package>`);
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>TOC</title></head><body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">First Light</a></li><li><a href="chapter2.xhtml">Second Chapter</a></li></ol></nav></body></html>`);
  zip.file('OEBPS/chapter1.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>First Light</title><script data-test-book-script="true">parent.__bbrBookScriptRan = true;</script></head><body><h1>First Light</h1><p>This is the first smoke test paragraph. The quick reader remembers this book locally.</p><p>Searchable phrase: copper lantern.</p><p data-test-inline-handler="true" onclick="parent.__bbrInlineHandlerRan = true;">Safe visible text with an unsafe inline handler.</p><a data-test-js-link="true" href="javascript:parent.__bbrJsUrlRan=true">Unsafe JavaScript link</a><iframe data-test-embedded-frame="true" src="https://example.org/"></iframe>${longParagraphs}</body></html>`);
  zip.file('OEBPS/chapter2.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Second Chapter</title></head><body><h1>Second Chapter</h1><p>This is the second chapter used to verify page navigation.</p><p><a data-test-source-link="true" href="https://example.org/source-record">External source record</a></p></body></html>`);
  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
}


async function makeCoverEpub() {
  const zip = new JSZip();
  const coverPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZP1cAAAAASUVORK5CYII=',
    'base64'
  );
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
    </container>`);
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
    <package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:identifier id="uid">cover-smoke-book</dc:identifier>
        <dc:title>Cover Smoke Book</dc:title>
        <dc:creator>Bill Reader Test</dc:creator>
        <dc:language>en</dc:language>
        <meta property="dcterms:modified">2026-09-23T00:00:00Z</meta>
        <meta name="cover" content="cover-image"/>
      </metadata>
      <manifest>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>
        <item id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image"/>
        <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine><itemref idref="cover-page"/><itemref idref="c1"/></spine>
    </package>`);
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>TOC</title></head><body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">Chapter One</a></li></ol></nav></body></html>`);
  zip.file('OEBPS/cover.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Cover</title></head><body epub:type="frontmatter"><div epub:type="cover"><img data-test-cover="true" src="images/cover.png" alt="Cover image"/></div></body></html>`);
  zip.file('OEBPS/images/cover.png', coverPng);
  zip.file('OEBPS/chapter1.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter One</title></head><body><h1>Chapter One</h1><p>Cover resource regression fixture.</p></body></html>`);
  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
}

async function importFixture(page) {
  const buffer = await makeEpub();
  await page.getByTestId('epub-input').setInputFiles({ name: 'smoke-test.epub', mimeType: 'application/epub+zip', buffer });
  await expect(page.locator('#readerView')).toBeVisible();
  await expect(page.locator('#readerBookTitle')).toHaveText('Smoke Test Book');
  await expect(page.frameLocator('#viewer iframe').getByText('First Light')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('bills-book-reader');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
});

test('installed iPhone shell requests a black translucent status bar', async ({ page }) => {
  const capable = await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content');
  const statusStyle = await page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute('content');
  expect(capable).toBe('yes');
  expect(statusStyle).toBe('black-translucent');
});

test('imports an EPUB, renders it, and persists the library', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByTestId('library-grid').locator('[data-book-title="Smoke Test Book"]')).toBeVisible();
  await page.reload();
  const card = page.getByTestId('library-grid').locator('[data-book-title="Smoke Test Book"]');
  await expect(card).toBeVisible();
  await card.locator('.book-open').click();
  await expect(page.locator('#readerView')).toBeVisible();
  await expect(page.frameLocator('#viewer iframe').getByText('First Light')).toBeVisible();
});


test('waits for archived EPUB resources before rendering the cover page', async ({ page }) => {
  await page.evaluate(() => {
    const originalEpub = window.ePub;
    let calls = 0;
    window.__bbrOpenedResolved = false;
    window.ePub = (...args) => {
      const book = originalEpub(...args);
      calls += 1;
      if (calls === 2) {
        const opened = book.opened;
        book.opened = opened.then((value) => new Promise((resolve) => {
          setTimeout(() => {
            window.__bbrOpenedResolved = true;
            resolve(value);
          }, 600);
        }));
      }
      return book;
    };
  });

  const buffer = await makeCoverEpub();
  await page.getByTestId('epub-input').setInputFiles({
    name: 'cover-smoke.epub',
    mimeType: 'application/epub+zip',
    buffer
  });

  await expect(page.locator('#readerView')).toBeVisible();
  const duringOpen = await page.evaluate(() => ({
    opened: window.__bbrOpenedResolved,
    frames: document.querySelectorAll('#viewer iframe').length
  }));
  expect(duringOpen.opened).toBe(false);
  expect(duringOpen.frames).toBe(0);

  await expect.poll(() => page.evaluate(() => window.__bbrOpenedResolved)).toBe(true);
  const cover = page.locator('#viewer iframe').first().contentFrame().locator('img[data-test-cover="true"]');
  await expect(cover).toBeVisible();
  await expect.poll(() => cover.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
});

test('reader controls expose contents, themes, search, and bookmarks', async ({ page }) => {
  await importFixture(page);

  await page.getByRole('button', { name: 'Table of contents' }).click();
  await expect(page.getByRole('button', { name: 'Second Chapter' })).toBeVisible();
  const contentsClose = page.getByRole('button', { name: 'Close contents' });
  await expect(contentsClose).toHaveText('Done');
  const contentsCloseGeometry = await contentsClose.evaluate((button) => {
    const buttonRect = button.getBoundingClientRect();
    const panelRect = button.closest('#tocPanel').getBoundingClientRect();
    return { buttonBottom: buttonRect.bottom, panelBottom: panelRect.bottom };
  });
  expect(Math.abs(contentsCloseGeometry.panelBottom - contentsCloseGeometry.buttonBottom)).toBeLessThan(110);
  await contentsClose.click();

  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await page.getByRole('button', { name: /Night/ }).click();
  await expect(page.locator('body')).toHaveAttribute('data-app-theme', 'night');
  await expect.poll(() => page.frameLocator('#viewer iframe').locator('body').evaluate((body) => getComputedStyle(body).backgroundColor)).toBe('rgb(27, 30, 28)');
  await page.getByRole('button', { name: /Paper/ }).click();
  await expect(page.locator('body')).toHaveAttribute('data-app-theme', 'paper');
  await expect.poll(() => page.frameLocator('#viewer iframe').locator('body').evaluate((body) => getComputedStyle(body).backgroundColor)).toBe('rgb(251, 250, 246)');
  await page.getByRole('button', { name: 'Increase text size' }).click();
  await expect(page.locator('#fontSizeValue')).toHaveText('105%');
  await page.getByRole('button', { name: 'Decrease line spacing' }).click();
  await expect(page.locator('#lineHeightValue')).toHaveText('1.5');
  await page.getByRole('button', { name: 'Increase margins' }).click();
  await expect(page.locator('#readerMarginValue')).toHaveText('6');
  await page.locator('#readerBrightness').fill('70');
  await expect(page.locator('#readerBrightnessValue')).toHaveText('70%');
  await expect(page.locator('#readerView')).toHaveCSS('--reader-dim-opacity', '0.3');
  await expect(page.locator('#viewer')).toHaveCSS('filter', 'none');
  const appearanceClose = page.getByRole('button', { name: 'Close appearance' });
  await expect(appearanceClose).toHaveText('Done');
  const closeGeometry = await appearanceClose.evaluate((button) => {
    const buttonRect = button.getBoundingClientRect();
    const panelRect = button.closest('#appearancePanel').getBoundingClientRect();
    return { buttonBottom: buttonRect.bottom, panelBottom: panelRect.bottom };
  });
  expect(Math.abs(closeGeometry.panelBottom - closeGeometry.buttonBottom)).toBeLessThan(110);
  await appearanceClose.click();
  await expect(page.frameLocator('#viewer iframe').getByText('First Light')).toBeVisible();

  await page.getByRole('button', { name: 'Add bookmark' }).click();
  await expect(page.getByText('Bookmark added')).toBeVisible();
  await page.getByRole('button', { name: 'Show bookmarks and highlights' }).click();
  await expect(page.locator('#bookmarkList .mark-item')).toHaveCount(1);
  const marksClose = page.getByRole('button', { name: 'Close marks' });
  await expect(marksClose).toHaveText('Done');
  const marksCloseGeometry = await marksClose.evaluate((button) => {
    const buttonRect = button.getBoundingClientRect();
    const panelRect = button.closest('#bookmarkPanel').getBoundingClientRect();
    return { buttonBottom: buttonRect.bottom, panelBottom: panelRect.bottom };
  });
  expect(Math.abs(marksCloseGeometry.panelBottom - marksCloseGeometry.buttonBottom)).toBeLessThan(110);
  await marksClose.click();

  await page.getByRole('button', { name: 'Search in book' }).click();
  await page.locator('#bookSearchInput').fill('copper lantern');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('#searchStatus')).toContainText('result');
  await expect(page.locator('#searchResults')).toContainText('copper lantern');
  const searchClose = page.getByRole('button', { name: 'Close search' });
  await expect(searchClose).toHaveText('Done');
  const searchCloseGeometry = await searchClose.evaluate((button) => {
    const buttonRect = button.getBoundingClientRect();
    const panelRect = button.closest('#searchPanel').getBoundingClientRect();
    return { buttonBottom: buttonRect.bottom, panelBottom: panelRect.bottom };
  });
  expect(Math.abs(searchCloseGeometry.panelBottom - searchCloseGeometry.buttonBottom)).toBeLessThan(110);
  await searchClose.click();
});


test('escaped internal book URLs recover inside the reader', async ({ page }) => {
  await importFixture(page);
  const appUrl = page.url();
  await page.frameLocator('#viewer iframe').locator('body').evaluate(() => {
    window.location.href = '/OEBPS/chapter2.xhtml';
  });
  await expect(page.locator('#readerChapterTitle')).toHaveText('Second Chapter');
  expect(page.url()).toBe(appUrl);
});


test('switching between page and scroll modes keeps the exact reading area', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('#readerStage')).not.toHaveClass(/page-turn-active/);

  const visibleParagraph = await page.frameLocator('#viewer iframe').locator('[data-test-paragraph]').evaluateAll((nodes) => {
    const visible = nodes.find((node) => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
    });
    return visible?.getAttribute('data-test-paragraph') || null;
  });
  expect(visibleParagraph).not.toBeNull();

  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await page.locator('#flowSelect').selectOption('scrolled-doc');
  await expect(page.locator('#readerChapterTitle')).toHaveText('First Light');
  await expect(page.frameLocator('#viewer iframe').locator(`[data-test-paragraph="${visibleParagraph}"]`)).toBeVisible();
});

test('external source links are prepared to leave the EPUB frame', async ({ page, browserName }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'Table of contents' }).click();
  await page.getByRole('button', { name: 'Second Chapter' }).click();
  await expect(page.locator('#readerChapterTitle')).toHaveText('Second Chapter');

  const sourceLink = page.locator('#viewer iframe').last().contentFrame().locator('[data-test-source-link="true"]');
  await expect(sourceLink).toHaveAttribute('target', '_blank');
  await expect(sourceLink).toHaveAttribute('rel', /noopener/);

  // Headless WebKit does not reliably surface a new external window to the
  // parent-page stub. The target/rel assertions above still verify the
  // standards-based iPhone path. Chromium additionally covers our click hook.
  if (browserName === 'webkit') return;

  await page.evaluate(() => {
    window.__bbrOpenedSource = null;
    window.open = (url) => {
      window.__bbrOpenedSource = String(url);
      return {};
    };
  });

  await sourceLink.click();
  await expect.poll(() => page.evaluate(() => window.__bbrOpenedSource)).toBe('https://example.org/source-record');
});

test('reader status stays at top while the action toolbar carries the green visual anchor', async ({ page }) => {
  await importFixture(page);
  await expect(page.locator('#readerTopbar')).not.toHaveCSS('background-color', 'rgb(64, 88, 79)');
  await expect(page.locator('#readerFooter')).toHaveCSS('background-color', 'rgb(64, 88, 79)');

  const order = await page.locator('#readerFooter .reader-actions > button').evaluateAll((buttons) =>
    buttons.map((button) => button.id)
  );
  expect(order).toEqual(['searchButton', 'appearanceButton', 'tocButton', 'bookmarkButton', 'marksButton']);
});

test('reading preferences persist across reloads', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await page.getByRole('button', { name: /Paper/ }).click();
  await expect(page.locator('body')).toHaveAttribute('data-app-theme', 'paper');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-app-theme', 'paper');
});

test('PWA shell reloads while offline after its first online load', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit can fail internally on an offline service-worker reload; Chromium retains offline-shell coverage.');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(
    () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    { timeout: 15000, message: 'service worker should control the page before offline reload' }
  ).toBe(true);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByRole('heading', { name: 'Bill’s Book Reader' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('library shell fits the active viewport without horizontal overflow', async ({ page }) => {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport + 1);
  await expect(page.getByText('Bring your own books.')).toBeVisible();
});



test('sanitizes EPUB scripting before enabling the in-frame gesture bridge', async ({ page }) => {
  await page.evaluate(() => {
    window.__bbrBookScriptRan = false;
    window.__bbrInlineHandlerRan = false;
    window.__bbrJsUrlRan = false;
  });
  await importFixture(page);

  expect(await page.evaluate(() => window.__bbrBookScriptRan)).toBe(false);

  const frame = page.locator('#viewer iframe').first();
  await expect(frame).toHaveAttribute('sandbox', /allow-same-origin/);
  await expect(frame).toHaveAttribute('sandbox', /allow-scripts/);

  const state = await page.frameLocator('#viewer iframe').locator('html').evaluate((root) => {
    const doc = root.ownerDocument;
    const bridge = doc.querySelector('script[data-bbr-frame-gesture="true"]');
    const csp = doc.querySelector('meta[data-bbr-csp="true"]');
    const unsafeLink = doc.querySelector('[data-test-js-link="true"]');
    return {
      safeFrame: root.getAttribute('data-bbr-safe-frame'),
      gestureReady: root.getAttribute('data-bbr-gesture-ready'),
      bridgeCount: doc.querySelectorAll('script').length,
      bridgeNonce: bridge?.getAttribute('nonce') || '',
      csp: csp?.getAttribute('content') || '',
      inlineHandler: doc.querySelector('[data-test-inline-handler="true"]')?.getAttribute('onclick') || null,
      embeddedFrame: Boolean(doc.querySelector('[data-test-embedded-frame="true"]')),
      unsafeHref: unsafeLink?.getAttribute('href') || null,
      bodyTouchAction: getComputedStyle(doc.body).touchAction
    };
  });

  expect(state.safeFrame).toBe('true');
  expect(state.gestureReady).toBe('true');
  expect(state.bridgeCount).toBe(1);
  expect(state.bridgeNonce.length).toBeGreaterThan(10);
  expect(state.csp).toContain(`'nonce-${state.bridgeNonce}'`);
  expect(state.csp).toContain("script-src-attr 'none'");
  expect(state.inlineHandler).toBeNull();
  expect(state.embeddedFrame).toBe(false);
  expect(state.unsafeHref).toBeNull();
  expect(state.bodyTouchAction).toBe('auto');

  await page.frameLocator('#viewer iframe').locator('[data-test-inline-handler="true"]').click();
  expect(await page.evaluate(() => window.__bbrInlineHandlerRan)).toBe(false);
  expect(await page.evaluate(() => window.__bbrJsUrlRan)).toBe(false);
});

test('the in-frame bridge turns one page for an interior swipe while a tap does not', async ({ page }) => {
  await importFixture(page);
  await expect(page.locator('#locationText')).toHaveText(/\d+ \/ \d+/);

  const dispatchTouch = async (fromX, toX) => {
    await page.frameLocator('#viewer iframe').locator('body').evaluate((body, args) => {
      const fire = (type, touches, changedTouches = touches) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', { value: touches });
        Object.defineProperty(event, 'changedTouches', { value: changedTouches });
        body.dispatchEvent(event);
      };
      const start = { clientX: args.fromX, clientY: 220 };
      const end = { clientX: args.toX, clientY: 222 };
      fire('touchstart', [start], [start]);
      fire('touchend', [], [end]);
    }, { fromX, toX });
  };

  const before = await page.locator('#locationText').textContent();

  await dispatchTouch(230, 230);
  await page.waitForTimeout(180);
  await expect(page.locator('#locationText')).toHaveText(before);

  await dispatchTouch(245, 190);
  await expect.poll(async () => page.locator('#locationText').textContent()).not.toBe(before);
  await expect(page.locator('#readerStage')).not.toHaveClass(/page-turn-active/);
});

test('text selection remains available inside the sanitized EPUB frame', async ({ page }) => {
  await importFixture(page);
  const selected = await page.frameLocator('#viewer iframe').getByText('Searchable phrase: copper lantern.').evaluate((node) => {
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    const selection = node.ownerDocument.defaultView.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const value = selection.toString();
    selection.removeAllRanges();
    return value;
  });
  expect(selected).toContain('copper lantern');
});

test('reader status title and progress span the phone width symmetrically', async ({ page }) => {
  await importFixture(page);
  const geometry = await page.evaluate(() => {
    const topbar = document.querySelector('#readerTopbar').getBoundingClientRect();
    const status = document.querySelector('.reader-status-main').getBoundingClientRect();
    const title = document.querySelector('.reader-title-wrap').getBoundingClientRect();
    const progress = document.querySelector('.progress-line').getBoundingClientRect();
    return {
      topbarWidth: topbar.width,
      statusWidth: status.width,
      progressWidth: progress.width,
      titleCenter: title.left + title.width / 2,
      topbarCenter: topbar.left + topbar.width / 2,
      statusLeftGap: status.left - topbar.left,
      statusRightGap: topbar.right - status.right,
      progressLeftGap: progress.left - topbar.left,
      progressRightGap: topbar.right - progress.right
    };
  });

  expect(geometry.statusWidth).toBeGreaterThan(geometry.topbarWidth * 0.9);
  expect(geometry.progressWidth).toBeGreaterThan(geometry.topbarWidth * 0.9);
  expect(Math.abs(geometry.titleCenter - geometry.topbarCenter)).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.statusLeftGap - geometry.statusRightGap)).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.progressLeftGap - geometry.progressRightGap)).toBeLessThanOrEqual(2);
});

test('page turn controls are full-height edge tap zones in paginated mode', async ({ page }) => {
  await importFixture(page);
  const geometry = await page.evaluate(() => {
    const stage = document.querySelector('#readerStage').getBoundingClientRect();
    const prev = document.querySelector('#prevPage').getBoundingClientRect();
    const next = document.querySelector('#nextPage').getBoundingClientRect();
    return {
      stageHeight: stage.height,
      prevHeight: prev.height,
      nextHeight: next.height,
      prevWidth: prev.width,
      nextWidth: next.width,
      prevTopGap: Math.abs(prev.top - stage.top),
      nextTopGap: Math.abs(next.top - stage.top)
    };
  });
  expect(Math.abs(geometry.stageHeight - geometry.prevHeight)).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.stageHeight - geometry.nextHeight)).toBeLessThanOrEqual(2);
  expect(geometry.prevWidth).toBeGreaterThanOrEqual(40);
  expect(geometry.nextWidth).toBeGreaterThanOrEqual(40);
  expect(geometry.prevWidth).toBeLessThanOrEqual(56);
  expect(geometry.nextWidth).toBeLessThanOrEqual(56);
  expect(geometry.prevTopGap).toBeLessThanOrEqual(1);
  expect(geometry.nextTopGap).toBeLessThanOrEqual(1);

  const nextZone = page.getByRole('button', { name: 'Next page' });
  await nextZone.hover();
  await expect(nextZone).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await page.locator('#flowSelect').selectOption('scrolled-doc');
  await expect(page.locator('#readerStage')).toHaveAttribute('data-flow', 'scrolled-doc');
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Next page' })).toBeHidden();
});

test('paginated mode locks content to one viewport and serializes page turns', async ({ page }) => {
  await importFixture(page);
  await expect(page.locator('#locationText')).toHaveText(/\d+ \/ \d+/);

  const shellGeometry = await page.evaluate(() => {
    const viewer = document.querySelector('#viewer').getBoundingClientRect();
    const mountNode = document.querySelector('#viewer .epub-mount');
    const mount = mountNode.getBoundingClientRect();
    const containerNode = document.querySelector('#viewer .epub-container');
    const container = containerNode.getBoundingClientRect();
    return {
      viewerWidth: viewer.width,
      mountWidth: mount.width,
      mountLeftGap: mount.left - viewer.left,
      mountRightGap: viewer.right - mount.right,
      containerWidth: container.width,
      containerOverflowX: getComputedStyle(containerNode).overflowX
    };
  });
  expect(shellGeometry.mountWidth).toBeLessThan(shellGeometry.viewerWidth);
  expect(Math.abs(shellGeometry.mountLeftGap - shellGeometry.mountRightGap)).toBeLessThanOrEqual(2);
  expect(Math.abs(shellGeometry.mountWidth - shellGeometry.containerWidth)).toBeLessThanOrEqual(2);
  expect(shellGeometry.containerOverflowX).toBe('hidden');

  const contentGuards = await page.frameLocator('#viewer iframe').locator('body').evaluate((body) => {
    const doc = body.ownerDocument;
    const style = getComputedStyle(body);
    return {
      bodyTouchAction: style.touchAction,
      rootTouchAction: getComputedStyle(doc.documentElement).touchAction
    };
  });
  expect([contentGuards.bodyTouchAction, contentGuards.rootTouchAction]).toContain('auto');

  const expectedGutter = await page.evaluate(() => Math.round((window.visualViewport?.width || window.innerWidth) * 0.05));
  expect(Math.abs(shellGeometry.mountLeftGap - expectedGutter)).toBeLessThanOrEqual(2);
  expect(Math.abs(shellGeometry.mountRightGap - expectedGutter)).toBeLessThanOrEqual(2);

  const before = await page.locator('#locationText').textContent();
  const beforePage = Number(before.split('/')[0].trim());

  await page.locator('#nextPage').evaluate((button) => {
    button.click();
    button.click();
  });

  await expect.poll(async () => page.locator('#locationText').textContent()).not.toBe(before);
  await expect(page.locator('#readerStage')).not.toHaveClass(/page-turn-active/);

  const after = await page.locator('#locationText').textContent();
  const afterPage = Number(after.split('/')[0].trim());
  expect(afterPage).toBe(beforePage + 1);

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.locator('#readerStage')).not.toHaveClass(/page-turn-active/);
  }

  const pageGeometry = await page.evaluate(() => {
    const mount = document.querySelector('#viewer .epub-mount')?.getBoundingClientRect();
    const iframe = document.querySelector('#viewer iframe');
    const frameRect = iframe?.getBoundingClientRect();
    const doc = iframe?.contentDocument;
    if (!mount || !frameRect || !doc) return { count: 0, minLeft: null, maxLeft: null };

    const fragments = [];
    for (const node of doc.querySelectorAll('[data-test-paragraph]')) {
      for (const r of node.getClientRects()) {
        const left = frameRect.left + r.left;
        const right = frameRect.left + r.right;
        const top = frameRect.top + r.top;
        const bottom = frameRect.top + r.bottom;
        if (r.width > 0 && r.height > 0 && right > mount.left && left < mount.right && bottom > mount.top && top < mount.bottom) {
          fragments.push({ left, right, top, bottom });
        }
      }
    }
    const lefts = fragments.map((r) => r.left);
    return {
      count: fragments.length,
      minLeft: lefts.length ? Math.min(...lefts) : null,
      maxLeft: lefts.length ? Math.max(...lefts) : null
    };
  });
  expect(pageGeometry.count).toBeGreaterThan(0);
  expect(pageGeometry.maxLeft - pageGeometry.minLeft).toBeLessThanOrEqual(8);
});

test('book can be closed and reopened after page turns', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.getByRole('button', { name: 'Back to library' }).click();

  const card = page.getByTestId('library-grid').locator('[data-book-title="Smoke Test Book"]');
  await expect(card).toBeVisible();
  await card.locator('.book-open').click();

  await expect(page.locator('#readerView')).toBeVisible();
  await expect(page.locator('#busyOverlay')).toBeHidden();
  await expect(page.locator('#readerChapterTitle')).not.toHaveText('Opening…');
  await expect(page.locator('#toast')).toBeHidden();
  await expect(page.locator('#locationText')).toHaveText(/\d+ \/ \d+/);
  const visibleTextCount = await page.frameLocator('#viewer iframe').locator('[data-test-paragraph]').evaluateAll((nodes) =>
    nodes.filter((node) => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
    }).length
  );
  expect(visibleTextCount).toBeGreaterThan(0);
});
