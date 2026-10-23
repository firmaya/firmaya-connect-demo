# FirmaYa Connect · Demo

Proyecto mínimo para probar la API de **FirmaYa Connect** de punta a punta:

1. crea una solicitud de firma (`POST /envelopes`) con un PDF y un firmante,
2. te muestra el **enlace de firma** de cada firmante para que lo abras,
3. recibe el **webhook** cuando firman, verifica su firma HMAC y guarda el PDF
   firmado en `firmados/`,
4. o, si el webhook no llega hasta tu máquina, consulta el estado
   (`GET /envelopes/{id}`) y descarga el PDF desde la API.

Node.js 18 o superior, **sin dependencias** (`fetch`, `http` y `crypto` de Node).

## Puesta en marcha

```bash
cp .env.example .env    # y completa los valores
npm start               # → http://localhost:4000
```

En el `.env`:

| Variable | De dónde sale |
|---|---|
| `FIRMAYA_API_URL` | `http://localhost:8000/api/connect/v1` en local, `https://api.firmaya.cr/api/connect/v1` en producción. |
| `FIRMAYA_API_KEY` | Panel → **Connect → Configuración → Llaves de API**. Usa una de **staging** (`fy_stg_…`) para probar. Se muestra una sola vez. |
| `FIRMAYA_WEBHOOK_SECRET` | Panel → **Configuración → Webhook → Secreto de firma**, del mismo ambiente que la llave. |
| `WEBHOOK_URL` | La dirección a la que FirmaYa entrega los eventos; debe llegar a este servidor en `/webhook`. |
| `PORT` | Puerto de este proyecto (4000 por defecto). |

## Probar

1. Abre `http://localhost:4000`, escribe la cédula del firmante y pulsa **Crear
   solicitud**. Sin PDF, se envía un contrato de prueba generado por el proyecto.
2. Pulsa **Abrir enlace de firma** y firma. En staging la página es una prueba: no
   pide Firma Digital y el PDF sale firmado con un certificado de prueba («sin
   validez legal»).
3. Cuando todos firman llega `envelope.completed`: aparece en **Eventos de webhook**
   y el PDF firmado queda en `firmados/`. Si no llega, pulsa **Actualizar estado** y
   descarga el PDF con el botón del documento.

Staging no tiene límite de solicitudes. Cada solicitud admite hasta **20 PDF** (10 MB
cada uno, 30 MB en total) y hasta **10 firmantes**. Producción (`fy_live_…`) necesita
un plan.

## El webhook en local

FirmaYa solo entrega webhooks a direcciones **públicas**: por seguridad (SSRF)
rechaza `localhost`, `host.docker.internal` y cualquier IP privada. Tienes dos
opciones:

- **Un túnel** (recomendado): `ngrok http 4000` o `cloudflared tunnel --url
  http://localhost:4000`, y pon `WEBHOOK_URL=https://<tu-túnel>/webhook`.
- **Backend local en Docker**: arranca el backend con
  `CONNECT_WEBHOOK_ALLOW_PRIVATE=True` y usa
  `WEBHOOK_URL=http://host.docker.internal:4000/webhook`. Solo para desarrollo.

Sin ninguna de las dos, todo lo demás funciona: el estado y el PDF firmado se
obtienen con **Actualizar estado**.

## Dónde mirar el código

| Archivo | Qué hace |
|---|---|
| `src/firmaya.js` | El cliente de la API (`createEnvelope`, `getEnvelope`, `cancelEnvelope`, `downloadDocument`) y `verifyWebhook`, la verificación de `FirmaYa-Signature`. |
| `src/server.js` | El servidor: la página, las rutas que llaman a la API y el endpoint `/webhook` (verifica, descarta duplicados por `FirmaYa-Delivery-Id`, guarda los PDF). |
| `src/samplePdf.js` | El PDF de prueba. |
| `public/index.html` | La página. |

Lo que este proyecto ya hace como pide la guía de producción:

- envía `Idempotency-Key` (el `external_id`) en cada `POST /envelopes`;
- verifica la firma HMAC sobre el **cuerpo crudo** y rechaza marcas de más de 5 minutos;
- responde `2xx` rápido y descarta entregas repetidas.

Lo que **no** hace, por ser una demo: guarda el estado en `data/state.json` en
lugar de una base de datos, y procesa el webhook en la misma petición en lugar de
encolarlo.

Guía completa de la API: `/desarrolladores/connect` en FirmaYa.
