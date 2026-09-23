(() => {
  'use strict';

  const DB_NAME = 'bills-book-reader';
  const DB_VERSION = 1;
  const BOOK_STORE = 'books';
  const SETTINGS_KEY = 'bbr-settings-v1';
  const SWIPE_MIN_X = 18;
  const SWIPE_MAX_MS = 1000;
  const SWIPE_AXIS_RATIO = 0.8;
  const FRAME_GESTURE_TYPE = 'bbr-epub-swipe';
  const FRAME_GESTURE_TOKEN = (() => {
    const bytes = new Uint8Array(16);
    if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  })();
  const DEFAULT_SETTINGS = {
    theme: 'eink',
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: 100,
    lineHeight: 1.6,
    margin: 5,
    brightness: 100,
    flow: 'paginated'
  };

  const THEME_RULES = {
    eink: {
      body: { color: '#20211e !important', background: '#eeece4 !important' },
      'a': { color: '#40584f !important' },
      '::selection': { background: 'rgba(100, 125, 114, .25)' }
    },
    paper: {
      body: { color: '#1e211e !important', background: '#fbfaf6 !important' },
      'a': { color: '#405c51 !important' },
      '::selection': { background: 'rgba(95, 124, 113, .22)' }
    },
    sepia: {
      body: { color: '#3d3327 !important', background: '#efe1c5 !important' },
      'a': { color: '#6a5b3f !important' },
      '::selection': { background: 'rgba(122, 107, 79, .25)' }
    },
    night: {
      body: { color: '#e7e4db !important', background: '#1b1e1c !important' },
      'a': { color: '#b5c9be !important' },
      '::selection': { background: 'rgba(154, 178, 166, .35)' }
    }
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    libraryHeader: $('libraryHeader'), libraryView: $('libraryView'), libraryGrid: $('libraryGrid'), emptyLibrary: $('emptyLibrary'),
    epubInput: $('epubInput'), librarySearch: $('librarySearch'), librarySort: $('librarySort'), installButton: $('installButton'),
    readerView: $('readerView'), viewer: $('viewer'), backToLibrary: $('backToLibrary'), readerBookTitle: $('readerBookTitle'), readerChapterTitle: $('readerChapterTitle'),
    prevPage: $('prevPage'), nextPage: $('nextPage'), bookmarkButton: $('bookmarkButton'), tocButton: $('tocButton'), searchButton: $('searchButton'), appearanceButton: $('appearanceButton'),
    marksButton: $('marksButton'), tocPanel: $('tocPanel'), tocList: $('tocList'), searchPanel: $('searchPanel'), appearancePanel: $('appearancePanel'), bookmarkPanel: $('bookmarkPanel'),
    bookSearchForm: $('bookSearchForm'), bookSearchInput: $('bookSearchInput'), searchStatus: $('searchStatus'), searchResults: $('searchResults'),
    bookmarkList: $('bookmarkList'), highlightList: $('highlightList'), progressText: $('progressText'), progressSlider: $('progressSlider'), locationText: $('locationText'),
    fontFamily: $('fontFamily'), fontSize: $('fontSize'), fontSizeValue: $('fontSizeValue'), fontSizeDown: $('fontSizeDown'), fontSizeUp: $('fontSizeUp'),
    lineHeight: $('lineHeight'), lineHeightValue: $('lineHeightValue'), lineHeightDown: $('lineHeightDown'), lineHeightUp: $('lineHeightUp'),
    readerMargin: $('readerMargin'), readerMarginValue: $('readerMarginValue'), readerMarginDown: $('readerMarginDown'), readerMarginUp: $('readerMarginUp'),
    readerBrightness: $('readerBrightness'), readerBrightnessValue: $('readerBrightnessValue'),
    flowSelect: $('flowSelect'), themeGrid: $('themeGrid'),
    selectionToolbar: $('selectionToolbar'), highlightSelection: $('highlightSelection'), clearSelection: $('clearSelection'),
    toast: $('toast'), busyOverlay: $('busyOverlay'), busyText: $('busyText'), readerStage: $('readerStage')
  };

  let dbPromise;
  let settings = loadSettings();
  let library = [];
  let currentRecord = null;
  let currentBook = null;
  let rendition = null;
  let pendingSelection = null;
  let saveTimer = null;
  let toastTimer = null;
  let installPrompt = null;
  let pointerStart = null;
  let locationsReady = false;
  let pageTurnBusy = false;
  let readerResizeTimer = null;
  let readerResizeObserver = null;
  let lastReaderSize = { width: 0, height: 0 };

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BOOK_STORE)) {
          const store = db.createObjectStore(BOOK_STORE, { keyPath: 'id' });
          store.createIndex('lastOpened', 'lastOpened');
          store.createIndex('title', 'title');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function idbGetAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(BOOK_STORE, 'readonly').objectStore(BOOK_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(BOOK_STORE, 'readonly').objectStore(BOOK_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BOOK_STORE, 'readwrite');
      tx.objectStore(BOOK_STORE).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbDelete(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BOOK_STORE, 'readwrite');
      tx.objectStore(BOOK_STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function loadSettings() {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
    catch { return { ...DEFAULT_SETTINGS }; }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function showBusy(message) {
    els.busyText.textContent = message;
    els.busyOverlay.hidden = false;
  }

  function hideBusy() { els.busyOverlay.hidden = true; }

  function toast(message, ms = 2200) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, ms);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  async function shaId(arrayBuffer) {
    if (crypto?.subtle) {
      const hash = await crypto.subtle.digest('SHA-256', arrayBuffer);
      return Array.from(new Uint8Array(hash)).slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return `book-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function coverToDataUrl(book) {
    try {
      const url = await book.coverUrl();
      if (!url) return null;
      const blob = await (await fetch(url)).blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  async function importFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file.name.toLowerCase().endsWith('.epub') || file.type === 'application/epub+zip');
    if (!files.length) return;
    showBusy(files.length === 1 ? 'Adding book…' : `Adding ${files.length} books…`);
    const imported = [];
    try {
      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const id = await shaId(arrayBuffer);
        const existing = await idbGet(id);
        if (existing) { imported.push(existing); continue; }

        let probe;
        try {
          probe = ePub(arrayBuffer.slice(0));
          await probe.ready;
          const meta = await probe.loaded.metadata;
          const coverData = await coverToDataUrl(probe);
          const now = Date.now();
          const record = {
            id,
            title: (meta?.title || file.name.replace(/\.epub$/i, '')).trim(),
            author: (meta?.creator || 'Unknown author').trim(),
            fileName: file.name,
            epubData: arrayBuffer.slice(0),
            coverData,
            addedAt: now,
            lastOpened: 0,
            progress: 0,
            cfi: null,
            bookmarks: [],
            highlights: []
          };
          await idbPut(record);
          imported.push(record);
        } catch (error) {
          console.error('EPUB import failed', file.name, error);
          toast(`Could not open ${file.name}`, 3800);
        } finally {
          try { probe?.destroy(); } catch {}
        }
      }
      await loadLibrary();
      if (imported.length === 1) await openBook(imported[0].id);
      else if (imported.length > 1) toast(`${imported.length} books added`);
    } finally {
      els.epubInput.value = '';
      hideBusy();
    }
  }

  async function loadLibrary() {
    library = await idbGetAll();
    renderLibrary();
  }

  function renderLibrary() {
    const query = els.librarySearch.value.trim().toLowerCase();
    const sorted = [...library].filter((book) => !query || `${book.title} ${book.author}`.toLowerCase().includes(query));
    sorted.sort((a, b) => {
      if (els.librarySort.value === 'title') return a.title.localeCompare(b.title);
      if (els.librarySort.value === 'author') return a.author.localeCompare(b.author);
      return (b.lastOpened || b.addedAt || 0) - (a.lastOpened || a.addedAt || 0);
    });

    els.emptyLibrary.hidden = library.length > 0;
    els.libraryGrid.hidden = library.length === 0;
    els.libraryGrid.innerHTML = '';

    for (const book of sorted) {
      const article = document.createElement('article');
      article.className = 'book-card';
      article.dataset.bookId = book.id;
      article.dataset.bookTitle = book.title;
      const percent = Math.max(0, Math.min(100, Math.round((book.progress || 0) * 100)));
      article.innerHTML = `
        <button class="book-open" type="button" aria-label="Open ${escapeHtml(book.title)}">
          <div class="cover-wrap">
            ${book.coverData ? `<img src="${book.coverData}" alt="">` : `<div class="cover-fallback">${escapeHtml(book.title)}</div>`}
            <div class="book-progress" aria-hidden="true"><span style="width:${percent}%"></span></div>
          </div>
          <div class="book-meta"><strong>${escapeHtml(book.title)}</strong><span>${escapeHtml(book.author)}</span></div>
        </button>
        <div class="book-card-menu"><span>${percent ? `${percent}% read` : 'Not started'}</span><button class="remove-book" type="button" aria-label="Remove ${escapeHtml(book.title)}">Remove</button></div>`;
      article.querySelector('.book-open').addEventListener('click', () => openBook(book.id));
      article.querySelector('.remove-book').addEventListener('click', async (event) => {
        event.stopPropagation();
        if (!confirm(`Remove “${book.title}” from this browser?`)) return;
        await idbDelete(book.id);
        await loadLibrary();
        toast('Book removed');
      });
      els.libraryGrid.append(article);
    }
  }

  function showReader() {
    els.libraryHeader.hidden = true;
    els.libraryView.hidden = true;
    els.readerView.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function showLibrary() {
    closePanels();
    els.readerView.hidden = true;
    els.libraryHeader.hidden = false;
    els.libraryView.hidden = false;
    document.body.style.overflow = '';
    loadLibrary();
  }

  function currentLocation() {
    if (!rendition) return null;
    try { return rendition.currentLocation(); } catch { return null; }
  }

  async function openBook(id) {
    const record = await idbGet(id);
    if (!record) return;
    showBusy('Opening book…');
    try {
      await destroyReader();
      currentRecord = record;
      currentRecord.bookmarks ||= [];
      currentRecord.highlights ||= [];
      currentRecord.lastOpened = Date.now();
      await idbPut(currentRecord);
      showReader();
      els.readerBookTitle.textContent = currentRecord.title;
      els.readerChapterTitle.textContent = 'Opening…';
      locationsReady = false;

      let data = currentRecord.epubData;
      if (!(data instanceof ArrayBuffer)) {
        if (currentRecord.fileBlob?.arrayBuffer) {
          data = await currentRecord.fileBlob.arrayBuffer();
          currentRecord.epubData = data.slice(0);
          delete currentRecord.fileBlob;
          await idbPut(currentRecord);
        } else {
          throw new Error('Stored EPUB data is unavailable');
        }
      }
      currentBook = ePub(data.slice(0));
      await currentBook.ready;
      // EPUB.js resolves metadata/spine in ready before archived resource
      // replacements are guaranteed complete. Wait for opened so cover and
      // inline image URLs are rewritten before the first spine item renders.
      await currentBook.opened;
      await setupRendition();
      await restoreReadingPosition(currentRecord);
      renderToc(await currentBook.loaded.navigation);
      renderMarks();
      generateLocations();
      hideBusy();
    } catch (error) {
      console.error('Open book failed', error);
      hideBusy();
      toast('This EPUB could not be opened.', 4200);
      showLibrary();
    }
  }

  function readerViewportSize() {
    const mount = els.viewer.querySelector('.epub-mount');
    const rect = (mount || els.readerStage).getBoundingClientRect();
    return {
      width: Math.max(1, Math.floor(rect.width)),
      height: Math.max(1, Math.floor(rect.height))
    };
  }

  function readerGutterPx() {
    const viewportWidth = window.visualViewport?.width || window.innerWidth || 0;
    return Math.max(0, Math.round(viewportWidth * (Number(settings.margin) || 0) / 100));
  }

  function configureReaderMount() {
    let mount = els.viewer.querySelector('.epub-mount');
    if (!mount) {
      mount = document.createElement('div');
      mount.className = 'epub-mount';
      els.viewer.replaceChildren(mount);
    }
    const gutter = readerGutterPx();
    mount.style.width = `calc(100% - ${gutter * 2}px)`;
    mount.style.height = '100%';
    mount.style.margin = '0 auto';
    mount.style.minWidth = '0';
    mount.style.overflow = 'hidden';
    return mount;
  }

  const THEME_PALETTE = {
    eink: { text: '#20211e', background: '#eeece4', link: '#40584f' },
    paper: { text: '#1e211e', background: '#fbfaf6', link: '#405c51' },
    sepia: { text: '#3d3327', background: '#efe1c5', link: '#6a5b3f' },
    night: { text: '#e7e4db', background: '#1b1e1c', link: '#b5c9be' }
  };

  function applyThemeToContents(contents) {
    const doc = contents?.document;
    if (!doc?.documentElement || !doc.body) return;
    const palette = THEME_PALETTE[settings.theme] || THEME_PALETTE.eink;
    for (const node of [doc.documentElement, doc.body]) {
      node.style.setProperty('background-color', palette.background, 'important');
      node.style.setProperty('color', palette.text, 'important');
    }
    for (const anchor of doc.querySelectorAll('a')) {
      anchor.style.setProperty('color', palette.link, 'important');
    }
  }

  function installContentLinkHandling(contents) {
    const doc = contents?.document;
    if (!doc?.documentElement) return;

    for (const anchor of doc.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href')?.trim() || '';
      if (!/^https?:\/\//i.test(href)) continue;

      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
      if (anchor.dataset.bbrExternalLinkInstalled === 'true') continue;
      anchor.dataset.bbrExternalLinkInstalled = 'true';

      // Bind directly to the link instead of relying on iframe-level event
      // delegation; WebKit is more reliable with the direct user gesture.
      anchor.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.open(href, '_blank', 'noopener,noreferrer');
      });
    }
  }

  function recoverEscapedBookNavigation(view) {
    const iframe = view?.iframe;
    if (!iframe || iframe.dataset.bbrRecoveryInstalled === 'true') return;
    iframe.dataset.bbrRecoveryInstalled = 'true';
    iframe.addEventListener('load', () => {
      try {
        const href = iframe.contentWindow?.location?.href || '';
        if (!/^https?:/i.test(href)) return;
        const url = new URL(href);
        const path = decodeURIComponent(url.pathname);
        const match = currentBook?.spine?.spineItems?.find((section) => {
          const sectionHref = decodeURIComponent(section?.href || '');
          return sectionHref && (path.endsWith('/' + sectionHref) || path.endsWith(sectionHref));
        });
        if (!match) return;
        const target = match.href + (url.hash || '');
        setTimeout(() => rendition?.display(target).catch((error) => console.warn('Recovered EPUB link failed', target, error)), 0);
      } catch {}
    });
  }

  function allowNonceInPolicy(policy, nonce) {
    const directives = String(policy || '').split(';').map((part) => part.trim()).filter(Boolean);
    const patchDirective = (name) => {
      const index = directives.findIndex((part) => part.toLowerCase().startsWith(name + ' ') || part.toLowerCase() === name);
      if (index >= 0) {
        const tokens = directives[index].split(/\s+/).filter((token, tokenIndex) => tokenIndex === 0 || token.toLowerCase() !== "'none'");
        if (!tokens.includes(`'nonce-${nonce}'`)) tokens.push(`'nonce-${nonce}'`);
        directives[index] = tokens.join(' ');
      } else {
        directives.push(`${name} 'nonce-${nonce}'`);
      }
    };
    patchDirective('script-src');
    const hasScriptElem = directives.some((part) => {
      const lower = part.toLowerCase();
      return lower === 'script-src-elem' || lower.startsWith('script-src-elem ');
    });
    if (hasScriptElem) patchDirective('script-src-elem');
    return directives.join('; ');
  }

  function secureSerializedBookFrame(output, section) {
    try {
      // EPUB.js serializer hooks receive the original serialized section rather
      // than a guaranteed chain of prior hook mutations. Re-apply the library's
      // resource substitutions here before sanitizing so archived EPUB assets
      // (cover art, inline images, CSS resources) remain blob/data URLs instead
      // of falling back to page-relative HTTP requests.
      if (currentBook?.resources?.substitute) {
        output = currentBook.resources.substitute(output, section?.url);
      }

      let doc = new DOMParser().parseFromString(output, 'application/xhtml+xml');
      if (doc.querySelector('parsererror')) doc = new DOMParser().parseFromString(output, 'text/html');

      for (const node of Array.from(doc.querySelectorAll('script,iframe,frame,frameset,object,embed,applet'))) node.remove();
      for (const meta of Array.from(doc.querySelectorAll('meta[http-equiv]'))) {
        const equiv = (meta.getAttribute('http-equiv') || '').trim().toLowerCase();
        if (equiv === 'refresh') meta.remove();
        if (equiv === 'content-security-policy') {
          meta.setAttribute('content', allowNonceInPolicy(meta.getAttribute('content'), FRAME_GESTURE_TOKEN));
        }
      }

      for (const node of Array.from(doc.querySelectorAll('*'))) {
        for (const attr of Array.from(node.attributes || [])) {
          const name = attr.name.toLowerCase();
          const value = String(attr.value || '').trim();
          if (name.startsWith('on') || name === 'srcdoc') {
            node.removeAttribute(attr.name);
            continue;
          }
          if (['href', 'xlink:href', 'action', 'formaction'].includes(name) &&
              /^(?:javascript|vbscript|data\s*:\s*(?:text\/html|application\/xhtml\+xml))/i.test(value)) {
            node.removeAttribute(attr.name);
            continue;
          }
          if (name === 'style' && /(?:expression\s*\(|url\s*\(\s*['"]?\s*javascript\s*:)/i.test(value)) {
            node.removeAttribute(attr.name);
          }
        }
      }

      const ns = doc.documentElement?.namespaceURI || 'http://www.w3.org/1999/xhtml';
      let head = doc.querySelector('head');
      if (!head) {
        head = doc.createElementNS(ns, 'head');
        doc.documentElement?.insertBefore(head, doc.documentElement.firstChild);
      }

      const csp = doc.createElementNS(ns, 'meta');
      csp.setAttribute('http-equiv', 'Content-Security-Policy');
      csp.setAttribute('content',
        `script-src 'nonce-${FRAME_GESTURE_TOKEN}'; script-src-attr 'none'; object-src 'none'; frame-src 'none'; form-action 'none'`);
      csp.setAttribute('data-bbr-csp', 'true');
      head.insertBefore(csp, head.firstChild);

      const bridgeSource = `(() => {
        const TYPE = ${JSON.stringify(FRAME_GESTURE_TYPE)};
        const TOKEN = ${JSON.stringify(FRAME_GESTURE_TOKEN)};
        const MIN_X = ${SWIPE_MIN_X};
        const MAX_MS = ${SWIPE_MAX_MS};
        const AXIS_RATIO = ${SWIPE_AXIS_RATIO};
        let start = null;
        document.documentElement.setAttribute('data-bbr-gesture-ready', 'true');

        const point = (touch) => touch ? { x: touch.clientX, y: touch.clientY, t: Date.now() } : null;
        document.addEventListener('touchstart', (event) => {
          if (event.touches.length !== 1) { start = null; return; }
          start = point(event.touches[0]);
        }, { passive: true, capture: true });

        document.addEventListener('touchend', (event) => {
          const origin = start;
          start = null;
          const touch = event.changedTouches && event.changedTouches[0];
          if (!origin || !touch) return;
          if ((window.getSelection && window.getSelection().toString().trim())) return;
          const dx = touch.clientX - origin.x;
          const dy = touch.clientY - origin.y;
          const dt = Date.now() - origin.t;
          if (dt >= MAX_MS || Math.abs(dx) < MIN_X || Math.abs(dx) <= Math.abs(dy) * AXIS_RATIO) return;
          parent.postMessage({ type: TYPE, token: TOKEN, direction: dx < 0 ? 'next' : 'prev' }, '*');
        }, { passive: true, capture: true });

        document.addEventListener('touchcancel', () => { start = null; }, { passive: true, capture: true });
      })();`;

      doc.documentElement?.setAttribute('data-bbr-safe-frame', 'true');
      const serialized = new XMLSerializer().serializeToString(doc);
      const trustedScript = `<script type="text/javascript" nonce="${FRAME_GESTURE_TOKEN}" data-bbr-frame-gesture="true">${bridgeSource}</script>`;
      section.output = /<\/head\s*>/i.test(serialized)
        ? serialized.replace(/<\/head\s*>/i, trustedScript + '</head>')
        : trustedScript + serialized;
    } catch (error) {
      console.error('Safe EPUB frame preparation failed', error);
      section.output = `<!doctype html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/></head><body><p>This section could not be rendered safely.</p></body></html>`;
    }
  }

  function installSafeFrameGestureSerializer(book) {
    if (!book?.spine?.hooks?.serialize || book.__bbrSafeFrameGestureInstalled) return;
    book.__bbrSafeFrameGestureInstalled = true;
    book.spine.hooks.serialize.register(secureSerializedBookFrame);
  }

  function installIframeTouchBridge(view) {
    const iframe = view?.iframe;
    if (!iframe) return;

    if (settings.flow === 'paginated') iframe.style.setProperty('touch-action', 'auto');
    else iframe.style.removeProperty('touch-action');

    if (iframe.dataset.bbrTouchBridgeInstalled === 'true') return;
    iframe.dataset.bbrTouchBridgeInstalled = 'true';

    // WebKit has historically required touch listeners on an iframe or one of
    // its top-level parents before reliably routing touch events inside it.
    // These are intentionally passive: actual swipe recognition stays inside
    // the book body so links, selection and highlighting remain usable.
    const primeTouchRouting = () => {};
    iframe.addEventListener('touchstart', primeTouchRouting, { passive: true });
    iframe.addEventListener('touchend', primeTouchRouting, { passive: true });
  }

  function installContentPagingGuards(contents) {
    const doc = contents?.document;
    if (!doc?.documentElement || !doc.body) return;

    const root = doc.documentElement;
    const body = doc.body;
    if (root.dataset.bbrPagingGuardsInstalled === 'true') return;
    root.dataset.bbrPagingGuardsInstalled = 'true';

    [root, body].forEach((node) => {
      node.style.removeProperty('overflow-x');
      node.style.setProperty('overscroll-behavior-x', 'none', 'important');
    });

    if (settings.flow === 'paginated') {
      root.style.setProperty('touch-action', 'auto', 'important');
      body.style.setProperty('touch-action', 'auto', 'important');
    } else {
      root.style.removeProperty('touch-action');
      body.style.removeProperty('touch-action');
    }
  }

  async function syncReaderViewport(force = false) {
    if (!rendition) return;
    const size = readerViewportSize();
    if (!force && Math.abs(size.width - lastReaderSize.width) < 2 && Math.abs(size.height - lastReaderSize.height) < 2) return;

    const target = currentLocation()?.start?.cfi || currentRecord?.cfi;
    lastReaderSize = size;
    try {
      rendition.resize(size.width, size.height);
      if (typeof rendition.spread === 'function') rendition.spread('none');
      if (settings.flow === 'paginated' && target) await rendition.display(target);
    } catch (error) {
      console.warn('Reader viewport sync skipped', error);
    }
  }

  function scheduleReaderViewportSync(force = false) {
    clearTimeout(readerResizeTimer);
    readerResizeTimer = setTimeout(() => syncReaderViewport(force), force ? 80 : 160);
  }

  async function setupRendition() {
    els.viewer.innerHTML = '';
    const mount = configureReaderMount();
    const viewport = readerViewportSize();
    lastReaderSize = viewport;
    installSafeFrameGestureSerializer(currentBook);
    rendition = currentBook.renderTo(mount, {
      width: viewport.width,
      height: viewport.height,
      manager: 'default',
      spread: 'none',
      flow: settings.flow,
      allowScriptedContent: true,
      allowPopups: true
    });

    if (typeof rendition.spread === 'function') rendition.spread('none');
    rendition.hooks?.content?.register?.(installContentPagingGuards);

    Object.entries(THEME_RULES).forEach(([name, rules]) => rendition.themes.register(name, rules));
    applyReaderSettings(false);

    rendition.on('relocated', onRelocated);
    rendition.on('rendered', (section, view) => {
      installIframeTouchBridge(view);
      installContentPagingGuards(view?.contents);
      installContentLinkHandling(view?.contents);
      applyThemeToContents(view?.contents);
      recoverEscapedBookNavigation(view);
      const navItem = findNavForHref(section?.href);
      if (navItem) els.readerChapterTitle.textContent = navItem.label.trim();
    });
    rendition.on('selected', async (cfiRange, contents) => {
      try {
        const range = await currentBook.getRange(cfiRange);
        const text = range?.toString()?.trim() || '';
        if (!text) return;
        pendingSelection = { cfi: cfiRange, text: text.slice(0, 600) };
        els.selectionToolbar.hidden = false;
        contents?.window?.getSelection()?.removeAllRanges();
      } catch {}
    });

    for (const mark of currentRecord.highlights || []) attachHighlight(mark);
    els.viewer.focus({ preventScroll: true });
  }

  async function nextPaint() {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  function hasVisibleRenditionContent() {
    try {
      for (const contents of rendition?.getContents?.() || []) {
        const doc = contents?.document;
        const win = doc?.defaultView;
        if (!doc?.body || !win) continue;
        const width = win.innerWidth;
        const height = win.innerHeight;
        const nodes = doc.body.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,pre,img,svg,figure,table,div,span');
        for (const node of nodes) {
          const rect = node.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.left >= width || rect.bottom <= 0 || rect.top >= height) continue;
          const tag = node.tagName?.toLowerCase();
          if (tag === 'img' || tag === 'svg' || tag === 'figure' || (node.textContent || '').trim()) return true;
        }
      }
    } catch {}
    return false;
  }

  async function restoreReadingPosition(record) {
    const href = record?.sectionHref || null;
    const page = Math.max(1, Number(record?.sectionPage) || 1);

    if (href) {
      try {
        await rendition.display(href);
        for (let i = 1; i < page; i++) await rendition.next();
        await nextPaint();
        if (hasVisibleRenditionContent()) return;
      } catch (error) {
        console.warn('Section/page restore failed; trying alternate saved position.', error);
      }
    }

    if (record?.cfi) {
      try {
        await rendition.display(record.cfi);
        await nextPaint();
        if (hasVisibleRenditionContent()) return;
      } catch (error) {
        console.warn('CFI restore failed; reopening from the start.', error);
      }
    }

    record.cfi = null;
    record.sectionHref = null;
    record.sectionPage = 1;
    record.progress = 0;
    await idbPut(record);
    await rendition.display();
    await nextPaint();
  }

  async function destroyReader() {
    clearTimeout(saveTimer);
    clearTimeout(readerResizeTimer);
    pageTurnBusy = false;
    els.readerStage.classList.remove('page-turn-active', 'page-turn-next', 'page-turn-prev', 'page-turn-out', 'page-turn-in');
    pendingSelection = null;
    els.selectionToolbar.hidden = true;
    try { rendition?.destroy(); } catch {}
    try { currentBook?.destroy(); } catch {}
    rendition = null;
    currentBook = null;
    currentRecord = null;
    locationsReady = false;
    els.viewer.innerHTML = '';
  }

  function findNavForHref(href) {
    const nav = currentBook?.navigation;
    if (!nav || !href) return null;
    return nav.get(href) || nav.toc?.find((item) => href.split('#')[0].endsWith((item.href || '').split('#')[0])) || null;
  }

  async function onRelocated(location) {
    if (!currentRecord || !location?.start?.cfi) return;
    currentRecord.cfi = location.start.cfi;
    currentRecord.sectionHref = location.start.href || currentRecord.sectionHref || null;
    currentRecord.sectionPage = Number(location.start.displayed?.page) || 1;
    let percentage = Number.isFinite(location.start.percentage) ? location.start.percentage : null;
    if ((percentage == null || Number.isNaN(percentage)) && locationsReady) {
      try { percentage = currentBook.locations.percentageFromCfi(location.start.cfi); } catch {}
    }
    if (!Number.isFinite(percentage)) percentage = currentRecord.progress || 0;
    currentRecord.progress = Math.max(0, Math.min(1, percentage));
    updateProgressUi(location);
    const navItem = findNavForHref(location.start.href);
    els.readerChapterTitle.textContent = navItem?.label?.trim() || els.readerChapterTitle.textContent || 'Reading';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => idbPut(currentRecord).catch(console.error), 220);
  }

  function updateProgressUi(location = currentLocation()) {
    const progress = Math.max(0, Math.min(1, currentRecord?.progress || 0));
    els.progressText.textContent = `${Math.round(progress * 100)}%`;
    els.progressSlider.value = String(Math.round(progress * 1000));
    const page = location?.start?.displayed?.page;
    const total = location?.start?.displayed?.total;
    els.locationText.textContent = page && total ? `${page} / ${total}` : '—';
  }

  async function generateLocations() {
    if (!currentBook) return;
    try {
      await currentBook.locations.generate(1200);
      locationsReady = true;
      const loc = currentLocation();
      if (loc?.start?.cfi) {
        const p = currentBook.locations.percentageFromCfi(loc.start.cfi);
        if (Number.isFinite(p)) currentRecord.progress = p;
        updateProgressUi(loc);
      }
    } catch (error) {
      console.warn('Location generation skipped', error);
    }
  }

  async function goToProgress(value) {
    if (!currentBook || !rendition || !locationsReady) return;
    try {
      const cfi = currentBook.locations.cfiFromPercentage(Number(value) / 1000);
      if (cfi) await rendition.display(cfi);
    } catch {}
  }

  function applyReaderSettings(persist = true) {
    document.body.dataset.appTheme = settings.theme;
    els.fontFamily.value = settings.fontFamily;
    els.fontSize.value = settings.fontSize;
    els.fontSizeValue.textContent = `${settings.fontSize}%`;
    els.lineHeight.value = settings.lineHeight;
    els.lineHeightValue.textContent = Number(settings.lineHeight).toFixed(2).replace(/0$/, '');
    els.readerMargin.value = settings.margin;
    els.readerMarginValue.textContent = settings.margin;
    const brightness = Math.max(40, Math.min(100, Number(settings.brightness) || 100));
    settings.brightness = brightness;
    els.readerBrightness.value = String(brightness);
    els.readerBrightnessValue.textContent = `${brightness}%`;
    els.viewer.style.filter = `brightness(${brightness}%)`;
    els.flowSelect.value = settings.flow;
    els.readerStage.dataset.flow = settings.flow;
    document.querySelectorAll('.theme-chip').forEach((button) => button.classList.toggle('active', button.dataset.theme === settings.theme));
    if (rendition) {
      rendition.themes.select(settings.theme);
      rendition.themes.font(settings.fontFamily);
      rendition.themes.fontSize(`${settings.fontSize}%`);
      rendition.themes.override('line-height', String(settings.lineHeight), true);
      rendition.themes.override('padding-left', '0px', true);
      rendition.themes.override('padding-right', '0px', true);
      rendition.themes.override('max-width', '100%', true);
      configureReaderMount();
      for (const contents of rendition.getContents?.() || []) applyThemeToContents(contents);
    }
    if (persist) saveSettings();
  }

  async function recreateRendition() {
    if (!currentBook || !currentRecord) return;
    const loc = currentLocation();
    const exactCfi = loc?.start?.cfi || currentRecord.cfi || null;
    const snapshot = {
      ...currentRecord,
      cfi: exactCfi,
      sectionHref: loc?.start?.href || currentRecord.sectionHref,
      sectionPage: Number(loc?.start?.displayed?.page) || currentRecord.sectionPage || 1
    };
    try { rendition?.destroy(); } catch {}
    rendition = null;
    await setupRendition();

    // A CFI identifies the actual reading position independent of page geometry.
    // Use it first when changing layout modes; chapter/page counts are not stable
    // between paginated and scrolled rendering.
    if (exactCfi) {
      try {
        await rendition.display(exactCfi);
        await nextPaint();
        if (hasVisibleRenditionContent()) return;
      } catch (error) {
        console.warn('Exact position restore failed after layout change.', error);
      }
    }
    await restoreReadingPosition(snapshot);
  }

  function flattenToc(items, level = 0, out = []) {
    for (const item of items || []) {
      out.push({ item, level });
      flattenToc(item.subitems || item.children || [], level + 1, out);
    }
    return out;
  }

  function renderToc(navigation) {
    els.tocList.innerHTML = '';
    for (const { item, level } of flattenToc(navigation?.toc || [])) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `toc-item toc-level-${Math.min(level, 2)}`;
      button.textContent = item.label?.trim() || 'Untitled section';
      button.addEventListener('click', async () => {
        closePanels();
        await rendition.display(item.href);
      });
      els.tocList.append(button);
    }
    if (!els.tocList.children.length) els.tocList.innerHTML = '<p class="panel-status">No table of contents found.</p>';
  }

  function openPanel(panel) {
    [els.tocPanel, els.searchPanel, els.appearancePanel, els.bookmarkPanel].forEach((p) => { p.hidden = p !== panel; });
    if (panel === els.searchPanel) setTimeout(() => els.bookSearchInput.focus(), 0);
  }

  function closePanels() {
    [els.tocPanel, els.searchPanel, els.appearancePanel, els.bookmarkPanel].forEach((p) => { p.hidden = true; });
    if (rendition && !els.readerView.hidden) scheduleReaderViewportSync(true);
  }

  async function searchBook(query) {
    const q = query.trim();
    if (!q || !currentBook) return;
    els.searchResults.innerHTML = '';
    els.searchStatus.textContent = 'Searching…';
    const results = [];
    const sections = currentBook.spine?.spineItems || [];
    for (let i = 0; i < sections.length && results.length < 120; i++) {
      const section = sections[i];
      try {
        await section.load(currentBook.load.bind(currentBook));
        const matches = section.find(q) || [];
        for (const match of matches.slice(0, 20)) {
          results.push({ ...match, href: section.href });
          if (results.length >= 120) break;
        }
      } catch (error) {
        console.warn('Search section skipped', section?.href, error);
      } finally {
        try { section.unload(); } catch {}
      }
    }
    els.searchStatus.textContent = results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'No matches';
    for (const result of results) {
      const div = document.createElement('div');
      div.className = 'result-item';
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = `<strong>${escapeHtml(findNavForHref(result.href)?.label || 'Match')}</strong><p>${escapeHtml(result.excerpt || '')}</p>`;
      button.addEventListener('click', async () => { closePanels(); await rendition.display(result.cfi); });
      div.append(button);
      els.searchResults.append(div);
    }
  }

  async function addBookmark() {
    const loc = currentLocation();
    if (!currentRecord || !loc?.start?.cfi) return;
    const cfi = loc.start.cfi;
    if (currentRecord.bookmarks.some((mark) => mark.cfi === cfi)) { toast('Already bookmarked'); return; }
    currentRecord.bookmarks.unshift({
      id: `bm-${Date.now()}`,
      cfi,
      label: els.readerChapterTitle.textContent || 'Bookmark',
      percent: Math.round((currentRecord.progress || 0) * 100),
      createdAt: Date.now()
    });
    await idbPut(currentRecord);
    renderMarks();
    toast('Bookmark added');
  }

  function attachHighlight(mark) {
    if (!rendition || !mark?.cfi) return;
    try {
      rendition.annotations.highlight(mark.cfi, { id: mark.id }, null, 'bbr-highlight', {
        fill: settings.theme === 'night' ? '#d8bc6a' : '#d0b84d',
        'fill-opacity': '0.34',
        'mix-blend-mode': settings.theme === 'night' ? 'screen' : 'multiply'
      });
    } catch (error) { console.warn('Highlight attach failed', error); }
  }

  async function savePendingHighlight() {
    if (!pendingSelection || !currentRecord) return;
    const mark = { id: `hl-${Date.now()}`, cfi: pendingSelection.cfi, text: pendingSelection.text, createdAt: Date.now() };
    currentRecord.highlights.unshift(mark);
    attachHighlight(mark);
    await idbPut(currentRecord);
    pendingSelection = null;
    els.selectionToolbar.hidden = true;
    renderMarks();
    toast('Highlight saved');
  }

  function renderMarks() {
    els.bookmarkList.innerHTML = '';
    els.highlightList.innerHTML = '';
    renderMarkGroup(currentRecord?.bookmarks || [], els.bookmarkList, 'bookmark');
    renderMarkGroup(currentRecord?.highlights || [], els.highlightList, 'highlight');
  }

  function renderMarkGroup(items, host, type) {
    if (!items.length) { host.innerHTML = '<p class="panel-status">None yet.</p>'; return; }
    for (const mark of items) {
      const item = document.createElement('div');
      item.className = 'mark-item';
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'jump-mark';
      jump.innerHTML = type === 'highlight'
        ? `<strong>${escapeHtml((mark.text || '').slice(0, 90))}${(mark.text || '').length > 90 ? '…' : ''}</strong><p>Highlight</p>`
        : `<strong>${escapeHtml(mark.label || 'Bookmark')}</strong><p>${mark.percent ?? 0}% through book</p>`;
      jump.addEventListener('click', async () => { closePanels(); await rendition.display(mark.cfi); });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-mark';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${type}`);
      remove.addEventListener('click', async () => {
        const key = type === 'highlight' ? 'highlights' : 'bookmarks';
        currentRecord[key] = currentRecord[key].filter((m) => m.id !== mark.id);
        if (type === 'highlight') { try { rendition.annotations.remove(mark.cfi, 'highlight'); } catch {} }
        await idbPut(currentRecord);
        renderMarks();
      });
      item.append(jump, remove);
      host.append(item);
    }
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function turnPage(direction) {
    if (!rendition || pageTurnBusy) return;
    pageTurnBusy = true;
    const canAnimate = settings.flow === 'paginated' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stage = els.readerStage;
    const directionClass = direction === 'next' ? 'page-turn-next' : 'page-turn-prev';

    try {
      if (canAnimate) {
        stage.classList.add('page-turn-active', directionClass, 'page-turn-out');
        await wait(105);
      }

      if (direction === 'next') await rendition.next();
      else await rendition.prev();

      if (canAnimate) {
        stage.classList.remove('page-turn-out');
        stage.classList.add('page-turn-in');
        await wait(175);
      }
    } finally {
      stage.classList.remove('page-turn-active', 'page-turn-next', 'page-turn-prev', 'page-turn-out', 'page-turn-in');
      pageTurnBusy = false;
    }
  }

  async function pageNext() {
    return turnPage('next');
  }

  async function pagePrev() {
    return turnPage('prev');
  }

  function registerEvents() {
    els.epubInput.addEventListener('change', () => importFiles(els.epubInput.files));
    els.librarySearch.addEventListener('input', renderLibrary);
    els.librarySort.addEventListener('change', renderLibrary);
    els.backToLibrary.addEventListener('click', showLibrary);
    els.prevPage.addEventListener('click', pagePrev);
    els.nextPage.addEventListener('click', pageNext);
    els.tocButton.addEventListener('click', () => openPanel(els.tocPanel));
    els.searchButton.addEventListener('click', () => openPanel(els.searchPanel));
    els.appearanceButton.addEventListener('click', () => openPanel(els.appearancePanel));
    els.marksButton.addEventListener('click', () => openPanel(els.bookmarkPanel));
    els.bookmarkButton.addEventListener('click', addBookmark);
    document.querySelectorAll('[data-close-panel]').forEach((button) => button.addEventListener('click', closePanels));

    els.bookSearchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      searchBook(els.bookSearchInput.value);
    });
    els.progressSlider.addEventListener('change', () => goToProgress(els.progressSlider.value));

    els.themeGrid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-theme]');
      if (!button) return;
      settings.theme = button.dataset.theme;
      applyReaderSettings();
      (currentRecord?.highlights || []).forEach((mark) => {
        try { rendition.annotations.remove(mark.cfi, 'highlight'); } catch {}
        attachHighlight(mark);
      });
    });
    els.fontFamily.addEventListener('change', () => { settings.fontFamily = els.fontFamily.value; applyReaderSettings(); scheduleReaderViewportSync(true); });

    const adjustSetting = async (key, delta, min, max, precision = 0) => {
      const factor = 10 ** precision;
      settings[key] = Math.min(max, Math.max(min, Math.round((Number(settings[key]) + delta) * factor) / factor));
      applyReaderSettings();
      if (key === 'margin') {
        const target = currentLocation()?.start?.cfi || currentRecord?.cfi;
        const mount = configureReaderMount();
        const rect = mount.getBoundingClientRect();
        lastReaderSize = { width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) };
        rendition?.resize(lastReaderSize.width, lastReaderSize.height);
        if (rendition && settings.flow === 'paginated' && target) await rendition.display(target);
      } else {
        scheduleReaderViewportSync(true);
      }
    };
    els.fontSizeDown.addEventListener('click', () => adjustSetting('fontSize', -5, 80, 160));
    els.fontSizeUp.addEventListener('click', () => adjustSetting('fontSize', 5, 80, 160));
    els.lineHeightDown.addEventListener('click', () => adjustSetting('lineHeight', -0.1, 1.3, 2, 1));
    els.lineHeightUp.addEventListener('click', () => adjustSetting('lineHeight', 0.1, 1.3, 2, 1));
    els.readerMarginDown.addEventListener('click', () => adjustSetting('margin', -1, 0, 12));
    els.readerMarginUp.addEventListener('click', () => adjustSetting('margin', 1, 0, 12));
    els.readerBrightness.addEventListener('input', () => {
      settings.brightness = Number(els.readerBrightness.value);
      applyReaderSettings();
    });
    els.flowSelect.addEventListener('change', async () => {
      settings.flow = els.flowSelect.value;
      saveSettings();
      await recreateRendition();
    });

    els.highlightSelection.addEventListener('click', savePendingHighlight);
    els.clearSelection.addEventListener('click', () => { pendingSelection = null; els.selectionToolbar.hidden = true; });

    document.addEventListener('keydown', (event) => {
      if (els.readerView.hidden || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); pageNext(); }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); pagePrev(); }
      if (event.key === 'Escape') closePanels();
    });

    // Keep top-level touch listeners registered around the iframe. On iOS
    // WebKit this helps touch delivery reach listeners inside the EPUB frame.
    const primeReaderTouchRouting = () => {};
    els.readerStage.addEventListener('touchstart', primeReaderTouchRouting, { passive: true, capture: true });
    els.readerStage.addEventListener('touchend', primeReaderTouchRouting, { passive: true, capture: true });
    els.readerStage.dataset.bbrTouchParentReady = 'true';

    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.type !== FRAME_GESTURE_TYPE || data.token !== FRAME_GESTURE_TOKEN || settings.flow !== 'paginated') return;
      const fromActiveBookFrame = Array.from(els.viewer.querySelectorAll('iframe')).some((frame) => frame.contentWindow === event.source);
      if (!fromActiveBookFrame) return;
      if (data.direction === 'next') pageNext();
      else if (data.direction === 'prev') pagePrev();
    });

    els.readerStage.addEventListener('pointerdown', (event) => { pointerStart = { x: event.clientX, y: event.clientY, t: Date.now() }; });
    els.readerStage.addEventListener('pointerup', (event) => {
      if (!pointerStart || settings.flow !== 'paginated') return;
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      const dt = Date.now() - pointerStart.t;
      pointerStart = null;
      if (dt < SWIPE_MAX_MS && Math.abs(dx) >= SWIPE_MIN_X && Math.abs(dx) > Math.abs(dy) * SWIPE_AXIS_RATIO) dx < 0 ? pageNext() : pagePrev();
    });

    const handleViewportChange = () => scheduleReaderViewportSync();
    window.addEventListener('resize', handleViewportChange, { passive: true });
    window.addEventListener('orientationchange', () => scheduleReaderViewportSync(true), { passive: true });
    window.visualViewport?.addEventListener('resize', handleViewportChange, { passive: true });
    if ('ResizeObserver' in window) {
      readerResizeObserver = new ResizeObserver(handleViewportChange);
      readerResizeObserver.observe(els.readerStage);
    }

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPrompt = event;
      els.installButton.hidden = false;
    });
    els.installButton.addEventListener('click', async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      els.installButton.hidden = true;
    });
    window.addEventListener('appinstalled', () => { installPrompt = null; els.installButton.hidden = true; });
  }

  async function init() {
    if (!window.ePub || !window.JSZip) {
      els.emptyLibrary.innerHTML = '<h3>Reader engine unavailable.</h3><p>Reload the page. If the problem persists, the local EPUB libraries did not load.</p>';
      return;
    }
    applyReaderSettings(false);
    registerEvents();
    await loadLibrary();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker unavailable', error));
    document.documentElement.dataset.ready = 'true';
  }

  init().catch((error) => {
    console.error(error);
    hideBusy();
    toast('Reader initialization failed.', 4500);
  });
})();
