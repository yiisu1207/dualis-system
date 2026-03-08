import React, { useState, useMemo } from 'react';
import {
  Search, ChevronRight, LayoutDashboard, ShoppingCart, Package,
  Wallet, Receipt, BookOpen, Users, TrendingUp, BarChart3,
  Settings2, HelpCircle, Zap, AlertCircle, CheckCircle2,
  Lightbulb, ArrowRight, Eye, Clock, DollarSign, Scale,
  ClipboardList, MessageSquare, Shield, Star, Info,
  ChevronDown, ChevronUp, Landmark,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface HelpButton {
  name: string;
  icon?: string;
  what: string;
  where?: string;
  tip?: string;
}

interface EmptyState {
  why: string;
  fix: string;
}

interface HelpArticle {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  content: {
    purpose: string;
    buttons?: HelpButton[];
    emptyState?: EmptyState;
    steps?: string[];
    tips?: string[];
    faq?: { q: string; a: string }[];
    concepts?: { term: string; def: string }[];
  };
}

interface HelpCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  articles: HelpArticle[];
}

// ─── Content ──────────────────────────────────────────────────────────────────
const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'inicio',
    label: 'Inicio Rápido',
    icon: <Star size={14} />,
    color: 'text-amber-400',
    articles: [
      {
        id: 'bienvenida',
        title: 'Bienvenido a Dualis',
        subtitle: 'Qué es, para qué sirve y cómo empezar',
        emoji: '🚀',
        content: {
          purpose: 'Dualis es un sistema de gestión empresarial diseñado para pequeñas y medianas empresas venezolanas. Te permite controlar ventas, inventario, cuentas por cobrar, nómina, gastos y mucho más — todo en un solo lugar, en bolívares y dólares.',
          steps: [
            'Configura tu empresa: Ve a Configuración → Identidad y llena el nombre, RIF, teléfono y dirección.',
            'Agrega tus productos: Ve a Inventario → botón "Nuevo producto" y crea tu catálogo.',
            'Registra tus clientes: Ve a Deudores/CxC → botón "+" para agregar el primero.',
            'Abre una caja: Ve a Ventas/Cajas → selecciona un terminal → "Nueva venta".',
            'Actualiza la tasa del día: Ve a Tasas de Cambio → ingresa el valor actual del BCV.',
          ],
          tips: [
            'Comienza por configurar la tasa de cambio BCV — sin ella las conversiones no funcionan correctamente.',
            'El sistema trabaja en dólares internamente y convierte a bolívares según la tasa del día.',
            'Todo lo que haces queda guardado automáticamente en la nube.',
            'Puedes usar Dualis desde el celular abriendo la URL en el navegador.',
          ],
          faq: [
            { q: '¿Mis datos están seguros?', a: 'Sí. Dualis usa Firebase de Google para almacenar tus datos con cifrado. Nadie más puede verlos.' },
            { q: '¿Funciona sin internet?', a: 'No. Dualis requiere conexión a internet para funcionar, ya que los datos se guardan en la nube en tiempo real.' },
            { q: '¿Puedo usar Dualis en varios equipos?', a: 'Sí. Puedes iniciar sesión desde cualquier dispositivo con tu usuario y contraseña.' },
            { q: '¿Cómo agrego a alguien de mi equipo?', a: 'Ve a Configuración → Equipo → comparte el código de espacio de trabajo con tu socio o empleado.' },
          ],
        },
      },
      {
        id: 'navegacion',
        title: 'Cómo navegar el sistema',
        subtitle: 'Sidebar, topbar y widgets explicados',
        emoji: '🗺️',
        content: {
          purpose: 'El sistema tiene tres zonas principales: la barra lateral (sidebar) para cambiar de módulo, la barra superior (topbar) con accesos rápidos, y el área central donde trabaja cada módulo.',
          buttons: [
            { name: 'Sidebar — Icono de módulo', what: 'Cambia la sección activa. El elemento con fondo morado es donde estás ahora.' },
            { name: 'Flecha ← (sidebar)', what: 'Colapsa el sidebar para tener más espacio. Haz clic de nuevo para expandirlo.' },
            { name: 'Tasa BCV (topbar, arriba a la derecha)', what: 'Muestra la tasa de cambio activa. Haz clic en Tasas para actualizarla.' },
            { name: 'Campana 🔔 (topbar)', what: 'Abre el centro de notificaciones. Aquí ves alertas de ventas, solicitudes de equipo y avisos del sistema.' },
            { name: 'Calculadora (topbar)', what: 'Abre una calculadora flotante de tasas de cambio. Convierte entre USD y Bs al instante.' },
            { name: '? (topbar)', what: 'Abre este Centro de Ayuda.' },
            { name: 'Avatar / foto de perfil (topbar)', what: 'Abre tu perfil: puedes cambiar nombre, foto y ver tu rol.' },
            { name: 'Dock inferior (barra de íconos abajo)', what: 'Widgets flotantes: calculadora, cronómetro, notas, lista de tareas, chat de equipo. Haz clic para abrir/cerrar.' },
          ],
          tips: [
            'El sidebar colapsado recuerda tu preferencia — al volver a entrar estará igual que lo dejaste.',
            'Puedes tener varios widgets abiertos a la vez y moverlos por la pantalla arrastrando.',
          ],
        },
      },
      {
        id: 'widgets',
        title: 'Widgets Flotantes',
        subtitle: 'Calculadora, notas, cronómetro y más',
        emoji: '🧩',
        content: {
          purpose: 'Los widgets son mini-herramientas que puedes abrir encima de cualquier módulo sin perder lo que estás haciendo. Aparecen en la barra inferior de íconos. Son opcionales — úsalos solo si los necesitas.',
          buttons: [
            { name: '🧮 Calculadora de tasas', what: 'Convierte entre USD y Bs al instante usando la tasa activa del día. También hace operaciones básicas. Perfecto para calcular precios rápido mientras atiendes a un cliente.' },
            { name: '⏱️ Cronómetro', what: 'Temporizador simple. Útil para medir tiempos de atención al cliente, entregas, o cualquier proceso que quieras controlar.' },
            { name: '📝 Notas adhesivas', what: 'Block de notas flotante. Escribe recordatorios, listas rápidas o información del cliente mientras estás en el POS. Las notas se guardan en tu sesión.' },
            { name: '✅ Lista de tareas', what: 'Lista de pendientes del día. Crea tareas, márcalas como completadas. Ideal para el encargado de la tienda.' },
            { name: '💬 Chat de equipo', what: 'Chat interno entre los miembros de tu empresa. Mensajes instantáneos sin salir del sistema. Deja de usar WhatsApp para comunicados internos del negocio.' },
          ],
          tips: [
            'Los widgets se pueden mover arrastrando desde su barra superior. Organízalos como prefieras en la pantalla.',
            'Si un widget te estorba, haz clic de nuevo en su ícono en el dock para cerrarlo.',
            'El chat de equipo solo funciona si está activado en Configuración → Funciones del Sistema.',
          ],
          faq: [
            { q: '¿Las notas se guardan si cierro el sistema?', a: 'Las notas adhesivas se guardan en el almacenamiento local de tu navegador. Si limpias el caché o usas otro dispositivo, las notas no estarán.' },
            { q: '¿El chat de equipo es privado?', a: 'Sí. Solo los miembros de tu empresa con acceso al sistema pueden ver el chat.' },
          ],
        },
      },
    ],
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={14} />,
    color: 'text-indigo-400',
    articles: [
      {
        id: 'dashboard-overview',
        title: 'Dashboard — Resumen General',
        subtitle: 'Qué significa cada número y gráfico',
        emoji: '📊',
        content: {
          purpose: 'El Dashboard es la pantalla de inicio del sistema. Te muestra un resumen del estado de tu negocio en tiempo real: ventas del día, dinero pendiente de cobrar, movimientos recientes y gráficos de tendencia.',
          concepts: [
            { term: 'KPI Ventas del día', def: 'Suma de todas las facturas registradas hoy en cualquier terminal POS o movimiento manual.' },
            { term: 'KPI Cuentas por Cobrar (CxC)', def: 'Total de dinero que te deben tus clientes (facturas sin pagar). Solo cuenta clientes con nombre, no ventas a "Consumidor Final".' },
            { term: 'KPI Pagos Recibidos', def: 'Total de abonos y pagos registrados hoy. Cada vez que un cliente paga, sube este número.' },
            { term: 'KPI Gastos', def: 'Total de facturas de proveedores registradas. Representa lo que tu empresa ha gastado.' },
            { term: 'Gráfico de área (ventas)', def: 'Muestra la curva de ventas diarias de los últimos 30 días. Si la línea sube, estás vendiendo más.' },
            { term: 'Gráfico de torta (métodos de pago)', def: 'Distribución de cómo te pagan: efectivo, transferencia, punto de venta, etc.' },
            { term: 'Últimos movimientos', def: 'Lista de los últimos registros en el sistema (ventas, pagos, gastos) en orden cronológico.' },
          ],
          emptyState: {
            why: 'El dashboard está vacío porque aún no tienes ventas, clientes ni movimientos registrados.',
            fix: 'Empieza por: 1) Actualizar la tasa BCV en Tasas de Cambio. 2) Agregar productos en Inventario. 3) Hacer tu primera venta en Ventas/Cajas.',
          },
          faq: [
            { q: '¿Por qué el gráfico no muestra hoy?', a: 'El gráfico usa la zona horaria del servidor. Si acabas de empezar el día, puede tardar unos minutos en actualizarse.' },
            { q: '¿Por qué CxC dice 0 si tengo facturas?', a: 'Las ventas a "Consumidor Final" no cuentan como CxC. Solo las facturas con cliente identificado (nombre y cédula) aparecen aquí.' },
          ],
        },
      },
    ],
  },
  {
    id: 'ventas',
    label: 'Ventas / POS',
    icon: <ShoppingCart size={14} />,
    color: 'text-sky-400',
    articles: [
      {
        id: 'cajas-manager',
        title: 'Gestión de Cajas',
        subtitle: 'Terminales, turnos y configuración',
        emoji: '🖥️',
        content: {
          purpose: 'En "Ventas / Cajas" configuras y administras los terminales de venta (cajas POS). Cada terminal puede ser de tipo Detal (ventas al contado) o Mayor (ventas al crédito). Desde aquí abres turnos y accedes al punto de venta.',
          buttons: [
            { name: '+ Nueva Caja', what: 'Crea un nuevo terminal de venta. Define el nombre, tipo (Detal/Mayor) y el cajero responsable.', tip: 'Ponle nombres descriptivos: "Caja Mostrador", "Caja Almacén", "Mayor Caracas".' },
            { name: 'Abrir Turno / Ir al POS', what: 'Abre el punto de venta de esa caja. Desde ahí puedes registrar ventas.' },
            { name: 'Cerrar Turno (Arqueo)', what: 'Cierra el turno del día. Te pide contar el dinero en caja y genera un reporte Z con las ventas del turno. Compara lo que debería haber con lo que hay físicamente.', tip: 'Haz el arqueo AL FINAL del día, no durante las ventas.' },
            { name: 'Ver historial de arqueos', what: 'Muestra los cierres de turno anteriores con totales en USD y Bs. Puedes ver cualquier día pasado.' },
            { name: 'Copiar código de caja', what: 'Copia el ID único del terminal, útil para soporte técnico o para abrir el POS desde otro dispositivo.' },
            { name: 'Editar caja (lápiz)', what: 'Cambia el nombre, tipo o cajero asignado a este terminal.' },
            { name: 'Eliminar caja', what: 'Borra el terminal. Solo se puede si no tiene ventas activas. El historial se mantiene.' },
          ],
          emptyState: {
            why: 'No has creado ninguna caja todavía.',
            fix: 'Haz clic en "+ Nueva Caja", ponle un nombre (ej: "Caja Principal") y elige el tipo. Luego haz clic en "Abrir Turno" para empezar a vender.',
          },
          tips: [
            'Puedes tener múltiples cajas activas a la vez, una por cada empleado o punto de venta.',
            'El arqueo al final del día te dice si hay diferencias entre lo que vendiste y lo que hay en caja.',
            'Si hay una diferencia en el arqueo, revisa las ventas de ese día en el historial para encontrar el error.',
          ],
          faq: [
            { q: '¿Puedo tener un turno abierto varios días?', a: 'Técnicamente sí, pero no es recomendable. Haz el arqueo al final de cada día de trabajo para tener reportes limpios por fecha.' },
            { q: '¿Qué es la varianza en el arqueo?', a: 'Es la diferencia entre lo que el sistema dice que deberías tener (basado en ventas) y lo que contaste físicamente. Una varianza de $0 significa que cuadra perfecto.' },
            { q: '¿Qué hago si hay varianza negativa?', a: 'Varianza negativa = hay menos dinero del que debería haber. Posibles causas: vuelto incorrecto, venta no registrada, o dinero tomado sin registrar. Revisa el historial de ventas del turno.' },
          ],
        },
      },
      {
        id: 'arqueo-detalle',
        title: 'Cómo hacer un Arqueo de Caja',
        subtitle: 'Cerrar el día correctamente, paso a paso',
        emoji: '💰',
        content: {
          purpose: 'El arqueo de caja es el proceso de contar el dinero físico al final del turno y compararlo con lo que el sistema registró. Es la forma de verificar que no falta ni sobra dinero.',
          steps: [
            'Ve a Ventas/Cajas y busca la caja que quieres cerrar.',
            'Haz clic en "Cerrar Turno" (o el botón de arqueo).',
            'El sistema te muestra el monto esperado según las ventas del turno.',
            'Cuenta físicamente el dinero que hay en la caja.',
            'Ingresa los billetes: cuántos de $100, $50, $20, $10, $5, $1 tienes.',
            'Ingresa también el monto de transferencias si las manejas en esa caja.',
            'El sistema calcula la varianza automáticamente (diferencia entre esperado y contado).',
            'Agrega una nota si hay varianza (ej: "Vuelto a cliente Juan $2.50").',
            'Haz clic en "Confirmar Arqueo" para cerrar el turno.',
          ],
          concepts: [
            { term: 'Monto esperado', def: 'Lo que el sistema calculó que debería haber: efectivo recibido en ventas menos vueltos entregados.' },
            { term: 'Monto físico', def: 'Lo que contaste realmente en la caja.' },
            { term: 'Varianza', def: 'La diferencia: Físico − Esperado. Cero es perfecto. Positivo = hay más de lo esperado. Negativo = falta dinero.' },
            { term: 'Reporte Z', def: 'El resumen del turno: ventas por método de pago, total de ventas, varianza y hora de cierre. Se guarda y no se puede editar.' },
          ],
          tips: [
            'Haz el arqueo con el cajero presente para que pueda ver y firmar los resultados.',
            'Guarda el PDF del reporte Z como respaldo físico o digital.',
            'Una varianza pequeña (menos de $1) puede ser error de redondeo — es normal.',
          ],
          faq: [
            { q: '¿Puedo editar un arqueo después de confirmarlo?', a: 'No. Los arqueos son definitivos. Si hay un error, añade una nota explicando la corrección y regístrala en Contabilidad como asiento de ajuste.' },
            { q: '¿El arqueo cierra las ventas del día?', a: 'Sí. Después del arqueo ese turno queda cerrado y no se pueden agregar más ventas a él. Para vender más, debes abrir un nuevo turno.' },
          ],
        },
      },
      {
        id: 'pos-detal',
        title: 'POS Detal — Ventas al Contado',
        subtitle: 'Cómo registrar una venta paso a paso',
        emoji: '🛒',
        content: {
          purpose: 'El POS Detal es el punto de venta para ventas al contado. El cliente paga en el momento. Ideal para tiendas, negocios de consumo masivo y cualquier venta donde el cliente cancela de inmediato.',
          steps: [
            'Busca el producto: escribe el nombre en el buscador o escanea el código de barras con la cámara.',
            'Haz clic en el producto o presiona Enter para agregarlo al carrito.',
            'Ajusta la cantidad con los botones + / − o escribe el número directamente.',
            'Si aplica descuento, haz clic en el botón de descuento (%) e ingresa el valor.',
            'Selecciona el método de pago: Efectivo, Transferencia, Punto, Mixto.',
            'Si es efectivo, ingresa el monto que entrega el cliente para calcular el vuelto.',
            'Haz clic en "Registrar Venta" para finalizar.',
            'El sistema genera el recibo. Puedes imprimirlo, enviarlo por WhatsApp o descargarlo.',
          ],
          buttons: [
            { name: 'Búsqueda de producto', what: 'Escribe el nombre o código del producto. El sistema filtra en tiempo real.', tip: 'También puedes escanear el código de barras con la cámara si tienes esa opción activada.' },
            { name: 'Botón escáner (📷)', what: 'Abre la cámara del dispositivo para escanear códigos de barras. Solo disponible si está activado en Configuración → FISCAL/POS.' },
            { name: 'Botón + (en producto)', what: 'Agrega una unidad del producto al carrito.' },
            { name: '% Descuento', what: 'Aplica un descuento al total. Puedes elegir porcentaje (ej: 10%) o monto fijo (ej: $5). El descuento se aplica después del IVA.' },
            { name: 'Método: Efectivo', what: 'El cliente paga en billetes. Ingresa cuánto entrega y el sistema calcula el vuelto en USD y Bs.' },
            { name: 'Método: Transferencia', what: 'Pago por transferencia bancaria o Pago Móvil. Solicita el número de referencia.' },
            { name: 'Método: Punto de venta', what: 'Pago con tarjeta de débito/crédito. Registra la referencia del voucher.' },
            { name: 'Método: Mixto', what: 'El cliente paga con dos métodos a la vez (ej: parte en efectivo, parte en transferencia).' },
            { name: 'IGTF (3%)', what: 'Impuesto del 3% que aplica a pagos en moneda extranjera o divisas. Se activa automáticamente si está configurado en Ajustes Fiscales.' },
            { name: 'Registrar Venta', what: 'Confirma y guarda la venta. Descuenta el inventario automáticamente y genera el recibo.' },
            { name: 'Historial 🕐', what: 'Muestra las últimas 30 ventas de esta caja. Puedes ver el detalle o anular una venta desde aquí.' },
            { name: 'Anular venta', what: 'Cancela una venta ya registrada. Devuelve el stock al inventario y crea un movimiento de devolución. Solo se puede en el mismo turno.' },
          ],
          emptyState: {
            why: 'El carrito está vacío porque aún no has agregado productos.',
            fix: 'Busca un producto en la barra superior y haz clic en él o en el botón "+".',
          },
          faq: [
            { q: '¿Qué es el "Consumidor Final"?', a: 'Es el cliente que no quiere identificarse. Las ventas a Consumidor Final no generan deuda en CxC — son ventas anónimas al contado.' },
            { q: '¿Cómo calculo el vuelto?', a: 'Ingresa el monto que entregó el cliente en "Monto recibido". El sistema calcula automáticamente el vuelto en USD y en Bs.' },
            { q: '¿Se descuenta el inventario automáticamente?', a: 'Sí. Al registrar la venta, el stock de cada producto en el carrito se reduce automáticamente.' },
            { q: '¿Qué pasa si el cliente devuelve un producto?', a: 'Usa "Anular venta" desde el historial. Esto revierte la venta y devuelve el stock.' },
          ],
        },
      },
      {
        id: 'pos-mayor',
        title: 'POS Mayor — Ventas al Crédito',
        subtitle: 'Ventas con plazo y seguimiento de deuda',
        emoji: '🤝',
        content: {
          purpose: 'El POS Mayor es para ventas al crédito, donde el cliente lleva la mercancía y paga después. Registras la venta con un plazo (15, 30 o 45 días) y el sistema la agrega a la deuda del cliente en Cuentas por Cobrar.',
          buttons: [
            { name: 'Seleccionar cliente', what: 'Busca o crea el cliente al que le vendes. Es obligatorio para ventas al crédito — no puedes vender al crédito a Consumidor Final.' },
            { name: 'Condición de pago', what: 'Elige si es contado (paga ahora) o crédito a 15, 30 o 45 días. Si eliges crédito, la factura queda pendiente de cobro.' },
            { name: 'Lista de precios', what: 'POS Mayor puede tener precios diferentes al detal (precio mayorista). Se configura en el producto.' },
          ],
          tips: [
            'Las ventas al crédito aparecen automáticamente en Deudores/CxC para su seguimiento.',
            'Puedes ver el historial de deuda de cada cliente en CxC antes de venderle más.',
          ],
          faq: [
            { q: '¿Cómo registro el pago de una factura a crédito?', a: 'Ve a Deudores/CxC, busca al cliente, abre su ficha y usa el botón "Registrar Abono". Ingresa el monto recibido.' },
          ],
        },
      },
    ],
  },
  {
    id: 'inventario',
    label: 'Inventario',
    icon: <Package size={14} />,
    color: 'text-emerald-400',
    articles: [
      {
        id: 'inventario-overview',
        title: 'Inventario de Productos',
        subtitle: 'Cómo gestionar tu catálogo y stock',
        emoji: '📦',
        content: {
          purpose: 'El inventario es tu catálogo de productos. Aquí creas, editas y controlas el stock de todo lo que vendes. El sistema descuenta el stock automáticamente con cada venta y lo repone cuando anulas.',
          buttons: [
            { name: '+ Nuevo Producto', what: 'Abre el formulario para crear un producto nuevo. Necesitas al menos nombre y precio.' },
            { name: 'Editar (lápiz ✏️)', what: 'Modifica los datos del producto: nombre, precio, stock, código de barras, categoría.' },
            { name: 'Eliminar (papelera 🗑️)', what: 'Borra el producto del catálogo. ¡Cuidado! Esta acción no se puede deshacer. El historial de ventas que ya tiene este producto no se borra.' },
            { name: 'Buscar / filtrar', what: 'Busca productos por nombre o código. El filtro de categoría muestra solo los de esa categoría.' },
            { name: 'Exportar', what: 'Descarga el inventario completo en Excel o PDF.' },
            { name: 'Stock (número)', what: 'Cantidad disponible. Se actualiza automáticamente. Si llega a 0, el producto aparece como "Sin stock".' },
          ],
          concepts: [
            { term: 'Precio USD', def: 'Precio en dólares. El sistema lo convierte a bolívares automáticamente según la tasa del día.' },
            { term: 'Código de barras', def: 'Opcional. Si lo agregas, puedes buscarlo en el POS escaneando con la cámara.' },
            { term: 'Categoría', def: 'Agrupa productos para facilitar la búsqueda. Ejemplo: "Bebidas", "Ropa", "Electrónicos".' },
            { term: 'Stock mínimo', def: 'Alerta cuando el stock baja de este nivel. El sistema te notifica para que repongas.' },
          ],
          emptyState: {
            why: 'Aún no has creado productos en el inventario.',
            fix: 'Haz clic en "+ Nuevo Producto". Agrega el nombre, precio en USD y cantidad inicial. Luego guarda. Cuando hagas una venta, ese producto estará disponible en el POS.',
          },
          tips: [
            'Puedes importar productos masivamente desde un archivo Excel (función de importación en Herramientas).',
            'Si vendes servicios (no productos físicos), crea el servicio con stock = 999 para que nunca llegue a 0.',
            'El código de barras no es obligatorio, pero agiliza mucho el proceso de venta.',
          ],
          faq: [
            { q: '¿Por qué el stock quedó en negativo?', a: 'Puede pasar si vendes más de lo que tienes registrado. Para corregirlo, edita el producto y ajusta el stock manualmente.' },
            { q: '¿Puedo tener el mismo producto a diferentes precios?', a: 'Sí. Usa "Lista de precios" en el producto para configurar precio Detal y precio Mayor.' },
          ],
        },
      },
    ],
  },
  {
    id: 'cxc',
    label: 'Deudores / CxC',
    icon: <Wallet size={14} />,
    color: 'text-violet-400',
    articles: [
      {
        id: 'cxc-overview',
        title: 'Cuentas por Cobrar (CxC)',
        subtitle: 'Clientes, deudas y cobros',
        emoji: '💸',
        content: {
          purpose: 'Aquí llevas el control de todo lo que te deben tus clientes. Cada factura a crédito aparece aquí. Puedes registrar abonos, ver el historial de pagos y saber exactamente cuánto debe cada cliente.',
          buttons: [
            { name: '+ Nuevo Cliente', what: 'Agrega un cliente nuevo con nombre, cédula/RIF y teléfono. Una vez creado, puedes facturarle y rastrear su deuda.' },
            { name: 'Ver ficha del cliente', what: 'Abre el historial completo: facturas emitidas, abonos recibidos, saldo actual.' },
            { name: 'Registrar Abono', what: 'Registra un pago parcial o total del cliente. El saldo se actualiza automáticamente.' },
            { name: 'Nueva Factura (desde CxC)', what: 'Crea una factura directamente a este cliente sin pasar por el POS.' },
            { name: 'Semáforo de color', what: 'Verde = solvente. Amarillo = deuda reciente (menos de 30 días). Rojo = deuda vencida o alta.' },
            { name: 'Exportar estado de cuenta', what: 'Genera un PDF o Excel con el historial del cliente para enviárselo.' },
          ],
          concepts: [
            { term: 'Saldo pendiente', def: 'Cuánto debe el cliente en este momento. Es la suma de sus facturas menos sus abonos.' },
            { term: 'Factura', def: 'Registro de una venta a crédito. El cliente lleva el producto y promete pagar después.' },
            { term: 'Abono', def: 'Pago parcial o total de una factura. Cada abono reduce el saldo pendiente.' },
            { term: 'Consumidor Final', def: 'Venta a cliente anónimo (sin nombre). NO aparece en CxC porque no tiene deuda asociada.' },
          ],
          emptyState: {
            why: 'No tienes clientes registrados todavía.',
            fix: 'Haz clic en "+ Nuevo Cliente" y agrega el nombre, cédula/RIF y teléfono. También puedes agregar clientes desde el POS Mayor al crear una venta a crédito.',
          },
          tips: [
            'Filtra por "Deuda vencida" para ver quién lleva más tiempo sin pagar.',
            'Puedes enviar el estado de cuenta directamente al WhatsApp del cliente.',
            'Establece un límite de crédito por cliente para no venderle más de lo que puede pagar.',
          ],
          faq: [
            { q: '¿Por qué un cliente no aparece en CxC?', a: 'Si sus ventas fueron a "Consumidor Final" o todas están marcadas como pagadas, no aparece en la lista de deudores.' },
            { q: '¿Puedo borrar un cliente?', a: 'Solo si no tiene movimientos asociados. Si tiene facturas o abonos, no se puede borrar (para mantener el historial).' },
          ],
        },
      },
    ],
  },
  {
    id: 'cxp',
    label: 'Gastos / CxP',
    icon: <Receipt size={14} />,
    color: 'text-rose-400',
    articles: [
      {
        id: 'cxp-overview',
        title: 'Cuentas por Pagar (CxP)',
        subtitle: 'Proveedores y gastos del negocio',
        emoji: '🏭',
        content: {
          purpose: 'Aquí registras todo lo que gasta tu empresa: compras a proveedores, servicios, alquiler, electricidad, etc. El sistema lleva el control de cuánto debes a cada proveedor y qué gastos has tenido.',
          buttons: [
            { name: '+ Nuevo Proveedor', what: 'Agrega un proveedor nuevo (nombre, RIF, contacto).' },
            { name: '+ Registrar Gasto / Factura', what: 'Agrega una compra o gasto. Ingresa el monto, concepto y proveedor. Si es a crédito, queda como pendiente de pago.' },
            { name: 'Registrar Pago', what: 'Marca un gasto como pagado. El saldo del proveedor se actualiza.' },
            { name: 'Ver historial', what: 'Lista todos los gastos registrados con fecha, monto y estado de pago.' },
          ],
          emptyState: {
            why: 'No has registrado proveedores ni gastos todavía.',
            fix: 'Haz clic en "+ Nuevo Proveedor" y agrega el primero. Luego usa "+ Registrar Gasto" para registrar lo que compraste.',
          },
          tips: [
            'Registrar todos tus gastos aquí te permite calcular la utilidad real de tu negocio.',
            'Separa los gastos en categorías (Mercancía, Servicios, Alquiler) para análisis más claro.',
          ],
        },
      },
    ],
  },
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    icon: <BookOpen size={14} />,
    color: 'text-blue-400',
    articles: [
      {
        id: 'contabilidad-overview',
        title: 'Módulo de Contabilidad',
        subtitle: 'Libro diario y registros contables',
        emoji: '📚',
        content: {
          purpose: 'La sección de Contabilidad muestra el libro mayor y el libro diario del negocio. Registra todos los movimientos de dinero: ventas, cobros, gastos y pagos. Sirve para llevar las cuentas ordenadas y generar reportes financieros.',
          buttons: [
            { name: '+ Nuevo Asiento', what: 'Crea un asiento contable manual (para ajustes o movimientos que el sistema no genera automáticamente).' },
            { name: 'Filtrar por fecha', what: 'Muestra solo los movimientos de un rango de fechas específico.' },
            { name: 'Exportar', what: 'Descarga el libro en formato Excel o PDF.' },
          ],
          concepts: [
            { term: 'Débito', def: 'Dinero que entra o activo que aumenta. En términos simples: lo que recibes.' },
            { term: 'Crédito', def: 'Dinero que sale o pasivo que aumenta. En términos simples: lo que pagas.' },
            { term: 'Asiento contable', def: 'Registro de un movimiento financiero con su débito y crédito correspondiente.' },
          ],
          tips: [
            'Los movimientos se registran automáticamente cuando haces ventas, cobros y gastos. Solo necesitas revisar y exportar.',
          ],
        },
      },
    ],
  },
  {
    id: 'rrhh',
    label: 'RRHH / Nómina',
    icon: <Users size={14} />,
    color: 'text-cyan-400',
    articles: [
      {
        id: 'rrhh-overview',
        title: 'Recursos Humanos y Nómina',
        subtitle: 'Empleados, salarios y adelantos',
        emoji: '👥',
        content: {
          purpose: 'El módulo de RRHH te permite gestionar tus empleados, calcular la nómina, registrar adelantos de salario y llevar el control de pagos. El sistema convierte automáticamente los salarios según la tasa del día.',
          buttons: [
            { name: '+ Nuevo Empleado', what: 'Registra un empleado con nombre, cédula, cargo y salario en USD.' },
            { name: 'Calcular Nómina', what: 'Genera automáticamente la nómina del período con todos los empleados, descontando adelantos.' },
            { name: 'Registrar Adelanto', what: 'Registra un adelanto de salario al empleado. Se descuenta en la próxima nómina.' },
            { name: 'Ver historial de pagos', what: 'Historial de todas las nóminas pagadas a este empleado.' },
            { name: 'Exportar nómina', what: 'Descarga la nómina en Excel o PDF para firmas o archivo.' },
          ],
          emptyState: {
            why: 'No tienes empleados registrados todavía.',
            fix: 'Haz clic en "+ Nuevo Empleado". Agrega nombre, cédula, cargo y salario mensual en USD. Una vez creado, aparecerá en el cálculo de nómina.',
          },
          tips: [
            'Los salarios se ingresan en USD y el sistema calcula el equivalente en Bs según la tasa activa.',
            'Si tienes empleados con salario mixto (parte USD, parte Bs), anótalo en el campo de observaciones.',
          ],
          faq: [
            { q: '¿Cómo registro que ya pagué la nómina?', a: 'Calcula la nómina, revisa los valores y haz clic en "Marcar como pagada". Esto queda en el historial.' },
            { q: '¿Los adelantos se descuentan solos?', a: 'Sí. Al calcular la nómina, el sistema descuenta automáticamente los adelantos registrados del período.' },
          ],
        },
      },
    ],
  },
  {
    id: 'tasas',
    label: 'Tasas de Cambio',
    icon: <TrendingUp size={14} />,
    color: 'text-amber-400',
    articles: [
      {
        id: 'tasas-overview',
        title: 'Tasas de Cambio',
        subtitle: 'BCV y tasa interna del negocio',
        emoji: '💱',
        content: {
          purpose: 'Las tasas de cambio son el "corazón" de Dualis. Todo lo que manejas en USD necesita convertirse a Bs para operar en Venezuela. Aquí actualizas la tasa del día y puedes ver el historial de tasas.',
          buttons: [
            { name: 'Actualizar Tasa BCV', what: 'Ingresa el valor oficial del Banco Central de Venezuela. Busca "Tasa BCV" en Twitter o en el portal del BCV.' },
            { name: 'Tasa Grupo / Interna', what: 'Tasa que usa tu empresa internamente (puede ser diferente al BCV). Útil si compras divisas a un tipo diferente.' },
            { name: 'Ver historial', what: 'Muestra cómo ha cambiado la tasa a lo largo del tiempo. Útil para análisis.' },
          ],
          concepts: [
            { term: 'Tasa BCV', def: 'Tasa oficial publicada por el Banco Central de Venezuela. Se actualiza cada día hábil.' },
            { term: 'Tasa Grupo', def: 'Tasa interna que define tu empresa. Puede ser igual o diferente al BCV según tu política de precios.' },
          ],
          emptyState: {
            why: 'No hay tasas registradas porque nunca se actualizaron.',
            fix: 'Haz clic en "+ Nueva Tasa", ingresa el valor actual del BCV (ej: 36.50) y guarda. El sistema lo usará para todas las conversiones desde ese momento.',
          },
          tips: [
            'Actualiza la tasa CADA DÍA antes de abrir las ventas. Una tasa desactualizada genera precios incorrectos.',
            'Puedes ver la tasa actual en la barra superior del sistema (topbar).',
          ],
          faq: [
            { q: '¿Dónde busco la tasa del BCV?', a: 'En el sitio oficial del BCV (bcv.org.ve), en Twitter buscando "Tasa BCV", o en apps de tasas venezolanas.' },
            { q: '¿Qué pasa si no actualizo la tasa?', a: 'El sistema sigue usando la última tasa registrada. Si el bolívar se mueve mucho, tus precios en Bs quedarán desactualizados.' },
          ],
        },
      },
    ],
  },
  {
    id: 'reportes',
    label: 'Estadísticas',
    icon: <BarChart3 size={14} />,
    color: 'text-violet-400',
    articles: [
      {
        id: 'reportes-overview',
        title: 'Reportes y Estadísticas',
        subtitle: 'Ventas, comisiones y P&L explicados',
        emoji: '📈',
        content: {
          purpose: 'Los reportes te dan una visión profunda del desempeño de tu negocio. Puedes ver ventas por período, comisiones de vendedores, y el Estado de Resultados (P&L) para saber exactamente si estás ganando o perdiendo.',
          concepts: [
            { term: 'P&L (Estado de Resultados)', def: 'Ventas Brutas − IVA − IGTF = Ventas Netas. Ventas Netas − Gastos = Utilidad Bruta. Si es positivo, estás ganando.' },
            { term: 'Comisiones por vendedor', def: 'Calcula cuánto ganó cada vendedor basado en el porcentaje configurado sobre sus ventas.' },
            { term: 'Ventas brutas', def: 'Total de todas las facturas del período, sin descontar nada.' },
            { term: 'IVA', def: 'Impuesto al Valor Agregado (actualmente 16% en Venezuela). Se resta de las ventas brutas.' },
            { term: 'IGTF', def: 'Impuesto a las Grandes Transacciones Financieras (3%). Aplica a pagos en divisas.' },
            { term: 'Utilidad bruta', def: 'Lo que queda después de restar los gastos. Si es negativa, estás perdiendo dinero.' },
          ],
          buttons: [
            { name: 'Filtrar por período', what: 'Elige el mes o rango de fechas a analizar.' },
            { name: 'Exportar Excel', what: 'Descarga el reporte completo en hoja de cálculo.' },
            { name: 'Exportar PDF', what: 'Genera un PDF formateado para entregar o archivar.' },
          ],
          emptyState: {
            why: 'No hay datos para mostrar porque no tienes ventas o gastos en el período seleccionado.',
            fix: 'Cambia el filtro de fecha a un período donde ya tengas ventas registradas, o comienza a registrar ventas desde el POS.',
          },
        },
      },
    ],
  },
  {
    id: 'fiscal',
    label: 'Gestión Fiscal',
    icon: <Scale size={14} />,
    color: 'text-indigo-300',
    articles: [
      {
        id: 'fiscal-overview',
        title: 'Gestión Fiscal',
        subtitle: 'Arqueos, libros y configuración tributaria',
        emoji: '🏛️',
        content: {
          purpose: 'La sección Fiscal agrupa todo lo relacionado con el control tributario de tu empresa. Incluye el arqueo de caja (cierre de turno), configuración de IVA e IGTF, y —próximamente— los libros de ventas y compras para el SENIAT.',
          buttons: [
            { name: 'Arqueos / Z', what: 'Historial de todos los cierres de turno. Ver cuánto se vendió en cada turno, por terminal.' },
            { name: 'Config. Fiscal', what: 'Activa o desactiva el IVA (16%), el IGTF (3%), el escáner de cámara y el número de control de facturas.' },
          ],
          concepts: [
            { term: 'Arqueo de caja', def: 'Conteo físico del dinero al cerrar el turno. Se compara con lo que el sistema dice que debería haber. La diferencia es la varianza.' },
            { term: 'Reporte Z', def: 'Resumen del turno: ventas totales, por método de pago, y diferencia de caja.' },
            { term: 'IVA (16%)', def: 'Se agrega automáticamente a cada venta si está activado.' },
            { term: 'IGTF (3%)', def: 'Se agrega cuando el cliente paga en divisas (efectivo en USD, etc.).' },
          ],
          tips: [
            'Los módulos de Libro de Ventas, Libro de Compras y Declaración IVA están en desarrollo y pendientes de homologación SENIAT — aparecen como "Próximamente".',
            'El arqueo se hace desde Ventas/Cajas → botón "Cerrar Turno" en el terminal correspondiente.',
          ],
        },
      },
    ],
  },
  {
    id: 'vision',
    label: 'VisionLab IA',
    icon: <Eye size={14} />,
    color: 'text-purple-400',
    articles: [
      {
        id: 'vision-overview',
        title: 'VisionLab — Auditoría con IA',
        subtitle: 'Análisis inteligente de tu negocio',
        emoji: '🤖',
        content: {
          purpose: 'VisionLab usa Inteligencia Artificial para analizar tus datos y detectar anomalías, tendencias y oportunidades. Puede revisar si hay ventas inusuales, días de bajo rendimiento, productos sin movimiento o inconsistencias en los pagos.',
          buttons: [
            { name: 'Analizar', what: 'Inicia el análisis IA de tus datos del período seleccionado. Puede tardar unos segundos.', tip: 'Selecciona el período antes de analizar: última semana, último mes, o rango personalizado.' },
            { name: 'Ver reporte completo', what: 'Muestra los hallazgos de la IA con explicaciones en español. Cada hallazgo incluye por qué es relevante y qué puedes hacer.' },
            { name: 'Exportar análisis', what: 'Descarga el reporte de la IA en PDF para compartir con tu contador o socio.' },
            { name: 'Chat con IA (💬)', what: 'Escríbele preguntas en español directamente: "¿Cuál fue mi mejor día de ventas?" o "¿Qué producto se mueve más?".' },
          ],
          emptyState: {
            why: 'VisionLab necesita al menos 7 días de ventas para generar análisis significativos. Con menos datos, la IA no puede detectar tendencias.',
            fix: 'Continúa usando el sistema normalmente. Después de una semana de ventas, regresa aquí y haz clic en "Analizar".',
          },
          tips: [
            'VisionLab es más preciso con más datos. Después de un mes de uso, los análisis serán muy detallados.',
            'Puedes hacerle preguntas específicas en el chat. Ejemplos: "¿Quién es mi cliente más frecuente?", "¿En qué horario vendo más?"',
            'Los hallazgos de la IA son sugerencias — siempre usa tu criterio de negocio.',
          ],
          faq: [
            { q: '¿La IA tiene acceso a datos sensibles de mis clientes?', a: 'La IA solo analiza datos agregados (totales, tendencias). No envía datos a terceros — el análisis ocurre dentro de tu sesión.' },
            { q: '¿Por qué el análisis tardó mucho?', a: 'Depende de cuántos datos tienes. Si tienes meses de ventas, puede tardar hasta 30 segundos. Es normal.' },
          ],
        },
      },
      {
        id: 'auditoria-log',
        title: 'Auditoría — Log de Acciones',
        subtitle: 'Quién hizo qué y cuándo en el sistema',
        emoji: '🔍',
        content: {
          purpose: 'El log de auditoría registra cada acción importante realizada en el sistema: quién creó una venta, quién anuló un movimiento, quién cambió un precio. Sirve para detectar errores o acciones no autorizadas.',
          buttons: [
            { name: 'Filtrar por usuario', what: 'Muestra solo las acciones realizadas por un usuario específico. Útil para revisar qué hizo un empleado.' },
            { name: 'Filtrar por acción', what: 'Filtra por tipo de acción: ventas, anulaciones, cambios de precio, logins, etc.' },
            { name: 'Filtrar por fecha', what: 'Rango de fechas para acotar la búsqueda.' },
            { name: 'Exportar (PDF/CSV/Excel)', what: 'Descarga el log filtrado para archivo o revisión externa.' },
            { name: 'Ver detalle (fila)', what: 'Haz clic en cualquier fila para ver los datos completos de esa acción: valores antes y después, IP, hora exacta.' },
          ],
          concepts: [
            { term: 'Acción', def: 'Qué se hizo: VENTA_CREADA, VENTA_ANULADA, PRODUCTO_EDITADO, LOGIN, etc.' },
            { term: 'Entidad', def: 'A qué se le hizo la acción: el ID del movimiento, del producto, del cliente.' },
            { term: 'Usuario', def: 'El correo del usuario que realizó la acción.' },
          ],
          emptyState: {
            why: 'No hay acciones registradas en el período seleccionado.',
            fix: 'Cambia el rango de fechas o verifica que las acciones auditables (ventas, anulaciones) se hayan realizado en el sistema.',
          },
          tips: [
            'Revisa el log de auditoría si sospechas que alguien anuló ventas sin autorización.',
            'Las anulaciones siempre quedan registradas con el usuario que las hizo — no se pueden borrar del log.',
          ],
        },
      },
    ],
  },
  {
    id: 'conciliacion',
    label: 'Conciliación',
    icon: <Scale size={14} />,
    color: 'text-teal-400',
    articles: [
      {
        id: 'conciliacion-overview',
        title: 'Conciliación Bancaria',
        subtitle: 'Compara lo que registraste con lo del banco',
        emoji: '🏦',
        content: {
          purpose: 'La conciliación bancaria es el proceso de comparar tus registros internos de pagos (transferencias, depósitos) con los movimientos reales de tu cuenta bancaria. Si hay diferencias, las detectas aquí antes de que se conviertan en un problema.',
          steps: [
            'Descarga el estado de cuenta de tu banco (PDF o Excel).',
            'Entra a Conciliación y selecciona el período del estado de cuenta.',
            'Marca cada movimiento bancario como "conciliado" si ya existe en el sistema.',
            'Los que queden sin marcar son los que faltan en el sistema — debes registrarlos.',
            'Al final, el saldo del banco debe coincidir con el saldo del sistema.',
          ],
          buttons: [
            { name: 'Importar movimientos bancarios', what: 'Sube el estado de cuenta del banco en formato Excel/CSV. El sistema los compara automáticamente con los registros internos.' },
            { name: 'Marcar como conciliado', what: 'Confirma que ese movimiento bancario ya está registrado en el sistema. Lo marca en verde.' },
            { name: 'Registrar faltante', what: 'Si hay un movimiento en el banco que no está en el sistema, este botón lo registra directamente.' },
            { name: 'Ver diferencias', what: 'Muestra solo los movimientos no conciliados (en rojo). Estos son los que necesitas resolver.' },
            { name: 'Exportar reporte', what: 'Genera un PDF con el resultado de la conciliación: qué cuadra y qué no.' },
          ],
          concepts: [
            { term: 'Conciliado', def: 'Un movimiento que existe tanto en el banco como en el sistema. Todo bien.' },
            { term: 'Pendiente', def: 'Un movimiento que está en el banco pero no en el sistema (o viceversa). Necesita atención.' },
            { term: 'Diferencia', def: 'La suma de todos los movimientos pendientes. Idealmente debe ser $0.' },
          ],
          emptyState: {
            why: 'No has importado ningún estado de cuenta bancario todavía.',
            fix: 'Descarga el estado de cuenta de tu banco (pídelo en la app del banco como Excel o CSV) e impórtalo usando el botón "Importar movimientos bancarios".',
          },
          tips: [
            'Concilia al menos una vez por semana para evitar acumular diferencias.',
            'Si hay una diferencia que no puedes explicar, revisa el log de auditoría para ver si alguien anuló un movimiento.',
          ],
          faq: [
            { q: '¿Por qué hay diferencias entre el banco y el sistema?', a: 'Las causas más comunes: 1) Transferencias recibidas que no se registraron como abono en CxC. 2) Pagos hechos que no se registraron como gasto en CxP. 3) Movimientos bancarios de comisiones o impuestos bancarios no registrados.' },
            { q: '¿Qué hago si hay un movimiento en el banco que no reconozco?', a: 'Primero consulta con tu banco. Si es un error del banco, solicita la reversión. Si es un movimiento legítimo que olvidaste registrar, créalo en el sistema.' },
          ],
        },
      },
    ],
  },
  {
    id: 'comparar',
    label: 'Comparar Libros',
    icon: <BookOpen size={14} />,
    color: 'text-orange-400',
    articles: [
      {
        id: 'comparar-overview',
        title: 'Comparar Libros',
        subtitle: 'Cruza ventas reales contra registros contables',
        emoji: '⚖️',
        content: {
          purpose: 'La herramienta de comparación de libros te permite cruzar datos de diferentes fuentes: las ventas del POS contra los movimientos contables, o el libro de ventas contra el inventario consumido. Detecta inconsistencias que podrían indicar errores o faltantes.',
          buttons: [
            { name: 'Seleccionar período', what: 'Elige el rango de fechas a comparar. Recomendado: mes por mes.' },
            { name: 'Comparar', what: 'Ejecuta la comparación entre los dos libros seleccionados. Resalta las diferencias en rojo.' },
            { name: 'Ver solo diferencias', what: 'Filtra para mostrar únicamente las filas donde hay discrepancia.' },
            { name: 'Exportar comparación', what: 'Descarga el resultado en Excel para análisis detallado o para compartir con el contador.' },
          ],
          concepts: [
            { term: 'Libro A vs Libro B', def: 'Compara dos fuentes de datos. Ejemplo: Ventas POS (Libro A) vs Movimientos CxC (Libro B). Deberían coincidir.' },
            { term: 'Diferencia', def: 'Un monto que aparece en un libro pero no en el otro, o con valor diferente.' },
            { term: 'Cuadre', def: 'Cuando los totales de ambos libros son iguales. El objetivo de la conciliación.' },
          ],
          emptyState: {
            why: 'Selecciona un período y haz clic en "Comparar" para ver los resultados.',
            fix: 'Si no tienes datos, primero registra ventas y gastos en el sistema durante al menos una semana.',
          },
          tips: [
            'Compara mensualmente, no deja que se acumulen los meses sin revisar.',
            'Una diferencia de $0 es lo ideal. Diferencias pequeñas pueden ser por redondeo de tasas.',
          ],
          faq: [
            { q: '¿Para qué sirve comparar si el sistema lo hace todo automático?', a: 'El sistema registra todo lo que le dices que registre. Si alguien olvidó registrar un pago, el sistema no lo sabe. La comparación detecta esos huecos.' },
          ],
        },
      },
    ],
  },
  {
    id: 'equipo',
    label: 'Equipo y Roles',
    icon: <Shield size={14} />,
    color: 'text-sky-400',
    articles: [
      {
        id: 'equipo-overview',
        title: 'Gestión de Equipo y Roles',
        subtitle: 'Invitar miembros, aprobar accesos y asignar roles',
        emoji: '👥',
        content: {
          purpose: 'Desde Configuración → Equipo puedes gestionar quién tiene acceso a tu sistema y qué pueden ver o hacer. Cada persona tiene un rol que define sus permisos.',
          concepts: [
            { term: 'Owner (Dueño)', def: 'Acceso total a todo el sistema. Solo puede haber uno. El que crea la empresa.' },
            { term: 'Admin', def: 'Casi igual al Owner. Puede gestionar el equipo pero no puede cambiar el plan de suscripción.' },
            { term: 'Ventas', def: 'Puede usar el POS, ver clientes y registrar ventas. No ve contabilidad ni nómina.' },
            { term: 'Auditor', def: 'Solo puede ver: reportes, contabilidad, CxC, CxP. No puede crear ni editar.' },
            { term: 'Staff', def: 'Acceso básico: solo puede usar el POS. No ve ningún módulo financiero.' },
          ],
          buttons: [
            { name: 'Código de Espacio', what: 'Código único de tu empresa. Compártelo con quien quieres invitar. Ellos lo usan al registrarse.' },
            { name: 'Aprobar solicitud', what: 'Alguien intentó unirse con tu código. Aprueba y asígnale un rol.' },
            { name: 'Rechazar solicitud', what: 'Deniega el acceso a alguien que no reconoces.' },
            { name: 'Cambiar rol (selector)', what: 'Cambia el rol de un miembro activo. Útil si un empleado asciende o cambia de función.' },
            { name: 'Eliminar miembro (X rojo)', what: 'Revoca el acceso al sistema. El usuario ya no puede iniciar sesión en tu empresa.' },
            { name: 'Permisos por Rol (toggles)', what: 'Define exactamente qué secciones puede ver cada rol. Los cambios se aplican inmediatamente.' },
            { name: 'Presets (Cajero, Vendedor…)', what: 'Aplica una configuración de permisos predefinida al rol seleccionado con un solo clic.' },
          ],
          tips: [
            'Cada vez que alguien intenta unirse a tu empresa, recibes una notificación (campana 🔔) y aparece aquí como "Solicitud pendiente".',
            'Puedes personalizar exactamente qué ve cada rol usando los toggles de permisos.',
          ],
          faq: [
            { q: '¿Cómo invito a mi empleado?', a: 'Dile que se registre en el sistema y que use tu "Código de Espacio" al momento de registrarse. Cuando lo haga, verás su solicitud aquí para aprobarla.' },
            { q: '¿Qué pasa si elimino a un miembro?', a: 'Pierde acceso inmediatamente. Su historial de ventas y movimientos permanece intacto en el sistema.' },
          ],
        },
      },
    ],
  },
  {
    id: 'config',
    label: 'Configuración',
    icon: <Settings2 size={14} />,
    color: 'text-slate-400',
    articles: [
      {
        id: 'config-overview',
        title: 'Configuración del Sistema',
        subtitle: 'Todas las opciones y qué hacen',
        emoji: '⚙️',
        content: {
          purpose: 'La configuración está dividida en secciones (tabs). Aquí personalizas todos los aspectos del sistema: datos de tu empresa, IVA, diseño, idioma y más. Solo los administradores y el dueño pueden acceder.',
          concepts: [
            { term: 'Tab Identidad', def: 'Nombre de empresa, RIF, teléfono, dirección, email. Estos datos aparecen en los recibos y facturas.' },
            { term: 'Tab Facturación / FISCAL', def: 'Configura IVA (16%), IGTF (3%), escáner de cámara y número de control de facturas.' },
            { term: 'Tab Seguridad', def: 'PIN Maestro para operaciones sensibles (anular, eliminar). También muestra el log de auditoría.' },
            { term: 'Tab Apariencia', def: 'Idioma (Español/English/عربي), modo oscuro/claro, tamaño de fuente, color de acento de la interfaz.' },
            { term: 'Tab Funciones', def: 'Activa/desactiva módulos opcionales: chat de equipo, comparación de libros, IA, múltiples monedas, etc.' },
            { term: 'Tab Equipo', def: 'Gestiona miembros, aprueba solicitudes de acceso y configura permisos por rol.' },
          ],
          buttons: [
            { name: 'Guardar (botón azul/morado)', what: 'Guarda los cambios de la sección activa. Cada tab tiene su propio botón de guardar. Si cambias de tab sin guardar, los cambios se pierden.', tip: 'Siempre haz clic en Guardar antes de cambiar de tab.' },
            { name: 'Toggle IVA', what: 'Activa o desactiva el cálculo automático del IVA (16%) en todas las ventas. Azul = activo.' },
            { name: 'Toggle IGTF', what: 'Activa el IGTF (3%) para pagos en divisas. Si tus clientes pagan en USD o EUR, actívalo.' },
            { name: 'Toggle Escáner Cámara', what: 'Habilita el botón de cámara en el POS para escanear códigos de barras. Requiere cámara en el dispositivo.' },
            { name: 'Copiar código de espacio', what: 'Copia el código único de tu empresa para compartirlo con nuevos miembros al momento de registrarse.' },
            { name: 'Toggle (cualquier función)', what: 'Activa o desactiva esa función. Azul/morado = activo. Gris = desactivado. El cambio aplica inmediatamente para todos en la empresa.' },
            { name: 'Modo oscuro / claro', what: 'Cambia el tema de la interfaz. Oscuro = fondo negro (menos fatiga visual). Claro = fondo blanco. Se guarda automáticamente.' },
            { name: 'Selector de idioma', what: 'Cambia el idioma de la interfaz. Aplica inmediatamente, no necesita guardar.' },
            { name: 'PIN Maestro (configurar)', what: 'Define un PIN de 4 dígitos para operaciones sensibles. Si lo olvidas, contacta al soporte — no hay forma de recuperarlo desde el sistema.' },
          ],
          tips: [
            'El PIN Maestro es DIFERENTE a la contraseña de tu cuenta. Es un segundo nivel de seguridad para operaciones importantes.',
            'Los cambios de Apariencia (idioma, tema) aplican solo a tu cuenta. Cada miembro puede tener su propia apariencia.',
            'Los cambios de Facturación (IVA, IGTF) aplican a TODA la empresa y todos los terminales.',
          ],
          faq: [
            { q: '¿Qué pasa si desactivo el IVA?', a: 'Las ventas nuevas no incluirán IVA. Las ventas ya registradas no se modifican — el IVA quedó fijo en el momento de la venta.' },
            { q: '¿Puedo cambiar el RIF después de haberlo configurado?', a: 'Sí. Ve a Identidad, edita el campo RIF y guarda. Pero recuerda que los recibos ya generados no cambian retroactivamente.' },
            { q: '¿Por qué no veo el tab de Equipo?', a: 'El tab de Equipo solo lo ven los dueños y administradores. Si no lo ves, tu rol no tiene ese permiso.' },
          ],
        },
      },
    ],
  },
  {
    id: 'faq',
    label: 'Preguntas Frecuentes',
    icon: <HelpCircle size={14} />,
    color: 'text-amber-400',
    articles: [
      {
        id: 'flujos-comunes',
        title: 'Flujos de Trabajo Comunes',
        subtitle: 'Cómo completar las tareas más frecuentes',
        emoji: '🔄',
        content: {
          purpose: 'Guías rápidas para completar los procesos más comunes en Dualis. Si eres nuevo, empieza por aquí.',
          steps: [
            '─── COBRARLE A UN CLIENTE QUE DEBE ───',
            '1. Ve a Deudores/CxC → busca el cliente.',
            '2. Haz clic en su nombre para abrir su ficha.',
            '3. Haz clic en "Registrar Abono".',
            '4. Ingresa el monto que pagó y el método (efectivo/transferencia).',
            '5. Guarda. El saldo del cliente se actualiza automáticamente.',
            '─── CERRAR EL DÍA / ARQUEO ───',
            '1. Ve a Ventas/Cajas.',
            '2. Busca la caja activa → haz clic en "Cerrar Turno".',
            '3. Cuenta el dinero físico e ingrésalo por denominaciones.',
            '4. El sistema muestra la varianza. Agrega una nota si es necesario.',
            '5. Confirma el arqueo. Se genera el Reporte Z automáticamente.',
            '─── ANULAR UNA VENTA POR ERROR ───',
            '1. Ve al POS donde se registró la venta.',
            '2. Haz clic en el ícono de historial (reloj 🕐) arriba a la derecha.',
            '3. Busca la venta por fecha u hora.',
            '4. Haz clic en "Anular". Confirma el mensaje de alerta.',
            '5. El stock vuelve al inventario y se crea un abono de reverso.',
            '─── AGREGAR UN PRODUCTO NUEVO ───',
            '1. Ve a Inventario → "+ Nuevo Producto".',
            '2. Ingresa: nombre, precio en USD, stock inicial.',
            '3. Opcional: categoría, código de barras, precio mayorista, stock mínimo.',
            '4. Guarda. El producto ya aparece disponible en el POS.',
            '─── PAGAR LA NÓMINA ───',
            '1. Ve a RRHH → Nómina.',
            '2. Selecciona el período (quincena o mes).',
            '3. Revisa los cálculos: salarios, adelantos descontados, totales.',
            '4. Haz clic en "Calcular" para ver los montos finales.',
            '5. Haz clic en "Marcar como pagada" para registrar el pago en el sistema.',
          ],
          tips: [
            'Guarda este flujo como referencia. Con el tiempo todo se vuelve automático.',
            'Si algo no funciona como se describe aquí, verifica que tu rol tiene permisos para esa acción.',
          ],
        },
      },
      {
        id: 'faq-general',
        title: 'Preguntas Frecuentes',
        subtitle: 'Las dudas más comunes resueltas',
        emoji: '❓',
        content: {
          purpose: 'Respuestas directas a las dudas más comunes de los usuarios de Dualis.',
          faq: [
            { q: '¿Por qué el sistema dice que la tasa no está actualizada?', a: 'La tasa BCV no se ha actualizado hoy. Ve a Tasas de Cambio → ingresa el valor del BCV del día → guarda.' },
            { q: '¿Por qué no veo ciertos módulos en el sidebar?', a: 'Depende de tu rol. Si tienes rol "Ventas" o "Staff", solo ves lo que tu administrador te permitió. Contacta al dueño de la empresa para cambiar tus permisos.' },
            { q: '¿Por qué el inventario no se descuenta?', a: 'El inventario se descuenta solo si el producto tiene stock registrado y fue agregado correctamente al carrito del POS. Verifica que el producto esté en el inventario con stock > 0.' },
            { q: '¿Puedo usar el sistema desde el teléfono?', a: 'Sí. Abre la URL en el navegador de tu celular. El sistema es responsive. Para el escáner de cámara, necesitas un teléfono con cámara.' },
            { q: '¿Cómo cambio la contraseña?', a: 'Ve a tu perfil (icono de usuario arriba a la derecha) → "Cambiar contraseña". Se enviará un correo a tu email registrado.' },
            { q: '¿Qué hago si hay un error o algo no funciona?', a: 'Primero intenta recargar la página (F5). Si el error persiste, anota qué estabas haciendo y contacta al soporte técnico por WhatsApp.' },
            { q: '¿Los datos se guardan automáticamente?', a: 'Sí. Todo se guarda automáticamente en la nube al instante. No hay botón de "guardar todo" — cada acción se registra de inmediato.' },
            { q: '¿Qué significa "Período de prueba"?', a: 'Estás usando Dualis en su fase beta. El sistema es funcional pero algunos módulos (factura SENIAT, libros IVA) aún no están homologados oficialmente.' },
            { q: '¿Cómo anulo una venta registrada por error?', a: 'Ve a Ventas/Cajas → abre el POS donde se hizo la venta → botón de historial (🕐) → busca la venta → botón "Anular". El stock se devuelve automáticamente.' },
            { q: '¿Puedo exportar mis datos?', a: 'Sí. En casi todos los módulos (inventario, CxC, reportes, auditoría) hay un botón de exportar en Excel, PDF o CSV.' },
          ],
        },
      },
    ],
  },
];

// ─── Components ───────────────────────────────────────────────────────────────
const ArticleView: React.FC<{ article: HelpArticle; onBack: () => void }> = ({ article, onBack }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { content } = article;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-slate-400 dark:text-white/30 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
        ← Volver
      </button>

      <div>
        <span className="text-4xl mb-3 block">{article.emoji}</span>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{article.title}</h2>
        <p className="text-sm text-slate-500 dark:text-white/40 mt-1">{article.subtitle}</p>
      </div>

      {/* Purpose */}
      <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20">
        <div className="flex items-center gap-2 mb-2">
          <Info size={14} className="text-indigo-500 dark:text-indigo-400 shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Para qué sirve</span>
        </div>
        <p className="text-sm text-slate-700 dark:text-white/70 leading-relaxed">{content.purpose}</p>
      </div>

      {/* Steps */}
      {content.steps && (
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Paso a Paso</h3>
          <div className="space-y-2">
            {content.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06]">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                <p className="text-sm text-slate-700 dark:text-white/70 leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buttons */}
      {content.buttons && content.buttons.length > 0 && (
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Botones y Controles</h3>
          <div className="space-y-2">
            {content.buttons.map((btn, i) => (
              <div key={i} className="p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06]">
                <div className="flex items-center gap-2 mb-1">
                  <div className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.07] text-[10px] font-black text-slate-700 dark:text-white/60 font-mono">{btn.name}</div>
                </div>
                <p className="text-sm text-slate-600 dark:text-white/60 leading-relaxed">{btn.what}</p>
                {btn.tip && (
                  <p className="text-[11px] text-indigo-500 dark:text-indigo-400 mt-1 flex items-center gap-1">
                    <Lightbulb size={10} /> {btn.tip}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Concepts */}
      {content.concepts && (
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Conceptos Clave</h3>
          <div className="space-y-2">
            {content.concepts.map((c, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06]">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <div>
                  <span className="text-[11px] font-black text-slate-800 dark:text-white/80">{c.term}: </span>
                  <span className="text-sm text-slate-600 dark:text-white/50">{c.def}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {content.emptyState && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={14} className="text-amber-500 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">¿Por qué está vacío?</span>
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-300/80 mb-2">{content.emptyState.why}</p>
          <div className="flex items-start gap-2">
            <ArrowRight size={13} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700 dark:text-amber-300/80 font-semibold">{content.emptyState.fix}</p>
          </div>
        </div>
      )}

      {/* Tips */}
      {content.tips && content.tips.length > 0 && (
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Consejos</h3>
          <div className="space-y-2">
            {content.tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/[0.07] border border-emerald-100 dark:border-emerald-500/20">
                <Lightbulb size={13} className="text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-700 dark:text-emerald-300/80">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FAQ */}
      {content.faq && content.faq.length > 0 && (
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Preguntas Frecuentes</h3>
          <div className="space-y-2">
            {content.faq.map((item, i) => (
              <div key={i} className="rounded-xl border border-slate-100 dark:border-white/[0.07] overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left bg-white dark:bg-white/[0.02] hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all"
                >
                  <span className="text-sm font-semibold text-slate-700 dark:text-white/70">{item.q}</span>
                  {openFaq === i ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-3 pt-1 bg-white dark:bg-white/[0.02] border-t border-slate-50 dark:border-white/[0.05]">
                    <p className="text-sm text-slate-600 dark:text-white/50 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────
const HelpCenter: React.FC = () => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('inicio');
  const [activeArticle, setActiveArticle] = useState<HelpArticle | null>(null);

  const currentCategory = HELP_CATEGORIES.find(c => c.id === activeCategory)!;

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return null;
    const results: HelpArticle[] = [];
    for (const cat of HELP_CATEGORIES) {
      for (const article of cat.articles) {
        const inTitle    = article.title.toLowerCase().includes(term);
        const inSubtitle = article.subtitle.toLowerCase().includes(term);
        const inPurpose  = article.content.purpose?.toLowerCase().includes(term);
        const inButtons  = article.content.buttons?.some(b => b.name.toLowerCase().includes(term) || b.what.toLowerCase().includes(term));
        const inFaq      = article.content.faq?.some(f => f.q.toLowerCase().includes(term) || f.a.toLowerCase().includes(term));
        const inConcepts = article.content.concepts?.some(c => c.term.toLowerCase().includes(term) || c.def.toLowerCase().includes(term));
        if (inTitle || inSubtitle || inPurpose || inButtons || inFaq || inConcepts) {
          results.push(article);
        }
      }
    }
    return results;
  }, [query]);

  if (activeArticle) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto">
        <ArticleView article={activeArticle} onBack={() => setActiveArticle(null)} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-[#070b14]">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-1">Centro de Ayuda</h1>
        <p className="text-sm text-slate-400 dark:text-white/30">Guías completas para dominar cada sección del sistema.</p>
        <div className="relative mt-4">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/25" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveArticle(null); }}
            placeholder="Busca un botón, sección o concepto…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-700 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar nav */}
        {!query && (
          <nav className="w-48 shrink-0 border-r border-slate-100 dark:border-white/[0.06] py-4 px-3 space-y-0.5 overflow-y-auto">
            {HELP_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id); setActiveArticle(null); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${
                  activeCategory === cat.id
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-slate-500 dark:text-white/40 hover:bg-slate-100 dark:hover:bg-white/[0.04]'
                }`}
              >
                <span className={cat.color}>{cat.icon}</span>
                <span className="text-[11px] font-semibold">{cat.label}</span>
              </button>
            ))}
          </nav>
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Search results */}
          {searchResults && (
            <div>
              {searchResults.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-slate-400 dark:text-white/30 text-sm">No se encontraron resultados para "<strong>{query}</strong>"</p>
                  <p className="text-slate-300 dark:text-white/20 text-xs mt-1">Intenta con otras palabras como "venta", "cliente", "tasa", "inventario"</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/25 mb-4">{searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} para "{query}"</p>
                  <div className="space-y-2">
                    {searchResults.map(article => (
                      <button
                        key={article.id}
                        onClick={() => setActiveArticle(article)}
                        className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06] hover:border-indigo-300 dark:hover:border-indigo-500/30 transition-all text-left group"
                      >
                        <span className="text-2xl">{article.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-slate-800 dark:text-white">{article.title}</p>
                          <p className="text-xs text-slate-400 dark:text-white/30">{article.subtitle}</p>
                        </div>
                        <ChevronRight size={14} className="text-slate-300 dark:text-white/20 group-hover:text-indigo-500 transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Category articles */}
          {!searchResults && currentCategory && (
            <div>
              <div className="flex items-center gap-2.5 mb-5">
                <span className={`${currentCategory.color}`}>{currentCategory.icon}</span>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">{currentCategory.label}</h2>
              </div>
              <div className="space-y-3">
                {currentCategory.articles.map(article => (
                  <button
                    key={article.id}
                    onClick={() => setActiveArticle(article)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] shadow-sm hover:border-indigo-300 dark:hover:border-indigo-500/30 hover:shadow-md transition-all text-left group"
                  >
                    <span className="text-3xl">{article.emoji}</span>
                    <div className="flex-1">
                      <p className="font-black text-slate-900 dark:text-white">{article.title}</p>
                      <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">{article.subtitle}</p>
                      <div className="flex items-center gap-3 mt-2">
                        {article.content.buttons && <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 dark:text-white/20">{article.content.buttons.length} botones explicados</span>}
                        {article.content.faq && <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 dark:text-white/20">{article.content.faq.length} preguntas frecuentes</span>}
                        {article.content.steps && <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 dark:text-white/20">{article.content.steps.length} pasos</span>}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 dark:text-white/20 group-hover:text-indigo-500 transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default HelpCenter;
