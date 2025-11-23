import express from 'express';
import nodemailer from 'nodemailer';
import multer from 'multer';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { toBuffer } from 'bwip-js';
import axios from 'axios';
import crypto from 'crypto';

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
app.use(express.json()); // Para parsear JSON (buena práctica tenerlo)
app.use(express.urlencoded({ extended: true }));
// Enable CORS
app.use(cors({
  origin: ['http://localhost:5173', 'https://onkids.cl', 'https://www.onkids.cl'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Configure nodemailer
const transporter = nodemailer.createTransport({
  host: "live.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: "api",
    pass: "c091759de66bb70102e1fa5b6a3a8349"
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
      <h2>Solicitud Creacion Tienda OnKids</h2>

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
/*app.post('/api/confirmation', (req, res) => {
  try {
    // Si no quieres realizar ninguna validación ni procesamiento, solo responde con 200
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error en la confirmación:', error);
    res.status(500).json({ message: 'Error interno del servidor', error: error.message });
  }
});*/

const FLOW_API_KEY = '4778F70D-9A9C-4A1F-9C0D-82965F3CLC3F';
const FLOW_SECRET_KEY = 'ae9145aa9c40fbcac7a2f504684c65fd697a8a28';

function signParams(params) {
  const sortedParams = Object.keys(params).sort().map(key => `${key}${params[key]}`).join('');
  const signature = crypto.createHmac('sha256', FLOW_SECRET_KEY).update(sortedParams).digest('hex');
  return signature;
}

app.post('/api/confirmation', async (req, res) => {
  const { token } = req.body;
  console.log('Token recibido de Flow:', token);

  if (!token) {
      console.log('No se recibió token de Flow.');
      return res.status(400).send('Token no proporcionado');
  }

  try {
      // 1. Obtener el estado del pago desde Flow
      const flowApiKey = FLOW_API_KEY;
      const flowSecretKey = FLOW_SECRET_KEY;
      const params = { apiKey: flowApiKey, token };
      const signature = signParams(params, flowSecretKey); // Asegúrate que signParams esté definida y funcione
      const flowStatusUrl = `https://www.flow.cl/api/payment/getStatus?apiKey=${flowApiKey}&token=${token}&s=${signature}`;
      
      console.log('Consultando Flow API:', flowStatusUrl);
      const flowResponse = await fetch(flowStatusUrl);
      const flowStatus = await flowResponse.json();
      console.log('Respuesta de Flow API:', JSON.stringify(flowStatus, null, 2));

      if (!flowResponse.ok) {
          console.error('Error al obtener estado de Flow:', flowStatus);
          return res.status(flowResponse.status).json({ message: 'Error al obtener estado de Flow', details: flowStatus });
      }

      const strapiTokenVenta = flowStatus.commerceOrder;
      const paymentStatus = String(flowStatus.status);

      // 2. Obtener el pedido de Strapi usando el tokenVenta (commerceOrder)
      // SIN TOKEN DE AUTORIZACIÓN
      const strapiOrderUrl = `https://apis.onkids.cl/api/ventas?filters[tokenFlow]=${token}&populate=*`;
      console.log('Obteniendo pedido de Strapi:', strapiOrderUrl);
      const strapiOrderResponse = await fetch(strapiOrderUrl);
      const strapiData = await strapiOrderResponse.json();
      console.log('Respuesta de Strapi (pedido):', JSON.stringify(strapiData, null, 2));

      if (!strapiOrderResponse.ok || !strapiData.data || strapiData.data.length === 0) {
          console.error('Error: Pedido no encontrado en Strapi o error en la respuesta para tokenVenta:', token);
          return res.status(404).send('Pedido no encontrado en Strapi');
      }

      const order = strapiData.data[0];
      console.log(`Pedido de Strapi ID: ${order.documentId}, checkPago: ${order.checkPago}`);

      // 3. Si el pago es exitoso (status 2) y no ha sido procesado antes (!order.checkPago)
      if (paymentStatus === '2' && !order.checkPago) {
          console.log(`Procesando pago exitoso para la orden de Strapi ID: ${order.documentId}`);

          if (order.informacionProductos && Array.isArray(order.informacionProductos)) {
              await Promise.all(order.informacionProductos.map(async (productItem) => {
                  try {
                      // Obtener detalles actuales del producto desde Strapi
                      // SIN TOKEN DE AUTORIZACIÓN
                      const productUrl = `https://apis.onkids.cl/api/productos/${productItem.id}`;
                      console.log('Obteniendo producto para actualizar stock:', productUrl);
                      const productResponse = await fetch(productUrl);
                      const productData = await productResponse.json();
                      if (!productResponse.ok || !productData.data) {
                          console.error(`Error: Producto con ID ${productItem.id} no encontrado en Strapi o error en respuesta.`);
                          return;
                      }
                      const currentProduct = productData.data;
                      console.log(`Producto actual (ID: ${currentProduct.documentId}): Unidades: ${currentProduct.unidades}, Coleccion: ${JSON.stringify(currentProduct.coleccion)}`);

                      const newStock = currentProduct.unidades - productItem.cantidad;
                      console.log(`Actualizando stock para producto ID ${currentProduct.documentId}: ${currentProduct.unidades} -> ${newStock}`);
                      // SIN TOKEN DE AUTORIZACIÓN
                      await fetch(`https://apis.onkids.cl/api/productos/${currentProduct.documentId}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ data: { unidades: newStock } })
                      });

                      if (productItem.collectionQuantities && currentProduct.coleccion) {
                          let collectionToUpdate = typeof currentProduct.coleccion === 'string'
                              ? JSON.parse(currentProduct.coleccion)
                              : currentProduct.coleccion;
                          
                          if (Array.isArray(collectionToUpdate)) {
                              const updatedCollection = collectionToUpdate.map(item => {
                                  const quantityBought = productItem.collectionQuantities[item.nombre] || 0;
                                  if (quantityBought > 0) {
                                      console.log(`Actualizando colección '${item.nombre}' para producto ID ${currentProduct.documentId}: ${item.cantidad} -> ${Math.max(0, item.cantidad - quantityBought)}`);
                                  }
                                  return {
                                      ...item,
                                      cantidad: Math.max(0, item.cantidad - quantityBought)
                                  };
                              });
                              // SIN TOKEN DE AUTORIZACIÓN
                              await fetch(`https://apis.onkids.cl/api/productos/${currentProduct.documentId}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ data: { coleccion: updatedCollection } })
                              });
                              console.log(`Colección actualizada para producto ID ${currentProduct.documentId}`);
                          } else {
                               console.warn(`La colección para el producto ID ${currentProduct.documentId} no es un array procesable:`, collectionToUpdate);
                          }
                      }
                  } catch (stockError) {
                      console.error(`Error actualizando stock para producto ID ${productItem.id}:`, stockError);
                  }
              }));
          } else {
              console.warn('No se encontraron informacionProductos en la orden o no es un array, no se actualiza stock.');
          }

          const updatePayload = {
              data: {
                  estado: paymentStatus,
                  idFlow: String(flowStatus.flowOrder),
                  paymentData: flowStatus.paymentData,
                  //checkPago: true
              }
          };
          console.log(`Actualizando orden en Strapi ID ${order.documentId} con payload:`, JSON.stringify(updatePayload));
          // SIN TOKEN DE AUTORIZACIÓN
          await fetch(`https://apis.onkids.cl/api/ventas/${order.documentId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatePayload)
          });
          console.log(`Orden de Strapi ID ${order.documentId} actualizada y marcada como procesada.`);

          res.status(200).send('Confirmación procesada exitosamente, stock actualizado.');

      } else if (paymentStatus === '2' && order.checkPago) {
          console.log(`El pago para la orden de Strapi ID ${order.documentId} ya fue procesado anteriormente.`);
          res.status(200).send('Confirmación ya procesada anteriormente.');
      } else {
          console.log(`Estado del pago no es exitoso (${paymentStatus}) o la orden (${order.documentId}) no requiere procesamiento de stock.`);
          // SIN TOKEN DE AUTORIZACIÓN
          await fetch(`https://apis.onkids.cl/api/ventas/${order.documentId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: { estado: paymentStatus, idFlow: String(flowStatus.flowOrder) } })
          });
          res.status(200).send(`Confirmación recibida, estado del pago: ${paymentStatus}.`);
      }

  } catch (error) {
      console.error('Error procesando la confirmación de Flow:', error);
      if (error.response) {
          const errorBody = await error.response.text();
          console.error('Error response body:', errorBody);
          res.status(error.response.status || 500).send(`Error interno del servidor: ${error.message}. Response: ${errorBody}`);
      } else {
          res.status(500).send(`Error interno del servidor: ${error.message}`);
      }
  }
});












app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
