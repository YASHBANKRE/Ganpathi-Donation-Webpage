// server.js
// Dependencies: express body-parser nodemailer pdfkit cors dotenv
// npm i express body-parser nodemailer pdfkit cors dotenv

const express = require('express');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// serve static frontend
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// helper
function genReceiptId(){
  const d = new Date();
  return `RCR-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
}

// email transporter from env
if(!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.DEV_EMAIL){
  console.warn('Set EMAIL_USER, EMAIL_PASS, DEV_EMAIL in .env');
}
const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE || 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// POST /donate -> create PDF and email to donor + developer
app.post('/donate', async (req, res) => {
  try{
    const { name, email, amount, paymentId } = req.body;
    if(!name || !email || !amount) return res.status(400).json({ success:false, message:'Missing name/email/amount' });

    const receiptId = genReceiptId();
    const filename = `${receiptId}.pdf`;
    const filepath = path.join(__dirname, filename);

    // generate PDF
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40 });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      const logoPath = path.join(publicDir, 'G3.jpg');
      if(fs.existsSync(logoPath)) {
        try{ doc.image(logoPath, { fit:[80,80], align:'center' }).moveDown(); } catch(e){}
      }
      doc.fontSize(18).fillColor('#ff9933').text('Royal Cha Raja — Donation Receipt', { align: 'center' }).moveDown();
      doc.fontSize(12).fillColor('#000');
      doc.text(`Receipt ID: ${receiptId}`);
      doc.text(`Donor Name: ${name}`);
      doc.text(`Donor Email: ${email}`);
      doc.text(`Donation Amount: ₹${amount}`);
      doc.text(`Payment/Transaction ID: ${paymentId || '—'}`);
      doc.text(`Date (IST): ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
      doc.moveDown();
      doc.fillColor('#333').text('Thank you for supporting Royal Cha Raja. Your donation helps run our festival and community programs.', { align:'left' });
      doc.moveDown(1);
      doc.text('Ganpati Bappa Morya!', { align:'center' });

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    // email both donor and developer
    const devEmail = process.env.DEV_EMAIL;
    const from = process.env.EMAIL_USER;

    const mailOptions = {
      from,
      to: `${email}, ${devEmail}`,
      subject: `Donation Receipt — ${receiptId}`,
      text: `Dear ${name},\n\nThank you for your donation of ₹${amount}.\nReceipt ID: ${receiptId}\nPayment ID: ${paymentId || '—'}\n\nGanpati Bappa Morya!\n\n- Royal Cha Raja`,
      attachments: [{ filename, path: filepath }]
    };

    await transporter.sendMail(mailOptions);

    // cleanup file
    fs.unlink(filepath, ()=>{});

    res.json({ success:true, receiptId });
  }catch(err){
    console.error('Donate error:', err);
    res.status(500).json({ success:false, message:'Server error while generating/sending receipt' });
  }
});

// fallback to index
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`Server running on http://localhost:${PORT}`));
