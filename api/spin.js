const admin = require('firebase-admin');

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
        // ১. গেম রিসেট বা ইনিশিয়াল সেটআপ
        if (action === 'RESET_GAME' || action === 'INIT_GAME') {
            await gameRef.set({
                status: 'BETTING',
                bets: { 1:0, 2:0, 5:0, 10:0, 40:0 },
                winner: null,
                history: (await gameRef.get()).data()?.history || [],
                nextRoundTime: Date.now() + 15000 // ১৫ সেকেন্ড সময় বেটিংয়ের জন্য
            }, { merge: true });
            return res.status(200).json({ success: true, message: "Game Started" });
        }

        // ২. বেট প্লেস করা
        if (action === 'PLACE_BET') {
            await db.runTransaction(async (t) => {
                const gameDoc = await t.get(gameRef);
                const userRef = db.collection('users').doc(userId);
                const userDoc = await t.get(userRef);

                if (!gameDoc.exists) throw new Error("Game not initialized");
                if (gameDoc.data().status !== 'BETTING') throw new Error("বেটিং সময় শেষ!");
                if (!userDoc.exists || userDoc.data().balance < amount) throw new Error("ব্যালেন্স নেই!");

                t.update(userRef, { balance: admin.firestore.FieldValue.increment(-amount) });
                t.update(gameRef, { [`bets.${betOn}`]: admin.firestore.FieldValue.increment(amount) });
            });
            return res.status(200).json({ success: true });
        }

        // ৩. রেজাল্ট বের করা (Profit Control)
        if (action === 'RESOLVE_GAME') {
            const result = await db.runTransaction(async (t) => {
                const doc = await t.get(gameRef);
                if (!doc.exists) return null;
                const data = doc.data();
                
                // যদি অলরেডি স্পিনিং হয়, তবে নতুন করে রেজাল্ট দিব না
                if (data.status !== 'BETTING') return { winner: data.winner, alreadyDone: true };

                const bets = data.bets || {};
                let bestMultiplier = 1;
                let minLoss = Infinity;

                // লস ক্যালকুলেশন
                MULTIPLIERS.forEach(m => {
                    const payout = (bets[m] || 0) * m;
                    if (payout < minLoss) { minLoss = payout; bestMultiplier = m; }
                    else if (payout === minLoss && m < bestMultiplier) bestMultiplier = m;
                });

                // হিস্টোরি আপডেট
                let newHistory = data.history || [];
                newHistory.unshift(bestMultiplier);
                if (newHistory.length > 20) newHistory.pop();

                t.update(gameRef, {
                    status: 'SPINNING',
                    winner: bestMultiplier,
                    history: newHistory
                });

                return { winner: bestMultiplier };
            });
            return res.status(200).json(result);
        }

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
