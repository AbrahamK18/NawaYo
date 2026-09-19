const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function sortObject(obj) {
  if (Array.isArray(obj)) return obj.map(sortObject);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((result, key) => {
      result[key] = sortObject(obj[key]);
      return result;
    }, {});
  }
  return obj;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const signature = req.headers['x-nowpayments-sig'];
  const sortedBody = JSON.stringify(sortObject(req.body));
  const hmac = crypto
    .createHmac('sha512', process.env.NOWPAYMENTS_IPN_SECRET)
    .update(sortedBody)
    .digest('hex');

  if (!signature || hmac !== signature) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const { payment_status, order_id } = req.body;

  if ((payment_status === 'finished' || payment_status === 'confirmed') && order_id) {
    const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await supabaseAdmin
      .from('profiles')
      .update({ is_premium: true, verified: true })
      .eq('id', order_id);
  }

  res.status(200).json({ received: true });
};
