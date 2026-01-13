const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');

// 1. Initialize Firebase Admin (Securely)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}
const db = admin.firestore();

// 2. Initialize Bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// 3. Handle /start Command
bot.start(async (ctx) => {
  const user = ctx.from;
  const startPayload = ctx.startPayload || null; // রেফারেল আইডি (যার লিংকে জয়েন করেছে)
  
  const userId = user.id.toString();
  const userName = user.first_name + (user.last_name ? ` ${user.last_name}` : '');
  
  try {
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();

    // A. যদি নতুন ইউজার হয় -> একাউন্ট তৈরি করুন
    if (!userSnap.exists) {
      // ১. ডাটা সেভ করা
      await userRef.set({
        id: user.id,
        name: userName,
        username: user.username || '',
        balance: 0,
        joined: admin.firestore.FieldValue.serverTimestamp(),
        referredBy: startPayload,
        refCount: 0,
        refEarn: 0
      });

      // ২. রেফারেল বোনাস লজিক (যদি কারো লিংকে জয়েন করে)
      if (startPayload && startPayload !== userId) {
        // সেটিংস থেকে বোনাস এমাউন্ট আনা (Optional), ডিফল্ট ৩ টাকা
        const settingsRef = await db.collection('settings').doc('config').get();
        const bonus = settingsRef.exists ? (settingsRef.data().referBonus || 3) : 3;

        // রেফারারকে বোনাস দেওয়া
        const referrerRef = db.collection('users').doc(startPayload);
        await referrerRef.update({
            balance: admin.firestore.FieldValue.increment(bonus),
            refCount: admin.firestore.FieldValue.increment(1),
            refEarn: admin.firestore.FieldValue.increment(bonus)
        }).catch(err => console.log("Referrer not found"));
      }
    }

    // B. ওয়েলকাম মেসেজ পাঠানো
    const welcomeMsg = `
🎉 *স্বাগতম ${userName}!*

✅ আপনার একাউন্ট সফলভাবে তৈরি হয়েছে।

👤 *আপনার ডিটেইলস:*
🆔 আপনার আইডি: \`${userId}\`
🔗 রেফারড বাই: \`${startPayload ? startPayload : 'সরাসরি জয়েন'}\`

💸 ইনকাম করতে নিচের বাটনে ক্লিক করুন:
    `;

    // C. বাটন সহ রিপ্লাই
    await ctx.replyWithMarkdown(welcomeMsg, {
      reply_markup: {
        inline_keyboard: [
          [ { text: "💰 টাকা ইনকাম করুন (Open App)", web_app: { url: process.env.WEBAPP_URL } } ],
          [ { text: "📢 আমাদের চ্যানেল", url: "https://t.me/DollarKamai" } ]
        ]
      }
    });

  } catch (error) {
    console.error("Error:", error);
    ctx.reply("System Error! Please try again.");
  }
});

// Netlify Function Handler
exports.handler = async (event, context) => {
  try {
    if(event.httpMethod === 'POST') {
        await bot.handleUpdate(JSON.parse(event.body));
        return { statusCode: 200, body: 'OK' };
    }
    return { statusCode: 200, body: 'Bot is running' };
  } catch (e) {
    return { statusCode: 500, body: e.toString() };
  }
};
