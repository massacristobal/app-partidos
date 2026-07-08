# ⚽ APP Partidos

App web para armar equipos parejos de fútbol con tus amigos.

## Funciones

- **Usuarios**: cuenta con usuario/contraseña, perfil con posición.
- **Amigos**: busca jugadores, envía y acepta solicitudes.
- **Jugadores sin cuenta**: agrega invitados por nombre; cuando se hagan una cuenta, vincúlalos y conservan sus puntos y partidos.
- **Grupos**: crea grupos de amigos, agrega miembros o comparte el código para que se unan.
- **Partidos**: elige cuántos por lado (3 a 11), asócialo a un grupo, invita amigos y miembros; los invitados sin cuenta entran directo.
- **Equipos parejos**: el balanceo considera posición y puntos ganados; evita repetir formaciones. Se muestran en una cancha con la ubicación de cada jugador.
- **Cambios manuales**: el organizador puede mover jugadores de un equipo al otro con ⇄.
- **Puntos y ranking**: victoria +3, empate +1. Ranking por amigos o por grupo.

## Cómo ejecutar

Requiere [Node.js](https://nodejs.org) 18 o superior.

```
cd "C:\Users\NCLGP\Documents\APP partidos"
npm install
npm start
```

Abre http://localhost:3000 en el navegador.

Para que tus amigos entren desde sus celulares en la misma red WiFi, comparte tu IP local, por ejemplo `http://192.168.1.X:3000`.

## Datos

Todo se guarda en `data/db.json` (se crea solo). Para partir de cero, borra ese archivo.

## Estructura

```
server.js          Servidor Express y API REST
src/db.js          Persistencia (JSON con escritura atómica)
src/auth.js        Registro, login, sesiones (scrypt + tokens)
src/balance.js     Algoritmo de balanceo de equipos
public/            Frontend (HTML + CSS + JS)
```

## Desplegar online (opcional)

El servidor es un Node/Express estándar: se puede subir tal cual a Render, Railway o Fly.io. Para producción conviene cambiar `data/db.json` por una base de datos real (SQLite/Postgres).
