const admin = require('firebase-admin');

// Firebase Init (Security Check)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();

const MULTIPLIERS = [1, 2, 5, 10, 40];

module.exports = async (req, res) => {
    const { action, userId, betOn, amount } = req.body;
    const gameRef = db.collection('gamestate').doc('live_round');

    try {
        // ১. বেট ধরার লজিক
        if (action === 'PLACE_BET') {
            await db.runTransaction(async (t) => {
                const gameDoc = await t.get(gameRef);
                const userRef = db.collection('users').doc(userId);
                const userDoc = await t.get(userRef);

                if (!gameDoc.exists || gameDoc.data().status !== 'BETTING') {
                    throw new Error("Betting Closed");
                }
                if (userDoc.data().balance < amount) {
                    throw new Error("Insufficient Balance");
                }

                // আপডেট: ইউজারের ব্যালেন্স কাটা এবং বেট যোগ করা
                t.update(userRef, { balance: admin.firestore.FieldValue.increment(-amount) });
                t.update(gameRef, {
                    [`bets.${betOn}`]: admin.firestore.FieldValue.increment(amount),
                    totalPool: admin.firestore.FieldValue.increment(amount)
                });
            });
            return res.status(200).json({ success: true });
        }

        // ২. রেজাল্ট বের করার লজিক (PROFIT CONTROL)
        // এটি ১০ সেকেন্ড পর ফ্রন্টএন্ড থেকে বা ক্রন জব থেকে কল হবে
        if (action === 'RESOLVE_GAME') {
            const result = await db.runTransaction(async (t) => {
                const doc = await t.get(gameRef);
                const data = doc.data();

                if (data.status !== 'BETTING') return data; // অলরেডি রেজাল্ট হয়ে গেছে

                const bets = data.bets || {};
                let bestMultiplier = 1;
                let minLoss = Infinity;

                // 🔥 RIGGED LOGIC: Check which multiplier has LOWEST payout
                MULTIPLIERS.forEach(m => {
                    const totalBetOnThis = bets[m] || 0;
                    const payout = totalBetOnThis * m; // যদি এখানে থামে, কত দিতে হবে?

                    // আমরা খুঁজছি মিনিমাম লস
                    if (payout < minLoss) {
                        minLoss = payout;
                        bestMultiplier = m;
                    } 
                    // যদি লস সমান হয়, তবে ছোট মাল্টিপ্লায়ার সেফ
                    else if (payout === minLoss) {
                        if (m < bestMultiplier) bestMultiplier = m;
                    }
                });

                // আপডেট: উইনার সেট করা এবং স্ট্যাটাস SPINNING দেওয়া
                t.update(gameRef, {
                    status: 'SPINNING',
                    winner: bestMultiplier,
                    nextRoundTime: Date.now() + 15000 // ১৫ সেকেন্ড পর আবার শুরু
                });

                // 💰 উইনারদের টাকা ফেরত দেওয়া (Payout)
                // (এখানে আলাদা ফাংশন বা লুপ চালিয়ে উইনারদের ব্যালেন্স বাড়াতে হবে)
                // সিম্পলিসিটির জন্য লজিক দেখানো হলো:
                // const winners = await db.collection('bets').where('roundId', '==', data.roundId).where('choice', '==', bestMultiplier).get();
                // winners.forEach(...) -> Update User Balance

                return { winner: bestMultiplier, minLoss };
            });

            return res.status(200).json(result);
        }

        // ৩. গেম রিসেট করা (নতুন রাউন্ড)
        if (action === 'RESET_GAME') {
            await gameRef.set({
                status: 'BETTING',
                bets: { 1:0, 2:0, 5:0, 10:0, 40:0 },
                totalPool: 0,
                winner: null,
                roundId: Date.now().toString()
            });
            return res.status(200).json({ success: true });
        }

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
