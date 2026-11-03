const express = require('express');
const { Pool } = require('pg');
const app = express();

// Esto permite que tu API reciba datos en formato JSON
app.use(express.json());

// Configurar la conexión a la base de datos de Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Obligatorio para que Render acepte la conexión
});

// Ruta 1: Prueba de que el servidor está vivo
app.get('/', (req, res) => {
  res.send('¡El backend de Alexanders POS está vivo!');
});

// Ruta 2: Prueba de que la base de datos responde
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      mensaje: '¡Conexión exitosa a la Base de Datos!', 
      hora_servidor: result.rows[0].now 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al conectar a la BD' });
  }
});

// Render asigna un puerto automáticamente, si no, usa el 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
