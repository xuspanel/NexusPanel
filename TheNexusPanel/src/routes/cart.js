const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const cart = req.session?.cart || [];
  res.json({ items: cart, total: cart.reduce((s, i) => s + (i.price * i.quantity), 0), count: cart.reduce((s, i) => s + i.quantity, 0) });
});

router.post('/', (req, res) => {
  if (!req.session) req.session = {};
  if (!req.session.cart) req.session.cart = [];
  const { plan, price, maxDomains, months, quantity } = req.body;
  req.session.cart.push({
    id: 'c_' + Date.now(),
    name: plan,
    price: price,
    maxDomains: maxDomains,
    months: months,
    quantity: quantity || 1,
  });
  res.json({ ok: true, count: req.session.cart.length });
});

router.delete('/:id', (req, res) => {
  if (!req.session?.cart) return res.json({ ok: true });
  req.session.cart = req.session.cart.filter(i => i.id !== req.params.id);
  res.json({ ok: true, count: req.session.cart.length });
});

router.delete('/', (req, res) => {
  if (req.session) req.session.cart = [];
  res.json({ ok: true });
});

module.exports = router;
