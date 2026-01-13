import fetch from "node-fetch";

const TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ status: "Bot running" });
  }

  const update = req.body;

  if (update.message) {
    const chatId = update.message.chat.id;
    const text = update.message.text || "";

    let reply = "👋 Welcome to Dollar Kamai Bot";

    if (text === "/start") {
      reply = "💰 Dollar Kamai Bot চালু হয়েছে!\n\nরেফার করে আয় শুরু করুন 🚀";
    }

    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: reply
      })
    });
  }

  res.status(200).json({ ok: true });
}
