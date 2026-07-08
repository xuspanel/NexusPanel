const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const INVOICE_DIR = path.join(__dirname, '..', '..', 'data', 'invoices');

function ensureDir() {
  try { fs.mkdirSync(INVOICE_DIR, { recursive: true }); } catch {}
}

function generateInvoice(order, user) {
  ensureDir();
  const filePath = path.join(INVOICE_DIR, order.id + '.pdf');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const accent = '#06b6d4';
  const dark = '#0f172a';
  const gray = '#64748b';
  const lightGray = '#e2e8f0';

  // Header background
  doc.rect(0, 0, doc.page.width, 140).fill(dark);

  // Logo and title
  doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold')
    .text('NX', 50, 30).fontSize(14).text('NexusPanel', 50, 62)
    .fontSize(10).font('Helvetica').fillColor(accent).text('VPS Control Center', 50, 80);

  doc.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold')
    .text('INVOICE', 350, 45, { width: 200, align: 'right' });

  // Invoice info section
  const invoiceY = 160;
  doc.fillColor(dark);

  // Invoice details
  doc.fontSize(10).font('Helvetica-Bold').text('INVOICE TO', 50, invoiceY);
  doc.font('Helvetica').fontSize(11).text(user.name || user.email, 50, invoiceY + 18);
  doc.fontSize(10).fillColor(gray).text(user.email, 50, invoiceY + 34);

  // Invoice meta
  const metaX = 350;
  const rows = [
    ['Invoice Number', '#' + order.id.substring(0, 16)],
    ['Invoice Date', new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
    ['Order Status', order.status.toUpperCase()],
  ];
  rows.forEach((r, i) => {
    doc.fillColor(gray).fontSize(9).font('Helvetica').text(r[0], metaX, invoiceY + i * 18);
    doc.fillColor(dark).fontSize(10).font('Helvetica-Bold').text(r[1], metaX + 120, invoiceY + i * 18);
  });

  // Divider
  doc.moveTo(50, invoiceY + 85).lineTo(545, invoiceY + 85).strokeColor(lightGray).lineWidth(1).stroke();

  // Items table header
  const tableY = invoiceY + 100;
  doc.rect(50, tableY, 495, 24).fill(dark);
  const cols = [
    { text: 'Item', x: 60, w: 200 },
    { text: 'Qty', x: 270, w: 60 },
    { text: 'Price', x: 340, w: 80, align: 'right' },
    { text: 'Total', x: 430, w: 100, align: 'right' },
  ];
  cols.forEach(c => {
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
      .text(c.text, c.x, tableY + 8, { width: c.w, align: c.align || 'left' });
  });

  // Items
  let itemY = tableY + 30;
  (order.items || []).forEach((item, i) => {
    const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
    doc.rect(50, itemY - 4, 495, 28).fill(bg);
    doc.fillColor(dark).fontSize(9).font('Helvetica').text(item.name, 60, itemY, { width: 200 });
    doc.fillColor(gray).fontSize(8).text(item.maxDomains + ' domains · ' + item.months + ' months', 60, itemY + 12, { width: 200 });
    doc.fillColor(dark).fontSize(9).text(item.quantity || 1, 270, itemY + 2, { width: 60 });
    doc.fillColor(dark).fontSize(9).text('$' + item.price, 340, itemY + 2, { width: 70, align: 'right' });
    doc.fillColor(dark).fontSize(9).font('Helvetica-Bold').text('$' + (item.price * (item.quantity || 1)), 430, itemY + 2, { width: 100, align: 'right' });
    itemY += 32;
  });

  // Total section
  const totalY = itemY + 16;
  doc.moveTo(300, totalY - 4).lineTo(545, totalY - 4).strokeColor(lightGray).lineWidth(1).stroke();

  // Subtotal
  const subtotal = order.total || 0;
  doc.fillColor(gray).fontSize(9).font('Helvetica').text('Subtotal', 350, totalY, { width: 80, align: 'right' });
  doc.fillColor(dark).fontSize(10).text('$' + subtotal.toFixed(2), 440, totalY, { width: 100, align: 'right' });

  // Total
  doc.moveTo(300, totalY + 22).lineTo(545, totalY + 22).strokeColor(accent).lineWidth(1.5).stroke();
  doc.fillColor(dark).fontSize(12).font('Helvetica-Bold').text('TOTAL', 350, totalY + 30, { width: 80, align: 'right' });
  doc.fillColor(accent).fontSize(14).font('Helvetica-Bold').text('$' + subtotal.toFixed(2), 440, totalY + 28, { width: 100, align: 'right' });

  // License Keys section
  if (order.licenseKeys && order.licenseKeys.length > 0) {
    const keyY = totalY + 80;
    doc.fillColor(dark).fontSize(11).font('Helvetica-Bold').text('LICENSE KEYS', 50, keyY);
    order.licenseKeys.forEach((k, i) => {
      doc.fillColor(accent).fontSize(9).font('Courier-Bold').text(k, 50, keyY + 20 + i * 16);
    });
  }

  // Footer
  doc.rect(0, doc.page.height - 60, doc.page.width, 60).fill(dark);
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica')
    .text('NexusPanel — VPS Control Center', 50, doc.page.height - 45)
    .fillColor(gray)
    .text('nxp@s2u.me  |  nxp.xus.me  |  github.com/xuspanel/NexusPanel', 50, doc.page.height - 32);

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

module.exports = { generateInvoice, INVOICE_DIR };
