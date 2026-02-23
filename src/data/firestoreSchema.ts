export const FIRESTORE_SCHEMA = {
  empresas: {
    _doc: {
      empresa_id: 'string',
      nombre: 'string',
      rif: 'string',
      plan_activo: 'string',
      giro: 'string',
      created_at: 'timestamp',
      owner_uid: 'string',
    },
    configuracion_financiera: {
      _doc: {
        empresa_id: 'string',
        tasa_bcv: 'number',
        tasa_paralelo: 'number',
        updated_at: 'timestamp',
      },
    },
  },
  productos: {
    _doc: {
      empresa_id: 'string',
      sku: 'string',
      nombre: 'string',
      categoria: 'string',
      tipo: 'ropa | comida | electronica',
      precio_venta: 'number',
      costo: 'number',
      stock: 'number',
      detalles: {
        talla: 'string | null',
        color: 'string | null',
        vencimiento: 'timestamp | null',
        serial: 'string | null',
      },
      created_at: 'timestamp',
      updated_at: 'timestamp',
    },
  },
  ventas: {
    _doc: {
      empresa_id: 'string',
      ticket_id: 'string',
      vendedor_uid: 'string',
      cliente_id: 'string | null',
      items: [
        {
          producto_id: 'string',
          cantidad: 'number',
          precio_unitario: 'number',
          total: 'number',
        },
      ],
      pagos: [
        {
          metodo: 'efectivo_usd | pago_movil_bs | transferencia_bs | tarjeta',
          monto: 'number',
          moneda: 'USD | BS',
        },
      ],
      tasa_cambio: {
        bcv: 'number',
        paralelo: 'number',
        congelada_en: 'timestamp',
      },
      total_usd: 'number',
      total_bs: 'number',
      created_at: 'timestamp',
    },
  },
  auditoria_logs: {
    _doc: {
      empresa_id: 'string',
      actor_uid: 'string',
      accion: 'string',
      recurso: 'string',
      metadata: 'map',
      created_at: 'timestamp',
    },
  },
} as const;

// Regla de oro: cada coleccion operativa incluye empresa_id para aislamiento.
