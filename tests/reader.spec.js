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
  zip.file('OEBPS/chapter1.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>First Light</title></head><body><h1>First Light</h1><p>This is the first smoke test paragraph. The quick reader remembers this book locally.</p><p>Searchable phrase: copper lantern.</p>${longParagraphs}</body></html>`);
  zip.file('OEBPS/chapter2.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Second Chapter</title></head><body><h1>Second Chapter</h1><p>This is the second chapter used to verify page navigation.</p><p><a data-test-source-link="true" href="https://example.org/source-record">External source record</a></p></body></html>`);
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

test('reader controls expose contents, themes, search, and bookmarks', async ({ page }) => {
  await importFixture(page);

  await page.getByRole('button', { name: 'Table of contents' }).click();
  await expect(page.getByRole('button', { name: 'Second Chapter' })).toBeVisible();
  await page.getByRole('button', { name: 'Close contents' }).click();

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
  await expect(page.locator('#viewer')).toHaveCSS('filter', 'brightness(0.7)');
  await page.getByRole('button', { name: 'Close appearance' }).click();
  await expect(page.frameLocator('#viewer iframe').getByText('First Light')).toBeVisible();

  await page.getByRole('button', { name: 'Add bookmark' }).click();
  await expect(page.getByText('Bookmark added')).toBeVisible();
  await page.getByRole('button', { name: 'Show bookmarks and highlights' }).click();
  await expect(page.locator('#bookmarkList .mark-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close marks' }).click();

  await page.getByRole('button', { name: 'Search in book' }).click();
  await page.locator('#bookSearchInput').fill('copper lantern');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('#searchStatus')).toContainText('result');
  await expect(page.locator('#searchResults')).toContainText('copper lantern');
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

test('external source links open outside the EPUB frame', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'Table of contents' }).click();
  await page.getByRole('button', { name: 'Second Chapter' }).click();
  await expect(page.locator('#readerChapterTitle')).toHaveText('Second Chapter');

  await page.evaluate(() => {
    window.__bbrOpenedSource = null;
    window.open = (url) => {
      window.__bbrOpenedSource = String(url);
      return {};
    };
  });

  await page.frameLocator('#viewer iframe').locator('[data-test-source-link="true"]').click();
  await expect.poll(() => page.evaluate(() => window.__bbrOpenedSource)).toBe('https://example.org/source-record');
});

test('reader header uses the dark green visual anchor', async ({ page }) => {
  await importFixture(page);
  await expect(page.locator('#readerTopbar')).toHaveCSS('background-color', 'rgb(64, 88, 79)');
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



test('horizontal swipe gestures turn paginated pages in both directions', async ({ page, browserName }) => {
  await importFixture(page);
  await expect(page.locator('#locationText')).toHaveText(/\d+ \/ \d+/);

  const dispatchSwipe = async (fromX, toX) => {
    await page.frameLocator('#viewer iframe').locator('body').evaluate((body, args) => {
      const doc = body.ownerDocument;
      if (args.useTouch) {
        const start = new Event('touchstart', { bubbles: true, cancelable: true });
        Object.defineProperty(start, 'touches', { value: [{ clientX: args.fromX, clientY: 220 }] });
        Object.defineProperty(start, 'changedTouches', { value: [{ clientX: args.fromX, clientY: 220 }] });
        doc.dispatchEvent(start);

        const end = new Event('touchend', { bubbles: true, cancelable: true });
        Object.defineProperty(end, 'touches', { value: [] });
        Object.defineProperty(end, 'changedTouches', { value: [{ clientX: args.toX, clientY: 222 }] });
        doc.dispatchEvent(end);
      } else {
        doc.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: args.fromX, clientY: 220
        }));
        doc.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: args.toX, clientY: 222
        }));
      }
    }, { fromX, toX, useTouch: browserName === 'webkit' });
  };

  const before = await page.locator('#locationText').textContent();
  await dispatchSwipe(280, 150);
  await expect.poll(async () => page.locator('#locationText').textContent()).not.toBe(before);
  await expect(page.locator('#readerStage')).not.toHaveClass(/page-turn-active/);

  const afterNext = await page.locator('#locationText').textContent();
  await dispatchSwipe(150, 285);
  await expect.poll(async () => page.locator('#locationText').textContent()).not.toBe(afterNext);
  await expect(page.locator('#readerStage')).not.toHaveClass(/page-turn-active/);
  await expect(page.locator('#locationText')).toHaveText(before);
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
  expect([contentGuards.bodyTouchAction, contentGuards.rootTouchAction]).toContain('pan-y');

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
