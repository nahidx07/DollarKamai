const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');

// Firebase & Bot Init
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();
const bot = new Telegraf(process.env.BOT_TOKEN);

module.exports = async (req, res) => {
    // Only allow POST request
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { message, btnText, btnLink } = req.body;

    if (!message) return res.status(400).json({ error: "Message content is missing" });

    try {
        // 1. Get all users from Firestore
        // Note: For huge userbase (>2000), you need pagination or background jobs.
        const snapshot = await db.collection('users').get();
        const userIds = snapshot.docs.map(doc => doc.id);

        let successCount = 0;
        let failCount = 0;

        // 2. Prepare Button (Optional)
        const extra = {};
        if (btnText && btnLink) {
            extra.reply_markup = {
                inline_keyboard: [[{ text: btnText, url: btnLink }]]
            };
        }

        // 3. Send Loop
        // We use a loop to send messages one by one
        const promises = userIds.map(async (id) => {
            try {
                await bot.telegram.sendMessage(id, message, extra);
                successCount++;
            } catch (error) {
                console.log(`Failed for ${id}: ${error.message}`);
                failCount++; // User might have blocked the bot
            }
        });

        await Promise.all(promises);

        return res.status(200).json({ 
            success: true, 
            sent: successCount, 
            failed: failCount,
            total: userIds.length 
        });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
