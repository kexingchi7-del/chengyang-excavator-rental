const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../scripts/update-diesel.mjs');
const url = 'https://fgw.weihai.gov.cn/art/2026/9/24/art_53887_6642605.html';
const now = new Date('2026-10-17T00:00:00Z');
const sample = `<meta name="ArticleTitle" content="2026年9月24日24时起，我省成品油价格按机制上调">
<meta name="PubDate" content="2026-09-24 16:13">
<p>自2026年9月24日24时起，国VI车用0号柴油调整为每升8.21元，上调0.33元。</p>
<table><tr><td>最高零售价格</td><td>元/升</td></tr>
<tr><td>国VI车用柴&nbsp;油</td><td>0号</td><td>8.21</td><td>9330</td></tr></table>`;
test('official sample and midnight rollover; parser adds no check timestamp', async () => {
  const { parseDieselNotice } = await load();
  const value = parseDieselNotice(sample, url, now);
  assert.equal(value.price, 8.21);
  assert.equal(value.effectiveDate, '2026-09-25');
  assert.equal(value.publishedDate, '2026-09-24');
  assert.equal(value.checkedAt, undefined);
});
test('table-only and text-only notices', async () => {
  const { parseDieselNotice: parse } = await load();
  assert.equal(parse(sample.replace(/国VI车用0号柴油调整为每升8.21元，上调0.33元。/, ''), url, now).price, 8.21);
  assert.equal(parse(sample.replace(/<table>[\s\S]*<\/table>/, ''), url, now).price, 8.21);
});
test('reject invalid, conflicting, future and wrong units', async () => {
  const { parseDieselNotice: parse } = await load();
  for (const html of [sample.replaceAll('8.21', '9330'), sample.replace('每升8.21', '每升8.22'), sample.replaceAll('0号', '10号'), sample.replaceAll('元/升', '元/吨').replace('每升8.21元', '每吨8.21元'), sample.replaceAll('9月24日', '2月30日')]) {
    assert.throws(() => parse(html, url, now));
  }
  assert.throws(() => parse(sample, url, new Date('2026-09-24T15:59:00Z')));
  assert.throws(() => parse(sample, 'https://example.com/a', now));
});
test('failure preserves accepted fields; older notice cannot regress', async () => {
  const { checkDiesel } = await load();
  const old = { price: 8.5, effectiveDate: '2026-10-01', sourceUrl: url, checkedAt: 'old', publishedDate: '2026-09-30' };
  const fail = await checkDiesel(old, { now, fetchPage: async () => { throw new Error('offline'); } });
  assert.equal(fail.price, old.price);
  assert.equal(fail.effectiveDate, old.effectiveDate);
  assert.equal(fail.publishedDate, old.publishedDate);
  assert.equal(fail.lastCheckStatus, 'failure');
  assert.match(fail.error, /offline/);
  const list = `<a href="${url}">成品油价格</a>`;
  const older = await checkDiesel(old, { now, fetchPage: async u => u.includes('/col/') ? list : sample });
  assert.equal(older.price, 8.5);
  assert.equal(older.lastCheckStatus, 'failure');
});
test('crawler sorts dated links, caps requests and accepts newest valid notice', async () => {
  const { checkDiesel } = await load();
  let calls = [];
  const result = await checkDiesel({}, { now, fetchPage: async u => {
    calls = [...calls, u];
    return u.includes('/col/') ? `<a href="${url}">成品油价格</a><a href="${url}">成品油</a>` : sample;
  } });
  assert.equal(result.lastCheckStatus, 'ok');
  assert.equal(result.checkedAt, now.toISOString());
  assert.equal(result.price, 8.21);
  assert.equal(calls.length, 2);
  const failed = await checkDiesel(result, { now, fetchPage: async () => '<html>empty</html>' });
  assert.equal(failed.lastCheckStatus, 'failure');
  assert.equal(failed.price, 8.21);
});
test('at most five requests, rejecting latest failure instead of certifying stale fallback', async () => {
  const { checkDiesel } = await load();
  let count = 0;
  const list = Array.from({ length: 8 }, (_, i) => `<a href="/art/2026/9/${24-i}/art_53887_${100+i}.html">成品油价格</a>`).join('');
  const result = await checkDiesel({ price: 8.21 }, { now, fetchPage: async u => {
    count += 1;
    if (u.includes('/col/')) return list;
    if (u.includes('/24/')) throw new Error('timeout');
    return sample;
  } });
  assert.equal(count, 5);
  assert.equal(result.lastCheckStatus, 'failure');
  assert.equal(result.price, 8.21);
  assert.match(result.error, /timeout/);
});
test('network wrapper uses timeout, blocks redirects and surfaces HTTP errors', async () => {
  const { fetchOfficialPage } = await load();
  const original = global.fetch;
  try {
    global.fetch = async (u, options) => {
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      return { ok: true, text: async () => sample };
    };
    assert.equal(await fetchOfficialPage(url), sample);
    global.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(fetchOfficialPage(url), /HTTP 503/);
    await assert.rejects(fetchOfficialPage('https://example.com'), /Non-official/);
  } finally { global.fetch = original; }
});
