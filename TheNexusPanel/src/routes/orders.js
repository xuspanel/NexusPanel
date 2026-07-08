const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ordersService = require('../services/orders');
const invoiceService = require('../services/invoice');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const router = express.Router();

function sendPlainEmail(to, subject, bodyText) {
  try {
    execSync('sendmail -t -oi', { input: [
      'From: NexusPanel <nxp@s2u.me>',
      'To: ' + to,
      'Subject: ' + subject,
      'Content-Type: text/plain; charset=utf-8',
      '',
      bodyText,
    ].join('\n'), encoding: 'utf8', timeout: 10000 });
  } catch (e) { console.error('[Email] Failed:', e.message); }
}

function sendEmailWithAttachment(to, subject, bodyText, attachmentPath, filename) {
  try {
    const pdfData = fs.readFileSync(attachmentPath);
    const base64 = pdfData.toString('base64');
    const boundary = '----=_NexusPanel_' + Date.now() + '_' + Math.random().toString(36).substring(2);

    // Wrap base64 to 76 chars per line (MIME standard)
    let wrapped = '';
    for (let i = 0; i < base64.length; i += 76) {
      wrapped += base64.substring(i, i + 76) + '\n';
    }

    const message = [
      'From: NexusPanel <nxp@s2u.me>',
      'To: ' + to,
      'Subject: ' + subject,
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="' + boundary + '"',
      '',
      '--' + boundary,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      bodyText,
      '',
      '--' + boundary,
      'Content-Type: application/pdf; name="' + filename + '"',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="' + filename + '"',
      '',
      wrapped,
      '--' + boundary + '--',
    ].join('\n');

    execSync('sendmail -t -oi', { input: message, encoding: 'utf8', timeout: 15000 });
  } catch (e) {
    console.error('[Email+Attachment] Failed:', e.message);
    // Fallback: send plain email without attachment
    sendPlainEmail(to, subject, bodyText + '\n\n(Invoice PDF could not be attached. Download it from your Orders page at https://nxp.xus.me/orders)');
  }
}

function orderEmailText(order, keys) {
  const itemsList = order.items.map(i => '  ' + i.name + ' x' + i.quantity + ' — $' + i.price).join('\n');
  const keysList = keys.length > 0 ? keys.map(k => '  ' + k).join('\n') : '  Pending';
  return [
    'Thank you for your purchase!',
    '',
    'Order #' + order.id.substring(0, 10),
    'Status: ' + order.status.toUpperCase(),
    'Total: $' + order.total,
    '',
    'Items:',
    itemsList,
    '',
    'License Keys:',
    keysList,
    '',
    'Your invoice PDF is attached to this email. You can also download it from your Orders page.',
    '',
    'Your licenses are ready to use. Install NexusPanel on your VPS:',
    '  bash <(curl -s https://raw.githubusercontent.com/xuspanel/NexusPanel/main/install.sh)',
    '',
    'Manage your licenses: https://nxp.xus.me/licenses',
    '',
    '— The NexusPanel Team',
    '  nxp@s2u.me',
  ].join('\n');
}

function adminEmailBody(order, user, keys) {
  const itemsList = order.items.map(i => '  - ' + i.name + ' (x' + i.quantity + ') — $' + (i.price * i.quantity)).join('\n');
  const keysList = keys.length > 0 ? keys.map(k => '  ' + k).join('\n') : '  Pending manual generation';
  return [
    'New Order Received',
    'Customer: ' + (user.name || user.email) + ' <' + user.email + '>',
    'Order: ' + order.id,
    'Status: ' + order.status,
    'Total: $' + order.total,
    '',
    itemsList,
    '',
    'Keys:',
    keysList,
    '',
    'Date: ' + order.createdAt,
  ].join('\n');
}

router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(ordersService.getUserOrders(req.user.id));
});

router.post('/', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'Cart is empty' });
    const order = ordersService.createOrder(req.user.id, items);

    const apiKey = process.env.NXL_CHECKOUT_API_KEY;
    const apiBase = process.env.NXL_LICENSE_API || 'http://127.0.0.1:3444';
    const keys = [];

    for (const item of items) {
      try {
        const resp = await fetch(apiBase + '/api/checkout/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
          body: JSON.stringify({
            count: item.quantity || 1,
            max_domains: item.maxDomains || 1,
            expires_in_months: item.months || 12,
            issued_to: order.userId,
            notes: 'Order #' + order.id + ' | Plan: ' + (item.name || 'Standard'),
          }),
        });
        const data = await resp.json();
        if (data && data.keys) keys.push(...data.keys.map(k => k.key));
      } catch {}
    }

    if (keys.length > 0) {
      ordersService.updateOrder(order.id, { status: 'completed', licenseKeys: keys });
      order.status = 'completed';
      order.licenseKeys = keys;
    }

    const user = { email: req.user.email || 'unknown', name: req.user.name || req.user.email };

    // Generate invoice PDF
    try {
      await invoiceService.generateInvoice(order, user);
    } catch (e) {
      console.error('[Invoice] Generation failed:', e.message);
    }

    // Send customer email with PDF invoice attached
    const invoicePath = path.join(invoiceService.INVOICE_DIR, order.id + '.pdf');
    if (fs.existsSync(invoicePath)) {
      sendEmailWithAttachment(
        user.email,
        'Your NexusPanel Order #' + order.id.substring(0, 10) + ' is Confirmed',
        orderEmailText(order, keys),
        invoicePath,
        'invoice-' + order.id.substring(0, 10) + '.pdf'
      );
    } else {
      sendPlainEmail(
        user.email,
        'Your NexusPanel Order #' + order.id.substring(0, 10) + ' is Confirmed',
        orderEmailText(order, keys)
      );
    }

    // Send admin notification
    sendPlainEmail('nxp@s2u.me',
      '[New Order] #' + order.id.substring(0, 10) + ' — ' + (order.items[0]?.name || 'Plan'),
      adminEmailBody(order, user, keys));

    res.json({ order });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/invoice', (req, res) => {
  const order = ordersService.getOrder(req.params.id);
  if (!order || order.userId !== req.user.id) return res.status(404).json({ error: 'Order not found' });
  const filePath = require('path').join(invoiceService.INVOICE_DIR, order.id + '.pdf');
  const fs = require('fs');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Invoice not yet generated' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="invoice-' + order.id.substring(0, 10) + '.pdf"');
  fs.createReadStream(filePath).pipe(res);
});

router.get('/:id', (req, res) => {
  const order = ordersService.getOrder(req.params.id);
  if (!order || order.userId !== req.user.id) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

module.exports = router;
