const { test, expect } = require('@playwright/test');
const JSZip = require('jszip');

async function makeEpub() {
  const zip = new JSZip();
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
  zip.file('OEBPS/chapter1.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>First Light</title></head><body><h1>First Light</h1><p>This is the first smoke test paragraph. The quick reader remembers this book locally.</p><p>Searchable phrase: copper lantern.</p></body></html>`);
  zip.file('OEBPS/chapter2.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Second Chapter</title></head><body><h1>Second Chapter</h1><p>This is the second chapter used to verify page navigation.</p></body></html>`);
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
  await expect(page.getByTestId('library-grid').locator('[data-book-title="Smoke Test Book"]')).toBeVisible();
});

test('reader controls expose contents, themes, search, and bookmarks', async ({ page }) => {
  await importFixture(page);

  await page.getByRole('button', { name: 'Table of contents' }).click();
  await expect(page.getByRole('button', { name: 'Second Chapter' })).toBeVisible();
  await page.getByRole('button', { name: 'Close contents' }).click();

  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await page.getByRole('button', { name: /Paper/ }).click();
  await expect(page.locator('body')).toHaveAttribute('data-app-theme', 'paper');
  await page.getByRole('button', { name: 'Close appearance' }).click();

  await page.getByRole('button', { name: 'Add bookmark' }).click();
  await expect(page.getByText('Bookmark added')).toBeVisible();
  await page.getByRole('button', { name: 'Show bookmarks and highlights' }).click();
  await expect(page.locator('#bookmarkList .mark-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close marks' }).click();

  await page.getByRole('button', { name: 'Search in book' }).click();
  await page.locator('#bookSearchInput').fill('copper lantern');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.locator('#searchStatus')).toContainText('result');
  await expect(page.locator('#searchResults')).toContainText('copper lantern');
});
