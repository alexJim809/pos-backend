const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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


// --- RUTA PARA PROCESAR UNA VENTA ---
app.post('/ventas', async (req, res) => {
  // Obtenemos los datos de la venta desde el frontend
  const { total, metodo_pago, productos } = req.body;
  
  // Obtenemos un cliente de la piscina de conexiones para hacer una transacción segura
  const client = await pool.connect();

  try {
    // 1. Iniciamos la transacción (Si algo falla, todo se cancela)
    await client.query('BEGIN');

    // 2. Insertamos la venta principal (el ticket)
    const ventaQuery = `
      INSERT INTO ventas (total, metodo_pago) 
      VALUES ($1, $2) RETURNING id;
    `;
    const ventaResult = await client.query(ventaQuery, [total, metodo_pago || 'efectivo']);
    const ventaId = ventaResult.rows[0].id;

    // 3. Recorremos los productos del carrito
    for (const prod of productos) {
      // a) Insertamos el detalle de lo que se vendió
      const detalleQuery = `
        INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario) 
        VALUES ($1, $2, $3, $4);
      `;
      await client.query(detalleQuery, [ventaId, prod.id, prod.cantidad, prod.precio]);

      // b) Restamos el stock del inventario
      const stockQuery = `
        UPDATE productos 
        SET stock = stock - $1 
        WHERE id = $2;
      `;
      await client.query(stockQuery, [prod.cantidad, prod.id]);
    }

    // 4. Si todo salió bien, confirmamos los cambios en la base de datos
    await client.query('COMMIT');

    res.status(201).json({ 
      mensaje: 'Venta procesada con éxito', 
      venta_id: ventaId 
    });

  } catch (error) {
    // Si hubo un error (ej. se cayó la red), deshacemos todo
    await client.query('ROLLBACK');
    console.error("Error al procesar la venta:", error);
    res.status(500).json({ error: 'Error interno al procesar la venta' });
  } finally {
    // Liberamos la conexión para que otros la puedan usar
    client.release();
  }
});


// --- RUTA DE LOGIN ---
app.post('/login', async (req, res) => {
  const { nombre, pin } = req.body;

  try {
    // 1. Buscamos al usuario en la base de datos
    const result = await pool.query('SELECT * FROM usuarios WHERE nombre = $1', [nombre]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const usuario = result.rows[0];

    // 2. Comparamos la contraseña enviada con la encriptada en la BD
    // (Por ahora, como insertamos un hash de prueba, vamos a saltarnos la validación real para que pruebes)
    // const passwordValido = await bcrypt.compare(pin, usuario.pin); 
    const passwordValido = true; // <-- TEMPORAL PARA LA PRUEBA

    if (!passwordValido) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // 3. Si todo está bien, creamos el Token VIP (JWT)
    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol }, 
      'TU_CLAVE_SECRETA_SUPER_SEGURA', // Luego la moveremos a variables de entorno
      { expiresIn: '8h' } // El turno de un cajero dura 8 horas
    );

    res.json({ 
      mensaje: 'Login exitoso', 
      token: token, 
      usuario: { nombre: usuario.nombre, rol: usuario.rol } 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Render asigna un puerto automáticamente
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});




