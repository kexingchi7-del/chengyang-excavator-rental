import { readFile, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const LIST_URL = 'https://fgw.weihai.gov.cn/col/col53887/index.html';
const DATA_URL = new URL('../data/diesel.json', import.meta.url);
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/\s+/g, ' ').trim();
const compact = html => text(html).replace(/\s+/g, '');
const today = now => new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);

function officialUrl(value) {
  const url = new URL(value, LIST_URL);
  if (url.hostname !== 'fgw.weihai.gov.cn' || !['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || url.port) throw new Error('Non-official source URL');
  url.protocol = 'https:';
  return url.href;
}

function dateString(year, month, day) {
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid notice date');
  }
  return value;
}

function meta(html, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const tag = tags.find(t => new RegExp(`name\\s*=\\s*['"]${name}['"]`, 'i').test(t));
  return tag?.match(/content\s*=\s*['"]([^'"]*)['"]/i)?.[1];
}

// Pure parser: source dates describe the notice; checkedAt belongs to the check.
export function parseDieselNotice(html, sourceUrl, now = new Date()) {
  const url = officialUrl(sourceUrl);
  const sourceTitle = meta(html, 'ArticleTitle') || text(html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '');
  if (!/成品油/.test(sourceTitle)) throw new Error('Not a refined-oil notice');
  const pub = meta(html, 'PubDate')?.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
    || url.match(/\/art\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
  if (!pub) throw new Error('Missing publication date');
  const publishedDate = dateString(...pub.slice(1, 4));
  const body = compact(html.match(/<!--ZJEG_RSS.content.begin-->([\s\S]*?)<!--ZJEG_RSS.content.end-->/)?.[1] || html);
  const effective = body.match(/(?:自|从)(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(\d{1,2})时起/)
    || compact(sourceTitle).match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(\d{1,2})时起/);
  if (!effective) throw new Error('Missing effective date/time');
  const day = dateString(effective[1] || publishedDate.slice(0, 4), effective[2], effective[3]);
  const hour = Number(effective[4]);
  if (hour > 24) throw new Error('Invalid effective hour');
  const instant = new Date(`${day}T00:00:00+08:00`).getTime() + hour * 3600000;
  const effectiveDate = today(new Date(instant));
  if (publishedDate > today(now) || instant > now.getTime()) throw new Error('Future notice');
  const prose = body.match(/(?<![\d－−+\-])0号柴油(?:最高零售价格)?(?:调整为|为|执行)?每升(\d+(?:\.\d+)?)元/);
  const tables = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/gi) || [];
  const prices = tables.flatMap(table => {
    if (!/最高零售价格/.test(compact(table)) || !/元[／/]升/.test(compact(table)) || !/柴油/.test(compact(table))) return [];
    return [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap(row => {
      const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => compact(c[1]));
      const index = cells.indexOf('0号');
      return index >= 0 ? [Number(cells[index + 1])] : [];
    });
  });
  const candidates = [...(prose ? [Number(prose[1])] : []), ...prices];
  if (!candidates.length || candidates.some(p => !Number.isFinite(p) || p < 3 || p > 15)
      || new Set(candidates).size !== 1) throw new Error('Missing, implausible or conflicting 0号 元/升 price');
  return { province: '山东', grade: '0号柴油', price: candidates[0], unit: '元/升',
    effectiveDate, publishedDate, sourceUrl: url, sourceTitle };
}

export function collectNoticeLinks(html, now = new Date()) {
  const links = [...html.matchAll(/<a\b[^>]*href\s*=\s*['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi)]
    .filter(match => /成品油/.test(text(match[0])))
    .flatMap(match => {
      try {
        const url = officialUrl(match[1]);
        const parts = url.match(/\/art\/(\d{4})\/(\d{1,2})\/(\d{1,2})\/art_53887_\d+\.html$/);
        if (!parts) return [];
        const date = dateString(...parts.slice(1, 4));
        return date <= today(now) ? [{ url, date }] : [];
      } catch { return []; }
    });
  return [...new Map(links.map(link => [link.url, link])).values()].sort((a, b) => b.date.localeCompare(a.date));
}

export async function fetchOfficialPage(url) {
  const response = await fetch(officialUrl(url), { signal: AbortSignal.timeout(15000), redirect: 'error',
    headers: { Accept: 'text/html', 'User-Agent': 'ShandongDieselPriceCheck/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export async function checkDiesel(previous, { now = new Date(), fetchPage = fetchOfficialPage } = {}) {
  const checkedAt = now.toISOString();
  try {
    const links = collectNoticeLinks(await fetchPage(LIST_URL), now);
    if (!links.length) throw new Error('Official list contains no dated 成品油 notices');
    let accepted;
    let errors = [];
    for (const link of links.slice(0, 4)) {
      try {
        const notice = parseDieselNotice(await fetchPage(link.url), link.url, now);
        if (!accepted || notice.effectiveDate > accepted.effectiveDate) accepted = notice;
      } catch (error) { errors = [...errors, `${link.url}: ${error.message}`]; }
    }
    // Never silently certify an older fallback when a more recent notice is unreadable.
    if (errors.length) throw new Error(errors.join('; '));
    if (!accepted) throw new Error('No valid current notice found');
    if (previous.effectiveDate && accepted.effectiveDate < previous.effectiveDate) throw new Error('Fetched notice is older than accepted price');
    if (previous.effectiveDate === accepted.effectiveDate && previous.price !== undefined && previous.price !== accepted.price) {
      throw new Error('Conflicting price for previously accepted effective date');
    }
    return { ...previous, ...accepted, checkedAt, lastCheckStatus: 'ok', error: null };
  } catch (error) {
    return { ...previous, checkedAt, lastCheckStatus: 'failure', error: error.message };
  }
}

export async function main() {
  // Missing/corrupt local data must not be overwritten with an invented baseline.
  const previous = JSON.parse(await readFile(DATA_URL, 'utf8'));
  const result = await checkDiesel(previous);
  const temporary = new URL(`../data/diesel.json.${process.pid}.tmp`, import.meta.url);
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await rename(temporary, DATA_URL);
  if (result.lastCheckStatus !== 'ok') {
    console.error(`Diesel check failed: ${result.error}`);
    process.exitCode = 1;
  } else console.log(`山东0号柴油 ${result.price} 元/升; effective ${result.effectiveDate}; ${result.sourceUrl}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error(`Diesel update failed: ${error.message}`); process.exitCode = 1; });
}
