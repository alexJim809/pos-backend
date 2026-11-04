const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();

// Esto permite que tu API reciba datos en formato JSON
app.use(express.json());
app.use(cors())
// Configurar la conexión a la base de datos de Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Obligatorio para que Render acepte la conexión
});

// --- RUTAS DE PRUEBA (Las que ya teníamos) ---
app.get('/', (req, res) => {
  res.send('¡El backend de Alexanders POS está vivo!');
});

app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ mensaje: '¡Conexión exitosa a la Base de Datos!', hora_servidor: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ error: 'Error al conectar a la BD' });
  }
});

// --- NUEVAS RUTAS PARA EL INVENTARIO ---

// 1. Ruta para CREAR un producto (POST)
app.post('/productos', async (req, res) => {
  try {
    // Recibimos los datos que nos manden desde la PWA (la tablet)
    const { nombre, codigo_barras, precio, stock, categoria } = req.body;

    // Hacemos la consulta SQL para insertar el producto
    const query = `
      INSERT INTO productos (nombre, codigo_barras, precio, stock, categoria) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *;
    `;
    const valores = [nombre, codigo_barras, precio, stock, categoria || 'general'];
    
    const result = await pool.query(query, valores);
    
    res.status(201).json({ 
      mensaje: 'Producto creado con éxito', 
      producto: result.rows[0] 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear el producto' });
  }
});

// 2. Ruta para OBTENER todos los productos (GET)
app.get('/productos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos WHERE activo = true ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los productos' });
  }
});

// Render asigna un puerto automáticamente
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
