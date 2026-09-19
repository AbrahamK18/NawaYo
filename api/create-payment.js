const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Missing session token' });
    return;
  }

  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData || !userData.user) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }
  const user = userData.user;

  try {
    const origin = `https://${req.headers.host}`;
    const response = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: 5.99,
        price_currency: 'usd',
        order_id: user.id,
        order_description: 'Anima Premium - abbonamento mensile',
        ipn_callback_url: `${origin}/api/nowpayments-webhook`,
        success_url: `${origin}/index.html?payment=success`,
        cancel_url: `${origin}/index.html?payment=cancelled`,
      }),
    });

        const data = await response.json();
    if (!response.ok) {
      console.error('NOWPayments error:', JSON.stringify(data));
      res.status(500).json({ error: data.message || 'Impossibile creare il pagamento' });
      return;
    }
    res.status(200).json({ invoice_url: data.invoice_url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
