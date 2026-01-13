const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');

// Firebase Admin Setup
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}
const db = admin.firestore();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Bot Logic
bot.start(async (ctx) => {
  const u = ctx.from;
  const refId = ctx.startPayload;
  const uid = u.id.toString();

  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      id: u.id,
      name: u.first_name,
      balance: 0,
      refCount: 0,
      refEarn: 0,
      joined: admin.firestore.FieldValue.serverTimestamp()
    });

    if (refId && refId !== uid) {
      await db.collection('users').doc(refId).update({
        balance: admin.firestore.FieldValue.increment(3),
        refCount: admin.firestore.FieldValue.increment(1),
        refEarn: admin.firestore.FieldValue.increment(3)
      }).catch(e=>{});
    }
  }

  ctx.reply(`🎉 *Welcome ${u.first_name}!*

✅ Account Created Successfully.
🆔 ID: \`${u.id}\`

👇 Click below to start earning:`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: "💰 Open App", web_app: { url: process.env.WEBAPP_URL } }]]
    }
  });
});

// Vercel Serverless Function Handler
module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } else {
            res.status(200).send('Bot is running on Vercel!');
        }
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
};
