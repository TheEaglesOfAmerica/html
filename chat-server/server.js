import 'dotenv/config';
import express from 'express';
import nodemailer from 'nodemailer';

const app = express();
const PORT = process.env.CHAT_PORT || 3001;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_KEY) {
  console.error('❌  OPENAI_API_KEY is missing. Add it to .env');
  process.exit(1);
}

app.use(express.json());

// ── System prompt with full site context ────────────────────────────
function buildSystemPrompt(liveStats) {
  let statsBlock = '';
  if (liveStats && typeof liveStats === 'object') {
    statsBlock = `\n\nLIVE GAME STATS (updated every 10 seconds on the site):\n`;
    for (const [game, data] of Object.entries(liveStats)) {
      if (typeof data === 'object' && data !== null) {
        statsBlock += `• ${game}: ${data.visits || 'N/A'} visits, ${data.playing || 'N/A'}\n`;
      } else {
        statsBlock += `• ${game}: ${data}\n`;
      }
    }
  }

  return `You are luminariaHQ AI, the friendly assistant for luminariaHQ — a premium Roblox game development studio based in Seattle, WA.
ABOUT THE STUDIO:
• Founded and led by essx/cascadiafalls
• Website: https://luminariahq.com
• Motto: "Dream It. Build It. Launch It."
• Specializes in crafting captivating Roblox experiences that reach millions of players worldwide

GAMES (Roblox):
1. The Highest Skydive Ever Obby — Obby / Adventure. Take the ultimate leap and skydive through thrilling obstacle courses. Universe ID: 6589241758
2. McRonald's Restaurant — Tycoon / Roleplay. Build and manage your own fast-food empire from the ground up. Universe ID: 6169297188
3. Shimmer Bay — Roleplay / Social. Explore a vibrant coastal town full of secrets and stories. Universe ID: 5914034409

CONTACT:
• General inquiries: hello@luminariahq.com

TESTIMONIAL:
• Joseph_D3v (developer): "Working with luminariaHQ has helped Shimmer Bay secure funding, and it felt like a collaboration, rather than a monopolization of creative decisions. Helped grow my project and we couldn't have done it without them."
${statsBlock}
GUIDELINES:
• Be concise, warm, and helpful. Use casual tone.
• ONLY talk about luminariaHQ, its games, services, and Roblox development. This is your sole purpose.
• If a user asks about anything unrelated to luminariaHQ or Roblox, politely decline and redirect: "I'm here to help with luminariaHQ and our Roblox projects! What would you like to know?"
• Do NOT answer general knowledge questions, do homework, write code, discuss other games/companies, or engage in off-topic conversations.
• If asked about pricing or specifics you don't know, direct them to hello@luminariahq.com
• You can use emojis sparingly to match the site's vibe.
• Keep responses SHORT — 1-3 sentences when possible, unless the user asks for detail.`;
}

// ── Contact form endpoint ───────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: 'localhost',
  port: 25,
  secure: false,
  tls: { rejectUnauthorized: false }
});

async function generateSubject(name, message) {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5-nano',
        messages: [
          { role: 'system', content: 'Generate a short, professional email subject line (max 8 words) for a business inquiry. Return ONLY the subject line, no quotes or extra text.' },
          { role: 'user', content: `From: ${name}\nMessage: ${message}` }
        ],
        max_completion_tokens: 2048,
        temperature: 1,
      })
    });
    if (res.ok) {
      const data = await res.json();
      const subject = data.choices?.[0]?.message?.content?.trim();
      console.log('Generated subject:', subject, '| reasoning_tokens:', data.usage?.completion_tokens_details?.reasoning_tokens);
      if (subject) return subject;
    } else {
      const errText = await res.text();
      console.error('Subject API error:', res.status, errText);
    }
  } catch (err) {
    console.error('Subject generation error:', err);
  }
  return `New inquiry from ${name}`;
}

app.post('/api/contact/review', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const reviewRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5-nano',
        messages: [
          { role: 'system', content: `You are a helpful assistant reviewing a contact form submission for luminariaHQ, a Roblox game development studio. Analyze the message and provide brief, friendly feedback (2-4 sentences max). If anything is vague or missing, suggest what they could clarify. If the message is clear and complete, say so positively. Do NOT refuse or block any message. Format: start with a quick assessment, then any suggestions. Keep it casual and helpful. Do not use markdown formatting.` },
          { role: 'user', content: `Name: ${name}\nEmail: ${email}\nMessage: ${message}` }
        ],
        max_completion_tokens: 2048,
        temperature: 1
      })
    });
    if (reviewRes.ok) {
      const data = await reviewRes.json();
      const feedback = data.choices?.[0]?.message?.content?.trim();
      if (feedback) return res.json({ feedback });
    }
    res.json({ feedback: 'Your message looks good to go!' });
  } catch (err) {
    console.error('Review error:', err);
    res.json({ feedback: 'Your message looks good to go!' });
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const subject = await generateSubject(name, message);
    // Send to luminariaHQ
    await transporter.sendMail({
      from: `"${name}" <noreply@luminariahq.com>`,
      replyTo: email,
      to: 'hello@luminariahq.com',
      subject,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#050505;font-family:system-ui,-apple-system,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#050505;padding:40px 20px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;"><tr><td style="padding:24px 32px;background:#0d0d0d;border-radius:16px 16px 0 0;border-bottom:2px solid;border-image:linear-gradient(90deg,#6366f1,#10b981,#6366f1) 1;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><span style="font-size:20px;font-weight:700;color:#fff;">luminaria</span><span style="font-size:20px;font-weight:700;color:#999;">HQ</span></td><td align="right"><span style="font-size:12px;color:#555;letter-spacing:0.05em;text-transform:uppercase;">New Inquiry</span></td></tr></table></td></tr><tr><td style="padding:32px;background:#0a0a0a;"><p style="color:#999;font-size:13px;margin:0 0 20px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Contact Details</p><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:20px;margin-bottom:24px;"><tr><td style="padding:8px 20px;"><p style="color:#666;font-size:12px;margin:0;text-transform:uppercase;letter-spacing:0.05em;">Name</p><p style="color:#fff;font-size:15px;margin:4px 0 0;font-weight:500;">${name}</p></td></tr><tr><td style="padding:8px 20px;"><p style="color:#666;font-size:12px;margin:0;text-transform:uppercase;letter-spacing:0.05em;">Email</p><p style="margin:4px 0 0;"><a href="mailto:${email}" style="color:#6366f1;font-size:15px;text-decoration:none;font-weight:500;">${email}</a></p></td></tr></table><p style="color:#999;font-size:13px;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Message</p><div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:20px;"><p style="color:#e0e0e0;font-size:14px;line-height:1.7;margin:0;">${message.replace(/\n/g, '<br>')}</p></div></td></tr><tr><td style="padding:20px 32px;background:#0d0d0d;border-radius:0 0 16px 16px;text-align:center;"><a href="mailto:${email}" style="display:inline-block;padding:10px 28px;background:#6366f1;color:#fff;text-decoration:none;border-radius:100px;font-size:13px;font-weight:600;">Reply to ${name} →</a></td></tr></table></td></tr></table></body></html>`
    });
    // Send confirmation to the user
    await transporter.sendMail({
      from: '"luminariaHQ" <noreply@luminariahq.com>',
      to: email,
      subject: `We got your message — ${subject}`,
      text: `Hey ${name},\n\nThanks for reaching out to luminariaHQ! We received your message and will get back to you soon.\n\nHere's a copy of what you sent:\n\n${message}\n\n— The luminariaHQ Team\nhttps://luminariahq.com`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#050505;font-family:system-ui,-apple-system,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#050505;padding:40px 20px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;"><tr><td style="padding:24px 32px;background:#0d0d0d;border-radius:16px 16px 0 0;border-bottom:2px solid;border-image:linear-gradient(90deg,#6366f1,#10b981,#6366f1) 1;"><span style="font-size:20px;font-weight:700;color:#fff;">luminaria</span><span style="font-size:20px;font-weight:700;color:#999;">HQ</span></td></tr><tr><td style="padding:40px 32px 32px;background:#0a0a0a;"><h1 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 8px;line-height:1.3;">Hey ${name}! ✨</h1><p style="color:#999;font-size:15px;line-height:1.6;margin:0 0 28px;">Thanks for reaching out. We've received your message and our team will get back to you shortly.</p><p style="color:#999;font-size:13px;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Your message</p><div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:20px;margin-bottom:28px;"><p style="color:#e0e0e0;font-size:14px;line-height:1.7;margin:0;">${message.replace(/\n/g, '<br>')}</p></div><p style="color:#666;font-size:13px;line-height:1.6;margin:0;">In the meantime, feel free to explore our work at <a href="https://luminariahq.com" style="color:#6366f1;text-decoration:none;font-weight:500;">luminariahq.com</a></p></td></tr><tr><td style="padding:20px 32px;background:#0d0d0d;border-radius:0 0 16px 16px;border-top:1px solid rgba(255,255,255,0.06);"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><span style="color:#444;font-size:12px;">© 2026 luminariaHQ · Seattle, WA</span></td><td align="right"><a href="https://luminariahq.com" style="color:#555;font-size:12px;text-decoration:none;">luminariahq.com</a></td></tr></table></td></tr></table></td></tr></table></body></html>`
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ── Chat endpoint (streaming) ───────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { messages = [], liveStats } = req.body;

    const systemPrompt = buildSystemPrompt(liveStats);

    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-20) // keep last 20 messages for context window
    ];

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5-nano',
        messages: openaiMessages,
        stream: true,
        max_completion_tokens: 2048,
        temperature: 1
      })
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('OpenAI error:', openaiRes.status, errText);
      return res.status(502).json({ error: 'OpenAI API error' });
    }

    // Stream SSE back to client with content filtering
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = openaiRes.body.getReader();
    const decoder = new TextDecoder();
    const nameRegex = /Pavel/gi;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      let chunk = decoder.decode(value, { stream: true });
      // Blanket replace the name anywhere it appears in raw SSE text
      chunk = chunk.replace(nameRegex, 'essx');
      // Also scrub common patterns the model uses to reveal it
      chunk = chunk.replace(/also known as/gi, '');
      chunk = chunk.replace(/real name/gi, 'online handle');
      res.write(chunk);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Chat error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`✨ luminariaHQ chat server running on port ${PORT}`);
});
