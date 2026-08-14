import { Platform, Linking } from 'react-native';
import { GroupedViewing } from './grouping';
import { ViewingAttendee, ReportSettings, LinkedApplicantRef } from './types';

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
}

const OUTCOME_TONE: Record<string, string> = {
  'Good': 'ok',
  'Very Good': 'best',
  'Not Good': 'bad',
  'Needs LL Ref': 'warn',
  'Needs Check': 'info',
};

function outcomePill(status: string): string {
  if (!status) return '<span class="dash">Not recorded</span>';
  const tone = OUTCOME_TONE[status] || 'plain';
  return `<span class="pill ${tone}">${esc(status)}</span>`;
}

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '–';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export interface ReportViewing {
  group: GroupedViewing;
  attendees: ViewingAttendee[];
  /** Applicants linked on the schedule board who said they would attend */
  expected?: LinkedApplicantRef[];
  /** Expected applicants who did not attend, with contact details where known */
  noShows?: { id: string; name: string; email?: string; mobile?: string; group?: string }[];
  /** Task status written back to the schedule board */
  status?: string;
}

export function buildReportHtml(
  date: string,
  viewings: ReportViewing[],
  settings: ReportSettings,
): string {
  const dateFriendly = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const totalViewings = viewings.length;
  const totalAttendees = viewings.reduce((n, v) => n + v.attendees.length, 0);
  const totalExpected = viewings.reduce((n, v) => n + (v.expected?.length || 0), 0);
  const allNoShows = viewings.flatMap((v) =>
    (v.noShows || []).map((p) => ({ ...p, address: v.group.display, time: v.group.time })));
  const attendedOfExpected = Math.max(0, Math.min(totalExpected, totalExpected - allNoShows.length));
  const attendRate = totalExpected > 0 ? Math.round(attendedOfExpected / totalExpected * 100) : null;

  const sections = viewings.map(({ group, attendees, expected, noShows, status }, i) => {
    const rows = attendees.length
      ? attendees.map((a) => `
        <tr>
          <td class="c-name">
            <span class="nm">${esc(a.name)}</span>${a.isSubitem ? '<span class="tagjoint">Joint</span>' : ''}
            ${a.group ? `<span class="grp">${esc(a.group)}</span>` : ''}
          </td>
          <td class="c-contact mono">
            ${a.mobile ? `<span class="ct">${esc(a.mobile)}</span>` : ''}
            ${a.email ? `<span class="ct">${esc(a.email)}</span>` : ''}
            ${!a.mobile && !a.email ? '<span class="dash">No contact details</span>' : ''}
          </td>
          <td class="c-out">${outcomePill(a.status)}</td>
          <td class="c-note">${a.note ? esc(a.note) : '<span class="dash">—</span>'}</td>
        </tr>`).join('')
      : '<tr><td class="nonerow" colspan="4">No applicants attended this viewing.</td></tr>';

    const missedRows = (noShows || []).map((p) => `
      <tr class="miss">
        <td class="c-name"><span class="nm">${esc(p.name)}</span>${p.group ? `<span class="grp">${esc(p.group)}</span>` : ''}</td>
        <td class="c-contact mono">
          ${p.mobile ? `<span class="ct">${esc(p.mobile)}</span>` : ''}
          ${p.email ? `<span class="ct">${esc(p.email)}</span>` : ''}
          ${!p.mobile && !p.email ? '<span class="dash">No contact details</span>' : ''}
        </td>
        <td class="c-out"><span class="pill miss">Did not attend</span></td>
        <td class="c-note"><span class="dash">—</span></td>
      </tr>`).join('');

    const statusClass = status
      ? (/complete/i.test(status) ? 'ok' : /no\s*show/i.test(status) ? 'bad' : 'warn')
      : '';

    return `
      <section class="viewing">
        <div class="vbar">
          <span class="vtime">${esc(group.time || '--:--')}</span>
          <span class="vaddr">${esc(group.display)}</span>
          <span class="vmeta">${expected?.length ? `${expected.length} expected &middot; ` : ''}${attendees.length} seen${group.items.length > 1 ? ` &middot; ${group.items.length} units` : ''}</span>
          ${status ? `<span class="vstatus ${statusClass}">${esc(status)}</span>` : `<span class="vstatus idx">Viewing ${i + 1}/${totalViewings}</span>`}
        </div>
        <table class="pt">
          <thead><tr>
            <th class="c-name">Applicant</th>
            <th class="c-contact">Contact details</th>
            <th class="c-out">Outcome</th>
            <th class="c-note">Viewing notes</th>
          </tr></thead>
          <tbody>${rows}${missedRows}</tbody>
        </table>
      </section>`;
  }).join('');

  const noShowTable = allNoShows.length ? `
    <section class="block">
      <h2 class="blockh">Follow-up &mdash; did not attend (${allNoShows.length})</h2>
      <table class="ns">
        <thead><tr><th>Applicant</th><th>Mobile</th><th>Email</th><th>Viewing</th></tr></thead>
        <tbody>
          ${allNoShows.map((p) => `
            <tr>
              <td class="nsname">${esc(p.name)}${p.group ? `<span class="nsgroup">${esc(p.group)}</span>` : ''}</td>
              <td class="mono">${esc(p.mobile || '—')}</td>
              <td class="mono">${esc(p.email || '—')}</td>
              <td class="nsaddr">${esc(p.time || '')} ${esc(p.address)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </section>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"><title>Daily Viewings Report</title><style>
  @page { margin: 13mm 12mm; }
  * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body {
    font-family: ui-sans-serif, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color:#111A24; font-size:10.6px; line-height:1.42; background:#fff;
  }
  .mono { font-variant-numeric: tabular-nums; }
  .dash { color:#B4BEC9; }

  /* ---- Masthead ---- */
  .top { display:flex; justify-content:space-between; align-items:flex-end; padding-bottom:10px; border-bottom:2px solid #1E2B3A; }
  .brand { display:flex; align-items:center; gap:9px; }
  .logo { width:22px; height:22px; border-radius:6px; background:#E86A17; position:relative; flex:none; }
  .logo:after { content:''; position:absolute; left:6px; top:8px; width:7px; height:3.5px; border-left:2px solid #fff; border-bottom:2px solid #fff; transform:rotate(-45deg); }
  .bname { font-size:11px; font-weight:700; letter-spacing:0.2px; }
  .bsub { font-size:8.4px; color:#7A8794; letter-spacing:0.9px; text-transform:uppercase; margin-top:1px; }
  .tright { text-align:right; }
  h1 { font-size:19px; font-weight:750; letter-spacing:-0.45px; line-height:1.1; }
  .date { font-size:10px; color:#5B6876; margin-top:2px; }

  /* ---- Summary strip ---- */
  .kpis { display:flex; gap:7px; margin:10px 0 0; }
  .kpi { flex:1; border:1px solid #E6EAEF; border-radius:7px; padding:7px 10px; }
  .kpi b { font-size:16.5px; font-weight:750; letter-spacing:-0.5px; display:block; line-height:1.1; }
  .kpi span { font-size:8px; color:#7A8794; text-transform:uppercase; letter-spacing:0.8px; font-weight:600; }
  .kpi.hl { background:#FDF4EC; border-color:#F6D6BB; }
  .kpi.hl b { color:#C8560D; }

  /* ---- Viewing blocks ---- */
  .viewing { margin-top:11px; border:1px solid #E1E6EC; border-radius:8px; overflow:hidden; page-break-inside:avoid; break-inside:avoid; }
  .vbar { display:flex; align-items:center; gap:9px; background:#1E2B3A; color:#fff; padding:6.5px 11px; }
  .vtime { font-size:12px; font-weight:750; letter-spacing:-0.2px; font-variant-numeric:tabular-nums; background:#E86A17; color:#fff; padding:2px 8px; border-radius:99px; flex:none; }
  .vaddr { font-size:11.6px; font-weight:650; letter-spacing:-0.1px; flex:1; min-width:0; }
  .vmeta { font-size:8.6px; text-transform:uppercase; letter-spacing:0.8px; color:#A9B6C6; font-weight:600; flex:none; }
  .vstatus { font-size:8.6px; font-weight:700; padding:2.5px 8px; border-radius:99px; letter-spacing:0.4px; flex:none; text-transform:uppercase; }
  .vstatus.ok { background:#D8F0E3; color:#0F5A34; }
  .vstatus.bad { background:#FBDCDC; color:#A22F2F; }
  .vstatus.warn { background:#FBE7C4; color:#7C5010; }
  .vstatus.idx { background:rgba(255,255,255,0.14); color:#C9D4E1; }

  /* ---- 4-column applicant table ---- */
  table.pt { width:100%; border-collapse:collapse; table-layout:fixed; }
  table.pt th { text-align:left; font-size:7.9px; text-transform:uppercase; letter-spacing:0.85px; color:#7A8794; font-weight:700; padding:5px 10px; background:#F5F7FA; border-bottom:1px solid #E1E6EC; }
  table.pt td { padding:6.5px 10px; border-bottom:1px solid #F0F3F6; vertical-align:top; }
  table.pt tr:last-child td { border-bottom:none; }
  th.c-name, td.c-name { width:23%; }
  th.c-contact, td.c-contact { width:23%; }
  th.c-out, td.c-out { width:15%; }
  th.c-note, td.c-note { width:39%; }
  .nm { font-size:11px; font-weight:650; }
  .grp { display:block; font-size:8.4px; color:#7A8794; font-weight:600; margin-top:1px; }
  .tagjoint { font-size:7.6px; font-weight:700; color:#1F4FB8; background:#EAF0FD; padding:1px 5px; border-radius:99px; margin-left:5px; letter-spacing:0.4px; text-transform:uppercase; vertical-align:1.5px; }
  .ct { display:block; font-size:9.7px; color:#5B6876; line-height:1.4; word-break:break-word; }
  td.c-note { font-size:10px; color:#37424F; line-height:1.45; }
  .pill { display:inline-block; font-size:8.7px; font-weight:700; padding:2.5px 8px; border-radius:99px; white-space:nowrap; }
  .pill.best { background:#D8F0E3; color:#0F5A34; }
  .pill.ok   { background:#E7F5EE; color:#177A4E; }
  .pill.bad  { background:#FCEDED; color:#B33737; }
  .pill.warn { background:#FDF3E0; color:#8F5E12; }
  .pill.info { background:#EAF0FD; color:#1F4FB8; }
  .pill.plain{ background:#F0F3F6; color:#59677A; }
  .pill.miss { background:#FCFAF8; color:#9A6B3C; border:1px solid #F0E4D8; }
  tr.miss td { background:#FDFBF9; }
  td.nonerow { font-size:10px; color:#98A3B0; }

  /* ---- Follow-up table ---- */
  .block { margin-top:15px; page-break-inside:avoid; }
  .blockh { font-size:12.5px; font-weight:700; letter-spacing:-0.2px; margin-bottom:6px; }
  table.ns { width:100%; border-collapse:collapse; border:1px solid #E1E6EC; border-radius:8px; overflow:hidden; table-layout:fixed; }
  table.ns th { text-align:left; font-size:7.9px; text-transform:uppercase; letter-spacing:0.85px; color:#7A8794; font-weight:700; padding:5.5px 10px; background:#F5F7FA; border-bottom:1px solid #E1E6EC; }
  table.ns td { padding:6px 10px; border-bottom:1px solid #F0F3F6; font-size:10px; vertical-align:top; word-break:break-word; }
  table.ns tr:last-child td { border-bottom:none; }
  .nsname { font-weight:650; }
  .nsgroup { display:block; font-size:8.2px; color:#7A8794; font-weight:500; margin-top:1px; }
  .nsaddr { color:#5B6876; font-size:9.6px; }

  .foot { margin-top:14px; padding-top:7px; border-top:1px solid #E6EAEF; display:flex; justify-content:space-between; color:#A3AEBA; font-size:8.6px; }
  .empty { color:#98A3B0; font-size:10.5px; margin-top:14px; padding:18px; border:1px dashed #DDE3EA; border-radius:8px; text-align:center; }
</style></head><body>

  <div class="top">
    <div class="brand">
      <div class="logo"></div>
      <div>
        <div class="bname">${esc(settings.companyName || 'Property Companion')}</div>
        <div class="bsub">Lettings &middot; Viewings</div>
      </div>
    </div>
    <div class="tright">
      <h1>Daily Viewings Report</h1>
      <div class="date">${esc(dateFriendly)}${settings.senderName ? ` &middot; ${esc(settings.senderName)}` : ''}</div>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><b>${totalViewings}</b><span>Viewings</span></div>
    <div class="kpi"><b>${totalAttendees}</b><span>Applicants seen</span></div>
    ${totalExpected > 0 ? `<div class="kpi"><b>${totalExpected}</b><span>Expected</span></div>` : ''}
    ${allNoShows.length > 0 ? `<div class="kpi hl"><b>${allNoShows.length}</b><span>Did not attend</span></div>` : ''}
    ${attendRate !== null ? `<div class="kpi"><b>${attendRate}%</b><span>Attendance</span></div>` : ''}
  </div>

  ${sections || '<div class="empty">No viewings were recorded for this date.</div>'}
  ${noShowTable}

  <div class="foot">
    <span>${esc(settings.companyName || 'Property Companion')} &middot; Generated by Property Companion</span>
    <span>${esc(new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span>
  </div>
</body></html>`;
}

// Generate the PDF and return a file path (native) or trigger print (web).
export async function generatePdf(html: string, filename: string): Promise<{ uri?: string; webPrinted?: boolean }> {
  if (Platform.OS === 'web') {
    // Web: open a hidden iframe with the styled document and call print (user can "Save as PDF")
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 60_000);
      }, 250);
    }
    return { webPrinted: true };
  }
  const Print = await import('expo-print');
  const result = await Print.printToFileAsync({ html, base64: false });
  return { uri: result.uri };
}

export async function sharePdf(uri: string): Promise<void> {
  const Sharing = await import('expo-sharing');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share report' });
  }
}

export function splitEmails(list: string): string[] {
  return (list || '').split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e.includes('@'));
}

export interface MailOptions {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  /** File URIs to attach (PDFs, photos). Native only. */
  attachments?: string[];
}

/**
 * Opens the phone's own email app with everything pre-filled — recipients,
 * subject, body and attachments — so the message is sent from the user's own
 * email address. On web (or if no mail app is set up) it falls back to a mailto
 * link, which cannot carry attachments.
 */
export async function sendMail(opts: MailOptions): Promise<'composer' | 'mailto'> {
  const to = splitEmails(opts.to);
  const cc = splitEmails(opts.cc || '');
  const files = (opts.attachments || []).filter(Boolean);

  if (Platform.OS !== 'web') {
    try {
      const MailComposer = await import('expo-mail-composer');
      if (await MailComposer.isAvailableAsync()) {
        await MailComposer.composeAsync({
          recipients: to,
          ccRecipients: cc.length ? cc : undefined,
          subject: opts.subject,
          body: opts.body,
          attachments: files,
        });
        return 'composer';
      }
    } catch {
      // fall through to mailto
    }
  }
  const q = [
    cc.length ? `cc=${encodeURIComponent(cc.join(','))}` : '',
    `subject=${encodeURIComponent(opts.subject)}`,
    `body=${encodeURIComponent(opts.body)}`,
  ].filter(Boolean).join('&');
  await Linking.openURL(`mailto:${encodeURIComponent(to.join(','))}?${q}`);
  return 'mailto';
}

// Kept for the daily viewings report (single attachment).
export async function emailReport(opts: { to: string; cc?: string; subject: string; body: string; attachmentUri?: string }): Promise<'sent-composer' | 'mailto'> {
  const how = await sendMail({
    to: opts.to,
    cc: opts.cc,
    subject: opts.subject,
    body: opts.body,
    attachments: opts.attachmentUri ? [opts.attachmentUri] : [],
  });
  return how === 'composer' ? 'sent-composer' : 'mailto';
}
