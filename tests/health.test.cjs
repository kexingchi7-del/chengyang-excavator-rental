const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const now = new Date('2026-10-17T00:00:00Z');
const base = 'https://kexingchi7-del.github.io/chengyang-excavator-rental/';
const price = { ...JSON.parse(fs.readFileSync('data/diesel.json')), checkedAt: now.toISOString() };
const load = () => import('../scripts/check-public-site.mjs');
function mock(overrides = {}) {
  return async (url, options) => {
    assert.equal(url.origin, new URL(base).origin);
    assert.ok(url.searchParams.has('_health'));
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    const file = url.pathname.split('/').pop();
    const body = file === 'diesel.json' ? JSON.stringify(price)
      : file.endsWith('.js') ? '"use strict"; console.log("ready");'
        : '<html><title>青岛佳和盛达工程劳务有限公司｜挖掘机租赁</title></html>';
    return new Response(overrides[file]?.body ?? body, { headers: { 'content-type': file === 'diesel.json'
      ? 'application/json' : file.endsWith('.js') ? 'text/javascript' : 'text/html' }, ...overrides[file] });
  };
}
test('checks canonical pages, all required scripts and fresh official data', async () => {
  const { checkPublicSite } = await load();
  await checkPublicSite({ fetchImpl: mock(), now });
});
test('rejects HTTP errors and bogus 200 HTML/script responses', async () => {
  const { checkPublicSite } = await load();
  for (const overrides of [{ '': { status: 404 } }, { '': { status: 200, headers: { 'content-type': 'text/plain' } } },
    { 'business.js': { headers: { 'content-type': 'text/html' } } },
    { 'form.js': { body: '<!doctype html><html>Error</html>' } },
    { 'enquiry.js': { body: 'Not Found' } }, { 'policy.js': { body: '' } },
    { 'fuel-budget.js': { status: 503 } }, { 'thanks.html': { status: 404 } },
    { 'diesel.json': { body: 'invalid json' } }]) {
    await assert.rejects(checkPublicSite({ fetchImpl: mock(overrides), now }));
  }
  await assert.rejects(checkPublicSite({ now, fetchImpl: async () => new Response('<html><title>Not found</title></html>',
    { headers: { 'content-type': 'text/html' } }) }));
});
test('diesel schema, official host, failure and freshness are enforced', async () => {
  const { validateDiesel } = await load();
  for (const patch of [{ price: '8.21' }, { price: 100 }, { province: '其他' }, { unit: '元/吨' },
    { grade: '汽油' }, { sourceTitle: '' }, { sourceUrl: 'https://fgw.weihai.gov.cn.evil.test/' },
    { sourceUrl: 'https://user@fgw.weihai.gov.cn/' }, { sourceUrl: 'http://fgw.weihai.gov.cn/' },
    { checkedAt: 'invalid' }, { checkedAt: new Date(now - 49 * 3600000).toISOString() },
    { checkedAt: new Date(+now + 1).toISOString() }, { lastCheckStatus: 'failure' },
    { effectiveDate: '2026-02-30' }, { publishedDate: '2099-01-01' }, { error: 'failed' }]) {
    assert.throws(() => validateDiesel({ ...price, ...patch }, now));
  }
  validateDiesel({ ...price, checkedAt: new Date(now - 48 * 3600000).toISOString() }, now);
});
test('network and body failures propagate; CLI retries then fails', async () => {
  const { checkPublicSite, main } = await load();
  await assert.rejects(checkPublicSite({ now, fetchImpl: async () => { throw new Error('timeout'); } }), /timeout/);
  let attempts = 0, delays = 0;
  const logs = [];
  assert.equal(await main({ check: async () => { attempts++; throw new Error('bad'); },
    sleep: async ms => { assert.equal(ms, 4000); delays++; }, log: message => logs.push(message) }), 1);
  assert.equal(attempts, 3); assert.equal(delays, 2); assert.equal(logs.length, 3);
  assert.equal(await main({ check: async () => {}, log: () => {} }), 0);
});
test('workflow templates match and preserve safe deployment ordering', () => {
  const workflow = fs.readFileSync('.github/workflows/refresh-site.yml', 'utf8');
  assert.equal(workflow, fs.readFileSync('automation/refresh-site.yml', 'utf8'));
  assert.match(workflow, /git fetch origin main/);
  assert.match(workflow, /git merge --ff-only origin\/main/);
  assert.match(workflow, /git pull --rebase origin main/);
  assert.match(workflow, /thanks\.html.*enquiry\.js/);
  assert.ok(workflow.indexOf('node scripts/check-public-site.mjs') > workflow.indexOf('uses: actions/deploy-pages'));
  assert.match(workflow, /Surface stale price check[\s\S]*exit 1/);
  assert.doesNotMatch(workflow, /--force/);
});
