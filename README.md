# Doncarlos League V5
Web pública Node.js + Express + PostgreSQL, preparada para Railway.

## Novedades V5
- Perfiles públicos de equipos.
- Plantillas y perfiles base de jugadores.
- Escudos y fotografías mediante uploads.
- Eventos de partido: goles, amarillas, rojas y cambios.
- Estadísticas ampliadas y clasificación.
- Playoffs/final.
- Noticias de la liga.
- Temporadas.
- Roles superadmin/admin/editor.
- JWT + bcrypt.
- Configuración Twitch lista para OAuth posterior.
- Responsive móvil/PC.
- PostgreSQL y Railway.

## Instalación local
Node.js 20+ y PostgreSQL.
1. Copia `.env.example` a `.env`.
2. Configura DATABASE_URL y JWT_SECRET.
3. `npm install`
4. `npm start`
5. Abre http://localhost:3000

## Railway
1. Sube el proyecto a GitHub.
2. Crea proyecto Railway.
3. Añade PostgreSQL.
4. Conecta el repositorio.
5. Configura DATABASE_URL, JWT_SECRET, ADMIN_USER y ADMIN_PASSWORD.
6. Railway ejecutará `npm start`.

Usuario inicial si la BD está vacía:
admin / Doncarlos123!

Cambia la contraseña antes de publicar.

## Twitch
V5 almacena canal, Client ID y Redirect URI para preparar OAuth. Para OAuth real hay que registrar la aplicación en Twitch Developer y completar las rutas de autorización/callback.

## Producción recomendada
Rate limiting, backups, almacenamiento externo de imágenes, recuperación de contraseña, auditoría, CSRF/CORS según arquitectura, migraciones, validación avanzada y OAuth Twitch completo.
