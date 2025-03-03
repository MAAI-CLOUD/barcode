import express from 'express';
import nodemailer from 'nodemailer';
import multer from 'multer';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { toBuffer } from 'bwip-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Enable CORS
app.use(cors({
  origin: ['http://localhost:5173', 'https://onkids.cl'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Configure nodemailer
const transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: "a2a81712e4053b",
    pass: "43cfccaf71e915"
  }
});

// Contact form endpoint
app.post('/api/contact', upload.array('documents'), async (req, res) => {
  try {
    // Parse the JSON string in req.body.data to an actual JavaScript object
    const formData = JSON.parse(req.body.data);

    // Destructure the values from the parsed formData
    const {
      //company: { rut: companyRut, name: companyName, address: companyAddress, businessType },
      //legalRepresentative: { name: repName, rut: repRut },
        applicant: { name: applicantName, nameE: applicantNameE, cargo: applicantCargo, phone: applicantPhone, email: applicantEmail, mensaje: applicantMensaje }
    } = formData;

    const emailContent = `
      <h2>Solicitud Creacion Tienda Motorclub</h2>

      <h3>Datos del Solicitante</h3>
      <p>Nombre Completo: ${applicantName}</p>
      <p>Nombre Empresa: ${applicantNameE}</p>
      <p>Cargo: ${applicantCargo}</p>
      <p>Teléfono: ${applicantPhone}</p>
      <p>Email: ${applicantEmail}</p>
      <p>Mensaje: ${applicantMensaje}</p>
    `;

    const mailOptions = {
      from: 'contacto@onkids.cl',
      to: 'contacto@onkids.cl',
      subject: 'Solicitud nuevo vendedor',
      html: emailContent,
      attachments: req.files?.map(file => ({
        filename: file.originalname,
        content: file.buffer
      }))
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Email sending failed:', error);
    res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// QR code endpoint
app.get('/api/barcode', (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }

  toBuffer({
    bcid: 'qrcode', // Changed from code128 to qrcode
    text: id.toString(),
    scale: 4,        // Adjusted scale for QR codes
    includetext: false, // QR codes don't need human readable text
    eclevel: 'M',    // Error correction level (L,M,Q,H)
    padding: 10      // Padding around the QR code
  }, (err, png) => {
    if (err) {
      console.error('QR code generation error:', err);
      return res.status(500).json({ error: 'Error generating QR code' });
    }

    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  });
});

// Confirmacion flow Endpoint
app.post('/api/confirmation', (req, res) => {
  try {
    // Si no quieres realizar ninguna validación ni procesamiento, solo responde con 200
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error en la confirmación:', error);
    res.status(500).json({ message: 'Error interno del servidor', error: error.message });
  }
});


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
