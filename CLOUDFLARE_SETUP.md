# Sincronizacion de prototipo en Cloudflare Pages

La app guarda una copia en cada dispositivo y sincroniza socios, accesos, ventas,
pagos, inventario, usuarios de caja, cortes y avisos mediante una Cloudflare
Pages Function y una base D1. Los cambios de otros dispositivos se consultan
cada cinco segundos mientras la app esta abierta.

## Edicion del producto

La app se maneja en una sola edicion: **Pro**, con el POS incluido. Incluye
gestion de miembros y accesos, inventario, ventas en caja y herramientas de
promociones; no hay un selector entre planes Basico y Pro.

Para agregar productos, entra al perfil del dueno y abre **Dashboard > Stock de
productos > Agregar producto al inventario**. Captura nombre, categoria, precio,
existencias iniciales e icono. Al guardar, el producto aparece en el POS y se
sincroniza con los demas dispositivos cuando Cloudflare esta conectado.

## Configurar D1

1. En Cloudflare, abre **Storage & databases > D1 SQL Database** y crea una base,
   por ejemplo `gym-access`.
2. Abre la base, entra a **Console** y ejecuta el contenido de `schema.sql`.
3. En tu proyecto de **Workers & Pages > Pages > Settings > Functions > D1 database
   bindings**, agrega un binding con variable `DB` y selecciona `gym-access`.
4. Vuelve a desplegar el sitio. La funcion `functions/api/sync.js` debe quedar
   publicada en la ruta `/api/sync`.
5. Abre la URL del sitio en cada dispositivo. El indicador junto al titulo debe
   decir **Sincronizado con Cloudflare**. La primera visita une los datos locales
   con la base compartida, sin borrar la copia local.

## Como desplegar Pages Functions

Pages Functions requieren desplegar tambien el directorio `functions/`. Si
publicaste el sitio arrastrando archivos al cargador de **Direct Upload**,
ese flujo no publica Pages Functions. Usa la integracion Git de Pages o el
comando de Wrangler `pages deploy` desde la carpeta del proyecto, manteniendo
`functions/` en la raiz del proyecto.

## Limites importantes del prototipo

- D1 es una base compartida para todos los usuarios que visiten esta instancia.
  La API de este prototipo no tiene autenticacion del lado del servidor. No la
  uses con datos reales, informacion personal sensible, fotos o identificadores
  biometricos hasta proteger la app y la API con Cloudflare Access/autenticacion.
- Los datos locales existentes se conservan y se combinan al conectarse. La
  base nueva recibe la combinacion de cada dispositivo cuando ambos se conectan.
- El inventario compartido usa la ultima actualizacion recibida; evita cobrar el
  mismo ultimo producto desde dos dispositivos al mismo tiempo.
- La app debe estar abierta y con conexion para sincronizar. La vista de ventas
  del dueño consulta los registros compartidos, pero no se envian notificaciones
  si el dispositivo del dueño esta cerrado.
- Si `/api/sync` devuelve un error, la app conserva los cambios locales y muestra
  el estado de la conexion bajo el titulo.
