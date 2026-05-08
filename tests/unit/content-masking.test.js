import assert from "node:assert";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const CONTENT_SCRIPT_PATH = "src/content/index.js";
const MASKING_TARGET_CLASS = "mf-tp-mask-target";

const createChromeStub = () => ({
  runtime: {
    getManifest: () => ({ version_name: "test" }),
    id: "test-extension",
    lastError: null,
    onMessage: { addListener() {} },
    sendMessage(_message, callback) {
      callback?.({ ok: true, results: [] });
    },
  },
  storage: {
    sync: {
      get(_keys, callback) {
        callback?.({});
      },
      set(_payload, callback) {
        callback?.();
      },
    },
    local: {
      get(_keys, callback) {
        callback?.({});
      },
      set(_payload, callback) {
        callback?.();
      },
    },
    onChanged: { addListener() {} },
  },
});

const waitForContentScript = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 50);
  });

const runContentScript = async (html) => {
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://moneyforward.com/",
  });
  dom.window.chrome = createChromeStub();
  dom.window.requestAnimationFrame = (callback) =>
    dom.window.setTimeout(() => callback(Date.now()), 0);
  dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);

  try {
    dom.window.eval(fs.readFileSync(CONTENT_SCRIPT_PATH, "utf8"));
    await waitForContentScript();
    return dom;
  } catch (error) {
    dom.window.close();
    throw error;
  }
};

export const runContentMaskingTests = async () => {
  const dom = await runContentScript(`
    <!doctype html>
    <html>
      <body>
        <div id="cf-latest">
          <section id="recent-transactions">
            <div id="recent-transactions-table">
              <div class="recent-transactions-row" data-row-index="0">
                <div class="recent-transactions-row-left">
                  <div class="recent-transactions-date">2026/04/24</div>
                  <div class="recent-transactions-category">収入＞給与</div>
                  <div class="recent-transactions-content">給与</div>
                </div>
                <div class="recent-transactions-amount">617,978円</div>
              </div>
              <div class="recent-transactions-row" data-row-index="1">
                <div class="recent-transactions-row-left">
                  <div class="recent-transactions-date">2026/04/20</div>
                  <div class="recent-transactions-category">日用品＞医療費</div>
                  <div class="recent-transactions-content">VISA国内利用</div>
                </div>
                <div class="recent-transactions-amount">-226円</div>
              </div>
            </div>
          </section>
        </div>
      </body>
    </html>
  `);

  try {
    const amounts = dom.window.document.querySelectorAll(
      "#cf-latest .recent-transactions-amount"
    );
    assert.strictEqual(amounts.length, 2);
    for (const amount of amounts) {
      assert.ok(amount.classList.contains(MASKING_TARGET_CLASS));
    }
  } finally {
    dom.window.close();
  }
};
