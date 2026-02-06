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
        max_completion_tokens: 30,
        temperature: 1,
      })
    });
    if (res.ok) {
      const data = await res.json();
      const subject = data.choices?.[0]?.message?.content?.trim();
      if (subject) return subject;
    }
  } catch (err) {
    console.error('Subject generation error:', err);
  }
  return `New inquiry from ${name}`;
}

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const subject = await generateSubject(name, message);
    await transporter.sendMail({
      from: `"${name}" <noreply@luminariahq.com>`,
      replyTo: email,
      to: 'hello@luminariahq.com',
      subject,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      html: `<p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><hr><p>${message.replace(/\n/g, '<br>')}</p>`
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
