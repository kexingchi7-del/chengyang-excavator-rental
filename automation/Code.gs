/** Optional owner-authorized Gmail polling. No web app or public endpoint. */
const CONFIG = Object.freeze({
  query: 'from:submissions@formsubmit.co subject:"新客户询价" newer_than:30d',
  timezone: 'Asia/Shanghai',
  bodyLimit: 12000,
  pageSize: 50,
  maxThreads: 500,
  leads: ['邮件ID', '收到时间', '邮件主题', '姓名', '电话', '公司', '地点',
    '项目', '开始日期', '天数', '每日小时', '机型', '数量', '合作方式',
    '付款方式', '备注', '邮件正文（最多12000字符）', '跟进状态', '负责人', '跟进备注'],
  orders: ['订单ID', '客户', '电话', '机型', '数量', '合同小时单价',
    '实际累计机时', '其他实际费用', '确认累计到账', '预计每日总机时',
    '付款到期日', '订单状态', '备注']
});

/** Run once in the Apps Script editor as the Gmail account receiving enquiries. */
function setup() {
  const owner = Session.getEffectiveUser().getEmail();
  if (!owner) throw new Error('无法识别授权账号，请在脚本编辑器中以所有者账号运行。');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const existing = props.getProperty('SPREADSHEET_ID');
    const book = existing ? SpreadsheetApp.openById(existing)
      : SpreadsheetApp.create('挖掘机租赁线索与订单');
    ensureSheet_(book, 'Leads', CONFIG.leads);
    ensureSheet_(book, 'Orders', CONFIG.orders);
    props.setProperties({ SPREADSHEET_ID: book.getId(), OWNER_EMAIL: owner });
    installTriggers_();
    const result = { spreadsheetUrl: book.getUrl(), ownerEmail: owner,
      timezone: CONFIG.timezone, status: '已配置；请手动运行导入和日报验证实际结果' };
    console.log(JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function ensureSheet_(book, name, headers) {
  const sheet = book.getSheetByName(name) || book.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (JSON.stringify(actual) !== JSON.stringify(headers)) {
      throw new Error(name + ' 表头与脚本不一致，请保留原数据并恢复标准表头。');
    }
  }
}

function installTriggers_() {
  const handlers = ['importFormSubmitLeads', 'dailyOwnerDigest'];
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (handlers.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('importFormSubmitLeads').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('dailyOwnerDigest').timeBased().atHour(17)
    .everyDays(1).inTimezone(CONFIG.timezone).create();
}

function context_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  const owner = props.getProperty('OWNER_EMAIL');
  if (!id || !owner) throw new Error('请先在脚本编辑器运行 setup()。');
  if (Session.getEffectiveUser().getEmail() !== owner) {
    throw new Error('请使用 setup 授权的账号运行。');
  }
  const book = SpreadsheetApp.openById(id);
  ensureSheet_(book, 'Leads', CONFIG.leads);
  ensureSheet_(book, 'Orders', CONFIG.orders);
  return { props: props, owner: owner, book: book };
}

/** Every hour; messages remain unread/read exactly as before. */
function importFormSubmitLeads() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { status: 'busy; next trigger retries' };
  try {
    const ctx = context_();
    const sheet = ctx.book.getSheetByName('Leads');
    const ids = sheet.getLastRow() < 2 ? []
      : sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    const known = new Set(ids.map(function (row) { return String(row[0]); }));
    const result = importPages_(sheet, known);
    ctx.props.setProperty('LAST_IMPORT_OK', new Date().toISOString());
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    console.error('导入未完成；已保存邮件按ID去重，下次触发会重试。');
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function importPages_(sheet, known) {
  let imported = 0;
  let scanned = 0;
  for (let offset = 0; offset < CONFIG.maxThreads; offset += CONFIG.pageSize) {
    const threads = GmailApp.search(CONFIG.query, offset, CONFIG.pageSize);
    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (message) {
        scanned += 1;
        if (known.has(message.getId()) || !eligibleMessage_(message)) return;
        const body = message.getPlainBody().slice(0, CONFIG.bodyLimit);
        if (excludedMessage_(message.getSubject(), body)) return;
        sheet.appendRow(leadRow_(message, body).map(safeCell_));
        SpreadsheetApp.flush();
        known.add(message.getId());
        imported += 1;
      });
    });
    if (threads.length < CONFIG.pageSize) return { imported: imported, scanned: scanned };
  }
  throw new Error('搜索命中至少500个会话，请缩小 CONFIG.query 时间窗口后重试，避免旧线索遗漏。');
}

function eligibleMessage_(message) {
  const from = message.getFrom().trim().toLowerCase();
  const sender = from.match(/<([^>]+)>/);
  const email = sender ? sender[1] : from;
  const cutoff = Date.now() - 30 * 86400000;
  return email === 'submissions@formsubmit.co'
    && message.getSubject().indexOf('新客户询价') !== -1
    && message.getDate().getTime() >= cutoff;
}

function excludedMessage_(subject, body) {
  return /测试|測試|\btest\b|activation|activate|激活|启用表单/i.test(subject)
    || /(?:activate your form|confirm your email|form activation)/i.test(body)
    || /^(?:测试|test|is_test)\s*[:：]\s*(?:true|yes|1|是)\s*$/im.test(body)
    || /^(?:姓名|name)\s*[:：]\s*(?:测试(?:客户)?|test(?: customer)?)\s*$/im.test(body);
}

function field_(body, aliases) {
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s*([^:：]+)[:：]\s*(.*)$/);
    if (match && aliases.indexOf(match[1].trim().toLowerCase()) !== -1) {
      return (match[2].trim() || String(lines[i + 1] || '').trim()).slice(0, 1000);
    }
    if (aliases.indexOf(lines[i].trim().toLowerCase()) !== -1) {
      return String(lines[i + 1] || '').trim().slice(0, 1000);
    }
  }
  return '';
}

function leadRow_(message, body) {
  const keys = [
    ['姓名', '联系人', 'name'], ['电话', '联系电话', 'phone'],
    ['公司', '公司名称', 'company'], ['地点', '工地地址', '施工地点', 'location'],
    ['项目', '工程类型', '项目名称', 'project'], ['开始日期', '预计开工日期', 'start', 'start_date'],
    ['天数', '预计使用天数', '租赁天数', 'days'], ['每日小时', '每天工时', '每天小时', 'hours'],
    ['设备名称', '机型', 'machine'], ['数量', '需求台数', '台数', 'count'],
    ['合作方式', '合作需求', 'cooperation'], ['付款方式', '付款条件', 'payment'], ['备注', '其他说明', 'notes']
  ];
  return [message.getId(), message.getDate(), message.getSubject()]
    .concat(keys.map(function (aliases) { return field_(body, aliases); }))
    .concat([body, '待跟进', '', '']);
}

/** Prevent spreadsheet formula execution, including whitespace-prefixed input. */
function safeCell_(value) {
  if (typeof value !== 'string') return value;
  return /^[\s\uFEFF]*[=+\-@]/.test(value) ? "'" + value : value;
}

/** Daily at approximately 17:00 Beijing time; one successful send per day. */
function dailyOwnerDigest() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { status: 'busy; retry later' };
  try {
    const ctx = context_();
    const now = new Date();
    const day = Utilities.formatDate(now, CONFIG.timezone, 'yyyy-MM-dd');
    if (ctx.props.getProperty('LAST_DIGEST_DAY') === day) return { status: 'already sent' };
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('邮件额度不足，请待额度恢复后重试。');
    const body = digestBody_(ctx, now);
    MailApp.sendEmail({ to: ctx.owner, subject: '租赁线索与订单提醒 ' + day, body: body });
    ctx.props.setProperties({ LAST_DIGEST_DAY: day, LAST_DIGEST_AT: now.toISOString(),
      LAST_DIGEST_LEAD_COUNT: String(Math.max(0, ctx.book.getSheetByName('Leads').getLastRow() - 1)) });
    return { status: 'sent', day: day };
  } finally {
    lock.releaseLock();
  }
}

function digestBody_(ctx, now) {
  const rows = ctx.book.getSheetByName('Leads').getDataRange().getValues().slice(1);
  const notified = Number(ctx.props.getProperty('LAST_DIGEST_LEAD_COUNT') || 0);
  const recent = rows.slice(Number.isInteger(notified) && notified >= 0 ? notified : 0);
  const orders = ctx.book.getSheetByName('Orders').getDataRange().getValues().slice(1);
  const alerts = orders.map(function (row, index) {
    return orderAlert_(row, index + 2, now);
  }).filter(Boolean);
  const lastImport = ctx.props.getProperty('LAST_IMPORT_OK');
  const stale = !lastImport || now.getTime() - new Date(lastImport).getTime() > 3 * 3600000;
  return ['新导入询价：' + recent.length + ' 条（自上次成功日报后追加；首次为所有已导入）。',
    '请在 Leads 中查看原始邮件、电话并人工跟进。',
    '最近成功导入：' + (lastImport || '尚无') + (stale ? '【超过3小时未成功，请检查执行记录】' : ''),
    '', '订单提醒（正数为欠款，负数为剩余预付款）：',
    alerts.length ? alerts.slice(0, 100).join('\n') : '暂无需提醒的订单。',
    alerts.length > 100 ? '其余提醒请打开 Orders 核对。' : '',
    '', '台账：' + ctx.book.getUrl(),
    '询价预计费用不是合同或到账凭证；仅按人工确认的实际机时、费用和到账核算。'
  ].join('\n');
}

function number_(value, positive) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return positive ? (value > 0 ? value : null) : (value >= 0 ? value : null);
}

function orderAlert_(row, line, now) {
  if (row.every(function (cell) { return cell === ''; })) return '';
  if (String(row[11]).trim() === '已结清') return '';
  const label = 'Orders第' + line + '行 ' + String(row[0] || '缺订单ID');
  const rate = number_(row[5], true);
  const hours = number_(row[6], false);
  const costs = number_(row[7], false);
  const paid = number_(row[8], false);
  const daily = number_(row[9], true);
  if ([rate, hours, costs, paid, daily].some(function (v) { return v === null; })) {
    return label + '：数据不完整或无效；单价/每日总机时须>0，实际机时/费用/到账须明确填数字（含0）。';
  }
  const balance = hours * rate + costs - paid;
  const buffer = 2 * daily * rate;
  if (!Number.isFinite(balance) || !Number.isFinite(buffer)) return label + '：金额超出有效范围。';
  const due = dueDay_(row[10]);
  if (due === null) return label + '：付款到期日无效，请填日期单元格或 YYYY-MM-DD。';
  const today = Utilities.formatDate(now, CONFIG.timezone, 'yyyy-MM-dd');
  const overdue = due !== '' && due < today && balance > 0;
  const low = -balance < buffer;
  if (!overdue && !low) return '';
  return label + '：净应收 ' + balance.toFixed(2) + ' 元；剩余预付款 '
    + Math.max(0, -balance).toFixed(2) + ' 元；两天机时缓冲 ' + buffer.toFixed(2)
    + ' 元' + (overdue ? '【逾期未足额支付】' : '') + (low ? '【预付款低于两天缓冲】' : '')
    + (due === '' ? '【未填付款到期日，无法判断逾期】' : '');
}

function dueDay_(value) {
  if (value === '') return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, CONFIG.timezone, 'yyyy-MM-dd');
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
