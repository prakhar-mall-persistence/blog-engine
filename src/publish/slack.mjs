// Slack approval gate. Posts a Block Kit card for a drafted post with Approve /
// Reject buttons. The button callback is owned by n8n (Slack interactivity →
// n8n webhook → publish). Dry-run prints the payload.
//
//   SLACK_BOT_TOKEN + SLACK_CHANNEL  → chat.postMessage (interactive buttons)
//   SLACK_WEBHOOK_URL                → incoming webhook (card only, no buttons)

export function approvalBlocks(post, { previewUrl } = {}) {
  const line = `*${post.category}* · ${post.tag} · ${post.readTime}`;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '📝 New blog draft ready for review' } },
    { type: 'section', text: { type: 'mrkdwn', text: `*${post.title}*\n${post.description}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${line} · slug \`${post.slug}\`` }] },
  ];
  if (post.keyTakeaways?.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*Key takeaways*\n' + post.keyTakeaways.map((t) => `• ${t}`).join('\n') } });
  }
  blocks.push({
    type: 'actions',
    elements: [
      { type: 'button', style: 'primary', text: { type: 'plain_text', text: '✅ Approve & publish' }, value: post.slug, action_id: 'approve_post' },
      { type: 'button', style: 'danger', text: { type: 'plain_text', text: '✕ Reject' }, value: post.slug, action_id: 'reject_post' },
      ...(previewUrl ? [{ type: 'button', text: { type: 'plain_text', text: 'Open preview' }, url: previewUrl }] : []),
    ],
  });
  return blocks;
}

export async function requestApproval(post, { previewUrl, mode = 'dry', log = console.log } = {}) {
  const blocks = approvalBlocks(post, { previewUrl });
  if (mode === 'dry' || (!process.env.SLACK_BOT_TOKEN && !process.env.SLACK_WEBHOOK_URL)) {
    log('🔔  [dry] Slack approval card (set SLACK_BOT_TOKEN+SLACK_CHANNEL or SLACK_WEBHOOK_URL to send):');
    log(JSON.stringify(blocks, null, 2));
    return { mode: 'dry', blocks };
  }
  if (process.env.SLACK_BOT_TOKEN) {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: process.env.SLACK_CHANNEL, blocks, text: `New blog draft: ${post.title}` }),
    }).then((r) => r.json());
    if (!res.ok) throw new Error(`slack: ${res.error}`);
    log(`🔔  Posted approval card to ${process.env.SLACK_CHANNEL} (ts ${res.ts})`);
    return { mode: 'live', ts: res.ts, channel: res.channel };
  }
  // Webhook fallback (no buttons — links only).
  await fetch(process.env.SLACK_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blocks }) });
  log('🔔  Posted approval card via webhook (no interactive buttons on this path).');
  return { mode: 'live-webhook' };
}
