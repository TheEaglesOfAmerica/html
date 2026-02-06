import 'dotenv/config';
import express from 'express';

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

  return `You are Luminary AI, the friendly assistant for Luminary Ventures — a premium Roblox game development studio based in Seattle, WA.

ABOUT THE STUDIO:
• Founded and led by essx (also known as Pavel)
• Website: https://luminary.spunnie.com
• Motto: "Dream It. Build It. Launch It."
• Specializes in crafting captivating Roblox experiences that reach millions of players worldwide

GAMES (Roblox):
1. The Highest Skydive Ever Obby — Obby / Adventure. Take the ultimate leap and skydive through thrilling obstacle courses. Universe ID: 6589241758
2. McRonald's Restaurant — Tycoon / Roleplay. Build and manage your own fast-food empire from the ground up. Universe ID: 6169297188
3. Shimmer Bay — Roleplay / Social. Explore a vibrant coastal town full of secrets and stories. Universe ID: 5914034409

CONTACT:
• General inquiries: hello@luminaryventures.com
• Project proposals: projects@luminaryventures.com

TESTIMONIAL:
• Joseph_D3v (developer): "Working with essx through Luminary has helped Shimmer Bay secure funding, and it felt like a collaboration, rather than a monopolization of creative decisions. Helped grow my project and we couldn't have done it without them."
${statsBlock}
GUIDELINES:
• Be concise, warm, and helpful. Use casual tone.
• If asked about pricing or specifics you don't know, direct them to hello@luminaryventures.com
• If asked something unrelated to Luminary or Roblox development, you can still be helpful but gently steer back.
• You can use emojis sparingly to match the site's vibe.
• Keep responses SHORT — 1-3 sentences when possible, unless the user asks for detail.`;
}

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
        model: 'gpt-5-mini',
        messages: openaiMessages,
        stream: true,
        max_output_tokens: 512,
        temperature: 1
      })
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('OpenAI error:', openaiRes.status, errText);
      return res.status(502).json({ error: 'OpenAI API error' });
    }

    // Stream SSE back to client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = openaiRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
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
  console.log(`✨ Luminary chat server running on port ${PORT}`);
});
