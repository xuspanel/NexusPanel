const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'orders.json');

function load() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; } }
function save(orders) { fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2)); }

function createOrder(userId, items) {
  const orders = load();
  const order = {
    id: 'o_' + Date.now(),
    userId,
    items,
    status: 'pending',
    total: items.reduce((sum, i) => sum + (i.price * i.quantity), 0),
    createdAt: new Date().toISOString(),
    licenseKeys: [],
  };
  orders.push(order);
  save(orders);
  return order;
}

function getUserOrders(userId) {
  return load().filter(o => o.userId === userId).reverse();
}

function getOrder(id) {
  return load().find(o => o.id === id) || null;
}

function updateOrder(id, updates) {
  const orders = load();
  const order = orders.find(o => o.id === id);
  if (!order) return null;
  if (updates.status) order.status = updates.status;
  if (updates.licenseKeys) order.licenseKeys = updates.licenseKeys;
  save(orders);
  return order;
}

module.exports = { createOrder, getUserOrders, getOrder, updateOrder };
