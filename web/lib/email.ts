import { Resend } from 'resend';

/**
 * Transactional mail through Resend. Without RESEND_API_KEY (local
 * development) the message is printed to the server console instead.
 */
async function send(to: string[], subject: string, html: string) {
  if (to.length === 0) return;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mail] to=${to.join(',')} subject=${subject}\n${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')}`);
    const link = html.match(/href="([^"]+)"/);
    if (link) console.log(`[mail] link: ${link[1].replace(/&amp;/g, '&')}`);
    return;
  }
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'noreply@example.com',
    to,
    subject,
    html,
  });
  if (error) console.error('[mail] failed', error);
}

const appUrl = () => process.env.APP_URL || 'http://localhost:3000';

const shell = (title: string, body: string, cta?: { href: string; label: string }) => `
<div style="font-family:Pretendard,'Malgun Gothic',sans-serif;background:#05070f;color:#f5f6fa;padding:32px">
  <div style="max-width:520px;margin:0 auto;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:28px;background:#0a0d1a">
    <p style="margin:0 0 6px;font-size:12px;color:#38bdf8;font-weight:700;letter-spacing:.08em">CREVERSE · LEARNING STATS</p>
    <h1 style="margin:0 0 16px;font-size:20px">${title}</h1>
    <div style="font-size:14px;line-height:1.7;color:rgba(255,255,255,.8)">${body}</div>
    ${cta ? `<a href="${cta.href}" style="display:inline-block;margin-top:20px;background:#fff;color:#05070f;border-radius:999px;padding:12px 22px;font-weight:700;text-decoration:none">${cta.label}</a>` : ''}
  </div>
</div>`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function sendSignupNotice(adminEmails: string[], who: { email: string; name: string; team: string }) {
  await send(
    adminEmails,
    `[Learning Stats] 가입 승인 요청: ${who.name || who.email}`,
    shell(
      '새 가입 신청이 있습니다',
      `${esc(who.name)} (${esc(who.email)})${who.team ? ` · ${esc(who.team)}` : ''}님이 가입을 신청했습니다.<br/>관리 &gt; 계정에서 승인하거나 거절해 주세요.`,
      { href: `${appUrl()}/admin#users`, label: '승인하러 가기' }
    )
  );
}

export async function sendApprovedNotice(email: string) {
  await send(
    [email],
    '[Learning Stats] 가입이 승인되었습니다',
    shell('가입이 승인되었습니다', '이제 가입할 때 정한 비밀번호로 로그인할 수 있습니다.', { href: `${appUrl()}/login`, label: '로그인' })
  );
}

export async function sendPasswordResetEmail(email: string, token: string, expires: Date) {
  const href = `${appUrl()}/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  await send(
    [email],
    '[Learning Stats] 비밀번호 설정',
    shell(
      '비밀번호 설정',
      `아래 버튼으로 새 비밀번호를 정하세요. 링크는 ${expires.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}까지 한 번만 쓸 수 있습니다.<br/>요청하지 않았다면 이 메일은 무시하세요.`,
      { href, label: '비밀번호 정하기' }
    )
  );
}
