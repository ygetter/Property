import {
  MileageEntry, AccountsSettings, PropertyCharge, DayBreakdown, CostEntry, MeterReading,
} from './types';

export function money(n: number): string {
  return `£${(Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2)}`;
}

export function monthKey(date: string): string {
  return (date || '').slice(0, 7); // YYYY-MM
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  if (!y || !m) return key;
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function dayLabel(date: string): string {
  return new Date(date + 'T12:00:00')
    .toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
}

export function milesOf(e: MileageEntry): number {
  const start = parseFloat(e.startMiles || '0');
  const end = parseFloat(e.endMiles || '0');
  if (!isFinite(start) || !isFinite(end)) return 0;
  return Math.max(0, end - start);
}

/**
 * Work out what each property owes for one day.
 *
 * Mileage is split by VISIT — two visits to the same property carry two shares.
 * Tolls and charges are split by DISTINCT PROPERTY visited that day.
 */
export function breakdownDay(entry: MileageEntry, settings: AccountsSettings): DayBreakdown {
  const miles = milesOf(entry);
  const mileageCost = miles * (settings.ratePerMile || 0);
  const visits = (entry.visits || []).filter((v) => v.count > 0);
  const totalVisits = visits.reduce((n, v) => n + v.count, 0);
  const charges = (entry.charges || []).filter((c) => c.times > 0);
  const chargesCost = charges.reduce((n, c) => n + c.amount * c.times, 0);
  const distinct = visits.length;
  return {
    date: entry.date,
    miles,
    mileageCost,
    visits,
    totalVisits,
    distinctProperties: distinct,
    charges,
    chargesCost,
    perVisit: totalVisits > 0 ? mileageCost / totalVisits : 0,
    perProperty: distinct > 0 ? chargesCost / distinct : 0,
    total: mileageCost + chargesCost,
  };
}

export interface MonthSummary {
  month: string;
  days: DayBreakdown[];
  properties: PropertyCharge[];
  chargeNames: string[];
  totalMiles: number;
  totalMileage: number;
  totalCharges: number;
  grandTotal: number;
  unallocated: number; // cost on days with no properties recorded
}

export function summariseMonth(
  entries: MileageEntry[], settings: AccountsSettings, month: string,
): MonthSummary {
  const days = entries
    .filter((e) => monthKey(e.date) === month)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => breakdownDay(e, settings));

  const byProp: Record<string, PropertyCharge> = {};
  const chargeNames: string[] = [];
  let unallocated = 0;

  for (const d of days) {
    if (d.visits.length === 0) { unallocated += d.total; continue; }
    for (const v of d.visits) {
      const key = (v.address || v.propertyId).trim().toLowerCase();
      if (!byProp[key]) {
        byProp[key] = {
          propertyId: v.propertyId, address: v.address, visits: 0,
          mileage: 0, charges: {}, chargesTotal: 0, total: 0,
        };
      }
      const p = byProp[key];
      p.visits += v.count;
      p.mileage += d.perVisit * v.count;
      for (const c of d.charges) {
        if (!chargeNames.includes(c.name)) chargeNames.push(c.name);
        const share = (c.amount * c.times) / d.distinctProperties;
        p.charges[c.name] = (p.charges[c.name] || 0) + share;
        p.chargesTotal += share;
      }
    }
  }

  const properties = Object.values(byProp).map((p) => ({ ...p, total: p.mileage + p.chargesTotal }))
    .sort((a, b) => b.total - a.total);

  const totalMiles = days.reduce((n, d) => n + d.miles, 0);
  const totalMileage = days.reduce((n, d) => n + d.mileageCost, 0);
  const totalCharges = days.reduce((n, d) => n + d.chargesCost, 0);

  return {
    month, days, properties, chargeNames,
    totalMiles, totalMileage, totalCharges,
    grandTotal: totalMileage + totalCharges,
    unallocated,
  };
}

// ---------------------------------------------------------------- PDF builders

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
}

const SHEET = `
  @page { margin: 13mm 12mm; }
  * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family: ui-sans-serif, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color:#111A24; font-size:10.6px; line-height:1.42; background:#fff; }
  .mono { font-variant-numeric: tabular-nums; }
  .top { display:flex; justify-content:space-between; align-items:flex-end; padding-bottom:10px; border-bottom:2px solid #1E2B3A; }
  .brand { display:flex; align-items:center; gap:9px; }
  .logo { width:22px; height:22px; border-radius:6px; background:#E86A17; position:relative; flex:none; }
  .logo:after { content:''; position:absolute; left:6px; top:8px; width:7px; height:3.5px; border-left:2px solid #fff; border-bottom:2px solid #fff; transform:rotate(-45deg); }
  .bname { font-size:11px; font-weight:700; }
  .bsub { font-size:8.4px; color:#7A8794; letter-spacing:0.9px; text-transform:uppercase; margin-top:1px; }
  .tright { text-align:right; }
  h1 { font-size:19px; font-weight:750; letter-spacing:-0.45px; line-height:1.1; }
  .date { font-size:10px; color:#5B6876; margin-top:2px; }
  .kpis { display:flex; gap:7px; margin:10px 0 0; }
  .kpi { flex:1; border:1px solid #E6EAEF; border-radius:7px; padding:7px 10px; }
  .kpi b { font-size:16.5px; font-weight:750; letter-spacing:-0.5px; display:block; line-height:1.1; }
  .kpi span { font-size:8px; color:#7A8794; text-transform:uppercase; letter-spacing:0.8px; font-weight:600; }
  .kpi.hl { background:#FDF4EC; border-color:#F6D6BB; }
  .kpi.hl b { color:#C8560D; }
  h2 { font-size:12.5px; font-weight:700; letter-spacing:-0.2px; margin:15px 0 6px; }
  .note { font-size:9.6px; color:#7A8794; margin:-3px 0 7px; }
  table { width:100%; border-collapse:collapse; border:1px solid #E1E6EC; border-radius:8px; overflow:hidden; table-layout:fixed; }
  th { text-align:left; font-size:7.9px; text-transform:uppercase; letter-spacing:0.85px; color:#7A8794;
    font-weight:700; padding:5.5px 9px; background:#F5F7FA; border-bottom:1px solid #E1E6EC; }
  td { padding:6px 9px; border-bottom:1px solid #F0F3F6; font-size:10px; vertical-align:top; word-break:break-word; }
  tr:last-child td { border-bottom:none; }
  .r { text-align:right; font-variant-numeric:tabular-nums; }
  .b { font-weight:700; }
  .addr { font-weight:650; }
  tr.tot td { background:#F5F7FA; font-weight:750; border-top:1px solid #E1E6EC; }
  .daybar { display:flex; align-items:center; gap:9px; background:#1E2B3A; color:#fff; padding:6px 11px; border-radius:7px 7px 0 0; }
  .dday { font-size:11px; font-weight:750; background:#E86A17; padding:2px 8px; border-radius:99px; }
  .dmiles { font-size:9.6px; color:#C9D4E1; flex:1; }
  .dtot { font-size:11px; font-weight:750; font-variant-numeric:tabular-nums; }
  .day { margin-top:9px; border:1px solid #E1E6EC; border-radius:8px; overflow:hidden; page-break-inside:avoid; break-inside:avoid; }
  .day table { border:none; border-radius:0; }
  .chargechip { display:inline-block; font-size:8.7px; font-weight:700; background:#FDF4EC; color:#C8560D;
    border:1px solid #F6D6BB; border-radius:99px; padding:1.5px 7px; margin:0 4px 3px 0; }
  .foot { margin-top:14px; padding-top:7px; border-top:1px solid #E6EAEF; display:flex; justify-content:space-between; color:#A3AEBA; font-size:8.6px; }
  .empty { color:#98A3B0; font-size:10.5px; margin-top:14px; padding:18px; border:1px dashed #DDE3EA; border-radius:8px; text-align:center; }
`;

function head(title: string, sub: string, company: string, kind: string): string {
  return `
  <div class="top">
    <div class="brand">
      <div class="logo"></div>
      <div>
        <div class="bname">${esc(company || 'Property Companion')}</div>
        <div class="bsub">${esc(kind)}</div>
      </div>
    </div>
    <div class="tright">
      <h1>${esc(title)}</h1>
      <div class="date">${esc(sub)}</div>
    </div>
  </div>`;
}

function foot(company: string): string {
  const stamp = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return `<div class="foot">
    <span>${esc(company || 'Property Companion')} &middot; Generated by Property Companion</span>
    <span>${esc(stamp)}</span>
  </div>`;
}

/** Monthly mileage & charges apportionment report */
export function buildMileageHtml(
  sum: MonthSummary,
  settings: AccountsSettings,
  meta: { companyName: string; senderName: string },
): string {
  const cols = sum.chargeNames;

  const propRows = sum.properties.map((p) => `
    <tr>
      <td class="addr">${esc(p.address)}</td>
      <td class="r mono">${p.visits}</td>
      <td class="r mono">${money(p.mileage)}</td>
      ${cols.map((c) => `<td class="r mono">${p.charges[c] ? money(p.charges[c]) : '—'}</td>`).join('')}
      <td class="r mono b">${money(p.total)}</td>
    </tr>`).join('');

  const propTotals = `
    <tr class="tot">
      <td>Total</td>
      <td class="r mono">${sum.properties.reduce((n, p) => n + p.visits, 0)}</td>
      <td class="r mono">${money(sum.properties.reduce((n, p) => n + p.mileage, 0))}</td>
      ${cols.map((c) => `<td class="r mono">${money(sum.properties.reduce((n, p) => n + (p.charges[c] || 0), 0))}</td>`).join('')}
      <td class="r mono">${money(sum.properties.reduce((n, p) => n + p.total, 0))}</td>
    </tr>`;

  const dayBlocks = sum.days.map((d) => {
    const rows = d.visits.length
      ? d.visits.map((v) => {
        const mileShare = d.perVisit * v.count;
        const chargeShare = d.perProperty;
        return `
        <tr>
          <td class="addr">${esc(v.address)}</td>
          <td class="r mono">${v.count}</td>
          <td class="r mono">${money(mileShare)}</td>
          <td class="r mono">${d.chargesCost > 0 ? money(chargeShare) : '—'}</td>
          <td class="r mono b">${money(mileShare + (d.chargesCost > 0 ? chargeShare : 0))}</td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="5" style="color:#98A3B0">No properties recorded for this day.</td></tr>';

    return `
      <div class="day">
        <div class="daybar">
          <span class="dday">${esc(dayLabel(d.date))}</span>
          <span class="dmiles">${d.miles.toFixed(1)} miles &times; ${money(settings.ratePerMile)} = ${money(d.mileageCost)}${d.charges.length ? ` &nbsp;|&nbsp; charges ${money(d.chargesCost)}` : ''}</span>
          <span class="dtot">${money(d.total)}</span>
        </div>
        ${d.charges.length ? `<div style="padding:7px 9px 0">${d.charges.map((c) => `<span class="chargechip">${esc(c.name)}${c.times > 1 ? ` ×${c.times}` : ''} ${money(c.amount * c.times)}</span>`).join('')}</div>` : ''}
        <table>
          <thead><tr>
            <th style="width:40%">Property</th>
            <th class="r" style="width:10%">Visits</th>
            <th class="r" style="width:17%">Mileage</th>
            <th class="r" style="width:16%">Charges</th>
            <th class="r" style="width:17%">Day total</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Mileage & Charges — ${esc(monthLabel(sum.month))}</title><style>${SHEET}</style></head><body>
  ${head('Mileage & Charges', `${monthLabel(sum.month)}${meta.senderName ? ` · ${meta.senderName}` : ''}`, meta.companyName, 'Accounts · Travel recharge')}

  <div class="kpis">
    <div class="kpi"><b>${sum.totalMiles.toFixed(0)}</b><span>Miles driven</span></div>
    <div class="kpi"><b>${money(sum.totalMileage)}</b><span>Mileage @ ${money(settings.ratePerMile)}/mi</span></div>
    <div class="kpi"><b>${money(sum.totalCharges)}</b><span>Tolls &amp; charges</span></div>
    <div class="kpi hl"><b>${money(sum.grandTotal)}</b><span>Total to recharge</span></div>
    <div class="kpi"><b>${sum.days.length}</b><span>Days recorded</span></div>
  </div>

  <h2>Total charge per property</h2>
  <p class="note">Mileage is divided by the number of visits made that day (a repeat visit to the same property counts again). Tolls and charges are divided equally between the different properties visited that day.</p>
  ${sum.properties.length ? `<table>
    <thead><tr>
      <th style="width:${Math.max(24, 46 - cols.length * 6)}%">Property</th>
      <th class="r" style="width:9%">Visits</th>
      <th class="r" style="width:14%">Mileage</th>
      ${cols.map((c) => `<th class="r">${esc(c)}</th>`).join('')}
      <th class="r" style="width:14%">Total due</th>
    </tr></thead>
    <tbody>${propRows}${propTotals}</tbody>
  </table>` : '<div class="empty">No property visits recorded for this month.</div>'}
  ${sum.unallocated > 0 ? `<p class="note" style="margin-top:6px">${money(sum.unallocated)} could not be allocated because no properties were recorded on those days.</p>` : ''}

  <h2>Day by day</h2>
  ${dayBlocks || '<div class="empty">No mileage recorded for this month.</div>'}

  ${foot(meta.companyName)}
</body></html>`;
}

/** One-off cost sheet (sent to the accountant, receipt photo attached separately) */
export function buildCostHtml(
  costs: CostEntry[],
  meta: { companyName: string; senderName: string; title?: string },
): string {
  const total = costs.reduce((n, c) => n + (parseFloat(c.amount || '0') || 0), 0);
  const rows = costs.map((c) => `
    <tr>
      <td class="mono">${esc(c.date)}</td>
      <td class="b">${esc(c.label)}</td>
      <td class="addr">${esc(c.address || '—')}</td>
      <td>${esc(c.note || '—')}</td>
      <td class="r mono b">${money(parseFloat(c.amount || '0') || 0)}</td>
    </tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Costs</title><style>${SHEET}</style></head><body>
  ${head(meta.title || 'Costs & Expenses', `${costs.length} item${costs.length === 1 ? '' : 's'}${meta.senderName ? ` · ${meta.senderName}` : ''}`, meta.companyName, 'Accounts · Expenses')}
  <h2>Items</h2>
  <table>
    <thead><tr>
      <th style="width:13%">Date</th>
      <th style="width:24%">Item</th>
      <th style="width:26%">Property</th>
      <th style="width:23%">Notes</th>
      <th class="r" style="width:14%">Amount</th>
    </tr></thead>
    <tbody>${rows}
      <tr class="tot"><td colspan="4">Total</td><td class="r mono">${money(total)}</td></tr>
    </tbody>
  </table>
  <p class="note" style="margin-top:8px">Receipt photos are attached to this email where available.</p>
  ${foot(meta.companyName)}
</body></html>`;
}

/** Plain-text email body for a meter reading submission */
export function meterEmailBody(r: MeterReading, senderName: string): string {
  return [
    `Meter readings for ${r.address}`,
    `Date: ${dayLabel(r.date)}`,
    r.note ? `Notes: ${r.note}` : '',
    `Photos attached: ${r.photos.length}`,
    '',
    'Kind regards,',
    senderName || '',
  ].filter(Boolean).join('\n');
}
