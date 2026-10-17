"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

type Lead = { id: string; name: string; phone: string; company: string; location: string; notes: string; sourceRef?: string; status: string; nextContact: string };
type Order = { id: string; customer: string; machine: string; rate: number; dailyHours: number; company: string };
type Entry = { id: string; orderId: string; kind: string; date: string; value: number; amountCents: number; reference: string; confirmedBy: string; note: string; reversalOf?: string; reversedBy?: string; createdAt?: string; rateSnapshot?: number };
type Booking = { id: string; orderId: string; machine: string; start: string; end: string; cancelledAt?: string; cancelReason?: string };
type Snapshot = { version: number; state: { leads: Lead[]; orders: Order[]; entries: Entry[]; bookings: Booking[]; audit: unknown[] } };
const COMPANY = "青岛佳和盛达工程劳务有限公司";
const tabs = ["线索", "订单与流水", "设备档期", "备份"] as const;
const statuses = ["待联系", "已联系", "已报价", "已签约", "暂缓"];
const money = (n: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(n);
export function shanghaiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map((key) => parts.find((p) => p.type === key)?.value).join("-");
}
export function orderTotals(entries: Entry[], id?: string) {
  return entries.filter((e) => !id || e.orderId === id).reduce((sum, e) => ({ received: sum.received + (e.kind === "payment" ? e.amountCents : 0), billed: sum.billed + (["hours", "fee"].includes(e.kind) ? e.amountCents : 0) }), { received: 0, billed: 0 });
}
const text = (d: FormData, key: string) => String(d.get(key) ?? "").trim();
const numeric = (d: FormData, key: string) => { const n = Number(d.get(key)); if (!Number.isFinite(n) || n <= 0) throw Error("金额、工时或单价必须大于零。"); return n; };
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="ops-field"><span>{label}</span>{children}</label>; }
function Machines() { return <>{["972", "965", "6500"].map((m) => <option key={m}>{m}</option>)}</>; }
function responseMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const b = body as { error?: unknown; message?: unknown };
  if (typeof b.error === "string") return b.error;
  if (typeof b.message === "string") return b.message;
  if (b.error && typeof b.error === "object" && "message" in b.error && typeof b.error.message === "string") return b.error.message;
  return fallback;
}
async function requestSnapshot(init?: RequestInit): Promise<Snapshot> {
  const r = await fetch("/api/state", { credentials: "same-origin", cache: "no-store", ...init });
  const body: unknown = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(Error(responseMessage(body, [401, 403].includes(r.status) ? "登录已失效或无权访问，请重新登录。" : `请求失败（${r.status}）`)), { status: r.status });
  const b = body as { success?: boolean; data?: Snapshot } | null;
  if (!b?.success || !b.data || !Number.isInteger(b.data.version) || ![b.data.state?.leads, b.data.state?.orders, b.data.state?.entries, b.data.state?.bookings, b.data.state?.audit].every(Array.isArray)) throw Error(responseMessage(body, "服务器返回异常，未确认保存。"));
  return b.data;
}
function validateBackup(value: unknown) {
  if (!value || typeof value !== "object") throw Error("备份必须是 JSON 对象。");
  const root = value as { state?: unknown; data?: { state?: unknown } };
  const candidate = root.state ?? root.data?.state;
  if (!candidate || typeof candidate !== "object") throw Error("找不到备份 state，支持本界面导出的 JSON。");
  const s = candidate as Record<string, unknown>;
  if (!["leads", "orders", "entries", "bookings", "audit"].every((key) => Array.isArray(s[key]))) throw Error("备份缺少线索、订单、流水、档期或审计数组。");
  return value;
}

export default function Operations() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>("线索");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [kind, setKind] = useState("hours");
  const [backup, setBackup] = useState<unknown>(null);
  const [backupName, setBackupName] = useState("");
  const lock = useRef(false);
  const today = shanghaiDate();
  useEffect(() => {
    let active = true;
    requestSnapshot().then((s) => { if (active) setSnapshot(s); }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  async function reload() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try { setSnapshot(await requestSnapshot()); setNotice("已读取最新云端数据。"); }
    catch (e) { setError(e instanceof Error ? e.message : "读取失败。"); }
    finally { lock.current = false; setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>, makeAction: (d: FormData) => Record<string, unknown>, reset = true) {
    event.preventDefault();
    if (!snapshot || lock.current) return;
    const form = event.currentTarget, data = new FormData(form);
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const next = await requestSnapshot({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: snapshot.version, action: makeAction(data) }) });
      setSnapshot(next); setNotice("已保存到云端。"); if (reset) form.reset();
    } catch (e) {
      if (e && typeof e === "object" && "status" in e && e.status === 409) {
        try { setSnapshot(await requestSnapshot()); setError("数据版本冲突，已载入最新数据。输入已保留，请核对后重新提交。"); }
        catch { setError("数据版本冲突，重新读取失败。输入已保留，请刷新后重试。"); }
      } else setError(e instanceof Error ? e.message : "保存失败，输入已保留。");
    } finally { lock.current = false; setBusy(false); }
  }
  async function download() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const s = await requestSnapshot(); setSnapshot(s);
      const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: 1, exportedAt: new Date().toISOString(), ...s }, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `佳和经营备份-${today}-v${s.version}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice("已生成最新云端 JSON，已发起下载。");
    } catch (e) { setError(e instanceof Error ? e.message : "备份失败，未生成文件。"); }
    finally { lock.current = false; setBusy(false); }
  }
  async function readBackup(file?: File) {
    setBackup(null); setBackupName(""); setError(""); setNotice("");
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw Error("备份文件不得超过 1MB。");
      const parsed: unknown = JSON.parse(await file.text());
      setBackup(validateBackup(parsed)); setBackupName(file.name);
    } catch (e) { setError(e instanceof SyntaxError ? "无法解析 JSON，请选择完整备份文件。" : e instanceof Error ? e.message : "读取备份失败。"); }
  }
  const state = snapshot?.state, orders = state?.orders ?? [];
  const totals = orderTotals(state?.entries ?? []);
  const pending = state?.leads.filter((l) => l.nextContact && l.nextContact <= today && !["已签约", "暂缓"].includes(l.status)) ?? [];
  const visible = state?.leads.filter((l) => [l.name, l.phone, l.company, l.location, l.sourceRef, l.notes].join(" ").toLowerCase().includes(search.toLowerCase())) ?? [];
  const options = <><option value="">请选择订单</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.customer} · {o.machine} · {o.id.slice(0, 8)}</option>)}</>;
  const empty = !!state && [state.leads, state.orders, state.entries, state.bookings, state.audit].every((a) => a.length === 0);
  return <div className="ops-shell">
    <aside className="ops-sidebar"><div className="ops-brand"><span className="ops-mark">佳</span><div>佳和 · 经营管理<small>JIAHE OPERATIONS</small></div></div><nav aria-label="经营管理">{tabs.map((name, i) => <button key={name} aria-current={tab === name ? "page" : undefined} onClick={() => setTab(name)}><span>0{i + 1}</span>{name}{name === "线索" && pending.length > 0 && <b>{pending.length}</b>}</button>)}</nav><div className="ops-private">私有云工作空间<small>仅授权登录用户访问<br />数据由服务器持久化保存</small></div></aside>
    <main className="ops-main"><header className="ops-header"><div><p className="ops-eyebrow">{COMPANY}</p><h1>{tab}</h1><p>设备、客户与账目，每一笔有据可查。</p></div><div className="ops-header-actions"><span className="ops-date">{today} · 北京时间</span><button className="ops-secondary" disabled={busy} onClick={reload}>{busy ? "处理中…" : "刷新数据"}</button></div></header>
      <div className="ops-login">● 私有云 · 需要授权登录。业务数据通过云端接口持久化保存，不使用 localStorage。</div>
      {error && <div className="ops-alert ops-error" role="alert">{error}</div>}{notice && <div className="ops-alert ops-success" role="status">{notice}</div>}
      <section className="ops-metrics" aria-label="经营汇总"><div><span>累计计费</span><strong>{money(totals.billed / 100)}</strong><small>工时与费用，含冲销净额</small></div><div><span>实际收款</span><strong>{money(totals.received / 100)}</strong><small>收款流水，含冲销净额</small></div><div><span>收支余额</span><strong className={totals.received < totals.billed ? "ops-negative" : ""}>{money((totals.received - totals.billed) / 100)}</strong><small>收款 − 计费；负数为待收</small></div><div><span>到期待跟进</span><strong>{pending.length}<em> 条</em></strong><small>排除已签约、暂缓线索</small></div></section>
      {!state || !snapshot ? <section className="ops-panel"><h2>{error ? "暂未读取云端数据" : "正在读取云端数据…"}</h2><p>成功读取后才可提交操作。</p></section> : <>
      {tab === "线索" && <><section className="ops-panel"><div className="ops-section-heading"><h2>新增客户线索</h2><span>来源估算不计入实际流水</span></div><form onSubmit={(e) => submit(e, (d) => ({ type: "lead.add", lead: { id: crypto.randomUUID(), ...Object.fromEntries(["name", "phone", "company", "location", "notes", "sourceRef"].map((key) => [key, text(d, key)])) } }))}><fieldset disabled={busy}><div className="ops-form-grid"><Field label="联系人 *"><input name="name" required maxLength={80} /></Field><Field label="联系电话 *"><input name="phone" type="tel" required maxLength={25} /></Field><Field label="客户公司"><input name="company" maxLength={160} /></Field><Field label="项目地点"><input name="location" maxLength={300} /></Field><Field label="来源 / sourceRef"><input name="sourceRef" placeholder="询价编号、渠道" maxLength={100} /></Field><Field label="线索备注"><input name="notes" maxLength={3000} placeholder="需求、待核实信息" /></Field></div><button type="submit">保存线索</button></fieldset></form></section>
      <section className="ops-panel"><div className="ops-section-heading"><h2>客户跟进 <small>{visible.length} 条</small></h2><input className="ops-search" aria-label="搜索线索及来源" placeholder="搜索客户、电话、地点、sourceRef" value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="ops-card-list">{!visible.length && <p className="ops-empty">暂无匹配线索。</p>}{visible.map((l) => <article className="ops-record" key={l.id}><div className="ops-record-head"><div><h3>{l.name} <span className="ops-badge">{l.status || "待联系"}</span></h3><p>{[l.company, l.phone, l.location].filter(Boolean).join(" · ") || "暂无联系方式"}</p></div>{pending.some((p) => p.id === l.id) && <span className="ops-badge ops-warning">{l.nextContact < today ? "已逾期" : "今日跟进"} · {l.nextContact}</span>}</div><p className="ops-source">来源：{l.sourceRef || "未填写"}</p><form onSubmit={(e) => submit(e, (d) => ({ type: "lead.update", id: l.id, status: text(d, "status"), nextContact: text(d, "nextContact"), notes: text(d, "notes") }), false)}><fieldset disabled={busy}><div className="ops-form-grid"><Field label="跟进状态"><select name="status" defaultValue={l.status || "待联系"}>{statuses.map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="下次联系（可留空）"><input name="nextContact" type="date" defaultValue={l.nextContact} /></Field><Field label="跟进备注"><textarea name="notes" defaultValue={l.notes} maxLength={3000} /></Field></div><button className="ops-secondary" type="submit">更新跟进</button></fieldset></form></article>)}</div></section></>}
      {tab === "订单与流水" && <><div className="ops-two-columns"><section className="ops-panel"><h2>新建租赁订单</h2><form onSubmit={(e) => submit(e, (d) => ({ type: "order.add", order: { id: text(d, "contractId"), customer: text(d, "customer"), machine: text(d, "machine"), rate: numeric(d, "rate"), dailyHours: numeric(d, "dailyHours"), company: COMPANY } }))}><fieldset disabled={busy}><div className="ops-form-grid ops-grid-two"><Field label="合同编号 *"><input name="contractId" required maxLength={100} placeholder="例如 JH-2026-001" /></Field><Field label="客户 / 项目 *"><input name="customer" required maxLength={160} /></Field><Field label="设备"><select name="machine"><Machines /></select></Field><Field label="小时单价（元）*"><input name="rate" type="number" min="0.01" step="0.01" required /></Field><Field label="每日计划工时 *"><input name="dailyHours" type="number" min="0.5" max="24" step="0.5" required /></Field></div><p className="ops-help">计划工时不计费，实际金额由服务器按流水计算。</p><button type="submit">创建订单</button></fieldset></form></section>
      <section className="ops-panel"><h2>登记实际流水</h2><form onSubmit={(e) => submit(e, (d) => ({ type: "entry.add", entry: { id: crypto.randomUUID(), orderId: text(d, "orderId"), kind: text(d, "kind"), date: text(d, "date"), value: numeric(d, "value"), reference: text(d, "reference"), confirmedBy: text(d, "confirmedBy"), note: text(d, "note") } }))}><fieldset disabled={busy || !orders.length}><div className="ops-form-grid ops-grid-two"><Field label="所属订单 *"><select name="orderId" required>{options}</select></Field><Field label="流水类型"><select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}><option value="hours">实际工时</option><option value="payment">实际收款</option><option value="fee">额外计费</option></select></Field><Field label="业务日期 *"><input name="date" type="date" defaultValue={today} required /></Field><Field label={kind === "hours" ? "实际工时（小时）*" : "金额（元）*"}><input name="value" type="number" min="0.01" step="0.01" required /></Field><Field label="凭证 / 参考编号 *"><input name="reference" required maxLength={200} /></Field><Field label="确认人 *"><input name="confirmedBy" required maxLength={80} /></Field><Field label="备注"><input name="note" maxLength={2000} /></Field></div><button type="submit">确认并保存流水</button></fieldset></form>{!orders.length && <p className="ops-help">请先创建订单。</p>}</section></div>
      <section className="ops-panel"><h2>订单账目</h2><div className="ops-table-wrap"><table><thead><tr><th>客户 / 设备</th><th>小时单价</th><th>累计计费</th><th>实际收款</th><th>余额</th></tr></thead><tbody>{orders.map((o) => { const t = orderTotals(state.entries, o.id); return <tr key={o.id}><td><strong>{o.customer}</strong><small>{o.machine} · {o.dailyHours} 小时/日 · {o.id.slice(0, 8)}</small></td><td>{money(o.rate)}</td><td>{money(t.billed / 100)}</td><td>{money(t.received / 100)}</td><td className={t.received < t.billed ? "ops-negative" : ""}>{money((t.received - t.billed) / 100)}</td></tr>; })}</tbody></table></div>{!orders.length && <p className="ops-empty">暂无订单。</p>}</section>
      <section className="ops-panel"><div className="ops-section-heading"><h2>流水历史</h2><select aria-label="按订单筛选流水" value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">全部订单</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.customer} · {o.machine}</option>)}</select></div><p className="ops-help">错误流水通过负数冲销更正，保留原记录；收款不可删除。</p><div className="ops-card-list">{!state.entries.filter((e) => !selected || e.orderId === selected).length && <p className="ops-empty">暂无流水。</p>}{state.entries.filter((e) => !selected || e.orderId === selected).slice().reverse().map((entry) => <article className="ops-record" key={entry.id}><div className="ops-record-head"><div><h3>{orders.find((o) => o.id === entry.orderId)?.customer ?? entry.orderId} <span className="ops-badge">{({ hours: "工时", payment: "收款", fee: "费用" } as Record<string, string>)[entry.kind] ?? entry.kind}</span>{entry.reversalOf && <span className="ops-badge ops-warning">冲销</span>}{entry.reversedBy && <span className="ops-badge">已冲销</span>}</h3><p>{entry.date} · {entry.value} {entry.kind === "hours" ? "小时" : "元"} · {money(entry.amountCents / 100)}</p></div><code>{entry.id.slice(0, 8)}</code></div><dl className="ops-details"><div><dt>凭证</dt><dd>{entry.reference}</dd></div><div><dt>确认人</dt><dd>{entry.confirmedBy}</dd></div><div><dt>记录时间（北京时间）</dt><dd>{entry.createdAt ? new Date(entry.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "服务端未提供"}</dd></div><div><dt>小时单价快照</dt><dd>{entry.kind === "hours" && entry.rateSnapshot !== undefined ? `${money(entry.rateSnapshot)}/小时` : "—"}</dd></div></dl><p className="ops-source">{entry.note || "无备注"}{entry.reversalOf && ` · 原流水：${entry.reversalOf}`}{entry.reversedBy && ` · 冲销记录：${entry.reversedBy}`}</p>{!entry.reversalOf && !entry.reversedBy && !state.entries.some((r) => r.reversalOf === entry.id) && <form onSubmit={(e) => submit(e, (d) => ({ type: "entry.reverse", id: entry.id, note: text(d, "note") }))}><fieldset disabled={busy} className="ops-inline-form"><Field label="冲销原因 *"><input name="note" required maxLength={2000} placeholder="填写原因，原流水保留" /></Field><button type="submit" className="ops-danger">冲销此笔</button></fieldset></form>}</article>)}</div></section></>}
      {tab === "设备档期" && <><section className="ops-panel"><h2>安排设备档期</h2><form onSubmit={(e) => submit(e, (d) => { const start = text(d, "start"), end = text(d, "end"); if (end < start) throw Error("结束日期不能早于开始日期。"); return { type: "booking.add", booking: { id: crypto.randomUUID(), orderId: text(d, "orderId"), machine: text(d, "machine"), start, end } }; })}><fieldset disabled={busy || !orders.length}><div className="ops-form-grid"><Field label="关联订单 *"><select name="orderId" required>{options}</select></Field><Field label="设备"><select name="machine"><Machines /></select></Field><Field label="开始日期 *"><input name="start" type="date" defaultValue={today} required /></Field><Field label="结束日期 *"><input name="end" type="date" defaultValue={today} required /></Field></div><p className="ops-help">设备匹配及日期冲突由服务器校验，保存成功才算安排完成。</p><button type="submit">保存档期</button></fieldset></form></section><section className="ops-panel"><h2>全部档期与取消记录</h2><div className="ops-card-list">{!state.bookings.length && <p className="ops-empty">暂无设备档期。</p>}{state.bookings.slice().sort((a, b) => a.start.localeCompare(b.start)).map((b) => <article key={b.id} className="ops-record"><div className="ops-record-head"><div><h3>设备 {b.machine} <span className={`ops-badge ${b.cancelledAt ? "" : "ops-active"}`}>{b.cancelledAt ? "已取消" : b.end < today ? "已结束" : b.start > today ? "待进场" : "档期中"}</span></h3><p>{orders.find((o) => o.id === b.orderId)?.customer ?? b.orderId} · {b.start} 至 {b.end}</p></div><code>{b.id.slice(0, 8)}</code></div>{b.cancelledAt ? <p className="ops-source">取消原因：{b.cancelReason} · {new Date(b.cancelledAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p> : <form onSubmit={(e) => submit(e, (d) => ({ type: "booking.cancel", id: b.id, note: text(d, "note") }))}><fieldset disabled={busy} className="ops-inline-form"><Field label="取消原因 *"><input name="note" required maxLength={1000} /></Field><button type="submit" className="ops-danger">取消档期</button></fieldset></form>}</article>)}</div></section></>}
      {tab === "备份" && <><section className="ops-panel ops-backup"><span className="ops-badge ops-active">云端数据 · v{snapshot.version}</span><h2>下载经营数据备份</h2><p>下载前读取最新云端状态，包含线索、订单、流水、档期与审计记录。备份包含私人经营信息，请保存在可信位置，不要公开上传。</p><div className="ops-backup-counts"><span>{state.leads.length} 条线索</span><span>{orders.length} 笔订单</span><span>{state.entries.length} 条流水</span><span>{state.bookings.length} 条档期</span><span>{state.audit.length} 条审计</span></div><button onClick={download} disabled={busy}>下载最新 JSON 备份</button></section><section className="ops-panel ops-backup"><h2>恢复历史备份</h2><p>仅允许向完全空白的云端恢复历史数据，服务器会再次检查。此操作会写入历史业务记录并标注备份来源；历史确认人和时间不等于系统已核实银行凭证。</p><form onSubmit={(e) => submit(e, () => { if (!backup) throw Error("请先选择有效备份。"); return { type: "backup.restore", backup }; }, false)}><fieldset disabled={busy || !empty}><Field label="JSON 文件（最大 1MB）"><input type="file" accept=".json,application/json" onChange={(e) => { void readBackup(e.target.files?.[0]); }} /></Field>{backupName && <p className="ops-help">已检查结构：{backupName}。完整业务校验由服务器执行。</p>}<label className="ops-check"><input type="checkbox" required />我确认仅向空云端恢复历史数据，备份来源可信且未公开上传。</label><button type="submit" disabled={!backup}>确认恢复历史数据</button></fieldset></form>{!empty && <p className="ops-help">当前云端已有记录，恢复入口已禁用。</p>}</section></>}
      </>}
      <footer className="ops-footer">佳和经营管理 · {snapshot ? `云端版本 ${snapshot.version}` : "等待云端连接"} · 金额单位：人民币元</footer>
    </main></div>;
}
