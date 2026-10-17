import { pathToFileURL } from 'node:url';

export const SITE_URL = 'https://kexingchi7-del.github.io/chengyang-excavator-rental/';
const COMPANY = '青岛佳和盛达工程劳务有限公司';
const SCRIPTS = ['business.js', 'form.js', 'enquiry.js', 'policy.js', 'fuel-budget.js'];
const fail = message => { throw new Error(message); };

function validDate(value, now) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value
    && value <= new Date(+now + 8 * 3600000).toISOString().slice(0, 10);
}

export function validateDiesel(data, now = new Date()) {
  if (!data || data.province !== '山东' || data.grade !== '0号柴油' || data.unit !== '元/升'
      || typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price < 3 || data.price > 15
      || typeof data.sourceTitle !== 'string' || !data.sourceTitle.trim()
      || !validDate(data.effectiveDate, now) || !validDate(data.publishedDate, now)
      || data.publishedDate > data.effectiveDate) fail('Invalid diesel schema');
  const source = new URL(data.sourceUrl);
  if (source.protocol !== 'https:' || source.hostname !== 'fgw.weihai.gov.cn'
      || source.username || source.password || source.port) fail('Invalid official source host');
  const checked = typeof data.checkedAt === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(data.checkedAt)
    ? Date.parse(data.checkedAt) : NaN;
  if (!Number.isFinite(checked) || +now - checked > 48 * 3600000 || checked > +now) {
    fail('Diesel check time is invalid or older than 48 hours');
  }
  if (data.lastCheckStatus !== 'ok' || data.error !== null) {
    fail('Official diesel source check failed; prior price retained');
  }
}

export async function checkPublicSite({ fetchImpl = fetch, now = new Date() } = {}) {
  async function read(path, type) {
    const url = new URL(path, SITE_URL);
    url.searchParams.set('_health', String(+now));
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), redirect: 'error',
      cache: 'no-store', headers: { Accept: type, 'Cache-Control': 'no-cache' } });
    if (response.status !== 200) fail(`${path || 'index'}: HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes(type)) fail(`${path || 'index'}: unexpected content type`);
    const body = await response.text();
    if (!body.trim()) fail(`${path}: empty response`);
    return body;
  }
  const html = await read('', 'text/html');
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!/<html\b/i.test(html) || !title?.includes(COMPANY)) fail('Public HTML has wrong company title');
  await read('thanks.html', 'text/html');
  for (const script of SCRIPTS) {
    // GitHub Pages serves JavaScript as application/javascript or text/javascript.
    const body = await read(script, 'javascript');
    if (/<(?:!doctype|html|head|body|title)\b/i.test(body)
        || /^\s*(?:404\b|not found\b|internal server error\b)/i.test(body)) fail(`${script}: error HTML/text`);
  }
  validateDiesel(JSON.parse(await read('data/diesel.json', 'application/json')), now);
}

export async function main({ check = checkPublicSite,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), log = console.log } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await check();
      log('Public site health check passed');
      return 0;
    } catch (error) {
      log(`::warning::Public site check ${attempt}/3 failed: ${String(error.message).replace(/[\r\n]/g, ' ')}`);
      if (attempt < 3) await sleep(4000);
    }
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
