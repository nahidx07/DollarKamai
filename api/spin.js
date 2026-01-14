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
        if (action === 'PLACE_BET') {
            await db.runTransaction(async (t) => {
                const gameDoc = await t.get(gameRef);
                const userRef = db.collection('users').doc(userId);
                const userDoc = await t.get(userRef);

                if (!gameDoc.exists || gameDoc.data().status !== 'BETTING') throw new Error("Betting Closed");
                if (userDoc.data().balance < amount) throw new Error("Insufficient Balance");

                t.update(userRef, { balance: admin.firestore.FieldValue.increment(-amount) });
                t.update(gameRef, { [`bets.${betOn}`]: admin.firestore.FieldValue.increment(amount) });
            });
            return res.status(200).json({ success: true });
        }

        if (action === 'RESOLVE_GAME') {
            const result = await db.runTransaction(async (t) => {
                const doc = await t.get(gameRef);
                const data = doc.data();
                if (data.status !== 'BETTING') return data;

                const bets = data.bets || {};
                let bestMultiplier = 1;
                let minLoss = Infinity;

                // Profit Control Logic
                MULTIPLIERS.forEach(m => {
                    const payout = (bets[m] || 0) * m;
                    if (payout < minLoss) { minLoss = payout; bestMultiplier = m; }
                    else if (payout === minLoss && m < bestMultiplier) bestMultiplier = m;
                });

                // Update History (Last 20)
                let newHistory = data.history || [];
                newHistory.unshift(bestMultiplier); // Add new result to front
                if (newHistory.length > 20) newHistory.pop(); // Remove oldest

                t.update(gameRef, {
                    status: 'SPINNING',
                    winner: bestMultiplier,
                    history: newHistory, // Save History
                    nextRoundTime: Date.now() + 15000
                });

                return { winner: bestMultiplier };
            });
            return res.status(200).json(result);
        }

        if (action === 'RESET_GAME') {
            await gameRef.update({
                status: 'BETTING',
                bets: { 1:0, 2:0, 5:0, 10:0, 40:0 },
                winner: null,
                roundId: Date.now().toString()
            });
            return res.status(200).json({ success: true });
        }

    } catch (e) { return res.status(500).json({ error: e.message }); }
};
